import { getGuardProfiles, saveGuardProfile, deleteGuardProfile, getRecentWebhookSenders, autoSyncGuardsFromLine } from "../../../db/command-center";

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
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.action === "auto_sync" || body.action === "auto_bind_all") {
      const result = await autoSyncGuardsFromLine(body.actor || "admin");
      return Response.json(result);
    }

    if (!body.siteId || !body.guardName) {
      return Response.json({ ok: false, error: "กรุณาระบุชื่อจุดและชื่อ รปภ." }, { status: 400 });
    }

    const saved = await saveGuardProfile({
      id: body.id,
      siteId: body.siteId,
      guardName: body.guardName,
      displayName: body.displayName,
      pictureUrl: body.pictureUrl,
      phoneNumber: body.phoneNumber,
      preferredShift: body.preferredShift,
      role: body.role,
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
