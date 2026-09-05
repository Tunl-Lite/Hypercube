#!/bin/bash
#
# Hypercube Plotter — Startup Script
# Launches the HTTP server and LSL WebSocket gateway.
# Headset scanning and connection are controlled from the browser UI.

set -e

WEB_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON_BIN="$WEB_DIR/muse_env/bin/python"

echo "==================================================="
echo "  Hypercube Plotter — Muse EEG Gateway"
echo "==================================================="

# ── Pre-flight Checks ───────────────────────────────────────────
if [ ! -f "$PYTHON_BIN" ]; then
    echo "ERROR: Virtual environment not found at $WEB_DIR/muse_env"
    echo "Please create the environment first:"
    echo "  python3 -m venv muse_env"
    echo "  source muse_env/bin/activate"
    echo "  pip install -r requirements.txt"
    exit 1
fi

# ── 1. Start HTTP server ────────────────────────────────────────
echo ""
echo "[1/2] Starting local HTTP server on port 8000..."
python3 -m http.server 8000 -d "$WEB_DIR" > "$WEB_DIR/server.log" 2>&1 &
SERVER_PID=$!

sleep 1
if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "ERROR: Web server failed to start. See $WEB_DIR/server.log"
    exit 1
fi
echo "      Web server running (PID: $SERVER_PID)"
echo "      Open: http://localhost:8000"

# ── 2. Start LSL Gateway ────────────────────────────────────────
echo ""
echo "[2/2] Starting LSL WebSocket gateway on port 8080..."
echo "      Use the browser UI to scan and connect your Muse headset."
echo ""
echo "Press Ctrl+C to stop."
echo "==================================================="
echo ""

# Run gateway; kill the HTTP server when it exits
trap "kill $SERVER_PID 2>/dev/null; echo ''; echo 'Gateway stopped.'" EXIT

"$PYTHON_BIN" "$WEB_DIR/lsl_gateway.py"
