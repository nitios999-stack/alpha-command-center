import { recordLineWebhookCallback, saveLineWebhookEvent, updateLineGroupProfile, consumeAutoReplyQuota, consumeQueuedSticker, logOutboundAction } from "../db/command-center";

type LineEnv = { LINE_CHANNEL_ACCESS_TOKEN?: string; LINE_CHANNEL_SECRET?: string; LINE_REPORT_SENDER_SALT?: string };
type LineEvent = {
  webhookEventId?: string;
  type?: string;
  timestamp?: number;
  message?: { type?: string; packageId?: string; stickerId?: string };
  source?: { type?: string; groupId?: string; roomId?: string; userId?: string };
  replyToken?: string;
  deliveryContext?: { isRedelivery?: boolean };
};
type LineWebhook = { events?: LineEvent[] };
type GroupEvent = { eventId: string; eventType: string; groupId: string; messageType?: string; senderKey?: string; replyToken?: string; isRedelivery?: boolean };

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

async function senderFingerprint(userId: string | undefined, secret: string) {
  const raw = userId?.trim() ?? "";
  if (!raw) return undefined;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  return "U-" + Array.from(bytes.slice(0, 8)).map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function groupProfile(groupId: string, accessToken: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await fetch(`https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/summary`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    if (!response.ok) return {};
    return await response.json() as { groupName?: string; pictureUrl?: string };
  } catch {
    return {};
  } finally {
    clearTimeout(timeout);
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

export function lineEnvironment(): Record<string, string | undefined> {
  return (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
}

export async function receiveLineWebhook(request: Request, config: LineEnv, schedule?: (job: Promise<unknown>) => void) {
  const secret = config.LINE_CHANNEL_SECRET;
  const accessToken = config.LINE_CHANNEL_ACCESS_TOKEN;
  const signature = request.headers.get("x-line-signature") ?? "";
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1_000_000) return Response.json({ error: "Webhook payload too large" }, { status: 413 });
  const rawBody = await request.text();
  if (rawBody.length > 1_000_000) return Response.json({ error: "Webhook payload too large" }, { status: 413 });
  if (!secret || !accessToken) return Response.json({ error: "LINE integration is not configured" }, { status: 503 });
  const senderSalt = (config.LINE_REPORT_SENDER_SALT || secret).trim();
  if (!(await validSignature(rawBody, signature, secret))) return Response.json({ error: "Invalid LINE signature" }, { status: 401 });

  let payload: LineWebhook;
  try {
    payload = JSON.parse(rawBody) as LineWebhook;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const callbackCounts = (payload.events ?? []).reduce((counts, event) => {
    counts.eventCount += 1;
    if (event.type === "message") counts.messageEvents += 1;
    switch (event.source?.type) {
      case "group": counts.groupEvents += 1; break;
      case "room": counts.roomEvents += 1; break;
      case "user": counts.userEvents += 1; break;
      default: counts.otherEvents += 1; break;
    }
    return counts;
  }, { eventCount: 0, groupEvents: 0, roomEvents: 0, userEvents: 0, otherEvents: 0, messageEvents: 0 });
  await recordLineWebhookCallback(callbackCounts);
  const groups = await Promise.all((payload.events ?? []).map(async (event, index): Promise<GroupEvent | null> => {
    const groupId = event.source?.type === "group" ? event.source.groupId?.trim() : "";
    if (!groupId) return null;
    const eventType = event.type?.trim() || "unknown";
    let messageType = eventType === "message" && event.message?.type?.trim()
      ? event.message.type.trim().slice(0, 32)
      : undefined;
    if (eventType === "message" && event.message?.type === "sticker") {
      messageType = `sticker:${event.message.packageId}:${event.message.stickerId}`;
    }
    return {
      groupId,
      eventId: event.webhookEventId?.trim() || fallbackEventId(event, index),
      eventType,
      messageType,
      senderKey: eventType === "message" ? await senderFingerprint(event.source?.userId, senderSalt) : undefined,
      replyToken: event.replyToken?.trim(),
      isRedelivery: event.deliveryContext?.isRedelivery,
    };
  }));
  const groupEvents = groups.filter((group): group is GroupEvent => Boolean(group));

  // Store the verified event before any optional profile lookup. The quick 200
  // acknowledgement is what prevents LINE from cancelling or retrying a valid event.
  const saved = await Promise.all(groupEvents.map((group) => saveLineWebhookEvent({
    eventId: group.eventId,
    groupId: group.groupId,
    // The database stores only message kind and a non-reversible sender key;
    // it never receives the chat text or the raw LINE user ID.
    eventType: group.eventType,
    messageType: group.messageType,
    senderKey: group.senderKey,
    groupName: placeholderName(group.groupId),
  })));
  // Auto-reply logic (Group by groupId to process sequentially and prevent race conditions)
  const eventsByGroup = new Map<string, { group: GroupEvent; idx: number }[]>();
  groupEvents.forEach((group, idx) => {
    const list = eventsByGroup.get(group.groupId) || [];
    list.push({ group, idx });
    eventsByGroup.set(group.groupId, list);
  });

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto") || (request.url.startsWith("https") ? "https" : "http");
  const origin = `${proto}://${host}`;

  await Promise.all(Array.from(eventsByGroup.values()).map(async (items) => {
    for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
      const { group, idx } = items[itemIdx];
      const isLastInBatch = itemIdx === items.length - 1;
      const isSaved = saved[idx]?.saved;
      if (group.eventType !== "message") continue; // only reply to messages
      if (group.messageType?.startsWith("sticker")) continue; // Ignore stickers sent by guards to prevent infinite sticker loops
      if (group.isRedelivery) continue; // prevent loop from redeliveries
      if (!group.replyToken) continue;

      const actionId = `auto-${Date.now()}-${idx}`;
      const queuedSticker = await consumeQueuedSticker(group.groupId);
      
      let stickerPackageId = "";
      let stickerId = "";
      let actionType = "auto-reply";
      let triggerEventId = group.eventId;

      if (queuedSticker) {
        stickerPackageId = queuedSticker.stickerPackageId;
        stickerId = queuedSticker.stickerId;
        actionType = "manual-batch-queued";
        triggerEventId = queuedSticker.queuedId;
      } else {
        const quota = await consumeAutoReplyQuota(group.groupId, group.eventId);
        
        // TRIGGER DEBOUNCER ONLY ON THE LAST MESSAGE OF THE BATCH
        if (isLastInBatch) {
          try {
            const receivedAt = new Date().toISOString();
            fetch(`${origin}/api/line/stickers/debouncer`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                groupId: group.groupId,
                eventId: group.eventId,
                replyToken: group.replyToken,
                receivedAt: receivedAt,
                accessToken: accessToken
              })
            }).catch(() => {});
          } catch (e) {
            // Ignore fetch errors
          }
        }

        if (!quota.allowed) {
          if (quota.reason !== "disabled" && quota.reason !== "no_new_event" && quota.reason !== "no_sticker_configured" && quota.reason !== "concurrent_update_failed") {
            await logOutboundAction({
              id: actionId,
              groupId: group.groupId,
              triggerEventId: group.eventId,
              actionType: "auto-reply",
              stickerPackageId: quota.stickerPackageId || "-",
              stickerId: quota.stickerId || "-",
              status: "skipped",
              skipReason: quota.reason
            });
          }
          continue;
        }
        stickerPackageId = quota.stickerPackageId!;
        stickerId = quota.stickerId!;
      }

      // Call LINE API (Immediate Opening Reply)
      try {
        const response = await fetch("https://api.line.me/v2/bot/message/reply", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            replyToken: group.replyToken,
            messages: [{
              type: "sticker",
              packageId: stickerPackageId,
              stickerId: stickerId
            }]
          })
        });

        if (!response.ok) {
          const errBody = await response.text();
          await logOutboundAction({
            id: actionId,
            groupId: group.groupId,
            triggerEventId: triggerEventId,
            actionType: actionType as any,
            stickerPackageId: stickerPackageId,
            stickerId: stickerId,
            status: "failed",
            skipReason: `API Error: ${response.status} ${errBody.slice(0, 100)}`
          });
          continue;
        }

        await logOutboundAction({
          id: actionId,
          groupId: group.groupId,
          triggerEventId: triggerEventId,
          actionType: actionType as any,
          stickerPackageId: stickerPackageId,
          stickerId: stickerId,
          status: "sent"
        });

      } catch (e) {
        await logOutboundAction({
          id: actionId,
          groupId: group.groupId,
          triggerEventId: triggerEventId,
          actionType: actionType as any,
          stickerPackageId: stickerPackageId,
          stickerId: stickerId,
          status: "failed",
          skipReason: "Network error"
        });
      }
    }
  }));

  void schedule;
  return Response.json({ ok: true, accepted: saved.filter((result) => result?.saved).length });
}
