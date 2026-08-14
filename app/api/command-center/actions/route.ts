import { apiAuthRequiredResponse, getChatGPTUser } from "../../../chatgpt-auth";
import { activateAllLinePoints, addBillingCase, addCoverageSlot, addOperationalSite, confirmSlot, deleteLineGroup, deleteOperationalSite, generateTodayFromTemplates, importShiftTemplates, mapLineGroup, markLeave, previewLineReportReminder, refreshLineGroupProfiles, removeDemoData, replaceSlot, saveLineReminderSettings, saveLineReportConfig, sendLineConnectionTest, sendLineReportReminder, setupLinePoint, syncLineGroupsFromGateway, unmapLineGroup, updateOperationalSite, batchApproveSlotsWithPhotos, saveLineAccessToken, getLineBotStatus, type LinePointSetupInput, type LineReportConfig, type TemplateImportRow } from "../../../../db/command-center";

export const runtime = "nodejs";

type ActionPayload = {
  type?: "confirm" | "replace" | "leave" | "site" | "site_update" | "site_delete" | "slot" | "billing" | "template_import" | "generate_today" | "remove_demo" | "line_group" | "line_point_setup" | "line_points_activate_all" | "line_unmap" | "line_delete" | "line_connection_test" | "line_gateway_sync" | "line_profile_refresh" | "line_reminder_settings" | "line_reminder_preview" | "line_reminder_send" | "line_report_config" | "batch_approve" | "save_line_token" | "get_line_token_status";
  token?: string;
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
  groupIds?: string[];
  targetGroupId?: string;
  escalationTargetGroupId?: string;
  autoEnabled?: boolean;
  autoEscalationEnabled?: boolean;
  force?: boolean;
  includeClear?: boolean;
  sendEscalation?: boolean;
  roundTime?: string;
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
    } else if (payload.type === "line_points_activate_all") {
      result = { ok: true, ...(await activateAllLinePoints(actor)) };
    } else if (payload.type === "line_unmap") {
      await unmapLineGroup(payload.groupId ?? "", actor);
    } else if (payload.type === "line_delete") {
      await deleteLineGroup(payload.groupId ?? "", actor);
    } else if (payload.type === "line_connection_test") {
      result = await sendLineConnectionTest({ groupId: payload.groupId ?? "", actor });
    } else if (payload.type === "line_reminder_settings") {
      await saveLineReminderSettings({ targetGroupId: payload.targetGroupId ?? "", escalationTargetGroupId: payload.escalationTargetGroupId, autoEnabled: payload.autoEnabled === true, autoEscalationEnabled: payload.autoEscalationEnabled === true, actor });
    } else if (payload.type === "line_reminder_preview") {
      result = { ok: true, ...(await previewLineReportReminder({ targetGroupId: payload.targetGroupId ?? "", roundTime: payload.roundTime })) };
    } else if (payload.type === "line_reminder_send") {
      result = { ok: true, ...(await sendLineReportReminder({ targetGroupId: payload.targetGroupId ?? "", force: payload.force === true, automatic: payload.autoEnabled === true, roundTime: payload.roundTime, sendEscalation: payload.sendEscalation === true, actor })) };
    } else if (payload.type === "line_report_config") {
      await saveLineReportConfig({ groupId: payload.groupId ?? "", config: payload.reportConfig ?? { enabled: true, morningTimes: [], eveningTimes: [], mode: "observe", expectedTimes: [], intervalHours: 2, intervalAnchor: "00:00", graceMinutes: 0, escalationAfterHours: 6, verification: "text", approvedSenderKeys: [], monitoringStartedAt: null }, actor });
    } else if (payload.type === "line_gateway_sync") {
      result = { ok: true, ...(await syncLineGroupsFromGateway(actor)) };
    } else if (payload.type === "line_profile_refresh") {
      result = { ok: true, ...(await refreshLineGroupProfiles(actor, Array.isArray(payload.groupIds) ? payload.groupIds.slice(0, 8).filter((id): id is string => typeof id === "string") : [])) };
    } else if (payload.type === "save_line_token") {
      result = await saveLineAccessToken(payload.token ?? "", actor);
      if (!result.ok) return Response.json(result, { status: 400 });
    } else if (payload.type === "get_line_token_status") {
      result = { ok: true, ...(await getLineBotStatus()) };
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
      const amountBaht = typeof payload.amountBaht === "number" ? payload.amountBaht : Number(payload.amountBaht);
      if (!customerName || !nextAction || !payload.dueAt || !Number.isFinite(amountBaht) || amountBaht <= 0) {
        return Response.json({ error: "กรอกข้อมูลวางบิลให้ครบและระบุยอดมากกว่า 0" }, { status: 400 });
      }
      await addBillingCase({
        customerName,
        amountBaht,
        dueAt: payload.dueAt,
        nextAction,
        ownerName,
      });
    } else if (payload.type === "batch_approve") {
      const batchResult = await batchApproveSlotsWithPhotos({ wave: payload.wave as any, actor });
      result = { ...batchResult, ok: true };
    } else {
      return Response.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
    }

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ";
    return Response.json({ error: message }, { status: 500 });
  }
}
