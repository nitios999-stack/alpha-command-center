import { NextResponse } from "next/server";
import { database, ensureDatabase, bangkokNow, minuteFromTime } from "../../../../db/command-center";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const db = database();
    const now = bangkokNow();
    const today = now.date;
    const currentHour = Number(now.time.slice(0, 2));
    const currentMins = minuteFromTime(now.time);

    const { searchParams } = new URL(request.url);
    const waveParam = searchParams.get("wave") as "morning" | "evening" | "all" | null;
    const currentWave = waveParam || (currentHour >= 16 || currentHour < 5 ? "evening" : "morning");
    const currentWaveLabel = currentWave === "evening" ? "🌙 ผลัดดึก (18:00 - 06:00)" : "☀️ ผลัดเช้า (06:00 - 18:00)";

    // ดึงสล็อตทั้งหมดของวันนี้
    let query = `
      SELECT * FROM coverage_slots 
      WHERE operational_date = ?
    `;
    const params: any[] = [today];
    if (waveParam && waveParam !== "all") {
      query += ` AND wave = ?`;
      params.push(waveParam);
    }
    query += ` ORDER BY deadline ASC, site_name ASC`;

    const slotsResult = await db.prepare(query).bind(...params).all<any>();
    const allSlots = (slotsResult.results || []) as any[];

    // ดึงข้อมูลภาพถ่ายล่าสุดและกิจกรรมกลุ่ม LINE
    const eventsResult = await db.prepare(`
      SELECT group_id, site_id, last_seen_at, last_message_type, last_report_at, sender_key
      FROM line_webhook_events
      GROUP BY group_id
      ORDER BY last_seen_at DESC
    `).all<any>().catch(() => ({ results: [] }));
    const recentEventsByGroup = new Map<string, any>();
    ((eventsResult as any).results || []).forEach((e: any) => {
      if (e.group_id) recentEventsByGroup.set(e.group_id, e);
    });

    let totalSlots = allSlots.length;
    let confirmedRegular = 0;
    let confirmedSpare = 0;
    let missingCount = 0;

    const formattedSlots = allSlots.map((slot) => {
      const deadlineMins = minuteFromTime(slot.deadline || "00:00");
      const diff = currentMins - deadlineMins;
      const isLate = slot.state !== "confirmed" && diff > 0;
      const lateMinutes = isLate ? diff : (slot.late_minutes || 0);

      const isSpare = slot.source?.includes("สแปร์") || slot.assignment_type === "spare";
      const isConfirmed = slot.state === "confirmed";

      if (isConfirmed) {
        if (isSpare) confirmedSpare++;
        else confirmedRegular++;
      } else {
        missingCount++;
      }

      // สัญญาณภาพถ่ายหรือรายงานจากหน้างาน
      const hasReportedPhoto = Boolean(slot.reported_at || (slot.source && slot.source.includes("ภาพถ่าย")));

      return {
        id: slot.id,
        siteId: slot.site_id,
        siteName: slot.site_name,
        postName: slot.post_name || "ป้อมหลัก",
        slotLabel: slot.slot_label || "ช่อง 1",
        assignedGuard: slot.assigned_guard || "รปภ. ประจำจุด",
        actualGuardName: slot.actual_guard_name || (isSpare ? "สแปร์แทนเวร" : slot.assigned_guard),
        isSpare,
        state: slot.state,
        isConfirmed,
        deadline: slot.deadline || "07:00",
        reportedAt: slot.reported_at,
        source: slot.source,
        isLate,
        lateMinutes,
        wave: slot.wave,
        hasReportedPhoto,
        updatedAt: slot.updated_at,
      };
    });

    const confirmedCount = confirmedRegular + confirmedSpare;
    const progressPercent = totalSlots > 0 ? Math.round((confirmedCount / totalSlots) * 100) : 100;

    return NextResponse.json({
      ok: true,
      nowTime: now.time,
      today,
      currentWave,
      currentWaveLabel,
      stats: {
        total: totalSlots,
        confirmed: confirmedCount,
        confirmedRegular,
        confirmedSpare,
        missing: missingCount,
        progressPercent,
      },
      slots: formattedSlots,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
