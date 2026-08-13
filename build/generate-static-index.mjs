import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

async function generate() {
  const workerPath = resolve("./dist/server/index.js");
  const { default: worker } = await import("file://" + workerPath);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} }
  );

  if (response.ok) {
    const html = await response.text();
    await writeFile(resolve("./dist/client/index.html"), html, "utf8");
    console.log("Successfully generated dist/client/index.html (" + html.length + " bytes)");
  } else {
    console.error("Failed to render index.html:", response.status);
  }
}

generate().catch(console.error);
