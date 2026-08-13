import { database } from "../../../../../db/command-center";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const db = database();
  const url = new URL(request.url);
  const name = url.searchParams.get("name") || "";
  
  if (!name) {
    return Response.json({
      ok: false,
      message: "❌ กรุณาระบุชื่อกลุ่มที่ต้องการยกเลิก ตัวอย่างเช่น ?name=สนง.สายตรวจ"
    });
  }
  
  // Find the group by name in the registry
  const group = await db.prepare("SELECT id, group_name FROM line_group_registry WHERE group_name LIKE ?").bind(`%${name}%`).first<any>();
  
  if (!group) {
    return Response.json({
      ok: false,
      message: `❌ ไม่พบกลุ่มที่ชื่อคล้ายกับ "${name}" ในระบบเลยครับ`
    });
  }
  
  const now = new Date().toISOString();
  
  // Disable it in the configs table
  await db.prepare(`
    UPDATE line_auto_reply_configs 
    SET mode = 'disabled', updated_at = ?
    WHERE group_id = ?
  `).bind(now, group.id).run();

  return Response.json({
    ok: true,
    message: `🚫 ปิดระบบตอบกลับอัตโนมัติ สำหรับกลุ่ม "${group.group_name}" สำเร็จแล้วครับ!`
  });
}
