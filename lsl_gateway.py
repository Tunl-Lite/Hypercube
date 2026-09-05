#!/usr/bin/env python3
"""
Muse 2 EEG LSL to WebSocket Gateway
Author: Antigravity AI

Exposes a WebSocket server on port 8080 that:
  1. Accepts control commands from the browser (scan, connect, disconnect, get_state).
  2. Runs 'muselsl list' and 'muselsl stream' as managed subprocesses via sys.executable.
  3. Connects to the resulting EEG LSL stream once the headset is streaming.
  4. Continuously broadcasts EEG band-power features and raw channel data.
"""

import os
import sys
import time
import json
import signal
import asyncio
import numpy as np
from scipy.signal import welch
from pylsl import StreamInlet, resolve_byprop
from typing import Optional
import websockets
import logging
import re as _re

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("LSL_Gateway")

# Cross-version numpy integration (numpy 2.0+ uses trapezoid, 1.x uses trapz)
_trapz = getattr(np, 'trapezoid', getattr(np, 'trapz', None))

# ── EEG Band Definitions ──────────────────────────────────────────────────────
BANDS = {
    'delta': (0.5, 4.0),
    'theta': (4.0, 8.0),
    'alpha': (8.0, 13.0),
    'beta':  (13.0, 30.0),
    'gamma': (30.0, 45.0),
}

BAND_CENTERS = {
    'delta': 2.25,
    'theta': 6.0,
    'alpha': 10.5,
    'beta':  21.5,
    'gamma': 37.5,
}

# Piecewise linear mapping: spectral centroid (Hz) → plotter intensity (1-360)
CENTROID_MAP = [
    (0.5,  1.0),
    (4.0,  32.0),
    (8.0,  69.0),
    (13.0, 115.0),
    (30.0, 268.0),
    (45.0, 360.0),
]


def map_centroid_to_intensity(centroid):
    """Piecewise-linear interpolation of spectral centroid → intensity."""
    if centroid <= CENTROID_MAP[0][0]:
        return CENTROID_MAP[0][1]
    if centroid >= CENTROID_MAP[-1][0]:
        return CENTROID_MAP[-1][1]
    for i in range(len(CENTROID_MAP) - 1):
        x0, y0 = CENTROID_MAP[i]
        x1, y1 = CENTROID_MAP[i + 1]
        if x0 <= centroid <= x1:
            return y0 + (centroid - x0) * (y1 - y0) / (x1 - x0)
    return 90.0


# ── EEG Signal Processor ──────────────────────────────────────────────────────
class EEGProcessor:
    def __init__(self, inlet):
        self.inlet = inlet
        self.info  = inlet.info()
        self.fs    = int(self.info.nominal_srate())
        if self.fs <= 0:
            self.fs = 256  # Muse 2 fallback

        self.n_channels  = self.info.channel_count()
        self.window_size = 2 * self.fs
        self.buffer      = np.zeros((self.n_channels, self.window_size))
        self.buffer_filled = 0
        logger.info(
            f"Processor ready: stream='{self.info.name()}' "
            f"channels={self.n_channels} fs={self.fs} Hz"
        )

    def add_samples(self, samples):
        n_new = len(samples)
        if n_new == 0:
            return
        samples_np = np.array(samples).T          # (n_channels, n_new)
        if n_new >= self.window_size:
            self.buffer = samples_np[:, -self.window_size:]
            self.buffer_filled = self.window_size
        else:
            self.buffer = np.roll(self.buffer, -n_new, axis=1)
            self.buffer[:, -n_new:] = samples_np
            self.buffer_filled = min(self.window_size, self.buffer_filled + n_new)

    def is_ready(self):
        return self.buffer_filled >= self.window_size

    def compute_features(self):
        if not self.is_ready():
            return None
        data = self.buffer - np.mean(self.buffer, axis=1, keepdims=True)
        nperseg = min(256, self.window_size)
        freqs, psds = welch(data, fs=self.fs, nperseg=nperseg,
                            noverlap=nperseg // 2, axis=1)

        eeg_channels = min(4, self.n_channels)
        avg_psd = np.mean(psds[:eeg_channels, :], axis=0)

        band_powers = {}
        total_power = 0.0
        for band, (low, high) in BANDS.items():
            idx = np.where((freqs >= low) & (freqs <= high))[0]
            power = float(_trapz(avg_psd[idx], x=freqs[idx])) if len(idx) > 0 and _trapz is not None else 0.0
            band_powers[band] = power
            total_power += power

        if total_power <= 0:
            total_power = 1e-6
        relative = {b: p / total_power for b, p in band_powers.items()}

        centroid  = sum(relative[b] * BAND_CENTERS[b] for b in BANDS)
        intensity = map_centroid_to_intensity(centroid)

        return {
            "intensity": round(intensity, 2),
            "centroid":  round(centroid, 2),
            "bands":     {b: round(v, 4) for b, v in relative.items()},
        }


# ── Gateway State ─────────────────────────────────────────────────────────────
connected_clients: set = set()

# Muse stream subprocess handle
_stream_proc: Optional[asyncio.subprocess.Process] = None
_stream_address: Optional[str] = None         # MAC / device name we connected to
_stream_name: Optional[str] = None            # friendly name
_eeg_task: Optional[asyncio.Task] = None      # LSL acquisition task
_inlet:    Optional[object]       = None      # active StreamInlet (closed on teardown)


# ── WebSocket Helpers ─────────────────────────────────────────────────────────
async def register(ws):
    connected_clients.add(ws)
    logger.info(f"WS client connected ({len(connected_clients)} total)")
    streaming = (_stream_proc is not None and _stream_proc.returncode is None and _inlet is not None)
    try:
        await ws.send(json.dumps({
            "type": "gateway_state",
            "connected": streaming,
            "streaming": streaming,
            "address": _stream_address,
            "name": _stream_name or "Muse",
        }))
    except Exception as e:
        logger.warning(f"Error sending initial state: {e}")


async def unregister(ws):
    connected_clients.discard(ws)
    logger.info(f"WS client disconnected ({len(connected_clients)} total)")
    if not connected_clients:
        logger.info("No clients connected. Automatically disconnecting headset stream.")
        await _teardown_stream()


async def broadcast(payload: dict):
    if not connected_clients:
        return
    msg = json.dumps(payload)
    await asyncio.gather(
        *[c.send(msg) for c in connected_clients],
        return_exceptions=True,
    )


async def send_status(message: str, kind: str = "info"):
    """Send a gateway-status event to all clients."""
    await broadcast({"type": "gateway_status", "kind": kind, "message": message})


# ── Device Scanning ───────────────────────────────────────────────────────────
# muselsl list --backend bleak output formats:
#   "Found device Muse-5003, MAC Address 00:55:DA:B5:50:03"
#   "Muse-5003 (00:55:DA:B5:50:03)"
#   "Muse-5003"
# We match name with a Muse-starting pattern, and any 17-char MAC or 36-char UUID pattern.
_NAME_RE = _re.compile(r'(Muse[^\s,()]*|Muse)', _re.IGNORECASE)
_MAC_RE  = _re.compile(r'([0-9A-Fa-f:]{17}|[0-9A-Fa-f-]{36})')


async def cmd_scan():
    """
    Run 'muselsl list --backend bleak' and parse device names/addresses.
    stderr is captured to surface clear errors if Bluetooth is disabled.
    """
    await broadcast({"type": "scan_start"})

    try:
        proc = await asyncio.create_subprocess_exec(
            sys.executable, "-m", "muselsl", "list", "--backend", "bleak",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(), timeout=30.0
            )
        except asyncio.TimeoutError:
            proc.kill()
            stdout_bytes, stderr_bytes = b"", b""

        stdout_txt = stdout_bytes.decode(errors="replace")
        stderr_txt = stderr_bytes.decode(errors="replace")

        if stdout_txt.strip():
            logger.info(f"muselsl list stdout:\n{stdout_txt}")
        if stderr_txt.strip():
            logger.warning(f"muselsl list stderr:\n{stderr_txt}")

        if proc.returncode != 0:
            err_msg = "Bluetooth scan failed."
            for l in stderr_txt.splitlines():
                if "BleakBluetoothNotAvailableError" in l or "No powered Bluetooth" in l:
                    err_msg = "Bluetooth is powered off or no adapter found."
                    break
                elif "PermissionError" in l or "permission" in l.lower():
                    err_msg = "Bluetooth permission denied."
                    break
            logger.warning(f"muselsl list exited with code {proc.returncode}: {err_msg}")
            await send_status(err_msg, "error")
            await broadcast({"type": "scan_result", "devices": []})
            return

        # Parse stdout for devices
        devices = []
        seen = set()
        for line in stdout_txt.splitlines():
            if "muse" in line.lower():
                mac_match = _MAC_RE.search(line)
                if not mac_match:
                    continue
                address = mac_match.group(1).strip()
                name_match = _NAME_RE.search(line)
                name = name_match.group(1).strip() if name_match else "Muse"
                
                key = address.lower()
                if key not in seen:
                    seen.add(key)
                    devices.append({"name": name, "address": address})

        await broadcast({
            "type":    "scan_result",
            "devices": devices,
        })

        if devices:
            await send_status(f"Found {len(devices)} device(s).", "success")
        else:
            await send_status("No devices found. Ensure headset is powered & pairing.", "warning")

    except Exception as e:
        logger.error(f"Scan error: {e}")
        await send_status(f"Scan error: {e}", "error")
        await broadcast({"type": "scan_result", "devices": []})


# ── Device Connection ─────────────────────────────────────────────────────────
async def cmd_connect(address: str, name: str):
    """
    Launch 'muselsl stream --address <address> --backend bleak',
    wait for LSL stream to appear, then start EEG acquisition.
    """
    global _stream_proc, _stream_address, _stream_name, _eeg_task, _inlet

    # Tear down any existing session first
    await _teardown_stream()

    # Brief pause so old LSL stream fully vanishes from the network
    await asyncio.sleep(2.0)

    await send_status(f"Connecting to {name} ({address})…", "info")
    await broadcast({"type": "connect_start", "address": address, "name": name})

    try:
        _stream_address = address
        _stream_name = name
        cmd = [
            sys.executable, "-m", "muselsl", "stream", "--backend", "bleak",
        ]
        if address and address != name:
            cmd += ["--address", address]

        _stream_proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            start_new_session=True,   # isolate into its own process group
        )

        async def _drain_stdout(proc):
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                logger.info(f"muselsl stream: {line.decode(errors='replace').rstrip()}")
        
        asyncio.create_task(_drain_stdout(_stream_proc))

        # Wait up to 20 s for the LSL stream to appear (non-blocking)
        await send_status("Waiting for EEG stream to become available…", "info")
        streams = []
        for attempt in range(20):
            await asyncio.sleep(1.0)
            try:
                streams = await asyncio.to_thread(resolve_byprop, 'type', 'EEG', timeout=1.0)
            except Exception:
                streams = []
            if streams:
                break
            if _stream_proc.returncode is not None:
                await send_status("muselsl stream process exited unexpectedly.", "error")
                await broadcast({"type": "connect_failed"})
                await _teardown_stream()
                return

        if not streams:
            await send_status("EEG stream did not appear within 20 s. Check headset.", "error")
            await broadcast({"type": "connect_failed"})
            await _teardown_stream()
            return

        # Attach LSL inlet
        _inlet    = StreamInlet(streams[0])
        processor = EEGProcessor(_inlet)
        _eeg_task = asyncio.create_task(_lsl_loop(processor))

        await send_status(f"Connected! Streaming EEG from {name}.", "success")
        await broadcast({"type": "connected", "address": address, "name": name})

    except Exception as e:
        logger.error(f"Connect error: {e}")
        await send_status(f"Connection error: {e}", "error")
        await broadcast({"type": "connect_failed"})
        await _teardown_stream()


# ── Device Disconnection ──────────────────────────────────────────────────────
async def cmd_disconnect():
    await _teardown_stream()
    await send_status("Headset disconnected.", "info")
    await broadcast({"type": "disconnected"})


async def _teardown_stream():
    global _stream_proc, _stream_address, _stream_name, _eeg_task, _inlet
    if _eeg_task and not _eeg_task.done():
        _eeg_task.cancel()
        try:
            await _eeg_task
        except asyncio.CancelledError:
            pass
    _eeg_task = None

    if _inlet is not None:
        try:
            _inlet.close_stream()
            logger.info("LSL inlet closed.")
        except Exception as e:
            logger.warning(f"Error closing LSL inlet: {e}")
        _inlet = None

    if _stream_proc and _stream_proc.returncode is None:
        try:
            pgid = os.getpgid(_stream_proc.pid)
            os.killpg(pgid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        except Exception as e:
            logger.warning(f"killpg SIGTERM failed: {e}")
            _stream_proc.terminate()

        try:
            await asyncio.wait_for(_stream_proc.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            try:
                pgid = os.getpgid(_stream_proc.pid)
                os.killpg(pgid, signal.SIGKILL)
            except Exception:
                _stream_proc.kill()
            await _stream_proc.wait()
        logger.info("muselsl stream process group terminated.")
    _stream_proc = None
    _stream_address = None
    _stream_name = None


# ── EEG Acquisition Loop ──────────────────────────────────────────────────────
async def _lsl_loop(processor: EEGProcessor):
    global _stream_proc
    logger.info("EEG acquisition loop started.")
    last_sample_time = time.monotonic()
    has_received_samples = False

    while True:
        # Check if stream process died unexpectedly
        if _stream_proc and _stream_proc.returncode is not None:
            logger.warning("muselsl stream process terminated unexpectedly.")
            await send_status("Stream process terminated.", "error")
            await broadcast({"type": "disconnected"})
            await _teardown_stream()
            break

        samples, _ = processor.inlet.pull_chunk(max_samples=64, timeout=0.0)
        if samples:
            has_received_samples = True
            last_sample_time = time.monotonic()
            processor.add_samples(samples)
            if processor.is_ready():
                features = processor.compute_features()
                if features:
                    features["type"]   = "eeg_data"
                    features["status"] = "active"
                    eeg_ch = min(4, processor.n_channels)
                    features["channels"] = [float(v) for v in samples[-1][:eeg_ch]]
                    features["chunk"] = [[float(v) for v in s[:eeg_ch]] for s in samples]
                    await broadcast(features)
        else:
            # Check stream watchdog: if samples stop for > 5.0 seconds after initial reception
            if has_received_samples and (time.monotonic() - last_sample_time > 5.0):
                logger.warning("EEG stream watchdog timed out: no samples for >5 seconds.")
                await send_status("Headset signal lost.", "warning")
                await broadcast({"type": "disconnected"})
                await _teardown_stream()
                break

        await asyncio.sleep(0.033)   # ~30 Hz


# ── WebSocket Handler ─────────────────────────────────────────────────────────
async def handler(websocket):
    await register(websocket)
    try:
        async for raw in websocket:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            cmd = msg.get("cmd")
            if cmd == "scan":
                asyncio.create_task(cmd_scan())
            elif cmd == "connect":
                asyncio.create_task(cmd_connect(
                    address=msg.get("address", ""),
                    name=msg.get("name", "Unknown"),
                ))
            elif cmd == "disconnect":
                asyncio.create_task(cmd_disconnect())
            elif cmd == "get_state":
                streaming = (_stream_proc is not None and _stream_proc.returncode is None and _inlet is not None)
                await websocket.send(json.dumps({
                    "type": "gateway_state",
                    "connected": streaming,
                    "streaming": streaming,
                    "address": _stream_address,
                    "name": _stream_name or "Muse",
                }))
            else:
                logger.warning(f"Unknown command: {cmd}")

    except websockets.exceptions.ConnectionClosedOK:
        pass
    except websockets.exceptions.ConnectionClosedError:
        pass
    finally:
        await unregister(websocket)


# ── Entry Point ───────────────────────────────────────────────────────────────
async def main():
    logger.info("LSL Gateway starting on ws://0.0.0.0:8080 …")
    async with websockets.serve(handler, "0.0.0.0", 8080):
        await asyncio.Future()   # run forever


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Gateway shut down.")
