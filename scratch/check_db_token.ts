import { database, ensureDatabase } from "../db/command-center";

async function checkDbSettings() {
  await ensureDatabase();
  const db = database();
  const settings = await db.prepare("SELECT * FROM system_settings").all();
  console.log("System Settings:", JSON.stringify(settings.results, null, 2));
}

checkDbSettings();
