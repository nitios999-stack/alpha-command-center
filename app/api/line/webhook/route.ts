import { env } from "cloudflare:workers";
import { receiveLineWebhook } from "../../../../lib/line-webhook";

export const runtime = "edge";

export async function POST(request: Request) {
  return receiveLineWebhook(request, env);
}
