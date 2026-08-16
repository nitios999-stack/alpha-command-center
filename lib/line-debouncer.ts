import {
  database,
  ensureDatabase,
  logOutboundAction,
  getEffectiveLineToken,
  consumeQueuedSticker,
  bangkokNow,
} from "../db/command-center";

export interface DebounceEventInput {
  groupId: string;
  eventId: string;
  replyToken: string;
  rawUserId?: string;
  senderKey?: string;
  accessToken?: string;
}

interface GroupDebounceSession {
  groupId: string;
  eventId: string;
  replyToken: string;
  rawUserId?: string;
  senderKey?: string;
  accessToken?: string;
  initialReceivedAt: number;
  latestReceivedAt: number;
  timer: NodeJS.Timeout | null;
}

// Global in-memory map for per-group isolated debouncing
const activeGroupDebouncers = new Map<string, GroupDebounceSession>();

/**
 * Schedules or refreshes a 45-second debounce window for a specific LINE group.
 * While the guard is still transmitting messages/photos, each incoming event extends
 * the 45s timer and captures the freshest replyToken. Once the guard is completely
 * finished and 45s of silence passes, exactly 1 acknowledge sticker is sent.
 */
export function scheduleGroupStickerDebounce(input: DebounceEventInput): void {
  const { groupId, eventId, replyToken, rawUserId, senderKey, accessToken } = input;
  if (!groupId || !eventId || !replyToken) return;

  const now = Date.now();
  const existing = activeGroupDebouncers.get(groupId);

  if (existing) {
    // Clear previous timer for this group
    if (existing.timer) {
      clearTimeout(existing.timer);
    }
    existing.eventId = eventId;
    existing.replyToken = replyToken;
    existing.rawUserId = rawUserId || existing.rawUserId;
    existing.senderKey = senderKey || existing.senderKey;
    existing.accessToken = accessToken || existing.accessToken;
    existing.latestReceivedAt = now;
  } else {
    activeGroupDebouncers.set(groupId, {
      groupId,
      eventId,
      replyToken,
      rawUserId,
      senderKey,
      accessToken,
      initialReceivedAt: now,
      latestReceivedAt: now,
      timer: null,
    });
  }

  const session = activeGroupDebouncers.get(groupId)!;

  // Set 45-second debounce timer (45,000 ms)
  // LINE reply tokens are valid for up to 60s, so 45s after the latest event is optimal
  session.timer = setTimeout(async () => {
    try {
      await executeGroupStickerReply(session);
    } catch (error) {
      console.error(`[LineDebouncer] Error executing sticker for group ${groupId}:`, error);
    } finally {
      // Clean up session if it hasn't been superseded
      const current = activeGroupDebouncers.get(groupId);
      if (current && current.eventId === session.eventId) {
        activeGroupDebouncers.delete(groupId);
      }
    }
  }, 45_000);
}

/**
 * Executes all safety validations and sends a single sticker reply.
 */
export async function executeGroupStickerReply(session: GroupDebounceSession): Promise<{ ok: boolean; skipped?: boolean; reason?: string; error?: string }> {
  const { groupId, eventId, replyToken, rawUserId, senderKey, accessToken: passedToken } = session;

  // 1. In-memory supersession check
  const currentTracked = activeGroupDebouncers.get(groupId);
  if (currentTracked && currentTracked.eventId !== eventId) {
    return { ok: true, skipped: true, reason: "superseded_by_newer_event" };
  }

  await ensureDatabase();
  const db = database();

  // 2. Command room exclusion check
  const targetGroupSetting = (await db.prepare(
    "SELECT value FROM system_settings WHERE key = 'line_reminder_target_group_id'"
  ).first()) as { value: string } | null;

  if (targetGroupSetting?.value && targetGroupSetting.value === groupId) {
    return { ok: true, skipped: true, reason: "command_room_no_stickers" };
  }

  // 3. Employer silence window: if any employer inquiry occurred in the last 30 minutes, stay silent
  const inquiryCutoffIso = new Date(Date.now() - 30 * 60_000).toISOString();
  const recentInquiry = (await db.prepare(`
    SELECT id, message_text, urgency 
    FROM employer_inquiries 
    WHERE group_id = ? 
      AND (received_at >= datetime('now', '-30 minutes') OR replace(received_at, ' ', 'T') >= ?)
      AND status != 'resolved'
      AND message_text NOT LIKE '%รปภ%'
      AND message_text NOT LIKE '%ว.4%'
      AND message_text NOT LIKE '%ตรวจ%'
      AND message_text NOT LIKE '%ปกติ%'
      AND message_text NOT LIKE '%ผลัด%'
      AND message_text NOT LIKE '%กะ%'
    ORDER BY received_at DESC LIMIT 1
  `).bind(groupId, inquiryCutoffIso).first()) as { id: string; message_text: string } | null;

  if (recentInquiry) {
    await logOutboundAction({
      id: `skip-emp-${Date.now()}`,
      groupId,
      triggerEventId: eventId,
      actionType: "auto-reply-close",
      stickerPackageId: "11538",
      stickerId: "51626520",
      status: "skipped",
      skipReason: `งดส่งสติกเกอร์: ตรวจพบข้อความนายจ้าง "${recentInquiry.message_text.slice(0, 40)}" (เปิดโหมดเงียบ 30 นาที)`,
    });
    return { ok: true, skipped: true, reason: "employer_message_no_sticker" };
  }

  // 4. Group config check
  const configData = (await db.prepare(
    "SELECT * FROM line_auto_reply_configs WHERE group_id = ?"
  ).bind(groupId).first()) as any;

  if (configData && configData.mode === "disabled") {
    return { ok: true, skipped: true, reason: "disabled_by_user" };
  }

  // 5. Sender role check: never reply to employers or inspectors
  let senderProfile: { id: string; guard_name: string; role: string } | null = null;
  const uId = rawUserId || "";
  const sKey = senderKey || "";

  if (uId || sKey) {
    senderProfile = (await db.prepare(`
      SELECT id, guard_name, role 
      FROM guard_profiles 
      WHERE active = 1 
        AND (
          (id = ? AND ? != '') OR 
          (id = ? AND ? != '') OR 
          (display_name = ? AND ? != '') OR 
          (display_name = ? AND ? != '')
        )
      LIMIT 1
    `).bind(uId, uId, sKey, sKey, uId, uId, sKey, sKey).first()) as { id: string; guard_name: string; role: string } | null;
  }

  const isEmployer = senderProfile?.role === "employer";
  const isInspector = senderProfile?.role === "inspector";

  if (isEmployer || isInspector) {
    await logOutboundAction({
      id: `skip-${isEmployer ? "employer" : "inspector"}-${Date.now()}`,
      groupId,
      triggerEventId: eventId,
      actionType: "auto-reply-close",
      stickerPackageId: "11538",
      stickerId: "51626520",
      status: "skipped",
      skipReason: `งดส่งสติกเกอร์: ผู้ส่งคือ${isEmployer ? "นายจ้าง/ลูกค้า" : "สายตรวจ"} "${senderProfile?.guard_name || "เจ้าหน้าที่"}" (บอทเงียบ 100%)`,
    });
    return { ok: true, skipped: true, reason: "sender_is_privileged_role" };
  }

  // 6. Anti-Double Sticker Patrol Cooldown (5 to 30 minutes)
  const cooldownMin = configData?.cooldown_minutes ?? 5;
  const debounceCutoffIso = new Date(Date.now() - cooldownMin * 60_000).toISOString();

  const recentSentSticker = (await db.prepare(`
    SELECT id, sent_at 
    FROM line_outbound_audit 
    WHERE group_id = ? 
      AND status = 'sent' 
      AND (sent_at >= ? OR replace(sent_at, ' ', 'T') >= ?)
    LIMIT 1
  `).bind(groupId, debounceCutoffIso, debounceCutoffIso).first()) as { id: string; sent_at: string } | null;

  if (recentSentSticker) {
    await logOutboundAction({
      id: `skip-cooldown-${Date.now()}`,
      groupId,
      triggerEventId: eventId,
      actionType: "auto-reply-close",
      stickerPackageId: configData?.sticker_package_id || "11538",
      stickerId: configData?.sticker_id || "51626520",
      status: "skipped",
      skipReason: `งดส่งซ้ำ: เพิ่งตอบรับรายงานไปในรอบ ${cooldownMin} นาที (รวบยอดข้อความ+ภาพเข้าเวร 45 วิ)`,
    });
    return { ok: true, skipped: true, reason: "cooldown_active" };
  }

  // Check if there is a manual queued sticker for this group first
  const queuedSticker = await consumeQueuedSticker(groupId);
  const stickerPackageId = queuedSticker?.stickerPackageId || configData?.sticker_package_id || "11538";
  const stickerId = queuedSticker?.stickerId || configData?.sticker_id || "51626520";
  const actionType = queuedSticker ? "manual-batch-queued" : "auto-reply-close";
  const triggerEventId = queuedSticker ? queuedSticker.queuedId : eventId;
  const nowIso = bangkokNow().iso;

  // 7. Atomic DB Lock Acquisition
  await db.prepare(`
    INSERT INTO line_auto_reply_configs (group_id, mode, sticker_package_id, sticker_id, cooldown_minutes, last_reply_at, updated_at)
    VALUES (?, 'ack_only', ?, ?, ?, '2000-01-01T00:00:00.000Z', ?)
    ON CONFLICT(group_id) DO NOTHING
  `).bind(groupId, stickerPackageId, stickerId, cooldownMin, nowIso).run().catch(() => {});

  const lockResult = (await db.prepare(`
    UPDATE line_auto_reply_configs 
    SET last_reply_at = ?, last_inbound_event_id = ?, updated_at = ?
    WHERE group_id = ? 
      AND (last_reply_at IS NULL OR last_reply_at <= ?)
  `).bind(nowIso, eventId, nowIso, groupId, debounceCutoffIso).run()) as any;

  if (lockResult && typeof lockResult.changes === "number" && lockResult.changes === 0) {
    return { ok: true, skipped: true, reason: "lock_not_acquired_cooldown_active" };
  }

  // 8. Send Sticker via LINE Reply API
  const accessToken = passedToken || (await getEffectiveLineToken());
  if (!accessToken) {
    await logOutboundAction({
      id: `fail-token-${Date.now()}`,
      groupId,
      triggerEventId,
      actionType,
      stickerPackageId,
      stickerId,
      status: "failed",
      skipReason: "ไม่พบ LINE Channel Access Token ในระบบ",
    });
    return { ok: false, error: "no_line_token" };
  }

  const replyRes = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [
        {
          type: "sticker",
          packageId: stickerPackageId,
          stickerId: stickerId,
        },
      ],
    }),
  }).catch((err) => {
    console.error("[LineDebouncer] Reply fetch error:", err);
    return null;
  });

  if (replyRes && replyRes.ok) {
    await logOutboundAction({
      id: `reply-${Date.now()}`,
      groupId,
      triggerEventId,
      actionType,
      stickerPackageId,
      stickerId,
      status: "sent",
      skipReason: queuedSticker
        ? "✓ ส่งสติกเกอร์ตอบรับ (คิวส่งแมนนวลสำเร็จ)"
        : "✓ ส่งสติกเกอร์ตอบรับรายงาน รปภ. สำเร็จ (จังหวะปิดจบ 45 วิ)",
    });
    return { ok: true, sent: true };
  }

  const errBody = replyRes ? await replyRes.text().catch(() => "") : "network_error";
  await logOutboundAction({
    id: `fail-${Date.now()}`,
    groupId,
    triggerEventId,
    actionType,
    stickerPackageId,
    stickerId,
    status: "failed",
    skipReason: `Reply API Error: ${replyRes?.status || "net"} ${errBody.slice(0, 200)}`,
  });

  return { ok: false, error: errBody };
}

/**
 * Returns the current in-flight debounce status for diagnostics/testing.
 */
export function getActiveDebouncerCount(): number {
  return activeGroupDebouncers.size;
}

export function clearAllDebouncersForTest(): void {
  for (const session of activeGroupDebouncers.values()) {
    if (session.timer) clearTimeout(session.timer);
  }
  activeGroupDebouncers.clear();
}
