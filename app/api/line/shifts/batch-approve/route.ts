import { batchApproveSlotsWithPhotos } from "../../../../../db/command-center";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const wave = body.wave as "morning" | "evening" | "all" | undefined;
    const actor = body.actor || "สายตรวจ (อนุมัติทั้งผลัดผ่านเว็บบอร์ด)";

    const result = await batchApproveSlotsWithPhotos({ wave, actor });
    return Response.json(result);
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const wave = searchParams.get("wave") as "morning" | "evening" | "all" | undefined;
    const actor = searchParams.get("actor") || "สายตรวจ (อนุมัติทั้งผลัดผ่านเว็บบอร์ด)";

    const result = await batchApproveSlotsWithPhotos({ wave, actor });
    return Response.json(result);
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
