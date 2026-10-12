"""Synthesizes Hell's soundscape (all original, generated from scratch):

  hell_drone    60 s bed for the pit: rumbling deep, a dissonant tritone that
                breathes, a roaring fire, metal groaning, the damned far off
  abyss_bed     60 s bed for the Spire: near-silence, a sub-bass breath, and
                Agartha's heavenly choir swells played backwards an octave down
  hell_wail     ghostly wails, falling (3 variants)
  hell_whisper  breathy whispers (3 variants)
  hell_tick     the Clocktower of Reversion: a tick that swells in backwards
  hell_again    the stinger when a soul is sent back to the bottom
  devil_voice   the Keeper of the Contract's low murmur (3 variants)

Requires numpy and ffmpeg (with libvorbis). Run: python3 tools/gen_hell_sounds.py
"""
import numpy as np

from gen_sounds import SR, t_axis, smooth_noise, band_noise, bell, reverb, normalize, fade, loopable, lowpass, swell, write_ogg

rng = np.random.default_rng(13)


def glide_voice(f_start, f_end, sec, vib=0.025, vib_rate=5.5, weights=None):
    """A voice whose pitch slides from f_start to f_end, with a wavering vibrato."""
    t = t_axis(sec)
    f = f_start + (f_end - f_start) * (t / sec) ** 1.3
    f = f * (1 + vib * np.sin(2 * np.pi * vib_rate * t + rng.uniform(0, 6)) * np.clip(t / 0.6, 0, 1))
    ph = 2 * np.pi * np.cumsum(f) / SR
    out = np.zeros_like(t)
    for h, w in weights or [(1, 1.0), (2, 0.55), (3, 0.45), (4, 0.25), (5, 0.18), (6, 0.08), (7, 0.05)]:
        out += w * np.sin(h * ph + rng.uniform(0, 6))
    return out


def hell_drone(sec=60):
    n = int(SR * (sec + 2))
    t = np.arange(n) / SR
    rumble = smooth_noise(n, 45) * 0.7
    breath = 0.55 + 0.45 * np.sin(2 * np.pi * t / 15.5)
    pad = np.zeros(n)
    for f, a in [(55.0, 0.5), (77.78, 0.35), (110.0, 0.25), (110.7, 0.2), (155.6, 0.12)]:
        ph = 2 * np.pi * f * t + 0.4 * np.sin(2 * np.pi * 0.07 * t)
        pad += a * (np.sin(ph) + 0.4 * np.sin(2 * ph) + 0.2 * np.sin(3 * ph))
    pad = lowpass(pad, 0.05) * breath
    roar = band_noise(n, 150, 900) * (0.4 + 0.6 * np.clip(smooth_noise(n, 0.3) * 0.5 + 0.5, 0, 1)) * 0.22
    out = rumble + pad * 0.5 + roar
    # Metal groaning, somewhere above.
    for _ in range(6):
        start = rng.uniform(0, sec - 4)
        dur = rng.uniform(2.5, 4.5)
        i0 = int(start * SR)
        tt = np.arange(int(dur * SR)) / SR
        f0 = rng.uniform(140, 220) * (1 - 0.3 * tt / dur)
        ph = 2 * np.pi * np.cumsum(f0) / SR
        g = sum(a * np.sin(r * ph) for r, a in [(1, 1), (2.32, 0.6), (3.87, 0.4), (5.1, 0.25)])
        env = np.sin(np.pi * tt / dur) ** 2
        out[i0:i0 + len(tt)] += g * env * 0.12
    # The damned, far off: wordless voices falling.
    for _ in range(9):
        start = rng.uniform(0, sec - 5)
        dur = rng.uniform(3, 5)
        i0 = int(start * SR)
        f1 = rng.uniform(260, 420)
        v = glide_voice(f1, f1 * 0.6, dur, vib=0.03)
        env = np.sin(np.pi * np.arange(len(v)) / len(v)) ** 2
        out[i0:i0 + len(v)] += v * env * 0.035
    out = reverb(out, 3.0, 0.5)
    return normalize(fade(loopable(out, 2.0), 2.0, 2.0), 0.7)


def slow_down(x, factor=2.0):
    """Plays a sound slower (and lower) by resampling."""
    n = int(len(x) * factor)
    return np.interp(np.arange(n) / factor, np.arange(len(x)), x)


def abyss_bed(sec=60):
    n = int(SR * (sec + 2))
    t = np.arange(n) / SR
    out = np.sin(2 * np.pi * 41 * t) * (0.3 + 0.2 * np.sin(2 * np.pi * t / 21)) * 0.35
    out += band_noise(n, 1800, 6000) * 0.02
    # Heaven, backwards: the choir swells of Agartha, reversed and an octave down.
    for start, chord in [(3, [293.66, 369.99, 440.0, 587.33]), (19, [261.63, 329.63, 392.0, 523.25]), (35, [246.94, 311.13, 369.99, 493.88]), (49, [293.66, 349.23, 440.0, 554.37])]:
        s = slow_down(swell(chord)[::-1], 2.0)
        s = lowpass(s, 0.15)
        i0 = int(start * SR)
        m = min(len(s), n - i0)
        out[i0:i0 + m] += s[:m] * 0.5
    # Drops falling somewhere in the dark.
    for _ in range(14):
        i0 = int(rng.uniform(0, sec) * SR)
        d = bell(rng.uniform(1400, 2400), np.arange(int(0.6 * SR)) / SR, decay=9) * 0.05
        m = min(len(d), n - i0)
        out[i0:i0 + m] += d[:m]
    out = reverb(out, 3.5, 0.6)
    return normalize(fade(loopable(out, 2.0), 2.0, 2.0), 0.45)


def hell_wail(sec):
    f1 = rng.uniform(380, 560)
    v = glide_voice(f1, f1 * rng.uniform(0.45, 0.6), sec, vib=0.035, vib_rate=rng.uniform(5, 7))
    v += glide_voice(f1 * 1.01, f1 * 0.52, sec, vib=0.03) * 0.6
    t = t_axis(sec)
    env = np.clip(t / 0.5, 0, 1) * np.clip((sec - t) / 1.6, 0, 1)
    breath = band_noise(len(t), 600, 3000) * 0.12
    out = np.tanh((v + breath) * env * 1.4)
    return normalize(reverb(out, 3.0, 0.7), 0.7)


def hell_whisper(sec=2.6):
    n = int(SR * sec)
    out = np.zeros(n)
    t0 = 0.15
    while t0 < sec - 0.4:
        d = rng.uniform(0.08, 0.22)
        i0, m = int(t0 * SR), int(d * SR)
        lo = rng.uniform(1200, 2400)
        burst = band_noise(m, lo, lo + rng.uniform(1500, 3500))
        env = np.sin(np.pi * np.arange(m) / m) ** 1.5
        out[i0:i0 + m] += burst * env * rng.uniform(0.5, 1)
        if rng.random() < 0.4:  # a hissing consonant
            c = band_noise(int(0.05 * SR), 4500, 8000) * 0.6
            out[i0:i0 + len(c)] += c * np.linspace(1, 0, len(c))
        t0 += d + rng.uniform(0.03, 0.15)
    return normalize(reverb(out, 1.5, 0.45), 0.55)


def hell_tick():
    n = int(SR * 0.9)
    t = np.arange(n) / SR
    click = band_noise(n, 2000, 5000) * np.exp(-t / 0.006)
    knock = np.sin(2 * np.pi * 1400 * t) * np.exp(-t / 0.04) * 0.6 + np.sin(2 * np.pi * 180 * t) * np.exp(-t / 0.05) * 0.5
    out = reverb(click + knock, 1.2, 0.6)
    return normalize(fade(out[::-1], 0.02, 0.005), 0.8)  # reversed: it swells into the tick


def hell_again(sec=3.5):
    n = int(SR * sec)
    t = np.arange(n) / SR
    rise = band_noise(n, 3000, 11000) * np.clip(t / 1.2, 0, 1) ** 3 * (t < 1.2) * 0.5
    tb = np.clip(t - 1.2, 0, None)
    f = 55 - 23 * np.clip(tb / 1.5, 0, 1)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tb / 0.9) * (t >= 1.2)
    thump = smooth_noise(n, 120) * np.exp(-tb / 0.15) * (t >= 1.2) * 0.5
    out = reverb(rise + boom + thump, 2.5, 0.4)
    return normalize(out, 0.85)


def devil_voice(sec):
    n = int(SR * sec)
    t = np.arange(n) / SR
    f0 = rng.uniform(60, 72) * (1 + 0.06 * np.sin(2 * np.pi * 0.7 * t + rng.uniform(0, 6)))
    ph = 2 * np.pi * np.cumsum(f0) / SR
    # Syllables: each with its own vowel colour.
    vowels = [[(1, 1), (2, 0.8), (3, 0.6), (5, 0.4), (8, 0.15)], [(1, 1), (2, 0.5), (4, 0.3), (6, 0.2)], [(1, 1), (3, 0.7), (5, 0.5), (7, 0.3), (11, 0.1)]]
    out = np.zeros(n)
    t0 = 0.05
    while t0 < sec - 0.2:
        d = rng.uniform(0.18, 0.34)
        i0 = int(t0 * SR)
        m = min(int(d * SR), n - i0)
        env = np.sin(np.pi * np.arange(m) / m) ** 0.8
        w = vowels[rng.integers(0, 3)]
        seg = sum(a * np.sin(h * ph[i0:i0 + m]) for h, a in w)
        out[i0:i0 + m] += seg * env
        t0 += d + rng.uniform(0.02, 0.1)
    growl = 1 + 0.35 * np.sin(2 * np.pi * 28 * t)
    breath = band_noise(n, 300, 2000) * 0.08
    out = np.tanh((out * growl + breath) * 1.2)
    return normalize(reverb(lowpass(out, 0.25), 1.4, 0.35), 0.8)


if __name__ == "__main__":
    write_ogg("hell_drone", hell_drone())
    write_ogg("abyss_bed", abyss_bed())
    for i, sec in enumerate([4.5, 5.5, 4.0]):
        write_ogg(f"hell_wail{i + 1}", hell_wail(sec))
    for i in range(3):
        write_ogg(f"hell_whisper{i + 1}", hell_whisper())
    write_ogg("hell_tick", hell_tick())
    write_ogg("hell_again", hell_again())
    for i, sec in enumerate([1.8, 2.3, 1.5]):
        write_ogg(f"devil_voice{i + 1}", devil_voice(sec))
