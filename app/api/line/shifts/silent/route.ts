import { buildSilentGroupsAlertSummary, sendSilentAlertToCommandRoom } from "../../../../../db/command-center";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const intervalHours = Number(url.searchParams.get("interval")) || 2;
    const summary = await buildSilentGroupsAlertSummary({ intervalHours });
    return Response.json({ ok: true, ...summary });
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const result = await sendSilentAlertToCommandRoom("web-admin");
    return Response.json(result);
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
