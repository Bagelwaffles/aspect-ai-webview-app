#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import hashlib
import json
import math
import shutil
import subprocess
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont
import edge_tts

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist" / "collaboration"
WORK = ROOT / ".ams-collaboration-film"
OUT.mkdir(parents=True, exist_ok=True)
WORK.mkdir(parents=True, exist_ok=True)

W, H = 1280, 720
FPS = 30
VOICE = "en-US-JennyNeural"
VOICE_RATE = "+6%"
BG = (3, 7, 18)
PANEL = (10, 19, 39)
CYAN = (88, 225, 255)
CYAN_SOFT = (52, 151, 184)
VIOLET = (169, 113, 255)
GREEN = (81, 227, 166)
AMBER = (255, 188, 92)
RED = (255, 101, 123)
TEXT = (234, 242, 255)
MUTED = (148, 166, 196)
GRID = (19, 43, 69)

SCENES = [
    {
        "title": "THE HOOK",
        "headline": "WHAT IF YOUR EXPERTISE\nCOULD PLUG INTO THE SYSTEM?",
        "voiceover": "What if your expertise could plug into an AI-powered business operating system built to turn ideas into measurable action?",
        "kind": "hook",
    },
    {
        "title": "WHAT AMS IS",
        "headline": "COORDINATED AI + AUTOMATION",
        "voiceover": "Aspect Marketing Solutions is building a coordinated AI operating layer for business growth—connecting specialized agents, automation, content, sales support, research, commerce, and operator controls inside one system.",
        "kind": "categories",
    },
    {
        "title": "33 SPECIALIZED ROLES",
        "headline": "POWER = COORDINATION",
        "voiceover": "The catalog defines thirty-three specialized roles. But the power is not the number. It is the coordination. Every capability is labeled honestly, because AMS is built around proof, not theater.",
        "kind": "agents",
    },
    {
        "title": "THE REAL SYSTEM BEHIND IT",
        "headline": "REAL BUSINESS INFRASTRUCTURE",
        "voiceover": "Behind the interface are real business foundations: a Next.js platform on Vercel, Stripe payment and entitlement flows, n8n orchestration, persistent state and failure controls, protected routes, and a separate Android release track.",
        "kind": "architecture",
    },
    {
        "title": "WHAT A COLLABORATOR BRINGS",
        "headline": "BRING THE ADVANTAGE\nAMS SHOULD NOT PRETEND TO OWN",
        "voiceover": "A collaborator brings the part AMS should not pretend to own: deep niche expertise, an audience, a proven service, technology, distribution, creative skill, or a real customer problem.",
        "kind": "incoming",
    },
    {
        "title": "WHAT AMS BRINGS",
        "headline": "AMS BRINGS THE SYSTEM LAYER",
        "voiceover": "AMS brings the system layer—structured audits, content workflows, automation architecture, agent-oriented infrastructure, controlled integrations, and a pilot-first way to turn expertise into something repeatable.",
        "kind": "system",
    },
    {
        "title": "PILOT BEFORE SCALE",
        "headline": "DEFINE  →  OWN  →  PILOT  →  REVIEW",
        "voiceover": "We do not start with giant partnerships. We define one measurable outcome, assign ownership, run a small reversible pilot, and review the evidence before scaling.",
        "kind": "pilot",
    },
    {
        "title": "CONTROL + TRUST",
        "headline": "HUMAN APPROVAL\nWHERE RISK MATTERS",
        "voiceover": "Public actions, payments, account changes, and sensitive operations stay human-approved where risk matters. No shared passwords. No fake availability. No roadmap promises dressed up as production.",
        "kind": "trust",
    },
    {
        "title": "THE INVITATION",
        "headline": "FIND THE OVERLAP.\nTEST SOMETHING REAL.",
        "voiceover": "If you see an overlap between what you do and what AMS is building, explore the Collaboration Hub, complete the AI-ready brief, and let us test something real.",
        "kind": "cta",
    },
]


def run(args: list[str]) -> None:
    print("+", " ".join(map(str, args)), flush=True)
    subprocess.run(args, check=True)


def probe_duration(path: Path) -> float:
    p = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path)
    ], check=True, capture_output=True, text=True)
    return float(p.stdout.strip())


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


def rr(draw: ImageDraw.ImageDraw, box, radius=18, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def draw_grid(img: Image.Image) -> None:
    d = ImageDraw.Draw(img)
    for x in range(0, W, 64):
        d.line((x, 0, x, H), fill=GRID, width=1)
    for y in range(0, H, 64):
        d.line((0, y, W, y), fill=GRID, width=1)
    # horizon glow
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.rectangle((0, H//2 - 2, W, H//2 + 2), fill=(*CYAN, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(20))
    img.alpha_composite(glow)


def draw_header(img: Image.Image, idx: int, scene: dict) -> None:
    d = ImageDraw.Draw(img)
    d.text((48, 34), "ASPECT MARKETING SOLUTIONS  //  COLLABORATION SYSTEM", font=font(17, True), fill=CYAN)
    d.text((48, 63), f"SCENE {idx:02d}  //  {scene['title']}", font=font(13, True), fill=MUTED)
    d.line((48, 92, W - 48, 92), fill=(31, 65, 96), width=1)


def centered_text(draw, text, y, size, fill=TEXT, bold=True, max_width=1120, spacing=6):
    f = font(size, bold)
    lines = []
    for para in text.split("\n"):
        words = para.split()
        current = ""
        for w in words:
            trial = (current + " " + w).strip()
            if draw.textlength(trial, font=f) <= max_width:
                current = trial
            else:
                if current:
                    lines.append(current)
                current = w
        if current:
            lines.append(current)
    h = sum(draw.textbbox((0,0), line, font=f)[3] for line in lines) + spacing * (len(lines)-1)
    yy = y - h/2
    for line in lines:
        bbox = draw.textbbox((0,0), line, font=f)
        w = bbox[2] - bbox[0]
        draw.text(((W-w)/2, yy), line, font=f, fill=fill)
        yy += (bbox[3]-bbox[1]) + spacing


def node(draw, x, y, label, color=CYAN, r=44, small=False):
    draw.ellipse((x-r, y-r, x+r, y+r), fill=(7, 18, 38), outline=color, width=2)
    draw.ellipse((x-r+8, y-r+8, x+r-8, y+r-8), outline=(*color[:3],), width=1)
    f = font(12 if small else 14, True)
    wrapped = textwrap.wrap(label, width=13 if small else 16)
    yy = y - len(wrapped)*8
    for line in wrapped:
        bbox = draw.textbbox((0,0), line, font=f)
        draw.text((x-(bbox[2]-bbox[0])/2, yy), line, font=f, fill=TEXT)
        yy += 17


def draw_hook(img):
    d = ImageDraw.Draw(img)
    cx, cy = W//2, 410
    satellites = [
        (205, 260, "STRATEGY"), (1050, 250, "SALES"), (180, 555, "CONTENT"),
        (1080, 555, "AUTOMATION"), (420, 595, "RESEARCH"), (860, 600, "COMMERCE"),
    ]
    for x, y, label in satellites:
        d.line((x, y, cx, cy), fill=CYAN_SOFT, width=2)
        node(d, x, y, label, CYAN_SOFT, r=38, small=True)
    # central glow
    glow = Image.new("RGBA", img.size, (0,0,0,0)); gd = ImageDraw.Draw(glow)
    gd.ellipse((cx-120, cy-120, cx+120, cy+120), fill=(*CYAN, 55))
    glow = glow.filter(ImageFilter.GaussianBlur(35)); img.alpha_composite(glow)
    d = ImageDraw.Draw(img)
    node(d, cx, cy, "AMS CORE", CYAN, r=78)
    centered_text(d, "WHAT IF YOUR EXPERTISE\nCOULD PLUG INTO THE SYSTEM?", 170, 39)
    d.text((W//2-150, 505), "IDEAS  →  SYSTEM  →  ACTION", font=font(17, True), fill=VIOLET)


def draw_categories(img):
    d = ImageDraw.Draw(img)
    cx, cy = W//2, 415
    cats = ["MARKETING","SALES","AUTOMATION","CONTENT","COMMERCE","OPERATIONS","RESEARCH","CREATOR","PLATFORM"]
    radius = 215
    for i, label in enumerate(cats):
        a = math.radians(-90 + i * 360/len(cats))
        x = cx + int(math.cos(a)*radius)
        y = cy + int(math.sin(a)*radius)
        d.line((cx, cy, x, y), fill=(30, 92, 120), width=2)
        node(d, x, y, label, CYAN if i%2==0 else VIOLET, r=37, small=True)
    node(d, cx, cy, "AMS", GREEN, r=66)
    centered_text(d, "COORDINATED AI + AUTOMATION", 150, 40)


def draw_agents(img):
    d = ImageDraw.Draw(img)
    centered_text(d, "33 SPECIALIZED ROLES", 145, 43)
    cols, rows = 11, 3
    x0, y0, cw, ch = 70, 260, 102, 84
    statuses = [("BETA", GREEN), ("SETUP", AMBER), ("PLANNED", VIOLET), ("BLOCKED", RED)]
    for r in range(rows):
        for c in range(cols):
            n = r*cols+c+1
            x = x0+c*cw; y = y0+r*ch
            rr(d, (x, y, x+86, y+65), 10, fill=(8,18,37), outline=(33,70,102), width=1)
            d.text((x+10,y+9), f"A{n:02d}", font=font(13, True), fill=TEXT)
            label, color = statuses[(n*7)%len(statuses)]
            d.text((x+10,y+38), label, font=font(9, True), fill=color)
    rr(d, (315, 560, 965, 635), 18, fill=(7,15,31), outline=CYAN, width=2)
    centered_text(d, "THE POWER IS NOT THE NUMBER.  IT IS THE COORDINATION.", 596, 22, fill=TEXT, max_width=610)
    d.text((500, 652), "PROOF  >  THEATER", font=font(17, True), fill=CYAN)


def box(draw, x, y, w, h, title, sub="", color=CYAN):
    rr(draw, (x,y,x+w,y+h), 16, fill=(8,18,37), outline=color, width=2)
    draw.text((x+18,y+16), title, font=font(17, True), fill=TEXT)
    if sub:
        for i, line in enumerate(textwrap.wrap(sub, width=max(16, int(w/11)))):
            draw.text((x+18,y+44+i*18), line, font=font(11), fill=MUTED)


def draw_architecture(img):
    d = ImageDraw.Draw(img)
    centered_text(d, "REAL BUSINESS INFRASTRUCTURE", 140, 39)
    items = [
        (70,250,260,120,"NEXT.JS / VERCEL","Web platform + protected server routes",CYAN),
        (370,250,230,120,"STRIPE","Payments + entitlement flows",GREEN),
        (640,250,230,120,"n8n CLOUD","Workflow orchestration",VIOLET),
        (910,250,300,120,"STATE + CONTROLS","Persistence • limits • idempotency • failures",AMBER),
    ]
    for item in items: box(d,*item)
    for (x1,x2) in [(330,370),(600,640),(870,910)]:
        d.line((x1,310,x2,310), fill=CYAN_SOFT, width=3)
        d.polygon([(x2-8,304),(x2,310),(x2-8,316)], fill=CYAN_SOFT)
    box(d, 200, 475, 360, 105, "PROTECTED ACCESS", "Authenticated product paths + human approval gates", CYAN)
    box(d, 720, 475, 360, 105, "ANDROID RELEASE TRACK", "Separate controlled mobile distribution lane", AMBER)
    d.line((560,528,720,528), fill=(35,83,118), width=2)
    d.text((472,610), "PUBLIC ARCHITECTURE — NO SECRETS EXPOSED", font=font(15, True), fill=MUTED)


def draw_incoming(img):
    d = ImageDraw.Draw(img)
    centered_text(d, "BRING THE ADVANTAGE\nAMS SHOULD NOT PRETEND TO OWN", 150, 37)
    labels = ["NICHE EXPERTISE","AUDIENCE","PROVEN SERVICE","TECHNOLOGY","DISTRIBUTION","CUSTOMER PROBLEM"]
    ys = [255,315,375,435,495,555]
    for i,(label,y) in enumerate(zip(labels,ys)):
        color = CYAN if i%2==0 else VIOLET
        rr(d,(70,y-22,345,y+22),12,fill=(8,18,37),outline=color,width=2)
        d.text((90,y-9),label,font=font(13,True),fill=TEXT)
        d.line((345,y,735,410),fill=color,width=2)
    node(d, 820, 410, "COLLABORATOR", GREEN, r=72)
    d.line((892,410,1120,410), fill=CYAN, width=4)
    d.polygon([(1110,400),(1125,410),(1110,420)],fill=CYAN)
    rr(d,(1000,360,1210,460),18,fill=(8,18,37),outline=CYAN,width=2)
    d.text((1045,386),"REAL",font=font(17,True),fill=TEXT)
    d.text((1025,416),"ADVANTAGE",font=font(17,True),fill=CYAN)


def draw_system(img):
    d = ImageDraw.Draw(img)
    centered_text(d, "AMS BRINGS THE SYSTEM LAYER", 145, 40)
    modules = ["AUDITS","CONTENT","AUTOMATION","AGENT INFRA","INTEGRATIONS"]
    for i,label in enumerate(modules):
        x = 95 + i*220
        box(d,x,270,180,100,label,"structured + controlled",CYAN if i%2==0 else VIOLET)
        d.line((x+90,370,W//2,505),fill=(38,91,122),width=2)
    rr(d,(350,480,930,600),24,fill=(7,18,37),outline=GREEN,width=3)
    d.text((430,510),"REPEATABLE OFFER",font=font(27,True),fill=TEXT)
    d.text((430,550),"MEASURABLE WORKFLOW",font=font(24,True),fill=GREEN)
    d.text((469,632),"EXPERTISE  ×  SYSTEM",font=font(17,True),fill=VIOLET)


def draw_pilot(img):
    d = ImageDraw.Draw(img)
    centered_text(d, "DEFINE  →  OWN  →  PILOT  →  REVIEW", 155, 37)
    steps = [
        ("01","DEFINE","ONE MEASURABLE OUTCOME"),
        ("02","OWN","CLEAR RESPONSIBILITIES"),
        ("03","PILOT","SMALL + REVERSIBLE"),
        ("04","REVIEW","EVIDENCE BEFORE SCALE"),
    ]
    for i,(num,title,sub) in enumerate(steps):
        x=85+i*295
        color=[CYAN,VIOLET,GREEN,AMBER][i]
        rr(d,(x,295,x+235,485),22,fill=(8,18,37),outline=color,width=2)
        d.text((x+22,318),num,font=font(20,True),fill=color)
        d.text((x+22,360),title,font=font(26,True),fill=TEXT)
        for j,line in enumerate(textwrap.wrap(sub,width=19)):
            d.text((x+22,408+j*22),line,font=font(12,True),fill=MUTED)
        if i<3:
            d.line((x+235,390,x+285,390),fill=CYAN_SOFT,width=3)
            d.polygon([(x+275,383),(x+286,390),(x+275,397)],fill=CYAN_SOFT)
    rr(d,(440,560,840,630),18,fill=(7,15,31),outline=(56,78,105),width=2)
    d.text((511,583),"SCALE?  ONLY AFTER PROOF",font=font(18,True),fill=TEXT)


def draw_trust(img):
    d = ImageDraw.Draw(img)
    centered_text(d, "HUMAN APPROVAL\nWHERE RISK MATTERS", 150, 39)
    risks=[("PUBLISH",RED),("PAYMENT",AMBER),("ACCOUNT CHANGE",VIOLET),("SENSITIVE ACTION",RED)]
    for i,(label,color) in enumerate(risks):
        x=75+i*285
        rr(d,(x,300,x+220,370),16,fill=(8,18,37),outline=color,width=2)
        bbox=d.textbbox((0,0),label,font=font(14,True)); tw=bbox[2]-bbox[0]
        d.text((x+110-tw/2,325),label,font=font(14,True),fill=TEXT)
        d.line((x+110,370,x+110,438),fill=color,width=3)
    rr(d,(190,438,1090,520),20,fill=(6,16,33),outline=CYAN,width=3)
    d.text((420,466),"HUMAN APPROVAL GATE",font=font(24,True),fill=CYAN)
    d.line((640,520,640,585),fill=GREEN,width=4)
    d.polygon([(630,575),(640,590),(650,575)],fill=GREEN)
    rr(d,(465,585,815,640),16,fill=(7,22,34),outline=GREEN,width=2)
    d.text((522,603),"AUTHORIZED PATH",font=font(17,True),fill=GREEN)
    d.text((370,662),"NO SHARED PASSWORDS  •  NO FAKE AVAILABILITY",font=font(14,True),fill=MUTED)


def draw_cta(img):
    d = ImageDraw.Draw(img)
    glow = Image.new("RGBA", img.size, (0,0,0,0)); gd=ImageDraw.Draw(glow)
    gd.ellipse((360,180,920,740),fill=(*CYAN,45)); glow=glow.filter(ImageFilter.GaussianBlur(65)); img.alpha_composite(glow)
    d=ImageDraw.Draw(img)
    centered_text(d,"FIND THE OVERLAP.\nTEST SOMETHING REAL.",260,49)
    rr(d,(245,420,1035,530),24,fill=(5,15,31),outline=CYAN,width=3)
    centered_text(d,"aspectmarketingsolutions.app/collaborate",474,26,fill=CYAN,max_width=760)
    d.text((462,565),"HUMAN BRIEF  +  AI-READY PROFILE",font=font(15,True),fill=MUTED)
    d.text((476,620),"BUILD TOGETHER  •  PROVE IT  •  SCALE IT",font=font(15,True),fill=VIOLET)


DRAWERS = {
    "hook": draw_hook,
    "categories": draw_categories,
    "agents": draw_agents,
    "architecture": draw_architecture,
    "incoming": draw_incoming,
    "system": draw_system,
    "pilot": draw_pilot,
    "trust": draw_trust,
    "cta": draw_cta,
}


def make_scene_image(idx: int, scene: dict, path: Path) -> None:
    img = Image.new("RGBA", (W,H), (*BG,255))
    # soft vertical gradient
    grad = Image.new("RGBA", (W,H), (0,0,0,0)); gd=ImageDraw.Draw(grad)
    for y in range(H):
        a = int(50*(1-y/H))
        gd.line((0,y,W,y), fill=(12,30,58,a))
    img.alpha_composite(grad)
    draw_grid(img)
    draw_header(img, idx, scene)
    DRAWERS[scene["kind"]](img)
    # footer microtype
    d=ImageDraw.Draw(img)
    d.text((48,H-30),"AMS // PROOF OVER THEATER // PILOT BEFORE SCALE",font=font(10,True),fill=(83,103,132))
    img.convert("RGB").save(path, quality=95)


async def synthesize_all() -> list[Path]:
    audio_paths=[]
    for idx, scene in enumerate(SCENES,1):
        out=WORK/f"voice_{idx:02d}.mp3"
        print(f"TTS scene {idx}: {scene['title']}", flush=True)
        communicate=edge_tts.Communicate(scene["voiceover"], VOICE, rate=VOICE_RATE)
        await communicate.save(str(out))
        audio_paths.append(out)
    return audio_paths


def ts(sec: float, vtt=False) -> str:
    ms=int(round(sec*1000)); h=ms//3600000; ms%=3600000; m=ms//60000; ms%=60000; s=ms//1000; ms%=1000
    sep='.' if vtt else ','
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"


def render() -> None:
    audio_paths=asyncio.run(synthesize_all())
    durations=[]
    scene_videos=[]
    for idx,(scene,audio) in enumerate(zip(SCENES,audio_paths),1):
        audio_d=probe_duration(audio)
        # Tiny deliberate transition tolerance only. No fixed half-second scene lag.
        duration=audio_d+0.10
        durations.append(duration)
        still=WORK/f"scene_{idx:02d}.jpg"
        make_scene_image(idx,scene,still)
        vid=WORK/f"scene_{idx:02d}.mp4"
        fade_out=max(0.0,duration-0.16)
        vf=(
            "scale=1344:756," 
            "zoompan=z='min(pzoom+0.00010,1.025)':"
            "x='iw/2-(iw/zoom/2)+6*sin(on/90)':"
            "y='ih/2-(ih/zoom/2)+4*cos(on/110)':d=1:s=1280x720:fps=30,"
            f"fade=t=in:st=0:d=0.12,fade=t=out:st={fade_out:.3f}:d=0.16,format=yuv420p"
        )
        run([
            "ffmpeg","-y","-loglevel","error","-loop","1","-framerate",str(FPS),"-i",str(still),"-i",str(audio),
            "-vf",vf,"-af","apad=pad_dur=0.10","-t",f"{duration:.3f}",
            "-c:v","libx264","-preset","veryfast","-crf","20","-pix_fmt","yuv420p","-r",str(FPS),
            "-c:a","aac","-b:a","160k","-ar","48000","-ac","2",str(vid)
        ])
        scene_videos.append(vid)

    concat_file=WORK/"concat.txt"
    concat_file.write_text("\n".join(f"file '{p.as_posix()}'" for p in scene_videos)+"\n",encoding="utf-8")
    rough=WORK/"rough.mp4"
    run(["ffmpeg","-y","-loglevel","error","-f","concat","-safe","0","-i",str(concat_file),"-c","copy",str(rough)])
    total=probe_duration(rough)

    final=OUT/"ams-collaboration-system-film.mp4"
    # Atmospheric bed: low synth + pink texture. Narration remains dominant.
    bed=(
        f"sine=frequency=55:sample_rate=48000:duration={total:.3f},volume=0.022,lowpass=f=170[low];"
        f"anoisesrc=color=pink:sample_rate=48000:duration={total:.3f}:amplitude=0.004,lowpass=f=1200[noise];"
        "[low][noise]amix=inputs=2:weights='1 0.45':normalize=0[bed];"
        "[0:a][bed]amix=inputs=2:weights='1 0.6':normalize=0[aout]"
    )
    run([
        "ffmpeg","-y","-loglevel","error","-i",str(rough),"-filter_complex",bed,"-map","0:v:0","-map","[aout]",
        "-c:v","copy","-c:a","aac","-b:a","160k","-movflags","+faststart","-shortest",str(final)
    ])

    # Captions use actual rendered scene durations.
    vtt=["WEBVTT",""]
    srt=[]
    cursor=0.0
    exact=[]
    for i,(scene,duration) in enumerate(zip(SCENES,durations),1):
        start=cursor; end=cursor+duration
        vtt += [f"{ts(start,True)} --> {ts(end,True)}",scene["voiceover"],""]
        srt += [str(i),f"{ts(start)} --> {ts(end)}",scene["voiceover"],""]
        exact.append({**scene,"start":round(start,3),"duration":round(duration,3),"end":round(end,3)})
        cursor=end
    (OUT/"ams-collaboration-system-film.vtt").write_text("\n".join(vtt),encoding="utf-8")
    (OUT/"ams-collaboration-system-film.srt").write_text("\n".join(srt),encoding="utf-8")
    (OUT/"ams-collaboration-system-film-script.txt").write_text("\n\n".join(s["voiceover"] for s in SCENES),encoding="utf-8")

    # Poster: clean CTA frame, web optimized.
    poster=WORK/"poster.png"
    make_scene_image(9,SCENES[-1],poster)
    Image.open(poster).save(OUT/"ams-collaboration-poster.webp","WEBP",quality=88,method=6)

    digest=hashlib.sha256(final.read_bytes()).hexdigest()
    manifest={
        "title":"AMS Collaboration System — Build Together. Prove It. Scale It.",
        "voice":VOICE,
        "voice_rate":VOICE_RATE,
        "resolution":"1280x720",
        "fps":FPS,
        "duration_seconds":round(probe_duration(final),3),
        "sha256":digest,
        "timing_method":"per-scene neural narration duration + 0.10 second transition tolerance; no cumulative fixed hold",
        "scenes":exact,
    }
    (OUT/"ams-collaboration-system-film-manifest.json").write_text(json.dumps(manifest,indent=2),encoding="utf-8")

    print(json.dumps(manifest,indent=2), flush=True)


if __name__ == "__main__":
    render()
