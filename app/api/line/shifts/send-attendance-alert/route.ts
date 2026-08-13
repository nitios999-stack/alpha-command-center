import { buildMissingShiftAlertSummary, sendShiftAlertToCommandRoom } from "../../../../../db/command-center";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const wave = (url.searchParams.get("wave") as "morning" | "evening") || undefined;
    const summary = await buildMissingShiftAlertSummary({ wave });
    return Response.json({ ok: true, ...summary });
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const wave = (body.wave as "morning" | "evening") || undefined;
    const result = await sendShiftAlertToCommandRoom("web-admin", undefined, wave);
    return Response.json(result);
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
