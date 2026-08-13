import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";

const reminderRunToken = defineSecret("LINE_REMINDER_RUN_TOKEN");
const reminderRunnerUrl = "https://alpha-command-center--alphacommandcenter-d3341.asia-southeast1.hosted.app/api/line/reminders/run";

export const lineReportReminderScheduler = onSchedule(
  {
    schedule: "* * * * *",
    timeZone: "Asia/Bangkok",
    region: "asia-southeast1",
    timeoutSeconds: 60,
    retryCount: 1,
    maxRetrySeconds: 120,
    secrets: [reminderRunToken],
  },
  async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);
    try {
      const response = await fetch(reminderRunnerUrl, {
        method: "POST",
        headers: {
          "x-alpha-reminder-token": reminderRunToken.value(),
          "user-agent": "alpha-command-center-reminder-scheduler/1.0",
        },
        signal: controller.signal,
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`Reminder runner failed with HTTP ${response.status}: ${body.slice(0, 180)}`);
      let result = {};
      try {
        result = JSON.parse(body);
      } catch {
        // The successful response must be JSON, but logging stays safe if it is not.
      }
      const details = result && typeof result === "object" ? result : {};
      logger.info("LINE reminder scheduler completed", {
        skipped: details.skipped === true,
        pendingCount: Number(details.pendingCount ?? 0),
        escalationSent: details.escalationSent === true,
        sentAt: typeof details.sentAt === "string" ? details.sentAt : null,
      });
    } finally {
      clearTimeout(timeout);
    }
  },
);
