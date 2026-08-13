const env = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
import { saveGatewayLineGroup, saveLineWebhookEvent } from "../../../../db/command-center";

export const runtime = "nodejs";

type GatewayGroupRecord = { groupId?: unknown; groupName?: unknown; pictureUrl?: unknown; lastSeenAt?: unknown };
type GatewayLineEvent = {
  eventId?: unknown;
  groupId?: unknown;
  eventType?: unknown;
  messageType?: unknown;
  senderKey?: unknown;
  occurredAt?: unknown;
  groupName?: unknown;
  pictureUrl?: unknown;
};
type GatewayPayload = GatewayGroupRecord & { events?: unknown };
type GatewayEnv = { LINE_GATEWAY_SYNC_TOKEN?: string; LINE_GATEWAY_EVENT_TOKEN?: string };

const allowedEventTypes = new Set(["message", "follow", "unfollow", "join", "leave", "postback", "memberJoined", "memberLeft", "unknown"]);
const allowedMessageTypes = new Set(["text", "image", "video", "audio", "file", "location", "sticker", "unknown"]);

function sameValue(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

export async function POST(request: Request) {
  // Event delivery has a dedicated credential. The legacy token remains a
  // temporary fallback so registered group syncing stays compatible.
  const eventToken = ((env as typeof env & GatewayEnv).LINE_GATEWAY_EVENT_TOKEN ?? "").trim();
  const syncToken = ((env as typeof env & GatewayEnv).LINE_GATEWAY_SYNC_TOKEN ?? "").trim();
  const suppliedToken = request.headers.get("x-alpha-gateway-token") ?? "";
  if (!sameValue(suppliedToken, eventToken) && !sameValue(suppliedToken, syncToken)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let payload: GatewayPayload;
  try {
    payload = await request.json() as GatewayPayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (Array.isArray(payload.events)) {
    if (!payload.events.length || payload.events.length > 100) return Response.json({ error: "Invalid event batch" }, { status: 400 });
    const events = payload.events.flatMap((raw): GatewayLineEvent[] => raw && typeof raw === "object" ? [raw as GatewayLineEvent] : []);
    if (events.length !== payload.events.length) return Response.json({ error: "Invalid event record" }, { status: 400 });
    try {
      const saved = await Promise.all(events.map(async (event) => {
        const eventId = typeof event.eventId === "string" ? event.eventId.trim() : "";
        const groupId = typeof event.groupId === "string" ? event.groupId.trim() : "";
        const eventType = typeof event.eventType === "string" ? event.eventType.trim() : "";
        if (!eventId || eventId.length > 255 || !groupId || groupId.length > 255 || !allowedEventTypes.has(eventType)) throw new Error("Invalid event record");

        const messageType = typeof event.messageType === "string" ? event.messageType.trim() : "";
        if (eventType === "message" && messageType && !allowedMessageTypes.has(messageType)) throw new Error("Invalid message type");
        const senderKey = typeof event.senderKey === "string" ? event.senderKey.trim() : "";
        if (senderKey && !/^U-[A-F0-9]{16}$/.test(senderKey)) throw new Error("Invalid sender key");

        return saveLineWebhookEvent({
          eventId,
          groupId,
          eventType,
          messageType: eventType === "message" ? (messageType || "unknown") : undefined,
          senderKey: senderKey || undefined,
          groupName: typeof event.groupName === "string" && event.groupName.trim().length <= 255 ? event.groupName.trim() : undefined,
          pictureUrl: typeof event.pictureUrl === "string" ? event.pictureUrl : undefined,
          receivedAt: typeof event.occurredAt === "string" && event.occurredAt.length <= 64 ? event.occurredAt : undefined,
        });
      }));
      return Response.json({ ok: true, accepted: saved.filter((result) => result.saved).length, duplicate: saved.filter((result) => result.duplicate).length });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Invalid event record" }, { status: 400 });
    }
  }

  // Backward-compatible registry import. It is intentionally separate from
  // event delivery because a group listing cannot be treated as a report.
  if (typeof payload.groupId !== "string" || typeof payload.groupName !== "string") return Response.json({ error: "Invalid group record" }, { status: 400 });
  await saveGatewayLineGroup({
    groupId: payload.groupId,
    groupName: payload.groupName,
    pictureUrl: typeof payload.pictureUrl === "string" ? payload.pictureUrl : null,
    lastSeenAt: typeof payload.lastSeenAt === "string" ? payload.lastSeenAt : undefined,
  });
  return Response.json({ ok: true });
}
