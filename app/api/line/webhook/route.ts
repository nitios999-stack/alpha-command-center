import { env } from "cloudflare:workers";
import { saveLineWebhookEvent } from "../../../../db/command-center";

export const runtime = "edge";

type LineEvent = {
  webhookEventId?: string;
  type?: string;
  timestamp?: number;
  source?: { type?: string; groupId?: string };
};

type LineWebhook = { events?: LineEvent[] };

function base64(bytes: ArrayBuffer) {
  const data = new Uint8Array(bytes);
  let text = "";
  for (let offset = 0; offset < data.length; offset += 0x4000) {
    text += String.fromCharCode(...data.subarray(offset, offset + 0x4000));
  }
  return btoa(text);
}

function sameSignature(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

async function verifySignature(body: string, signature: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return sameSignature(base64(signed), signature);
}

async function getGroupProfile(groupId: string, accessToken: string) {
  try {
    const response = await fetch(`https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/summary`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return {};
    const body = await response.json() as { groupName?: string; pictureUrl?: string };
    return { groupName: body.groupName, pictureUrl: body.pictureUrl };
  } catch {
    // Webhook acknowledgement must not fail merely because the profile API is slow.
    return {};
  }
}

function fallbackEventId(event: LineEvent, index: number) {
  const groupId = event.source?.groupId ?? "no-group";
  return `line-${groupId}-${event.timestamp ?? Date.now()}-${event.type ?? "unknown"}-${index}`.slice(0, 240);
}

export async function POST(request: Request) {
  const secret = (env as typeof env & { LINE_CHANNEL_SECRET?: string }).LINE_CHANNEL_SECRET;
  const accessToken = (env as typeof env & { LINE_CHANNEL_ACCESS_TOKEN?: string }).LINE_CHANNEL_ACCESS_TOKEN;
  const signature = request.headers.get("x-line-signature") ?? "";
  const rawBody = await request.text();

  if (!secret || !accessToken) return Response.json({ error: "LINE integration is not configured" }, { status: 503 });
  if (!signature || !(await verifySignature(rawBody, signature, secret))) {
    return Response.json({ error: "Invalid LINE signature" }, { status: 401 });
  }

  let payload: LineWebhook;
  try {
    payload = JSON.parse(rawBody) as LineWebhook;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let saved = 0;
  for (const [index, event] of (payload.events ?? []).entries()) {
    const groupId = event.source?.type === "group" ? event.source.groupId?.trim() : "";
    if (!groupId) continue;
    const profile = await getGroupProfile(groupId, accessToken);
    const result = await saveLineWebhookEvent({
      eventId: event.webhookEventId?.trim() || fallbackEventId(event, index),
      groupId,
      eventType: event.type?.trim() || "unknown",
      groupName: profile.groupName,
      pictureUrl: profile.pictureUrl,
    });
    if (result.saved) saved += 1;
  }

  // LINE only needs a quick acknowledgement. We intentionally do not echo events,
  // group IDs, or message contents back to the caller.
  return Response.json({ ok: true, accepted: saved });
}
