import { database, ensureDatabase, getEffectiveLineToken, logOutboundAction, addAudit, bangkokNow } from "../../../../db/command-center";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const db = database();
    const now = bangkokNow();
    const today = now.date;
    const currentHour = parseInt(now.time.split(":")[0], 10);
    const wave = (currentHour >= 7 && currentHour < 19) ? "morning" : "evening";
    const waveName = wave === "morning" ? "ผลัดเช้า (07:00 - 19:00 น.)" : "ผลัดดึก (19:00 - 07:00 น.)";

    // 1. Shift attendance stats
    const slots = (await db.prepare(`
      SELECT cs.id, cs.site_id, cs.status, cs.guard_name, cs.guard_type, os.site_name, os.customer_name
      FROM coverage_slots cs
      LEFT JOIN operational_sites os ON cs.site_id = os.id
      WHERE cs.operational_date = ? AND cs.wave = ?
    `).bind(today, wave).all<any>()).results || [];

    const totalSlots = slots.length;
    const onDuty = slots.filter((s) => s.status === "on_duty" || s.status === "approved").length;
    const spareUsed = slots.filter((s) => s.guard_type === "spare").length;
    const missing = slots.filter((s) => s.status === "missing" || s.status === "unassigned").length;

    // 2. Inquiries stats today
    const inquiries = (await db.prepare(`
      SELECT urgency, category, status, site_name, message_text
      FROM employer_inquiries
      WHERE received_at >= datetime('now', '-12 hours')
    `).all<any>()).results || [];

    const p1Count = inquiries.filter((i) => i.urgency === "p1_critical").length;
    const p2Count = inquiries.filter((i) => i.urgency === "p2_service").length;
    const resolvedCount = inquiries.filter((i) => i.status === "resolved").length;

    // Build Executive Briefing Text
    const dateFormatted = new Date().toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", year: "numeric", month: "long", day: "numeric" });
    
    let digestText = `📊 รายงานสรุปสถานการณ์ประจำกะ (Executive Briefing)\n`;
    digestText += `🏢 บริษัท รักษาความปลอดภัย แอลฟา จำกัด\n`;
    digestText += `📅 ประจำวันที่: ${dateFormatted}\n`;
    digestText += `⏰ รอบการปฏิบัติหน้าที่: ${waveName}\n`;
    digestText += `──────────────────────\n`;
    digestText += `👮‍♂️ สถานะกำลังพลและจุดตรวจ:\n`;
    digestText += `• จุดตรวจทั้งหมด: ${totalSlots} จุด\n`;
    digestText += `• เจ้าหน้าที่เข้าเวรครบ: ${onDuty} จุด (${totalSlots > 0 ? Math.round((onDuty/totalSlots)*100) : 100}%)\n`;
    if (spareUsed > 0) digestText += `• เจ้าหน้าที่สแปร์เข้าแทน: ${spareUsed} จุด\n`;
    if (missing > 0) digestText += `• จุดที่ยังขาดเวร/รอเข้า: ${missing} จุด\n`;
    digestText += `──────────────────────\n`;
    digestText += `💬 สรุปการดูแลข้อความและข้อร้องเรียนนายจ้าง:\n`;
    digestText += `• เคสด่วนวิกฤติ (P1): ${p1Count} เคส ${p1Count === 0 ? "✅ ไม่มีเหตุร้ายแรง" : "⚠️ ได้รับการสั่งการแล้ว"}\n`;
    digestText += `• งานบริการ/ประสานงาน (P2): ${p2Count} เคส\n`;
    digestText += `• แก้ไขและปิดเคสแล้ว: ${resolvedCount} เคส\n`;
    digestText += `──────────────────────\n`;
    digestText += `🛡️ สรุปภาพรวม: ${p1Count === 0 ? "ทุกจุดตรวจอยู่ในความสงบเรียบร้อย เหตุการณ์ทั่วไปปกติ 100%" : "ศูนย์สั่งการควบคุมสถานการณ์เรียบร้อย"}\n`;
    digestText += `ศูนย์สั่งการ ALPHA Command Center`;

    return Response.json({
      ok: true,
      wave,
      waveName,
      dateFormatted,
      stats: {
        totalSlots,
        onDuty,
        spareUsed,
        missing,
        p1Count,
        p2Count,
        resolvedCount
      },
      digestText
    });
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { targetGroupId, digestText, actor = "ผู้บริหารศูนย์สั่งการ" } = body;

    await ensureDatabase();
    const db = database();
    const token = await getEffectiveLineToken();

    if (!token) {
      return Response.json({ ok: false, error: "ยังไม่ได้ตั้งค่า LINE Channel Access Token" }, { status: 500 });
    }

    // Default target group if not provided: line_reminder_target_group_id setting
    let destGroup = targetGroupId;
    if (!destGroup) {
      const setting = (await db.prepare("SELECT value FROM system_settings WHERE key = 'line_reminder_target_group_id'").first()) as any;
      destGroup = setting?.value;
    }

    if (!destGroup) {
      return Response.json({ ok: false, error: "กรุณาระบุกลุ่ม LINE ปลายทางที่จะส่งสรุป" }, { status: 400 });
    }

    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        to: destGroup,
        messages: [{
          type: "text",
          text: digestText
        }]
      })
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ ok: false, error: `LINE API Error: ${err}` }, { status: 500 });
    }

    await addAudit("executive_digest", destGroup, "sent", actor, `ส่งสรุปรายงานประจำกะเข้าห้อง LINE ผู้บริหาร`);

    return Response.json({
      ok: true,
      message: "ส่งรายงานสรุปเข้า LINE เรียบร้อยแล้ว"
    });
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
