import { apiAuthRequiredResponse, getChatGPTUser } from "../../../chatgpt-auth";
import { addBillingCase, addCoverageSlot, addOperationalSite, confirmSlot, deleteLineGroup, deleteOperationalSite, generateTodayFromTemplates, importShiftTemplates, mapLineGroup, markLeave, removeDemoData, replaceSlot, saveLineReminderSettings, saveLineReportConfig, sendLineConnectionTest, sendLineReportReminder, setupLinePoint, syncLineGroupsFromGateway, unmapLineGroup, updateOperationalSite, type LinePointSetupInput, type LineReportConfig, type TemplateImportRow } from "../../../../db/command-center";

export const runtime = "edge";

type ActionPayload = {
  type?: "confirm" | "replace" | "leave" | "site" | "site_update" | "site_delete" | "slot" | "billing" | "template_import" | "generate_today" | "remove_demo" | "line_group" | "line_point_setup" | "line_unmap" | "line_delete" | "line_connection_test" | "line_gateway_sync" | "line_reminder_settings" | "line_reminder_send" | "line_report_config";
  slotId?: string;
  siteId?: string;
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
  rows?: TemplateImportRow[];
  groupId?: string;
  targetGroupId?: string;
  autoEnabled?: boolean;
  force?: boolean;
  includeClear?: boolean;
  reportConfig?: LineReportConfig;
  customerNameOverride?: string;
  pointPostName?: string;
  pointSlotLabel?: string;
  morningEnabled?: boolean;
  eveningEnabled?: boolean;
  morningGuard?: string;
  eveningGuard?: string;
  morningDeadline?: string;
  eveningDeadline?: string;
  pointActive?: boolean;
};

export async function POST(request: Request) {
  if (!(await getChatGPTUser())) return apiAuthRequiredResponse();
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return Response.json({ error: "คำขอต้องเป็น JSON" }, { status: 415 });
    }
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 512_000) {
      return Response.json({ error: "ข้อมูลคำขอใหญ่เกินกำหนด" }, { status: 413 });
    }
    let payload: ActionPayload;
    try {
      payload = (await request.json()) as ActionPayload;
    } catch {
      return Response.json({ error: "รูปแบบ JSON ไม่ถูกต้อง" }, { status: 400 });
    }
    const user = await getChatGPTUser();
    const actor = user?.displayName ?? "ผู้ดูแลระบบ";

    let result: Record<string, unknown> = { ok: true };
    if (payload.type === "confirm" && payload.slotId) {
      await confirmSlot(payload.slotId, payload.source || "ผู้จัดการยืนยัน", actor);
    } else if (payload.type === "replace" && payload.slotId) {
      await replaceSlot(payload.slotId, payload.guardName || "", actor);
    } else if (payload.type === "leave" && payload.slotId) {
      await markLeave(payload.slotId, actor);
    } else if (payload.type === "site") {
      const siteName = payload.siteName?.trim() ?? "";
      const customerName = payload.customerName?.trim() ?? "";
      if (!siteName || !customerName) {
        return Response.json({ error: "กรอกชื่อจุดและลูกค้าให้ครบ" }, { status: 400 });
      }
      await addOperationalSite({ siteName, customerName, actor });
    } else if (payload.type === "site_update") {
      const siteId = payload.siteId?.trim() ?? "";
      const siteName = payload.siteName?.trim() ?? "";
      const customerName = payload.customerName?.trim() ?? "";
      if (!siteId || !siteName || !customerName) {
        return Response.json({ error: "กรอกชื่อจุดและลูกค้าให้ครบ" }, { status: 400 });
      }
      await updateOperationalSite({ siteId, siteName, customerName, actor });
    } else if (payload.type === "site_delete") {
      await deleteOperationalSite(payload.siteId ?? "", actor);
    } else if (payload.type === "template_import") {
      result = { ok: true, ...(await importShiftTemplates(payload.rows ?? [], actor)) };
    } else if (payload.type === "line_group") {
      await mapLineGroup({
        siteId: payload.siteId ?? "",
        groupId: payload.groupId ?? "",
        actor,
      });
    } else if (payload.type === "line_point_setup") {
      const setup: LinePointSetupInput = {
        groupId: payload.groupId ?? "",
        customerName: payload.customerNameOverride,
        postName: payload.pointPostName,
        slotLabel: payload.pointSlotLabel,
        morningEnabled: payload.morningEnabled,
        eveningEnabled: payload.eveningEnabled,
        morningGuard: payload.morningGuard,
        eveningGuard: payload.eveningGuard,
        morningDeadline: payload.morningDeadline,
        eveningDeadline: payload.eveningDeadline,
        active: payload.pointActive,
        actor,
      };
      result = { ok: true, ...(await setupLinePoint(setup)) };
    } else if (payload.type === "line_unmap") {
      await unmapLineGroup(payload.groupId ?? "", actor);
    } else if (payload.type === "line_delete") {
      await deleteLineGroup(payload.groupId ?? "", actor);
    } else if (payload.type === "line_connection_test") {
      await sendLineConnectionTest({ groupId: payload.groupId ?? "", actor });
    } else if (payload.type === "line_reminder_settings") {
      await saveLineReminderSettings({ targetGroupId: payload.targetGroupId ?? "", autoEnabled: payload.autoEnabled === true, actor });
    } else if (payload.type === "line_reminder_send") {
      result = { ok: true, ...(await sendLineReportReminder({ targetGroupId: payload.targetGroupId ?? "", wave: payload.wave === "evening" ? "evening" : "morning", force: payload.force === true, includeClear: payload.includeClear === true, actor })) };
    } else if (payload.type === "line_report_config") {
      await saveLineReportConfig({ groupId: payload.groupId ?? "", config: payload.reportConfig ?? { enabled: true, morningTimes: [], eveningTimes: [] }, actor });
    } else if (payload.type === "line_gateway_sync") {
      result = { ok: true, ...(await syncLineGroupsFromGateway(actor)) };
    } else if (payload.type === "generate_today") {
      result = { ok: true, ...(await generateTodayFromTemplates(actor)) };
    } else if (payload.type === "remove_demo") {
      await removeDemoData(actor);
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
      if (!customerName || !nextAction || !payload.dueAt || !Number.isFinite(payload.amountBaht) || payload.amountBaht <= 0) {
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

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ";
    return Response.json({ error: message }, { status: 500 });
  }
}
