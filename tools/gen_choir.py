"""Synthesizes Agartha's choir: an original two-minute angelic piece that loops
seamlessly (writes resource_pack/sounds/agartha/ambience.ogg, in stereo).

  * A four-part "aah" choir, several singers per part, moving through eight
    chords in D (with a Lydian shimmer), about 15 s each.
  * From the half-way point a soprano section sings a slow "ooh" melody.
  * High celesta sparkles, a warm low drone, and a long cathedral reverb.

Seamless looping: everything is rendered on a circle of exactly LOOP seconds.
Notes that ring past the end wrap round to the start, and the reverb is a
circular convolution, so the last moment flows straight into the first. The
file then carries XF extra seconds (a copy of the start) fading out while the
next copy, replayed by the script every LOOP seconds, fades in over the same
material.

Requires numpy and ffmpeg (with libvorbis). Takes a minute or two.
"""
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

SR = 44100
LOOP = 120.0  # seconds; the script replays the file every LOOP seconds
XF = 4.0  # crossfade tail
N = int(LOOP * SR)
OUT = Path(__file__).resolve().parent.parent / "resource_pack" / "sounds" / "agartha"
rng = np.random.default_rng(1729)

L = np.zeros(N)
R = np.zeros(N)


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def add(sig, start_s, pan):
    """Adds a mono signal at start_s, wrapping round the loop, panned -1..1."""
    i0 = int(start_s * SR) % N
    idx = (np.arange(len(sig)) + i0) % N
    gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    L[idx] += sig * gl  # len(sig) < N, so the wrapped indices never repeat
    R[idx] += sig * gr


# Vowel formants: (centre Hz, half-width Hz, gain).
AH_HIGH = [(800, 90, 1.0), (1150, 100, 0.5), (2900, 140, 0.12), (3900, 160, 0.06)]
AH_LOW = [(600, 80, 1.0), (1040, 90, 0.45), (2250, 120, 0.1), (2450, 130, 0.08)]
OOH = [(350, 70, 1.0), (600, 80, 0.3), (2700, 140, 0.03)]


def harmonic_weights(f0, vowel):
    ws = []
    h = 1
    while h * f0 < 5500:
        f = h * f0
        w = 0.22 / h ** 0.8 + sum(g / (1 + ((f - c) / bw) ** 2) for c, bw, g in vowel)
        if w > 0.015:
            ws.append((h, w))
        h += 1
    return ws


def singer(f0, dur, env, vowel, vib_depth=0.005):
    """One voice: harmonics shaped by vowel formants, with natural vibrato
    that blooms in, a little pitch drift, and a touch of breath."""
    n = len(env)
    t = np.arange(n) / SR
    drift = np.cumsum(rng.standard_normal(n // 2205 + 2))[: n // 2205 + 2]
    drift = np.interp(t, np.arange(len(drift)) * 0.05, drift / (np.abs(drift).max() + 1e-9))
    bloom = np.clip(t / 2.5, 0, 1)
    vib = np.sin(2 * np.pi * rng.uniform(4.8, 5.6) * t + rng.uniform(0, 6)) * vib_depth * bloom
    detune = 2 ** (rng.uniform(-7, 7) / 1200)
    f = f0 * detune * (1 + vib + drift * 0.0025)
    phase = 2 * np.pi * np.cumsum(f) / SR
    out = np.zeros(n)
    for h, w in harmonic_weights(f0, vowel):
        out += w * np.sin(h * phase + rng.uniform(0, 6))
    breath = np.fft.irfft(np.fft.rfft(rng.standard_normal(n)) * np.exp(-((np.fft.rfftfreq(n, 1 / SR) - 2500) / 1800) ** 2), n)
    out += breath / (np.abs(breath).max() + 1e-9) * 0.04
    return out * env


def envelope(dur, attack, release):
    n = int(dur * SR)
    t = np.arange(n) / SR
    a = np.sin(np.pi / 2 * np.clip(t / attack, 0, 1)) ** 2
    r = np.sin(np.pi / 2 * np.clip((dur - t) / release, 0, 1)) ** 2
    return a * r


def section(midi, start, dur, vowel, singers, gain, pan, attack=4.0, release=6.0, vib=0.005):
    env = envelope(dur, attack, release)
    for k in range(singers):
        p = np.clip(pan + rng.uniform(-0.35, 0.35), -1, 1)
        add(singer(hz(midi), dur, env, vowel, vib) * gain / singers ** 0.5, start + rng.uniform(0, 0.25), p)
    print(f"  sang {midi} at {start:.0f}s", flush=True)


def bell(freq, n, decay):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for ratio, amp, d in [(1, 1.0, 1), (2.0, 0.35, 1.4), (3.01, 0.18, 2.0), (4.17, 0.08, 2.8)]:
        out += amp * np.sin(2 * np.pi * freq * ratio * t) * np.exp(-t * decay * d)
    return out * np.minimum(1, t / 0.003)


# --- The piece ---------------------------------------------------------------
# Eight chords, 15 s each: [bass, tenor, alto, soprano, descant] (MIDI).
CHORDS = [
    [50, 57, 64, 66, 73],  # Dmaj9
    [47, 54, 61, 62, 66],  # Bm(add9)
    [43, 55, 61, 62, 66],  # Gmaj7(#11): the Lydian shimmer
    [45, 52, 62, 64, 69],  # Asus4
    [42, 54, 61, 64, 69],  # F#m7
    [43, 57, 62, 66, 69],  # Gmaj9
    [40, 52, 59, 62, 66],  # Em9
    [45, 52, 59, 61, 64],  # A(add9), leaning back home to D
]
SEG = LOOP / len(CHORDS)

# Soprano "ooh" melody for the second half: (start s, length s, MIDI).
MELODY = [
    (30, 5, 78), (35, 3.5, 76), (38.5, 7.5, 74),
    (46, 5, 76), (51, 3, 78), (54, 7, 81),
    (61, 6, 73), (67, 8, 76),
    (76, 4, 74), (80, 4, 78), (84, 7, 83),
    (91, 5, 81), (96, 4, 78), (100, 6, 76),
    (106, 6, 76), (112, 7, 73),
]


def render():
    for c, chord in enumerate(CHORDS):
        start = c * SEG - 2.5  # each chord breathes in over the last one
        dur = SEG + 7.0
        for v, midi in enumerate(chord):
            low = midi < 55
            vowel = AH_LOW if low else AH_HIGH
            singers = 4 if v < 4 else 3
            gain = [0.55, 0.42, 0.40, 0.42, 0.26][v]
            pan = [-0.1, -0.55, 0.5, -0.3, 0.6][v]
            section(midi, start, dur, vowel, singers, gain, pan, attack=5.0, release=7.0)
        # A warm drone an octave under the bass.
        n = int(dur * SR)
        t = np.arange(n) / SR
        root = hz(chord[0] - 12)
        drone = (np.sin(2 * np.pi * root * t) + 0.3 * np.sin(4 * np.pi * root * t)) * envelope(dur, 5.0, 7.0) * 0.18
        add(drone, start, 0.0)
        # Celesta sparkles: chord tones two octaves up, scattered and soft.
        for _ in range(5):
            m = chord[rng.integers(2, 5)] + 24
            while m > 98:
                m -= 12
            add(bell(hz(m), int(4 * SR), 1.2) * rng.uniform(0.04, 0.08), c * SEG + rng.uniform(0, SEG), rng.uniform(-0.8, 0.8))
    for start, length, midi in MELODY:
        section(midi, start, length + 1.5, OOH, 3, 0.55, 0.15, attack=0.9, release=2.2, vib=0.0065)


def cathedral(ch_seed):
    """A 7 s cathedral impulse response: early reflections and a dark tail."""
    r = np.random.default_rng(ch_seed)
    n = int(7 * SR)
    t = np.arange(n) / SR
    tail = r.standard_normal(n) * np.exp(-t * np.log(1000) / 6.5)
    spec = np.fft.rfft(tail)
    f = np.fft.rfftfreq(n, 1 / SR)
    tail = np.fft.irfft(spec / (1 + (f / 3500) ** 2), n)
    ir = tail / np.sqrt((tail ** 2).sum())
    for d, g in [(0.019, 0.5), (0.031, 0.4), (0.047, 0.35), (0.067, 0.3), (0.089, 0.25)]:
        ir[int(d * SR * r.uniform(0.9, 1.1))] += g * 0.08
    return ir


def circular_reverb(x, ir, mix):
    padded = np.zeros(N)
    padded[: len(ir)] = ir
    wet = np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(padded), N)
    wet *= np.sqrt((x ** 2).mean() / ((wet ** 2).mean() + 1e-12))
    return x * (1 - mix) + wet * mix


def write_stereo_ogg(name, l, r):
    pcm = (np.clip(np.stack([l, r], axis=1), -1, 1) * 32767).astype(np.int16)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        with wave.open(f.name, "wb") as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", f.name, "-c:a", "libvorbis", "-q:a", "5", str(OUT / f"{name}.ogg")], check=True)
    print("wrote", name)


if __name__ == "__main__":
    render()
    l = circular_reverb(L, cathedral(1), 0.6)
    r = circular_reverb(R, cathedral(2), 0.6)
    peak = max(np.abs(l).max(), np.abs(r).max())
    l, r = l / peak * 0.85, r / peak * 0.85
    # Append XF s of the loop's start; fade it out while the next copy fades in.
    x = int(XF * SR)
    l, r = np.concatenate([l, l[:x]]), np.concatenate([r, r[:x]])
    ramp = np.sin(np.linspace(0, np.pi / 2, x)) ** 2  # fade-in + fade-out sum to 1
    for ch in (l, r):
        ch[:x] *= ramp
        ch[-x:] *= ramp[::-1]
    OUT.mkdir(parents=True, exist_ok=True)
    write_stereo_ogg("ambience", l, r)
