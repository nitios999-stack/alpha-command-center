import { confirmSlotById, batchApproveSlotsWithPhotos } from "../../../../db/command-center";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || "confirm_single";

    if (action === "batch_approve") {
      const wave = body.wave as "morning" | "evening" | "all" | undefined;
      const actor = body.actor || "สายตรวจ (อนุมัติทั้งผลัดผ่าน Patrol Deck)";
      const result = await batchApproveSlotsWithPhotos({ wave, actor });
      return Response.json(result);
    }

    const slotId = String(body.slotId || "");
    if (!slotId) {
      return Response.json({ ok: false, error: "Missing slotId" }, { status: 400 });
    }

    const guardType = body.guardType === "spare" ? "spare" : "regular";
    const spareName = body.spareName ? String(body.spareName).trim() : undefined;
    const actor = body.actor || `สายตรวจ (ตรวจผ่าน Patrol Deck: ${guardType === "spare" ? "สแปร์" : "คนประจำ"})`;

    const result = await confirmSlotById({
      slotId,
      guardType,
      spareName,
      actor,
    });

    return Response.json(result);
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
