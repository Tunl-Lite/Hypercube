// ─────────────────────────────────────────────────────────────
// EEG State Definitions
// Intensity drives the spirograph step angle AND the binaural
// beat frequency. Each EEG band maps to a canonical polygon
// that pulses at the beat frequency, correlating visual shape
// with auditory/neural state.
//
// Shape logic: higher EEG frequency = more angular / fewer sides
//   Delta  (0.5–4 Hz)  → 12-gon  (circle-like, slow & smooth)
//   Theta  (4–8 Hz)    → 8-gon   (octagon)
//   Alpha  (8–13 Hz)   → 6-gon   (hexagon)
//   Beta   (13–30 Hz)  → 4-gon   (square)
//   Gamma  (30–40 Hz)  → 3-gon   (triangle, sharpest)
// ─────────────────────────────────────────────────────────────

const EEG_STATES = [
    { name: 'Delta', symbol: 'δ', label: 'Deep Sleep', minI: 0, maxI: 32, minHz: 0.5, maxHz: 4, sides: 12, color: '#4466ff', shadow: 'rgba(68,102,255,0.7)' },
    { name: 'Theta', symbol: 'θ', label: 'Meditation', minI: 32, maxI: 69, minHz: 4, maxHz: 8, sides: 8, color: '#00ccff', shadow: 'rgba(0,204,255,0.7)' },
    { name: 'Alpha', symbol: 'α', label: 'Relaxed Focus', minI: 69, maxI: 115, minHz: 8, maxHz: 13, sides: 6, color: '#00ff99', shadow: 'rgba(0,255,153,0.7)' },
    { name: 'Beta', symbol: 'β', label: 'Active Thinking', minI: 115, maxI: 268, minHz: 13, maxHz: 30, sides: 4, color: '#ffaa00', shadow: 'rgba(255,170,0,0.7)' },
    { name: 'Gamma', symbol: 'γ', label: 'High Cognition', minI: 268, maxI: 361, minHz: 30, maxHz: 45, sides: 3, color: '#ff44ff', shadow: 'rgba(255,68,255,0.7)' },
];

// ── Trail Length Helpers ─────────────────────────────────────
// The spirograph pattern closes after exactly 360/GCD(i,360) steps.
// Using this as MAX_TRAIL ensures we always draw exactly one complete
// shape cycle — the minimum needed to see the full pattern.
function gcd(a, b) {
    a = Math.abs(Math.round(a));
    b = Math.abs(Math.round(b));
    return b === 0 ? a : gcd(b, a % b);
}

function stepsToClose(i) {
    const rounded = Math.max(1, Math.round(i));
    const rawSteps = (360 / gcd(rounded, 360)) + 1; // +1 point required to fully close the polygon
    return Math.max(36, Math.min(rawSteps, 90));
}

// ── Canvas Setup ──────────────────────────────────────────────
const canvas = document.getElementById('plotterCanvas');
const ctx = canvas.getContext('2d');

const LOGICAL_SIZE = 1200;
const dpr = window.devicePixelRatio || 1;

canvas.width = LOGICAL_SIZE * dpr;
canvas.height = LOGICAL_SIZE * dpr;
ctx.scale(dpr, dpr);

canvas.style.width = '100%';
canvas.style.height = '100%';
canvas.style.maxWidth = '90vw';
canvas.style.maxHeight = '90vh';
canvas.style.objectFit = 'contain';

const WIDTH = LOGICAL_SIZE;
const HEIGHT = LOGICAL_SIZE;
const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 };
const RADIUS = 560;
const RED = '#ff0000';

// Function to lerp colors for training visual feedback
function getCoherenceColor(coherence) {
    const r = 255;
    const g = Math.round((coherence / 100) * 68);
    const b = Math.round((coherence / 100) * 255);
    return `rgb(${r}, ${g}, ${b})`;
}

// ── State Variables ───────────────────────────────────────────
let angle = 45;
let points = [];
let intensity = 90;          // Default: 90° step → square (Beta zone)
let targetIntensity = 90;    // Smoothed target for spirograph shape transitions
let smoothedTrail = 5;           // Seeded to stepsToClose(90) = 5

// ── Input ─────────────────────────────────────────────────────
const keys = { ArrowUp: false, ArrowDown: false };

window.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        keys[e.key] = true;
        e.preventDefault();
        if (audioCtx?.state === 'suspended') audioCtx.resume();
    } else if (e.code === 'Space') {
        e.preventDefault();
        // In waveform mode, do not toggle panels to avoid trapping the user
        if (window.waveformViewToggle && window.waveformViewToggle.checked) {
            return;
        }
        toggleLeftUI();
        toggleRightUI();
        toggleTopLeftUI();
        toggleTopRightUI();
    }
});
window.addEventListener('keyup', e => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') keys[e.key] = false;
});

// ── Audio ─────────────────────────────────────────────────────
let audioCtx = null;
let leftOsc = null;
let rightOsc = null;
let masterGain = null;
let lastScheduledFrequency = null;
let lastAudioUpdateTime = 0;              // Timestamp of last frequency update (ms)
let baseFrequency = 200;
const AUDIO_UPDATE_INTERVAL_MS = 50;      // Rate-limit: update frequency at most every 50ms

// ── Training State ────────────────────────────────────────────
const TRAINING_PROTOCOLS = {
    none: null,
    hypnagogic: { targetBeat: 6.0, baseFreq: 160 },
    esp: { targetBeat: 40.0, baseFreq: 200 }
};
let activeProtocol = 'none';
let currentCoherence = 0;
const AUDIO_LOOKAHEAD_S = 0.05;           // 50ms lookahead — absorbs GC pauses & tab throttling
const AUDIO_RAMP_S = 0.06;               // 60ms linear ramp — smooth, deterministic glide

function initAudio() {
    if (audioCtx) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return;
    }
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume();

    const limiter = audioCtx.createDynamicsCompressor();
    limiter.threshold.setValueAtTime(-3, audioCtx.currentTime);
    limiter.knee.setValueAtTime(30, audioCtx.currentTime);
    limiter.ratio.setValueAtTime(12, audioCtx.currentTime);
    limiter.attack.setValueAtTime(0.003, audioCtx.currentTime);
    limiter.release.setValueAtTime(0.25, audioCtx.currentTime);
    limiter.connect(audioCtx.destination);

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.3;
    masterGain.connect(limiter);

    const merger = audioCtx.createChannelMerger(2);
    merger.connect(masterGain);

    leftOsc = audioCtx.createOscillator();
    leftOsc.type = 'sine';
    leftOsc.frequency.value = baseFrequency;
    leftOsc.connect(merger, 0, 0);
    leftOsc.start();

    rightOsc = audioCtx.createOscillator();
    rightOsc.type = 'sine';
    rightOsc.frequency.value = baseFrequency + 10;
    rightOsc.connect(merger, 0, 1);
    rightOsc.start();
}

// ── Audio Toggle ──────────────────────────────────────────────
const audioToggle = document.getElementById('audioToggle');
if (audioToggle) {
    audioToggle.checked = false;
    audioToggle.addEventListener('change', () => {
        if (audioToggle.checked) {
            if (!audioCtx) initAudio();
            else {
                audioCtx.resume();
                if (masterGain) masterGain.gain.setTargetAtTime(0.3, audioCtx.currentTime, 0.1);
            }
        } else {
            if (masterGain) masterGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
        }
    });
}

// ── DOM References ────────────────────────────────────────────
const frequencyDisplay = document.getElementById('frequencyDisplay');
const angleDisplay = document.getElementById('angleDisplay');
const audioControl = document.getElementById('audioControl');
const uiToggleLeft = document.getElementById('uiToggleLeft');
const uiToggleRight = document.getElementById('uiToggleRight');
const uiToggleTopLeft = document.getElementById('uiToggleTopLeft');
const uiToggleTopRight = document.getElementById('uiToggleTopRight');
const eegIndicator = document.getElementById('eegIndicator');
const eegPanel = document.getElementById('eegPanel');
const bandElements = document.querySelectorAll('.eeg-band');

const trainingProtocolSelect = document.getElementById('trainingProtocolSelect');
if (trainingProtocolSelect) {
    trainingProtocolSelect.addEventListener('change', (e) => {
        activeProtocol = e.target.value;
    });
}

let hideToggleTimeoutLeft;
let hideToggleTimeoutRight;
let hideToggleTimeoutTopLeft;
let hideToggleTimeoutTopRight;
let mouseHideTimeout;
const UI_HIDE_DELAY = 1000; // Time in ms of mouse inactivity before UI & cursor hide

function toggleLeftUI() {
    if (!uiToggleLeft || (window.waveformViewToggle && window.waveformViewToggle.checked)) return;
    uiToggleLeft.classList.toggle('ui-hidden');
    if (frequencyDisplay) frequencyDisplay.classList.toggle('fade-out');
    if (audioControl) audioControl.classList.toggle('fade-out');
    wakeToggleLeft();
}

function toggleRightUI() {
    if (!uiToggleRight || (window.waveformViewToggle && window.waveformViewToggle.checked)) return;
    uiToggleRight.classList.toggle('ui-hidden');
    if (angleDisplay) angleDisplay.classList.toggle('fade-out');
    wakeToggleRight();
}

function toggleTopLeftUI() {
    if (!uiToggleTopLeft || (window.waveformViewToggle && window.waveformViewToggle.checked)) return;
    uiToggleTopLeft.classList.toggle('ui-hidden');
    if (eegIndicator) eegIndicator.classList.toggle('fade-out');
    wakeToggleTopLeft();
}

function toggleTopRightUI() {
    if (!uiToggleTopRight) return;
    uiToggleTopRight.classList.toggle('ui-hidden');
    if (eegPanel) eegPanel.classList.toggle('fade-out');
    wakeToggleTopRight();
}

function wakeToggleLeft() {
    if (!uiToggleLeft || (window.waveformViewToggle && window.waveformViewToggle.checked)) return;
    uiToggleLeft.classList.remove('toggle-offscreen');
    clearTimeout(hideToggleTimeoutLeft);
    hideToggleTimeoutLeft = setTimeout(() => {
        uiToggleLeft.classList.add('toggle-offscreen');
    }, UI_HIDE_DELAY);
}

function wakeToggleRight() {
    if (!uiToggleRight || (window.waveformViewToggle && window.waveformViewToggle.checked)) return;
    uiToggleRight.classList.remove('toggle-offscreen');
    clearTimeout(hideToggleTimeoutRight);
    hideToggleTimeoutRight = setTimeout(() => {
        uiToggleRight.classList.add('toggle-offscreen');
    }, UI_HIDE_DELAY);
}

function wakeToggleTopLeft() {
    if (!uiToggleTopLeft || (window.waveformViewToggle && window.waveformViewToggle.checked)) return;
    uiToggleTopLeft.classList.remove('toggle-offscreen');
    clearTimeout(hideToggleTimeoutTopLeft);
    hideToggleTimeoutTopLeft = setTimeout(() => {
        uiToggleTopLeft.classList.add('toggle-offscreen');
    }, UI_HIDE_DELAY);
}

function wakeToggleTopRight() {
    if (!uiToggleTopRight) return;
    uiToggleTopRight.classList.remove('toggle-offscreen');
    clearTimeout(hideToggleTimeoutTopRight);
    hideToggleTimeoutTopRight = setTimeout(() => {
        uiToggleTopRight.classList.add('toggle-offscreen');
    }, UI_HIDE_DELAY);
}

if (uiToggleLeft) uiToggleLeft.addEventListener('click', toggleLeftUI);
if (uiToggleRight) uiToggleRight.addEventListener('click', toggleRightUI);
if (uiToggleTopLeft) uiToggleTopLeft.addEventListener('click', toggleTopLeftUI);
if (uiToggleTopRight) uiToggleTopRight.addEventListener('click', toggleTopRightUI);

window.addEventListener('mousemove', e => {
    // Show the mouse cursor whenever it moves, then set a timeout to hide it after inactivity
    document.body.classList.remove('hide-cursor');
    clearTimeout(mouseHideTimeout);
    mouseHideTimeout = setTimeout(() => {
        document.body.classList.add('hide-cursor');
    }, UI_HIDE_DELAY);

    // Define the corner detection thresholds (20% of the window width/height, up to a max of 250px)
    const thresholdX = Math.min(250, window.innerWidth * 0.20);
    const thresholdY = Math.min(250, window.innerHeight * 0.20);

    const isLeft = e.clientX < thresholdX;
    const isRight = e.clientX > window.innerWidth - thresholdX;
    const isTop = e.clientY < thresholdY;
    const isBottom = e.clientY > window.innerHeight - thresholdY;

    if (isBottom) {
        if (isLeft) wakeToggleLeft();
        else if (isRight) wakeToggleRight();
    } else if (isTop) {
        if (isLeft) wakeToggleTopLeft();
        else if (isRight) wakeToggleTopRight();
    }
});

// Trigger initially so they hide after loading if the mouse doesn't move
wakeToggleLeft();
wakeToggleRight();
wakeToggleTopLeft();
wakeToggleTopRight();

// Initially set a timer to hide the cursor if no movement occurs on load
clearTimeout(mouseHideTimeout);
mouseHideTimeout = setTimeout(() => {
    document.body.classList.add('hide-cursor');
}, UI_HIDE_DELAY);

// ── EEG Helpers ───────────────────────────────────────────────
function getEEGState(i) {
    for (const s of EEG_STATES) {
        if (i >= s.minI && i < s.maxI) return s;
    }
    return EEG_STATES[EEG_STATES.length - 1];
}

function getBeatFrequency(i, state) {
    const t = Math.max(0, Math.min(1, (i - state.minI) / (state.maxI - state.minI)));
    return state.minHz + t * (state.maxHz - state.minHz);
}


function updateEEGIndicator(activeState) {
    if (!bandElements) return;
    bandElements.forEach(el => {
        if (el.getAttribute('data-band') === activeState.name) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
}


// ── Update Logic ──────────────────────────────────────────────
let lastTime = performance.now();

function updateIntensity(dt) {
    if (keys.ArrowUp) targetIntensity = Math.min(targetIntensity + 30.0 * dt, 360);
    if (keys.ArrowDown) targetIntensity = Math.max(targetIntensity - 30.0 * dt, 1);

    // Apply temporal exponential smoothing:
    // lambda = 3.5 gives a time constant of ~285ms. This filters out high-frequency
    // muscle jitter and noise while remaining highly responsive to intentional brain shifts.
    const lerpFactor = 1.0 - Math.exp(-3.5 * dt);
    intensity += (targetIntensity - intensity) * lerpFactor;

    const state = getEEGState(intensity);
    const beat = getBeatFrequency(intensity, state);

    let targetBeat = beat;
    const protocol = TRAINING_PROTOCOLS[activeProtocol];
    
    if (protocol) {
        baseFrequency = protocol.baseFreq;
        targetBeat = protocol.targetBeat;
    } else {
        baseFrequency = 200; // Default
    }

    // Update binaural beat — rate-limited & deterministic scheduling
    // Decoupled from rAF cadence so audio stays stable regardless of
    // frame rate, tab throttling, GC pauses, or VM scheduling jitter.
    const now = performance.now();
    if (leftOsc && rightOsc && audioCtx && (now - lastAudioUpdateTime >= AUDIO_UPDATE_INTERVAL_MS)) {
        if (Math.abs(leftOsc.frequency.value - baseFrequency) > 0.01) {
             leftOsc.frequency.setTargetAtTime(baseFrequency, audioCtx.currentTime, 0.1);
        }

        const targetFreq = baseFrequency + targetBeat;
        if (lastScheduledFrequency === null || Math.abs(targetFreq - lastScheduledFrequency) > 0.01) {
            const scheduleTime = audioCtx.currentTime + AUDIO_LOOKAHEAD_S;
            // Cancel any in-flight automation to prevent conflicts
            rightOsc.frequency.cancelScheduledValues(audioCtx.currentTime);
            // Anchor at current value, then ramp deterministically to the target
            rightOsc.frequency.setValueAtTime(rightOsc.frequency.value, audioCtx.currentTime);
            rightOsc.frequency.linearRampToValueAtTime(targetFreq, scheduleTime + AUDIO_RAMP_S);
            lastScheduledFrequency = targetFreq;
        }
        lastAudioUpdateTime = now;
    }

    // Update HUD
    if (angleDisplay) angleDisplay.textContent = (180 - intensity).toFixed(1) + '°';
    if (frequencyDisplay) {
        const isAudioActive = audioToggle && audioToggle.checked;
        if (!isAudioActive) {
            frequencyDisplay.textContent = 'Audio: Off';
        } else if (protocol) {
            frequencyDisplay.textContent = `Training [${activeProtocol}]: ${targetBeat.toFixed(1)} Hz`;
        } else {
            frequencyDisplay.textContent = `${state.name}: ${beat.toFixed(1)} Hz`;
        }
    }

    // Update EEG list indicator
    updateEEGIndicator(state);

    return { state, beat: targetBeat };
}

// ── Animation Loop ────────────────────────────────────────────
function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    const { state, beat } = updateIntensity(dt);
    
    // Determine dynamic drawing color
    const currentColor = activeProtocol !== 'none' ? getCoherenceColor(currentCoherence) : RED;

    // ── Clear ──
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // ── Outer reference circle ──
    ctx.beginPath();
    ctx.arc(CENTER.x, CENTER.y, RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // ── Spirograph trail ──
    const rad = angle * (Math.PI / 180);
    const x = CENTER.x + RADIUS * Math.cos(rad);
    const y = CENTER.y + RADIUS * Math.sin(rad);

    points.push({ x, y });

    // Smooth trail: lerp toward the exact closure length so transitions
    // dissolve gradually instead of snapping.
    //   Growing  → fast  (0.15/frame ≈ 0.5 s)  — new geometry appears quickly
    //   Shrinking → slow (0.06/frame ≈ 1.2 s)  — old lines fade out smoothly
    const targetTrail = stepsToClose(intensity);
    let MAX_TRAIL;
    const lerpRate = targetTrail > smoothedTrail ? 0.15 : 0.06;
    smoothedTrail = smoothedTrail + (targetTrail - smoothedTrail) * lerpRate;
    MAX_TRAIL = Math.max(1, Math.ceil(smoothedTrail));
    if (points.length > MAX_TRAIL) points = points.slice(-MAX_TRAIL);

    if (points.length > 1) {
        // Explicitly reset all state — prevents shadow/dash from ghost polygon bleeding in
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();
        ctx.restore();
    }

    // ── Current point dot ──
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = currentColor;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ── Advance angle ──
    angle = (angle + intensity) % 360;
}

// ── UI Scale Helper ───────────────────────────────────────────
function updateUIScale() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const rawScale = rect.width / LOGICAL_SIZE;
    const scale = Math.max(0.75, Math.min(1.4, rawScale));
    const container = canvas.parentElement;
    if (container) {
        container.style.setProperty('--ui-scale', scale);
    }
}
window.addEventListener('resize', updateUIScale);
updateUIScale();

// ── EEG Feedback Manager ──────────────────────────────────────
class EEGFeedbackManager {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.reconnectTimeout = null;
        
        // Mode settings
        this.liveMode = false;
        
        // Calibration metrics
        this.isCalibrating = false;
        this.calibrationData = [];
        this.calibrationDuration = 30; // seconds
        this.calibrationTimer = null;
        this.baselineMean = 90.0; // default seed
        this.baselineStdDev = 15.0; // default seed
        this.hasCalibrated = false;

        // Cache elements
        this.statusEl = document.getElementById('eegStatus');
        this.modeToggle = document.getElementById('eegModeToggle');
        this.calibrateBtn = document.getElementById('calibrateBtn');
        this.timerEl = document.getElementById('calibrationTimer');
        
        this.bars = {
            delta: document.getElementById('bar-delta'),
            theta: document.getElementById('bar-theta'),
            alpha: document.getElementById('bar-alpha'),
            beta: document.getElementById('bar-beta'),
            gamma: document.getElementById('bar-gamma')
        };
        this.vals = {
            delta: document.getElementById('val-delta'),
            theta: document.getElementById('val-theta'),
            alpha: document.getElementById('val-alpha'),
            beta: document.getElementById('val-beta'),
            gamma: document.getElementById('val-gamma')
        };
        
        this.centroidValEl = document.getElementById('centroidVal');
        this.zscoreValEl = document.getElementById('zscoreVal');
        
        this.coherenceBar = document.getElementById('bar-coherence');
        this.coherenceVal = document.getElementById('val-coherence');

        this.initEvents();
        this.connect();
    }

    initEvents() {
        if (this.modeToggle) {
            this.modeToggle.addEventListener('change', (e) => {
                this.liveMode = e.target.checked;
                console.log("EEG Live Mode:", this.liveMode);
            });
        }
        if (this.calibrateBtn) {
            this.calibrateBtn.addEventListener('click', () => {
                this.startCalibration();
            });
        }
    }

    connect() {
        console.log("Connecting to LSL Gateway at ws://localhost:8080...");
        this.updateStatus('CONNECTING', 'status-connecting');
        
        this.socket = new WebSocket('ws://localhost:8080');
        
        this.socket.onopen = () => {
            this.isConnected = true;
            this.updateStatus('OFFLINE', 'status-offline');
            console.log("LSL Gateway connected — querying state.");
            this.send({ cmd: 'get_state' });
            if (window.devicePanel) window.devicePanel.onGatewayOpen();
        };
        
        this.socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                const type = msg.type || 'eeg_data';
                if (type === 'eeg_data') {
                    this.handleData(msg);
                } else if (window.devicePanel) {
                    window.devicePanel.handleGatewayMessage(msg);
                }
            } catch (err) {
                console.error("Error parsing message:", err);
            }
        };
        
        this.socket.onclose = () => {
            this.isConnected = false;
            this.updateStatus('OFFLINE', 'status-offline');
            if (this.calibrateBtn) this.calibrateBtn.disabled = true;
            if (this.isCalibrating) {
                clearInterval(this.calibrationTimer);
                this.isCalibrating = false;
                if (this.calibrateBtn) {
                    this.calibrateBtn.classList.remove('calibrating');
                    this.calibrateBtn.textContent = "Calibrate Baseline";
                }
                if (this.timerEl) this.timerEl.classList.add('timer-hidden');
            }
            if (this.modeToggle) {
                this.modeToggle.checked = false;
                this.liveMode = false;
            }
            this.resetBars();
            console.log("LSL Gateway disconnected. Reconnecting in 3s...");
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
            if (window.devicePanel) window.devicePanel.onGatewayClose();
        };
        
        this.socket.onerror = () => {
            this.socket.close();
        };
    }

    /** Send a command object to the gateway */
    send(payload) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(payload));
        }
    }

    updateStatus(text, className) {
        if (!this.statusEl) return;
        this.statusEl.textContent = text;
        this.statusEl.className = className;
    }

    /** Reset all band-power bars and readouts to zero */
    resetBars() {
        for (const band of Object.keys(this.bars)) {
            if (this.bars[band])  this.bars[band].style.width = '0%';
            if (this.vals[band])  this.vals[band].textContent = '0%';
        }
        if (this.centroidValEl) this.centroidValEl.textContent = '— Hz';
        if (this.zscoreValEl)   this.zscoreValEl.textContent  = '0.00';
    }

    handleData(data) {
        // If calibrating, accumulate raw intensity values
        if (this.isCalibrating) {
            this.calibrationData.push(data.intensity);
        }

        // Feed raw waveform samples into the WaveformDisplay buffer.
        // Support full chunks for smooth 256 Hz display; fall back to single-sample channel vector.
        if (window.waveformDisplay) {
            if (Array.isArray(data.chunk) && data.chunk.length > 0) {
                for (const sample of data.chunk) {
                    window.waveformDisplay.pushSample(sample);
                }
            } else if (Array.isArray(data.channels) && data.channels.length > 0) {
                window.waveformDisplay.pushSample(data.channels);
            } else if (data.intensity !== undefined) {
                window.waveformDisplay.pushSample([data.intensity]);
            }
        }

        // Update relative band power progress bars and text
        if (data.bands) {
            for (const [band, val] of Object.entries(data.bands)) {
                const pct = Math.round(val * 100);
                if (this.bars[band]) {
                    this.bars[band].style.width = `${pct}%`;
                }
                if (this.vals[band]) {
                    this.vals[band].textContent = `${pct}%`;
                }
            }
        }

        // Update Spectral Centroid frequency display
        if (data.centroid && this.centroidValEl) {
            this.centroidValEl.textContent = `${data.centroid.toFixed(1)} Hz`;
        }

        let zScore = 0.0;
        if (this.hasCalibrated && this.baselineStdDev > 0) {
            zScore = (data.intensity - this.baselineMean) / this.baselineStdDev;
        }
        
        if (this.zscoreValEl) {
            this.zscoreValEl.textContent = zScore.toFixed(2);
        }

        // --- Coherence Scoring ---
        if (activeProtocol !== 'none' && data.centroid) {
            const protocol = TRAINING_PROTOCOLS[activeProtocol];
            const targetHz = protocol.targetBeat;
            const distance = Math.abs(data.centroid - targetHz);
            const maxDist = 15.0; // Hz away from target means 0%
            const rawCoherence = Math.max(0, 1 - (distance / maxDist)) * 100;
            
            currentCoherence = currentCoherence + (rawCoherence - currentCoherence) * 0.1;
            
            if (this.coherenceBar) {
                this.coherenceBar.style.width = `${Math.round(currentCoherence)}%`;
            }
            if (this.coherenceVal) {
                this.coherenceVal.textContent = `${Math.round(currentCoherence)}%`;
            }
        } else {
            currentCoherence = currentCoherence + (0 - currentCoherence) * 0.1;
            if (this.coherenceBar) this.coherenceBar.style.width = `${Math.round(currentCoherence)}%`;
            if (this.coherenceVal) this.coherenceVal.textContent = `${Math.round(currentCoherence)}%`;
        }

        // If Live EEG Mode is active, update the plotter intensity target
        if (this.liveMode && !this.isCalibrating) {
            // Apply Z-score visual stabilization feedback
            if (this.hasCalibrated && Math.abs(zScore) > 1.5) {
                // If highly dysregulated, inject subtle jitter into the drawing target
                const jitter = (Math.random() - 0.5) * 4.0 * Math.abs(zScore);
                targetIntensity = Math.max(1.0, Math.min(360.0, data.intensity + jitter));
            } else {
                targetIntensity = data.intensity;
            }
        }
    }

    startCalibration() {
        if (!this.isConnected || this.isCalibrating) return;
        
        this.isCalibrating = true;
        this.calibrationData = [];
        this.calibrateBtn.disabled = true;
        this.calibrateBtn.textContent = "Calibrating...";
        this.calibrateBtn.classList.add('calibrating');
        
        if (this.timerEl) {
            this.timerEl.textContent = `${this.calibrationDuration}s`;
            this.timerEl.classList.remove('timer-hidden');
        }

        let timeLeft = this.calibrationDuration;
        clearInterval(this.calibrationTimer);
        this.calibrationTimer = setInterval(() => {
            timeLeft--;
            if (this.timerEl) this.timerEl.textContent = `${timeLeft}s`;
            
            if (timeLeft <= 0) {
                clearInterval(this.calibrationTimer);
                this.finishCalibration();
            }
        }, 1000);
    }

    finishCalibration() {
        this.isCalibrating = false;
        this.calibrateBtn.classList.remove('calibrating');
        this.calibrateBtn.disabled = false;
        this.calibrateBtn.textContent = "Recalibrate";
        if (this.timerEl) this.timerEl.classList.add('timer-hidden');

        if (this.calibrationData.length > 5) {
            const n = this.calibrationData.length;
            this.baselineMean = this.calibrationData.reduce((a, b) => a + b, 0) / n;
            const variance = this.calibrationData.reduce((a, b) => a + Math.pow(b - this.baselineMean, 2), 0) / (n - 1);
            this.baselineStdDev = Math.sqrt(variance);
            this.hasCalibrated = true;
            console.log(`Baseline established. Mean = ${this.baselineMean.toFixed(2)}, StdDev = ${this.baselineStdDev.toFixed(2)}`);
            if (window.devicePanel) window.devicePanel._setFooterStatus('Baseline calibrated.', 'success');
        } else {
            console.warn("Not enough calibration samples received.");
            this.calibrateBtn.textContent = "Calibrate Baseline";
            if (window.devicePanel) window.devicePanel._setFooterStatus('Calibration failed: insufficient data.', 'warning');
        }
    }
}

// Instantiate EEG Feedback Manager
const eegManager = new EEGFeedbackManager();
window.eegManager = eegManager;

// ── Device Scan & Connect Panel (integrated) ─────────────────
/**
 * DevicePanel — drives the permanently integrated device-setup section
 * inside the EEG panel.
 */
class DevicePanel {
    constructor() {
        this.scanBtn        = document.getElementById('scanBtn');
        this.scanStatusText = document.getElementById('scanStatusText');
        this.deviceListEl   = document.getElementById('deviceList');

        this._connectedAddress = null;
        this._pendingAddress   = null;
        this._scanning         = false;
        this._dotInterval      = null;

        this._bindEvents();
    }

    _bindEvents() {
        if (this.scanBtn) {
            this.scanBtn.addEventListener('click', () => this.requestScan());
        }
    }

    /** Gateway WebSocket came online */
    onGatewayOpen() {
        if (this.scanBtn) this.scanBtn.disabled = false;
        this._setScanStatus('Ready to scan.');
    }

    /** Gateway WebSocket disconnected */
    onGatewayClose() {
        if (this.scanBtn) this.scanBtn.disabled = true;
        this._setScanStatus('Gateway offline…');
        this._connectedAddress = null;
        this._refreshCardButtons();
        this._stopScanUI();
    }

    /** Send scan command to the gateway */
    requestScan() {
        if (this._scanning) return;
        window.eegManager?.send({ cmd: 'scan' });
        this._startScanUI();
    }

    _startScanUI() {
        this._scanning = true;
        // Hide the entire scan row while searching
        if (this.scanBtn)        this.scanBtn.style.display        = 'none';
        if (this.scanStatusText) this.scanStatusText.style.display = 'none';
        // Inject centred animated indicator into the list area
        if (this.deviceListEl) {
            this.deviceListEl.innerHTML =
                '<div class="device-list-searching">Searching.</div>';
        }
        let dots = 0;
        clearInterval(this._dotInterval);
        this._dotInterval = setInterval(() => {
            dots = (dots + 1) % 3;
            const el = this.deviceListEl?.querySelector('.device-list-searching');
            if (el) el.textContent = 'Searching' + '.'.repeat(dots + 1);
        }, 500);
        if (window.eegManager) {
            window.eegManager.updateStatus('SEARCHING', 'status-connecting');
        }
    }

    _stopScanUI() {
        this._scanning = false;
        // Restore the scan row
        if (this.scanBtn) {
            this.scanBtn.style.display = '';
            this.scanBtn.disabled = false;
        }
        if (this.scanStatusText) this.scanStatusText.style.display = '';
        // Stop dot animation
        clearInterval(this._dotInterval);
        this._dotInterval = null;
        if (window.eegManager) {
            if (this._connectedAddress) {
                window.eegManager.updateStatus('ONLINE', 'status-online');
            } else {
                window.eegManager.updateStatus('OFFLINE', 'status-offline');
            }
        }
    }

    /** Handle typed messages from the gateway (routed by EEGFeedbackManager) */
    handleGatewayMessage(msg) {
        const { type, kind, message } = msg;

        if (type === 'gateway_status') {
            this._setFooterStatus(message, kind);
            if (kind === 'info' && message.startsWith('Connecting')) {
                this._setConnectingState(this._pendingAddress);
            }
        } else if (type === 'gateway_state') {
            if (msg.connected || msg.streaming) {
                this._connectedAddress = msg.address;
                this._pendingAddress   = null;
                this._refreshCardButtons();
                this._setFooterStatus(`Connected — ${msg.name || 'Muse'}`, 'success');
                if (window.eegManager) {
                    window.eegManager.updateStatus('ONLINE', 'status-online');
                    if (window.eegManager.calibrateBtn) {
                        window.eegManager.calibrateBtn.disabled = false;
                    }
                }
            } else {
                this._connectedAddress = null;
                this._pendingAddress   = null;
                this._refreshCardButtons();
            }
        } else if (type === 'scan_start') {
            this._startScanUI();
        } else if (type === 'scan_result') {
            this._stopScanUI();
            this._renderDevices(msg.devices || []);
            this._setScanStatus(
                msg.devices?.length
                    ? `Found ${msg.devices.length} device(s).`
                    : 'None found.'
            );
        } else if (type === 'connect_start') {
            this._pendingAddress = msg.address;
            this._setConnectingState(msg.address);
            if (window.eegManager) {
                window.eegManager.updateStatus('CONNECTING', 'status-connecting');
            }
        } else if (type === 'connected') {
            this._connectedAddress = msg.address;
            this._pendingAddress   = null;
            this._refreshCardButtons();
            this._setFooterStatus(`Connected — ${msg.name}`, 'success');
            if (window.eegManager) {
                window.eegManager.updateStatus('ONLINE', 'status-online');
                if (window.eegManager.calibrateBtn)
                    window.eegManager.calibrateBtn.disabled = false;
            }
        } else if (type === 'connect_failed') {
            this._pendingAddress = null;
            this._refreshCardButtons();
            this._setFooterStatus('Connection failed.', 'error');
        } else if (type === 'disconnected') {
            this._connectedAddress = null;
            this._pendingAddress   = null;
            this._refreshCardButtons();
            this._setFooterStatus('Disconnected.', 'info');
            if (window.eegManager) {
                window.eegManager.updateStatus('OFFLINE', 'status-offline');
                window.eegManager.resetBars();
                if (window.eegManager.calibrateBtn)
                    window.eegManager.calibrateBtn.disabled = true;
            }
        }
    }

    _renderDevices(devices) {
        if (!this.deviceListEl) return;
        if (!devices.length) {
            this.deviceListEl.innerHTML =
                '<div class="device-list-empty">No headsets found.<br>Ensure Bluetooth & headset are on.</div>';
            return;
        }

        this.deviceListEl.innerHTML = '';
        devices.forEach(dev => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.dataset.address = dev.address;
            if (this._connectedAddress === dev.address)
                card.classList.add('connected-device');

            const isConn = this._connectedAddress === dev.address;
            card.innerHTML = `
                <div class="device-card-info">
                    <div class="device-card-name">${this._esc(dev.name)}</div>
                    <div class="device-card-address">${this._esc(dev.address)}</div>
                </div>
                <button class="device-connect-btn ${isConn ? 'disconnect-mode' : ''}"
                        data-address="${this._esc(dev.address)}"
                        data-name="${this._esc(dev.name)}">
                    ${isConn ? 'Disconnect' : 'Connect'}
                </button>`;

            card.querySelector('.device-connect-btn').addEventListener('click', () => {
                const currentlyConnected = this._connectedAddress === dev.address;
                if (currentlyConnected) {
                    window.eegManager?.send({ cmd: 'disconnect' });
                    this._setFooterStatus('Disconnecting…', 'info');
                } else {
                    this._pendingAddress = dev.address;
                    window.eegManager?.send({ cmd: 'connect', address: dev.address, name: dev.name });
                }
            });

            this.deviceListEl.appendChild(card);
        });
    }

    _setConnectingState(address) {
        if (!this.deviceListEl) return;
        this.deviceListEl.querySelectorAll('.device-connect-btn').forEach(btn => {
            btn.disabled = true;
            if (btn.dataset.address === address) {
                btn.textContent = 'Connecting…';
                btn.classList.add('connecting');
            }
        });
    }

    _refreshCardButtons() {
        if (!this.deviceListEl) return;
        this.deviceListEl.querySelectorAll('.device-card').forEach(card => {
            const addr = card.dataset.address;
            const btn  = card.querySelector('.device-connect-btn');
            if (!btn) return;
            const isConn = this._connectedAddress === addr;
            btn.disabled    = false;
            btn.className   = `device-connect-btn ${isConn ? 'disconnect-mode' : ''}`;
            btn.textContent = isConn ? 'Disconnect' : 'Connect';
            card.classList.toggle('connected-device', isConn);
        });
    }

    _setScanStatus(msg) {
        if (this.scanStatusText) {
            this.scanStatusText.textContent = msg;
            this.scanStatusText.className = 'scan-status-text';
        }
    }

    _setFooterStatus(msg, kind = 'info') {
        if (this.scanStatusText) {
            this.scanStatusText.textContent = msg;
            this.scanStatusText.className = `scan-status-text status-${kind}`;
        }
    }

    _esc(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

const devicePanel = new DevicePanel();
window.devicePanel = devicePanel;

// ── EEG Waveform Display ──────────────────────────────────────
//
// Renders a scrolling, multi-channel line graph on the overlay
// canvas. Each row shows one EEG channel (TP9, AF7, AF8, TP10).
// Falls back gracefully to a single-row display when only the
// scalar intensity signal is available (no headset connected).
// ─────────────────────────────────────────────────────────────
class WaveformDisplay {
    // Rolling sample buffer per channel (most-recent sample at tail)
    static BUFFER_SIZE = 512;   // samples to retain (≈4 s at 128 Hz)
    static PADDING_X   = 64;    // left/right margin in logical px
    static PADDING_Y   = 48;    // top/bottom margin in logical px

    // Muse 2 channel labels and their CRT-palette colours
    static CHANNEL_META = [
        { label: 'TP9',  color: '#ff3333' },
        { label: 'AF7',  color: '#ff3333' },
        { label: 'AF8',  color: '#ff3333' },
        { label: 'TP10', color: '#ff3333' },
    ];

    constructor(canvasEl) {
        this.canvas = canvasEl;
        this.ctx    = canvasEl.getContext('2d');
        this.buffers = [];      // one Float32Array per channel
        this.nChannels = 0;     // resolved on first pushSample()
        this.rafId   = null;
        this.active  = false;

        this._resizeObserver = new ResizeObserver(() => this._syncSize());
        this._resizeObserver.observe(canvasEl.parentElement);
        this._syncSize();
    }

    // ── Sync canvas backing store to its CSS size ─────────────
    _syncSize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        this.canvas.width  = Math.round(rect.width  * dpr);
        this.canvas.height = Math.round(rect.height * dpr);
        this._W = rect.width;   // logical width
        this._H = rect.height;  // logical height
        this._dpr = dpr;
    }

    // ── Push one sample vector from the EEG stream ───────────
    // `samples` is an array with one value per channel.
    pushSample(samples) {
        const n = samples.length;

        // Initialise buffers on first call or if channel count changes
        if (n !== this.nChannels) {
            this.nChannels = n;
            this.buffers = Array.from({ length: n }, () =>
                new Float32Array(WaveformDisplay.BUFFER_SIZE));
            // Fill head indexes so we know where the write pointer sits
            this._head = 0;
        }

        if (!this._head) this._head = 0;

        for (let ch = 0; ch < n; ch++) {
            this.buffers[ch][this._head] = samples[ch];
        }
        this._head = (this._head + 1) % WaveformDisplay.BUFFER_SIZE;
    }

    // ── Return ordered samples (oldest → newest) for channel ch
    _getSamples(ch) {
        const buf  = this.buffers[ch];
        const head = this._head || 0;
        const out  = new Float32Array(WaveformDisplay.BUFFER_SIZE);
        for (let i = 0; i < WaveformDisplay.BUFFER_SIZE; i++) {
            out[i] = buf[(head + i) % WaveformDisplay.BUFFER_SIZE];
        }
        return out;
    }

    // ── Start the render loop ────────────────────────────────
    start() {
        if (this.active) return;
        this.active = true;
        this._loop();
    }

    // ── Stop the render loop ─────────────────────────────────
    stop() {
        this.active = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    // ── Main render ──────────────────────────────────────────
    _loop() {
        if (!this.active) return;
        this.rafId = requestAnimationFrame(() => this._loop());
        this._draw();
    }

    _draw() {
        const { ctx, canvas } = this;
        const dpr = this._dpr || 1;
        const W   = this._W   || canvas.width  / dpr;
        const H   = this._H   || canvas.height / dpr;

        ctx.save();
        ctx.scale(dpr, dpr);

        // ── Background ──
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);

        const nCh = Math.max(1, this.nChannels);
        const PX  = WaveformDisplay.PADDING_X;
        const PY  = WaveformDisplay.PADDING_Y;

        const plotW = W - PX * 2;
        const rowH  = (H - PY * 2) / nCh;  // height allocated to each channel
        const waveH = rowH * 0.75;          // inner waveform amplitude band

        // ── Header ──
        ctx.font      = `600 ${Math.round(11 * (W / 800))}px Inter, sans-serif`;
        ctx.fillStyle = 'rgba(255,0,0,0.4)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('EEG WAVEFORM', PX, 14);

        ctx.font      = `400 ${Math.round(10 * (W / 800))}px Inter, sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(`${WaveformDisplay.BUFFER_SIZE} samples`, W - PX, 14);

        // ── Horizontal separator ──
        ctx.strokeStyle = 'rgba(255,0,0,0.12)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(PX, 34);
        ctx.lineTo(W - PX, 34);
        ctx.stroke();

        // ── Draw each channel ──
        for (let ch = 0; ch < nCh; ch++) {
            const meta   = WaveformDisplay.CHANNEL_META[ch] ||
                           { label: `CH${ch + 1}`, color: '#ff3333' };
            const yMid   = PY + ch * rowH + rowH / 2;
            const samples = this.nChannels > 0
                ? this._getSamples(ch)
                : this._syntheticSamples();

            // Per-channel min/max for normalisation (auto-scale)
            let min = Infinity, max = -Infinity;
            for (let i = 0; i < samples.length; i++) {
                if (samples[i] < min) min = samples[i];
                if (samples[i] > max) max = samples[i];
            }
            const range = max - min || 1;

            // ── Channel label ──
            ctx.font      = `600 ${Math.round(10 * (W / 800))}px Inter, sans-serif`;
            ctx.fillStyle = meta.color;
            ctx.globalAlpha = 0.7;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(meta.label, 10, yMid);
            ctx.globalAlpha = 1.0;

            // ── Zero/baseline grid line ──
            ctx.strokeStyle = 'rgba(255,0,0,0.07)';
            ctx.lineWidth   = 1;
            ctx.setLineDash([4, 6]);
            ctx.beginPath();
            ctx.moveTo(PX, yMid);
            ctx.lineTo(W - PX, yMid);
            ctx.stroke();
            ctx.setLineDash([]);

            // ── Row separator ──
            if (ch < nCh - 1) {
                ctx.strokeStyle = 'rgba(255,0,0,0.08)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(PX, PY + (ch + 1) * rowH);
                ctx.lineTo(W - PX, PY + (ch + 1) * rowH);
                ctx.stroke();
            }

            // ── Waveform path ──
            ctx.save();
            ctx.beginPath();

            // Glow effect
            ctx.shadowColor = meta.color;
            ctx.shadowBlur  = 2;
            ctx.strokeStyle = meta.color;
            ctx.lineWidth   = 1.5;
            ctx.lineJoin    = 'round';
            ctx.lineCap     = 'round';

            for (let i = 0; i < samples.length; i++) {
                const xPos = PX + (i / (samples.length - 1)) * plotW;
                const norm = (samples[i] - min) / range;    // 0..1
                const yPos = yMid + (0.5 - norm) * waveH;   // centred in row
                if (i === 0) ctx.moveTo(xPos, yPos);
                else         ctx.lineTo(xPos, yPos);
            }
            ctx.stroke();

            // Brighter leading-edge dot at the most recent sample
            const lastX   = PX + plotW;
            const lastNorm = (samples[samples.length - 1] - min) / range;
            const lastY   = yMid + (0.5 - lastNorm) * waveH;
            ctx.shadowBlur = 4;
            ctx.fillStyle  = meta.color;
            ctx.beginPath();
            ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }

        ctx.restore();
    }

    // ── Synthetic idle waveform (shown when no headset data) ─
    _syntheticSamples() {
        const t   = performance.now() / 1000;
        const out = new Float32Array(WaveformDisplay.BUFFER_SIZE);
        for (let i = 0; i < out.length; i++) {
            const phase = (i / out.length) * Math.PI * 2;
            out[i] = Math.sin(phase * 4 + t) * 0.5
                   + Math.sin(phase * 9 + t * 1.3) * 0.2
                   + Math.sin(phase * 17 + t * 0.7) * 0.1;
        }
        return out;
    }
}

// ── Waveform Toggle Wiring ────────────────────────────────────
const waveformCanvas      = document.getElementById('waveformCanvas');
const waveformViewToggle  = document.getElementById('waveformViewToggle');

const waveformDisplay = new WaveformDisplay(waveformCanvas);
window.waveformDisplay = waveformDisplay;

window.waveformViewToggle = waveformViewToggle;
let savedUIStates = null;

if (waveformViewToggle) {
    waveformViewToggle.addEventListener('change', () => {
        if (waveformViewToggle.checked) {
            waveformCanvas.classList.add('waveform-visible');
            waveformDisplay.start();

            // Save state of all indicators and toggles before hiding
            savedUIStates = {
                uiToggleLeft: uiToggleLeft?.classList.contains('ui-hidden'),
                uiToggleRight: uiToggleRight?.classList.contains('ui-hidden'),
                uiToggleTopLeft: uiToggleTopLeft?.classList.contains('ui-hidden'),
                frequencyDisplay: frequencyDisplay?.classList.contains('fade-out'),
                audioControl: audioControl?.classList.contains('fade-out'),
                angleDisplay: angleDisplay?.classList.contains('fade-out'),
                eegIndicator: eegIndicator?.classList.contains('fade-out')
            };

            // Force hide them
            if (frequencyDisplay) frequencyDisplay.classList.add('fade-out');
            if (audioControl) audioControl.classList.add('fade-out');
            if (angleDisplay) angleDisplay.classList.add('fade-out');
            if (eegIndicator) eegIndicator.classList.add('fade-out');
            if (uiToggleLeft) uiToggleLeft.classList.add('toggle-offscreen');
            if (uiToggleRight) uiToggleRight.classList.add('toggle-offscreen');
            if (uiToggleTopLeft) uiToggleTopLeft.classList.add('toggle-offscreen');
        } else {
            waveformCanvas.classList.remove('waveform-visible');
            waveformDisplay.stop();

            // Restore from saved state
            if (savedUIStates) {
                if (uiToggleLeft) uiToggleLeft.classList.toggle('ui-hidden', savedUIStates.uiToggleLeft);
                if (uiToggleRight) uiToggleRight.classList.toggle('ui-hidden', savedUIStates.uiToggleRight);
                if (uiToggleTopLeft) uiToggleTopLeft.classList.toggle('ui-hidden', savedUIStates.uiToggleTopLeft);
                
                if (frequencyDisplay) frequencyDisplay.classList.toggle('fade-out', savedUIStates.frequencyDisplay);
                if (audioControl) audioControl.classList.toggle('fade-out', savedUIStates.audioControl);
                if (angleDisplay) angleDisplay.classList.toggle('fade-out', savedUIStates.angleDisplay);
                if (eegIndicator) eegIndicator.classList.toggle('fade-out', savedUIStates.eegIndicator);
                
                wakeToggleLeft();
                wakeToggleRight();
                wakeToggleTopLeft();

                savedUIStates = null;
            }
        }
    });
}

// ── Start ─────────────────────────────────────────────────────
animate();
