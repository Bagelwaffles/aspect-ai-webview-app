"""Cloud-only full-VOD worker. Secrets and upload session URLs never enter logs."""
import argparse
import hashlib
import json
import os
import pathlib
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from render_twitch_vod import render, probe


def request(url, body=None, headers=None, method=None, timeout=120):
    req = urllib.request.Request(url, body, headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status, response.read(), response.headers
    except urllib.error.HTTPError as error:
        return error.code, error.read(), error.headers


def api(payload):
    oidc_url = os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"] + "&audience=ams-twitch-worker"
    code, raw, _ = request(oidc_url, headers={"Authorization": "bearer " + os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]})
    if code != 200:
        raise RuntimeError("MEDIA_WORKER_OIDC_FAILED")
    token = json.loads(raw)["value"]
    print("::add-mask::" + token, flush=True)
    code, raw, _ = request(os.environ["AMS_APP_URL"] + "/api/internal/twitch/catchup/worker",
                           json.dumps(payload).encode(), {"Content-Type": "application/json", "Authorization": "Bearer " + token}, "POST", 330)
    body = json.loads(raw)
    if code != 200 or not body.get("ok"):
        raise RuntimeError(body.get("code", "TWITCH_CATCHUP_API_FAILED"))
    return body


def upload(path, url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "www.googleapis.com" or parsed.path != "/upload/youtube/v3/videos":
        raise RuntimeError("YOUTUBE_VOD_SESSION_INVALID")
    print("::add-mask::" + url, flush=True)
    size = path.stat().st_size
    offset = 0
    with path.open("rb") as stream:
        while offset < size:
            chunk = stream.read(8 * 1024 * 1024)
            code, raw, headers = request(url, chunk, {"Content-Type": "video/mp4", "Content-Length": str(len(chunk)),
                "Content-Range": f"bytes {offset}-{offset + len(chunk) - 1}/{size}"}, "PUT", 180)
            if code in (200, 201):
                video = json.loads(raw).get("id")
                if not video:
                    raise RuntimeError("YOUTUBE_VOD_ID_MISSING")
                return video
            if code != 308:
                raise RuntimeError(f"YOUTUBE_VOD_UPLOAD_HTTP_{code}")
            confirmed = headers.get("Range", "")
            if not confirmed.startswith("bytes=0-"):
                raise RuntimeError("YOUTUBE_VOD_RANGE_MISSING")
            next_offset = int(confirmed.split("-")[-1]) + 1
            if next_offset <= offset or next_offset > offset + len(chunk):
                raise RuntimeError("YOUTUBE_VOD_RANGE_INVALID")
            offset = next_offset
            stream.seek(offset)
    raise RuntimeError("YOUTUBE_VOD_COMPLETION_MISSING")


def main():
    print(json.dumps(api({"action": "publish"})["result"]), flush=True)
    # One historical stream's best clips and one complete VOD per cycle, never a bulk burst.
    try:
        result = api({"action": "clips"})["result"]
        print(json.dumps({k: result.get(k) for k in ["skipped", "vodId", "cursor", "created", "queued", "failures"]}), flush=True)
    except RuntimeError as error:
        print("Clip catch-up: " + str(error), flush=True)
    job = api({"action": "next"})["job"]
    if not job:
        print("No pending full VOD.", flush=True)
        return
    print(f"Processing complete SmokyBanana03 VOD {job['vodId']} ({job['durationSeconds']} seconds).", flush=True)
    try:
        with tempfile.TemporaryDirectory(prefix="ams-full-vod-") as temp:
            root = pathlib.Path(temp)
            info_path = root / "source.info.json"
            source = root / "source.mp4"
            # A public, owner-authorized Twitch recording only. No cookie/profile import or access bypass.
            subprocess.run(["python", "-m", "yt_dlp", "--no-playlist", "--quiet", "--no-warnings", "--write-info-json",
                "--abort-on-unavailable-fragments", "--max-filesize", "16G", "-f", "best[height<=1080]/best", "--remux-video", "mp4",
                "-o", str(source), f"https://www.twitch.tv/videos/{job['vodId']}"], check=True, timeout=2 * 3600,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            info = json.loads(info_path.read_text())
            if (info.get("uploader_id") or "").lower() != "smokybanana03" or str(info.get("id", "")).lstrip("v") != job["vodId"]:
                raise RuntimeError("TWITCH_VOD_SOURCE_IDENTITY_MISMATCH")
            if not source.is_file():
                raise RuntimeError("TWITCH_VOD_SOURCE_UNAVAILABLE")
            actual = float(info.get("duration") or 0)
            if abs(actual - job["durationSeconds"]) > 120:
                raise RuntimeError("TWITCH_VOD_SOURCE_DURATION_MISMATCH")
            if abs(float(probe(source)["format"]["duration"]) - actual) > 5:
                raise RuntimeError("TWITCH_VOD_SOURCE_INCOMPLETE")
            output = root / "branded-vod.mp4"
            proof = render(source, output, job["streamer"], job["title"], job["createdAt"][:10], consume_source=True)
            # Hash proof records the exact branded output; it carries no credential or session data.
            digest = hashlib.sha256()
            with output.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(chunk)
            print(json.dumps({"vodId": job["vodId"], "renderProof": proof, "sha256": digest.hexdigest()}), flush=True)
            session = api({"action": "begin", "vodId": job["vodId"], "lease": job["lease"], "bytes": output.stat().st_size})
            video_id = upload(output, session["uploadUrl"])
            complete = api({"action": "complete", "vodId": job["vodId"], "lease": job["lease"], "videoId": video_id})
            print(json.dumps({"vodId": job["vodId"], "youtubeVideoId": video_id, "status": complete["job"]["status"],
                "privacyStatus": "private"}), flush=True)
    except Exception as error:
        code = str(error) if isinstance(error, RuntimeError) else "TWITCH_VOD_" + type(error).__name__.upper()
        # No exception repr: transport errors can contain credential-bearing session URLs.
        api({"action": "complete", "vodId": job["vodId"], "lease": job["lease"], "errorCode": code[:100]})
        raise RuntimeError(code) from None

    print(json.dumps(api({"action": "publish"})["result"]), flush=True)

def prove_full_vod(vod_id):
    # Unprivileged CI proof: public media only, no AMS API, OAuth, or YouTube upload.
    if not vod_id.isdigit():
        raise ValueError("Invalid proof VOD ID")
    with tempfile.TemporaryDirectory(prefix="ams-vod-proof-") as temp:
        source = pathlib.Path(temp) / "source.mp4"
        subprocess.run(["python", "-m", "yt_dlp", "--no-playlist", "--quiet", "--no-warnings",
            "--write-info-json", "--abort-on-unavailable-fragments", "--max-filesize", "1G",
            "-f", "best[height<=480]/best", "--remux-video", "mp4", "-o", str(source),
            f"https://www.twitch.tv/videos/{vod_id}"], check=True, timeout=600,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        info = json.loads(source.with_suffix(".info.json").read_text())
        if (info.get("uploader_id") or "").lower() != "smokybanana03" or str(info.get("id", "")).lstrip("v") != vod_id:
            raise RuntimeError("TWITCH_VOD_SOURCE_IDENTITY_MISMATCH")
        duration = float(probe(source)["format"]["duration"])
        if abs(duration - float(info.get("duration") or 0)) > 5:
            raise RuntimeError("TWITCH_VOD_SOURCE_INCOMPLETE")
        output = pathlib.Path(temp) / "branded-vod.mp4"
        proof = render(source, output, "SmokyBanana03", info.get("title") or "Full Stream", "2026-09-28", consume_source=True)
        if source.exists():
            raise RuntimeError("TWITCH_VOD_TEMP_SOURCE_NOT_RELEASED")
        print(json.dumps({"vodId": vod_id, "proof": proof, "bytes": output.stat().st_size,
            "youtubeUploadAttempted": False}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--proof-vod-id")
    parser.add_argument("--check-pending", action="store_true")
    arguments = parser.parse_args()
    if arguments.check_pending:
        has_work = api({"action": "status"})["hasWork"]
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            output.write("has_work=" + str(bool(has_work)).lower() + "\n")
        print("Catch-up work available: " + str(bool(has_work)), flush=True)
    elif arguments.proof_vod_id:
        prove_full_vod(arguments.proof_vod_id)
    else:
        main()
