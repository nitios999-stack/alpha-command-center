import { runScheduledLineReminders } from "../../../../../db/command-center";

export const runtime = "nodejs";

// This route is deliberately independent from the dashboard session so a
// Cloud Scheduler job can run it after office hours. It remains inert until a
// deployment binds LINE_REMINDER_RUN_TOKEN as an App Hosting secret.
export async function POST(request: Request) {
  const expected = process.env.LINE_REMINDER_RUN_TOKEN?.trim();
  if (!expected) {
    return Response.json({ error: "Scheduled reminders are not configured" }, { status: 503 });
  }
  const provided = request.headers.get("x-alpha-reminder-token")?.trim() ?? "";
  if (!provided || provided.length !== expected.length) {
    return Response.json({ error: "Unauthorized scheduler request" }, { status: 401 });
  }
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) mismatch |= expected.charCodeAt(index) ^ provided.charCodeAt(index);
  if (mismatch !== 0) return Response.json({ error: "Unauthorized scheduler request" }, { status: 401 });
  try {
    return Response.json(await runScheduledLineReminders("cloud-scheduler"), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run scheduled reminders";
    return Response.json({ error: message }, { status: 500 });
  }
}
