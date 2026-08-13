const env = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
import { receiveLineWebhook } from "../../../../lib/line-webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const processEnv = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
  const config = {
    LINE_CHANNEL_ACCESS_TOKEN: (env as Record<string, string>).LINE_CHANNEL_ACCESS_TOKEN || processEnv.LINE_CHANNEL_ACCESS_TOKEN,
    LINE_CHANNEL_SECRET: (env as Record<string, string>).LINE_CHANNEL_SECRET || processEnv.LINE_CHANNEL_SECRET,
    LINE_REPORT_SENDER_SALT: (env as Record<string, string>).LINE_REPORT_SENDER_SALT || processEnv.LINE_REPORT_SENDER_SALT,
  };
  return receiveLineWebhook(request, config);
}
