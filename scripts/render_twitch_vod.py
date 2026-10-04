"""Brand a complete, owner-authorized VOD without trimming its source footage."""
import argparse
import json
import pathlib
import subprocess
import tempfile
import textwrap

INTRO_SECONDS = 5
OUTRO_SECONDS = 7


def probe(path):
    return json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)
    ]))


def render_thumbnail(source, output, streamer, title, date, width=1280, height=720):
    """Create a branded 16:9 YouTube thumbnail from genuine stream footage."""
    if not streamer.strip() or len(streamer) > 80:
        raise ValueError("Streamer name required")
    info = probe(source)
    duration = float(info["format"]["duration"])
    if duration <= 0:
        raise ValueError("VOD duration required")
    seek = min(max(duration * 0.18, 2.0), max(2.0, duration - 2.0))
    with tempfile.TemporaryDirectory(prefix="ams-vod-thumb-") as temp:
        root = pathlib.Path(temp)
        texts = {
            "streamer": streamer,
            "title": "\n".join(textwrap.wrap(title[:120], width=34)[:2]),
            "date": date,
            "credit": "CREATED BY AMS",
            "label": "FULL STREAM",
        }
        for key, value in texts.items():
            (root / f"{key}.txt").write_text(value, encoding="utf-8")
        font = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
        bold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        logo = pathlib.Path(__file__).resolve().parent / "assets" / "smokybanana03.jpg"
        if not logo.is_file():
            raise ValueError("SmokyBanana03 brand asset missing")

        def draw(key, size, y, color="white", weight=False):
            return (f"drawtext=fontfile={bold if weight else font}:textfile={root / (key + '.txt')}"
                    f":expansion=none:fontsize={size}:fontcolor={color}:x=54:y={y}:line_spacing=10")

        graph = (
            f"[0:v]scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},setsar=1,"
            "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.18:t=fill,"
            "drawbox=x=0:y=ih*0.56:w=iw:h=ih*0.44:color=0x08090f@0.90:t=fill,"
            "drawbox=x=54:y=ih*0.60:w=145:h=6:color=0xffd166:t=fill,"
            + ",".join([
                draw("label", 26, "h*0.635", "0xc4a0ed", True),
                draw("title", 48, "h*0.69", "white", True),
                draw("streamer", 28, "h*0.865", "0xffd166", True),
                draw("date", 22, "h*0.915", "0xcfc8dc"),
                draw("credit", 18, "h*0.952", "0xb2adbf"),
            ])
            + "[bg];[1:v]scale=164:164,setsar=1[logo];"
            + "[bg][logo]overlay=x=W-w-46:y=42[v]"
        )
        subprocess.run([
            "ffmpeg", "-y", "-v", "error", "-ss", f"{seek:.3f}", "-i", str(source),
            "-loop", "1", "-i", str(logo), "-filter_complex", graph,
            "-map", "[v]", "-frames:v", "1", "-q:v", "3", str(output),
        ], check=True)
    if not pathlib.Path(output).is_file() or pathlib.Path(output).stat().st_size < 1024:
        raise ValueError("Thumbnail render failed")
    return {"width": width, "height": height, "bytes": pathlib.Path(output).stat().st_size}


def render(source, output, streamer, title, date, width=1920, height=1080, consume_source=False):
    if not streamer.strip() or len(streamer) > 80:
        raise ValueError("Streamer name required")
    info = probe(source)
    duration = float(info["format"]["duration"])
    if duration <= 0 or duration > 12 * 3600 - INTRO_SECONDS - OUTRO_SECONDS:
        raise ValueError("VOD exceeds the full-length upload duration limit")
    with tempfile.TemporaryDirectory(prefix="ams-vod-") as temp:
        root = pathlib.Path(temp)
        texts = {
            "streamer": streamer,
            "title": "\n".join(textwrap.wrap(title[:140], width=42)[:2]),
            "date": date,
            "credit": "Created by Aspect Marketing Solutions (AMS)",
            "follow": f"twitch.tv/{streamer.lower()}",
            "channel": "@SmokyBanana03PS5FPS",
            "thanks": "THANKS FOR WATCHING",
            "intro_label": "THE FULL STREAM",
            "outro_label": "STAY IN THE GAME",
            "subscribe": "SUBSCRIBE  /  FOLLOW  /  SEE YOU NEXT STREAM",
        }
        for key, value in texts.items():
            (root / f"{key}.txt").write_text(value, encoding="utf-8")
        font = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
        bold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        logo = pathlib.Path(__file__).resolve().parent / "assets" / "smokybanana03.jpg"
        if not logo.is_file():
            raise ValueError("SmokyBanana03 brand asset missing")
        scale = width / 1920

        def text(key, size, y, color="white", weight=False):
            # Untrusted titles are files with expansion disabled, never filter code.
            return (f"drawtext=fontfile={bold if weight else font}:textfile={root / (key + '.txt')}"
                    f":expansion=none:fontsize={round(size * scale)}:fontcolor={color}"
                    f":x=w*0.40:y=h*{y}:line_spacing={round(12 * scale)}")

        def card(seconds, outro, target):
            lines = [text("outro_label" if outro else "intro_label", 22, 0.20, "0xc4a0ed"),
                     text("thanks" if outro else "streamer", 52 if outro else 68, 0.28, "0xffd166", True),
                     text("streamer" if outro else "title", 38 if outro else 32, 0.40, "white", outro),
                     text("follow" if outro else "date", 28, 0.55, "0xcfc8dc"),
                     text("channel" if outro else "follow", 24, 0.62, "0xcfc8dc"),
                     text("subscribe", 20, 0.75, "0xffd166"),
                     text("credit", 20, 0.89, "0xb2adbf")]
            filters = [
                "drawbox=x=0:y=0:w=iw:h=ih:color=0x08090f:t=fill",
                "drawbox=x=iw*0.04:y=ih*0.08:w=iw*0.29:h=ih*0.74:color=0x140d24:t=fill",
                "drawbox=x=iw*0.04:y=ih*0.08:w=iw*0.29:h=ih*0.74:color=0x4f2b72:t=2",
                "drawbox=x=iw*0.04:y=ih*0.08:w=iw*0.04:h=ih*0.006:color=0xffd166:t=fill",
                "drawbox=x=iw*0.40:y=ih*0.70:w=iw*0.48:h=ih*0.002:color=0x7850a2:t=fill",
                "drawbox=x=iw*0.04:y=ih*0.86:w=iw*0.92:h=ih*0.002:color=0x342b43:t=fill",
            ]
            logo_size = round(width * 0.25 / 2) * 2
            graph = (f"[0:v]{','.join(filters)}[bg];[1:v]scale={logo_size}:{logo_size},setsar=1[logo];"
                     f"[bg][logo]overlay=x=W*0.06:y=H*0.21+{round(20 * scale)}*exp(-t*2):shortest=1,"
                     + ",".join(lines)
                     + f",fade=t=in:st=0:d=0.35,fade=t=out:st={seconds - 0.4}:d=0.4[v]")
            subprocess.run([
                "ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"color=c=black:s={width}x{height}:r=30:d={seconds}",
                "-loop", "1", "-framerate", "30", "-i", str(logo),
                "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-filter_complex", graph,
                "-map", "[v]", "-map", "2:a", "-t", str(seconds),
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-ar", "48000", "-ac", "2", "-video_track_timescale", "15360", str(target),
            ], check=True)

        card(INTRO_SECONDS, False, root / "intro.mp4")
        card(OUTRO_SECONDS, True, root / "outro.mp4")
        args = ["ffmpeg", "-y", "-v", "error", "-i", str(source)]
        has_audio = any(s["codec_type"] == "audio" for s in info["streams"])
        if not has_audio:
            args += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
        args += ["-map", "0:v:0", "-map", "0:a:0" if has_audio else "1:a:0", "-vf",
                 f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30",
                 "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
                 "-c:a", "aac", "-ar", "48000", "-ac", "2", "-af", "aresample=async=1:first_pts=0",
                 "-video_track_timescale", "15360", "-t", str(duration), str(root / "body.mp4")]
        subprocess.run(args, check=True)
        # The worker owns a disposable download. Release it before writing the final copy.
        if consume_source:
            pathlib.Path(source).unlink()
        playlist = root / "concat.txt"
        playlist.write_text("".join(f"file '{root / part}'\n" for part in ["intro.mp4", "body.mp4", "outro.mp4"]))
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(playlist),
                        "-c", "copy", "-movflags", "+faststart", str(output)], check=True)
    result = probe(output)
    actual = float(result["format"]["duration"])
    if abs(actual - duration - INTRO_SECONDS - OUTRO_SECONDS) > 2:
        raise ValueError("Rendered VOD failed full-duration verification")
    return {"sourceSeconds": duration, "outputSeconds": actual, "introSeconds": INTRO_SECONDS,
            "outroSeconds": OUTRO_SECONDS, "credit": texts["credit"], "streamer": streamer}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    for arg in ["source", "output", "streamer", "title", "date"]:
        parser.add_argument(f"--{arg}", required=True)
    options = parser.parse_args()
    print(json.dumps(render(options.source, options.output, options.streamer, options.title, options.date)))
