import { discoverAndRecoverAllGroups } from "../../../../../db/command-center";

export const runtime = "nodejs";

export async function GET() {
  try {
    const groups = await discoverAndRecoverAllGroups();
    return Response.json({ ok: true, groups, count: groups.length });
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
