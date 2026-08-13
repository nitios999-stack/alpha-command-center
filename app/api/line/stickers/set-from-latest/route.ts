import { database } from "../../../../../db/command-center";

export const runtime = "nodejs";

export async function GET() {
  const db = database();
  
  // Find the last sticker sent to any group
  const latestStickerEvent = (await db.prepare(`
    SELECT message_type, group_id, summary
    FROM line_webhook_events
    WHERE message_type LIKE 'sticker:%'
    ORDER BY received_at DESC
    LIMIT 1
  `).first()) as { message_type: string, group_id: string, summary: string } | null;

  if (!latestStickerEvent) {
    return Response.json({
      ok: false,
      message: "❌ ยังไม่พบสติกเกอร์ใหม่ในระบบครับ รบกวนส่งสติกเกอร์เจมส์ตะเบ๊ะ เข้ามาในกลุ่ม LINE อีกครั้ง แล้วค่อยกดลิงก์นี้ใหม่นะครับ"
    });
  }

  // message_type is like "sticker:11538:51626496"
  const parts = latestStickerEvent.message_type.split(":");
  if (parts.length !== 3) {
    return Response.json({ ok: false, message: "รูปแบบสติกเกอร์ไม่ถูกต้อง" });
  }

  const packageId = parts[1];
  const stickerId = parts[2];
  const now = new Date().toISOString();

  // Update all groups that currently have auto-reply enabled
  const result = await db.prepare(`
    UPDATE line_auto_reply_configs
    SET sticker_package_id = ?, sticker_id = ?, updated_at = ?
    WHERE mode = 'reply_on_new_report'
  `).bind(packageId, stickerId, now).run();

  return Response.json({
    ok: true,
    message: `🫡 เปลี่ยนสติกเกอร์ตอบกลับเป็นตัวล่าสุดที่คุณพี่ส่งมาเรียบร้อยแล้วครับ! (Package: ${packageId}, Sticker: ${stickerId}) อัปเดตให้ทุกกลุ่มแล้วครับ ลองเทสต์ได้เลย!`
  });
}
