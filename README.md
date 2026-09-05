# Hypercube Plotter: A Cybernetic Instrument of Metaphysical Geometry and Neuro-Phenomenology

```
               ▲
              / \
             /   \             Nous / Transcendental Insight (Gamma: 40 Hz)
            /_____\
           / \   / \
          /   \ /   \          The Triad of Manifestation
         /_____\/_____\
               │
               ▼
     Symmetric Morphogenesis
```

**Hypercube Plotter** is an interactive epistemological instrument operating at the intersection of generative sacred geometry, digital signal processing, and neuro-phenomenological biofeedback. By translating electroencephalographic (EEG) spectral telemetry into modular chord reflections on a circular boundary, the system renders the interior cognitive states of the observer as dynamic, archetypal geometries accompanied by phase-aligned binaural acoustic frequencies.

---

# Part I: The Metaphysics of Form and Cyclic Morphogenesis

At its foundational layer, Hypercube Plotter is an autonomous mathematical engine investigating how discrete order precipitates from continuous planar topologies.

## 1. The Monad and the Planar Continuum

The visual ontology begins with a singular, unconditioned boundary: the **Circle** ($S^1$). In Pythagorean and Neoplatonic metaphysics (from the *Timaeus* to Plotinus and Proclus), the circle serves as the primary archetype of the **Monad**—the undifferentiated, infinite continuum enclosing total potentiality (*Apeiron*).

Inside this bounded continuum, form is induced through the propagation of a point undergoing discrete angular displacements. Let the perimeter be parameterized as a compact 1-manifold $\mathbb{R} / 360^\circ \mathbb{Z}$. The trajectory of the drawing locus is governed by a recurrence relation parameterized by an angular step operator, termed the **Input Intensity** ($I \in [1^\circ, 360^\circ]$):

$$\theta_{t} \equiv (\theta_{t-1} + I) \pmod{360^\circ}$$

At each temporal epoch $t$, the system maps the angular coordinate into $\mathbb{R}^2$:

$$\mathbf{p}_t = \begin{bmatrix} x_t \\ y_t \end{bmatrix} = \begin{bmatrix} x_0 + R \cos\left(\frac{\pi \theta_t}{180}\right) \\ y_0 + R \sin\left(\frac{\pi \theta_t}{180}\right) \end{bmatrix}$$

A straight chord $\overline{\mathbf{p}_{t-1}\mathbf{p}_t}$ is projected across the void, ricocheting against the circumscribing boundary. This line represents the **Dyad**—the initial polarization of unity into relation, traversing the interior space to generate geometric tension.

## 2. Morphogenesis and the Crystallization of Platonic Archetypes

As chords accumulate through iteration, the continuous modular reflection undergoes spontaneous symmetry-breaking, crystallizing into distinct geometric orders. The morphology of the resulting figure is governed by the rational harmonic relationship between the displacement angle $I$ and the full circle ($360^\circ$).

### The Discrete Rational Subgroups
When $I$ is an aliquot part of $360^\circ$ (or an irreducible fraction $360^\circ \cdot \frac{p}{q}$), the system realizes discrete cyclic subgroups $C_n \subset SO(2)$, manifesting canonical Platonic and Archimedean polygonal symmetries:

- **$I = 120^\circ \left(\frac{360^\circ}{3}\right) \rightarrow$ The Triad ($\Delta$)**: The minimum polygon capable of enclosing space. In Hermetic and Pythagorean philosophy, the triangle represents the synthesis of the thesis and antithesis, the prime archetype of active creation, illumination, and structural resolution.
- **$I = 90^\circ \left(\frac{360^\circ}{4}\right) \rightarrow$ The Tetrad ($\square$)**: The fourfold foundation. Symbolizes the material realm, Cartesian spatiality, stability, and the four classical elements (*quadrivium*).
- **$I = 60^\circ \left(\frac{360^\circ}{6}\right) \rightarrow$ The Hexad (⬡)**: Harmonic equilibrium, balance, and the hexagonal crystallization omnipresent in natural tessellations (from benzene rings to snowflake crystallography and the *Cube of Metatron*).
- **$I = 45^\circ \left(\frac{360^\circ}{8}\right) \rightarrow$ The Octad**: The transitional geometry between the square (terrestrial earth) and the circle (celestial infinity), classical in sacred architecture as the dome squinch or baptismal font of rebirth.
- **$I = 30^\circ \left(\frac{360^\circ}{12}\right) \rightarrow$ The Dodecagon**: The cosmic cycle, reflecting the twelvefold divisions of the ecliptic, the zodiac, and the sphere of harmonic completion.

### Star Polygons, Hypocycloids, and Continuous Churn
When $\gcd(\mathrm{round}(I), 360) = 1$ and $I$ is non-integral, the chords generate complex intersecting star polygons $\{p/q\}$ and dense hypocycloidal webs. These non-terminating orbits mirror the dense, quasi-periodic trajectories of Hamiltonian dynamical systems, evoking the infinite, self-referential complexity of the cosmic loom.

## 3. Harmonic Trail Closure and the Metaphysics of Time

In physical spacetime, matter leaves irreversible entropy trails. In the Hypercube Plotter, form adheres to the metaphysics of the **Eternal Return** (*Apokatastasis*):

$$\text{Steps to Closure} = \frac{360}{\gcd(\mathrm{round}(I), 360)} + 1$$

- **Cyclic Conservation**: The visual buffer retains the exact number of edges required to complete the canonical polygon. Once closed, the shape is self-sustaining; further iteration produces complete redundancy.
- **Asymmetric Temporal Decay**: When the intensity parameter $I$ shifts, the memory buffer expands and contracts along asymmetric lerp vectors ($\lambda_{\text{grow}} = 0.15, \lambda_{\text{shrink}} = 0.06$). The emergence of the new form is rapid, while the ghost of the previous geometry dissolves gradually, embodying the phenomenological retention and protention described in Husserlian time-consciousness.

## 4. The Interior Angle and the Hypercube Projection

The HUD monitors the metric $(180^\circ - I)$. For any regular $n$-gon generated by $I$, this metric quantifies the exact interior vertex angle of the polygon.

Metaphysically, the visualizer serves as a **Schlegel projection** of an oscillating higher-dimensional polytope (a hypercube or 4D tesseract) rotating through a 2D slice of observation. The ricocheting chord lines do not merely trace arbitrary 2D paths; they represent the 2D orthographic shadows cast by higher-dimensional simplex vertices traversing a hyperspherical manifold.

---

# Part II: Neuro-Phenomenology and Cybernetic Transmutation

The second tier of the architecture integrates the human nervous system into the visualizer, transforming the mathematical engine into a **cybernetic feedback loop** where the observer's mind is both the generator and the recipient of the geometric form.

```
       ┌─────────────────────────────────────────────────────────┐
       ▼                                                         │
┌──────────────┐     Welch PSD      ┌──────────────────┐  ws://  │  Visual & Audio
│  Human Mind  │ ─────────────────▶ │  LSL Gateway     │ ──────▶ ├─ Resonance Loop
│  (EEG / Nous)│  (Muse 2 / BLE)    │  (Centroid Calc) │  8080   │  (Spirograph &
└──────────────┘                    └──────────────────┘         │   Binaural Beat)
       ▲                                                         │
       └─────────────────────────────────────────────────────────┘
```

## 1. The Mind-Geometry Isomorphism (Spectral Centroid Mapping)

The human brain is an electro-chemical oscillator whose spectral landscape reflects varying depths of consciousness. Using four discrete sensory electrodes—**TP9** (left temporal), **AF7** (left prefrontal), **AF8** (right prefrontal), and **TP10** (right temporal)—the backend signal processor computes the discrete Fourier transform and Welch power spectral density (PSD) of the aggregate neural flux.

The global state of arousal is distilled into the **Spectral Centroid** ($f_c \in [0.5, 45.0]\text{ Hz}$), defined as the spectral center-of-gravity across the five canonical neuro-electric octaves:

$$f_c = \frac{\sum_{b} P(b) \cdot \omega_b}{\sum_{b} P(b)}, \quad b \in \{\delta, \theta, \alpha, \beta, \gamma\}$$

This centroid is mapped onto the geometric step intensity $I$. The resulting dynamic creates an inverse isomorphism between cognitive arousal and polygonal vertex count:

$$\text{Higher Frequency} \iff \text{Sharper Angles, Lower Vertex Count}$$

```
High Arousal (Gamma: 40 Hz)  ──────▶  3-gon (Triangle: Sharp, Acute, Unified)
Active Mind  (Beta:  20 Hz)  ──────▶  4-gon (Square: Terrestrial, Polarized)
Calm Focus   (Alpha: 10 Hz)  ──────▶  6-gon (Hexagon: Harmonized, Equilateral)
Liminal State(Theta:  6 Hz)  ──────▶  8-gon (Octagon: Transitional, Translucent)
Deep Rest    (Delta:  2 Hz)  ──────▶  12-gon (Circle: Undifferentiated, Monadic)
```

### The Philosophical Hierarchy of Bands:
1. **Delta ($\delta$: 0.5 – 4.0 Hz) $\rightarrow$ The Dodecagon (12-gon)**:
   The state of slow-wave sleep, unconditioned somatic repair, and ego-dissolution. The geometry approaches the continuous circumference of the circle, representing pure dissolution into the unmanifest unconscious.
2. **Theta ($\theta$: 4.0 – 8.0 Hz) $\rightarrow$ The Octagon (8-gon)**:
   The hypnagogic borderland between waking and sleeping; the realm of subconscious archetypes, creative dreaming, and noetic intuition. Rendered as the eightfold star or octagon, the intermediate geometry between heaven and earth.
3. **Alpha ($\alpha$: 8.0 – 13.0 Hz) $\rightarrow$ The Hexagon (6-gon)**:
   The gateway of conscious presence; relaxed alertness with sensory withdrawal (*Pratyahara*). Represented by the balanced hexagon, signifying harmonious equilibrium and cognitive homeostasis.
4. **Beta ($\beta$: 13.0 – 30.0 Hz) $\rightarrow$ The Square (4-gon)**:
   Active, linear, analytical ratiocination (*Dianoia*). The square's orthogonal $90^\circ$ angles mirror the structured, compartmentalized cognition required for spatial manipulation and problem-solving.
5. **Gamma ($\gamma$: 30.0 – 45.0 Hz) $\rightarrow$ The Triangle (3-gon)**:
   High-frequency cortical cross-modal binding and intuitive flashes (*Nous* / *Epiphany*). The triangle’s razor-sharp vertices symbolize acute concentration and the unification of subject and object into a singular focal point.

## 2. Psychoacoustic Entrainment: *Musica Universalis*

Rooted in the Pythagorean doctrine of the **Music of the Spheres** (*Musica Universalis*), spatial geometry in Hypercube Plotter is inextricably linked to acoustic vibration.

An integrated Web Audio synthesis engine generates real-time stereophonic **Binaural Beats**:
- The **Left Channel** radiates a pure sinusoidal carrier tone: $f_L = f_{\text{base}}$ (e.g. 200 Hz).
- The **Right Channel** radiates a frequency offset by the active neural centroid: $f_R = f_{\text{base}} + f_c$.

When presented dichotically through stereo headphones, the superior olivary complex in the auditory brainstem integrates the phase differential, perceiving a subjective phantom oscillation at the differential frequency $\Delta f = |f_R - f_L| = f_c$.

Because the visual spirograph and the acoustic binaural pulse share the identical mathematical driver ($f_c$), sensory modalities achieve **cross-modal phase alignment**. Visual form and auditory tone become two perceptual projections of the same underlying psychic state.

## 3. Alchemical Protocols and Coherence Metrics

Beyond passive mirroring, the system serves as a teleological instrument for conscious self-regulation through targeted entrainment protocols:

- **The Hypnagogic Protocol (Target: 6.0 Hz)**: Evokes liminal Theta hypnagogia, lowering neural velocity toward the edge of dream consciousness.
- **The ESP / Insight Protocol (Target: 40.0 Hz)**: Drives Gamma synchronous coherence, stimulating trans-cortical communication and heightened vigilance.

### The Coherence Equation
Spectral distance to the ideal target frequency $\omega_{\text{target}}$ is continuously integrated into a **Coherence Index** ($C \in [0, 100\%]$):

$$C(t) = \max\left(0, 1 - \frac{|f_c(t) - \omega_{\text{target}}|}{\Delta\omega_{\max}}\right) \times 100\%$$

### Chromatic Transmutation
The visualizer acts as an alchemical furnace (*athanor*):
- **Unregulated / Out-of-Phase State**: The spirograph burns with primal **Crimson Red** ($\text{RGB}(255, 0, 0)$).
- **Synchronized / Coherent State**: As coherence approaches $100\%$, the color shifts through the visible spectrum into **Transcendental Violet / Magenta** ($\text{RGB}(255, 68, 255)$), providing immediate visual gratification when the subject stabilizes the target mental state.

## 4. Multi-Channel Oscilloscope (The Raw Sensorium)

The **EEG Data View** strips away geometric abstraction to expose the raw empirical data of the nervous system:
- **TP9 & TP10**: Temporal electrode vectors monitoring sensory gating and auditory cortex integration.
- **AF7 & AF8**: Prefrontal electrode vectors monitoring executive function, ocular saccades, and frontal asymmetry.
- **Continuous 256 Hz Chunk Ingestion**: Prevents Nyquist-Shannon aliasing, rendering the authentic microvolt fluctuations ($\mu\text{V}$) of cortical dipole fields across the canvas.

## 5. Statistical Normalization and Baseline Calibration

Consciousness possesses no absolute scale; each mind is an idiosyncratic landscape. The **Baseline Calibration** routine captures a 30-second resting epoch to derive individual parametric statistics:

$$\mu = \frac{1}{N} \sum_{k=1}^N I_k, \quad \sigma = \sqrt{\frac{1}{N-1} \sum_{k=1}^N (I_k - \mu)^2}$$

Deviations from the personal baseline are computed in real-time as a dimensionless **Z-Score**:

$$Z = \frac{I(t) - \mu}{\sigma}$$

When $|Z| > 1.5$, indicating acute neuro-physiological dysregulation or muscular tension artifacts, the system injects microscopic geometric perturbations into the drawing locus. The visual shape shakes and destabilizes, prompting the subject to consciously release physical tension and restore internal calm.

---

# Part III: Architecture, Setup, and Operation

## 1. Technological Stack

- **Backend Daemon**: Python 3.12, Lab Streaming Layer (`pylsl`), Asynchronous WebSocket Server (`websockets`), `scipy.signal.welch`, `bleak` Bluetooth Low Energy stack.
- **Frontend Dashboard**: Vanilla HTML5 Canvas (high-DPI logical scaling), Web Audio API (dual sine oscillators, dynamic compression limiting), pure CSS3 (variable reactive scaling).

## 2. Installation & Setup

### Environment Configuration
```bash
# Clone and enter directory
cd Hypercube

# Initialize virtual environment
python3 -m venv muse_env
source muse_env/bin/activate

# Install core dependencies (excluding legacy graphic drivers)
pip install -r requirements.txt
```

### Launching the Cybernetic Gateway
To initialize both the asynchronous WebSocket server (port 8080) and the local HTTP daemon (port 8000), execute the unified startup script:

```bash
bash start_muse.sh
```

Navigate to **`http://localhost:8000`** in any modern web browser.

### Headset Synchronization
1. Power on the Muse 2 or Muse S headband; verify local Bluetooth adapter availability.
2. In the browser dashboard's **EEG Interface** panel (top right), click **Scan**.
3. Select the discovered device MAC / UUID address and initiate **Connect**.
4. Enable **Live EEG Mode** to surrender manual control to your neural field.
5. Engage **Audio** (headphones recommended) and select a training protocol to begin the biofeedback loop.

### Telemetry Controls
- **Spacebar**: Toggle HUD overlay obscurity for pure geometric contemplation.
- **Arrow Up / Arrow Down**: Manually traverse the frequency intensity spectrum when detached from live telemetry.
- **Audio Checkbox**: Engage or silence the dual-ear binaural beat engine.
