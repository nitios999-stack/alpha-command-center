import { database, ensureDatabase, logOutboundAction } from "../../../../../db/command-center";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { groupId, eventId, replyToken, accessToken: passedToken } = body;
    
    if (!groupId || !eventId || !replyToken) {
      return Response.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    // หน่วงเวลารอ 35 วินาที เพื่อดูว่ามีข้อความ/รูปตามมาอีกหรือไม่ (LINE Token อยู่ได้ 60 วิ ปลอดภัย 100%)
    await new Promise((resolve) => setTimeout(resolve, 35000));

    await ensureDatabase();
    const db = database();

    // 0. ตรวจสอบว่ากลุ่มนี้เป็น "กลุ่มไลน์ศูนย์สั่งการ" หรือไม่
    // หากเป็นกลุ่มสั่งการ ห้ามส่งสติกเกอร์ตอบรับอัตโนมัติเด็ดขาด (ส่งเฉพาะข้อความคำสั่ง/สรุปเท่านั้น)
    const targetGroupSetting = (await db.prepare(
      "SELECT value FROM system_settings WHERE key = 'line_reminder_target_group_id'"
    ).first()) as { value: string } | null;

    if (targetGroupSetting?.value && targetGroupSetting.value === groupId) {
      return Response.json({ ok: true, skipped: true, reason: "command_room_no_stickers" });
    }

    // 0.5 ตรวจสอบว่ากลุ่มนี้ตั้งค่าให้งดสติกเกอร์เมื่อมีข้อความนายจ้างหรือไม่ (เปิด/ปิดเป็นรายกลุ่มได้)
    // ค่าเริ่มต้น: ให้บอทตอบสติกเกอร์ตามปกติไปก่อนตามความต้องการของผู้ดูแล
    const configData = (await db.prepare(
      "SELECT * FROM line_auto_reply_configs WHERE group_id = ?"
    ).bind(groupId).first()) as any;
    
    // ถ้าผู้ใช้ตั้งใจกดปิดไว้ ให้ข้าม
    if (configData && configData.mode === "disabled") {
      return Response.json({ ok: true, skipped: true, reason: "disabled_by_user" });
    }

    if (configData?.silence_on_employer === 1) {
      const recentInquiry = (await db.prepare(`
        SELECT id, message_text, urgency 
        FROM employer_inquiries 
        WHERE group_id = ? AND received_at >= datetime('now', '-3 minutes')
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
          skipReason: `งดส่งสติกเกอร์: ตรวจพบข้อความนายจ้าง "${recentInquiry.message_text.slice(0, 40)}" (เปิดโหมดเงียบเฉพาะกลุ่มนี้)`,
        });
        return Response.json({ ok: true, skipped: true, reason: "employer_message_no_sticker" });
      }
    }
    
    // 1. ค้นหา event ปัจจุบันในฐานข้อมูลเพื่อดึง rowid, raw_user_id และ sender_key
    const currentEvent = (await db.prepare(
      "SELECT rowid, received_at, sender_key, raw_user_id, message_type FROM line_webhook_events WHERE id = ?"
    ).bind(eventId).first()) as { rowid: number; received_at: string; sender_key: string | null; raw_user_id: string | null; message_type: string | null } | null;

    // 1.5 ตรวจสอบตัวตนผู้ส่ง (รปภ. vs นายจ้าง vs คนแปลกหน้า)
    // เงื่อนไข:
    // - ถ้ารปภ. ส่งมา -> ให้บอทตอบสติกเกอร์
    // - ถ้านายจ้างส่ง หรือคนแปลกหน้าส่งมา -> ไม่ต้องตอบ เพื่อให้เห็นแชทและคุยงานสะดวก
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

    // ถ้าพบนายจ้าง -> งดตอบเด็ดขาด
    if (senderProfile && senderProfile.role === "employer") {
      await logOutboundAction({
        id: `skip-employer-${Date.now()}`,
        groupId,
        triggerEventId: eventId,
        actionType: "auto-reply-close",
        stickerPackageId: "11538",
        stickerId: "51626520",
        status: "skipped",
        skipReason: `งดส่งสติกเกอร์: ผู้ส่งคือนายจ้าง/ลูกค้า "${senderProfile.guard_name}" (บอทเงียบ 100% เพื่อให้เห็นแชทและคุยงานสะดวก)`,
      });
      return Response.json({ ok: true, skipped: true, reason: "employer_message_no_sticker" });
    }

    // ถ้าไม่พบในทำเนียบ รปภ. (คนแปลกหน้า / บุคคลภายนอก) -> งดตอบเด็ดขาด
    const isGuard = senderProfile && (senderProfile.role === "regular" || senderProfile.role === "spare" || senderProfile.role === "head_guard");
    if (!isGuard) {
      await logOutboundAction({
        id: `skip-stranger-${Date.now()}`,
        groupId,
        triggerEventId: eventId,
        actionType: "auto-reply-close",
        stickerPackageId: "11538",
        stickerId: "51626520",
        status: "skipped",
        skipReason: `งดส่งสติกเกอร์: ผู้ส่งเป็นคนแปลกหน้า/ยังไม่ได้ลงทะเบียนเป็น รปภ. ในทำเนียบ (บอทเงียบเพื่อไม่ให้รบกวนแชท)`,
      });
      return Response.json({ ok: true, skipped: true, reason: "stranger_no_sticker" });
    }

    if (currentEvent) {
      // ตรวจสอบว่ามีข้อความใหม่กว่าข้อความนี้ในกลุ่มเดียวกันส่งเข้ามาหรือไม่
      const newerEvent = (await db.prepare(
        "SELECT id FROM line_webhook_events WHERE group_id = ? AND event_type = 'message' AND rowid > ?"
      ).bind(groupId, currentEvent.rowid).first()) as { id: string } | null;

      if (newerEvent) {
        // มีข้อความใหม่เข้ามา แปลว่ายังส่งรูปไม่เสร็จ ให้ข้ามตัวนี้ไป (ตัวใหม่จะนับ 35 วิ ต่อเอง)
        return Response.json({ ok: true, skipped: true, reason: "newer_message_exists" });
      }
    }

    // 2. ดึงค่าตัวแปรสติกเกอร์ (ค่าเริ่มต้นอัตโนมัติ 100%: Brown & Friends ตะเบ๊ะ 11538/51626520, cooldown: 3 นาที)
    const stickerPackageId = configData?.sticker_package_id || "11538";
    const stickerId = configData?.sticker_id || "51626520";
    const cooldownMinutes = configData?.cooldown_minutes ?? 3;

    // เช็ก Cooldown
    const now = new Date();
    if (configData?.last_reply_at) {
      const lastReplyDate = new Date(configData.last_reply_at);
      const diffMinutes = (now.getTime() - lastReplyDate.getTime()) / 60000;
      if (diffMinutes < cooldownMinutes) {
        return Response.json({ ok: true, skipped: true, reason: "cooldown_active" });
      }
    }

    const actionId = `debounce-${Date.now()}`;
    const env = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
    const accessToken = passedToken || env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!accessToken) {
      return Response.json({ ok: false, error: "no token" }, { status: 500 });
    }

    // 3. ส่งสติกเกอร์ปิดท้าย 1 ตัว (35 วิ หลังรูปสุดท้าย) ผ่าน Reply API (ฟรี 100% ไม่เสียโควต้าของ LINE)
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

    // 4. บันทึกเวลาตอบกลับล่าสุดเพื่อกัน Cooldown
    await db.prepare(`
      INSERT INTO line_auto_reply_configs (group_id, mode, sticker_package_id, sticker_id, cooldown_minutes, last_reply_at, last_inbound_event_id, updated_at)
      VALUES (?, 'ack_only', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(group_id) DO UPDATE SET 
        last_reply_at = excluded.last_reply_at,
        last_inbound_event_id = excluded.last_inbound_event_id,
        updated_at = excluded.updated_at
    `).bind(groupId, stickerPackageId, stickerId, cooldownMinutes, now.toISOString(), eventId, now.toISOString()).run();

    await logOutboundAction({
      id: actionId,
      groupId: groupId,
      triggerEventId: eventId,
      actionType: "auto-reply-close",
      stickerPackageId: stickerPackageId,
      stickerId: stickerId,
      status: "sent",
      skipReason: "จังหวะปิดจบ 35 วิ (reply ฟรี 100%)"
    });

    return Response.json({ ok: true, sent: true });

  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
