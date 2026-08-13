import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", String(Date.now()));
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
      DB: {
        prepare() {
          throw new Error("The dashboard API must not run during initial page rendering.");
        },
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the ALPHA Command Center shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>ALPHA Command Center<\/title>/i);
  assert.match(html, /ALPHA SECURITY/);
  assert.match(html, /Command Center/);
  assert.match(html, /เข้าเวรวันนี้/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|codex-preview/i);
});

test("keeps the command center database and product surface in source", async () => {
  const [schema, commands, page, styles, layout, packageJson, webhook, lineIntake, worker, auth, health, dashboardRoute, actionsRoute, migrations] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/command-center.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/line/webhook/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/line-webhook.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/command-center/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/command-center/actions/route.ts", import.meta.url), "utf8"),
    readdir(new URL("../drizzle/", import.meta.url)),
  ]);

  assert.match(schema, /coverage_slots/);
  assert.match(schema, /billing_cases/);
  assert.match(schema, /operational_sites/);
  assert.match(schema, /shift_templates/);
  assert.match(schema, /system_settings/);
  assert.match(schema, /line_groups/);
  assert.match(schema, /line_group_registry/);
  assert.match(schema, /line_webhook_events/);
  assert.match(schema, /idx_coverage_today/);
  assert.match(commands, /confirmSlot/);
  assert.match(commands, /replaceSlot/);
  assert.match(commands, /addBillingCase/);
  assert.match(commands, /addOperationalSite/);
  assert.match(commands, /importShiftTemplates/);
  assert.match(commands, /generateTodayFromTemplates/);
  assert.match(commands, /removeDemoData/);
  assert.match(commands, /mapLineGroup/);
  assert.match(commands, /sendLineConnectionTest/);
  assert.match(commands, /sendLineReportReminder/);
  assert.match(commands, /previewLineReportReminder/);
  assert.match(commands, /runScheduledLineReminders/);
  assert.match(commands, /saveLineReminderSettings/);
  assert.match(commands, /saveLineReportConfig/);
  assert.match(commands, /saveLineWebhookEvent/);
  assert.match(commands, /syncLineGroupsFromGateway/);
  assert.match(commands, /nameResolved/);
  assert.match(commands, /deleteLineGroup/);
  assert.match(commands, /deleteOperationalSite/);
  assert.match(commands, /updateOperationalSite/);
  assert.match(commands, /last_event_type/);
  assert.match(page, /site-wall/);
  assert.match(page, /csvToTemplates/);
  assert.match(page, /lineGroupId/);
  assert.match(page, /lineGroupLabel/);
  assert.match(page, /line-gateway-sync/);
  assert.match(page, /เช็คก่อน/);
  assert.match(page, /ลบจุด/);
  assert.match(page, /line-overview/);
  assert.match(page, /attendance-intro/);
  assert.match(page, /report-control/);
  assert.match(page, /ตรวจการส่งรายงานจาก LINE/);
  assert.match(page, /lineAgeLabel/);
  assert.match(page, /report-quick-stats/);
  assert.match(page, /report-toolbar/);
  assert.match(page, /lineEventLabel/);
  assert.match(page, /reminder-panel/);
  assert.match(page, /ดูพรีวิวก่อนส่ง/);
  assert.match(page, /MESSAGE PREVIEW/);
  assert.match(page, /เฉพาะ รปภ. ที่อนุมัติ/);
  assert.match(page, /AI REMINDER PLAN/);
  assert.match(page, /report-shift-config/);
  assert.match(page, /lineReportConfigs/);
  assert.match(page, /line-ignored-panel/);
  assert.match(page, /ทุก 5 วินาที/);
  assert.match(page, /report-priority/);
  assert.match(page, /CHECK FIRST/);
  assert.match(page, /showReportSettings/);
  assert.match(page, /useState<LineReportFilter>\("all"\)/);
  assert.match(page, /useState<[^>]+>\("reports"\)/);
  assert.match(page, /เข้าเวรวันนี้/);
  assert.match(page, /lineSignalStatus/);
  assert.doesNotMatch(page, /lineMapGroupName|lineMapPictureUrl/);
  assert.doesNotMatch(page, /line_group_name|line_picture_url/);
  assert.match(page, /LINE OA/);
  assert.match(page, /LINE Callback เชื่อมเข้าระบบโดยตรง/);
  assert.match(styles, /tile-line/);
  assert.match(styles, /line-control/);
  assert.match(styles, /--wall-columns/);
  assert.match(webhook, /receiveLineWebhook/);
  assert.match(lineIntake, /x-line-signature/);
  assert.match(lineIntake, /crypto\.subtle/);
  assert.match(lineIntake, /senderFingerprint/);
  assert.match(worker, /ctx\.waitUntil/);
  assert.match(worker, /X-Content-Type-Options/);
  assert.doesNotMatch(lineIntake, /message\.text/);
  assert.match(lineIntake, /payload too large/);
  assert.match(auth, /AUTH_REQUIRED/);
  assert.match(dashboardRoute, /apiAuthRequiredResponse/);
  assert.match(actionsRoute, /application\/json/);
  assert.match(health, /ensureDatabase/);
  assert.match(page, /สีเขียว = ครบทุกช่องกำลัง/);
  assert.match(layout, /ALPHA Command Center/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.ok(migrations.some((name) => name.endsWith(".sql")));

  await assert.deepEqual(
    await readdir(new URL("../app/_sites-preview/", import.meta.url)),
    [],
  );
  await assert.rejects(access(new URL("../public/_sites-preview/", root)));
});
