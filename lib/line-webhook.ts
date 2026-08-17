import { recordLineWebhookCallback, lineQuotaRemaining, saveLineWebhookEvent, updateLineGroupProfile, consumeAutoReplyQuota, consumeQueuedSticker, logOutboundAction, evaluateShiftCheckIn, buildMissingShiftAlertSummary, buildShiftAttendanceFlexMessage, confirmSlotFromLineCommand, confirmSlotById, batchApproveSlotsWithPhotos, recordEmployerInquiry, isGuardReportMessage, getEffectiveLineToken, database, bangkokNow, linePointSiteIdentifier } from "../db/command-center";

type LineEnv = { LINE_CHANNEL_ACCESS_TOKEN?: string; LINE_CHANNEL_SECRET?: string; LINE_REPORT_SENDER_SALT?: string };
type LineEvent = {
  webhookEventId?: string;
  type?: string;
  timestamp?: number;
  message?: { type?: string; packageId?: string; stickerId?: string;[key: string]: unknown };
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

const pushMemoryDebounce = new Map<string, number>();
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
          const canonicalId = String(group.rawUserId || group.senderKey || "").trim();

          if (canonicalId) {
            // Check if profile already exists to preserve custom role (e.g. employer / regular)
            const existingProfile = (await db.prepare(`
              SELECT id, role, guard_name, display_name 
              FROM guard_profiles 
              WHERE id = ? 
                 OR (display_name = ? AND display_name IS NOT NULL AND display_name != '')
                 OR (guard_name = ? AND guard_name NOT LIKE 'ผู้ส่ง (%' AND guard_name NOT LIKE 'รปภ. (%')
              ORDER BY CASE WHEN id LIKE 'U%' THEN 1 ELSE 2 END, CASE WHEN role != 'unconfirmed' THEN 1 ELSE 2 END
              LIMIT 1
            `).bind(canonicalId, profileJson.displayName, profileJson.displayName).first()) as { id: string; role: string; guard_name: string; display_name: string } | null;

            // Preserve role if already set, otherwise default to unconfirmed until admin verifies
            const targetRole = existingProfile?.role || "unconfirmed";

            await db.prepare(`
              INSERT INTO guard_profiles (id, site_id, guard_name, display_name, picture_url, preferred_shift, role, active, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, 'all', ?, 1, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                guard_name = CASE WHEN guard_profiles.guard_name LIKE 'ผู้ส่ง (%' OR guard_profiles.guard_name LIKE 'รปภ. (%' THEN excluded.guard_name ELSE guard_profiles.guard_name END,
                display_name = COALESCE(excluded.display_name, guard_profiles.display_name),
                picture_url = COALESCE(excluded.picture_url, guard_profiles.picture_url),
                role = CASE WHEN guard_profiles.role != 'unconfirmed' THEN guard_profiles.role ELSE excluded.role END,
                updated_at = excluded.updated_at
            `).bind(canonicalId, targetSiteId, profileJson.displayName, profileJson.displayName, profileJson.pictureUrl || null, targetRole, now, now).run().catch(() => { });

            // If canonicalId starts with 'U' (real LINE user ID), clean up any old hash rows sharing the same display_name
            if (canonicalId.startsWith("U")) {
              await db.prepare(`
                DELETE FROM guard_profiles 
                WHERE id != ? 
                  AND (display_name = ? OR guard_name = ?)
                  AND id NOT LIKE 'U%'
              `).bind(canonicalId, profileJson.displayName, profileJson.displayName).run().catch(() => { });
            }
          }
        }
      } catch { }
    }

    // Real-time Shift Check-in Evaluation (Photo / Location / Keyword Auto-Detect)
    evaluateShiftCheckIn({
      groupId: group.groupId,
      eventId: group.eventId,
      messageType: group.messageType,
      text: group.text,
      senderKey: group.senderKey,
      receivedAt: new Date().toISOString(),
    }).catch(() => { });

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
          }).catch(() => { });
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
          }).catch(() => { });
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
          }).catch(() => { });
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
        }).catch(() => { });

        continue;
      }

      const db = database();
      const uId = group.rawUserId || "";
      const sKey = group.senderKey || "";
      let senderProfile: { id: string; guard_name: string; role: string } | null = null;
      if (uId || sKey) {
        senderProfile = (await db.prepare(`
          SELECT id, guard_name, role 
          FROM guard_profiles 
          WHERE active = 1 
            AND (
              (id = ? AND ? != '') OR 
              (id = ? AND ? != '')
            )
          LIMIT 1
        `).bind(uId, uId, sKey, sKey).first()) as { id: string; guard_name: string; role: string } | null;
      }

      const isEmployer = senderProfile?.role === "employer";
      const isInspector = senderProfile?.role === "inspector";
      const isConfirmedGuard = senderProfile?.role === "regular" || senderProfile?.role === "spare" || senderProfile?.role === "head_guard";
      const isUnconfirmed = !isEmployer && !isInspector && !isConfirmedGuard;
      const isGuardReport = isGuardReportMessage(trimmedText);

      // --- MENTION DETECTION (EMPLOYER & INSPECTOR) ---
      let matchedEmployerName: string | null = null;
      let matchedInspectorName: string | null = null;
let matchedOaName: string | null = null;
      if (trimmedText) {
        // 1. Employer Names
        const employerProfiles = (await db.prepare(
          "SELECT guard_name, display_name FROM guard_profiles WHERE role = 'employer' AND active = 1"
        ).all<any>()).results || [];

        const allEmployerNames = new Set<string>();
        employerProfiles.forEach((p: any) => {
          if (p.guard_name && !p.guard_name.startsWith("ผู้ส่ง (") && !p.guard_name.startsWith("รปภ. (")) allEmployerNames.add(p.guard_name.trim());
          if (p.display_name && !p.display_name.startsWith("ผู้ส่ง (") && !p.display_name.startsWith("รปภ. (")) allEmployerNames.add(p.display_name.trim());
        });
        allEmployerNames.add("THANAKORN");
        allEmployerNames.add("ธนากร");

        const customAlertNamesSetting = (await db.prepare(
          "SELECT value FROM system_settings WHERE key = 'employer_alert_names'"
        ).first()) as { value: string } | null;

        if (customAlertNamesSetting?.value) {
          customAlertNamesSetting.value.split(/[,;\n]/).map((s: string) => s.trim()).filter(Boolean).forEach((s: string) => allEmployerNames.add(s));
        }

        // Exact full name / word boundary regex matching
        for (const name of allEmployerNames) {
          if (!name || name.length < 2) continue;
          const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(?:^|[^a-zA-Z0-9ก-๙])@?${escaped}(?:$|[^a-zA-Z0-9ก-๙])`, "i");
          if (regex.test(trimmedText)) {
            matchedEmployerName = name;
            break;
          }
        }

        // 2. Inspector Names & Keywords
        const inspectorProfiles = (await db.prepare(
          "SELECT guard_name, display_name FROM guard_profiles WHERE role = 'inspector' AND active = 1"
        ).all<any>()).results || [];

        const allInspectorNames = new Set<string>(["สายตรวจ", "inspector", "หัวหน้าสายตรวจ", "สายตรวจกลาง"]);
        inspectorProfiles.forEach((p: any) => {
          if (p.guard_name && !p.guard_name.startsWith("ผู้ส่ง (") && !p.guard_name.startsWith("รปภ. (")) allInspectorNames.add(p.guard_name.trim());
          if (p.display_name && !p.display_name.startsWith("ผู้ส่ง (") && !p.display_name.startsWith("รปภ. (")) allInspectorNames.add(p.display_name.trim());
        });

        for (const name of allInspectorNames) {
          if (!name || name.length < 2) continue;
          const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(?:^|[^a-zA-Z0-9ก-๙])@?${escaped}(?:$|[^a-zA-Z0-9ก-๙])`, "i");
          if (regex.test(trimmedText)) {
            matchedInspectorName = name;
            break;
          }
        }

        // 3. LINE Official Account / Bot Name Mentions (สนง.สายตรวจแอลฟา คอพ / @bmx3192k)
        const allOaKeywords = new Set<string>([
          "สนง.สายตรวจแอลฟา คอพ",
          "สนง.สายตรวจแอลฟาคอฟ",
          "สนง.สายตรวจ",
          "สายตรวจแอลฟา",
          "แอลฟาคอฟ",
          "แอลฟา คอพ",
          "bmx3192k",
          "สนง.",
          "แอดมิน",
          "admin",
          "บอท",
        ]);

        for (const kw of allOaKeywords) {
          const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(?:^|[^a-zA-Z0-9ก-๙])@?${escaped}(?:$|[^a-zA-Z0-9ก-๙])`, "i");
          if (regex.test(trimmedText)) {
            matchedOaName = kw;
            break;
          }
        }
      }

      // Check @all / @everyone emergency vs routine patrol
      const hasAllTag = trimmedText ? /@(all|everyone)/i.test(trimmedText) : false;
      const isAllEmergency = hasAllTag && (!isConfirmedGuard || !isGuardReport || /(ด่วน|ช่วย|เปิด|ติด|หาย|พัง|ร้องเรียน|สอบถาม|รบกวน|นายจ้าง|ผู้จัดการ)/i.test(trimmedText));

      // --- ALERT ROUTING RULES ---
// 1. Inspector speaking -> DO NOT alert Command Center (avoid duplicate noise)
// 2. Employer speaking -> ALWAYS ALERT Command Center (especially if tagging OA, inspector, or asking work)
// 3. Guard / Member speaking -> ONLY alert if explicitly mentions an EMPLOYER name or emergency @all
let shouldAlertCommandRoom = false;
let alertHeader = "";
if (isInspector) {
shouldAlertCommandRoom = false;
} else if (isEmployer) {
shouldAlertCommandRoom = true;
alertHeader = (typeof matchedOaName !== "undefined" && matchedOaName)
? `🚨 [นายจ้างแท็กเรียก สนง.สายตรวจ / LINE OA: "${matchedOaName}"]`
: (matchedInspectorName
? `🚨 [นายจ้างแท็กเรียกสายตรวจ: "${matchedInspectorName}"]`
: (matchedEmployerName ? `🚨 [นายจ้างกล่าวถึง: "${matchedEmployerName}"]` : `🚨 [ข้อความจากนายจ้าง/ลูกค้า]`));
} else {
if (matchedEmployerName) {
shouldAlertCommandRoom = true;
alertHeader = `🚨 [รปภ. กล่าวถึงนายจ้าง: "${matchedEmployerName}"]`;
} else if (isAllEmergency) {
shouldAlertCommandRoom = true;
alertHeader = `🚨 [รปภ. แท็ก @ALL ฉุกเฉิน]`;
}
}
// Send Push Alert to Command Center LINE Group (exactly 1 message per 5 minutes per source group)
if (shouldAlertCommandRoom && trimmedText && !isSummaryCommand && !confirmMatch && accessToken) {
recordEmployerInquiry({
groupId: group.groupId,
senderKey: group.senderKey,
senderName: senderProfile?.guard_name,
messageText: trimmedText,
}).catch(() => { });
const targetGroupSetting = (await db.prepare(
"SELECT value FROM system_settings WHERE key = 'line_reminder_target_group_id'"
).first()) as { value: string } | null;
let commandGroupId = targetGroupSetting?.value || "";
if (!commandGroupId) {
const fallback = (await db.prepare(
"SELECT id FROM line_group_registry WHERE group_name LIKE '%สายตรวจแอลฟา%' OR group_name LIKE '%สนง.%สายตรวจ%' LIMIT 1"
).first()) as { id: string } | null;
commandGroupId = fallback?.id || "";
}
if (commandGroupId && commandGroupId !== group.groupId) {
const pushDebounceCutoff = new Date(Date.now() - 5 * 60_000).toISOString();
const recentPush = (await db.prepare(`
SELECT id FROM line_outbound_audit
WHERE group_id = ? AND action_type = 'push-alert' AND status = 'sent' AND sent_at >= ?
LIMIT 1
`).bind(group.groupId, pushDebounceCutoff).first()) as any;
const lastMemPush = pushMemoryDebounce.get(group.groupId) || 0;
if (!recentPush && Date.now() - lastMemPush > 5 * 60_000) {
pushMemoryDebounce.set(group.groupId, Date.now());
const groupInfo = (await db.prepare("SELECT group_name FROM line_group_registry WHERE id = ?").bind(group.groupId).first()) as { group_name: string } | null;
const groupDisplayName = groupInfo?.group_name || `กลุ่ม (${group.groupId.slice(-6)})`;
const senderLabel = senderProfile?.guard_name || (isEmployer ? "นายจ้าง/ลูกค้า" : "สมาชิกในกลุ่ม");
const alertMsg = `${alertHeader}\n🏢 กลุ่ม: ${groupDisplayName}\n👤 ผู้ส่ง: ${senderLabel}\n💬 ข้อความ:\n"${trimmedText.slice(0, 300)}"\n⏰ เวลา: ${bangkokNow().time} น.`;
const remainingAlertQuota = await lineQuotaRemaining(accessToken).catch(() => null);
if (remainingAlertQuota !== null && remainingAlertQuota <= 0) {
await logOutboundAction({ id: `skip-quota-${Date.now()}`, groupId: group.groupId, triggerEventId: group.eventId, actionType: "push-alert", status: "skipped", skipReason: "โควต้า LINE เดือนนี้หมด (429) — แสดงเฉพาะบนเว็บศูนย์สั่งการ" });
}
const pushRes = remainingAlertQuota !== null && remainingAlertQuota <= 0 ? null : await fetch("https://api.line.me/v2/bot/message/push", {
method: "POST",
headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
body: JSON.stringify({ to: commandGroupId, messages: [{ type: "text", text: alertMsg }] }),
}).catch(() => null);
if (pushRes && pushRes.ok) {
await logOutboundAction({
id: `push-${Date.now()}`,
groupId: group.groupId,
triggerEventId: group.eventId,
actionType: "push-alert",
status: "sent",
skipReason: `✓ ส่งแจ้งเตือนศูนย์สั่งการสำเร็จ (${alertHeader})`,
});
} else {
await logOutboundAction({
id: `push-fail-${Date.now()}`,
groupId: group.groupId,
triggerEventId: group.eventId,
actionType: "push-alert",
status: "failed",
skipReason: `ส่งแจ้งเตือนไม่สำเร็จ (${pushRes ? pushRes.status : "network"})`,
});
}
} else {
await logOutboundAction({
id: `skip-push-debounce-${Date.now()}`,
groupId: group.groupId,
triggerEventId: group.eventId,
actionType: "push-alert",
status: "skipped",
skipReason: "งดส่ง Push ซ้ำ: เพิ่งส่งแจ้งเตือนกลุ่มนี้ไปในรอบ 5 นาที (ประหยัดโควต้า)",
});
}
} else {
await logOutboundAction({
id: `skip-push-notarget-${Date.now()}`,
groupId: group.groupId,
triggerEventId: group.eventId,
actionType: "push-alert",
status: "skipped",
skipReason: "ไม่ได้ส่งแจ้งเตือน: ยังไม่ได้ตั้งกลุ่มสั่งการ หรือกลุ่มต้นทางคือกลุ่มสั่งการ",
});
}
}
// --- SILENCE RULES FOR BOT ---
// If sender is Employer or Inspector -> Bot is 100% SILENT! (No sticker)
if (isEmployer || isInspector) {
await logOutboundAction({
id: `skip-${isEmployer ? "employer" : "inspector"}-${Date.now()}`,
groupId: group.groupId,
triggerEventId: group.eventId,
actionType: "auto-reply-close",
stickerPackageId: "11538",
stickerId: "51626520",
status: "skipped",
skipReason: `งดส่งสติกเกอร์: ผู้ส่งคือ${isEmployer ? "นายจ้าง/ลูกค้า" : "สายตรวจ"} "${senderProfile?.guard_name || "เจ้าหน้าที่"}" (บอทเงียบ 100% เพื่อความสะดวกในการคุยงาน)`,
});
continue;
}
// --- DIRECT SYNCHRONOUS STICKER REPLY FOR GUARDS (SERVERLESS-SAFE, NO TIMER, 0 QUOTA) ---
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
const queuedToken = accessToken || (await getEffectiveLineToken()) || undefined;
if (group.replyToken && queuedToken) {
const queuedRes = await fetch("https://api.line.me/v2/bot/message/reply", {
method: "POST",
headers: { "Content-Type": "application/json", Authorization: `Bearer ${queuedToken}` },
body: JSON.stringify({ replyToken: group.replyToken, messages: [{ type: "sticker", packageId: stickerPackageId, stickerId: stickerId }] }),
}).catch(() => null);
await logOutboundAction({
id: `queued-${Date.now()}`,
groupId: group.groupId,
triggerEventId: triggerEventId,
actionType: "manual-batch-queued",
stickerPackageId: stickerPackageId,
stickerId: stickerId,
status: queuedRes && queuedRes.ok ? "sent" : "failed",
skipReason: queuedRes && queuedRes.ok ? "✓ ส่งสติกเกอร์จากคิว manual-batch (reply ฟรี)" : "ส่งสติกเกอร์จากคิวไม่สำเร็จ",
}).catch(() => { });
}
} else {
const isEligibleForSticker = isLastInBatch && !isEmployer && !isInspector;
if (isEligibleForSticker) {
try {
const configData = (await db.prepare(`
SELECT mode, sticker_package_id, sticker_id, cooldown_minutes, last_reply_at
FROM line_auto_reply_configs
WHERE group_id = ?
`).bind(group.groupId).first()) as any;
if (configData?.mode !== "disabled") {
let cooldownMin = Number(configData?.cooldown_minutes ?? 2);
if (!Number.isFinite(cooldownMin) || cooldownMin < 1) cooldownMin = 1;
if (cooldownMin > 2) cooldownMin = 2;
const stickerPkg = configData?.sticker_package_id || "11538";
const stickerStk = configData?.sticker_id || "51626520";
const nowIso = bangkokNow().iso;
const debounceCutoffIso = new Date(Date.now() - (cooldownMin * 60_000)).toISOString();
const recentSticker = (await db.prepare(`
SELECT id, sent_at FROM line_outbound_audit
WHERE group_id = ? AND action_type = 'auto-reply-close' AND status = 'sent' AND sent_at >= ?
LIMIT 1
`).bind(group.groupId, debounceCutoffIso).first()) as any;
const effectiveToken = accessToken || (await getEffectiveLineToken()) || undefined;
if (recentSticker) {
await logOutboundAction({
id: `skip-cooldown-${Date.now()}`,
groupId: group.groupId,
triggerEventId: group.eventId,
actionType: "auto-reply-close",
stickerPackageId: stickerPkg,
stickerId: stickerStk,
status: "skipped",
skipReason: `กันเบิ้ล: มีสติกเกอร์ตอบรับในรอบ ${cooldownMin} นาทีแล้ว (รวบยอดข้อความ+ภาพเข้าเวร)`,
});
} else if (!effectiveToken) {
await logOutboundAction({
id: `fail-token-${Date.now()}`,
groupId: group.groupId,
triggerEventId: group.eventId,
actionType: "auto-reply-close",
stickerPackageId: stickerPkg,
stickerId: stickerStk,
status: "failed",
skipReason: "ไม่พบ LINE Channel Access Token ในระบบ",
});
} else if (group.replyToken) {
const replyRes = await fetch("https://api.line.me/v2/bot/message/reply", {
method: "POST",
headers: { "Content-Type": "application/json", Authorization: `Bearer ${effectiveToken}` },
body: JSON.stringify({ replyToken: group.replyToken, messages: [{ type: "sticker", packageId: stickerPkg, stickerId: stickerStk }] }),
}).catch((err) => { console.error("Fetch reply error:", err); return null; });
if (replyRes && replyRes.ok) {
await db.prepare(`
INSERT INTO line_auto_reply_configs (group_id, mode, sticker_package_id, sticker_id, cooldown_minutes, last_reply_at, updated_at)
VALUES (?, 'ack_only', ?, ?, ?, ?, ?)
ON CONFLICT(group_id) DO UPDATE SET last_reply_at = excluded.last_reply_at, updated_at = excluded.updated_at
`).bind(group.groupId, stickerPkg, stickerStk, cooldownMin, nowIso, nowIso).run().catch(() => { });
await logOutboundAction({
id: `reply-${Date.now()}`,
groupId: group.groupId,
triggerEventId: group.eventId,
actionType: "auto-reply-close",
stickerPackageId: stickerPkg,
stickerId: stickerStk,
status: "sent",
skipReason: "✓ ส่งสติกเกอร์ตอบรับเข้าเวร รปภ. สำเร็จ (Direct Reply ฟรี)",
});
} else if (replyRes) {
const errJson = await replyRes.json().catch(() => ({}));
await logOutboundAction({
id: `fail-${Date.now()}`,
groupId: group.groupId,
triggerEventId: group.eventId,
actionType: "auto-reply-close",
stickerPackageId: stickerPkg,
stickerId: stickerStk,
status: "failed",
skipReason: `LINE API Reply Error (${replyRes.status}): ${JSON.stringify(errJson)}`,
});
} else {
await logOutboundAction({
id: `fail-net-${Date.now()}`,
groupId: group.groupId,
triggerEventId: group.eventId,
actionType: "auto-reply-close",
stickerPackageId: stickerPkg,
stickerId: stickerStk,
status: "failed",
skipReason: "เชื่อมต่อ LINE API ไม่สำเร็จ (Network / Timeout)",
});
}
}
}
} catch (e: any) {
await logOutboundAction({
id: `err-${Date.now()}`,
groupId: group.groupId,
triggerEventId: group.eventId,
actionType: "auto-reply-close",
stickerPackageId: "11538",
stickerId: "51626520",
status: "error",
skipReason: `Exception: ${e?.message || "unknown"}`,
}).catch(() => { });
}
}
}
  }
}));
void schedule;
return Response.json({ ok: true, accepted: saved.filter((result) => result?.saved).length });
}
