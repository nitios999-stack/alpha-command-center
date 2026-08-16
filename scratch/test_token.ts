import fs from "fs";

async function testToken() {
  const envContent = fs.readFileSync(".env", "utf-8");
  const match = envContent.match(/LINE_CHANNEL_ACCESS_TOKEN=(.+)/);
  const token = match ? match[1].trim() : "";
  console.log("Testing token:", token.slice(0, 25) + "...");

  const res = await fetch("https://api.line.me/v2/bot/info", {
    headers: { Authorization: `Bearer ${token}` }
  });
  const json = await res.json();
  console.log("LINE API Bot Info response (status " + res.status + "):", json);
}

testToken();
