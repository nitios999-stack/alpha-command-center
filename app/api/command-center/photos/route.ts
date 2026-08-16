import { database, ensureDatabase, bangkokNow } from "../../../../db/command-center";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const db = database();
    const today = bangkokNow().date;

    // Query latest image events grouped by group_id
    const imageEvents = (await db.prepare(`
      SELECT 
        lwe.id as event_id,
        lwe.group_id,
        lwe.received_at,
        lwe.summary,
        lwe.sender_key,
        lwe.raw_user_id,
        COALESCE(lgr.group_name, lg.group_name, lwe.group_id) as group_name,
        os.site_name,
        os.customer_name,
        gp.guard_name,
        gp.display_name as guard_display_name,
        gp.picture_url as guard_avatar
      FROM line_webhook_events lwe
      LEFT JOIN line_group_registry lgr ON lwe.group_id = lgr.id
      LEFT JOIN line_groups lg ON lwe.group_id = lg.id
      LEFT JOIN operational_sites os ON lg.site_id = os.id
      LEFT JOIN guard_profiles gp ON (lwe.raw_user_id IS NOT NULL AND gp.id = lwe.raw_user_id) OR (gp.id = lwe.sender_key)
      WHERE lwe.message_type LIKE '%image%' OR lwe.summary LIKE '%รูปภาพ%'
      ORDER BY lwe.received_at DESC
      LIMIT 100
    `).all<any>()).results || [];

    // Group events into check-in rounds by site & 15-minute time window
    const checkpointsMap = new Map<string, any>();

    for (const ev of imageEvents) {
      const gId = ev.group_id;
      const time = new Date(ev.received_at).getTime();
      const windowKey = `${gId}_${Math.floor(time / (15 * 60 * 1000))}`;

      let cleanName = String(ev.guard_display_name || ev.guard_name || "").trim();
      if (!cleanName || cleanName.length > 25 || /^[A-Za-z0-9+/=_-]{16,}$/.test(cleanName) || cleanName.startsWith("U-") || cleanName.startsWith("U0")) {
        const fallbackId = String(ev.raw_user_id || ev.sender_key || gId || "ALPHA").trim();
        cleanName = `รปภ. (${fallbackId.slice(-4)})`;
      }

      if (!checkpointsMap.has(windowKey)) {
        checkpointsMap.set(windowKey, {
          groupId: gId,
          groupName: ev.group_name || `กลุ่ม ${gId.slice(-6)}`,
          siteName: ev.site_name || ev.group_name || "จุดตรวจประจำ",
          customerName: ev.customer_name || "ลูกค้าทั่วไป",
          guardName: cleanName,
          guardAvatar: (ev.guard_avatar && ev.guard_avatar.startsWith("https")) ? ev.guard_avatar : "👮‍♂️",
          latestAt: ev.received_at,
          photoCount: 1,
          photos: [{ id: ev.event_id, receivedAt: ev.received_at, summary: ev.summary }]
        });
      } else {
        const item = checkpointsMap.get(windowKey);
        item.photoCount += 1;
        item.photos.push({ id: ev.event_id, receivedAt: ev.received_at, summary: ev.summary });
      }
    }

    const liveCheckpoints = Array.from(checkpointsMap.values()).slice(0, 30);

    return Response.json({
      ok: true,
      checkpoints: liveCheckpoints,
      totalRecentRounds: liveCheckpoints.length
    });
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
