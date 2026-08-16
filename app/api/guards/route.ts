import { getGuardProfiles, saveGuardProfile, deleteGuardProfile, getRecentWebhookSenders, autoSyncGuardsFromLine, purgePlaceholderGuardProfiles, purgeAllLegacyEventsAndPlaceholders } from "../../../db/command-center";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId") || undefined;
    const includeSenders = searchParams.get("includeSenders") === "true";

    const guards = await getGuardProfiles(siteId);
    let recentSenders: any[] = [];
    if (includeSenders) {
      recentSenders = await getRecentWebhookSenders({ siteId, limit: 100 });
    }

    return Response.json({
      ok: true,
      guards,
      recentSenders,
    });
  } catch (error: any) {
    console.error("GET /api/guards error stack:", error.stack || error);
    return Response.json({ ok: false, error: error.message, stack: error.stack }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.action === "purge_all_legacy" || body.action === "hard_reset") {
      const result = await purgeAllLegacyEventsAndPlaceholders(body.actor || "admin");
      return Response.json(result);
    }

    if (body.action === "wipe_placeholders" || body.action === "purge_placeholders" || body.action === "reset_all") {
      const result = await purgePlaceholderGuardProfiles(body.actor || "admin");
      return Response.json(result);
    }

    if (body.action === "auto_sync" || body.action === "auto_bind_all") {
      const result = await autoSyncGuardsFromLine(body.actor || "admin");
      return Response.json(result);
    }

    const targetSiteId = body.siteId?.trim() || "all";
    const targetGuardName = body.guardName?.trim() || body.displayName?.trim() || (body.id ? `สมาชิก (${body.id.slice(-6)})` : "เจ้าหน้าที่");

    const saved = await saveGuardProfile({
      id: body.id,
      siteId: targetSiteId,
      guardName: targetGuardName,
      displayName: body.displayName,
      pictureUrl: body.pictureUrl,
      phoneNumber: body.phoneNumber,
      preferredShift: body.preferredShift || "all",
      role: body.role || "regular",
      active: body.active,
    });

    return Response.json({ ok: true, guard: saved });
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return Response.json({ ok: false, error: "Missing guard id" }, { status: 400 });
    }

    await deleteGuardProfile(id);
    return Response.json({ ok: true, deleted: id });
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
