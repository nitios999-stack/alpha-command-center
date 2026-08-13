import { database, logOutboundAction } from "../../../../../db/command-center";
import { lineEnvironment } from "../../../../../lib/line-webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { groupId, eventId, replyToken, receivedAt } = await request.json();
    if (!groupId || !eventId || !replyToken || !receivedAt) {
      return Response.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    // หน่วงเวลา 15 วินาที
    await new Promise((resolve) => setTimeout(resolve, 15000));

    const db = database();
    
    // ตรวจสอบว่ามีข้อความใหม่กว่านี้ส่งมาหรือไม่ (ถ้าระหว่าง 15 วิ มีคนส่งรูปเพิ่ม แปลว่ายังไม่จบ)
    const newerEvent = (await db.prepare(
      "SELECT id FROM line_webhook_events WHERE group_id = ? AND event_type = 'message' AND received_at > ?"
    ).bind(groupId, receivedAt).first()) as { id: string } | null;

    if (newerEvent) {
      // มีรูป/ข้อความใหม่ตามมา! แปลว่ายังไม่จบการส่งรายงาน ให้ยกเลิกตั๋วปิดแชทใบนี้ไปเลย
      return Response.json({ ok: true, skipped: true, reason: "newer_message_exists" });
    }

    // ถ้าไม่มีข้อความใหม่เลยใน 15 วินาที แปลว่านี่คือ "จังหวะสุดท้าย (ข้อความปิดจบ)" แล้ว!
    
    // แต่เดี๋ยวก่อน! ถ้า รปภ. พิมพ์แค่ข้อความเดียวโดดๆ (เช่น "ปกติครับ") เราไม่ต้องเด้งปิดแชทซ้ำให้รำคาญ
    // เราจะเช็กว่าใน 5 นาทีที่ผ่านมา มีข้อความส่งมากี่อัน
    const fiveMinutesAgo = new Date(new Date(receivedAt).getTime() - 5 * 60000).toISOString();
    const burst = (await db.prepare(
      "SELECT COUNT(*) as c FROM line_webhook_events WHERE group_id = ? AND event_type = 'message' AND received_at <= ? AND received_at > ?"
    ).bind(groupId, receivedAt, fiveMinutesAgo).first()) as { c: number } | null;

    if (!burst || burst.c <= 1) {
      // ส่งมาแค่ข้อความเดียวโดดๆ บอตตอบรับตอนเริ่มไปแล้ว ไม่ต้องตอบซ้ำ
      return Response.json({ ok: true, skipped: true, reason: "single_message_burst" });
    }

    // ดึงค่าสติกเกอร์ที่ตั้งไว้
    const configData = (await db.prepare("SELECT * FROM line_auto_reply_configs WHERE group_id = ? AND mode = 'reply_on_new_report'").bind(groupId).first()) as any;
    if (!configData || !configData.sticker_package_id || !configData.sticker_id) {
      return Response.json({ ok: true, skipped: true, reason: "no_config" });
    }

    const actionId = `debounce-${Date.now()}`;
    const config = lineEnvironment();
    const accessToken = config.LINE_CHANNEL_ACCESS_TOKEN;
    if (!accessToken) return Response.json({ ok: false, error: "no token" }, { status: 500 });

    // ยิงสติกเกอร์ปิดแชท!
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
        actionType: "auto-reply" as any, // Log as auto-reply so it shows up in UI
        stickerPackageId: configData.sticker_package_id,
        stickerId: configData.sticker_id,
        status: "failed",
        skipReason: `Debouncer API Error: ${response.status} ${errBody.slice(0, 100)}`
      });
      return Response.json({ ok: false, error: "LINE API Failed" });
    }

    await logOutboundAction({
      id: actionId,
      groupId: groupId,
      triggerEventId: eventId,
      actionType: "auto-reply" as any,
      stickerPackageId: configData.sticker_package_id,
      stickerId: configData.sticker_id,
      status: "sent",
      skipReason: "จังหวะปิดจบ"
    });

    return Response.json({ ok: true, sent: true });

  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
