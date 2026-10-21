"""build_assets.py — the page's three playable instruments, recorded from the real plug-ins.

Nothing on the page is a web imitation: each instrument is BREATH AND BOW or
PIANO itself, rendered offline (their FilmShot harnesses) at a row of settings
along the slider — and, for the piano, a grid of two. The page plays all the
recordings of an instrument together and crossfades between the two (or four)
nearest the slider, so dragging changes the sound while it plays. Pictures are
the plug-in's own drawing at each setting, cropped to the instrument.

  clarinet  WOODWINDS: SIZE, BORE, MATERIAL and BREATH from CLARINET to SAXOPHONE
  piano     STEINWAY GRAND: LENGTH x STRIKE / PLUCK
  strings   BOWED STRING: BODY bass -> violin, OCTAVE -2 -> 0, two notes at once

    python3 tools/build_assets.py [clarinet|piano|strings ...]   -> assets/<inst>/a*.m4a, i*.jpg, meta.json
"""
import importlib.util, json, math, os, shutil, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STAGE = "/Users/RobynMiller/Claude/Projects/stage"
TOUCH = "/Users/RobynMiller/Claude/Projects/touch/plugin/build/FilmShot_artefacts/Release/FilmShot"
PIANO = "/Users/RobynMiller/Claude/Projects/piano/plugin/build/FilmShot_artefacts/Release/FilmShot"
sys.path.append(os.path.join(STAGE, "breath-film"))
_spec = importlib.util.spec_from_file_location("bp", os.path.join(STAGE, "breath-film", "perform.py"))
bp = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(bp)
_ms = importlib.util.spec_from_file_location("zmaster", os.path.join(STAGE, "zkrich-film", "master.py"))
_m = importlib.util.module_from_spec(_ms); _ms.loader.exec_module(_m)
read, write, lufs = _m.read_any, _m.write, _m.lufs
from PIL import Image

WORK = os.path.join(HERE, "work")
SR = 48000
N_AUDIO, N_IMG = 9, 17
TOUCH_CROP = (362, 34, 1552, 672)
PIANO_CROP = (430, 280, 1550, 880)

PC = dict(C=0, D=2, E=4, F=5, G=7, A=9, B=11)
def m(name):
    o = int(name[-1]); p = name[:-1]
    return 12 * (o + 1) + PC[p[0]] + sum(1 if c == "#" else -1 for c in p[1:])

def run(fs, shot, name):
    path = os.path.join(WORK, name + ".json")
    json.dump(shot, open(path, "w"))
    r = subprocess.run([fs, os.path.relpath(path, HERE)], cwd=HERE, capture_output=True, text=True)
    if r.returncode: raise SystemExit(r.stdout + r.stderr)

def to_m4a(wav, out):
    subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "96000", "-q", "127", wav, out], check=True)


# ---------------------------------------------------------------- the clarinet
LOOP_CL = 9.6
CL_NOTES = [(0.0, 2.0, "G4"), (2.0, 1.2, "B4"), (3.2, 2.4, "D5"), (5.6, 1.0, "C5"), (6.6, 1.0, "A4"), (7.6, 1.9, "G4")]
def cl_params(u):
    return {"ww_size": 0.25 + 0.27 * u, "ww_bore": u, "ww_material": 0.25 + 0.5 * u, "ww_breath": 0.10 + 0.05 * u}
bp.FAMILY["windvib"] = dict(bp.FAMILY["wind"], vib=(0.24, 5.3, 0.28))

def cl_shot(u, name, frames, dur):
    ch = dict(name=name, instrument="WOODWINDS", preset="CLARINET", title=[name],
              notes=[(t, m(n), l) for t, l, n in CL_NOTES], window=(0.0, 30.0), stretch=1.0, transpose=0, octave=0,
              family="windvib", press=0.66, swell=0.12, legato=0.03, rit=0.0, tail=0.0, last_hold=0.0,
              set=cl_params(u), automation=[])
    s = bp.perform(ch); s.pop("score", None)
    s.update(frames=frames, wav=f"work/{name}.wav", duration=dur, scale={"volume": 0.5})
    return s


# ---------------------------------------------------------------- bass to violin
LOOP_ST = 10.8
ST_PAIRS = [(0.0, 1.8, "D4", "F4"), (1.8, 0.9, "C#4", "E4"), (2.7, 0.9, "D4", "F4"), (3.6, 1.8, "E4", "G4"),
            (5.4, 1.8, "F4", "A4"), (7.2, 1.2, "E4", "C#5"), (8.4, 2.2, "D4", "A4")]
def st_params(u):
    # BODY bass -> violin; OCTAVE in whole steps (a bass plays two octaves down, a cello one, a violin as written)
    octv = -2.0 if u < 0.30 else (-1.0 if u < 0.65 else 0.0)
    # (the harness takes every setting as 0..1: OCTAVE runs -2..+2)
    return {"s_body": 1.0 - u, "s_octave": (octv + 2.0) / 4.0, "s_vibrato": 0.35}

def st_shot(u, name, frames, dur):
    notes = []
    for t, l, a, b in ST_PAIRS: notes += [(t, m(a), l), (t, m(b), l)]
    ch = dict(name=name, instrument="BOWED STRING", preset="VIOLIN", title=[name], chords=True, notes=notes,
              window=(0.0, 30.0), stretch=1.0, transpose=0, octave=0, family="bow", press=0.6, swell=0.2,
              legato=0.035, rit=0.0, tail=0.0, last_hold=0.0, set=st_params(u), automation=[])
    s = bp.perform(ch); s.pop("score", None)
    # the dynamics: a swell to the middle of the phrase, falling away at the end
    for e in s["events"]:
        if e[1] == "press":
            x = (e[0] - bp.LEAD) / LOOP_ST
            e[3] = round(min(0.95, e[3] * (0.62 + 0.55 * math.sin(math.pi * min(1.0, max(0.0, x)) ** 0.9))), 3)
    s.update(frames=frames, wav=f"work/{name}.wav", duration=dur, scale={"volume": 0.5})
    return s


# ---------------------------------------------------------------- the piano
LOOP_PN = 6.4
PN_NOTES = [(0.0, "C4", 82), (0.4, "E4", 76), (0.8, "G4", 78), (1.2, "C5", 86),
            (2.4, "C3", 80), (2.4, "G3", 72), (2.4, "E4", 74), (4.0, "G4", 76), (4.6, "E4", 70)]
PN_LEN = [0.08, 0.3, 0.55, 0.78, 0.95]
PN_PLUCK = [0.0, 0.25, 0.5, 0.75, 1.0]

def pn_shot(L, P, name, frames, dur):
    return dict(frames=frames, wav=f"work/{name}.wav", fps=30, ui="1920x1080", preset="STEINWAY GRAND",
                set={"length": L, "pluck": P}, scale={"volume": 0.5}, duration=dur,
                notes=[[t + 0.05, m(n), v, 1.4] for t, n, v in PN_NOTES], automation=[])


def finish_audio(names, loop, lead, outdir):
    """trim the lead, match every step's loudness, encode"""
    bufs = []
    for n in names:
        a = read(os.path.join(WORK, n + ".wav"))[:, int(lead * SR):]
        bufs.append(a)
    for k, (n, a) in enumerate(zip(names, bufs)):
        a = a[:, :int((loop + 2.0) * SR)]                       # the loop and two seconds of its tail
        a = np.vstack([a.mean(axis=0)] * 2)                     # mono: half the memory in a phone's browser
        a = a * 10 ** ((-20.0 - lufs(a[:, :int(loop * SR)])) / 20)
        pk = np.abs(a).max()
        if pk > 0.89: a *= 0.89 / pk
        w = os.path.join(WORK, n + "_t.wav")
        write(w, a[:1])
        to_m4a(w, os.path.join(outdir, f"a{k}.m4a"))


def build(inst):
    out = os.path.join(HERE, "assets", inst)
    if not IMG_ONLY: shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out, exist_ok=True)
    if inst in ("clarinet", "strings"):
        shot_fn, loop, crop = (cl_shot, LOOP_CL, TOUCH_CROP) if inst == "clarinet" else (st_shot, LOOP_ST, TOUCH_CROP)
        names = []
        if not IMG_ONLY:
            for k in range(N_AUDIO):
                u = k / (N_AUDIO - 1); n = f"{inst}_a{k}"
                run(TOUCH, shot_fn(u, n, "", bp.LEAD + loop + 2.5), n); names.append(n)
            finish_audio(names, loop, bp.LEAD, out)
        for k in range(N_IMG):
            u = k / (N_IMG - 1); n = f"{inst}_i{k}"
            run(TOUCH, shot_fn(u, n, f"work/{n}", bp.LEAD + 1.0), n)
            Image.open(os.path.join(WORK, n, "f00025.png")).convert("RGB").crop(crop).save(os.path.join(out, f"i{k}.jpg"), quality=86)
            shutil.rmtree(os.path.join(WORK, n))
        meta = dict(kind="row", loop=loop, nAudio=N_AUDIO, nImg=N_IMG)
    else:
        names = []
        for i, L in enumerate(PN_LEN):
            for j, P in enumerate(PN_PLUCK):
                n = f"piano_a{i}_{j}"
                run(PIANO, pn_shot(L, P, n, "", LOOP_PN + 2.5), n); names.append(n)
        finish_audio(names, LOOP_PN, 0.0, out)
        for i, L in enumerate(PN_LEN):
            for j, P in enumerate(PN_PLUCK):
                n = f"piano_i{i}_{j}"
                run(PIANO, pn_shot(L, P, n, f"work/{n}", 1.0), n)
                Image.open(os.path.join(WORK, n, "f00012.png")).convert("RGB").crop(PIANO_CROP).save(
                    os.path.join(out, f"i{i * len(PN_PLUCK) + j}.jpg"), quality=86)
                shutil.rmtree(os.path.join(WORK, n))
        meta = dict(kind="grid", loop=LOOP_PN, rows=len(PN_LEN), cols=len(PN_PLUCK))
    json.dump(meta, open(os.path.join(out, "meta.json"), "w"))
    print(inst, "done", len(os.listdir(out)), "files")


IMG_ONLY = "--img" in sys.argv          # pictures only: the recordings stay

if __name__ == "__main__":
    for inst in ([a for a in sys.argv[1:] if not a.startswith("--")] or ["clarinet", "piano", "strings"]): build(inst)
