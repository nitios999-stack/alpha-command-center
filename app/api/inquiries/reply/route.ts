import { database, ensureDatabase, getEffectiveLineToken, logOutboundAction, addAudit, bangkokNow } from "../../../../db/command-center";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { inquiryId, groupId, messageText, actor = "ศูนย์สั่งการ ALPHA" } = body;

    if (!groupId || !messageText) {
      return Response.json({ ok: false, error: "กรุณาระบุกลุ่มและข้อความที่ต้องการตอบ" }, { status: 400 });
    }

    await ensureDatabase();
    const db = database();
    const token = await getEffectiveLineToken();

    if (!token) {
      return Response.json({ ok: false, error: "ยังไม่ได้ตั้งค่า LINE Channel Access Token" }, { status: 500 });
    }

    const cleanGroupId = groupId.trim();
    const actionId = `reply-inq-${Date.now()}`;
    const now = bangkokNow().iso;

    // Send push message to group
    const lineResponse = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        to: cleanGroupId,
        messages: [{
          type: "text",
          text: `🫡 ศูนย์สั่งการ ALPHA แจ้งความคืบหน้า:\n${messageText.trim()}`
        }]
      })
    });

    if (!lineResponse.ok) {
      const errText = await lineResponse.text();
      await logOutboundAction({
        id: actionId,
        groupId: cleanGroupId,
        actionType: "employer_reply",
        stickerPackageId: "-",
        stickerId: "-",
        status: "failed",
        skipReason: `Push API Error: ${lineResponse.status} ${errText.slice(0, 150)}`
      });
      return Response.json({ ok: false, error: `LINE API Error: ${errText}` }, { status: 500 });
    }

    // Update inquiry status
    if (inquiryId) {
      await db.prepare(`
        UPDATE employer_inquiries
        SET status = 'acknowledged',
            acknowledged_by = ?,
            acknowledged_at = ?,
            resolved_at = COALESCE(resolved_at, ?)
        WHERE id = ?
      `).bind(actor, now, now, inquiryId).run();
    }

    await logOutboundAction({
      id: actionId,
      groupId: cleanGroupId,
      actionType: "employer_reply",
      stickerPackageId: "-",
      stickerId: "-",
      status: "sent",
      skipReason: `ตอบกลับนายจ้าง: "${messageText.slice(0, 50)}"`
    });

    await addAudit("employer_inquiry", inquiryId || cleanGroupId, "reply_sent", actor, `ส่งข้อความตอบกลับนายจ้าง: "${messageText.slice(0, 40)}"`);

    return Response.json({
      ok: true,
      message: "ส่งข้อความตอบกลับเข้ากลุ่ม LINE เรียบร้อยแล้ว",
      sentAt: now
    });
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
