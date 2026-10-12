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
  ogre_roar     the Gaoler hears you running: a huge, chesty bellow
  ogre_step     the Gaoler's footfall: a thud you feel more than hear (2 variants)
  ogre_grunt    the Gaoler breathing, grumbling (2 variants)

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


def damned_moan(sec):
    """A dry, rattling groan."""
    f0 = rng.uniform(90, 130)
    v = glide_voice(f0, f0 * rng.uniform(0.7, 0.85), sec, vib=0.05, vib_rate=rng.uniform(3, 5), weights=[(1, 1), (2, 0.8), (3, 0.6), (4, 0.5), (6, 0.3), (8, 0.2)])
    t = t_axis(sec)
    env = np.clip(t / 0.3, 0, 1) * np.clip((sec - t) / 0.8, 0, 1)
    rasp = band_noise(len(t), 400, 2500) * 0.35 * (0.5 + 0.5 * np.sin(2 * np.pi * 23 * t))
    out = np.tanh((v * 0.7 + rasp) * env * 2.0)
    return normalize(reverb(lowpass(out, 0.3), 1.2, 0.3), 0.75)


def damned_hurt():
    t = t_axis(0.6)
    f = 240 * (1 - 0.4 * t / 0.6)
    ph = 2 * np.pi * np.cumsum(f) / SR
    out = sum(a * np.sin(h * ph) for h, a in [(1, 1), (2, 0.7), (3, 0.5), (5, 0.3)]) * np.exp(-t / 0.25)
    out += band_noise(len(t), 800, 4000) * np.exp(-t / 0.1) * 0.4
    return normalize(np.tanh(out * 2), 0.8)


def damned_death():
    t = t_axis(2.2)
    f = 180 * (1 - 0.6 * t / 2.2)
    ph = 2 * np.pi * np.cumsum(f) / SR
    out = sum(a * np.sin(h * ph) for h, a in [(1, 1), (2, 0.6), (3, 0.4)]) * np.exp(-t / 0.8)
    out += band_noise(len(t), 200, 1500) * np.exp(-t / 0.5) * 0.4
    return normalize(reverb(np.tanh(out * 1.6), 1.5, 0.4), 0.8)


def hound_growl(sec):
    t = t_axis(sec)
    f0 = rng.uniform(55, 75)
    ph = 2 * np.pi * np.cumsum(f0 * (1 + 0.05 * np.sin(2 * np.pi * 1.3 * t))) / SR
    tone = sum(a * np.sin(h * ph) for h, a in [(1, 1), (2, 0.9), (3, 0.7), (4, 0.5), (5, 0.35), (7, 0.2)])
    am = 0.5 + 0.5 * np.abs(np.sin(2 * np.pi * rng.uniform(18, 26) * t))
    env = np.clip(t / 0.2, 0, 1) * np.clip((sec - t) / 0.4, 0, 1)
    out = np.tanh((tone * am + band_noise(len(t), 300, 1800) * 0.5) * env * 1.8)
    return normalize(lowpass(out, 0.25), 0.8)


def hound_howl(sec):
    t = t_axis(sec)
    rise = np.clip(t / 0.8, 0, 1)
    f = 260 + 220 * rise - 120 * np.clip((t - sec * 0.6) / (sec * 0.4), 0, 1)
    f = f * (1 + 0.015 * np.sin(2 * np.pi * 5 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    out = sum(a * np.sin(h * ph) for h, a in [(1, 1), (2, 0.4), (3, 0.2)])
    env = np.clip(t / 0.4, 0, 1) * np.clip((sec - t) / 1.0, 0, 1)
    return normalize(reverb(out * env, 3.0, 0.6), 0.7)


def hound_hurt():
    t = t_axis(0.4)
    f = 700 * (1 - 0.5 * t / 0.4)
    out = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.12) + band_noise(len(t), 1000, 5000) * np.exp(-t / 0.05) * 0.3
    return normalize(out, 0.8)


def fury_shriek(sec):
    """A harpy's scream: a high, tearing glissando with a screech of noise."""
    t = t_axis(sec)
    f1 = rng.uniform(900, 1300)
    f = f1 * (1 + 0.35 * np.sin(np.pi * t / sec)) * (1 + 0.03 * np.sin(2 * np.pi * 9 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    tone = sum(a * np.sin(h * ph) for h, a in [(1, 1), (2, 0.7), (3, 0.5), (4, 0.3), (5, 0.2)])
    screech = band_noise(len(t), 2500, 8000) * 0.5
    env = np.clip(t / 0.08, 0, 1) * np.clip((sec - t) / 0.5, 0, 1)
    out = np.tanh((tone + screech) * env * 2.5)
    return normalize(reverb(out, 2.0, 0.5), 0.75)


def dread(sec=4.0):
    """A deep swell of dread: a sub boom, a dissonant cluster, whispers."""
    n = int(SR * sec)
    t = np.arange(n) / SR
    env = np.clip(t / 1.2, 0, 1) ** 2 * np.clip((sec - t) / 1.5, 0, 1)
    cluster = sum(np.sin(2 * np.pi * f * t) for f in [49, 52, 69.3, 73.4, 98, 103.8]) * 0.2
    out = cluster * env + smooth_noise(n, 40) * env * 0.6
    out[: int(1.2 * SR)] += band_noise(int(1.2 * SR), 2000, 8000) * np.linspace(0, 0.3, int(1.2 * SR))
    return normalize(reverb(out, 3.0, 0.5), 0.85)


def dis_bed(sec=60):
    """The burning city: fire's roar, a far crowd of the damned, iron groaning, deep drums."""
    n = int(SR * (sec + 2))
    t = np.arange(n) / SR
    roar = band_noise(n, 100, 700) * (0.5 + 0.5 * np.clip(smooth_noise(n, 0.4) * 0.5 + 0.5, 0, 1)) * 0.35
    crackle = (rng.random(n) < 0.0015) * rng.uniform(-1, 1, n)
    crackle = np.convolve(crackle, np.exp(-np.arange(200) / 30), mode="same") * 0.5
    out = roar + crackle + smooth_noise(n, 35) * 0.4
    # The crowd: many falling voices, far away.
    for _ in range(26):
        st = rng.uniform(0, sec - 4)
        d = rng.uniform(2.5, 4.5)
        f1 = rng.uniform(220, 480)
        v = glide_voice(f1, f1 * rng.uniform(0.55, 0.8), d, vib=0.04)
        e = np.sin(np.pi * np.arange(len(v)) / len(v)) ** 2
        i0 = int(st * SR)
        out[i0:i0 + len(v)] += v * e * 0.03
    # Slow drums, like a heart under the city.
    for k in range(int(sec / 2.4)):
        i0 = int((k * 2.4 + 0.3) * SR)
        tt = np.arange(int(0.6 * SR)) / SR
        hit = np.sin(2 * np.pi * (60 - 20 * tt) * tt) * np.exp(-tt / 0.18) * (0.6 if k % 2 else 0.4)
        out[i0:i0 + len(hit)] += hit[: max(0, min(len(hit), n - i0))]
    out = reverb(out, 3.0, 0.45)
    return normalize(fade(loopable(out, 2.0), 2.0, 2.0), 0.7)


ogre_rng = np.random.default_rng(66)


def ogre_roar(sec=2.6):
    """A bellow from a chest the size of a barrel: low voice, growl, distortion."""
    t = t_axis(sec)
    f = 70 + 40 * np.sin(np.pi * np.clip(t / sec, 0, 1)) ** 0.6
    f = f * (1 + 0.04 * np.sin(2 * np.pi * 6.5 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    tone = sum(a * np.sin(h * ph + ogre_rng.uniform(0, 6)) for h, a in [(1, 1), (2, 0.9), (3, 0.8), (4, 0.6), (5, 0.5), (6, 0.35), (8, 0.2)])
    rasp = band_noise(len(t), 200, 1400) * (0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 31 * t)))
    env = np.clip(t / 0.25, 0, 1) * np.clip((sec - t) / 0.9, 0, 1)
    out = np.tanh((tone + rasp * 0.8) * env * 2.2)
    return normalize(reverb(lowpass(out, 0.3), 2.5, 0.5), 0.9)


def ogre_step():
    """A heavy footfall: a sub thump and a crunch of grit."""
    t = t_axis(0.7)
    thump = np.sin(2 * np.pi * (48 - 20 * t) * t) * np.exp(-t / 0.12)
    crunch = band_noise(len(t), 300, 3000) * np.exp(-t / 0.04) * ogre_rng.uniform(0.25, 0.4)
    return normalize(reverb(thump + crunch, 1.0, 0.3), 0.9)


def ogre_grunt(sec):
    t = t_axis(sec)
    f = ogre_rng.uniform(60, 80) * (1 - 0.2 * t / sec)
    ph = 2 * np.pi * np.cumsum(f) / SR
    tone = sum(a * np.sin(h * ph) for h, a in [(1, 1), (2, 0.8), (3, 0.6), (4, 0.4), (6, 0.2)])
    env = np.sin(np.pi * np.clip(t / sec, 0, 1)) ** 1.5
    out = np.tanh((tone + band_noise(len(t), 150, 900) * 0.6) * env * 1.6)
    return normalize(lowpass(out, 0.2), 0.75)


if __name__ == "__main__":
    import sys
    if "--ogre" in sys.argv:
        write_ogg("ogre_roar", ogre_roar())
        for i in range(2):
            write_ogg(f"ogre_step{i + 1}", ogre_step())
        for i, sec in enumerate([1.2, 1.6]):
            write_ogg(f"ogre_grunt{i + 1}", ogre_grunt(sec))
        sys.exit(0)
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
    for i, sec in enumerate([2.2, 2.8, 1.9]):
        write_ogg(f"damned_moan{i + 1}", damned_moan(sec))
    for i in range(2):
        write_ogg(f"damned_hurt{i + 1}", damned_hurt())
    write_ogg("damned_death", damned_death())
    for i, sec in enumerate([1.6, 2.2]):
        write_ogg(f"hound_growl{i + 1}", hound_growl(sec))
    for i, sec in enumerate([3.5, 4.5]):
        write_ogg(f"hound_howl{i + 1}", hound_howl(sec))
    write_ogg("hound_hurt", hound_hurt())
    write_ogg("hound_death", damned_hurt())
    for i, sec in enumerate([1.4, 1.8, 1.2]):
        write_ogg(f"fury_shriek{i + 1}", fury_shriek(sec))
    write_ogg("dread", dread())
    write_ogg("dis_bed", dis_bed())
    write_ogg("ogre_roar", ogre_roar())
    for i in range(2):
        write_ogg(f"ogre_step{i + 1}", ogre_step())
    for i, sec in enumerate([1.2, 1.6]):
        write_ogg(f"ogre_grunt{i + 1}", ogre_grunt(sec))
