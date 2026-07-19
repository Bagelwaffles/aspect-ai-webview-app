import { NextRequest, NextResponse } from "next/server";
import { appendFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OFFER_SLUGS = new Set([
  "quick-marketing-audit",
  "social-content-pack",
  "website-profile-review",
  "business-cleanup-plan",
  "monthly-marketing-support"
]);

const FALLBACK_BACKEND_URL = "https://aspectapi-production.up.railway.app";
const localLogPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../_reports/ethical-agent-farm-requests.ndjson");

function isText(value: unknown, max = 4000) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
}

function getBackendUrl() {
  return (process.env.AMS_BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE_URL || FALLBACK_BACKEND_URL).replace(/\/$/, "");
}

function getFulfillmentSecret() {
  return process.env.AMS_STRIPE_FULFILLMENT_SECRET?.trim();
}

async function forwardRequest(payload: Record<string, unknown>) {
  const fulfillmentSecret = getFulfillmentSecret();
  if (!fulfillmentSecret) {
    if (process.env.NODE_ENV !== "production") {
      const record = {
        ...payload,
        savedAt: new Date().toISOString(),
        storageMode: "local_log"
      };

      await appendFile(localLogPath, `${JSON.stringify(record)}\n`, "utf8").catch(() => undefined);

      return NextResponse.json({
        ok: true,
        saved: true,
        emailNotificationStatus: "not_configured",
        storageMode: "local_log",
        message: "Request received. We’ll review your business and follow up.",
        noPaymentCharged: true
      });
    }

    return NextResponse.json(
      { ok: false, saved: false, error: "lead_capture_not_configured" },
      { status: 503 }
    );
  }

  const response = await fetch(`${getBackendUrl()}/internal/ethical-agent-farm/requests`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ams-fulfillment-secret": fulfillmentSecret
    },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { ok: false, error: text };
    }
  }

  return NextResponse.json(
    parsed ?? { ok: false, saved: false, error: "lead_capture_failed" },
    { status: response.status }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const businessName = typeof body.businessName === "string" ? body.businessName.trim() : "";
    const websiteOrFacebook = typeof body.websiteOrFacebook === "string" ? body.websiteOrFacebook.trim() : "";
    const selectedOffer = typeof body.selectedOffer === "string" ? body.selectedOffer.trim() : "";
    const notesOrGoals = typeof body.notesOrGoals === "string"
      ? body.notesOrGoals.trim()
      : typeof body.notes === "string"
        ? body.notes.trim()
        : "";
    const consent = Boolean(body.consent);

    if (!name || !email || !businessName || !selectedOffer || !consent) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!OFFER_SLUGS.has(selectedOffer)) {
      return NextResponse.json({ error: "Unknown offer" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    if (!isText(notesOrGoals, 4000)) {
      return NextResponse.json({ error: "Please include goals or notes" }, { status: 400 });
    }

    const payload = {
      name,
      email,
      businessName,
      websiteOrFacebook: websiteOrFacebook || null,
      selectedOffer,
      notes: notesOrGoals,
      consent
    };

    return forwardRequest(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 500 }
    );
  }
}
