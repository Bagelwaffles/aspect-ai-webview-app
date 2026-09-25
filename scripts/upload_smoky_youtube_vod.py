#!/usr/bin/env python3
import json
import os
import sys
import time
import urllib.error
import urllib.request

CHUNK_SIZE = 16 * 1024 * 1024
SOURCE_REFRESH_SECONDS = 8 * 60
ACCESS_REFRESH_SECONDS = 45 * 60
RETRIABLE = {500, 502, 503, 504}


def load_claim(path: str):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def parse_json(data: bytes):
    if not data:
        return {}
    try:
        value = json.loads(data.decode("utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def http_request(url, method="GET", headers=None, data=None, timeout=120):
    req = urllib.request.Request(
        url,
        method=method,
        headers=headers or {},
        data=data,
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status, dict(response.headers.items()), response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers.items()), exc.read()


def ams_json(app_url, path, lease_token, job_id):
    body = json.dumps({"jobId": job_id}).encode("utf-8")
    status, _, raw = http_request(
        f"{app_url}{path}",
        method="POST",
        headers={
            "Authorization": f"Bearer {lease_token}",
            "Content-Type": "application/json",
        },
        data=body,
        timeout=30,
    )
    parsed = parse_json(raw)
    if status < 200 or status >= 300 or not parsed.get("ok"):
        code = parsed.get("code") or f"HTTP_{status}"
        raise RuntimeError(f"AMS_CONTROL_FAILED:{code}")
    return parsed


def complete(app_url, lease_token, payload):
    data = json.dumps(payload).encode("utf-8")
    status, _, raw = http_request(
        f"{app_url}/api/internal/twitch/vod/upload/complete",
        method="POST",
        headers={
            "Authorization": f"Bearer {lease_token}",
            "Content-Type": "application/json",
        },
        data=data,
        timeout=30,
    )
    parsed = parse_json(raw)
    if status < 200 or status >= 300 or not parsed.get("ok"):
        code = parsed.get("code") or f"HTTP_{status}"
        raise RuntimeError(f"AMS_COMPLETE_FAILED:{code}")
    return parsed


def range_end(headers):
    raw = headers.get("Range") or headers.get("range")
    if not raw:
        return None
    raw = raw.strip()
    if "-" not in raw:
        return None
    try:
        return int(raw.rsplit("-", 1)[1])
    except ValueError:
        return None


def refresh_access(app_url, lease_token, job_id):
    parsed = ams_json(
        app_url,
        "/api/internal/twitch/vod/upload/credentials",
        lease_token,
        job_id,
    )
    credentials = parsed.get("credentials") or {}
    token = credentials.get("accessToken")
    if not token:
        raise RuntimeError("AMS_ACCESS_TOKEN_MISSING")
    return token, time.monotonic()


def refresh_source(app_url, lease_token, job_id):
    parsed = ams_json(
        app_url,
        "/api/internal/twitch/vod/upload/source",
        lease_token,
        job_id,
    )
    source = parsed.get("source") or {}
    url = source.get("url")
    if not url:
        raise RuntimeError("AMS_SOURCE_URL_MISSING")
    return url, time.monotonic()


def query_upload_status(upload_url, access_token, total_bytes):
    return http_request(
        upload_url,
        method="PUT",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Length": "0",
            "Content-Range": f"bytes */{total_bytes}",
        },
        data=b"",
        timeout=60,
    )


def read_source_chunk(source_url, start, end, total_bytes):
    expected = end - start + 1
    status, headers, raw = http_request(
        source_url,
        method="GET",
        headers={"Range": f"bytes={start}-{end}"},
        timeout=120,
    )
    if status == 206:
        if len(raw) != expected:
            raise RuntimeError("SMOKY_VOD_SOURCE_RANGE_LENGTH_MISMATCH")
        return raw
    if status == 200 and start == 0 and expected == total_bytes and len(raw) == total_bytes:
        return raw
    raise RuntimeError(f"SMOKY_VOD_SOURCE_RANGE_HTTP_{status}")


def upload_chunk(upload_url, access_token, content_type, total_bytes, start, data):
    end = start + len(data) - 1
    return http_request(
        upload_url,
        method="PUT",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": content_type,
            "Content-Length": str(len(data)),
            "Content-Range": f"bytes {start}-{end}/{total_bytes}",
        },
        data=data,
        timeout=180,
    )


def successful_video_id(raw):
    parsed = parse_json(raw)
    value = parsed.get("id")
    return value.strip() if isinstance(value, str) and value.strip() else None


def mark_session_expired(app_url, lease_token, job_id):
    complete(app_url, lease_token, {
        "jobId": job_id,
        "ok": False,
        "errorCode": "YOUTUBE_RESUMABLE_SESSION_EXPIRED",
        "retriable": True,
        "sessionExpired": True,
    })


def mark_failure(app_url, lease_token, job_id, code, retriable=False, uncertain=False):
    complete(app_url, lease_token, {
        "jobId": job_id,
        "ok": False,
        "errorCode": code[:200],
        "retriable": retriable,
        "uncertain": uncertain,
    })


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: upload_smoky_youtube_vod.py CLAIM_JSON")

    claim = load_claim(sys.argv[1])
    job = claim.get("job") or {}
    job_id = job.get("jobId")
    lease_token = claim.get("leaseToken")
    upload_url = claim.get("resumableUrl")
    access_token = claim.get("accessToken")
    source = claim.get("source") or {}
    source_url = source.get("url")
    total_bytes = int(source.get("bytes") or 0)
    content_type = source.get("contentType") or "video/mp4"
    app_url = os.environ.get("AMS_APP_URL", "").rstrip("/")

    if not all([job_id, lease_token, upload_url, access_token, source_url, app_url]) or total_bytes <= 0:
        raise RuntimeError("SMOKY_VOD_WORKER_CLAIM_INVALID")

    access_refreshed_at = time.monotonic()
    source_refreshed_at = time.monotonic()

    # Always ask YouTube where the resumable session currently stands before sending bytes.
    status, headers, raw = query_upload_status(upload_url, access_token, total_bytes)
    if status in (200, 201):
        video_id = successful_video_id(raw)
        if not video_id:
            mark_failure(app_url, lease_token, job_id, "YOUTUBE_UPLOAD_COMPLETION_UNCERTAIN", uncertain=True)
            raise RuntimeError("YOUTUBE_UPLOAD_COMPLETION_UNCERTAIN")
        complete(app_url, lease_token, {"jobId": job_id, "ok": True, "youtubeVideoId": video_id})
        print("VOD upload already complete.")
        return 0
    if status == 404:
        mark_session_expired(app_url, lease_token, job_id)
        raise RuntimeError("YOUTUBE_RESUMABLE_SESSION_EXPIRED")
    if status == 401:
        access_token, access_refreshed_at = refresh_access(app_url, lease_token, job_id)
        status, headers, raw = query_upload_status(upload_url, access_token, total_bytes)
    if status != 308:
        retriable = status in RETRIABLE
        mark_failure(app_url, lease_token, job_id, f"YOUTUBE_STATUS_HTTP_{status}", retriable=retriable)
        raise RuntimeError(f"YOUTUBE_STATUS_HTTP_{status}")

    confirmed = range_end(headers)
    offset = 0 if confirmed is None else confirmed + 1
    last_reported_percent = -1

    while offset < total_bytes:
        if time.monotonic() - access_refreshed_at >= ACCESS_REFRESH_SECONDS:
            access_token, access_refreshed_at = refresh_access(app_url, lease_token, job_id)
        if time.monotonic() - source_refreshed_at >= SOURCE_REFRESH_SECONDS:
            source_url, source_refreshed_at = refresh_source(app_url, lease_token, job_id)

        end = min(offset + CHUNK_SIZE - 1, total_bytes - 1)
        chunk = read_source_chunk(source_url, offset, end, total_bytes)

        attempts = 0
        while True:
            status, headers, raw = upload_chunk(
                upload_url,
                access_token,
                content_type,
                total_bytes,
                offset,
                chunk,
            )

            if status in (200, 201):
                video_id = successful_video_id(raw)
                if not video_id:
                    mark_failure(app_url, lease_token, job_id, "YOUTUBE_UPLOAD_COMPLETION_UNCERTAIN", uncertain=True)
                    raise RuntimeError("YOUTUBE_UPLOAD_COMPLETION_UNCERTAIN")
                complete(app_url, lease_token, {"jobId": job_id, "ok": True, "youtubeVideoId": video_id})
                print("VOD upload complete.")
                return 0

            if status == 308:
                confirmed = range_end(headers)
                if confirmed is None:
                    q_status, q_headers, q_raw = query_upload_status(upload_url, access_token, total_bytes)
                    if q_status in (200, 201):
                        video_id = successful_video_id(q_raw)
                        if not video_id:
                            mark_failure(app_url, lease_token, job_id, "YOUTUBE_UPLOAD_COMPLETION_UNCERTAIN", uncertain=True)
                            raise RuntimeError("YOUTUBE_UPLOAD_COMPLETION_UNCERTAIN")
                        complete(app_url, lease_token, {"jobId": job_id, "ok": True, "youtubeVideoId": video_id})
                        print("VOD upload complete.")
                        return 0
                    if q_status == 404:
                        mark_session_expired(app_url, lease_token, job_id)
                        raise RuntimeError("YOUTUBE_RESUMABLE_SESSION_EXPIRED")
                    if q_status != 308:
                        mark_failure(
                            app_url,
                            lease_token,
                            job_id,
                            f"YOUTUBE_STATUS_HTTP_{q_status}",
                            retriable=q_status in RETRIABLE,
                        )
                        raise RuntimeError(f"YOUTUBE_STATUS_HTTP_{q_status}")
                    confirmed = range_end(q_headers)
                offset = 0 if confirmed is None else confirmed + 1
                break

            if status == 401:
                access_token, access_refreshed_at = refresh_access(app_url, lease_token, job_id)
                attempts += 1
                if attempts <= 2:
                    continue

            if status == 404:
                mark_session_expired(app_url, lease_token, job_id)
                raise RuntimeError("YOUTUBE_RESUMABLE_SESSION_EXPIRED")

            if status in RETRIABLE and attempts < 5:
                attempts += 1
                time.sleep(min(2 ** attempts, 16))
                q_status, q_headers, q_raw = query_upload_status(upload_url, access_token, total_bytes)
                if q_status in (200, 201):
                    video_id = successful_video_id(q_raw)
                    if not video_id:
                        mark_failure(app_url, lease_token, job_id, "YOUTUBE_UPLOAD_COMPLETION_UNCERTAIN", uncertain=True)
                        raise RuntimeError("YOUTUBE_UPLOAD_COMPLETION_UNCERTAIN")
                    complete(app_url, lease_token, {"jobId": job_id, "ok": True, "youtubeVideoId": video_id})
                    print("VOD upload complete.")
                    return 0
                if q_status == 308:
                    confirmed = range_end(q_headers)
                    offset = 0 if confirmed is None else confirmed + 1
                    break
                if q_status == 404:
                    mark_session_expired(app_url, lease_token, job_id)
                    raise RuntimeError("YOUTUBE_RESUMABLE_SESSION_EXPIRED")
                continue

            mark_failure(
                app_url,
                lease_token,
                job_id,
                f"YOUTUBE_CHUNK_HTTP_{status}",
                retriable=status in RETRIABLE,
            )
            raise RuntimeError(f"YOUTUBE_CHUNK_HTTP_{status}")

        percent = int((offset * 100) / total_bytes)
        if percent >= last_reported_percent + 10 or offset >= total_bytes:
            last_reported_percent = percent
            print(f"VOD upload progress: {percent}%")

    # A missing final response is ambiguous; query once rather than creating a second video.
    status, _, raw = query_upload_status(upload_url, access_token, total_bytes)
    if status in (200, 201):
        video_id = successful_video_id(raw)
        if video_id:
            complete(app_url, lease_token, {"jobId": job_id, "ok": True, "youtubeVideoId": video_id})
            print("VOD upload complete.")
            return 0

    mark_failure(app_url, lease_token, job_id, "YOUTUBE_UPLOAD_FINAL_STATE_UNCERTAIN", uncertain=True)
    raise RuntimeError("YOUTUBE_UPLOAD_FINAL_STATE_UNCERTAIN")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"VOD uploader failed safely: {exc}", file=sys.stderr)
        sys.exit(1)
