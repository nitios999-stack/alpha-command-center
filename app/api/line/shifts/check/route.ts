import { buildMissingShiftAlertSummary, sendShiftAlertToCommandRoom } from "../../../../../db/command-center";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const shouldSend = url.searchParams.get("send") === "true";
    const targetGroupId = url.searchParams.get("targetGroupId") || undefined;
    const targetTime = url.searchParams.get("time") || undefined;

    if (shouldSend) {
      const result = await sendShiftAlertToCommandRoom("scheduler", targetGroupId);
      return Response.json(result);
    }

    const summary = await buildMissingShiftAlertSummary(targetTime);
    return Response.json({ ok: true, ...summary });
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await sendShiftAlertToCommandRoom(body.actor || "admin", body.targetGroupId);
    return Response.json(result);
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
