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
  assert.match(html, /กำลังวันนี้/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|codex-preview/i);
});

test("keeps the command center database and product surface in source", async () => {
  const [schema, commands, page, styles, layout, packageJson, migrations] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/command-center.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readdir(new URL("../drizzle/", import.meta.url)),
  ]);

  assert.match(schema, /coverage_slots/);
  assert.match(schema, /billing_cases/);
  assert.match(schema, /operational_sites/);
  assert.match(schema, /shift_templates/);
  assert.match(schema, /system_settings/);
  assert.match(schema, /line_groups/);
  assert.match(schema, /idx_coverage_today/);
  assert.match(commands, /confirmSlot/);
  assert.match(commands, /replaceSlot/);
  assert.match(commands, /addBillingCase/);
  assert.match(commands, /addOperationalSite/);
  assert.match(commands, /importShiftTemplates/);
  assert.match(commands, /generateTodayFromTemplates/);
  assert.match(commands, /removeDemoData/);
  assert.match(commands, /mapLineGroup/);
  assert.match(page, /site-wall/);
  assert.match(page, /csvToTemplates/);
  assert.match(page, /lineGroupId/);
  assert.match(styles, /tile-line/);
  assert.match(styles, /--wall-columns/);
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
