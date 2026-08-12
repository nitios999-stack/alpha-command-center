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
  nameResolved: boolean;
  pictureUrl: string | null;
  lastSeenAt: string | null;
  lastEventType: string | null;
  eventCount: number;
  source: "manual" | "webhook";
};

export type LineIntegrationStatus = {
  configured: boolean;
  gatewayConfigured: boolean;
  webhookPath: string;
  lastWebhookAt: string | null;
  webhookAgeMinutes: number | null;
  webhookStatus: "healthy" | "stale" | "never";
  receivedGroups: number;
  mappedGroups: number;
};

export type LineReminderSettings = {
  targetGroupId: string | null;
  autoEnabled: boolean;
  lastSentAt: string | null;
  lastSentCount: number;
  lastTargetName: string | null;
};

export type LineReportConfig = {
  enabled: boolean;
  morningTimes: string[];
  eveningTimes: string[];
};

const DEFAULT_LINE_REPORT_CONFIG: LineReportConfig = {
  enabled: true,
  morningTimes: ["06:00", "07:00", "08:00"],
  eveningTimes: ["17:00", "18:00", "19:00"],
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
};

export type LinePointSetupInput = {
  groupId: string;
  customerName?: string;
  postName?: string;
  slotLabel?: string;
  morningEnabled?: boolean;
  eveningEnabled?: boolean;
  morningGuard?: string;
  eveningGuard?: string;
  morningDeadline?: string;
  eveningDeadline?: string;
  active?: boolean;
  actor: string;
};

export type TemplateSummary = {
  total: number;
  morning: number;
  evening: number;
};

export type LinePointDetail = {
  customerName: string;
  active: boolean;
  morning?: { postName: string; slotLabel: string; assignedGuard: string; deadline: string };
  evening?: { postName: string; slotLabel: string; assignedGuard: string; deadline: string };
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

const LINE_REMINDER_SETTING_KEYS = [
  "line_reminder_target_group_id",
  "line_reminder_auto_enabled",
  "line_reminder_last_sent_at",
  "line_reminder_last_sent_count",
  "line_reminder_last_target_name",
] as const;

async function getLineReminderSettings(): Promise<LineReminderSettings> {
  const result = await database().prepare("SELECT key, value FROM system_settings WHERE key IN (?, ?, ?, ?, ?)")
    .bind(...LINE_REMINDER_SETTING_KEYS).all<D1Row>();
  const settings = new Map((result.results ?? []).map((row) => [String(row.key), String(row.value)]));
  return {
    targetGroupId: settings.get("line_reminder_target_group_id") || null,
    autoEnabled: settings.get("line_reminder_auto_enabled") === "1",
    lastSentAt: settings.get("line_reminder_last_sent_at") || null,
    lastSentCount: Number(settings.get("line_reminder_last_sent_count") ?? 0),
    lastTargetName: settings.get("line_reminder_last_target_name") || null,
  };
}

async function setLineReminderSetting(key: typeof LINE_REMINDER_SETTING_KEYS[number], value: string) {
  const now = bangkokNow().iso;
  await database().prepare("INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(key, value, now).run();
}

function safeLineReportConfig(value: string | null | undefined): LineReportConfig {
  if (!value) return { ...DEFAULT_LINE_REPORT_CONFIG };
  try {
    const raw = JSON.parse(value) as Partial<LineReportConfig>;
    const times = (input: unknown, fallback: string[]) => Array.isArray(input)
      ? [...new Set(input.filter((time): time is string => typeof time === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)).slice(0, 8))].sort()
      : fallback;
    return {
      enabled: raw.enabled !== false,
      morningTimes: times(raw.morningTimes, DEFAULT_LINE_REPORT_CONFIG.morningTimes),
      eveningTimes: times(raw.eveningTimes, DEFAULT_LINE_REPORT_CONFIG.eveningTimes),
    };
  } catch {
    return { ...DEFAULT_LINE_REPORT_CONFIG };
  }
}

async function getLineReportConfigs() {
  const result = await database().prepare("SELECT key, value FROM system_settings WHERE key LIKE 'line_report_config:%'").all<D1Row>();
  const configs: Record<string, LineReportConfig> = {};
  (result.results ?? []).forEach((row) => {
    const key = String(row.key);
    if (key.startsWith("line_report_config:")) configs[key.slice("line_report_config:".length)] = safeLineReportConfig(String(row.value ?? ""));
  });
  return configs;
}

function toCoverageSlot(row: D1Row, nowTime?: string): CoverageSlot {
  const rawState = String(row.state) as CoverageState;
  const lateMinutes = Math.max(
    numberValue(row, "late_minutes"),
    nowTime && rawState !== "confirmed" ? calculateLateMinutesAt(String(row.deadline), nowTime) : 0,
  );
  // A person assigned to a slot but still waiting after the hard deadline is
  // operationally missing. This is calculated at read time so the wall turns
  // red without a background job or a destructive status rewrite.
  const state: CoverageState = rawState === "waiting" && lateMinutes > 0 ? "missing" : rawState;
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
    state,
    verificationPolicy: String(row.verification_policy) as CoverageSlot["verificationPolicy"],
    deadline: String(row.deadline),
    reportedAt: value(row, "reported_at"),
    source: value(row, "source"),
    lateMinutes,
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
  const id = String(row.id);
  const groupName = String(row.group_name);
  const source = String(row.source ?? "manual") === "webhook" ? "webhook" : "manual";
  return {
    id,
    siteId: value(row, "site_id"),
    groupName,
    nameResolved: source === "webhook" && !isPlaceholderLineGroupName(groupName, id),
    pictureUrl: value(row, "picture_url"),
    lastSeenAt: value(row, "last_seen_at"),
    lastEventType: value(row, "last_event_type"),
    eventCount: numberValue(row, "event_count"),
    source,
  };
}

type LineEnvironment = {
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  LINE_CHANNEL_SECRET?: string;
  LINE_GATEWAY_URL?: string;
  LINE_GATEWAY_SYNC_TOKEN?: string;
  COMMAND_CENTER_ENABLE_DEMO_SEED?: string;
};

function lineEnvironment() {
  return env as typeof env & LineEnvironment;
}

function siteIdentifier(siteName: string) {
  return "site-" + siteName.trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/g, "-").replace(/(^-|-$)/g, "");
}

function linePointSiteIdentifier(groupId: string) {
  return "line-point-" + groupId.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 220);
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

function isPlaceholderLineGroupName(groupName: string, groupId: string) {
  const suffix = groupId.slice(-6);
  return groupName === `LINE group ${suffix}` || groupName === `กลุ่ม LINE ${suffix}`;
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

function minuteFromTime(time: string) {
  const bits = time.split(":");
  return Number(bits[0]) * 60 + Number(bits[1]);
}

function deadlineMinute(deadline: string) {
  const bits = deadline.split(":");
  return Number(bits[0]) * 60 + Number(bits[1]);
}

export function calculateLateMinutes(deadline: string) {
  return Math.max(0, minuteFromTime(bangkokNow().time) - deadlineMinute(deadline));
}

function calculateLateMinutesAt(deadline: string, time: string) {
  const late = Math.max(0, minuteFromTime(time) - deadlineMinute(deadline));
  return Number.isFinite(late) ? late : 0;
}

function demoSeedEnabled() {
  return lineEnvironment().COMMAND_CENTER_ENABLE_DEMO_SEED?.trim().toLowerCase() === "true";
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
    if (demoSeedEnabled() && (count?.count ?? 0) === 0) await seedDemoData();
    await db.prepare("INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('demo_seeded', ?, ?)")
      .bind(demoSeedEnabled() ? "1" : "disabled", bangkokNow().iso).run();
  }
  await syncSiteRegistryFromSlots();
  const templateCount = await db.prepare("SELECT COUNT(*) AS count FROM shift_templates").first<{ count: number }>();
  if ((templateCount?.count ?? 0) === 0) await syncTemplatesFromCoverageSlots();
  if (demoSeedEnabled()) await seedDemoLineGroups();
  await syncLineRegistryFromMappings();
  await provisionLinePointRecords();
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

// Verified LINE groups are the source of truth for points. Create a dormant
// operational record automatically so setup starts from the real group rather
// than asking the manager to create a duplicate point and map it later.
async function provisionLinePointRecords() {
  const db = database();
  const now = bangkokNow().iso;
  const result = await db.prepare("SELECT r.id, r.group_name, r.picture_url FROM line_group_registry r LEFT JOIN line_groups m ON m.id = r.id WHERE r.source = 'webhook' AND m.id IS NULL").all<D1Row>();
  const rows = result.results ?? [];
  for (let offset = 0; offset < rows.length; offset += 80) {
    const operations = rows.slice(offset, offset + 80).flatMap((row) => {
      const groupId = String(row.id ?? "").trim();
      const groupName = String(row.group_name ?? "").trim();
      if (!groupId || !groupName || isPlaceholderLineGroupName(groupName, groupId)) return [];
      const siteId = linePointSiteIdentifier(groupId);
      return [
        db.prepare("INSERT OR IGNORE INTO operational_sites (id, site_name, customer_name, active, created_at, updated_at) VALUES (?, ?, 'ยังไม่ระบุลูกค้า', 0, ?, ?)")
          .bind(siteId, groupName, now, now),
        db.prepare("INSERT OR IGNORE INTO line_groups (id, site_id, group_name, picture_url, updated_at) VALUES (?, ?, ?, ?, ?)")
          .bind(groupId, siteId, groupName, value(row, "picture_url"), now),
      ];
    });
    if (operations.length) await db.batch(operations);
  }
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
  const current = bangkokNow();
  const today = current.date;
  const slotResult = await db.prepare("SELECT * FROM coverage_slots WHERE operational_date = ? ORDER BY wave, site_name, post_name, slot_label").bind(today).all<D1Row>();
  const siteResult = await db.prepare("SELECT * FROM operational_sites ORDER BY active DESC, site_name").all<D1Row>();
  const lineGroupResult = await db.prepare("SELECT r.id, m.site_id, r.group_name, r.picture_url, r.last_seen_at, r.source, (SELECT e.event_type FROM line_webhook_events e WHERE e.group_id = r.id ORDER BY e.received_at DESC LIMIT 1) AS last_event_type, (SELECT COUNT(*) FROM line_webhook_events e WHERE e.group_id = r.id) AS event_count FROM line_group_registry r LEFT JOIN line_groups m ON m.id = r.id ORDER BY CASE WHEN m.site_id IS NULL THEN 0 ELSE 1 END, r.group_name").all<D1Row>();
  const templateResult = await db.prepare("SELECT wave, COUNT(*) AS count FROM shift_templates WHERE active = 1 GROUP BY wave").all<D1Row>();
  const demoCount = await db.prepare("SELECT COUNT(*) AS count FROM operational_sites WHERE id IN ('site-green', 'site-late', 'site-waiting', 'site-missing')").first<{ count: number }>();
  const billingResult = await db.prepare("SELECT * FROM billing_cases ORDER BY due_at ASC, updated_at DESC LIMIT 30").all<D1Row>();
  const lineCounts = await db.prepare("SELECT COUNT(*) AS received_groups, COUNT(CASE WHEN s.active = 1 THEN m.id END) AS mapped_groups, MAX(r.last_seen_at) AS last_webhook_at FROM line_group_registry r LEFT JOIN line_groups m ON m.id = r.id LEFT JOIN operational_sites s ON s.id = m.site_id").first<{ received_groups: number; mapped_groups: number; last_webhook_at: string | null }>();
  const linePointDetailResult = await db.prepare("SELECT m.id AS group_id, s.customer_name, s.active, t.wave, t.post_name, t.slot_label, t.assigned_guard, t.deadline FROM line_groups m INNER JOIN operational_sites s ON s.id = m.site_id LEFT JOIN shift_templates t ON t.site_id = s.id AND t.active = 1 ORDER BY m.id, t.wave, t.updated_at DESC").all<D1Row>();
  const lineReminder = await getLineReminderSettings();
  const lineReportConfigs = await getLineReportConfigs();
  const lastWebhookAt = lineCounts?.last_webhook_at ?? null;
  const parsedWebhookTime = lastWebhookAt ? Date.parse(lastWebhookAt) : Number.NaN;
  const webhookAgeMinutes = Number.isFinite(parsedWebhookTime)
    ? Math.max(0, Math.floor((Date.parse(current.iso) - parsedWebhookTime) / 60_000))
    : null;
  const templates: TemplateSummary = { total: 0, morning: 0, evening: 0 };
  (templateResult.results ?? []).forEach((row) => {
    const wave = String(row.wave);
    const count = numberValue(row, "count");
    if (wave === "morning" || wave === "evening") templates[wave] = count;
    templates.total += count;
  });
  const linePointDetails: Record<string, LinePointDetail> = {};
  (linePointDetailResult.results ?? []).forEach((row) => {
    const groupId = String(row.group_id ?? "");
    if (!groupId) return;
    const detail = linePointDetails[groupId] ?? {
      customerName: String(row.customer_name ?? ""),
      active: Number(row.active ?? 0) === 1,
    };
    const wave = String(row.wave ?? "");
    const shift = {
      postName: String(row.post_name ?? "จุดประจำ"),
      slotLabel: String(row.slot_label ?? "ช่อง 1"),
      assignedGuard: String(row.assigned_guard ?? ""),
      deadline: String(row.deadline ?? ""),
    };
    if (wave === "morning" && !detail.morning) detail.morning = shift;
    if (wave === "evening" && !detail.evening) detail.evening = shift;
    linePointDetails[groupId] = detail;
  });
  return {
    today,
    now: current,
    slots: (slotResult.results ?? []).map((row) => toCoverageSlot(row, current.time)),
    sites: (siteResult.results ?? []).map(toOperationalSite),
    lineGroups: (lineGroupResult.results ?? []).map(toLineGroup),
    lineIntegration: {
      configured: Boolean(lineEnvironment().LINE_CHANNEL_ACCESS_TOKEN && lineEnvironment().LINE_CHANNEL_SECRET),
      gatewayConfigured: Boolean(lineEnvironment().LINE_GATEWAY_URL && lineEnvironment().LINE_GATEWAY_SYNC_TOKEN),
      webhookPath: "/api/line/webhook",
      lastWebhookAt,
      webhookAgeMinutes,
      webhookStatus: webhookAgeMinutes === null ? "never" : webhookAgeMinutes <= 24 * 60 ? "healthy" : "stale",
      receivedGroups: Number(lineCounts?.received_groups ?? 0),
      mappedGroups: Number(lineCounts?.mapped_groups ?? 0),
    } satisfies LineIntegrationStatus,
    lineReminder,
    lineReportConfigs,
    linePointDetails,
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
  if (!/^\d{2}:\d{2}$/.test(input.deadline) || Number(input.deadline.slice(0, 2)) > 23 || Number(input.deadline.slice(3, 5)) > 59) {
    throw new Error("เวลาห้ามสายต้องเป็นรูปแบบ HH:MM");
  }
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

export async function updateOperationalSite(input: { siteId: string; siteName: string; customerName: string; actor: string }) {
  await ensureDatabase();
  const siteId = input.siteId.trim();
  const siteName = input.siteName.trim();
  const customerName = input.customerName.trim();
  if (!siteId || !siteName || !customerName) throw new Error("กรุณาระบุชื่อจุดและลูกค้า");
  const db = database();
  const existing = await db.prepare("SELECT site_name FROM operational_sites WHERE id = ? AND active = 1").bind(siteId).first<D1Row>();
  if (!existing) throw new Error("ไม่พบจุดที่ต้องการแก้ไข");
  const now = bangkokNow().iso;
  await db.batch([
    db.prepare("UPDATE operational_sites SET site_name = ?, customer_name = ?, updated_at = ? WHERE id = ?")
      .bind(siteName, customerName, now, siteId),
    db.prepare("UPDATE coverage_slots SET site_name = ?, customer_name = ?, updated_at = ? WHERE site_id = ?")
      .bind(siteName, customerName, now, siteId),
  ]);
  await addAudit("operational_site", siteId, "updated", input.actor, `แก้ไขจุด ${String(existing.site_name)} เป็น ${siteName}`);
}

export async function deleteOperationalSite(siteIdInput: string, actor: string) {
  await ensureDatabase();
  const siteId = siteIdInput.trim();
  if (!siteId) throw new Error("ไม่พบจุดที่ต้องการลบ");
  const db = database();
  const existing = await db.prepare("SELECT site_name FROM operational_sites WHERE id = ?").bind(siteId).first<D1Row>();
  if (!existing) throw new Error("ไม่พบจุดที่ต้องการลบ");
  const siteName = String(existing.site_name);
  await db.batch([
    db.prepare("DELETE FROM line_groups WHERE site_id = ?").bind(siteId),
    db.prepare("DELETE FROM coverage_slots WHERE site_id = ?").bind(siteId),
    db.prepare("DELETE FROM shift_templates WHERE site_id = ?").bind(siteId),
    db.prepare("DELETE FROM operational_sites WHERE id = ?").bind(siteId),
  ]);
  await addAudit("operational_site", siteId, "deleted", actor, "ลบจุดและอัตรากำลังของ " + siteName);
}

export async function mapLineGroup(input: { siteId: string; groupId: string; actor: string }) {
  await ensureDatabase();
  const siteId = input.siteId.trim();
  const groupId = input.groupId.trim();
  if (!siteId || !groupId || groupId.length > 255) throw new Error("กรุณาเลือกกลุ่ม LINE จากทะเบียนที่ระบบรับจาก LINE แล้ว");
  const db = database();
  const site = await db.prepare("SELECT site_name FROM operational_sites WHERE id = ? AND active = 1").bind(siteId).first<D1Row>();
  if (!site) throw new Error("ไม่พบจุดที่ต้องการผูกกลุ่ม LINE");
  const registry = await db.prepare("SELECT group_name, picture_url, source FROM line_group_registry WHERE id = ?").bind(groupId).first<D1Row>();
  const groupName = String(registry?.group_name ?? "").trim();
  const source = String(registry?.source ?? "");
  if (!registry || !groupName || source !== "webhook" || isPlaceholderLineGroupName(groupName, groupId)) {
    throw new Error("กลุ่มนี้ยังไม่มีชื่อจริงจาก LINE กรุณารอ webhook หรือกดรีเฟรชทะเบียนกลุ่มก่อน");
  }
  const existingMapping = await db.prepare("SELECT site_id, group_name FROM line_groups WHERE id = ?").bind(groupId).first<D1Row>();
  if (existingMapping && String(existingMapping.site_id) !== siteId) {
    throw new Error(`กลุ่ม LINE ${String(existingMapping.group_name ?? groupId)} ถูกผูกกับจุดอื่นแล้ว กรุณายกเลิกการผูกเดิมก่อน`);
  }
  const now = bangkokNow().iso;
  const safePictureUrl = pictureUrl(value(registry, "picture_url") ?? undefined);
  await db.batch([
    db.prepare("DELETE FROM line_groups WHERE site_id = ? AND id != ?").bind(siteId, groupId),
    db.prepare("INSERT INTO line_groups (id, site_id, group_name, picture_url, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET site_id = excluded.site_id, group_name = excluded.group_name, picture_url = excluded.picture_url, updated_at = excluded.updated_at")
      .bind(groupId, siteId, groupName, safePictureUrl, now),
    db.prepare("UPDATE line_group_registry SET updated_at = ? WHERE id = ?").bind(now, groupId),
  ]);
  await addAudit("line_group", groupId, "mapped", input.actor, `ผูกกลุ่ม LINE ${groupName} กับ ${String(site.site_name)}`);
}

export async function setupLinePoint(input: LinePointSetupInput) {
  await ensureDatabase();
  const groupId = input.groupId.trim();
  if (!groupId) throw new Error("กรุณาเลือกกลุ่ม LINE ที่ต้องการตั้งเป็นจุด");
  const db = database();
  const registry = await db.prepare("SELECT group_name, picture_url, source FROM line_group_registry WHERE id = ?").bind(groupId).first<D1Row>();
  const groupName = String(registry?.group_name ?? "").trim();
  if (!registry || !groupName || String(registry.source ?? "") !== "webhook" || isPlaceholderLineGroupName(groupName, groupId)) {
    throw new Error("กลุ่มนี้ยังไม่มีชื่อจริงจาก LINE จึงยังตั้งเป็นจุดไม่ได้");
  }
  const currentMapping = await db.prepare("SELECT site_id FROM line_groups WHERE id = ?").bind(groupId).first<D1Row>();
  const siteId = String(currentMapping?.site_id ?? linePointSiteIdentifier(groupId));
  const currentSite = await db.prepare("SELECT customer_name FROM operational_sites WHERE id = ?").bind(siteId).first<D1Row>();
  const customerName = (input.customerName?.trim() || String(currentSite?.customer_name ?? "").trim() || "ยังไม่ระบุลูกค้า").slice(0, 255);
  const postName = (input.postName?.trim() || "จุดประจำ").slice(0, 255);
  const slotLabel = (input.slotLabel?.trim() || "ช่อง 1").slice(0, 255);
  const validateDeadline = (value: string | undefined, fallback: string) => {
    const candidate = value?.trim() || fallback;
    if (!/^\d{2}:\d{2}$/.test(candidate) || Number(candidate.slice(0, 2)) > 23 || Number(candidate.slice(3, 5)) > 59) {
      throw new Error("เวลาต้องเป็นรูปแบบ HH:MM");
    }
    return candidate;
  };
  const morningDeadline = validateDeadline(input.morningDeadline, "06:00");
  const eveningDeadline = validateDeadline(input.eveningDeadline, "18:00");
  const active = input.active !== false;
  const now = bangkokNow().iso;
  const existingConfig = await db.prepare("SELECT value FROM system_settings WHERE key = ?").bind(`line_report_config:${groupId}`).first<D1Row>();
  const reportConfig = safeLineReportConfig(existingConfig ? value(existingConfig, "value") : null);
  const operations = [
    db.prepare("INSERT INTO operational_sites (id, site_name, customer_name, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET site_name = excluded.site_name, customer_name = excluded.customer_name, active = excluded.active, updated_at = excluded.updated_at")
      .bind(siteId, groupName, customerName, active ? 1 : 0, now, now),
    db.prepare("INSERT INTO line_groups (id, site_id, group_name, picture_url, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET site_id = excluded.site_id, group_name = excluded.group_name, picture_url = excluded.picture_url, updated_at = excluded.updated_at")
      .bind(groupId, siteId, groupName, value(registry, "picture_url"), now),
    db.prepare("INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .bind(`line_report_config:${groupId}`, JSON.stringify({ ...reportConfig, enabled: active }), now),
  ];
  const addTemplate = (wave: "morning" | "evening", enabled: boolean, guard: string | undefined, deadline: string) => {
    if (!enabled) return;
    const templateId = templateIdentifier(siteId, wave, postName, slotLabel);
    operations.push(db.prepare("INSERT INTO shift_templates (id, site_id, wave, post_name, slot_label, assigned_guard, deadline, verification_policy, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'standard', 1, ?) ON CONFLICT(id) DO UPDATE SET assigned_guard = excluded.assigned_guard, deadline = excluded.deadline, active = 1, updated_at = excluded.updated_at")
      .bind(templateId, siteId, wave, postName, slotLabel, guard?.trim() || null, deadline, now));
  };
  addTemplate("morning", input.morningEnabled !== false, input.morningGuard, morningDeadline);
  addTemplate("evening", input.eveningEnabled !== false, input.eveningGuard, eveningDeadline);
  await db.batch(operations);
  await addAudit("line_point", groupId, active ? "enabled" : "disabled", input.actor, `${active ? "ตั้ง" : "ปิด"} กลุ่ม LINE ${groupName} เป็นจุดใช้งาน · ลูกค้า ${customerName}`);
  return { siteId, active, groupName };
}

// Fast onboarding path for the manager: every verified webhook group becomes
// an active operational point. Existing point details and shift templates are
// preserved; only records that are missing are filled with safe defaults.
export async function activateAllLinePoints(actor: string) {
  await ensureDatabase();
  const db = database();
  const now = bangkokNow().iso;
  const registryResult = await db.prepare("SELECT r.id, r.group_name, r.picture_url, m.site_id, s.customer_name, s.active AS site_active FROM line_group_registry r LEFT JOIN line_groups m ON m.id = r.id LEFT JOIN operational_sites s ON s.id = m.site_id WHERE r.source = 'webhook' ORDER BY r.group_name").all<D1Row>();
  const groups = registryResult.results ?? [];
  let activated = 0;
  let alreadyActive = 0;
  let initialized = 0;
  let skipped = 0;
  const operations: ReturnType<typeof db.prepare>[] = [];
  const defaultCustomer = "ยังไม่ระบุลูกค้า";
  for (const row of groups) {
    const groupId = String(row.id ?? "").trim();
    const groupName = String(row.group_name ?? "").trim();
    if (!groupId || !groupName || isPlaceholderLineGroupName(groupName, groupId)) {
      skipped += 1;
      continue;
    }
    const siteId = String(row.site_id ?? linePointSiteIdentifier(groupId));
    const existingCustomer = String(row.customer_name ?? "").trim();
    const customerName = existingCustomer && existingCustomer !== defaultCustomer ? existingCustomer : defaultCustomer;
    const wasActive = Number(row.site_active ?? 0) === 1;
    if (wasActive) alreadyActive += 1;
    else activated += 1;
    operations.push(
      db.prepare("INSERT INTO operational_sites (id, site_name, customer_name, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT(id) DO UPDATE SET site_name = excluded.site_name, customer_name = CASE WHEN operational_sites.customer_name IS NULL OR operational_sites.customer_name = '' OR operational_sites.customer_name = ? THEN excluded.customer_name ELSE operational_sites.customer_name END, active = 1, updated_at = excluded.updated_at")
        .bind(siteId, groupName, customerName, now, now, defaultCustomer),
      db.prepare("INSERT INTO line_groups (id, site_id, group_name, picture_url, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET site_id = excluded.site_id, group_name = excluded.group_name, picture_url = COALESCE(excluded.picture_url, line_groups.picture_url), updated_at = excluded.updated_at")
        .bind(groupId, siteId, groupName, value(row, "picture_url"), now),
    );
    const existingTemplates = await db.prepare("SELECT wave FROM shift_templates WHERE site_id = ? AND active = 1").bind(siteId).all<D1Row>();
    const waves = new Set((existingTemplates.results ?? []).map((template) => String(template.wave)));
    if (!waves.has("morning")) {
      initialized += 1;
      operations.push(db.prepare("INSERT INTO shift_templates (id, site_id, wave, post_name, slot_label, assigned_guard, deadline, verification_policy, active, updated_at) VALUES (?, ?, 'morning', 'จุดประจำ', 'ช่อง 1', NULL, '06:00', 'standard', 1, ?) ON CONFLICT(id) DO UPDATE SET active = 1, deadline = '06:00', updated_at = excluded.updated_at")
        .bind(templateIdentifier(siteId, "morning", "จุดประจำ", "ช่อง 1"), now));
    }
    if (!waves.has("evening")) {
      initialized += 1;
      operations.push(db.prepare("INSERT INTO shift_templates (id, site_id, wave, post_name, slot_label, assigned_guard, deadline, verification_policy, active, updated_at) VALUES (?, ?, 'evening', 'จุดประจำ', 'ช่อง 1', NULL, '18:00', 'standard', 1, ?) ON CONFLICT(id) DO UPDATE SET active = 1, deadline = '18:00', updated_at = excluded.updated_at")
        .bind(templateIdentifier(siteId, "evening", "จุดประจำ", "ช่อง 1"), now));
    }
    const existingConfig = await db.prepare("SELECT value FROM system_settings WHERE key = ?").bind(`line_report_config:${groupId}`).first<D1Row>();
    const reportConfig = safeLineReportConfig(existingConfig ? value(existingConfig, "value") : null);
    operations.push(db.prepare("INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .bind(`line_report_config:${groupId}`, JSON.stringify({ ...reportConfig, enabled: true }), now));
  }
  for (let offset = 0; offset < operations.length; offset += 80) {
    await db.batch(operations.slice(offset, offset + 80));
  }
  const generated = await generateTodayFromTemplates(actor);
  await addAudit("line_point", "bulk", "enabled", actor, `เปิดใช้งานกลุ่ม LINE จาก webhook ${activated + alreadyActive} จุด · เติมกะ ${initialized} รายการ · ข้าม ${skipped} กลุ่ม`);
  return { activated, alreadyActive, initialized, skipped, generated: generated.created, total: activated + alreadyActive };
}

export async function unmapLineGroup(groupId: string, actor: string) {
  await ensureDatabase();
  const id = groupId.trim();
  if (!id) throw new Error("ไม่พบกลุ่ม LINE ที่ต้องการยกเลิกการผูก");
  const db = database();
  const mapping = await db.prepare("SELECT group_name, site_id FROM line_groups WHERE id = ?").bind(id).first<D1Row>();
  if (!mapping) return;
  if (String(mapping.site_id ?? "").startsWith("line-point-")) {
    const now = bangkokNow().iso;
    await db.batch([
      db.prepare("UPDATE operational_sites SET active = 0, updated_at = ? WHERE id = ?").bind(now, String(mapping.site_id)),
      db.prepare("INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
        .bind(`line_report_config:${id}`, JSON.stringify({ ...DEFAULT_LINE_REPORT_CONFIG, enabled: false }), now),
    ]);
    await addAudit("line_point", id, "disabled", actor, `ปิดการตรวจกลุ่ม LINE ${String(mapping.group_name)}`);
    return;
  }
  await db.prepare("DELETE FROM line_groups WHERE id = ?").bind(id).run();
  await addAudit("line_group", id, "unmapped", actor, `ยกเลิกการผูกกลุ่ม LINE ${String(mapping.group_name)} จากจุด ${String(mapping.site_id)}`);
}

export async function deleteLineGroup(groupIdInput: string, actor: string) {
  await ensureDatabase();
  const groupId = groupIdInput.trim();
  if (!groupId) throw new Error("ไม่พบกลุ่ม LINE ที่ต้องการลบ");
  const db = database();
  const group = await db.prepare("SELECT r.group_name, m.site_id FROM line_group_registry r LEFT JOIN line_groups m ON m.id = r.id WHERE r.id = ?")
    .bind(groupId).first<D1Row>();
  if (!group) return;
  if (value(group, "site_id")) throw new Error("กลุ่มนี้ยังผูกกับจุดอยู่ กรุณายกเลิกการผูกก่อนลบ");
  const groupName = String(group.group_name ?? groupId);
  await db.prepare("DELETE FROM line_group_registry WHERE id = ?").bind(groupId).run();
  await addAudit("line_group", groupId, "deleted", actor, "ลบกลุ่ม LINE ที่ไม่ใช้งาน " + groupName);
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
  if (!groupId || groupId.length > 255) return { saved: false, duplicate: false };
  const eventId = input.eventId.trim();
  if (!eventId || eventId.length > 255) return { saved: false, duplicate: false };
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

export async function updateLineGroupProfile(input: { groupId: string; groupName?: string; pictureUrl?: string }) {
  await ensureDatabase();
  const groupId = input.groupId.trim();
  if (!groupId) return;
  const groupName = input.groupName?.trim();
  const avatar = pictureUrl(input.pictureUrl);
  if (!groupName && !avatar) return;
  const now = bangkokNow().iso;
  await database().prepare("UPDATE line_group_registry SET group_name = COALESCE(?, group_name), picture_url = COALESCE(?, picture_url), source = 'webhook', updated_at = ? WHERE id = ?")
    .bind(groupName || null, avatar, now, groupId).run();
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

export async function saveLineReminderSettings(input: { targetGroupId: string; autoEnabled: boolean; actor: string }) {
  await ensureDatabase();
  const targetGroupId = input.targetGroupId.trim();
  if (targetGroupId) {
    const group = await database().prepare("SELECT group_name FROM line_group_registry WHERE id = ?").bind(targetGroupId).first<D1Row>();
    if (!group) throw new Error("ยังไม่พบกลุ่มหลักในทะเบียน LINE กรุณาให้กลุ่มส่ง webhook ก่อน");
  }
  await setLineReminderSetting("line_reminder_target_group_id", targetGroupId);
  await setLineReminderSetting("line_reminder_auto_enabled", input.autoEnabled ? "1" : "0");
  await addAudit("line_reminder", targetGroupId || "none", "settings_saved", input.actor, targetGroupId ? "ตั้งกลุ่มหลักสำหรับแจ้งเตือนรายงาน" : "ล้างกลุ่มหลักสำหรับแจ้งเตือนรายงาน");
}

export async function saveLineReportConfig(input: { groupId: string; config: LineReportConfig; actor: string }) {
  await ensureDatabase();
  const groupId = input.groupId.trim();
  if (!groupId) throw new Error("กรุณาเลือกกลุ่ม LINE ที่ต้องการตั้งค่ากะ");
  const group = await database().prepare("SELECT r.group_name, m.site_id, s.active FROM line_group_registry r LEFT JOIN line_groups m ON m.id = r.id LEFT JOIN operational_sites s ON s.id = m.site_id WHERE r.id = ?").bind(groupId).first<D1Row>();
  if (!group || !group.site_id || Number(group.active ?? 0) !== 1) throw new Error("กลุ่มนี้ยังไม่ได้ผูกกับจุดปฏิบัติการที่ใช้งานอยู่");
  const config = safeLineReportConfig(JSON.stringify(input.config));
  const now = bangkokNow().iso;
  await database().prepare("INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(`line_report_config:${groupId}`, JSON.stringify(config), now).run();
  await addAudit("line_report_config", groupId, "settings_saved", input.actor, `${config.enabled ? "เปิด" : "ปิด"} การติดตามรายงานของ ${String(group.group_name)} · เช้า ${config.morningTimes.join(", ")} · เย็น ${config.eveningTimes.join(", ")}`);
}

type ReminderGroupRow = D1Row & {
  id: string;
  group_name: string;
  last_seen_at: string | null;
  site_name: string | null;
  customer_name: string | null;
};

function reminderTimeAgeMinutes(value: string | null, nowMs: number) {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, Math.floor((nowMs - timestamp) / 60_000)) : Number.POSITIVE_INFINITY;
}

function reminderAgeLabel(minutes: number) {
  if (!Number.isFinite(minutes)) return "ยังไม่เคยส่ง";
  if (minutes < 60) return `${minutes} นาที`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} ชม. ${remainder} นาที` : `${hours} ชม.`;
}

export async function sendLineReportReminder(input: { targetGroupId: string; wave: "morning" | "evening"; actor: string; force?: boolean; includeClear?: boolean }) {
  await ensureDatabase();
  const targetGroupId = input.targetGroupId.trim();
  const token = lineEnvironment().LINE_CHANNEL_ACCESS_TOKEN;
  if (!targetGroupId) throw new Error("กรุณาเลือกกลุ่ม LINE หลักก่อนส่งเตือน");
  if (!token) throw new Error("ยังไม่ได้ตั้งค่า Channel access token ในระบบที่ปลอดภัย");
  const db = database();
  const target = await db.prepare("SELECT group_name FROM line_group_registry WHERE id = ?").bind(targetGroupId).first<D1Row>();
  if (!target) throw new Error("กลุ่มหลักนี้ไม่อยู่ในทะเบียน LINE แล้ว กรุณาซิงค์ทะเบียนใหม่");

  const current = bangkokNow();
  const reminderSettings = await getLineReminderSettings();
  const previousSentAt = reminderSettings.lastSentAt ? Date.parse(reminderSettings.lastSentAt) : Number.NaN;
  if (!input.force && Number.isFinite(previousSentAt) && Date.parse(current.iso) - previousSentAt < 10 * 60_000) {
    return { skipped: true, message: "ระบบเพิ่งส่งแจ้งเตือนไปแล้วภายใน 10 นาที จึงข้ามรอบซ้ำ", silentCount: reminderSettings.lastSentCount };
  }

  const lineReportConfigs = await getLineReportConfigs();
  const groups = await db.prepare("SELECT r.id, r.group_name, r.last_seen_at, s.site_name, s.customer_name FROM line_group_registry r INNER JOIN line_groups m ON m.id = r.id INNER JOIN operational_sites s ON s.id = m.site_id AND s.active = 1 WHERE r.id <> ? ORDER BY r.last_seen_at IS NOT NULL, r.last_seen_at ASC, r.group_name ASC")
    .bind(targetGroupId).all<ReminderGroupRow>();
  const trackedGroups = (groups.results ?? []).filter((group) => (lineReportConfigs[group.id]?.enabled ?? true));
  const silentGroups = trackedGroups.filter((group) => reminderTimeAgeMinutes(group.last_seen_at, Date.parse(current.iso)) >= 30);
  if (!silentGroups.length) {
    if (!input.includeClear) return { skipped: true, message: "ตรวจแล้ว ยังไม่พบกลุ่มที่เงียบเกิน 30 นาที จึงยังไม่ส่งข้อความ", silentCount: 0, trackedCount: trackedGroups.length };
    const clearMessage = [
      `✅ สรุปรายงาน · ${input.wave === "evening" ? "ผลัดเย็น" : "ผลัดเช้า"} · ${current.time}`,
      `ครบ ${trackedGroups.length}/${trackedGroups.length} จุด`,
      "ยังไม่พบจุดที่ค้างรายงานเกิน 30 นาที",
      "จาก ALPHA Command Center",
    ].join("\n");
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: targetGroupId, messages: [{ type: "text", text: clearMessage }] }),
    });
    if (!response.ok) throw new Error("LINE OA ไม่รับการส่งสรุป โปรดตรวจว่าบอตอยู่ในกลุ่มหลักและมีสิทธิ์ส่งข้อความ");
    await Promise.all([
      setLineReminderSetting("line_reminder_last_sent_at", current.iso),
      setLineReminderSetting("line_reminder_last_sent_count", "0"),
      setLineReminderSetting("line_reminder_last_target_name", String(target.group_name)),
    ]);
    await addAudit("line_reminder", targetGroupId, "report_reminder_sent", input.actor, `ส่งสรุปครบ ${trackedGroups.length} จุดไปยัง ${String(target.group_name)}`);
    return { skipped: false, sentAt: current.iso, silentCount: 0, trackedCount: trackedGroups.length, targetGroupName: String(target.group_name), message: "ส่งสรุปว่ารายงานครบแล้ว" };
  }

  const waveLabel = input.wave === "evening" ? "ผลัดเย็น" : "ผลัดเช้า";
  const previewGroups = silentGroups.slice(0, 24).map((group, index) => {
    const site = group.site_name ? ` · ${group.site_name}` : "";
    const age = reminderAgeLabel(reminderTimeAgeMinutes(group.last_seen_at, Date.parse(current.iso)));
    return `${index + 1}) ${String(group.group_name).slice(0, 70)}${site} · ${age}`;
  });
  const overflow = silentGroups.length > previewGroups.length ? `\n…และอีก ${silentGroups.length - previewGroups.length} กลุ่ม` : "";
  const message = [
    `🚨 รายงานค้าง · ${waveLabel} · ${current.time}`,
    `ยังไม่ส่ง ${silentGroups.length}/${trackedGroups.length} จุด`,
    "",
    ...previewGroups,
    overflow,
    "",
    "กรุณาติดตามจุดที่ค้างรายงาน",
    "จาก ALPHA Command Center",
  ].filter(Boolean).join("\n").slice(0, 4_900);
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to: targetGroupId, messages: [{ type: "text", text: message }] }),
  });
  if (!response.ok) throw new Error("LINE OA ไม่รับการส่งแจ้งเตือน โปรดตรวจว่าบอตอยู่ในกลุ่มหลักและมีสิทธิ์ส่งข้อความ");
  await Promise.all([
    setLineReminderSetting("line_reminder_last_sent_at", current.iso),
    setLineReminderSetting("line_reminder_last_sent_count", String(silentGroups.length)),
    setLineReminderSetting("line_reminder_last_target_name", String(target.group_name)),
  ]);
  await addAudit("line_reminder", targetGroupId, "report_reminder_sent", input.actor, `ส่งแจ้งเตือน ${silentGroups.length} กลุ่มเงียบไปยัง ${String(target.group_name)}`);
  return { skipped: false, sentAt: current.iso, silentCount: silentGroups.length, trackedCount: trackedGroups.length, targetGroupName: String(target.group_name), message: "ส่งสรุปจุดที่ค้างรายงานแล้ว" };
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
  const registryResult = await db.prepare("SELECT id, group_name, picture_url, source FROM line_group_registry").all<D1Row>();
  const registryById = new Map((registryResult.results ?? []).map((row) => [String(row.id), row]));

  rows.forEach((raw, index) => {
    const siteName = raw.siteName?.trim() ?? "";
    const customerName = raw.customerName?.trim() ?? "";
    const postName = raw.postName?.trim() ?? "";
    const slotLabel = raw.slotLabel?.trim() ?? "";
    const deadline = raw.deadline?.trim() ?? "";
    const wave = raw.wave === "evening" ? "evening" : "morning";
    const verificationPolicy = raw.verificationPolicy === "manual" || raw.verificationPolicy === "reviewed" ? raw.verificationPolicy : "standard";
    const lineGroupId = raw.lineGroupId?.trim() ?? "";
    if (!siteName || !customerName || !postName || !slotLabel || !/^\d{2}:\d{2}$/.test(deadline)) {
      throw new Error(`แถวที่ ${index + 2} มีข้อมูลไม่ครบหรือเวลาไม่ถูกต้อง`);
    }
    const siteId = siteIdentifier(siteName);
    if (lineGroupId) {
      const registry = registryById.get(lineGroupId);
      const lineGroupName = String(registry?.group_name ?? "").trim();
      const source = String(registry?.source ?? "");
      if (!registry || !lineGroupName || source !== "webhook" || isPlaceholderLineGroupName(lineGroupName, lineGroupId)) {
        throw new Error(`แถวที่ ${index + 2} ยังไม่พบชื่อจริงของกลุ่ม LINE ในทะเบียน webhook`);
      }
      const alreadyMapped = lineGroupBySite.get(siteId);
      if (alreadyMapped && alreadyMapped.id !== lineGroupId) throw new Error(`จุด ${siteName} ผูกกับ LINE มากกว่า 1 กลุ่มในไฟล์เดียวกัน`);
      const linkedSite = siteByLineGroup.get(lineGroupId);
      if (linkedSite && linkedSite !== siteId) throw new Error(`กลุ่ม LINE ${lineGroupName} ถูกผูกซ้ำมากกว่า 1 จุด`);
      lineGroupBySite.set(siteId, { id: lineGroupId, name: lineGroupName, pictureUrl: value(registry, "picture_url") ?? "" });
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
    db.prepare("UPDATE line_group_registry SET updated_at = ? WHERE id = ?").bind(now, group.id),
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
  if (!Number.isFinite(input.amountBaht) || input.amountBaht <= 0 || input.amountBaht > 1_000_000_000) {
    throw new Error("ยอดวางบิลไม่ถูกต้อง");
  }
  if (!input.dueAt || Number.isNaN(Date.parse(input.dueAt))) throw new Error("วันที่ครบกำหนดไม่ถูกต้อง");
  const now = bangkokNow().iso;
  const id = "bill-" + crypto.randomUUID();
  const amountSatang = Math.round(input.amountBaht * 100);
  await database().prepare("INSERT INTO billing_cases (id, customer_name, service_period, amount_satang, due_at, document_state, submission_state, payment_state, next_action, owner_name, appointment_at, location, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'incomplete', 'unscheduled', 'unpaid', ?, ?, NULL, NULL, ?, ?)")
    .bind(id, input.customerName, "งวดใหม่", amountSatang, input.dueAt, input.nextAction, input.ownerName, now, now).run();
  await addAudit("billing_case", id, "created", input.ownerName, "สร้างงานวางบิล " + input.customerName);
}
