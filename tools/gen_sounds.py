"""Synthesizes Agartha's soundscape (all original, generated from scratch):
choir ambience, ice chimes, wind, the arrival swell, the portal hum and the
All-Father's blessing. Writes .ogg files into the resource pack.
Requires numpy and ffmpeg (with libvorbis)."""
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

SR = 44100
OUT = Path(__file__).resolve().parent.parent / "resource_pack" / "sounds" / "agartha"
rng = np.random.default_rng(7)


def t_axis(sec):
    return np.arange(int(SR * sec)) / SR


def lowpass(x, k):
    """Cheap one-pole low-pass, k in (0,1): smaller = darker."""
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += k * (v - acc)
        y[i] = acc
    return y


def smooth_noise(n, cutoff):
    # Low-pass filtered noise via FFT (fast).
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    spec *= np.exp(-((f / cutoff) ** 2))
    out = np.fft.irfft(spec, n)
    return out / (np.abs(out).max() + 1e-9)


def band_noise(n, lo, hi):
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    spec *= ((f > lo) & (f < hi)) * np.exp(-((f - (lo + hi) / 2) / (hi - lo)) ** 2)
    out = np.fft.irfft(spec, n)
    return out / (np.abs(out).max() + 1e-9)


def voice(freq, t, vib=0.004, bright=1.0):
    """A soft choir-like voice: harmonics with formant-ish weights and vibrato."""
    v = np.sin(2 * np.pi * 5.2 * t + rng.uniform(0, 6)) * vib
    phase = 2 * np.pi * freq * np.cumsum(1 + v) / SR
    out = np.zeros_like(t)
    for h, w in [(1, 1.0), (2, 0.5 * bright), (3, 0.32 * bright), (4, 0.12 * bright), (5, 0.08 * bright), (6, 0.04 * bright)]:
        out += w * np.sin(h * phase + rng.uniform(0, 6))
    return out


def bell(freq, t, decay=2.5):
    out = np.zeros_like(t)
    for ratio, amp, d in [(1, 1.0, 1), (2.76, 0.5, 1.6), (5.40, 0.28, 2.3), (8.93, 0.14, 3.2)]:
        out += amp * np.sin(2 * np.pi * freq * ratio * t) * np.exp(-t * decay * d)
    attack = np.minimum(1, t / 0.004)
    return out * attack


def reverb(x, seconds=2.5, mix=0.35):
    """Simple feedback-delay reverb for that cathedral-of-ice space."""
    out = x.copy()
    for delay, gain in [(0.031, 0.5), (0.047, 0.45), (0.071, 0.4), (0.113, 0.35), (0.173, 0.3), (0.241, 0.25)]:
        d = int(delay * SR)
        tail = np.zeros(len(x) + int(seconds * SR))
        tail[: len(x)] = x
        for k in range(1, int(seconds / delay)):
            g = gain ** k
            if g < 0.01:
                break
            tail[d * k : d * k + len(x)] += x * g
        out = out + mix * tail[: len(out)] / 6
    return out


def normalize(x, peak=0.8):
    return x / (np.abs(x).max() + 1e-9) * peak


def fade(x, a=0.05, b=0.3):
    n = len(x)
    env = np.ones(n)
    na, nb = int(a * SR), int(b * SR)
    if na:
        env[:na] = np.linspace(0, 1, na)
    if nb:
        env[-nb:] = np.linspace(1, 0, nb)
    return x * env


def loopable(x, xf=3.0):
    """Crossfades the end into the start so the sound loops seamlessly."""
    n = int(xf * SR)
    head, body, tail = x[:n], x[n:-n] if n else x, x[-n:]
    ramp = np.linspace(0, 1, n)
    return np.concatenate([tail * (1 - ramp) + head * ramp, body])


def write_ogg(name, x):
    OUT.mkdir(parents=True, exist_ok=True)
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        with wave.open(f.name, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", f.name, "-c:a", "libvorbis", "-q:a", "4", str(OUT / f"{name}.ogg")], check=True)
    print("wrote", name)


# --- Ambience: a slow choir drone with airy wind and high shimmer ------------
def ambience(sec=40):
    t = t_axis(sec + 3)
    chords = [[146.83, 220.0, 293.66, 369.99], [130.81, 196.0, 261.63, 329.63], [146.83, 220.0, 329.63, 440.0], [123.47, 185.0, 246.94, 369.99]]
    seg = len(t) // len(chords)
    out = np.zeros_like(t)
    for i, chord in enumerate(chords):
        env = np.exp(-(((np.arange(len(t)) - (i + 0.5) * seg) / (seg * 0.62)) ** 2))
        for f in chord:
            out += voice(f, t, bright=0.7) * env * 0.25
            out += voice(f * 2.003, t, bright=0.4) * env * 0.06
    air = band_noise(len(t), 300, 2500) * (0.5 + 0.5 * smooth_noise(len(t), 0.15)) * 0.25
    shimmer = np.zeros_like(t)
    for _ in range(14):
        start = rng.uniform(0, sec)
        f = rng.choice([1174.66, 1318.51, 1479.98, 1760.0, 1975.53])
        tt = np.clip(t - start, 0, None)
        shimmer += bell(f, tt, decay=0.9) * (t >= start) * 0.08
    mix = reverb(out + air + shimmer, 3.0, 0.5)
    return normalize(loopable(mix), 0.7)


def chime(seed_notes):
    t = t_axis(4)
    out = np.zeros_like(t)
    for k, f in enumerate(seed_notes):
        start = k * rng.uniform(0.12, 0.35)
        tt = np.clip(t - start, 0, None)
        out += bell(f, tt, decay=1.4) * (t >= start) * rng.uniform(0.5, 1)
    return normalize(fade(reverb(out, 2.5, 0.6), 0.001, 0.8), 0.6)


def wind(sec=12):
    t = t_axis(sec)
    gust = 0.35 + 0.65 * np.clip(smooth_noise(len(t), 0.25) * 0.5 + 0.5, 0, 1) ** 2
    howl = np.sin(2 * np.pi * np.cumsum(420 + 140 * smooth_noise(len(t), 0.3)) / SR) * 0.08
    body = band_noise(len(t), 150, 1400) * 0.8 + band_noise(len(t), 1500, 5000) * 0.15
    return normalize(fade((body + howl) * gust, 1.5, 2.5), 0.55)


def welcome():
    t = t_axis(8)
    out = np.zeros_like(t)
    swell = np.clip(t / 2.5, 0, 1) ** 1.5 * np.clip((8 - t) / 3, 0, 1)
    for f in [146.83, 220.0, 293.66, 369.99, 440.0, 587.33]:
        out += voice(f, t, vib=0.005, bright=0.9) * swell * 0.2
    for k, f in enumerate([880.0, 1108.73, 1318.51, 1760.0]):
        start = 1.6 + k * 0.28
        tt = np.clip(t - start, 0, None)
        out += bell(f, tt, decay=1.0) * (t >= start) * 0.25
    return normalize(reverb(out, 3.0, 0.6), 0.8)


def portal(sec=6):
    t = t_axis(sec + 2)
    out = np.zeros_like(t)
    for f, a in [(73.42, 0.5), (110.0, 0.35), (146.83, 0.25), (220.6, 0.12)]:
        out += np.sin(2 * np.pi * f * t + 2 * np.sin(2 * np.pi * 0.3 * t)) * a
    out *= 0.7 + 0.3 * np.sin(2 * np.pi * 0.5 * t)
    out += band_noise(len(t), 2000, 7000) * 0.05 * (0.5 + 0.5 * np.sin(2 * np.pi * 1.3 * t))
    return normalize(loopable(reverb(out, 1.5, 0.3), 2.0), 0.5)


def harp(notes, sec=5):
    """Karplus-Strong plucked strings: a gentle arpeggio."""
    t = t_axis(sec)
    out = np.zeros_like(t)
    for k, f in enumerate(notes):
        n = int(SR / f)
        buf = rng.uniform(-1, 1, n)
        sig = np.zeros(int(SR * (sec - k * 0.16)))
        for i in range(len(sig)):
            sig[i] = buf[i % n]
            buf[i % n] = 0.996 * 0.5 * (buf[i % n] + buf[(i + 1) % n])
        start = int(k * 0.16 * SR)
        out[start : start + len(sig)] += sig
    return normalize(fade(reverb(out, 2.0, 0.5), 0.001, 1.0), 0.6)


if __name__ == "__main__":
    write_ogg("ambience", ambience())
    for i, notes in enumerate([[1318.51, 1760.0, 1975.53], [1174.66, 1479.98, 2349.32, 1760.0], [987.77, 1318.51, 1479.98], [1567.98, 2093.0, 1318.51, 1760.0, 2637.02]]):
        write_ogg(f"chime{i + 1}", chime(notes))
    write_ogg("wind1", wind())
    write_ogg("wind2", wind(10))
    write_ogg("welcome", welcome())
    write_ogg("portal", portal())
    write_ogg("bless", harp([293.66, 369.99, 440.0, 587.33, 739.99, 880.0]))
