import { env } from "cloudflare:workers";

export type CoverageState =
  | "confirmed"
  | "self_reported"
  | "waiting"
  | "replacement_required"
  | "unassigned"
  | "missing";

export type CoverageSlot = {
  id: string;
  operationalDate: string;
  wave: string;
  siteId: string;
  siteName: string;
  customerName: string;
  postName: string;
  slotLabel: string;
  assignedGuard: string | null;
  assignmentType: string;
  state: CoverageState;
  verificationPolicy: "standard" | "reviewed" | "manual";
  deadline: string;
  reportedAt: string | null;
  source: string | null;
  lateMinutes: number;
  updatedAt: string;
};

export type OperationalSite = {
  id: string;
  siteName: string;
  customerName: string;
  active: number;
};

export type LineGroup = {
  id: string;
  siteId: string | null;
  groupName: string;
  pictureUrl: string | null;
  lastSeenAt: string | null;
  source: "manual" | "webhook";
};

export type LineIntegrationStatus = {
  configured: boolean;
  gatewayConfigured: boolean;
  webhookPath: string;
  lastWebhookAt: string | null;
  receivedGroups: number;
  mappedGroups: number;
};

export type TemplateImportRow = {
  siteName: string;
  customerName: string;
  wave: "morning" | "evening";
  postName: string;
  slotLabel: string;
  assignedGuard?: string;
  deadline: string;
  verificationPolicy?: "standard" | "reviewed" | "manual";
  lineGroupId?: string;
  lineGroupName?: string;
  linePictureUrl?: string;
};

export type TemplateSummary = {
  total: number;
  morning: number;
  evening: number;
};

export type BillingCase = {
  id: string;
  customerName: string;
  servicePeriod: string;
  amountSatang: number;
  dueAt: string;
  documentState: "incomplete" | "ready";
  submissionState: "unscheduled" | "scheduled" | "submitted" | "accepted" | "rejected";
  paymentState: "unpaid" | "partial" | "settled_pending_tax_certificate" | "paid";
  nextAction: string;
  ownerName: string;
  appointmentAt: string | null;
  location: string | null;
  createdAt: string;
  updatedAt: string;
};

type D1Row = Record<string, unknown>;

function database() {
  if (!env.DB) throw new Error("ฐานข้อมูลยังไม่พร้อมใช้งาน");
  return env.DB;
}

function value(row: D1Row, key: string) {
  return row[key] === null || row[key] === undefined ? null : String(row[key]);
}

function numberValue(row: D1Row, key: string) {
  return Number(row[key] ?? 0);
}

function toCoverageSlot(row: D1Row): CoverageSlot {
  return {
    id: String(row.id),
    operationalDate: String(row.operational_date),
    wave: String(row.wave),
    siteId: String(row.site_id),
    siteName: String(row.site_name),
    customerName: String(row.customer_name),
    postName: String(row.post_name),
    slotLabel: String(row.slot_label),
    assignedGuard: value(row, "assigned_guard"),
    assignmentType: String(row.assignment_type),
    state: String(row.state) as CoverageState,
    verificationPolicy: String(row.verification_policy) as CoverageSlot["verificationPolicy"],
    deadline: String(row.deadline),
    reportedAt: value(row, "reported_at"),
    source: value(row, "source"),
    lateMinutes: numberValue(row, "late_minutes"),
    updatedAt: String(row.updated_at),
  };
}

function toBillingCase(row: D1Row): BillingCase {
  return {
    id: String(row.id),
    customerName: String(row.customer_name),
    servicePeriod: String(row.service_period),
    amountSatang: numberValue(row, "amount_satang"),
    dueAt: String(row.due_at),
    documentState: String(row.document_state) as BillingCase["documentState"],
    submissionState: String(row.submission_state) as BillingCase["submissionState"],
    paymentState: String(row.payment_state) as BillingCase["paymentState"],
    nextAction: String(row.next_action),
    ownerName: String(row.owner_name),
    appointmentAt: value(row, "appointment_at"),
    location: value(row, "location"),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toOperationalSite(row: D1Row): OperationalSite {
  return {
    id: String(row.id),
    siteName: String(row.site_name),
    customerName: String(row.customer_name),
    active: numberValue(row, "active"),
  };
}

function toLineGroup(row: D1Row): LineGroup {
  return {
    id: String(row.id),
    siteId: value(row, "site_id"),
    groupName: String(row.group_name),
    pictureUrl: value(row, "picture_url"),
    lastSeenAt: value(row, "last_seen_at"),
    source: String(row.source ?? "manual") === "webhook" ? "webhook" : "manual",
  };
}

type LineEnvironment = {
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  LINE_CHANNEL_SECRET?: string;
  LINE_GATEWAY_URL?: string;
  LINE_GATEWAY_SYNC_TOKEN?: string;
};

function lineEnvironment() {
  return env as typeof env & LineEnvironment;
}

function siteIdentifier(siteName: string) {
  return "site-" + siteName.trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/g, "-").replace(/(^-|-$)/g, "");
}

function templateIdentifier(siteId: string, wave: string, postName: string, slotLabel: string) {
  return ["template", siteId, wave, postName.trim().toLowerCase(), slotLabel.trim().toLowerCase()].join("|");
}

function pictureUrl(value?: string) {
  const candidate = value?.trim() ?? "";
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:") throw new Error();
    return url.toString();
  } catch {
    throw new Error("ลิงก์โลโก้ LINE ต้องเป็น https:// เท่านั้น");
  }
}

export function bangkokNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (name: string) => parts.find((part) => part.type === name)?.value ?? "00";
  return {
    date: get("year") + "-" + get("month") + "-" + get("day"),
    time: get("hour") + ":" + get("minute") + ":" + get("second"),
    iso: new Date().toISOString(),
  };
}

function nowMinute() {
  const bits = bangkokNow().time.split(":");
  return Number(bits[0]) * 60 + Number(bits[1]);
}

function deadlineMinute(deadline: string) {
  const bits = deadline.split(":");
  return Number(bits[0]) * 60 + Number(bits[1]);
}

export function calculateLateMinutes(deadline: string) {
  return Math.max(0, nowMinute() - deadlineMinute(deadline));
}

export async function ensureDatabase() {
  const db = database();
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS line_groups (id TEXT PRIMARY KEY, site_id TEXT NOT NULL, group_name TEXT NOT NULL, picture_url TEXT, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS line_group_registry (id TEXT PRIMARY KEY, group_name TEXT NOT NULL, picture_url TEXT, last_seen_at TEXT, source TEXT NOT NULL DEFAULT 'manual', updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS line_webhook_events (id TEXT PRIMARY KEY, group_id TEXT, event_type TEXT NOT NULL, received_at TEXT NOT NULL, summary TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS operational_sites (id TEXT PRIMARY KEY, site_name TEXT NOT NULL, customer_name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS shift_templates (id TEXT PRIMARY KEY, site_id TEXT NOT NULL, wave TEXT NOT NULL, post_name TEXT NOT NULL, slot_label TEXT NOT NULL, assigned_guard TEXT, deadline TEXT NOT NULL, verification_policy TEXT NOT NULL DEFAULT 'standard', active INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS coverage_slots (id TEXT PRIMARY KEY, operational_date TEXT NOT NULL, wave TEXT NOT NULL, site_id TEXT NOT NULL, site_name TEXT NOT NULL, customer_name TEXT NOT NULL, post_name TEXT NOT NULL, slot_label TEXT NOT NULL, assigned_guard TEXT, assignment_type TEXT NOT NULL DEFAULT 'regular', state TEXT NOT NULL, verification_policy TEXT NOT NULL DEFAULT 'standard', deadline TEXT NOT NULL, reported_at TEXT, source TEXT, late_minutes INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS billing_cases (id TEXT PRIMARY KEY, customer_name TEXT NOT NULL, service_period TEXT NOT NULL, amount_satang INTEGER NOT NULL, due_at TEXT NOT NULL, document_state TEXT NOT NULL DEFAULT 'incomplete', submission_state TEXT NOT NULL DEFAULT 'unscheduled', payment_state TEXT NOT NULL DEFAULT 'unpaid', next_action TEXT NOT NULL, owner_name TEXT NOT NULL, appointment_at TEXT, location TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL, summary TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_coverage_today ON coverage_slots(operational_date, wave, site_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_billing_due ON billing_cases(due_at, payment_state)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_operational_sites_active ON operational_sites(active, site_name)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_shift_templates_wave_active ON shift_templates(wave, active, site_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_shift_templates_site_slot ON shift_templates(site_id, wave, post_name, slot_label)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_line_groups_site ON line_groups(site_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_line_groups_name ON line_groups(group_name)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_line_registry_name ON line_group_registry(group_name)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_line_registry_seen ON line_group_registry(last_seen_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_line_events_group_time ON line_webhook_events(group_id, received_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_line_events_type_time ON line_webhook_events(event_type, received_at)"),
  ]);

  const seedSetting = await db.prepare("SELECT value FROM system_settings WHERE key = 'demo_seeded'").first<{ value: string }>();
  if (!seedSetting) {
    const count = await db.prepare("SELECT COUNT(*) AS count FROM coverage_slots").first<{ count: number }>();
    if ((count?.count ?? 0) === 0) await seedDemoData();
    await db.prepare("INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('demo_seeded', '1', ?)").bind(bangkokNow().iso).run();
  }
  await syncSiteRegistryFromSlots();
  const templateCount = await db.prepare("SELECT COUNT(*) AS count FROM shift_templates").first<{ count: number }>();
  if ((templateCount?.count ?? 0) === 0) await syncTemplatesFromCoverageSlots();
  await seedDemoLineGroups();
  await syncLineRegistryFromMappings();
}

async function syncSiteRegistryFromSlots() {
  const now = bangkokNow().iso;
  await database().prepare("INSERT OR IGNORE INTO operational_sites (id, site_name, customer_name, active, created_at, updated_at) SELECT site_id, MAX(site_name), MAX(customer_name), 1, ?, ? FROM coverage_slots GROUP BY site_id")
    .bind(now, now).run();
}

async function syncTemplatesFromCoverageSlots() {
  const now = bangkokNow().iso;
  await database().prepare("INSERT OR IGNORE INTO shift_templates (id, site_id, wave, post_name, slot_label, assigned_guard, deadline, verification_policy, active, updated_at) SELECT 'template|' || site_id || '|' || wave || '|' || lower(post_name) || '|' || lower(slot_label), site_id, wave, post_name, slot_label, assigned_guard, deadline, verification_policy, 1, ? FROM coverage_slots")
    .bind(now).run();
}

async function seedDemoLineGroups() {
  const db = database();
  const demoCount = await db.prepare("SELECT COUNT(*) AS count FROM operational_sites WHERE id = 'site-green'").first<{ count: number }>();
  const linkedCount = await db.prepare("SELECT COUNT(*) AS count FROM line_groups WHERE site_id IN ('site-green', 'site-late', 'site-waiting', 'site-missing')").first<{ count: number }>();
  if (!(demoCount?.count ?? 0) || (linkedCount?.count ?? 0)) return;
  const now = bangkokNow().iso;
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO line_groups (id, site_id, group_name, picture_url, updated_at) VALUES (?, ?, ?, NULL, ?)").bind("demo-line-green", "site-green", "กลุ่ม รปภ. กรีนวิลล์", now),
    db.prepare("INSERT OR IGNORE INTO line_groups (id, site_id, group_name, picture_url, updated_at) VALUES (?, ?, ?, NULL, ?)").bind("demo-line-late", "site-late", "กลุ่ม รปภ. ซิตี้ทาวเวอร์", now),
    db.prepare("INSERT OR IGNORE INTO line_groups (id, site_id, group_name, picture_url, updated_at) VALUES (?, ?, ?, NULL, ?)").bind("demo-line-waiting", "site-waiting", "กลุ่ม รปภ. ริเวอร์พาร์ค", now),
    db.prepare("INSERT OR IGNORE INTO line_groups (id, site_id, group_name, picture_url, updated_at) VALUES (?, ?, ?, NULL, ?)").bind("demo-line-missing", "site-missing", "กลุ่ม รปภ. เอสพีโลจิสติกส์", now),
  ]);
}

async function syncLineRegistryFromMappings() {
  const now = bangkokNow().iso;
  await database().prepare("INSERT INTO line_group_registry (id, group_name, picture_url, last_seen_at, source, updated_at) SELECT id, group_name, picture_url, NULL, 'manual', ? FROM line_groups WHERE 1 = 1 ON CONFLICT(id) DO UPDATE SET group_name = excluded.group_name, picture_url = COALESCE(excluded.picture_url, line_group_registry.picture_url), updated_at = excluded.updated_at")
    .bind(now).run();
}

async function seedDemoData() {
  const db = database();
  const today = bangkokNow().date;
  const created = bangkokNow().iso;
  const seedSlots = [
    ["slot-green-1", today, "morning", "site-green", "หมู่บ้านกรีนวิลล์", "บริษัท กรีนวิลล์ จำกัด", "ป้อมหน้า", "ช่อง 1", "นายสมชาย", "regular", "confirmed", "standard", "06:00", "05:42", "LINE OA", 0],
    ["slot-green-2", today, "morning", "site-green", "หมู่บ้านกรีนวิลล์", "บริษัท กรีนวิลล์ จำกัด", "ป้อมหลัง", "ช่อง 2", "นายวิชัย", "regular", "confirmed", "standard", "06:00", "05:49", "หัวหน้ายืนยัน", 0],
    ["slot-late-1", today, "morning", "site-late", "อาคารซิตี้ทาวเวอร์", "บริษัท ซิตี้ทาวเวอร์ จำกัด", "ล็อบบี้", "ช่อง 1", "นายประทีป", "regular", "confirmed", "standard", "06:15", "06:27", "LINE OA", 12],
    ["slot-waiting-1", today, "morning", "site-waiting", "โครงการริเวอร์พาร์ค", "โครงการริเวอร์พาร์ค", "ประตูหลัก", "ช่อง 1", "นายธีระ", "regular", "waiting", "reviewed", "06:30", null, null, 0],
    ["slot-missing-1", today, "morning", "site-missing", "คลังสินค้าเอสพี", "บริษัท เอสพี โลจิสติกส์", "ประตูรถบรรทุก", "ช่อง 1", null, "rotating", "replacement_required", "manual", "05:45", null, null, 0],
    ["slot-missing-2", today, "morning", "site-missing", "คลังสินค้าเอสพี", "บริษัท เอสพี โลจิสติกส์", "สายตรวจ", "ช่อง 2", "นายเกรียงไกร", "regular", "missing", "manual", "05:45", null, null, 0],
  ];
  const operations = seedSlots.map((slot) =>
    db.prepare("INSERT INTO coverage_slots (id, operational_date, wave, site_id, site_name, customer_name, post_name, slot_label, assigned_guard, assignment_type, state, verification_policy, deadline, reported_at, source, late_minutes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(...slot, created)
  );
  operations.push(
    db.prepare("INSERT INTO billing_cases (id, customer_name, service_period, amount_satang, due_at, document_state, submission_state, payment_state, next_action, owner_name, appointment_at, location, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("bill-001", "บริษัท กรีนวิลล์ จำกัด", "สิงหาคม 2569", 12840000, today, "ready", "scheduled", "unpaid", "วางบิลกับคุณพรทิพย์", "ธุรการการเงิน", today + "T10:00:00+07:00", "สำนักงานใหญ่กรีนวิลล์", created, created)
  );
  operations.push(
    db.prepare("INSERT INTO billing_cases (id, customer_name, service_period, amount_satang, due_at, document_state, submission_state, payment_state, next_action, owner_name, appointment_at, location, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("bill-002", "บริษัท ซิตี้ทาวเวอร์ จำกัด", "สิงหาคม 2569", 9850000, today, "incomplete", "unscheduled", "unpaid", "รอใบส่งมอบงาน", "ธุรการการเงิน", null, null, created, created)
  );
  await db.batch(operations);
}

export async function getDashboard() {
  await ensureDatabase();
  const db = database();
  const today = bangkokNow().date;
  const slotResult = await db.prepare("SELECT * FROM coverage_slots WHERE operational_date = ? ORDER BY wave, site_name, post_name, slot_label").bind(today).all<D1Row>();
  const siteResult = await db.prepare("SELECT * FROM operational_sites WHERE active = 1 ORDER BY site_name").all<D1Row>();
  const lineGroupResult = await db.prepare("SELECT r.id, m.site_id, r.group_name, r.picture_url, r.last_seen_at, r.source FROM line_group_registry r LEFT JOIN line_groups m ON m.id = r.id ORDER BY CASE WHEN m.site_id IS NULL THEN 0 ELSE 1 END, r.group_name").all<D1Row>();
  const templateResult = await db.prepare("SELECT wave, COUNT(*) AS count FROM shift_templates WHERE active = 1 GROUP BY wave").all<D1Row>();
  const demoCount = await db.prepare("SELECT COUNT(*) AS count FROM operational_sites WHERE id IN ('site-green', 'site-late', 'site-waiting', 'site-missing')").first<{ count: number }>();
  const billingResult = await db.prepare("SELECT * FROM billing_cases ORDER BY due_at ASC, updated_at DESC LIMIT 30").all<D1Row>();
  const lineCounts = await db.prepare("SELECT COUNT(*) AS received_groups, COUNT(m.id) AS mapped_groups, MAX(r.last_seen_at) AS last_webhook_at FROM line_group_registry r LEFT JOIN line_groups m ON m.id = r.id").first<{ received_groups: number; mapped_groups: number; last_webhook_at: string | null }>();
  const templates: TemplateSummary = { total: 0, morning: 0, evening: 0 };
  (templateResult.results ?? []).forEach((row) => {
    const wave = String(row.wave);
    const count = numberValue(row, "count");
    if (wave === "morning" || wave === "evening") templates[wave] = count;
    templates.total += count;
  });
  return {
    today,
    now: bangkokNow(),
    slots: (slotResult.results ?? []).map(toCoverageSlot),
    sites: (siteResult.results ?? []).map(toOperationalSite),
    lineGroups: (lineGroupResult.results ?? []).map(toLineGroup),
    lineIntegration: {
      configured: Boolean(lineEnvironment().LINE_CHANNEL_ACCESS_TOKEN && lineEnvironment().LINE_CHANNEL_SECRET),
      gatewayConfigured: Boolean(lineEnvironment().LINE_GATEWAY_URL && lineEnvironment().LINE_GATEWAY_SYNC_TOKEN),
      webhookPath: lineEnvironment().LINE_GATEWAY_URL ? `${lineEnvironment().LINE_GATEWAY_URL.replace(/\/$/, "")}/api/line/webhook` : "/api/line/webhook",
      lastWebhookAt: lineCounts?.last_webhook_at ?? null,
      receivedGroups: Number(lineCounts?.received_groups ?? 0),
      mappedGroups: Number(lineCounts?.mapped_groups ?? 0),
    } satisfies LineIntegrationStatus,
    templates,
    demoDataPresent: Number(demoCount?.count ?? 0) > 0,
    billingCases: (billingResult.results ?? []).map(toBillingCase),
  };
}

export async function saveGatewayLineGroup(input: { groupId: string; groupName: string; pictureUrl?: string | null; lastSeenAt?: string }) {
  await ensureDatabase();
  const groupId = input.groupId.trim();
  const groupName = input.groupName.trim();
  if (!groupId || !groupName || groupId.length > 255 || groupName.length > 255) throw new Error("invalid LINE group record");
  const candidateTime = input.lastSeenAt?.trim() ?? "";
  const lastSeenAt = candidateTime && !Number.isNaN(Date.parse(candidateTime)) ? candidateTime : bangkokNow().iso;
  const now = bangkokNow().iso;
  await database().prepare("INSERT INTO line_group_registry (id, group_name, picture_url, last_seen_at, source, updated_at) VALUES (?, ?, ?, ?, 'webhook', ?) ON CONFLICT(id) DO UPDATE SET group_name = excluded.group_name, picture_url = COALESCE(excluded.picture_url, line_group_registry.picture_url), last_seen_at = excluded.last_seen_at, source = 'webhook', updated_at = excluded.updated_at")
    .bind(groupId, groupName, pictureUrl(input.pictureUrl ?? undefined), lastSeenAt, now).run();
}

export async function addAudit(entityType: string, entityId: string, action: string, actor: string, summary: string) {
  await database().prepare("INSERT INTO audit_logs (id, entity_type, entity_id, action, actor, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind("audit-" + crypto.randomUUID(), entityType, entityId, action, actor, summary, bangkokNow().iso).run();
}

export async function confirmSlot(slotId: string, source: string, actor: string) {
  await ensureDatabase();
  const db = database();
  const slot = await db.prepare("SELECT * FROM coverage_slots WHERE id = ?").bind(slotId).first<D1Row>();
  if (!slot) throw new Error("ไม่พบช่องกำลังที่เลือก");
  const lateMinutes = calculateLateMinutes(String(slot.deadline));
  const now = bangkokNow().iso;
  await db.prepare("UPDATE coverage_slots SET state = 'confirmed', reported_at = ?, source = ?, late_minutes = ?, updated_at = ? WHERE id = ?")
    .bind(now, source, lateMinutes, now, slotId).run();
  await addAudit("coverage_slot", slotId, "confirmed", actor, "ยืนยันเข้าเวรจาก " + source);
}

export async function replaceSlot(slotId: string, guardName: string, actor: string) {
  await ensureDatabase();
  if (!guardName.trim()) throw new Error("กรุณาระบุชื่อสแปร์");
  const now = bangkokNow().iso;
  await database().prepare("UPDATE coverage_slots SET assigned_guard = ?, assignment_type = 'spare', state = 'waiting', reported_at = NULL, source = NULL, late_minutes = 0, updated_at = ? WHERE id = ?")
    .bind(guardName.trim(), now, slotId).run();
  await addAudit("coverage_slot", slotId, "replacement_assigned", actor, "มอบหมายสแปร์ " + guardName.trim());
}

export async function markLeave(slotId: string, actor: string) {
  await ensureDatabase();
  const now = bangkokNow().iso;
  await database().prepare("UPDATE coverage_slots SET assigned_guard = NULL, assignment_type = 'rotating', state = 'replacement_required', reported_at = NULL, source = NULL, late_minutes = 0, updated_at = ? WHERE id = ?")
    .bind(now, slotId).run();
  await addAudit("coverage_slot", slotId, "leave_recorded", actor, "บันทึกลา/หยุด และต้องหาสแปร์");
}

export async function addCoverageSlot(input: {
  wave: string;
  siteName: string;
  customerName: string;
  postName: string;
  slotLabel: string;
  assignedGuard: string;
  deadline: string;
  verificationPolicy: string;
  actor: string;
}) {
  await ensureDatabase();
  const now = bangkokNow();
  const id = "slot-" + crypto.randomUUID();
  const assignedGuard = input.assignedGuard.trim();
  const state: CoverageState = assignedGuard ? "waiting" : "unassigned";
  const siteId = siteIdentifier(input.siteName);
  const db = database();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO operational_sites (id, site_name, customer_name, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)")
      .bind(siteId, input.siteName.trim(), input.customerName.trim(), now.iso, now.iso),
    db.prepare("INSERT INTO coverage_slots (id, operational_date, wave, site_id, site_name, customer_name, post_name, slot_label, assigned_guard, assignment_type, state, verification_policy, deadline, reported_at, source, late_minutes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, ?)")
      .bind(id, now.date, input.wave, siteId, input.siteName.trim(), input.customerName.trim(), input.postName.trim(), input.slotLabel.trim(), assignedGuard || null, assignedGuard ? "regular" : "rotating", state, input.verificationPolicy, input.deadline, now.iso),
  ]);
  await addAudit("coverage_slot", id, "created", input.actor, "เพิ่มช่องกำลัง " + input.siteName.trim() + " / " + input.slotLabel.trim());
}

export async function addOperationalSite(input: { siteName: string; customerName: string; actor: string }) {
  await ensureDatabase();
  const siteName = input.siteName.trim();
  const customerName = input.customerName.trim();
  if (!siteName || !customerName) throw new Error("กรุณาระบุชื่อจุดและลูกค้า");
  const now = bangkokNow().iso;
  const id = siteIdentifier(siteName);
  await database().prepare("INSERT OR IGNORE INTO operational_sites (id, site_name, customer_name, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)")
    .bind(id, siteName, customerName, now, now).run();
  await addAudit("operational_site", id, "created", input.actor, "เพิ่มจุดสำหรับตั้งอัตรา " + siteName);
}

export async function mapLineGroup(input: { siteId: string; groupId: string; groupName: string; pictureUrl?: string; actor: string }) {
  await ensureDatabase();
  const siteId = input.siteId.trim();
  const groupId = input.groupId.trim();
  const groupName = input.groupName.trim();
  if (!siteId || !groupId || !groupName) throw new Error("กรุณาระบุรหัสกลุ่มและชื่อกลุ่ม LINE ให้ครบ");
  const db = database();
  const site = await db.prepare("SELECT site_name FROM operational_sites WHERE id = ? AND active = 1").bind(siteId).first<D1Row>();
  if (!site) throw new Error("ไม่พบจุดที่ต้องการผูกกลุ่ม LINE");
  const now = bangkokNow().iso;
  const safePictureUrl = pictureUrl(input.pictureUrl);
  await db.batch([
    db.prepare("DELETE FROM line_groups WHERE site_id = ? AND id != ?").bind(siteId, groupId),
    db.prepare("INSERT INTO line_groups (id, site_id, group_name, picture_url, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET site_id = excluded.site_id, group_name = excluded.group_name, picture_url = excluded.picture_url, updated_at = excluded.updated_at")
      .bind(groupId, siteId, groupName, safePictureUrl, now),
    db.prepare("INSERT INTO line_group_registry (id, group_name, picture_url, last_seen_at, source, updated_at) VALUES (?, ?, ?, NULL, 'manual', ?) ON CONFLICT(id) DO UPDATE SET group_name = excluded.group_name, picture_url = COALESCE(excluded.picture_url, line_group_registry.picture_url), updated_at = excluded.updated_at")
      .bind(groupId, groupName, safePictureUrl, now),
  ]);
  await addAudit("line_group", groupId, "mapped", input.actor, `ผูกกลุ่ม LINE ${groupName} กับ ${String(site.site_name)}`);
}

export async function unmapLineGroup(groupId: string, actor: string) {
  await ensureDatabase();
  const id = groupId.trim();
  if (!id) throw new Error("ไม่พบกลุ่ม LINE ที่ต้องการยกเลิกการผูก");
  const db = database();
  const mapping = await db.prepare("SELECT group_name, site_id FROM line_groups WHERE id = ?").bind(id).first<D1Row>();
  if (!mapping) return;
  await db.prepare("DELETE FROM line_groups WHERE id = ?").bind(id).run();
  await addAudit("line_group", id, "unmapped", actor, `ยกเลิกการผูกกลุ่ม LINE ${String(mapping.group_name)} จากจุด ${String(mapping.site_id)}`);
}

export async function saveLineWebhookEvent(input: {
  eventId: string;
  groupId: string;
  eventType: string;
  groupName?: string;
  pictureUrl?: string | null;
}) {
  await ensureDatabase();
  const db = database();
  const now = bangkokNow().iso;
  const groupId = input.groupId.trim();
  if (!groupId) return { saved: false, duplicate: false };
  const eventId = input.eventId.trim();
  if (!eventId) return { saved: false, duplicate: false };
  const prior = await db.prepare("SELECT id FROM line_webhook_events WHERE id = ?").bind(eventId).first<D1Row>();
  if (prior) return { saved: false, duplicate: true };
  const groupName = input.groupName?.trim() || `กลุ่ม LINE ${groupId.slice(-6)}`;
  const safePictureUrl = input.pictureUrl ? pictureUrl(input.pictureUrl) : null;
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO line_webhook_events (id, group_id, event_type, received_at, summary) VALUES (?, ?, ?, ?, ?)")
      .bind(eventId, groupId, input.eventType.slice(0, 48), now, "Webhook ที่ตรวจสอบลายเซ็นแล้ว; ไม่เก็บข้อความในกลุ่ม"),
    db.prepare("INSERT INTO line_group_registry (id, group_name, picture_url, last_seen_at, source, updated_at) VALUES (?, ?, ?, ?, 'webhook', ?) ON CONFLICT(id) DO UPDATE SET group_name = excluded.group_name, picture_url = COALESCE(excluded.picture_url, line_group_registry.picture_url), last_seen_at = excluded.last_seen_at, source = 'webhook', updated_at = excluded.updated_at")
      .bind(groupId, groupName, safePictureUrl, now, now),
  ]);
  return { saved: true, duplicate: false };
}

export async function sendLineConnectionTest(input: { groupId: string; actor: string }) {
  await ensureDatabase();
  const groupId = input.groupId.trim();
  const token = lineEnvironment().LINE_CHANNEL_ACCESS_TOKEN;
  if (!groupId) throw new Error("ไม่พบกลุ่ม LINE ที่ต้องการทดสอบ");
  if (!token) throw new Error("ยังไม่ได้ตั้งค่า Channel access token ในระบบที่ปลอดภัย");
  const group = await database().prepare("SELECT group_name FROM line_group_registry WHERE id = ?").bind(groupId).first<D1Row>();
  if (!group) throw new Error("กลุ่มนี้ยังไม่อยู่ในทะเบียน LINE");
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      to: groupId,
      messages: [{ type: "text", text: "ALPHA Command Center: ทดสอบการเชื่อมต่อกลุ่มสำเร็จ\nข้อความนี้ไม่แสดงสถานะกำลังหรือข้อมูลภายใน" }],
    }),
  });
  if (!response.ok) throw new Error("LINE OA ไม่รับการส่งข้อความทดสอบ โปรดตรวจว่าบอตอยู่ในกลุ่มและสิทธิ์ Channel ถูกต้อง");
  await addAudit("line_group", groupId, "connection_test_sent", input.actor, `ส่งข้อความทดสอบไปยัง ${String(group.group_name)} โดยไม่ส่งข้อมูลภายใน`);
}

export async function syncLineGroupsFromGateway(actor?: string) {
  await ensureDatabase();
  const gatewayUrl = lineEnvironment().LINE_GATEWAY_URL?.trim();
  const syncToken = lineEnvironment().LINE_GATEWAY_SYNC_TOKEN;
  if (!gatewayUrl || !syncToken) throw new Error("ยังไม่ได้ตั้งค่าการเชื่อมต่อ LINE Gateway ที่ปลอดภัย");
  let endpoint: string;
  try {
    const base = new URL(gatewayUrl);
    if (base.protocol !== "https:") throw new Error();
    endpoint = new URL("/api/groups", base).toString();
  } catch {
    throw new Error("ที่อยู่ LINE Gateway ต้องเป็น https:// ที่ถูกต้อง");
  }
  const response = await fetch(endpoint, { headers: { "x-alpha-gateway-token": syncToken } });
  if (!response.ok) throw new Error("ไม่สามารถรับทะเบียนกลุ่มจาก LINE Gateway ได้");
  const payload = await response.json() as { groups?: unknown };
  if (!Array.isArray(payload.groups)) throw new Error("ข้อมูลทะเบียนกลุ่มจาก LINE Gateway ไม่ถูกต้อง");
  const now = bangkokNow().iso;
  const groups = payload.groups.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const group = raw as { id?: unknown; groupName?: unknown; pictureUrl?: unknown; lastSeenAt?: unknown };
    const id = typeof group.id === "string" ? group.id.trim() : "";
    const groupName = typeof group.groupName === "string" ? group.groupName.trim() : "";
    if (!id || !groupName || id.length > 255 || groupName.length > 255) return [];
    let avatar: string | null = null;
    if (typeof group.pictureUrl === "string" && group.pictureUrl.trim()) {
      try { avatar = pictureUrl(group.pictureUrl); } catch { avatar = null; }
    }
    const lastSeenAt = typeof group.lastSeenAt === "string" && group.lastSeenAt.length <= 64 ? group.lastSeenAt : now;
    return [{ id, groupName, pictureUrl: avatar, lastSeenAt }];
  });
  const db = database();
  for (let offset = 0; offset < groups.length; offset += 80) {
    await db.batch(groups.slice(offset, offset + 80).map((group) =>
      db.prepare("INSERT INTO line_group_registry (id, group_name, picture_url, last_seen_at, source, updated_at) VALUES (?, ?, ?, ?, 'webhook', ?) ON CONFLICT(id) DO UPDATE SET group_name = excluded.group_name, picture_url = COALESCE(excluded.picture_url, line_group_registry.picture_url), last_seen_at = excluded.last_seen_at, source = 'webhook', updated_at = excluded.updated_at")
        .bind(group.id, group.groupName, group.pictureUrl, group.lastSeenAt, now),
    ));
  }
  if (actor) await addAudit("line_gateway", "registry", "synced", actor, `รับทะเบียนกลุ่ม LINE ${groups.length} กลุ่มจาก gateway ที่ยืนยันตัวตนแล้ว`);
  return { imported: groups.length };
}

export async function importShiftTemplates(rows: TemplateImportRow[], actor: string) {
  await ensureDatabase();
  if (!rows.length) throw new Error("ไม่พบรายการอัตรากำลังในไฟล์");
  if (rows.length > 300) throw new Error("นำเข้าได้ครั้งละไม่เกิน 300 อัตรา");

  const now = bangkokNow().iso;
  const db = database();
  const uniqueRows = new Map<string, TemplateImportRow>();
  const lineGroupBySite = new Map<string, { id: string; name: string; pictureUrl: string }>();
  const siteByLineGroup = new Map<string, string>();

  rows.forEach((raw, index) => {
    const siteName = raw.siteName?.trim() ?? "";
    const customerName = raw.customerName?.trim() ?? "";
    const postName = raw.postName?.trim() ?? "";
    const slotLabel = raw.slotLabel?.trim() ?? "";
    const deadline = raw.deadline?.trim() ?? "";
    const wave = raw.wave === "evening" ? "evening" : "morning";
    const verificationPolicy = raw.verificationPolicy === "manual" || raw.verificationPolicy === "reviewed" ? raw.verificationPolicy : "standard";
    const lineGroupId = raw.lineGroupId?.trim() ?? "";
    const lineGroupName = raw.lineGroupName?.trim() ?? "";
    const linePictureUrl = pictureUrl(raw.linePictureUrl) ?? "";
    if (!siteName || !customerName || !postName || !slotLabel || !/^\d{2}:\d{2}$/.test(deadline)) {
      throw new Error(`แถวที่ ${index + 2} มีข้อมูลไม่ครบหรือเวลาไม่ถูกต้อง`);
    }
    if ((lineGroupName || linePictureUrl) && !lineGroupId) throw new Error(`แถวที่ ${index + 2} ระบุชื่อหรือโลโก้ LINE แต่ไม่มี line_group_id`);
    if (lineGroupId && !lineGroupName) throw new Error(`แถวที่ ${index + 2} มี line_group_id แต่ไม่มี line_group_name`);
    const siteId = siteIdentifier(siteName);
    if (lineGroupId) {
      const alreadyMapped = lineGroupBySite.get(siteId);
      if (alreadyMapped && alreadyMapped.id !== lineGroupId) throw new Error(`จุด ${siteName} ผูกกับ LINE มากกว่า 1 กลุ่มในไฟล์เดียวกัน`);
      const linkedSite = siteByLineGroup.get(lineGroupId);
      if (linkedSite && linkedSite !== siteId) throw new Error(`กลุ่ม LINE ${lineGroupName} ถูกผูกซ้ำมากกว่า 1 จุด`);
      lineGroupBySite.set(siteId, { id: lineGroupId, name: lineGroupName, pictureUrl: linePictureUrl });
      siteByLineGroup.set(lineGroupId, siteId);
    }
    uniqueRows.set(templateIdentifier(siteId, wave, postName, slotLabel), {
      siteName,
      customerName,
      wave,
      postName,
      slotLabel,
      assignedGuard: raw.assignedGuard?.trim() ?? "",
      deadline,
      verificationPolicy,
      lineGroupId,
      lineGroupName,
      linePictureUrl,
    });
  });

  const operations = Array.from(uniqueRows.entries()).flatMap(([templateId, row]) => {
    const siteId = siteIdentifier(row.siteName);
    return [
      db.prepare("INSERT INTO operational_sites (id, site_name, customer_name, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT(id) DO UPDATE SET site_name = excluded.site_name, customer_name = excluded.customer_name, active = 1, updated_at = excluded.updated_at")
        .bind(siteId, row.siteName, row.customerName, now, now),
      db.prepare("INSERT INTO shift_templates (id, site_id, wave, post_name, slot_label, assigned_guard, deadline, verification_policy, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?) ON CONFLICT(id) DO UPDATE SET assigned_guard = excluded.assigned_guard, deadline = excluded.deadline, verification_policy = excluded.verification_policy, active = 1, updated_at = excluded.updated_at")
        .bind(templateId, siteId, row.wave, row.postName, row.slotLabel, row.assignedGuard || null, row.deadline, row.verificationPolicy, now),
    ];
  });

  for (let offset = 0; offset < operations.length; offset += 80) {
    await db.batch(operations.slice(offset, offset + 80));
  }

  const lineOperations = Array.from(lineGroupBySite.entries()).flatMap(([siteId, group]) => [
    db.prepare("DELETE FROM line_groups WHERE site_id = ? AND id != ?").bind(siteId, group.id),
    db.prepare("INSERT INTO line_groups (id, site_id, group_name, picture_url, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET site_id = excluded.site_id, group_name = excluded.group_name, picture_url = excluded.picture_url, updated_at = excluded.updated_at")
      .bind(group.id, siteId, group.name, group.pictureUrl || null, now),
    db.prepare("INSERT INTO line_group_registry (id, group_name, picture_url, last_seen_at, source, updated_at) VALUES (?, ?, ?, NULL, 'manual', ?) ON CONFLICT(id) DO UPDATE SET group_name = excluded.group_name, picture_url = COALESCE(excluded.picture_url, line_group_registry.picture_url), updated_at = excluded.updated_at")
      .bind(group.id, group.name, group.pictureUrl || null, now),
  ]);
  for (let offset = 0; offset < lineOperations.length; offset += 80) {
    await db.batch(lineOperations.slice(offset, offset + 80));
  }
  await addAudit("shift_template", "bulk-import", "imported", actor, `นำเข้าอัตรากำลัง ${uniqueRows.size} ช่อง และผูก LINE ${lineGroupBySite.size} กลุ่ม`);
  return { imported: uniqueRows.size, lineGroups: lineGroupBySite.size };
}

export async function generateTodayFromTemplates(actor: string) {
  await ensureDatabase();
  const db = database();
  const today = bangkokNow();
  const templates = await db.prepare("SELECT t.*, s.site_name, s.customer_name FROM shift_templates t INNER JOIN operational_sites s ON s.id = t.site_id WHERE t.active = 1 AND s.active = 1 ORDER BY t.wave, s.site_name, t.post_name, t.slot_label").all<D1Row>();
  const total = templates.results?.length ?? 0;
  if (!total) return { created: 0, existing: 0, total: 0 };

  const before = await db.prepare("SELECT COUNT(*) AS count FROM coverage_slots WHERE operational_date = ?").bind(today.date).first<{ count: number }>();
  const operations = (templates.results ?? []).map((template) => {
    const assignedGuard = value(template, "assigned_guard");
    const state: CoverageState = assignedGuard ? "waiting" : "unassigned";
    const id = "slot|" + today.date + "|" + String(template.id);
    return db.prepare("INSERT OR IGNORE INTO coverage_slots (id, operational_date, wave, site_id, site_name, customer_name, post_name, slot_label, assigned_guard, assignment_type, state, verification_policy, deadline, reported_at, source, late_minutes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, ?)")
      .bind(id, today.date, String(template.wave), String(template.site_id), String(template.site_name), String(template.customer_name), String(template.post_name), String(template.slot_label), assignedGuard, assignedGuard ? "regular" : "rotating", state, String(template.verification_policy), String(template.deadline), today.iso);
  });
  await db.batch(operations);
  const after = await db.prepare("SELECT COUNT(*) AS count FROM coverage_slots WHERE operational_date = ?").bind(today.date).first<{ count: number }>();
  const created = Math.max(0, Number(after?.count ?? 0) - Number(before?.count ?? 0));
  await addAudit("coverage_slot", today.date, "generated_from_templates", actor, `สร้างแผงวันนี้จากอัตราต้นแบบ เพิ่ม ${created} จาก ${total} ช่อง`);
  return { created, existing: total - created, total };
}

export async function removeDemoData(actor: string) {
  await ensureDatabase();
  const db = database();
  const demoSites = "'site-green', 'site-late', 'site-waiting', 'site-missing'";
  await db.batch([
    db.prepare("DELETE FROM line_groups WHERE site_id IN (" + demoSites + ")"),
    db.prepare("DELETE FROM line_group_registry WHERE id IN ('demo-line-green', 'demo-line-late', 'demo-line-waiting', 'demo-line-missing')"),
    db.prepare("DELETE FROM coverage_slots WHERE site_id IN (" + demoSites + ")"),
    db.prepare("DELETE FROM shift_templates WHERE site_id IN (" + demoSites + ")"),
    db.prepare("DELETE FROM operational_sites WHERE id IN (" + demoSites + ")"),
    db.prepare("DELETE FROM billing_cases WHERE id IN ('bill-001', 'bill-002')"),
  ]);
  await addAudit("system", "demo-data", "removed", actor, "ล้างเฉพาะข้อมูลตัวอย่างของระบบ");
}

export async function addBillingCase(input: { customerName: string; amountBaht: number; dueAt: string; nextAction: string; ownerName: string }) {
  await ensureDatabase();
  const now = bangkokNow().iso;
  const id = "bill-" + crypto.randomUUID();
  const amountSatang = Math.round(input.amountBaht * 100);
  await database().prepare("INSERT INTO billing_cases (id, customer_name, service_period, amount_satang, due_at, document_state, submission_state, payment_state, next_action, owner_name, appointment_at, location, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'incomplete', 'unscheduled', 'unpaid', ?, ?, NULL, NULL, ?, ?)")
    .bind(id, input.customerName, "งวดใหม่", amountSatang, input.dueAt, input.nextAction, input.ownerName, now, now).run();
  await addAudit("billing_case", id, "created", input.ownerName, "สร้างงานวางบิล " + input.customerName);
}
