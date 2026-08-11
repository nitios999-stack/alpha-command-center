import { getChatGPTUser } from "../../../chatgpt-auth";
import { addBillingCase, addCoverageSlot, confirmSlot, markLeave, replaceSlot } from "../../../../db/command-center";

export const runtime = "edge";

type ActionPayload = {
  type?: "confirm" | "replace" | "leave" | "slot" | "billing";
  slotId?: string;
  source?: string;
  guardName?: string;
  customerName?: string;
  amountBaht?: number;
  dueAt?: string;
  nextAction?: string;
  ownerName?: string;
  wave?: string;
  siteName?: string;
  postName?: string;
  slotLabel?: string;
  assignedGuard?: string;
  deadline?: string;
  verificationPolicy?: "standard" | "reviewed" | "manual";
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ActionPayload;
    const user = await getChatGPTUser();
    const actor = user?.displayName ?? "ผู้ดูแลระบบ";

    if (payload.type === "confirm" && payload.slotId) {
      await confirmSlot(payload.slotId, payload.source || "ผู้จัดการยืนยัน", actor);
    } else if (payload.type === "replace" && payload.slotId) {
      await replaceSlot(payload.slotId, payload.guardName || "", actor);
    } else if (payload.type === "leave" && payload.slotId) {
      await markLeave(payload.slotId, actor);
    } else if (payload.type === "slot") {
      const siteName = payload.siteName?.trim() ?? "";
      const customerName = payload.customerName?.trim() ?? "";
      const postName = payload.postName?.trim() ?? "";
      const slotLabel = payload.slotLabel?.trim() ?? "";
      if (!siteName || !customerName || !postName || !slotLabel || !payload.deadline) {
        return Response.json({ error: "กรอกข้อมูลจุดและช่องกำลังให้ครบ" }, { status: 400 });
      }
      await addCoverageSlot({
        wave: payload.wave === "evening" ? "evening" : "morning",
        siteName,
        customerName,
        postName,
        slotLabel,
        assignedGuard: payload.assignedGuard ?? "",
        deadline: payload.deadline,
        verificationPolicy: payload.verificationPolicy ?? "standard",
        actor,
      });
    } else if (payload.type === "billing") {
      const customerName = payload.customerName?.trim() ?? "";
      const nextAction = payload.nextAction?.trim() ?? "";
      const ownerName = payload.ownerName?.trim() ?? actor;
      if (!customerName || !nextAction || !payload.dueAt || !payload.amountBaht || payload.amountBaht <= 0) {
        return Response.json({ error: "กรอกข้อมูลวางบิลให้ครบและระบุยอดมากกว่า 0" }, { status: 400 });
      }
      await addBillingCase({
        customerName,
        amountBaht: payload.amountBaht,
        dueAt: payload.dueAt,
        nextAction,
        ownerName,
      });
    } else {
      return Response.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ";
    return Response.json({ error: message }, { status: 500 });
  }
}
