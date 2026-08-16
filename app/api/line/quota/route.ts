import { getEffectiveLineToken, database, bangkokNow } from "../../../../db/command-center";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const token = await getEffectiveLineToken();
    if (!token) {
      return Response.json({
        ok: false,
        error: "ไม่พบคีย์ LINE Channel Access Token ในระบบ",
      }, { status: 400 });
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    // 1. Fetch Monthly Quota & Consumption in parallel
    const [quotaRes, consumptionRes, botInfoRes] = await Promise.allSettled([
      fetch("https://api.line.me/v2/bot/message/quota", { headers }),
      fetch("https://api.line.me/v2/bot/message/quota/consumption", { headers }),
      fetch("https://api.line.me/v2/bot/info", { headers }),
    ]);

    let quotaData: { type: string; value: number } = { type: "limited", value: 300 };
    if (quotaRes.status === "fulfilled" && quotaRes.value.ok) {
      quotaData = await quotaRes.value.json();
    }

    let consumptionData: { totalUsage: number } = { totalUsage: 0 };
    if (consumptionRes.status === "fulfilled" && consumptionRes.value.ok) {
      consumptionData = await consumptionRes.value.json();
    }

    let botInfo: any = {
      displayName: "สนง.สายตรวจแอลฟา คอพ",
      basicId: "@bmx3192k",
      pictureUrl: null,
      chatMode: "chat",
    };
    if (botInfoRes.status === "fulfilled" && botInfoRes.value.ok) {
      botInfo = await botInfoRes.value.json();
    }

    // 2. Fetch Internal Audit Log statistics from D1
    const db = database();
    const totalRepliesRow = (await db.prepare(`
      SELECT COUNT(id) as count 
      FROM line_outbound_audit 
      WHERE status = 'sent' AND action_type = 'auto-reply-close'
    `).first()) as { count: number } | null;

    const totalPushesRow = (await db.prepare(`
      SELECT COUNT(id) as count 
      FROM line_outbound_audit 
      WHERE status = 'sent' AND action_type LIKE '%push%'
    `).first()) as { count: number } | null;

    const recentAuditLogs = (await db.prepare(`
      SELECT loa.*, COALESCE(lgr.group_name, lg.group_name, loa.group_id) as group_name
      FROM line_outbound_audit loa
      LEFT JOIN line_group_registry lgr ON loa.group_id = lgr.id
      LEFT JOIN line_groups lg ON loa.group_id = lg.id
      ORDER BY loa.sent_at DESC
      LIMIT 25
    `).all<any>()).results || [];

    const totalLimit = quotaData.value ?? 300;
    const used = consumptionData.totalUsage ?? 0;
    const remaining = Math.max(0, totalLimit - used);
    const usagePercent = totalLimit > 0 ? Math.min(100, Math.round((used / totalLimit) * 100)) : 0;

    return Response.json({
      ok: true,
      quota: {
        type: quotaData.type,
        totalLimit,
        used,
        remaining,
        usagePercent,
      },
      botInfo,
      stats: {
        freeReplyStickersSent: totalRepliesRow?.count ?? 0,
        pushAlertsSent: totalPushesRow?.count ?? 0,
        quotaSavedByReply: totalRepliesRow?.count ?? 0,
      },
      recentLogs: recentAuditLogs,
      checkedAt: bangkokNow().iso,
    });
  } catch (error: any) {
    console.error("GET /api/line/quota error:", error);
    return Response.json({
      ok: false,
      error: error.message || "Failed to check LINE quota",
    }, { status: 500 });
  }
}
