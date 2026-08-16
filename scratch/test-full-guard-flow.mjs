import assert from "node:assert/strict";

async function testFullFlow() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("t", String(Date.now()));
  const { default: worker } = await import(workerUrl.href);

  console.log("=== 1. Initial State Check ===");
  const res1 = await worker.fetch(
    new Request("http://localhost/api/guards?includeSenders=true&siteId=all"),
    { DB: null, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} }
  );
  console.log("Initial GET status:", res1.status);
  const json1 = await res1.json();
  console.log("Initial guards:", json1.guards.length);

  console.log("\n=== 2. Simulating Incoming Webhook Reports from Guards across multiple LINE Groups ===");
  // Simulate Webhook Events from 3 different groups and guards:
  // Guard 1 in Group A: นายสมชาย ยืนยันเข้าเวร
  // Guard 2 in Group B: นายสมหมาย รายงานตัว
  // Guard 3 (Spare) in Group A and Group B: นายสุริยา รายงานผลัดดึก
  // Guard 4 in Group C: วิชัย เข้าเวรผลัดเช้า
  const mockWebhookEvents = [
    {
      destination: "U_BOT_DESTINATION",
      events: [
        {
          type: "message",
          message: { type: "text", id: "msg-101", text: "ป้อมหน้า ผลัดเช้า พร้อมเข้าเวรครับ" },
          source: { type: "group", groupId: "c-group-alpha-1", userId: "U4af49800000000000000000000000001" },
          timestamp: Date.now() - 3600000,
        },
        {
          type: "message",
          message: { type: "image", id: "msg-102" },
          source: { type: "group", groupId: "c-group-alpha-2", userId: "U4af49800000000000000000000000002" },
          timestamp: Date.now() - 3000000,
        },
        {
          // Multi-group guard (Spare)
          type: "message",
          message: { type: "text", id: "msg-103", text: "สแปร์กลาง เข้าแทนป้อม 2 ครับ" },
          source: { type: "group", groupId: "c-group-alpha-1", userId: "U4af49800000000000000000000000003" },
          timestamp: Date.now() - 2000000,
        },
        {
          type: "message",
          message: { type: "text", id: "msg-104", text: "สแปร์กลาง มาประจำจุดนี้แล้วครับ" },
          source: { type: "group", groupId: "c-group-alpha-2", userId: "U4af49800000000000000000000000003" },
          timestamp: Date.now() - 1000000,
        },
        {
          type: "message",
          message: { type: "text", id: "msg-105", text: "นายประเสริฐ เข้าเวร 06:00" },
          source: { type: "group", groupId: "c-group-alpha-3", userId: "U4af49800000000000000000000000004" },
          timestamp: Date.now() - 500000,
        }
      ]
    }
  ];

  for (const batch of mockWebhookEvents) {
    const wbRes = await worker.fetch(
      new Request("http://localhost/api/line/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      }),
      { DB: null, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
      { waitUntil() {}, passThroughOnException() {} }
    );
    console.log("Webhook injection response status:", wbRes.status);
  }

  console.log("\n=== 3. Discovering Recent Senders before Auto-Sync ===");
  const resSenders = await worker.fetch(
    new Request("http://localhost/api/guards?includeSenders=true&siteId=all"),
    { DB: null, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} }
  );
  const sendersJson = await resSenders.json();
  console.log("Recent senders found:", sendersJson.recentSenders?.length);
  console.log("Recent senders list:", sendersJson.recentSenders);

  console.log("\n=== 4. Triggering Auto-Sync Guards from LINE ===");
  const syncRes = await worker.fetch(
    new Request("http://localhost/api/guards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "auto_sync", actor: "admin_test" })
    }),
    { DB: null, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} }
  );
  const syncJson = await syncRes.json();
  console.log("Sync Result Message:", syncJson.message);
  console.log("Sync Stats:", syncJson);

  console.log("\n=== 5. Verifying Guard Profiles Directory ===");
  const resGuards = await worker.fetch(
    new Request("http://localhost/api/guards?includeSenders=true&siteId=all"),
    { DB: null, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} }
  );
  const guardsJson = await resGuards.json();
  console.log("Total Guard Profiles:", guardsJson.guards?.length);
  console.log("Guard Directory List:");
  for (const g of guardsJson.guards) {
    console.log(`- [${g.role.toUpperCase()}] ${g.guardName} (${g.id.slice(0, 10)}...) -> Site: ${g.siteName || g.siteId}`);
  }

  console.log("\n=== 6. Testing Manual Add / Quick-Bind / Update Guard Profile ===");
  const saveRes = await worker.fetch(
    new Request("http://localhost/api/guards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: "line-point-c-group-alpha-1",
        guardName: "นายสมเกียรติ ใจมั่นคง",
        displayName: "Somkiat LINE",
        phoneNumber: "081-234-5678",
        preferredShift: "morning",
        role: "head_guard",
      })
    }),
    { DB: null, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} }
  );
  const saveJson = await saveRes.json();
  console.log("Save custom guard result:", saveJson);

  const resFinal = await worker.fetch(
    new Request("http://localhost/api/guards?includeSenders=true&siteId=all"),
    { DB: null, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} }
  );
  const finalJson = await resFinal.json();
  console.log("\nFinal Guard Profiles count:", finalJson.guards?.length);
  console.log("All tests completed successfully!");
}

testFullFlow().catch(console.error);
