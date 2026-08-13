import { database } from "../../../../../db/command-center";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const db = database();
  const url = new URL(request.url);
  const cooldown = Number(url.searchParams.get("cooldown")) || 3;
  
  const groupsResult = await db.prepare("SELECT id, group_name FROM line_group_registry").all();
  const groups = (groupsResult.results || []) as any[];
  
  const now = new Date().toISOString();
  let enabledCount = 0;

  const defaultPkg = '11538';
  const defaultStk = '51626520';

  for (const group of groups) {
    await db.prepare(`
      INSERT INTO line_auto_reply_configs (group_id, mode, sticker_package_id, sticker_id, cooldown_minutes, updated_at)
      VALUES (?, 'reply_on_new_report', ?, ?, ?, ?)
      ON CONFLICT(group_id) DO UPDATE SET 
        mode = 'reply_on_new_report',
        sticker_package_id = ?,
        sticker_id = ?,
        cooldown_minutes = ?,
        updated_at = ?
    `).bind(group.id, defaultPkg, defaultStk, cooldown, now, defaultPkg, defaultStk, cooldown, now).run();
    enabledCount++;
  }

  return Response.json({
    ok: true,
    message: `🎉 เปิดระบบตอบกลับอัตโนมัติสำเร็จแล้ว! จำนวน ${enabledCount} กลุ่ม (หน่วงเวลาเงียบ ${cooldown} นาที)`,
    groups: groups.map(g => g.group_name)
  });
}
