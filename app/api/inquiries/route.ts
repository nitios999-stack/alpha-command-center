import { getEmployerInquiries, updateInquiryStatus, recordEmployerInquiry } from "../../../db/command-center";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const urgency = searchParams.get("urgency") || undefined;
    const limit = Number(searchParams.get("limit") || 50);

    const result = await getEmployerInquiries({ status, urgency, limit });
    return Response.json({
      ok: true,
      ...result,
    });
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, inquiryId, actor = "operator" } = body;

    if (action === "create") {
      const created = await recordEmployerInquiry({
        groupId: body.groupId,
        siteName: body.siteName,
        senderName: body.senderName,
        senderKey: body.senderKey,
        messageText: body.messageText,
      });
      return Response.json({ ok: true, inquiry: created });
    }

    if (!inquiryId || !["acknowledged", "dispatched", "resolved"].includes(action)) {
      return Response.json({ ok: false, error: "Invalid action or missing inquiryId" }, { status: 400 });
    }

    const updated = await updateInquiryStatus(inquiryId, action as any, actor);
    return Response.json({ ok: true, inquiry: updated });
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
