import { NextRequest, NextResponse } from "next/server";

const WEBHOOK_URL = "https://aspectmarketingsolutions.app.n8n.cloud/webhook/ams-youtube-publish-v2";
const RUN_TOKEN = "ams-youtube-20260816-k7p4w9";

const videos = {
  audit: {
    request_id: "ams-youtube-audit-20260816-v1",
    video_url:
      "https://resource2.heygen.ai/aws_pacific/avatar_tmp/733dc9b89b20475496b4d86d0358ebcc/va6322c932e36406088ab186616cdd5a6/caption_636f6c315360413ead7b91b7a48378eb.mp4",
    title: "Quick Marketing Audit for Small Businesses | $49 | #Shorts",
    description:
      "Before you spend more on marketing, find out what actually needs fixing. The Aspect Marketing Solutions Quick Marketing Audit is $49 one time, with no subscription, and is delivered within 48 hours. You get 5 marketing problems, 5 specific fixes, a stronger headline, a stronger offer, one ready-to-use promotional post, and a practical 7-day action plan.\n\nGet started: https://www.aspectmarketingsolutions.app/quick-marketing-audit",
    tags: ["Small Business", "Marketing", "Quick Marketing Audit", "AMS", "Shorts"],
    privacy_status: "public",
    category_id: "28",
    made_for_kids: false,
    notify_subscribers: true,
  },
  command: {
    request_id: "ams-youtube-command-20260816-v1",
    video_url:
      "https://resource2.heygen.ai/aws_pacific/avatar_tmp/733dc9b89b20475496b4d86d0358ebcc/v46fa495c6eb34a99828f6f08d283f491/caption_41b1a2bba85b4ada834aa8eaef87ee21.mp4",
    title: "Aspect Marketing Solutions: The Cloud AI Command Center",
    description:
      "Meet Aspect Marketing Solutions (AMS), a cloud AI marketing and automation command center designed to bring specialized agents, workflows, publishing, analytics, billing, and business operations into one system.\n\nExplore AMS: https://www.aspectmarketingsolutions.app/\nQuick Marketing Audit: https://www.aspectmarketingsolutions.app/quick-marketing-audit",
    tags: ["AI", "Marketing Automation", "Small Business", "AMS", "Aspect Marketing Solutions"],
    privacy_status: "public",
    category_id: "28",
    made_for_kids: false,
    notify_subscribers: true,
  },
} as const;

export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "preview_only" }, { status: 404 });
  }

  const token = request.nextUrl.searchParams.get("run");
  const which = request.nextUrl.searchParams.get("which") as keyof typeof videos | null;

  if (token !== RUN_TOKEN || !which || !(which in videos)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const internalKey = process.env.AMS_N8N_INTERNAL_KEY;
  if (!internalKey) {
    return NextResponse.json({ error: "missing_internal_key" }, { status: 500 });
  }

  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ams-internal-key": internalKey,
    },
    body: JSON.stringify(videos[which]),
    cache: "no-store",
  });

  const body = await response.text();
  return NextResponse.json(
    {
      ok: response.ok,
      status: response.status,
      video: which,
      response: body.slice(0, 4000),
    },
    { status: response.ok ? 200 : 502 },
  );
}
