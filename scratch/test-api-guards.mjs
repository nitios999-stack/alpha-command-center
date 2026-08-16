import assert from "node:assert/strict";

async function testApi() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("t", String(Date.now()));
  const { default: worker } = await import(workerUrl.href);

  console.log("1. Calling GET /api/guards?includeSenders=true&siteId=all ...");
  try {
    const getRes = await worker.fetch(
      new Request("http://localhost/api/guards?includeSenders=true&siteId=all"),
      { DB: null, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
      { waitUntil() {}, passThroughOnException() {} }
    );

    console.log("GET /api/guards status:", getRes.status);
    const getJson = await getRes.json();
    console.log("GET /api/guards response:", JSON.stringify(getJson, null, 2));
  } catch (e) {
    console.error("Direct fetch exception:", e);
  }

  console.log("\n2. Calling POST /api/guards with action: 'auto_sync' ...");
  const postRes = await worker.fetch(
    new Request("http://localhost/api/guards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "auto_sync", actor: "admin" })
    }),
    { DB: null, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} }
  );

  console.log("POST /api/guards status:", postRes.status);
  const postJson = await postRes.json();
  console.log("POST /api/guards response:", JSON.stringify(postJson, null, 2));

  console.log("\n3. Calling GET /api/guards after sync ...");
  const getRes2 = await worker.fetch(
    new Request("http://localhost/api/guards?includeSenders=true&siteId=all"),
    { DB: null, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} }
  );
  const getJson2 = await getRes2.json();
  console.log("GET /api/guards after sync guards count:", getJson2.guards?.length);
  console.log("Sample guards after sync:", JSON.stringify(getJson2.guards?.slice(0, 10), null, 2));
}

testApi().catch(console.error);
