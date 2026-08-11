import { env } from "cloudflare:workers";
import { saveGatewayLineGroup } from "../../../../db/command-center";

export const runtime = "edge";

type GatewayEvent = { groupId?: unknown; groupName?: unknown; pictureUrl?: unknown; lastSeenAt?: unknown };
type GatewayEnv = { LINE_GATEWAY_SYNC_TOKEN?: string };

function sameValue(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

export async function POST(request: Request) {
  const token = (env as typeof env & GatewayEnv).LINE_GATEWAY_SYNC_TOKEN ?? "";
  if (!sameValue(request.headers.get("x-alpha-gateway-token") ?? "", token)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let payload: GatewayEvent;
  try {
    payload = await request.json() as GatewayEvent;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof payload.groupId !== "string" || typeof payload.groupName !== "string") return Response.json({ error: "Invalid group record" }, { status: 400 });
  await saveGatewayLineGroup({
    groupId: payload.groupId,
    groupName: payload.groupName,
    pictureUrl: typeof payload.pictureUrl === "string" ? payload.pictureUrl : null,
    lastSeenAt: typeof payload.lastSeenAt === "string" ? payload.lastSeenAt : undefined,
  });
  return Response.json({ ok: true });
}
