import { database } from "../../../../../db/command-center";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // TODO: Add actual user authentication check here
  const actor = request.headers.get("x-alpha-actor") || "unknown";

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { groupIds, stickerPackageId, stickerId, idempotencyKey } = payload;
  if (!Array.isArray(groupIds) || groupIds.length === 0 || !stickerPackageId || !stickerId || !idempotencyKey) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const db = database();
  // Idempotency check
  const existingJob = await db.prepare("SELECT * FROM line_manual_batch_jobs WHERE id = ?").bind(idempotencyKey).first();
  if (existingJob) {
    return Response.json({ ok: true, message: "Job already processed" });
  }

  // Record job
  await db.prepare(`
    INSERT INTO line_manual_batch_jobs (id, group_ids, sticker_package_id, sticker_id, status, created_at, created_by)
    VALUES (?, ?, ?, ?, 'pending', datetime('now'), ?)
  `).bind(idempotencyKey, JSON.stringify(groupIds), stickerPackageId, stickerId, actor).run();

  // Queue stickers instead of sending immediately to use Reply API and save quota
  const now = new Date().toISOString();
  
  const operations = groupIds.map(groupId => {
    return db.prepare(`
      INSERT OR REPLACE INTO line_queued_stickers (id, group_id, sticker_package_id, sticker_id, created_at, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).bind(`qs-${randomUUID()}`, groupId, stickerPackageId, stickerId, now);
  });

  // Batch insert
  for (let i = 0; i < operations.length; i += 80) {
    await db.batch(operations.slice(i, i + 80));
  }

  await db.prepare("UPDATE line_manual_batch_jobs SET status = 'completed' WHERE id = ?").bind(idempotencyKey).run();

  return Response.json({ ok: true, totalSent: groupIds.length, message: "Stickers queued for free delivery" });
}
