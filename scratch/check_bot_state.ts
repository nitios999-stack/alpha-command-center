import { database, ensureDatabase, getEffectiveLineToken } from "../db/command-center";

async function main() {
  await ensureDatabase();
  const db = database();
  const token = await getEffectiveLineToken();
  console.log("Effective LINE Token configured:", Boolean(token), "length:", token?.length);

  const configs = await db.prepare("SELECT * FROM line_auto_reply_configs").all();
  console.log("Auto Reply Configs count:", configs.results?.length);
  console.log("Auto Reply Configs:", JSON.stringify(configs.results, null, 2));

  const recentOutbound = await db.prepare("SELECT * FROM line_outbound_audit ORDER BY sent_at DESC LIMIT 10").all();
  console.log("Recent Outbound Actions:", JSON.stringify(recentOutbound.results, null, 2));

  const recentInquiries = await db.prepare("SELECT * FROM employer_inquiries ORDER BY received_at DESC LIMIT 10").all();
  console.log("Recent Inquiries:", JSON.stringify(recentInquiries.results, null, 2));

  const guardProfiles = await db.prepare("SELECT id, guard_name, display_name, role FROM guard_profiles WHERE active = 1").all();
  console.log("Active Guard Profiles count:", guardProfiles.results?.length);
  console.log("Active Guard Profiles Sample:", JSON.stringify(guardProfiles.results?.slice(0, 10), null, 2));
}

main().catch(console.error);
