import { saveLineWebhookEvent, updateLineGroupProfile } from "../db/command-center";

type LineEnv = { LINE_CHANNEL_ACCESS_TOKEN?: string; LINE_CHANNEL_SECRET?: string };
type LineEvent = { webhookEventId?: string; type?: string; timestamp?: number; source?: { type?: string; groupId?: string } };
type LineWebhook = { events?: LineEvent[] };
type GroupEvent = { eventId: string; eventType: string; groupId: string };

function base64(bytes: ArrayBuffer) {
  const data = new Uint8Array(bytes);
  let text = "";
  for (let offset = 0; offset < data.length; offset += 0x4000) text += String.fromCharCode(...data.subarray(offset, offset + 0x4000));
  return btoa(text);
}

function sameValue(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

async function validSignature(body: string, signature: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return sameValue(base64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))), signature);
}

function fallbackEventId(event: LineEvent, index: number) {
  return `line-${event.source?.groupId ?? "no-group"}-${event.timestamp ?? Date.now()}-${event.type ?? "unknown"}-${index}`.slice(0, 240);
}

function placeholderName(groupId: string) {
  return `LINE group ${groupId.slice(-6)}`;
}

async function groupProfile(groupId: string, accessToken: string) {
  try {
    const response = await fetch(`https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/summary`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) return {};
    return await response.json() as { groupName?: string; pictureUrl?: string };
  } catch {
    return {};
  }
}

async function enrichGroups(groups: GroupEvent[], accessToken: string) {
  await Promise.allSettled([...new Map(groups.map((group) => [group.groupId, group])).values()].map(async (group) => {
    const profile = await groupProfile(group.groupId, accessToken);
    if (profile.groupName?.trim() || profile.pictureUrl?.trim()) {
      await updateLineGroupProfile({ groupId: group.groupId, groupName: profile.groupName?.trim(), pictureUrl: profile.pictureUrl?.trim() });
    }
  }));
}

export async function receiveLineWebhook(request: Request, config: LineEnv, schedule?: (job: Promise<unknown>) => void) {
  const secret = config.LINE_CHANNEL_SECRET;
  const accessToken = config.LINE_CHANNEL_ACCESS_TOKEN;
  const signature = request.headers.get("x-line-signature") ?? "";
  const rawBody = await request.text();
  if (!secret || !accessToken) return Response.json({ error: "LINE integration is not configured" }, { status: 503 });
  if (!(await validSignature(rawBody, signature, secret))) return Response.json({ error: "Invalid LINE signature" }, { status: 401 });

  let payload: LineWebhook;
  try {
    payload = JSON.parse(rawBody) as LineWebhook;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const groups = (payload.events ?? []).flatMap((event, index): GroupEvent[] => {
    const groupId = event.source?.type === "group" ? event.source.groupId?.trim() : "";
    return groupId ? [{ groupId, eventId: event.webhookEventId?.trim() || fallbackEventId(event, index), eventType: event.type?.trim() || "unknown" }] : [];
  });

  // Store the verified event before any optional profile lookup. The quick 200
  // acknowledgement is what prevents LINE from cancelling or retrying a valid event.
  const saved = await Promise.all(groups.map((group) => saveLineWebhookEvent({
    eventId: group.eventId,
    groupId: group.groupId,
    eventType: group.eventType,
    groupName: placeholderName(group.groupId),
  })));
  const background = enrichGroups(groups, accessToken).then(() => undefined);
  if (schedule) schedule(background);
  return Response.json({ ok: true, accepted: saved.filter((result) => result.saved).length });
}
