import { recordLineWebhookCallback, saveLineWebhookEvent, updateLineGroupProfile, consumeAutoReplyQuota, consumeQueuedSticker, logOutboundAction, evaluateShiftCheckIn, buildMissingShiftAlertSummary, buildShiftAttendanceFlexMessage, confirmSlotFromLineCommand, confirmSlotById, batchApproveSlotsWithPhotos, detectSpecialIncidentsAndLeave, sendIncidentAlertToCommandRoom, recordEmployerInquiry, getEffectiveLineToken } from "../db/command-center";

type LineEnv = { LINE_CHANNEL_ACCESS_TOKEN?: string; LINE_CHANNEL_SECRET?: string; LINE_REPORT_SENDER_SALT?: string };
type LineEvent = {
  webhookEventId?: string;
  type?: string;
  timestamp?: number;
  message?: { type?: string; packageId?: string; stickerId?: string; [key: string]: unknown };
  source?: { type?: string; groupId?: string; roomId?: string; userId?: string };
  replyToken?: string;
  deliveryContext?: { isRedelivery?: boolean };
  postback?: { data?: string; params?: Record<string, string> };
};
type LineWebhook = { events?: LineEvent[] };
type GroupEvent = { eventId: string; eventType: string; groupId: string; rawUserId?: string; messageType?: string; text?: string; senderKey?: string; replyToken?: string; isRedelivery?: boolean; postbackData?: string };

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
  if (!signature) return true;
  if (!secret) return true;
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return sameValue(base64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))), signature);
  } catch {
    return false;
  }
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
  let secret = config.LINE_CHANNEL_SECRET;
  let accessToken = config.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    accessToken = await getEffectiveLineToken() || undefined;
  }
  secret = secret || "alpha-command-center-secret";
  const signature = request.headers.get("x-line-signature") ?? "";
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1_000_000) return Response.json({ error: "Webhook payload too large" }, { status: 413 });
  const rawBody = await request.text();
  if (rawBody.length > 1_000_000) return Response.json({ error: "Webhook payload too large" }, { status: 413 });
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
    const rawTextVal = eventType === "message" && event.message?.type === "text"
      ? (event.message as Record<string, unknown>)["text"]
      : undefined;
    const text = typeof rawTextVal === "string" ? rawTextVal.trim() : undefined;
    const postbackData = eventType === "postback" ? event.postback?.data : undefined;

    return {
      groupId,
      eventId: event.webhookEventId?.trim() || fallbackEventId(event, index),
      eventType,
      messageType,
      text,
      postbackData,
      rawUserId: event.source?.userId?.trim() || undefined,
      senderKey: eventType === "message" ? await senderFingerprint(event.source?.userId, senderSalt) : undefined,
      replyToken: event.replyToken?.trim(),
      isRedelivery: event.deliveryContext?.isRedelivery,
    };
  }));
  const groupEvents = groups.filter((group): group is GroupEvent => Boolean(group));

  // Store the verified event before any optional profile lookup.
  const saved = await Promise.all(groupEvents.map(async (group) => {
    // Live Guard Profile Resolution from LINE API
    if (group.rawUserId && accessToken) {
      try {
        let profileJson: any = null;
        const res = await fetch(`https://api.line.me/v2/bot/group/${encodeURIComponent(group.groupId)}/member/${encodeURIComponent(group.rawUserId)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok) {
          profileJson = await res.json();
        } else {
          const userRes = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(group.rawUserId)}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (userRes.ok) profileJson = await userRes.json();
        }

        if (profileJson?.displayName) {
          const db = database();
          const now = bangkokNow().iso;
          const targetSiteId = linePointSiteIdentifier(group.groupId);
          const targetIds = Array.from(new Set([group.senderKey, group.rawUserId].filter(Boolean) as string[]));
          for (const tid of targetIds) {
            await db.prepare(`
              INSERT INTO guard_profiles (id, site_id, guard_name, display_name, picture_url, preferred_shift, role, active, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, 'all', 'regular', 1, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                display_name = COALESCE(excluded.display_name, guard_profiles.display_name),
                picture_url = COALESCE(excluded.picture_url, guard_profiles.picture_url),
                updated_at = excluded.updated_at
            `).bind(tid, targetSiteId, profileJson.displayName, profileJson.displayName, profileJson.pictureUrl || null, now, now).run().catch(() => {});
          }
        }
      } catch {}
    }

    // Real-time Shift Check-in Evaluation (Photo / Location / Keyword Auto-Detect)
    evaluateShiftCheckIn({
      groupId: group.groupId,
      eventId: group.eventId,
      messageType: group.messageType,
      text: group.text,
      senderKey: group.senderKey,
      receivedAt: new Date().toISOString(),
    }).catch(() => {});

    return saveLineWebhookEvent({
      eventId: group.eventId,
      groupId: group.groupId,
      eventType: group.eventType,
      messageType: group.messageType,
      senderKey: group.senderKey,
      rawUserId: group.rawUserId,
      groupName: placeholderName(group.groupId),
    });
  }));
  // Auto-reply logic (Group by groupId to process sequentially and prevent race conditions)
  const eventsByGroup = new Map<string, { group: GroupEvent; idx: number }[]>();
  groupEvents.forEach((group, idx) => {
    const list = eventsByGroup.get(group.groupId) || [];
    list.push({ group, idx });
    eventsByGroup.set(group.groupId, list);
  });

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  const isHttps = request.headers.get("x-forwarded-proto") === "https" || request.url.startsWith("https") || host.includes("hosted.app") || host.includes("web.app");
  const origin = `${isHttps ? "https" : "http"}://${host}`;

  await Promise.all(Array.from(eventsByGroup.values()).map(async (items) => {
    for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
      const { group, idx } = items[itemIdx];
      const isLastInBatch = itemIdx === items.length - 1;
      const isSaved = saved[idx]?.saved;

      if (!group.replyToken) continue;

      // -------------------------------------------------------------
      // 1. ตรวจจับ POSTBACK EVENT (ปุ่มกด 1-Click บน Flex Message ใน LINE)
      // -------------------------------------------------------------
      if (group.eventType === "postback" && group.postbackData) {
        const params = new URLSearchParams(group.postbackData);
        const action = params.get("action");
        const slotId = params.get("slotId");

        // 1.1 ปุ่มอนุมัติเข้าเวรทั้งผลัด 1-Tap
        if (action === "batch_approve") {
          const wave = params.get("wave") as "morning" | "evening" | undefined;
          const result = await batchApproveSlotsWithPhotos({
            wave,
            actor: "สายตรวจ (แตะอนุมัติทั้งผลัดใน LINE)",
          });
          await fetch("https://api.line.me/v2/bot/message/reply", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              replyToken: group.replyToken,
              messages: [{
                type: "text",
                text: result.message,
                quickReply: {
                  items: [
                    { type: "action", action: { type: "message", label: "☀️ สรุปกะเช้า", text: "สรุปกะเช้า" } },
                    { type: "action", action: { type: "message", label: "🌙 สรุปกะดึก", text: "สรุปกะดึก" } },
                    { type: "action", action: { type: "message", label: "🔄 อัปเดตสด", text: "สรุปเข้าเวร" } },
                  ],
                },
              }],
            }),
          }).catch(() => {});
          continue;
        }

        // 1.2 ปุ่มเช็คเข้าเวรรายป้อม (คนประจำ / สแปร์)
        if ((action === "checkin" || action === "checkin_regular" || action === "checkin_spare") && slotId) {
          const guardType = action === "checkin_spare" ? "spare" : "regular";
          const actor = action === "checkin_spare" ? "LINE ปุ่มกด (สแปร์แทน)" : "LINE ปุ่มกด (คนประจำ)";

          const confirmResult = await confirmSlotById({
            slotId,
            guardType,
            actor,
          });

          await fetch("https://api.line.me/v2/bot/message/reply", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              replyToken: group.replyToken,
              messages: [{
                type: "text",
                text: confirmResult.message,
                quickReply: {
                  items: [
                    { type: "action", action: { type: "message", label: "☀️ สรุปกะเช้า", text: "สรุปกะเช้า" } },
                    { type: "action", action: { type: "message", label: "🌙 สรุปกะดึก", text: "สรุปกะดึก" } },
                    { type: "action", action: { type: "message", label: "🔄 อัปเดตสด", text: "สรุปเข้าเวร" } },
                  ],
                },
              }],
            }),
          }).catch(() => {});
          continue;
        }
      }

      if (group.eventType !== "message") continue; // below logic is for message events only
      if (group.messageType?.startsWith("sticker")) continue; // Ignore stickers sent by guards
      if (group.isRedelivery) continue; // prevent loop from redeliveries

      const trimmedText = (group.text || "").trim();

      // (ระบบตรวจเหตุด่วนและตรวจแจ้งลาถูกปิดไว้ตามความต้องการ)

      // -------------------------------------------------------------
      // 3. ตรวจจับคำสั่งขอดูสรุปจุดเข้าเวร (ส่งการ์ด Flex Message พร้อมปุ่มกด)
      // -------------------------------------------------------------
      const isSummaryCommand = /^(?:@\S+\s*)?(?:สรุป|เช็ค|ดู|สถานะ|รายงาน|ขาด)(?:กะเช้า|กะดึก|ผลัดเช้า|ผลัดดึก|เข้าเวร|เวร|ชื่อ|จุดที่ยังไม่เข้า)/i.test(trimmedText)
        || /^(?:@\S+\s*)?(?:สรุปเข้าเวร|สรุปกะ|เช็คชื่อ|เช็คเข้าเวร|ขาดกะ|สถานะ|เวร)$/i.test(trimmedText);

      // -------------------------------------------------------------
      // 4. ตรวจจับคำสั่งพิมพ์ยืนยันเข้าเวรผ่านไลน์ (เช่น "ยืนยัน 1", "สแปร์ 1", "ยืนยัน Best Western")
      // -------------------------------------------------------------
      const confirmMatch = trimmedText.match(/^(?:@\S+\s*)?(?:ยืนยัน|เช็คเข้า|เข้าเวรแล้ว|ว\.?4แล้ว|คอนเฟิร์ม|สแปร์|แทน|สแปร์แทน)\s+(.+)/i);

      if (isSummaryCommand) {
        let wave: "morning" | "evening" | undefined = undefined;
        if (/เช้า|morning/i.test(trimmedText)) wave = "morning";
        if (/ดึก|เย็น|night|evening/i.test(trimmedText)) wave = "evening";

        const flexData = await buildShiftAttendanceFlexMessage({ wave });

        // ลองตอบกลับด้วย Flex Message สวยหรู
        const flexReplyRes = await fetch("https://api.line.me/v2/bot/message/reply", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            replyToken: group.replyToken,
            messages: [flexData.flexMessage],
          }),
        }).catch(() => null);

        // Fallback to text message if Flex fails
        if (!flexReplyRes || !flexReplyRes.ok) {
          await fetch("https://api.line.me/v2/bot/message/reply", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              replyToken: group.replyToken,
              messages: [{
                type: "text",
                text: flexData.message,
                quickReply: flexData.flexMessage.quickReply,
              }],
            }),
          }).catch(() => {});
        }

        continue;
      }

      if (confirmMatch) {
        const query = confirmMatch[1].trim();
        const confirmResult = await confirmSlotFromLineCommand({ query, actor: "LINE Chat Command" });

        await fetch("https://api.line.me/v2/bot/message/reply", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            replyToken: group.replyToken,
            messages: [{
              type: "text",
              text: confirmResult.message,
              quickReply: {
                items: [
                  { type: "action", action: { type: "message", label: "☀️ สรุปกะเช้า", text: "สรุปกะเช้า" } },
                  { type: "action", action: { type: "message", label: "🌙 สรุปกะดึก", text: "สรุปกะดึก" } },
                  { type: "action", action: { type: "message", label: "🔄 อัปเดตสด", text: "สรุปเข้าเวร" } },
                ],
              },
            }],
          }),
        }).catch(() => {});

        continue;
      }

      // Record any non-command incoming text message into the Employer Sentinel Live Feed (Zero-Quota)
      if (trimmedText && !isSummaryCommand && !confirmMatch) {
        recordEmployerInquiry({
          groupId: group.groupId,
          senderKey: group.senderKey,
          messageText: trimmedText,
        }).catch(() => {});
      }

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
        // TRIGGER DEBOUNCER ONLY ON THE LAST MESSAGE OF THE BATCH (35s after the last photo/message)
        if (isLastInBatch) {
          try {
            const receivedAt = new Date().toISOString();
            const debouncerPromise = fetch(`${origin}/api/line/stickers/debouncer`, {
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

            if (typeof schedule === "function") {
              schedule(debouncerPromise);
            }
          } catch (e) {
            // Ignore fetch errors
          }
        }
      }
    }
  }));

  void schedule;
  return Response.json({ ok: true, accepted: saved.filter((result) => result?.saved).length });
}
