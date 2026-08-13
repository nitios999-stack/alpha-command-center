import { database } from "../../../../../db/command-center";

export const runtime = "nodejs";

export async function GET() {
  const db = database();
  
  let presetsResult = await db.prepare("SELECT * FROM line_sticker_presets ORDER BY name ASC").all();
  
  // Auto-seed James Salute if no presets exist
  if (!presetsResult.results || presetsResult.results.length === 0) {
    const now = new Date().toISOString();
    await db.prepare("INSERT INTO line_sticker_presets (id, name, package_id, sticker_id, created_at) VALUES (?, ?, ?, ?, ?)").bind(
      "preset-" + Date.now(), "James Salute", "11537", "52002735", now
    ).run();
    presetsResult = await db.prepare("SELECT * FROM line_sticker_presets ORDER BY name ASC").all();
  }

  const configsResult = await db.prepare("SELECT * FROM line_auto_reply_configs").all();
  const groupsResult = await db.prepare("SELECT id, group_name FROM line_group_registry").all();
  const queueResult = await db.prepare("SELECT * FROM line_queued_stickers WHERE status = 'pending' ORDER BY created_at ASC").all();
  const auditResult = await db.prepare("SELECT * FROM line_outbound_audit ORDER BY sent_at DESC LIMIT 50").all();

  return Response.json({
    presets: presetsResult.results || [],
    configs: configsResult.results || [],
    groups: groupsResult.results || [],
    queue: queueResult.results || [],
    audit: auditResult.results || []
  });
}
