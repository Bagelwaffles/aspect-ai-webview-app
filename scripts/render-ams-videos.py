#!/usr/bin/env python3
"""Original text-led AMS video explainers, no customer data or borrowed footage."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import math, subprocess, sys

W,H,FPS=960,540,12
OUT=Path(sys.argv[1] if len(sys.argv)>1 else "public/videos")
OUT.mkdir(parents=True,exist_ok=True)
REG="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONTS={}
def ft(size,bold=False):
    k=(size,bold)
    if k not in FONTS:FONTS[k]=ImageFont.truetype(BOLD if bold else REG,size)
    return FONTS[k]

FILMS=[
 ("ams-introduction",21,"ASPECT MARKETING SOLUTIONS","INTRODUCTION",[
  ("Your marketing. In motion.","AI agents for real business tasks",["Content","Lead magnets","Follow-up"]),
  ("Create. Connect. Grow.","Organize ideas into practical marketing work",["A brief","An agent","A useful draft"]),
  ("Human control, by design.","You review consequential actions first",["Plan","Create","Review"]),
  ("Choose your next move.","Explore AMS agents and the $49 Marketing Audit",["Explore agents","Check availability","Decide"])],
  "OVERVIEW / ILLUSTRATIVE WORKFLOWS - NO CUSTOMER DATA"),
 ("ams-content-agent",15,"CONTENT AGENT","FEATURED AGENT / 01",[
  ("Start with a brief.","Describe your business, audience and goal",["Business","Audience","Goal"]),
  ("Get a useful first draft.","Draft email, product and social copy",["Email","Social post","Product copy"]),
  ("Make it yours.","Edit and approve before publishing",["Review","Refine","Approve"])],
  "ILLUSTRATIVE WORKFLOW / NOT A LIVE PRODUCT RECORDING"),
 ("ams-lead-magnet-agent",15,"LEAD MAGNET AGENT","FEATURED AGENT / 02",[
  ("Find a customer problem.","Choose one question worth answering",["Question","Audience","Promise"]),
  ("Build a helpful offer.","Outline a guide, checklist or resource",["Guide","Checklist","Resource"]),
  ("Review your next step.","Refine the concept before your campaign",["Edit","Review","Use"])],
  "ILLUSTRATIVE WORKFLOW / NOT A LIVE PRODUCT RECORDING"),
 ("ams-nurture-agent",15,"NURTURE AGENT","FEATURED AGENT / 03",[
  ("Plan the follow-up.","Define the audience and next step",["Audience","Timing","Goal"]),
  ("Draft a sequence.","Prepare useful, timely message ideas",["Welcome","Follow up","Reconnect"]),
  ("Keep approval in hand.","Review messages before any sends",["Review","Approve","Send later"])],
  "ILLUSTRATIVE WORKFLOW / NO AUTOMATIC EMAIL SENDS")
]

def background():
    im=Image.new("RGB",(W,H),"#070d1a")
    d=ImageDraw.Draw(im)
    for y in range(H):
        k=y/H
        d.line([(0,y),(W,y)],fill=(int(6+4*k),int(13+8*k),int(27+16*k)))
    for x in range(40,W,54):d.line([(x,0),(x,H)],fill="#101d32")
    for y in range(16,H,54):d.line([(0,y),(W,y)],fill="#101d32")
    return im
BG=background()

def frame(film,t):
    name,length,brand,label,chapters,foot=film
    im=BG.copy();d=ImageDraw.Draw(im,"RGBA")
    n=len(chapters); span=length/n
    idx=min(n-1,int(t/span)); local=t-idx*span
    alpha=max(.05,min(1,local/.45,(span-local)/.45))
    d.rounded_rectangle((42,30,144,64),radius=10,fill=(23,105,233,220))
    d.text((58,37),"AMS",font=ft(21,True),fill="white")
    d.text((161,40),label,font=ft(14,True),fill="#9dbbff")
    d.line([(42,79),(918,79)],fill="#244167",width=2)
    d.text((45,99),brand,font=ft(23,True),fill="#d7e6ff")
    pts=[(697,168),(822,141),(891,235),(772,291),(655,254)]
    for k,(x,y) in enumerate(pts):
        xx=x+math.sin(t*.4+k)*3; yy=y+math.cos(t*.55+k)*3
        if k: d.line([pts[k-1],(xx,yy)],fill=(63,122,238,110),width=2)
        d.ellipse((xx-6,yy-6,xx+6,yy+6),fill=(91,167,255,210))
    d.ellipse((741,174,838,271),outline=(136,90,255,100),width=2)
    title,description,pills=chapters[idx]
    heading=39 if len(title)<=26 else 34
    x=44+13*max(0,1-local/.6)
    d.text((x,179),title,font=ft(heading,True),fill=(240,247,255,int(255*alpha)))
    d.text((45,237),description,font=ft(18),fill=(173,202,239,int(235*alpha)))
    for k,word in enumerate(pills):
        xx=46+k*300; yy=335+max(0,1-local/.7)*(18+10*k)
        d.rounded_rectangle((xx,yy,xx+276,yy+96),radius=17,fill=(17,33,66,int(230*alpha)),outline=(69,123,223,int(140*alpha)),width=2)
        d.rounded_rectangle((xx+16,yy+19,xx+38,yy+41),radius=5,fill=(57+25*k,132,253,int(235*alpha)))
        d.text((xx+48,yy+18),word,font=ft(16,True),fill=(239,247,255,int(255*alpha)))
        d.line([(xx+18,yy+57),(xx+204,yy+57)],fill=(65,104,158,int(210*alpha)),width=3)
        d.line([(xx+18,yy+71),(xx+145,yy+71)],fill=(48,81,134,int(170*alpha)),width=3)
    d.rounded_rectangle((44,475,916,481),radius=3,fill=(40,60,98,255))
    d.rounded_rectangle((44,475,44+max(6,int(872*t/length)),481),radius=3,fill=(82,168,255,255))
    d.text((44,492),foot,font=ft(11),fill="#a1b9d7")
    d.text((866,491),f"{idx+1:02d} / {n:02d}",font=ft(13,True),fill="#98baff")
    return im

def stamp(t):
    return f"{int(t//3600):02}:{int(t%3600//60):02}:{t%60:06.3f}"

def build(film):
    name,length,brand,label,chapters,foot=film
    out=OUT/(name+".mp4")
    cmd=["ffmpeg","-hide_banner","-loglevel","error","-y","-f","rawvideo","-pix_fmt","rgb24","-s",f"{W}x{H}","-r",str(FPS),"-i","pipe:0",
         "-f","lavfi","-i","anullsrc=r=44100:cl=stereo","-map","0:v:0","-map","1:a:0","-c:v","libx264","-preset","veryfast","-crf","28",
         "-pix_fmt","yuv420p","-r",str(FPS),"-c:a","aac","-b:a","24k","-t",str(length),"-movflags","+faststart","-shortest",str(out)]
    p=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    try:
        for i in range(length*FPS):p.stdin.write(frame(film,i/FPS).tobytes())
    except BrokenPipeError:pass
    finally:
        try:p.stdin.close()
        except BrokenPipeError:pass
    if p.wait():raise RuntimeError("Video encoding failed: "+name)
    frame(film,.9).save(OUT/(name+"-poster.jpg"),quality=86,optimize=True)
    text="WEBVTT\n\n"; span=length/len(chapters)
    for i,(heading,description,pills) in enumerate(chapters):
        text+=f"{stamp(i*span)} --> {stamp((i+1)*span)}\n{heading} {description}. {', '.join(pills)}.\n\n"
    (OUT/(name+".vtt")).write_text(text,encoding="utf-8")
    print(f"{name}: {out.stat().st_size} bytes",flush=True)

if __name__=="__main__":
    for film in FILMS: build(film)
