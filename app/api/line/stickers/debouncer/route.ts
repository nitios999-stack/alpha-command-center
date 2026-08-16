import { database, ensureDatabase, logOutboundAction, getEffectiveLineToken } from "../../../../../db/command-center";

export const runtime = "nodejs";

// Global in-memory map to track the latest in-flight event per group
const groupDebouncerTracker = new Map<string, { eventId: string; timestamp: number }>();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { groupId, eventId, replyToken, accessToken: passedToken } = body;
    
    if (!groupId || !eventId || !replyToken) {
      return Response.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    // Register this event as the latest in-flight event for this group
    groupDebouncerTracker.set(groupId, { eventId, timestamp: Date.now() });

    // หน่วงเวลารอ 15 วินาที เพื่อรวบรูปภาพ/ข้อความทั้งหมด (LINE Reply Token มีอายุ 60 วินาที)
    await new Promise((resolve) => setTimeout(resolve, 15000));

    // ตรวจสอบ In-memory: ถ้ามีข้อความใหม่กว่าเข้ามาในกลุ่มเดียวกันระหว่างที่รอ ให้ตัวนี้สละสิทธิ์ทันที
    const currentTracked = groupDebouncerTracker.get(groupId);
    if (currentTracked && currentTracked.eventId !== eventId) {
      return Response.json({ ok: true, skipped: true, reason: "superseded_by_newer_in_flight_event" });
    }

    await ensureDatabase();
    const db = database();

    // 0. ตรวจสอบว่ากลุ่มนี้เป็น "กลุ่มไลน์ศูนย์สั่งการ" หรือไม่
    const targetGroupSetting = (await db.prepare(
      "SELECT value FROM system_settings WHERE key = 'line_reminder_target_group_id'"
    ).first()) as { value: string } | null;

    if (targetGroupSetting?.value && targetGroupSetting.value === groupId) {
      return Response.json({ ok: true, skipped: true, reason: "command_room_no_stickers" });
    }

    // 0.5 ตรวจสอบ Silence Window: มีข้อความจากนายจ้างหรือลูกค้าในรอบ 30 นาทีหรือไม่ (ไม่นับรายงานตรวจ รปภ.)
    const recentInquiry = (await db.prepare(`
      SELECT id, message_text, urgency 
      FROM employer_inquiries 
      WHERE group_id = ? 
        AND received_at >= datetime('now', '-30 minutes')
        AND status != 'resolved'
        AND message_text NOT LIKE '%รปภ%'
        AND message_text NOT LIKE '%ว.4%'
        AND message_text NOT LIKE '%ตรวจ%'
        AND message_text NOT LIKE '%ปกติ%'
        AND message_text NOT LIKE '%ผลัด%'
        AND message_text NOT LIKE '%กะ%'
      ORDER BY received_at DESC LIMIT 1
    `).bind(groupId).first()) as { id: string; message_text: string; urgency: string } | null;

    if (recentInquiry) {
      await logOutboundAction({
        id: `skip-employer-${Date.now()}`,
        groupId,
        triggerEventId: eventId,
        actionType: "auto-reply-close",
        stickerPackageId: "11538",
        stickerId: "51626520",
        status: "skipped",
        skipReason: `งดส่งสติกเกอร์: ตรวจพบข้อความนายจ้าง "${recentInquiry.message_text.slice(0, 40)}" (เปิดโหมดเงียบ 30 นาทีเพื่อคุยงานสะดวก)`,
      });
      return Response.json({ ok: true, skipped: true, reason: "employer_message_no_sticker" });
    }

    const configData = (await db.prepare(
      "SELECT * FROM line_auto_reply_configs WHERE group_id = ?"
    ).bind(groupId).first()) as any;
    
    // ถ้าผู้ใช้ตั้งใจกดปิดไว้ ให้ข้าม
    if (configData && configData.mode === "disabled") {
      return Response.json({ ok: true, skipped: true, reason: "disabled_by_user" });
    }

    // 1. ตรวจสอบว่าอีเวนต์นี้เป็นข้อความล่าสุดในกลุ่มนี้จริงๆ หรือไม่ (ตรวจสอบระดับ Database)
    const latestGroupEvent = (await db.prepare(`
      SELECT id, rowid 
      FROM line_webhook_events 
      WHERE group_id = ? AND event_type = 'message'
      ORDER BY rowid DESC LIMIT 1
    `).bind(groupId).first()) as { id: string; rowid: number } | null;

    if (latestGroupEvent && latestGroupEvent.id !== eventId) {
      return Response.json({ ok: true, skipped: true, reason: "newer_message_in_database" });
    }

    // 1.5 ตรวจสอบตัวตนผู้ส่ง (ต้องเป็น รปภ. ที่ยืนยันแล้วเท่านั้น)
    const currentEvent = (await db.prepare(
      "SELECT rowid, received_at, sender_key, raw_user_id, message_type FROM line_webhook_events WHERE id = ?"
    ).bind(eventId).first()) as { rowid: number; received_at: string; sender_key: string | null; raw_user_id: string | null; message_type: string | null } | null;

    const uId = currentEvent?.raw_user_id;
    const sKey = currentEvent?.sender_key;

    let senderProfile: { id: string; guard_name: string; role: string } | null = null;

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
      `).bind(uId || "", uId || "", sKey || "", sKey || "", uId || "", uId || "", sKey || "", sKey || "").first()) as { id: string; guard_name: string; role: string } | null;
    }

    const isExplicitEmployer = senderProfile?.role === "employer";
    if (isExplicitEmployer) {
      await logOutboundAction({
        id: `skip-employer-${Date.now()}`,
        groupId,
        triggerEventId: eventId,
        actionType: "auto-reply-close",
        stickerPackageId: "11538",
        stickerId: "51626520",
        status: "skipped",
        skipReason: `งดส่งสติกเกอร์: ผู้ส่งคือนายจ้าง/ลูกค้า "${senderProfile?.guard_name || "นายจ้าง"}" (งดตอบสติกเกอร์ 100%)`,
      });
      return Response.json({ ok: true, skipped: true, reason: "sender_is_employer" });
    }

    // 2. ตรวจสอบประวัติการส่งสติกเกอร์ในรอบ 25 นาทีที่ผ่านมา (กันเบิ้ล 100%)
    const recentSentSticker = (await db.prepare(`
      SELECT id, sent_at 
      FROM line_outbound_audit 
      WHERE group_id = ? 
        AND status = 'sent' 
        AND sent_at >= datetime('now', '-25 minutes')
      LIMIT 1
    `).bind(groupId).first()) as { id: string; sent_at: string } | null;

    if (recentSentSticker) {
      return Response.json({ ok: true, skipped: true, reason: "recent_sticker_already_sent_in_25min" });
    }

    const stickerPackageId = configData?.sticker_package_id || "11538";
    const stickerId = configData?.sticker_id || "51626520";
    const cooldownMinutes = configData?.cooldown_minutes ?? 30;
    const now = new Date();

    // 3. ATOMIC LOCK ACQUISITION ON DATABASE (ป้องกัน Race Condition 100%)
    await db.prepare(`
      INSERT INTO line_auto_reply_configs (group_id, mode, sticker_package_id, sticker_id, cooldown_minutes, last_reply_at, updated_at)
      VALUES (?, 'ack_only', ?, ?, ?, '2000-01-01T00:00:00.000Z', ?)
      ON CONFLICT(group_id) DO NOTHING
    `).bind(groupId, stickerPackageId, stickerId, cooldownMinutes, now.toISOString()).run();

    const lockResult = (await db.prepare(`
      UPDATE line_auto_reply_configs 
      SET last_reply_at = ?, last_inbound_event_id = ?, updated_at = ?
      WHERE group_id = ? 
        AND (last_reply_at IS NULL OR last_reply_at <= datetime('now', '-25 minutes'))
    `).bind(now.toISOString(), eventId, now.toISOString(), groupId).run()) as any;

    if (lockResult && typeof lockResult.changes === "number" && lockResult.changes === 0) {
      return Response.json({ ok: true, skipped: true, reason: "lock_not_acquired_cooldown_active" });
    }

    const actionId = `debounce-${Date.now()}`;
    const env = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
    const accessToken = passedToken || (await getEffectiveLineToken()) || env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!accessToken) {
      return Response.json({ ok: false, error: "no token" }, { status: 500 });
    }

    // 4. ส่งสติกเกอร์ตอบรับ 1 ตัวผ่าน Reply API
    const response = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        replyToken: replyToken,
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
        groupId: groupId,
        triggerEventId: eventId,
        actionType: "auto-reply-close",
        stickerPackageId: stickerPackageId,
        stickerId: stickerId,
        status: "failed",
        skipReason: `Reply API Error: ${response.status} ${errBody.slice(0, 200)}`
      });
      return Response.json({ ok: false, error: errBody });
    }

    await logOutboundAction({
      id: actionId,
      groupId: groupId,
      triggerEventId: eventId,
      actionType: "auto-reply-close",
      stickerPackageId: stickerPackageId,
      stickerId: stickerId,
      status: "sent",
      skipReason: "จังหวะปิดจบ 40 วิ (reply ฟรี 100%)"
    });

    return Response.json({ ok: true, sent: true });

  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
