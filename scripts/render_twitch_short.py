#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from pathlib import Path

def run(args: list[str]) -> None:
    subprocess.run(args, check=True)

def escape_ass(text: str) -> str:
    return (
        text.replace("\\", r"\\")
        .replace("{", r"\{")
        .replace("}", r"\}")
        .replace("\n", r"\N")
    )

def write_ass(path: Path, hook: str, caption: str) -> None:
    hook = escape_ass(hook[:180])
    caption = escape_ass(caption[:500])
    content = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hook,DejaVu Sans,72,&H00FFFFFF,&H00FFFFFF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,5,0,8,70,70,150,1
Style: Caption,DejaVu Sans,46,&H00FFFFFF,&H00FFFFFF,&H00000000,&HA0000000,-1,0,0,0,100,100,0,0,1,4,0,2,80,80,170,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,9:59:59.00,Hook,,0,0,0,,{hook}
Dialogue: 0,0:00:00.00,9:59:59.00,Caption,,0,0,0,,{caption}
"""
    path.write_text(content, encoding="utf-8")

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--metadata", required=True)
    args = parser.parse_args()

    metadata = json.loads(Path(args.metadata).read_text(encoding="utf-8"))
    hook = str(metadata.get("hook") or "Gaming highlight")
    caption = str(metadata.get("caption") or "")

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="ams-short-") as tmp:
        ass = Path(tmp) / "overlay.ass"
        write_ass(ass, hook, caption)

        # Preserve the full gameplay frame in the foreground and use a blurred,
        # cropped background to fill 9:16. This avoids hard-cropping critical HUD/gameplay.
        vf = (
            "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,"
            "crop=1080:1920,gblur=sigma=28[bg];"
            "[0:v]scale=1080:-2:force_original_aspect_ratio=decrease[fg];"
            "[bg][fg]overlay=(W-w)/2:(H-h)/2,"
            f"ass={ass.as_posix()}:fontsdir=/usr/share/fonts/truetype/dejavu,"
            "format=yuv420p[v]"
        )
        run([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", args.input,
            "-filter_complex", vf,
            "-map", "[v]", "-map", "0:a?",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
            "-c:a", "aac", "-b:a", "160k",
            "-movflags", "+faststart",
            "-shortest",
            str(output),
        ])
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
