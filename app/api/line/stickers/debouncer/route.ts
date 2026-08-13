import { database, ensureDatabase, logOutboundAction } from "../../../../../db/command-center";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { groupId, eventId, replyToken, receivedAt, accessToken: passedToken } = body;
    
    if (!groupId || !eventId || !replyToken) {
      return Response.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    // หน่วงเวลารอ 10 วินาที เพื่อดูว่ามีข้อความ/รูปตามมาอีกหรือไม่
    await new Promise((resolve) => setTimeout(resolve, 10000));

    await ensureDatabase();
    const db = database();
    
    // 1. ค้นหา event ปัจจุบันในฐานข้อมูลเพื่อดึง rowid และ received_at
    const currentEvent = (await db.prepare(
      "SELECT rowid, received_at FROM line_webhook_events WHERE id = ?"
    ).bind(eventId).first()) as { rowid: number; received_at: string } | null;

    if (currentEvent) {
      // ตรวจสอบว่ามีข้อความใหม่กว่าข้อความนี้ในกลุ่มเดียวกันส่งเข้ามาหรือไม่
      const newerEvent = (await db.prepare(
        "SELECT id FROM line_webhook_events WHERE group_id = ? AND event_type = 'message' AND rowid > ?"
      ).bind(groupId, currentEvent.rowid).first()) as { id: string } | null;

      if (newerEvent) {
        // มีข้อความใหม่เข้ามา แปลว่ายังรายงานไม่เสร็จ ให้ข้ามตัวนี้ไป
        return Response.json({ ok: true, skipped: true, reason: "newer_message_exists" });
      }

      // 2. เช็กว่าในรอบ 5 นาทีก่อนหน้านี้ มีการส่งรายงานกี่ข้อความ
      const eventTime = currentEvent.received_at || receivedAt || new Date().toISOString();
      const fiveMinutesAgo = new Date(new Date(eventTime).getTime() - 5 * 60000).toISOString();
      const burst = (await db.prepare(
        "SELECT COUNT(*) as c FROM line_webhook_events WHERE group_id = ? AND event_type = 'message' AND received_at <= ? AND received_at >= ?"
      ).bind(groupId, eventTime, fiveMinutesAgo).first()) as { c: number } | null;

      if (!burst || burst.c <= 1) {
        // ส่งมาแค่ข้อความเดียวเดี่ยวๆ ไม่เข้าข่ายการส่งหลายรูป/รายงานยาว ข้ามไป (มีบอตทักเปิดให้แล้ว)
        return Response.json({ ok: true, skipped: true, reason: "single_message_burst" });
      }
    }

    // 3. ดึงการตั้งค่าสติกเกอร์ของกลุ่ม
    const configData = (await db.prepare(
      "SELECT * FROM line_auto_reply_configs WHERE group_id = ? AND mode = 'reply_on_new_report'"
    ).bind(groupId).first()) as any;
    
    if (!configData || !configData.sticker_package_id || !configData.sticker_id) {
      return Response.json({ ok: true, skipped: true, reason: "no_config" });
    }

    const actionId = `debounce-${Date.now()}`;
    const env = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
    const accessToken = passedToken || env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!accessToken) {
      return Response.json({ ok: false, error: "no token" }, { status: 500 });
    }

    // 4. ส่งสติกเกอร์ปิดท้ายผ่าน Reply API (ฟรี 100% ไม่เสียโควต้าของ LINE)
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
          packageId: configData.sticker_package_id,
          stickerId: configData.sticker_id
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
        stickerPackageId: configData.sticker_package_id,
        stickerId: configData.sticker_id,
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
      stickerPackageId: configData.sticker_package_id,
      stickerId: configData.sticker_id,
      status: "sent",
      skipReason: "จังหวะปิดจบ (reply ฟรี)"
    });

    return Response.json({ ok: true, sent: true });

  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
