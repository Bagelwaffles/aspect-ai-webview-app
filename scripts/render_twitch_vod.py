"""Brand a complete, owner-authorized VOD without trimming its source footage."""
import argparse
import json
import pathlib
import subprocess
import tempfile

INTRO_SECONDS = 5
OUTRO_SECONDS = 7


def probe(path):
    return json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)
    ]))


def render(source, output, streamer, title, date, width=1920, height=1080):
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
            "title": title[:70],
            "date": date,
            "credit": "Created by Aspect Marketing Solutions (AMS)",
            "follow": f"Follow {streamer} on Twitch",
            "thanks": "THANKS FOR WATCHING",
        }
        for key, value in texts.items():
            (root / f"{key}.txt").write_text(value, encoding="utf-8")
        font = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

        def text(key, size, y, color="white"):
            # Text is read from a file with expansion disabled; never interpolated into filters.
            return f"drawtext=fontfile={font}:textfile={root / (key + '.txt')}:expansion=none:fontsize={size}:fontcolor={color}:x=(w-text_w)/2:y={y}"

        def card(seconds, lines, target):
            filters = [
                "drawbox=x=0:y=0:w=iw:h=ih:color=0x140b26:t=fill",
                "drawbox=x=80:y=80:w=iw-160:h=ih-160:color=0xa86bff:t=3",
                "drawbox=x=110:y=ih-140:w=iw-220:h=3:color=0xffd166:t=fill",
            ] + [text(*line) for line in lines]
            subprocess.run([
                "ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"color=c=black:s={width}x{height}:r=30:d={seconds}",
                "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-vf", ",".join(filters),
                "-t", str(seconds), "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-ar", "48000", "-ac", "2", "-video_track_timescale", "15360", str(target),
            ], check=True)

        card(INTRO_SECONDS, [("streamer", 76, "h*0.29", "0xffd166"), ("title", 40, "h*0.43"),
                             ("date", 28, "h*0.53", "0xc9b6ea"), ("credit", 28, "h*0.73")], root / "intro.mp4")
        card(OUTRO_SECONDS, [("thanks", 48, "h*0.27", "0xffd166"), ("follow", 44, "h*0.43"),
                             ("credit", 32, "h*0.61")], root / "outro.mp4")
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
