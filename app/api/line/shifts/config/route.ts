import { 
  getShiftGroupConfigurations, 
  updateGroupShiftConfiguration, 
  bulkApplyShiftPreset,
  setCommandTargetGroupId,
  importSelectedLineGroups,
  registerCustomGroup,
  setGroupAutoReply,
  setAllGroupsAutoReply
} from "../../../../../db/command-center";

export const runtime = "nodejs";

export async function GET() {
  try {
    const data = await getShiftGroupConfigurations();
    return Response.json({ ok: true, ...data });
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Toggle individual group auto reply
    if (body.action === "toggle_auto_reply") {
      if (!body.groupId) return Response.json({ ok: false, error: "groupId is required" }, { status: 400 });
      const result = await setGroupAutoReply({
        groupId: body.groupId,
        enabled: Boolean(body.enabled),
        actor: body.actor || "admin",
      });
      return Response.json(result);
    }

    // Toggle all groups auto reply
    if (body.action === "toggle_all_auto_reply") {
      const result = await setAllGroupsAutoReply({
        enabled: Boolean(body.enabled),
        actor: body.actor || "admin",
      });
      return Response.json(result);
    }
    
    // Register or recover custom group (e.g. command group)
    if (body.action === "register_custom_group") {
      if (!body.groupId) {
        return Response.json({ ok: false, error: "groupId is required" }, { status: 400 });
      }
      const result = await registerCustomGroup({
        groupId: body.groupId,
        groupName: body.groupName || "สนง.สายตรวจ ALPHA COP",
        isCommandRoom: Boolean(body.isCommandRoom),
        actor: body.actor || "admin",
      });
      return Response.json(result);
    }

    // Set command room group
    if (body.action === "set_command_group") {
      if (!body.groupId) {
        return Response.json({ ok: false, error: "groupId is required" }, { status: 400 });
      }
      const result = await setCommandTargetGroupId(body.groupId, body.actor || "admin");
      return Response.json(result);
    }

    // Import selected line groups from registry
    if (body.action === "import_selected_groups") {
      if (!Array.isArray(body.groupIds) || !body.groupIds.length) {
        return Response.json({ ok: false, error: "groupIds array is required" }, { status: 400 });
      }
      const result = await importSelectedLineGroups(body.groupIds, body.actor || "admin");
      return Response.json(result);
    }

    // Bulk preset action
    if (body.action === "bulk_preset") {
      const result = await bulkApplyShiftPreset({
        preset: body.preset,
        morningDeadline: body.morningDeadline,
        eveningDeadline: body.eveningDeadline,
        hasMorning: body.hasMorning,
        hasEvening: body.hasEvening,
        actor: body.actor || "admin",
      });
      return Response.json(result);
    }

    // Individual group shift update
    const { groupId, hasMorningShift, morningDeadline, morningGuard, hasEveningShift, eveningDeadline, eveningGuard, actor } = body;
    if (!groupId) {
      return Response.json({ ok: false, error: "groupId is required" }, { status: 400 });
    }

    const result = await updateGroupShiftConfiguration({
      groupId,
      hasMorningShift: Boolean(hasMorningShift),
      morningDeadline: morningDeadline || "07:00",
      morningGuard: morningGuard || "",
      hasEveningShift: Boolean(hasEveningShift),
      eveningDeadline: eveningDeadline || "19:00",
      eveningGuard: eveningGuard || "",
      actor: actor || "admin",
    });

    return Response.json(result);
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
