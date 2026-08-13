import { database, consumeAutoReplyQuota, logOutboundAction } from "../../../../../db/command-center";
import { lineEnvironment } from "../../../../../lib/line-webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { groupId, eventId, replyToken, receivedAt } = await request.json();
    if (!groupId || !eventId || !replyToken || !receivedAt) {
      return Response.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    // Wait for 45 seconds before processing
    await new Promise((resolve) => setTimeout(resolve, 45000));

    const db = database();
    
    // Check if there are any newer messages from this group
    const newerEvent = await db.prepare(
      "SELECT id FROM line_webhook_events WHERE group_id = ? AND event_type = 'message' AND received_at > ?"
    ).bind(groupId, receivedAt).first();

    if (newerEvent) {
      // Someone sent a message after this one! Abort sending the sticker.
      return Response.json({ ok: true, skipped: true, reason: "newer_message_exists" });
    }

    // This is the LAST message in the burst! Let's check quota and send sticker.
    const quota = await consumeAutoReplyQuota(groupId, eventId);
    
    const actionId = `debounce-${Date.now()}`;
    
    if (!quota.allowed) {
      if (quota.reason !== "disabled" && quota.reason !== "no_new_event" && quota.reason !== "no_sticker_configured") {
        await logOutboundAction({
          id: actionId,
          groupId: groupId,
          triggerEventId: eventId,
          actionType: "auto-reply-debounced",
          stickerPackageId: quota.stickerPackageId || "-",
          stickerId: quota.stickerId || "-",
          status: "skipped",
          skipReason: quota.reason
        });
      }
      return Response.json({ ok: true, skipped: true, reason: quota.reason });
    }

    const config = lineEnvironment();
    const accessToken = config.LINE_CHANNEL_ACCESS_TOKEN;
    if (!accessToken) return Response.json({ ok: false, error: "no token" }, { status: 500 });

    const response = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        replyToken: replyToken,
        messages: [{
          type: "sticker",
          packageId: quota.stickerPackageId,
          stickerId: quota.stickerId
        }]
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      await logOutboundAction({
        id: actionId,
        groupId: groupId,
        triggerEventId: eventId,
        actionType: "auto-reply-debounced",
        stickerPackageId: quota.stickerPackageId!,
        stickerId: quota.stickerId!,
        status: "failed",
        skipReason: `API Error: ${response.status} ${errBody.slice(0, 100)}`
      });
      return Response.json({ ok: false, error: "LINE API Failed" });
    }

    await logOutboundAction({
      id: actionId,
      groupId: groupId,
      triggerEventId: eventId,
      actionType: "auto-reply-debounced",
      stickerPackageId: quota.stickerPackageId!,
      stickerId: quota.stickerId!,
      status: "sent"
    });

    return Response.json({ ok: true, sent: true });

  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
