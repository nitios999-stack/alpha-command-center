import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../db/command-center";

export const runtime = "edge";

type HealthEnv = {
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  LINE_CHANNEL_SECRET?: string;
};

/** Lightweight readiness probe for monitoring and release checks. */
export async function GET() {
  const line = env as typeof env & HealthEnv;
  try {
    await ensureDatabase();
    const lineConfigured = Boolean(line.LINE_CHANNEL_ACCESS_TOKEN && line.LINE_CHANNEL_SECRET);
    return Response.json(
      {
        ok: true,
        service: "alpha-command-center",
        database: "ready",
        lineConfigured,
        checkedAt: new Date().toISOString(),
      },
      {
        status: lineConfigured ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return Response.json(
      {
        ok: false,
        service: "alpha-command-center",
        database: "unavailable",
        lineConfigured: Boolean(line.LINE_CHANNEL_ACCESS_TOKEN && line.LINE_CHANNEL_SECRET),
        checkedAt: new Date().toISOString(),
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
