import { getFirebaseD1Database } from "../lib/firebase-d1";
import { createHash } from "node:crypto";

const env = Object.assign({ DB: true }, (typeof process !== "undefined" ? process.env : {})) as Record<string, any>;

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
  lastMessageType: string | null;
  lastReportAt: string | null;
  lastReportSenderKey: string | null;
  lastCandidateAt: string | null;
  lastCandidateSenderKey: string | null;
  eventCount: number;
  source: "manual" | "webhook";
};

export type LineIntegrationStatus = {
  configured: boolean;
  gatewayConfigured: boolean;
  webhookPath: string;
  lastWebhookAt: string | null;
  lastCallbackSummary: string | null;
  webhookAgeMinutes: number | null;
  webhookStatus: "healthy" | "stale" | "never";
  receivedGroups: number;
  mappedGroups: number;
};

export type LineReminderSettings = {
  targetGroupId: string | null;
  escalationTargetGroupId: string | null;
  autoEnabled: boolean;
  autoEscalationEnabled: boolean;
  lastSentAt: string | null;
  lastSentCount: number;
  lastTargetName: string | null;
};

export type LineReportConfig = {
  enabled: boolean;
  // Kept for legacy clients during the rolling upgrade. New work uses
  // expectedTimes, intervalHours, and mode below.
  morningTimes: string[];
  eveningTimes: string[];
  mode: "schedule" | "interval" | "observe";
  expectedTimes: string[];
  intervalHours: number;
  intervalAnchor: string;
  graceMinutes: number;
  escalationAfterHours: number;
  verification: "text" | "approved_sender";
  approvedSenderKeys: string[];
  monitoringStartedAt: string | null;
};

const DEFAULT_LINE_REPORT_CONFIG: LineReportConfig = {
  enabled: true,
  morningTimes: ["06:00", "07:00", "08:00"],
  eveningTimes: ["17:00", "18:00", "19:00"],
  mode: "schedule",
  expectedTimes: ["06:00", "07:00", "08:00", "17:00", "18:00", "19:00"],
  intervalHours: 2,
  intervalAnchor: "00:00",
  graceMinutes: 0,
  escalationAfterHours: 6,
  verification: "text",
  approvedSenderKeys: [],
  monitoringStartedAt: null,
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

export function database() {
  if (!env.DB) throw new Error("ฐานข้อมูลยังไม่พร้อมใช้งาน");
  return getFirebaseD1Database();
}

function value(row: D1Row, key: string) {
  return row[key] === null || row[key] === undefined ? null : String(row[key]);
}

function numberValue(row: D1Row, key: string) {
  return Number(row[key] ?? 0);
}

const LINE_REMINDER_SETTING_KEYS = [
  "line_reminder_target_group_id",
  "line_reminder_escalation_target_group_id",
  "line_reminder_auto_enabled",
  "line_reminder_auto_escalation_enabled",
  "line_reminder_last_sent_at",
  "line_reminder_last_sent_count",
  "line_reminder_last_target_name",
  "line_reminder_last_round_key",
] as const;

async function getLineReminderSettings(): Promise<LineReminderSettings> {
  const result = await database().prepare("SELECT key, value FROM system_settings WHERE key IN (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(...LINE_REMINDER_SETTING_KEYS).all<D1Row>();
  const settings = new Map((result.results ?? []).map((row) => [String(row.key), String(row.value)]));
  return {
    targetGroupId: settings.get("line_reminder_target_group_id") || null,
    escalationTargetGroupId: settings.get("line_reminder_escalation_target_group_id") || null,
    autoEnabled: settings.get("line_reminder_auto_enabled") === "1",
    autoEscalationEnabled: settings.get("line_reminder_auto_escalation_enabled") === "1",
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
      ? [...new Set(input.filter((time): time is string => typeof time === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)).slice(0, 12))].sort()
      : fallback;
    const legacyTimes = [
      ...times((raw as { morningTimes?: unknown }).morningTimes, []),
      ...times((raw as { eveningTimes?: unknown }).eveningTimes, []),
    ];
    const mode = raw.mode === "interval" || raw.mode === "observe" ? raw.mode : "schedule";
    const intervalHours = Number(raw.intervalHours);
    const graceMinutes = Number(raw.graceMinutes);
    const escalationAfterHours = Number(raw.escalationAfterHours);
    const approvedSenderKeys = Array.isArray(raw.approvedSenderKeys)
      ? [...new Set(raw.approvedSenderKeys.filter((key): key is string => typeof key === "string" && /^U-[A-Z0-9]{8,24}$/.test(key)).slice(0, 12))]
      : [];
    const expectedTimes = times(raw.expectedTimes, legacyTimes.length ? [...new Set(legacyTimes)].sort() : DEFAULT_LINE_REPORT_CONFIG.expectedTimes);
    return {
      enabled: raw.enabled !== false,
      morningTimes: times((raw as { morningTimes?: unknown }).morningTimes, expectedTimes.filter((time) => time < "12:00")),
      eveningTimes: times((raw as { eveningTimes?: unknown }).eveningTimes, expectedTimes.filter((time) => time >= "12:00")),
      mode,
      expectedTimes,
      intervalHours: Number.isInteger(intervalHours) && intervalHours >= 1 && intervalHours <= 24 ? intervalHours : DEFAULT_LINE_REPORT_CONFIG.intervalHours,
      intervalAnchor: /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(raw.intervalAnchor ?? "")) ? String(raw.intervalAnchor) : DEFAULT_LINE_REPORT_CONFIG.intervalAnchor,
      graceMinutes: Number.isInteger(graceMinutes) && graceMinutes >= 0 && graceMinutes <= 60 ? graceMinutes : DEFAULT_LINE_REPORT_CONFIG.graceMinutes,
      escalationAfterHours: Number.isInteger(escalationAfterHours) && escalationAfterHours >= 1 && escalationAfterHours <= 72 ? escalationAfterHours : DEFAULT_LINE_REPORT_CONFIG.escalationAfterHours,
      verification: raw.verification === "approved_sender" ? "approved_sender" : "text",
      approvedSenderKeys,
      monitoringStartedAt: typeof raw.monitoringStartedAt === "string" && Number.isFinite(Date.parse(raw.monitoringStartedAt)) ? raw.monitoringStartedAt : null,
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
    lastMessageType: value(row, "last_message_type"),
    lastReportAt: value(row, "last_report_at"),
    lastReportSenderKey: value(row, "last_report_sender_key"),
    lastCandidateAt: value(row, "last_candidate_at"),
    lastCandidateSenderKey: value(row, "last_candidate_sender_key"),
    eventCount: numberValue(row, "event_count"),
    source,
  };
}

function lineEnvironment() {
  const processEnv = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
  const channelAccessToken = (env as Record<string, string>).LINE_CHANNEL_ACCESS_TOKEN || processEnv.LINE_CHANNEL_ACCESS_TOKEN;
  const channelSecret = (env as Record<string, string>).LINE_CHANNEL_SECRET || processEnv.LINE_CHANNEL_SECRET;
  return {
    ...env,
    LINE_CHANNEL_ACCESS_TOKEN: channelAccessToken,
    LINE_CHANNEL_SECRET: channelSecret,
    LINE_GATEWAY_URL: (env as Record<string, string>).LINE_GATEWAY_URL || processEnv.LINE_GATEWAY_URL,
    LINE_GATEWAY_SYNC_TOKEN: (env as Record<string, string>).LINE_GATEWAY_SYNC_TOKEN || processEnv.LINE_GATEWAY_SYNC_TOKEN,
    COMMAND_CENTER_ENABLE_DEMO_SEED: (env as Record<string, string>).COMMAND_CENTER_ENABLE_DEMO_SEED || processEnv.COMMAND_CENTER_ENABLE_DEMO_SEED,
  };
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

let ensureDatabasePromise: Promise<void> | null = null;

export function ensureDatabase() {
  if (!ensureDatabasePromise) {
    ensureDatabasePromise = initializeDatabase().catch((error) => {
      // A transient startup failure must not permanently poison this process.
      ensureDatabasePromise = null;
      throw error;
    });
  }
  return ensureDatabasePromise;
}

async function initializeDatabase() {
  const db = database();
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS line_groups (id TEXT PRIMARY KEY, site_id TEXT NOT NULL, group_name TEXT NOT NULL, picture_url TEXT, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS line_group_registry (id TEXT PRIMARY KEY, group_name TEXT NOT NULL, picture_url TEXT, last_seen_at TEXT, source TEXT NOT NULL DEFAULT 'manual', updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS line_webhook_events (id TEXT PRIMARY KEY, group_id TEXT, event_type TEXT NOT NULL, message_type TEXT, sender_key TEXT, received_at TEXT NOT NULL, summary TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS operational_sites (id TEXT PRIMARY KEY, site_name TEXT NOT NULL, customer_name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS shift_templates (id TEXT PRIMARY KEY, site_id TEXT NOT NULL, wave TEXT NOT NULL, post_name TEXT NOT NULL, slot_label TEXT NOT NULL, assigned_guard TEXT, deadline TEXT NOT NULL, verification_policy TEXT NOT NULL DEFAULT 'standard', active INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS coverage_slots (id TEXT PRIMARY KEY, operational_date TEXT NOT NULL, wave TEXT NOT NULL, site_id TEXT NOT NULL, site_name TEXT NOT NULL, customer_name TEXT NOT NULL, post_name TEXT NOT NULL, slot_label TEXT NOT NULL, assigned_guard TEXT, assignment_type TEXT NOT NULL DEFAULT 'regular', state TEXT NOT NULL, verification_policy TEXT NOT NULL DEFAULT 'standard', deadline TEXT NOT NULL, reported_at TEXT, source TEXT, late_minutes INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS billing_cases (id TEXT PRIMARY KEY, customer_name TEXT NOT NULL, service_period TEXT NOT NULL, amount_satang INTEGER NOT NULL, due_at TEXT NOT NULL, document_state TEXT NOT NULL DEFAULT 'incomplete', submission_state TEXT NOT NULL DEFAULT 'unscheduled', payment_state TEXT NOT NULL DEFAULT 'unpaid', next_action TEXT NOT NULL, owner_name TEXT NOT NULL, appointment_at TEXT, location TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL, summary TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS line_auto_reply_configs (
      group_id TEXT PRIMARY KEY,
      mode TEXT NOT NULL DEFAULT 'disabled',
      sticker_package_id TEXT,
      sticker_id TEXT,
      daily_limit INTEGER NOT NULL DEFAULT 100,
      daily_count INTEGER NOT NULL DEFAULT 0,
      daily_count_date TEXT,
      cooldown_minutes INTEGER NOT NULL DEFAULT 15,
      active_hours_start TEXT NOT NULL DEFAULT '00:00',
      active_hours_end TEXT NOT NULL DEFAULT '23:59',
      last_reply_at TEXT,
      last_inbound_event_id TEXT,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS line_sticker_presets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      package_id TEXT NOT NULL,
      sticker_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS line_outbound_audit (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      trigger_event_id TEXT,
      action_type TEXT NOT NULL,
      sticker_package_id TEXT,
      sticker_id TEXT,
      status TEXT NOT NULL,
      skip_reason TEXT,
      sent_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS line_queued_stickers (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      sticker_package_id TEXT NOT NULL,
      sticker_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      sent_at TEXT,
      status TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS line_manual_batch_jobs (
      id TEXT PRIMARY KEY,
      group_ids TEXT NOT NULL,
      sticker_package_id TEXT NOT NULL,
      sticker_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_coverage_today ON coverage_slots(operational_date, wave, site_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_billing_due ON billing_cases(due_at, payment_state)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_operational_sites_active ON operational_sites(active, site_name)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_shift_templates_wave_active ON shift_templates(wave, active, site_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_shift_templates_site_slot ON shift_templates(site_id, wave, post_name, slot_label)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_line_groups_site ON line_groups(site_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_line_groups_name ON line_groups(group_name)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_line_registry_name ON line_group_registry(group_name)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_line_queued_stickers_group_status ON line_queued_stickers(group_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_line_registry_seen ON line_group_registry(last_seen_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_line_events_group_time ON line_webhook_events(group_id, received_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_line_events_type_time ON line_webhook_events(event_type, received_at)"),
    db.prepare("ALTER TABLE line_webhook_events ADD COLUMN message_type TEXT"),
    db.prepare("ALTER TABLE line_webhook_events ADD COLUMN sender_key TEXT"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_line_events_report_candidate ON line_webhook_events(group_id, message_type, received_at)"),
  ]);
  await db.refreshIfStale();

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
  // Keep cold starts read-light.  Bulk activation scans every LINE group and
  // belongs to the explicit manager action, not the request path for health
  // checks, dashboard reads, or a profile refresh.
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
  // Startup runs for dashboard reads as well as webhooks.  Only touch a
  // registry row when its mapping genuinely changed; otherwise each refresh
  // rewrites all 69 groups to Firestore and can exhaust the write quota.
  await database().prepare("INSERT INTO line_group_registry (id, group_name, picture_url, last_seen_at, source, updated_at) SELECT id, group_name, picture_url, NULL, 'manual', ? FROM line_groups WHERE 1 = 1 ON CONFLICT(id) DO UPDATE SET group_name = excluded.group_name, picture_url = COALESCE(excluded.picture_url, line_group_registry.picture_url), updated_at = excluded.updated_at WHERE excluded.group_name != line_group_registry.group_name OR (excluded.picture_url IS NOT NULL AND excluded.picture_url != COALESCE(line_group_registry.picture_url, ''))")
    .bind(now).run();
}

// Verified LINE groups are the source of truth for points. Create a dormant
// operational record automatically so setup starts from the real group rather
// than asking the manager to create a duplicate point and map it later.
async function provisionLinePointRecords() {
  const db = database();
  const now = bangkokNow().iso;
  const result = await db.prepare("SELECT r.id, r.group_name, r.picture_url FROM line_group_registry r LEFT JOIN line_groups m ON m.id = r.id WHERE m.id IS NULL").all<D1Row>();
  const rows = result.results ?? [];
  for (let offset = 0; offset < rows.length; offset += 80) {
    const operations = rows.slice(offset, offset + 80).flatMap((row) => {
      const groupId = String(row.id ?? "").trim();
      const groupName = String(row.group_name ?? "").trim();
      if (!groupId || !groupName || isPlaceholderLineGroupName(groupName, groupId)) return [];
      const siteId = linePointSiteIdentifier(groupId);
      return [
        db.prepare("INSERT OR IGNORE INTO operational_sites (id, site_name, customer_name, active, created_at, updated_at) VALUES (?, ?, 'ยังไม่ระบุลูกค้า', 1, ?, ?)")
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
  for (let offset = 0; offset < operations.length; offset += 80) {
    await db.batch(operations.slice(offset, offset + 80));
  }
}

type LineReportActivity = {
  lastMessageType: string | null;
  lastReportAt: string | null;
  lastReportSenderKey: string | null;
  lastCandidateAt: string | null;
  lastCandidateSenderKey: string | null;
};

async function getLineReportActivity(configs: Record<string, LineReportConfig>) {
  const rows = await database().prepare("SELECT group_id, message_type, sender_key, received_at FROM line_webhook_events WHERE group_id IS NOT NULL AND group_id != '' AND event_type = 'message' ORDER BY received_at DESC LIMIT 5000").all<D1Row>();
  const activity = new Map<string, LineReportActivity>();
  for (const row of rows.results ?? []) {
    const groupId = String(row.group_id ?? "").trim();
    if (!groupId) continue;
    const messageType = value(row, "message_type");
    const senderKey = value(row, "sender_key");
    const receivedAt = value(row, "received_at");
    if (!messageType || !receivedAt) continue;
    const current = activity.get(groupId) ?? {
      lastMessageType: null,
      lastReportAt: null,
      lastReportSenderKey: null,
      lastCandidateAt: null,
      lastCandidateSenderKey: null,
    };
    if (!current.lastMessageType) current.lastMessageType = messageType;
    if (messageType !== "text") {
      activity.set(groupId, current);
      continue;
    }
    if (!current.lastCandidateAt) {
      current.lastCandidateAt = receivedAt;
      current.lastCandidateSenderKey = senderKey;
    }
    const config = configs[groupId] ?? DEFAULT_LINE_REPORT_CONFIG;
    const accepted = config.verification === "text"
      || Boolean(senderKey && config.approvedSenderKeys.includes(senderKey));
    if (accepted && !current.lastReportAt) {
      current.lastReportAt = receivedAt;
      current.lastReportSenderKey = senderKey;
    }
    activity.set(groupId, current);
  }
  return activity;
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
  const callbackResult = await db.prepare("SELECT key, value FROM system_settings WHERE key IN (?, ?)")
    .bind("line_callback_last_at", "line_callback_last_summary").all<D1Row>();
  const linePointDetailResult = await db.prepare("SELECT m.id AS group_id, s.customer_name, s.active, t.wave, t.post_name, t.slot_label, t.assigned_guard, t.deadline FROM line_groups m INNER JOIN operational_sites s ON s.id = m.site_id LEFT JOIN shift_templates t ON t.site_id = s.id AND t.active = 1 ORDER BY m.id, t.wave, t.updated_at DESC").all<D1Row>();
  const lineReminder = await getLineReminderSettings();
  const lineReportConfigs = await getLineReportConfigs();
  const lineReportActivity = await getLineReportActivity(lineReportConfigs);
  const callbackSettings = new Map((callbackResult.results ?? []).map((row) => [String(row.key), String(row.value)]));
  const lastCallbackAt = callbackSettings.get("line_callback_last_at") || null;
  const lastCallbackSummary = callbackSettings.get("line_callback_last_summary") || null;
  // A verified callback is a more faithful connection signal than the latest
  // saved group record. The latter is intentionally absent for non-group events.
  const lastWebhookAt = lastCallbackAt ?? lineCounts?.last_webhook_at ?? null;
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
    lineGroups: (lineGroupResult.results ?? []).map((row) => {
      const activity = lineReportActivity.get(String(row.id ?? ""));
      return toLineGroup({
        ...row,
        last_message_type: activity?.lastMessageType ?? null,
        last_report_at: activity?.lastReportAt ?? null,
        last_report_sender_key: activity?.lastReportSenderKey ?? null,
        last_candidate_at: activity?.lastCandidateAt ?? null,
        last_candidate_sender_key: activity?.lastCandidateSenderKey ?? null,
      });
    }),
    lineIntegration: {
      configured: Boolean(lineEnvironment().LINE_CHANNEL_ACCESS_TOKEN && lineEnvironment().LINE_CHANNEL_SECRET),
      gatewayConfigured: Boolean(lineEnvironment().LINE_GATEWAY_URL && lineEnvironment().LINE_GATEWAY_SYNC_TOKEN),
      webhookPath: "/api/line/webhook",
      lastWebhookAt,
      lastCallbackSummary,
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
  const mappedGroups = await db.prepare("SELECT id FROM line_groups WHERE site_id = ?").bind(siteId).all<D1Row>();
  const groupIds = (mappedGroups.results ?? []).map((row) => String(row.id));
  const operations: ReturnType<typeof db.prepare>[] = [
    db.prepare("DELETE FROM line_groups WHERE site_id = ?").bind(siteId),
    db.prepare("DELETE FROM coverage_slots WHERE site_id = ?").bind(siteId),
    db.prepare("DELETE FROM shift_templates WHERE site_id = ?").bind(siteId),
    db.prepare("DELETE FROM operational_sites WHERE id = ?").bind(siteId),
  ];
  for (const gid of groupIds) {
    operations.push(
      db.prepare("DELETE FROM line_group_registry WHERE id = ?").bind(gid),
      db.prepare("DELETE FROM system_settings WHERE key = ?").bind(`line_report_config:${gid}`),
    );
  }
  await db.batch(operations);
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
  if (!registry || !groupName || isPlaceholderLineGroupName(groupName, groupId)) {
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
  if (!registry || !groupName || isPlaceholderLineGroupName(groupName, groupId)) {
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

export async function activateAllLinePoints(actor: string) {
  await ensureDatabase();
  return activateAllLinePointsInternal(actor);
}

async function activateAllLinePointsInternal(actor: string) {
  const db = database();
  const now = bangkokNow().iso;
  const registryResult = await db.prepare("SELECT r.id, r.group_name, r.picture_url, m.site_id, s.customer_name, s.active AS site_active FROM line_group_registry r LEFT JOIN line_groups m ON m.id = r.id LEFT JOIN operational_sites s ON s.id = m.site_id ORDER BY r.group_name").all<D1Row>();
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
        .bind(templateIdentifier(siteId, "morning", "จุดประจำ", "ช่อง 1"), siteId, now));
    }
    if (!waves.has("evening")) {
      initialized += 1;
      operations.push(db.prepare("INSERT INTO shift_templates (id, site_id, wave, post_name, slot_label, assigned_guard, deadline, verification_policy, active, updated_at) VALUES (?, ?, 'evening', 'จุดประจำ', 'ช่อง 1', NULL, '18:00', 'standard', 1, ?) ON CONFLICT(id) DO UPDATE SET active = 1, deadline = '18:00', updated_at = excluded.updated_at")
        .bind(templateIdentifier(siteId, "evening", "จุดประจำ", "ช่อง 1"), siteId, now));
    }
    const existingConfig = await db.prepare("SELECT value FROM system_settings WHERE key = ?").bind(`line_report_config:${groupId}`).first<D1Row>();
    const reportConfig = safeLineReportConfig(existingConfig ? value(existingConfig, "value") : null);
    operations.push(db.prepare("INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .bind(`line_report_config:${groupId}`, JSON.stringify({ ...reportConfig, enabled: true }), now));
  }
  for (let offset = 0; offset < operations.length; offset += 80) {
    await db.batch(operations.slice(offset, offset + 80));
  }
  // Initialization already owns the process-level ensureDatabase promise.
  // Calling the exported wrapper here would await that same promise and
  // deadlock the first API request.
  const generated = await generateTodayFromTemplatesInternal(actor);
  await addAudit("line_point", "bulk", "enabled", actor, `เปิดใช้งานกลุ่ม LINE เป็นกลุ่มหลัก ${activated + alreadyActive} จุด · เติมกะ ${initialized} รายการ · ข้าม ${skipped} กลุ่ม`);
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
  const siteId = value(group, "site_id") ? String(group.site_id) : null;
  const groupName = String(group.group_name ?? groupId);
  const operations: ReturnType<typeof db.prepare>[] = [
    db.prepare("DELETE FROM line_group_registry WHERE id = ?").bind(groupId),
    db.prepare("DELETE FROM line_groups WHERE id = ?").bind(groupId),
    db.prepare("DELETE FROM system_settings WHERE key = ?").bind(`line_report_config:${groupId}`),
  ];
  if (siteId) {
    operations.push(
      db.prepare("DELETE FROM coverage_slots WHERE site_id = ?").bind(siteId),
      db.prepare("DELETE FROM shift_templates WHERE site_id = ?").bind(siteId),
      db.prepare("DELETE FROM operational_sites WHERE id = ?").bind(siteId),
    );
  }
  await db.batch(operations);
  await addAudit("line_group", groupId, "deleted", actor, "ลบกลุ่ม LINE " + groupName);
}

export async function saveLineWebhookEvent(input: {
  eventId: string;
  groupId: string;
  eventType: string;
  messageType?: string;
  senderKey?: string;
  groupName?: string;
  pictureUrl?: string | null;
  receivedAt?: string;
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
  const suppliedReceivedAt = input.receivedAt?.trim() ?? "";
  const receivedAt = suppliedReceivedAt && !Number.isNaN(Date.parse(suppliedReceivedAt))
    ? new Date(suppliedReceivedAt).toISOString()
    : now;
  const groupName = input.groupName?.trim() || `กลุ่ม LINE ${groupId.slice(-6)}`;
  const safePictureUrl = input.pictureUrl ? pictureUrl(input.pictureUrl) : null;
  await db.batch([
    // Keep each field separate. SQLite's numbered placeholders were treated
    // differently by the App Hosting runtime and caused a 500 for every LINE
    // message after signature verification.
    db.prepare("INSERT OR IGNORE INTO line_webhook_events (id, group_id, event_type, message_type, sender_key, received_at, summary) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(eventId, groupId, input.eventType.slice(0, 48), input.messageType?.slice(0, 32) || null, input.senderKey?.slice(0, 32) || null, receivedAt, "Webhook ที่ตรวจสอบลายเซ็นแล้ว; ไม่เก็บข้อความในกลุ่ม"),
    db.prepare("INSERT INTO line_group_registry (id, group_name, picture_url, last_seen_at, source, updated_at) VALUES (?, ?, ?, ?, 'webhook', ?) ON CONFLICT(id) DO UPDATE SET group_name = CASE WHEN excluded.group_name LIKE 'LINE group %' AND line_group_registry.group_name NOT LIKE 'LINE group %' THEN line_group_registry.group_name ELSE excluded.group_name END, picture_url = COALESCE(excluded.picture_url, line_group_registry.picture_url), last_seen_at = excluded.last_seen_at, source = 'webhook', updated_at = excluded.updated_at")
      .bind(groupId, groupName, safePictureUrl, receivedAt, now),
  ]);
  // A message must never trigger bulk point activation. That operation writes
  // every configured group and caused a single busy LINE chat to repeatedly
  // rewrite the whole registry. Activation remains an explicit manager action.
  return { saved: true, duplicate: false };
}

// Records only aggregate metadata after the LINE signature has been verified.
// This makes callback delivery visible without retaining chat text, LINE IDs,
// group names, or any sender details for events that cannot be mapped to a group.
export async function recordLineWebhookCallback(input: {
  eventCount: number;
  groupEvents: number;
  roomEvents: number;
  userEvents: number;
  otherEvents: number;
  messageEvents: number;
}) {
  await ensureDatabase();
  const now = bangkokNow().iso;
  const count = (value: number) => Math.max(0, Math.min(9_999, Math.floor(Number(value) || 0)));
  const summary = `รับ ${count(input.eventCount)} เหตุการณ์ · กลุ่ม ${count(input.groupEvents)} · ห้องหลายคน ${count(input.roomEvents)} · ส่วนตัว ${count(input.userEvents)} · อื่นๆ ${count(input.otherEvents)} · ข้อความ ${count(input.messageEvents)}`;
  const db = database();
  await db.batch([
    db.prepare("INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .bind("line_callback_last_at", now, now),
    db.prepare("INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .bind("line_callback_last_summary", summary, now),
  ]);
  return { receivedAt: now, summary };
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

type LineGroupProfile = { groupName?: string; pictureUrl?: string };

async function fetchLineGroupProfile(groupId: string, accessToken: string): Promise<LineGroupProfile | null> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race<Response | null>([
      fetch(`https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/summary`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      }),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => {
          controller.abort();
          resolve(null);
        }, 4_000);
      }),
    ]);
    if (!response || !response.ok) return null;
    const profile = await response.json() as LineGroupProfile;
    return profile.groupName?.trim() ? profile : null;
  } catch {
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

// Repairs placeholder entries created during a cold start, and gives the
// manager a safe one-tap way to refresh real names/logos without waiting for
// another message in every group.
export async function refreshLineGroupProfiles(actor: string, requestedGroupIds: string[] = []) {
  await ensureDatabase();
  const accessToken = lineEnvironment().LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) throw new Error("ยังไม่ได้ตั้งค่า Channel access token");
  // Webhook handling registers groups as they arrive. Replaying the full event
  // history here makes a simple profile refresh wait on unrelated database
  // writes, even when the registry is already complete.
  const recovered = 0;
  const db = database();
  const registry = await db.prepare("SELECT id, group_name FROM line_group_registry ORDER BY last_seen_at DESC").all<D1Row>();
  const requested = new Set(requestedGroupIds.map((id) => id.trim()).filter(Boolean));
  const rows = (registry.results ?? []).filter((row) => !requested.size || requested.has(String(row.id ?? "").trim()));
  const updates: Array<{ groupId: string; groupName: string; pictureUrl: string | null }> = [];

  for (let index = 0; index < rows.length; index += 8) {
    const batch = rows.slice(index, index + 8);
    const results = await Promise.all(batch.map(async (row) => {
      const groupId = String(row.id ?? "").trim();
      if (!groupId) return null;
      const profile = await fetchLineGroupProfile(groupId, accessToken);
      const groupName = profile?.groupName?.trim() ?? "";
      if (!profile || !groupName || isPlaceholderLineGroupName(groupName, groupId)) return null;
      let safePictureUrl: string | null = null;
      try { safePictureUrl = pictureUrl(profile.pictureUrl); } catch { safePictureUrl = null; }
      return { groupId, groupName, pictureUrl: safePictureUrl };
    }));
    updates.push(...results.filter((result): result is { groupId: string; groupName: string; pictureUrl: string | null } => Boolean(result)));
  }

  // Persist all recovered names in one batch.  The old loop wrote the whole
  // registry back to Firestore for every group and made the manager wait.
  const now = bangkokNow().iso;
  for (let index = 0; index < updates.length; index += 80) {
    await db.batch(updates.slice(index, index + 80).map((update) =>
      db.prepare("UPDATE line_group_registry SET group_name = ?, picture_url = COALESCE(?, picture_url), source = 'webhook', updated_at = ? WHERE id = ?")
        .bind(update.groupName, update.pictureUrl, now, update.groupId),
    ));
  }
  const resolved = updates.length;
  const unavailable = Math.max(0, rows.length - resolved);
  await addAudit("line_group", "registry", "profiles_refreshed", actor, `รีเฟรชชื่อและโลโก้จริงจาก LINE สำเร็จ ${resolved} กลุ่ม`);
  return { total: rows.length, resolved, unavailable, recovered };
}

async function recoverLineGroupsFromWebhookEvents() {
  const db = database();
  const events = await db.prepare("SELECT group_id, MAX(received_at) AS last_seen_at FROM line_webhook_events WHERE group_id IS NOT NULL AND group_id != '' GROUP BY group_id ORDER BY last_seen_at DESC").all<D1Row>();
  const rows = events.results ?? [];
  const now = bangkokNow().iso;
  const operations = rows.flatMap((row) => {
    const groupId = String(row.group_id ?? "").trim();
    if (!groupId) return [];
    return [db.prepare("INSERT OR IGNORE INTO line_group_registry (id, group_name, picture_url, last_seen_at, source, updated_at) VALUES (?, ?, NULL, ?, 'webhook', ?)")
      .bind(groupId, `LINE group ${groupId.slice(-6)}`, String(row.last_seen_at ?? now), now)];
  });
  for (let index = 0; index < operations.length; index += 80) {
    await db.batch(operations.slice(index, index + 80));
  }
  // Profile refresh must not run the expensive bulk point activation before
  // contacting LINE.  This helper merely restores registry rows that are
  // missing; normal webhook handling already activates a newly received group.
export function sanitizeLineId(raw: string): string {
  const trimmed = String(raw || "").trim();
  // Extract C[32 hex], R[32 hex], U[32 hex] anywhere in the string/URL path
  const match = trimmed.match(/[CRU][0-9a-fA-F]{32}/);
  if (match) return match[0];
  return trimmed;
}

export async function sendLineConnectionTest(input: { groupId: string; actor: string }) {
  await ensureDatabase();
  const rawGroupId = input.groupId.trim();
  const cleanId = sanitizeLineId(rawGroupId);
  const token = lineEnvironment().LINE_CHANNEL_ACCESS_TOKEN;
  if (!cleanId) throw new Error("ไม่พบกลุ่ม LINE ที่ต้องการทดสอบ");
  if (!token) throw new Error("ยังไม่ได้ตั้งค่า Channel access token ในระบบที่ปลอดภัย");
  
  const group = await database().prepare("SELECT group_name FROM line_group_registry WHERE id = ? OR id = ?").bind(cleanId, rawGroupId).first<D1Row>();
  const groupName = group ? String(group.group_name) : cleanId;

  // Auto clean registry if id was dirty
  if (cleanId !== rawGroupId) {
    const db = database();
    const now = bangkokNow().iso;
    await db.prepare("INSERT INTO line_group_registry (id, group_name, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET group_name = excluded.group_name, updated_at = excluded.updated_at").bind(cleanId, groupName, now).run().catch(() => {});
    await db.prepare("DELETE FROM line_group_registry WHERE id = ?").bind(rawGroupId).run().catch(() => {});
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      to: cleanId,
      messages: [{ type: "text", text: "ALPHA Command Center: ทดสอบการเชื่อมต่อกลุ่มสำเร็จ\nข้อความนี้ไม่แสดงสถานะกำลังหรือข้อมูลภายใน" }],
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LINE OA ไม่รับการส่งข้อความทดสอบ (${response.status}): ${errText}`);
  }
  await addAudit("line_group", cleanId, "connection_test_sent", input.actor, `ส่งข้อความทดสอบไปยัง ${groupName}`);
  return { ok: true, groupId: cleanId, message: `ส่งข้อความทดสอบไปยัง "${groupName}" สำเร็จแล้ว` };
}

export async function saveLineReminderSettings(input: { targetGroupId: string; escalationTargetGroupId?: string; autoEnabled: boolean; autoEscalationEnabled?: boolean; actor: string }) {
  await ensureDatabase();
  const targetGroupId = input.targetGroupId.trim();
  if (targetGroupId) {
    const group = await database().prepare("SELECT group_name FROM line_group_registry WHERE id = ?").bind(targetGroupId).first<D1Row>();
    if (!group) throw new Error("ยังไม่พบกลุ่มหลักในทะเบียน LINE กรุณาให้กลุ่มส่ง webhook ก่อน");
  }
  const escalationTargetGroupId = input.escalationTargetGroupId?.trim() ?? "";
  if (escalationTargetGroupId && escalationTargetGroupId !== targetGroupId) {
    const escalation = await database().prepare("SELECT id FROM line_group_registry WHERE id = ?").bind(escalationTargetGroupId).first<D1Row>();
    if (!escalation) throw new Error("ยังไม่พบกลุ่มสั่งการสำหรับติดตามด่วนในทะเบียน LINE");
  }
  await setLineReminderSetting("line_reminder_target_group_id", targetGroupId);
  await setLineReminderSetting("line_reminder_escalation_target_group_id", escalationTargetGroupId);
  await setLineReminderSetting("line_reminder_auto_enabled", input.autoEnabled ? "1" : "0");
  await setLineReminderSetting("line_reminder_auto_escalation_enabled", input.autoEscalationEnabled ? "1" : "0");
  await addAudit("line_reminder", targetGroupId || "none", "settings_saved", input.actor, targetGroupId ? "ตั้งกลุ่มหลักสำหรับแจ้งเตือนรายงาน" : "ล้างกลุ่มหลักสำหรับแจ้งเตือนรายงาน");
}

export async function saveLineReportConfig(input: { groupId: string; config: LineReportConfig; actor: string }) {
  await ensureDatabase();
  const groupId = input.groupId.trim();
  if (!groupId) throw new Error("กรุณาเลือกกลุ่ม LINE ที่ต้องการตั้งค่ากะ");
  const group = await database().prepare("SELECT r.group_name, m.site_id, s.active FROM line_group_registry r LEFT JOIN line_groups m ON m.id = r.id LEFT JOIN operational_sites s ON s.id = m.site_id WHERE r.id = ?").bind(groupId).first<D1Row>();
  if (!group || !group.site_id || Number(group.active ?? 0) !== 1) throw new Error("กลุ่มนี้ยังไม่ได้ผูกกับจุดปฏิบัติการที่ใช้งานอยู่");
  const now = bangkokNow().iso;
  const submitted = safeLineReportConfig(JSON.stringify(input.config));
  const prior = await database().prepare("SELECT value FROM system_settings WHERE key = ?").bind(`line_report_config:${groupId}`).first<D1Row>();
  const priorConfig = safeLineReportConfig(prior ? value(prior, "value") : null);
  const config: LineReportConfig = {
    ...submitted,
    monitoringStartedAt: submitted.mode === "observe" ? null : submitted.monitoringStartedAt ?? priorConfig.monitoringStartedAt ?? now,
  };
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

async function sendLegacyLineReportReminder(input: { targetGroupId: string; wave: "morning" | "evening"; actor: string; force?: boolean; includeClear?: boolean }) {
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

type ReminderPreviewItem = {
  groupId: string;
  groupName: string;
  siteName: string | null;
  dueAt: string;
  overdueRounds: number;
  ageMinutes: number;
  escalation: boolean;
  verification: "text" | "approved_sender";
  candidateSenderKey: string | null;
};

export type LineReminderPreview = {
  targetGroupId: string;
  targetGroupName: string;
  roundTime: string;
  trackedCount: number;
  pendingCount: number;
  carryOverCount: number;
  escalationCount: number;
  notArmedCount: number;
  items: ReminderPreviewItem[];
  message: string;
  escalationMessage: string | null;
};

function timeAsMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return Number.isInteger(hour) && Number.isInteger(minute) ? hour * 60 + minute : 0;
}

function minutesAsTime(minutes: number) {
  const safe = ((minutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function bangkokDateTimeMs(date: string, time: string) {
  return Date.parse(`${date}T${time}:00+07:00`);
}

function overdueRoundsFor(config: LineReportConfig, nowTime: string) {
  if (config.mode === "observe") return [];
  const cutoff = Math.max(0, timeAsMinutes(nowTime) - config.graceMinutes);
  if (config.mode === "interval") {
    const anchor = timeAsMinutes(config.intervalAnchor);
    const period = config.intervalHours * 60;
    const rounds: string[] = [];
    for (let minute = anchor; minute <= cutoff; minute += period) rounds.push(minutesAsTime(minute));
    return rounds;
  }
  return config.expectedTimes.filter((time) => timeAsMinutes(time) <= cutoff);
}

function reminderAgeHoursLabel(minutes: number) {
  if (!Number.isFinite(minutes)) return "ยังไม่เคยส่งรายงาน";
  if (minutes < 60) return `${Math.max(1, minutes)} นาที`;
  return `${Math.floor(minutes / 60)} ชม.`;
}

async function buildLineReminderPreview(input: { targetGroupId: string; roundTime?: string }): Promise<LineReminderPreview> {
  await ensureDatabase();
  const targetGroupId = input.targetGroupId.trim();
  const db = database();
  const target = await db.prepare("SELECT group_name FROM line_group_registry WHERE id = ?").bind(targetGroupId).first<D1Row>();
  if (!target) throw new Error("ยังไม่พบกลุ่มปลายทางสำหรับแจ้งเตือนในทะเบียน LINE");
  const current = bangkokNow();
  const configs = await getLineReportConfigs();
  const activity = await getLineReportActivity(configs);
  const settings = await getLineReminderSettings();
  const excluded = new Set([targetGroupId, settings.escalationTargetGroupId].filter((id): id is string => Boolean(id)));
  const rows = await db.prepare("SELECT r.id, r.group_name, s.site_name FROM line_group_registry r INNER JOIN line_groups m ON m.id = r.id INNER JOIN operational_sites s ON s.id = m.site_id AND s.active = 1 ORDER BY r.group_name").all<D1Row>();
  const items: ReminderPreviewItem[] = [];
  let trackedCount = 0;
  let notArmedCount = 0;
  for (const row of rows.results ?? []) {
    const groupId = String(row.id ?? "").trim();
    if (!groupId || excluded.has(groupId)) continue;
    const config = configs[groupId] ?? DEFAULT_LINE_REPORT_CONFIG;
    if (!config.enabled || config.mode === "observe") continue;
    if (!config.monitoringStartedAt) {
      notArmedCount += 1;
      continue;
    }
    trackedCount += 1;
    const monitoringStartedMs = Date.parse(config.monitoringStartedAt);
    const rounds = overdueRoundsFor(config, current.time).filter((round) => bangkokDateTimeMs(current.date, round) >= monitoringStartedMs);
    if (!rounds.length) continue;
    const latest = activity.get(groupId);
    const lastReportAt = latest?.lastReportAt ?? null;
    const lastReportMs = lastReportAt ? Date.parse(lastReportAt) : Number.NEGATIVE_INFINITY;
    const missingRounds = rounds.filter((round) => bangkokDateTimeMs(current.date, round) > lastReportMs);
    if (!missingRounds.length) continue;
    const oldestRound = missingRounds[0];
    const ageMinutes = Math.max(0, Math.floor((Date.parse(current.iso) - bangkokDateTimeMs(current.date, oldestRound)) / 60_000));
    items.push({
      groupId,
      groupName: String(row.group_name ?? groupId),
      siteName: value(row, "site_name"),
      dueAt: missingRounds.at(-1) ?? oldestRound,
      overdueRounds: missingRounds.length,
      ageMinutes,
      escalation: ageMinutes >= config.escalationAfterHours * 60,
      verification: config.verification,
      candidateSenderKey: latest?.lastCandidateSenderKey ?? null,
    });
  }
  items.sort((left, right) => Number(right.escalation) - Number(left.escalation) || right.ageMinutes - left.ageMinutes || left.groupName.localeCompare(right.groupName, "th"));
  const roundTime = input.roundTime && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.roundTime)
    ? input.roundTime
    : items.map((item) => item.dueAt).sort().at(-1) ?? current.time.slice(0, 5);
  const messageItems = items.slice(0, 24).map((item, index) => {
    const point = item.siteName && item.siteName !== item.groupName ? ` · ${item.siteName}` : "";
    const carried = item.overdueRounds > 1 ? ` · ค้าง ${item.overdueRounds} รอบ` : "";
    const sender = item.verification === "approved_sender" && item.candidateSenderKey ? " · ผู้ส่งยังไม่ยืนยัน" : "";
    return `${index + 1}. ${item.groupName.slice(0, 58)}${point} · รอบ ${item.dueAt}${carried} · ${reminderAgeHoursLabel(item.ageMinutes)}${sender}`;
  });
  const overflow = items.length > messageItems.length ? `…และอีก ${items.length - messageItems.length} จุด` : "";
  const summaryLine = trackedCount
    ? `ยังไม่ผ่านการตรวจ ${items.length}/${trackedCount} จุด${items.filter((item) => item.overdueRounds > 1).length ? ` · ค้างข้ามรอบ ${items.filter((item) => item.overdueRounds > 1).length} จุด` : ""}`
    : notArmedCount
      ? `ยังไม่เริ่มนับ ${notArmedCount} จุด · บันทึกการตั้งค่ารายจุดเพื่อเริ่ม`
      : "ยังไม่มีจุดที่เปิดตรวจในรอบนี้";
  const message = [
    `🚨 แจ้งติดตามรายงาน · รอบ ${roundTime}`,
    summaryLine,
    "",
    ...messageItems,
    overflow,
    "",
    "โปรดให้ รปภ. ผู้ปฏิบัติส่งรายงานจากบัญชีของตน · สติกเกอร์ไม่นับเป็นรายงาน",
    "— ALPHA Command Center",
  ].filter(Boolean).join("\n").slice(0, 4_900);
  const escalationItems = items.filter((item) => item.escalation).slice(0, 18);
  const escalationMessage = escalationItems.length ? [
    `⚠️ ติดตามด่วน · ขาดรายงานนานเกินกำหนด`,
    ...escalationItems.map((item, index) => `${index + 1}. ${item.groupName.slice(0, 58)} · รอบ ${item.dueAt} · ค้าง ${reminderAgeHoursLabel(item.ageMinutes)}`),
    "กรุณาตรวจสอบผู้ปฏิบัติจริงและบันทึกผลในศูนย์สั่งการ",
    "— ALPHA Command Center",
  ].join("\n").slice(0, 4_900) : null;
  return {
    targetGroupId,
    targetGroupName: String(target.group_name),
    roundTime,
    trackedCount,
    pendingCount: items.length,
    carryOverCount: items.filter((item) => item.overdueRounds > 1).length,
    escalationCount: escalationItems.length,
    notArmedCount,
    items,
    message,
    escalationMessage,
  };
}

export async function previewLineReportReminder(input: { targetGroupId: string; roundTime?: string }) {
  return buildLineReminderPreview(input);
}

function lineRetryKey(...parts: string[]) {
  const digest = createHash("sha256").update(parts.join("\u001f")).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

async function pushLineText(targetGroupId: string, message: string, token: string, retryKey?: string) {
  const cleanId = sanitizeLineId(targetGroupId);
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(retryKey ? { "X-Line-Retry-Key": retryKey } : {}) },
    body: JSON.stringify({ to: cleanId, messages: [{ type: "text", text: message }] }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LINE OA ไม่รับการส่งแจ้งเตือน (${response.status}): ${errText.slice(0, 200)}`);
  }
}

export async function sendLineReportReminder(input: { targetGroupId: string; actor: string; force?: boolean; automatic?: boolean; roundTime?: string; sendEscalation?: boolean }) {
  const token = lineEnvironment().LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("ยังไม่ได้ตั้งค่า Channel access token ในระบบที่ปลอดภัย");
  const preview = await buildLineReminderPreview(input);
  if (!preview.pendingCount) return { ...preview, skipped: true, message: "รอบนี้ไม่มีจุดค้างรายงานที่ต้องส่งเตือน" };
  const settings = await getLineReminderSettings();
  const current = bangkokNow();
  const roundKey = `${current.date}|${preview.roundTime}`;
  const previousRound = await database().prepare("SELECT value FROM system_settings WHERE key = 'line_reminder_last_round_key'").first<D1Row>();
  if (!input.force && String(previousRound?.value ?? "") === roundKey) {
    return { ...preview, skipped: true, message: "ระบบส่งแจ้งเตือนของรอบนี้แล้ว จึงไม่ส่งซ้ำ" };
  }
  await pushLineText(preview.targetGroupId, preview.message, token, input.automatic ? lineRetryKey("report", preview.targetGroupId, roundKey, preview.message) : undefined);
  let escalationSent = false;
  const escalationTarget = settings.escalationTargetGroupId;
  const shouldEscalate = Boolean(preview.escalationMessage && escalationTarget && escalationTarget !== preview.targetGroupId && (input.sendEscalation || (input.automatic && settings.autoEscalationEnabled)));
  if (shouldEscalate && escalationTarget && preview.escalationMessage) {
    await pushLineText(escalationTarget, preview.escalationMessage, token, input.automatic ? lineRetryKey("escalation", escalationTarget, roundKey, preview.escalationMessage) : undefined);
    escalationSent = true;
  }
  await Promise.all([
    setLineReminderSetting("line_reminder_last_sent_at", current.iso),
    setLineReminderSetting("line_reminder_last_sent_count", String(preview.pendingCount)),
    setLineReminderSetting("line_reminder_last_target_name", preview.targetGroupName),
    setLineReminderSetting("line_reminder_last_round_key", roundKey),
  ]);
  await addAudit("line_reminder", preview.targetGroupId, input.automatic ? "auto_report_reminder_sent" : "report_reminder_sent", input.actor, `ส่งแจ้งเตือนรอบ ${preview.roundTime} จำนวน ${preview.pendingCount} จุด${escalationSent ? " และส่งติดตามด่วน" : ""}`);
  return { skipped: false, sentAt: current.iso, escalationSent, ...preview };
}

export async function runScheduledLineReminders(actor = "scheduler") {
  await ensureDatabase();
  const settings = await getLineReminderSettings();
  if (!settings.autoEnabled || !settings.targetGroupId) return { skipped: true, message: "ยังไม่ได้เปิดส่งอัตโนมัติหรือยังไม่เลือกกลุ่มสั่งการ" };
  return sendLineReportReminder({ targetGroupId: settings.targetGroupId, actor, force: false, automatic: true });
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
  await activateAllLinePointsInternal(actor || "gateway-sync");
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
        .bind(templateId, siteId, row.wave, row.postName, row.slotLabel, row.assignedGuard || null, row.deadline, row.verificationPolicy ?? "standard", now),
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

export function generateTodayFromTemplates(actor: string) {
  return ensureDatabase().then(() => generateTodayFromTemplatesInternal(actor));
}

async function generateTodayFromTemplatesInternal(actor: string) {
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
  for (let offset = 0; offset < operations.length; offset += 80) {
    await db.batch(operations.slice(offset, offset + 80));
  }
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

export async function consumeQueuedSticker(groupId: string): Promise<{ stickerPackageId: string; stickerId: string; queuedId: string } | null> {
  await ensureDatabase();
  const db = database();
  const now = bangkokNow();
  const queued = await db.prepare("SELECT * FROM line_queued_stickers WHERE group_id = ? AND status = 'pending' ORDER BY created_at ASC LIMIT 1").bind(groupId).first<any>();
  if (!queued) return null;

  const result = await db.prepare("UPDATE line_queued_stickers SET status = 'sent', sent_at = ? WHERE id = ? AND status = 'pending'").bind(now.iso, queued.id).run();
  if (result.meta.changes === 0) return null;

  return { stickerPackageId: queued.sticker_package_id, stickerId: queued.sticker_id, queuedId: queued.id };
}

export async function consumeAutoReplyQuota(groupId: string, eventId: string): Promise<{ allowed: boolean; reason?: string; stickerPackageId?: string; stickerId?: string }> {
  await ensureDatabase();
  const db = database();
  const now = bangkokNow();
  const config = await db.prepare("SELECT * FROM line_auto_reply_configs WHERE group_id = ?").bind(groupId).first<any>();
  if (!config) return { allowed: false, reason: "disabled" };
  if (config.mode !== 'reply_on_new_report') return { allowed: false, reason: "disabled" };
  if (!config.sticker_package_id || !config.sticker_id) return { allowed: false, reason: "no_sticker_configured" };

  if (config.last_inbound_event_id === eventId) return { allowed: false, reason: "no_new_event" };

  const [currentHourStr, currentMinuteStr] = now.time.split(':');
  const currentStr = `${currentHourStr}:${currentMinuteStr}`;
  
  if (currentStr < config.active_hours_start || currentStr > config.active_hours_end) {
    return { allowed: false, reason: "outside_active_hours" };
  }

  if (config.last_reply_at) {
    const lastReplyDate = new Date(config.last_reply_at);
    const nowDate = new Date(now.iso);
    const diffMinutes = (nowDate.getTime() - lastReplyDate.getTime()) / 60000;
    if (diffMinutes < config.cooldown_minutes) {
      return { allowed: false, reason: "cooldown" };
    }
  }

  const todayStr = now.iso.split('T')[0];
  let currentDailyCount = config.daily_count || 0;
  if (config.daily_count_date !== todayStr) {
    currentDailyCount = 0;
  }

  if (currentDailyCount >= config.daily_limit) {
    return { allowed: false, reason: "daily_cap_reached" };
  }

  const result = await db.prepare(`
    UPDATE line_auto_reply_configs 
    SET daily_count = CASE WHEN daily_count_date = ? THEN daily_count + 1 ELSE 1 END,
        daily_count_date = ?,
        last_reply_at = ?,
        last_inbound_event_id = ?,
        updated_at = ?
    WHERE group_id = ? 
      AND mode = 'reply_on_new_report'
      AND (last_reply_at IS NULL OR last_reply_at = ?)
  `).bind(todayStr, todayStr, now.iso, eventId, now.iso, groupId, config.last_reply_at || null).run();

  if (result.meta.changes === 0) return { allowed: false, reason: "concurrent_update_failed" };

  return { allowed: true, stickerPackageId: config.sticker_package_id, stickerId: config.sticker_id };
}

export async function logOutboundAction(input: {
  id: string;
  groupId: string;
  triggerEventId?: string;
  actionType: string;
  stickerPackageId: string;
  stickerId: string;
  status: string;
  skipReason?: string;
}) {
  await ensureDatabase();
  const db = database();
  await db.prepare(`
    INSERT INTO line_outbound_audit (id, group_id, trigger_event_id, action_type, sticker_package_id, sticker_id, status, skip_reason, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.id, input.groupId, input.triggerEventId || null, input.actionType, 
    input.stickerPackageId, input.stickerId, input.status, input.skipReason || null, bangkokNow().iso
  ).run();
}

// ---------------------------------------------------------------------------
// DYNAMIC SHIFT CHECK-IN & ALERT ENGINE
// ---------------------------------------------------------------------------

const SHIFT_HANDOVER_KEYWORDS = [
  "รับมอบเวร", "ส่งมอบเวร", "เข้าเวร", "ผลัดดึก", "ผลัดเช้า", "ประจำจุด", 
  "ว.4", "รายงานตัว", "พร้อมปฏิบัติหน้าที่", "เปลี่ยนกะ", "เข้าจุด", "รับเวร", "ส่งเวร"
];

export async function evaluateShiftCheckIn(input: {
  groupId: string;
  eventId: string;
  messageType?: string;
  text?: string;
  senderKey?: string;
  receivedAt: string;
}): Promise<{ checkedIn: boolean; siteName?: string; deadline?: string; lateMinutes?: number }> {
  try {
    await ensureDatabase();
    const db = database();
    
    // 1. ค้นหา site_id ที่ผูกกับกลุ่มนี้
    const group = (await db.prepare(
      "SELECT site_id, group_name FROM line_groups WHERE id = ?"
    ).bind(input.groupId).first()) as { site_id: string; group_name: string } | null;

    if (!group || !group.site_id) return { checkedIn: false };

    const now = bangkokNow();
    const today = now.date;
    const currentMinutes = minuteFromTime(now.time);

    // 2. ดึงสล็อตของวันนี้สำหรับจุดนี้
    const slotsResult = await db.prepare(
      "SELECT * FROM coverage_slots WHERE site_id = ? AND operational_date = ? AND state IN ('waiting', 'missing', 'unassigned')"
    ).bind(group.site_id, today).all<D1Row>();

    const slots = (slotsResult.results || []) as any[];
    if (!slots.length) return { checkedIn: false };

    // 3. ตรวจสอบว่ามีสล็อตไหนอยู่ในกรอบเวลาเข้าเวร (ล่วงหน้า 60 นาที ถึง หลังเวลาเริ่ม 180 นาที)
    for (const slot of slots) {
      const deadlineMins = minuteFromTime(slot.deadline || "18:00");
      const windowStart = deadlineMins - 60; // ก่อนเวลา 1 ชั่วโมง
      const windowEnd = deadlineMins + 180;   // หลังเวลาไม่เกิน 3 ชั่วโมง

      if (currentMinutes >= windowStart && currentMinutes <= windowEnd) {
        // ตรวจสอบเงื่อนไขการเป็นรายงานเข้าเวร
        let isHandover = false;
        
        // ก. ตรวจสอบคีย์เวิร์ดในข้อความ
        if (input.text) {
          const lowerText = input.text.toLowerCase();
          isHandover = SHIFT_HANDOVER_KEYWORDS.some((kw) => lowerText.includes(kw));
        }

        // ข. ตรวจสอบรูปภาพ หรือตำแหน่งพิกัด
        const isPhotoOrLocation = input.messageType === "image" || input.messageType === "location" || Boolean(input.messageType?.startsWith("image"));
        
        // ถ้ามีคีย์เวิร์ดชัดเจน หรือเป็นรูปภาพที่ส่งในช่วงเวลาเข้าเวร
        if (isHandover || isPhotoOrLocation) {
          const lateMins = Math.max(0, currentMinutes - deadlineMins);
          
          await db.prepare(`
            UPDATE coverage_slots 
            SET state = 'confirmed',
                reported_at = ?,
                source = ?,
                late_minutes = ?,
                updated_at = ?
            WHERE id = ?
          `).bind(now.time, isHandover ? "LINE รับมอบเวร" : "LINE ส่งรูปเข้าเวร", lateMins, now.iso, slot.id).run();

          await addAudit(
            "coverage_slot", 
            slot.id, 
            "shift_checked_in", 
            "LINE Webhook", 
            `รปภ. เข้าเวรจุด ${slot.site_name} (${slot.deadline}) เวลา ${now.time}${lateMins > 0 ? ` (สาย ${lateMins} นาที)` : " (ตรงเวลา)"}`
          );

          return { 
            checkedIn: true, 
            siteName: slot.site_name, 
            deadline: slot.deadline, 
            lateMinutes: lateMins 
          };
        }
      }
    }

    return { checkedIn: false };
  } catch (err) {
    return { checkedIn: false };
  }
}

export async function getShiftGroupConfigurations() {
  await ensureDatabase();
  const db = database();
  
  // ดึงกลุ่มจากทุกแหล่ง ทั้ง registry, groups, และ webhook events
  const groupsResult = await db.prepare(`
    SELECT DISTINCT 
      COALESCE(r.id, m.id) AS group_id,
      COALESCE(r.group_name, m.group_name, 'กลุ่ม LINE ' || SUBSTR(COALESCE(r.id, m.id), -6)) AS group_name,
      COALESCE(r.picture_url, m.picture_url) AS picture_url,
      COALESCE(r.last_seen_at, m.updated_at) AS last_seen_at,
      m.site_id, s.customer_name, s.active AS site_active
    FROM line_group_registry r
    FULL OUTER JOIN line_groups m ON m.id = r.id
    LEFT JOIN operational_sites s ON s.id = m.site_id
    ORDER BY group_name ASC
  `).all<D1Row>().catch(async () => {
    // Fallback for SQLite without FULL OUTER JOIN
    return await db.prepare(`
      SELECT 
        r.id AS group_id, r.group_name, r.picture_url, r.last_seen_at,
        m.site_id, s.customer_name, s.active AS site_active
      FROM line_group_registry r
      LEFT JOIN line_groups m ON m.id = r.id
      LEFT JOIN operational_sites s ON s.id = m.site_id
      UNION
      SELECT 
        m.id AS group_id, m.group_name, m.picture_url, m.updated_at AS last_seen_at,
        m.site_id, s.customer_name, s.active AS site_active
      FROM line_groups m
      LEFT JOIN line_group_registry r ON r.id = m.id
      LEFT JOIN operational_sites s ON s.id = m.site_id
      WHERE r.id IS NULL
      ORDER BY group_name ASC
    `).all<D1Row>();
  });

  const templatesResult = await db.prepare(`
    SELECT id, site_id, wave, post_name, slot_label, assigned_guard, deadline, active
    FROM shift_templates
    WHERE active = 1
  `).all<D1Row>();

  const targetGroupSetting = await db.prepare(
    "SELECT value FROM system_settings WHERE key = 'line_reminder_target_group_id'"
  ).first<{ value: string }>();
  const commandTargetGroupId = targetGroupSetting?.value || null;

  const templatesBySite = new Map<string, any[]>();
  (templatesResult.results || []).forEach((t: any) => {
    const list = templatesBySite.get(t.site_id) || [];
    list.push(t);
    templatesBySite.set(t.site_id, list);
  });

  const autoReplyResult = await db.prepare(
    "SELECT group_id, mode, sticker_package_id, sticker_id, cooldown_minutes FROM line_auto_reply_configs"
  ).all<D1Row>();
  const autoReplyByGroup = new Map<string, any>();
  (autoReplyResult.results || []).forEach((r: any) => {
    autoReplyByGroup.set(r.group_id, r);
  });

  // ดึงข้อความล่าสุดและ sender ของแต่ละกลุ่ม
  const latestEventsResult = await db.prepare(`
    SELECT group_id, MAX(received_at) AS last_report_at, sender_key, message_type
    FROM line_webhook_events
    WHERE event_type = 'message'
    GROUP BY group_id
  `).all<D1Row>().catch(() => ({ results: [] }));
  const latestEventByGroup = new Map<string, any>();
  (latestEventsResult.results || []).forEach((e: any) => {
    latestEventByGroup.set(e.group_id, e);
  });

  const now = bangkokNow();
  const currentNowMs = Date.parse(now.iso);
  const currentHour = Number(now.time.slice(0, 2));
  const isNightTime = currentHour >= 18 || currentHour < 6;

  const allRows = (groupsResult.results || []) as any[];

  const configs: any[] = [];
  const unmanagedGroups: any[] = [];

  allRows.forEach((g) => {
    if (!g.group_id) return;
    const templates = g.site_id ? templatesBySite.get(g.site_id) || [] : [];
    const morningShift = templates.find((t) => t.wave === "morning");
    const eveningShift = templates.find((t) => t.wave === "evening");
    const isConfigured = Boolean(g.site_id && g.site_active === 1 && (morningShift || eveningShift));
    const isCommandRoom = g.group_id === commandTargetGroupId;
    
    const replyConfig = autoReplyByGroup.get(g.group_id);
    const autoReplyEnabled = isCommandRoom ? false : (replyConfig ? replyConfig.mode !== "disabled" : true);

    const latestEvent = latestEventByGroup.get(g.group_id);
    const lastReportAt = latestEvent?.last_report_at || g.last_seen_at || null;
    const lastSender = latestEvent?.sender_key || null;

    let silentMinutes = 0;
    let silentHours = 0;
    if (lastReportAt) {
      const lastMs = Date.parse(lastReportAt);
      if (!isNaN(lastMs)) {
        silentMinutes = Math.max(0, Math.floor((currentNowMs - lastMs) / 60000));
        silentHours = Math.floor(silentMinutes / 60);
      }
    }

    const intervalHours = 2; // ค่าเริ่มต้นรอบตรวจ 2 ชม.

    // คำนวณสถานะกะปัจจุบัน (Shift-Aware State)
    let shiftState: "active_normal" | "active_silent" | "off_shift" = "active_normal";
    const isInActiveShift = isNightTime ? Boolean(eveningShift) : Boolean(morningShift);

    if (!isInActiveShift) {
      shiftState = "off_shift"; // อยู่นอกเวลากะ ไม่นับว่าเงียบ
    } else if (silentMinutes >= intervalHours * 60) {
      shiftState = "active_silent"; // อยู่ในเวลากะ และขาดการส่งเกินรอบตรวจ
    } else {
      shiftState = "active_normal"; // อยู่ในเวลากะ ส่งรายงานปกติ
    }

    const item = {
      groupId: g.group_id,
      groupName: g.group_name || `กลุ่ม ${g.group_id.slice(-6)}`,
      pictureUrl: g.picture_url,
      lastSeenAt: lastReportAt,
      lastSender,
      silentMinutes,
      silentHours,
      intervalHours,
      shiftState,
      isInActiveShift,
      currentWave: isNightTime ? "evening" : "morning",
      siteId: g.site_id,
      customerName: g.customer_name || "ยังไม่ระบุลูกค้า",
      hasMorningShift: Boolean(morningShift),
      morningDeadline: morningShift?.deadline || "07:00",
      morningGuard: morningShift?.assigned_guard || "",
      hasEveningShift: Boolean(eveningShift),
      eveningDeadline: eveningShift?.deadline || "19:00",
      eveningGuard: eveningShift?.assigned_guard || "",
      isConfigured,
      isCommandRoom,
      autoReplyEnabled,
    };

    configs.push(item);
    if (!isConfigured) {
      unmanagedGroups.push(item);
    }
  });

  const commandTargetGroup = allRows.find((r) => r.group_id === commandTargetGroupId);

  return {
    configs,
    unmanagedGroups,
    commandTargetGroupId,
    commandTargetGroupName: commandTargetGroup ? commandTargetGroup.group_name : null,
    currentWave: isNightTime ? "evening" : "morning",
    currentWaveLabel: isNightTime ? "ผลัดดึก (18:00 - 06:00)" : "ผลัดเช้า (06:00 - 18:00)",
    allGroups: allRows.map((r) => ({
      id: r.group_id,
      name: r.group_name || `กลุ่ม ${r.group_id.slice(-6)}`,
      pictureUrl: r.picture_url,
    })),
  };
}

export async function buildSilentGroupsAlertSummary(input?: { intervalHours?: number }) {
  await ensureDatabase();
  const db = database();
  const shiftData = await getShiftGroupConfigurations();
  const intervalHours = input?.intervalHours || 2;
  const now = bangkokNow();

  // กรองเฉพาะกลุ่มที่: อยู่ในเวลากะปฏิบัติงานจริง + ไม่ใช่กลุ่มสั่งการ + ขาดการรายงานเกินกำหนด
  const silentGroups = shiftData.configs.filter(
    (c) => c.isConfigured && !c.isCommandRoom && c.isInActiveShift && c.shiftState === "active_silent"
  );

  const waveName = shiftData.currentWave === "evening" ? "ผลัดดึก" : "ผลัดเช้า";

  const messageLines = [
    `🔇 แจ้งเตือนจุดที่ขาดการส่งรายงานเกินกำหนด (${waveName})`,
    `🕒 ณ เวลา ${now.time} น. (เกณฑ์รอบตรวจ: ทุก ${intervalHours} ชม.)`,
    `⚠️ พบจุดที่เงียบเกินกำหนด: ${silentGroups.length} จุด`,
    "",
    ...silentGroups.map((g, idx) => {
      const hours = g.silentHours;
      const mins = g.silentMinutes % 60;
      const timeAgoText = hours > 0 ? `${hours} ชม. ${mins} นาที` : `${mins} นาที`;
      return `${idx + 1}. ${g.groupName.slice(0, 45)} · ขาดส่งมาแล้ว ${timeAgoText}`;
    }),
    "",
    "กรุณาสายตรวจเข้าตรวจสอบจุดที่เงียบผิดปกติ",
    "— ALPHA Command Center",
  ];

  return {
    hasSilent: silentGroups.length > 0,
    silentCount: silentGroups.length,
    silentGroups,
    waveName,
    message: messageLines.join("\n").slice(0, 4900),
    commandTargetGroupId: shiftData.commandTargetGroupId,
  };
}

export async function sendSilentAlertToCommandRoom(actor = "admin") {
  const summary = await buildSilentGroupsAlertSummary();
  if (!summary.hasSilent) {
    return { ok: true, skipped: true, message: "ไม่มีจุดที่เงียบเกินกำหนดในรอบนี้" };
  }
  if (!summary.commandTargetGroupId) {
    return { ok: false, error: "ยังไม่ได้ระบุกลุ่มสั่งการ กรุณาเลือกกลุ่มสั่งการก่อน" };
  }

  const token = lineEnvironment().LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("ไม่พบ LINE Channel Access Token");

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: summary.commandTargetGroupId,
      messages: [{ type: "text", text: summary.message }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LINE Push Error: ${errText.slice(0, 200)}`);
  }

  await addAudit("line_reminder", summary.commandTargetGroupId, "silent_alert_sent", actor, `ส่งสรุปจุดเงียบ ${summary.silentCount} จุดเข้ากลุ่มสั่งการ`);
  return { ok: true, sent: true, count: summary.silentCount, message: `ส่งแจ้งเตือนจุดเงียบ ${summary.silentCount} จุดเข้ากลุ่มสั่งการเรียบร้อยแล้ว` };
}

export async function setGroupAutoReply(input: { groupId: string; enabled: boolean; actor?: string }) {
  await ensureDatabase();
  const db = database();
  const now = bangkokNow().iso;
  const mode = input.enabled ? "reply_on_new_report" : "disabled";

  await db.prepare(`
    INSERT INTO line_auto_reply_configs (group_id, mode, sticker_package_id, sticker_id, cooldown_minutes, updated_at)
    VALUES (?, ?, '11538', '51626520', 3, ?)
    ON CONFLICT(group_id) DO UPDATE SET mode = excluded.mode, updated_at = excluded.updated_at
  `).bind(input.groupId, mode, now).run();

  return { ok: true, groupId: input.groupId, enabled: input.enabled };
}

export async function setAllGroupsAutoReply(input: { enabled: boolean; actor?: string }) {
  await ensureDatabase();
  const db = database();
  const now = bangkokNow().iso;
  const mode = input.enabled ? "reply_on_new_report" : "disabled";

  const targetGroupSetting = await db.prepare("SELECT value FROM system_settings WHERE key = 'line_reminder_target_group_id'").first<{ value: string }>();
  const commandGroupId = targetGroupSetting?.value || null;

  const groupsResult = await db.prepare("SELECT id FROM line_group_registry").all();
  const groups = (groupsResult.results || []) as any[];

  for (const g of groups) {
    if (g.id === commandGroupId && input.enabled) continue; // Skip command group
    await db.prepare(`
      INSERT INTO line_auto_reply_configs (group_id, mode, sticker_package_id, sticker_id, cooldown_minutes, updated_at)
      VALUES (?, ?, '11538', '51626520', 3, ?)
      ON CONFLICT(group_id) DO UPDATE SET mode = excluded.mode, updated_at = excluded.updated_at
    `).bind(g.id, mode, now).run();
  }

  return { ok: true, count: groups.length, enabled: input.enabled, message: `${input.enabled ? "เปิด" : "ปิด"}ระบบตอบกลับสติกเกอร์ทุกกลุ่มเรียบร้อยแล้ว` };
}

export async function registerCustomGroup(input: { groupId: string; groupName: string; isCommandRoom?: boolean; actor?: string }) {
  await ensureDatabase();
  const db = database();
  const now = bangkokNow().iso;
  const groupId = input.groupId.trim();
  const groupName = input.groupName.trim() || `กลุ่ม ${groupId.slice(-6)}`;

  await db.prepare(`
    INSERT INTO line_group_registry (id, group_name, source, updated_at)
    VALUES (?, ?, 'manual', ?)
    ON CONFLICT(id) DO UPDATE SET group_name = excluded.group_name, updated_at = excluded.updated_at
  `).bind(groupId, groupName, now).run();

  if (input.isCommandRoom) {
    await setCommandTargetGroupId(groupId, input.actor || "admin");
    // Ensure auto reply is disabled for command group
    await db.prepare(`
      INSERT INTO line_auto_reply_configs (group_id, mode, updated_at)
      VALUES (?, 'disabled', ?)
      ON CONFLICT(group_id) DO UPDATE SET mode = 'disabled', updated_at = excluded.updated_at
    `).bind(groupId, now).run();
  }

  return { ok: true, groupId, groupName, message: `เพิ่ม/กู้คืนกลุ่ม "${groupName}" เข้าสู่ระบบเรียบร้อยแล้ว` };
}

export async function setCommandTargetGroupId(groupId: string, actor = "admin") {
  await ensureDatabase();
  const db = database();
  const now = bangkokNow().iso;

  await db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES ('line_reminder_target_group_id', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(groupId, now).run();

  // Disable auto reply for command group to guarantee NO stickers
  await db.prepare(`
    INSERT INTO line_auto_reply_configs (group_id, mode, updated_at)
    VALUES (?, 'disabled', ?)
    ON CONFLICT(group_id) DO UPDATE SET mode = 'disabled', updated_at = excluded.updated_at
  `).bind(groupId, now).run();

  const group = (await db.prepare("SELECT group_name FROM line_group_registry WHERE id = ?").bind(groupId).first()) as any;
  const groupName = group?.group_name || groupId;

  await addAudit("line_reminder", groupId, "command_group_selected", actor, `ตั้งกลุ่มสั่งการเป็น: ${groupName} (ปิดสติกเกอร์อัตโนมัติ 100%)`);
  return { ok: true, groupId, groupName, message: `ตั้งกลุ่มสั่งการเป็น "${groupName}" เรียบร้อยแล้ว (ปิดสติกเกอร์ในกลุ่มนี้ 100%)` };
}

export async function importSelectedLineGroups(groupIds: string[], actor = "admin") {
  await ensureDatabase();
  const db = database();
  const now = bangkokNow().iso;

  let count = 0;
  for (const groupId of groupIds) {
    await updateGroupShiftConfiguration({
      groupId,
      hasMorningShift: true,
      morningDeadline: "07:00",
      hasEveningShift: true,
      eveningDeadline: "19:00",
      actor,
    });
    count++;
  }

  await generateTodayFromTemplatesInternal(actor);
  return { ok: true, count, message: `นำเข้ากลุ่ม LINE เข้าสู่ระบบตรวจเวรแล้ว ${count} กลุ่ม` };
}

export async function updateGroupShiftConfiguration(input: {
  groupId: string;
  hasMorningShift: boolean;
  morningDeadline: string;
  morningGuard?: string;
  hasEveningShift: boolean;
  eveningDeadline: string;
  eveningGuard?: string;
  actor: string;
}) {
  await ensureDatabase();
  const db = database();
  const now = bangkokNow().iso;

  // หา site_id
  let group = (await db.prepare("SELECT site_id, group_name FROM line_groups WHERE id = ?").bind(input.groupId).first()) as any;
  if (!group || !group.site_id) {
    const registry = (await db.prepare("SELECT group_name, picture_url FROM line_group_registry WHERE id = ?").bind(input.groupId).first()) as any;
    const groupName = registry?.group_name || `กลุ่ม LINE ${input.groupId.slice(-6)}`;
    const siteId = linePointSiteIdentifier(input.groupId);
    
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO operational_sites (id, site_name, customer_name, active, created_at, updated_at) VALUES (?, ?, 'ยังไม่ระบุลูกค้า', 1, ?, ?)").bind(siteId, groupName, now, now),
      db.prepare("INSERT OR IGNORE INTO line_groups (id, site_id, group_name, picture_url, updated_at) VALUES (?, ?, ?, ?, ?)").bind(input.groupId, siteId, groupName, registry?.picture_url || null, now),
    ]);
    group = { site_id: siteId, group_name: groupName };
  }

  const siteId = group.site_id;
  const morningTemplateId = templateIdentifier(siteId, "morning", "จุดประจำ", "ช่อง 1");
  const eveningTemplateId = templateIdentifier(siteId, "evening", "จุดประจำ", "ช่อง 1");

  const operations = [
    // Morning shift
    db.prepare(`
      INSERT INTO shift_templates (id, site_id, wave, post_name, slot_label, assigned_guard, deadline, verification_policy, active, updated_at)
      VALUES (?, ?, 'morning', 'จุดประจำ', 'ช่อง 1', ?, ?, 'standard', ?, ?)
      ON CONFLICT(id) DO UPDATE SET 
        deadline = excluded.deadline,
        assigned_guard = excluded.assigned_guard,
        active = excluded.active,
        updated_at = excluded.updated_at
    `).bind(morningTemplateId, siteId, input.morningGuard || null, input.morningDeadline || "07:00", input.hasMorningShift ? 1 : 0, now),

    // Evening shift
    db.prepare(`
      INSERT INTO shift_templates (id, site_id, wave, post_name, slot_label, assigned_guard, deadline, verification_policy, active, updated_at)
      VALUES (?, ?, 'evening', 'จุดประจำ', 'ช่อง 1', ?, ?, 'standard', ?, ?)
      ON CONFLICT(id) DO UPDATE SET 
        deadline = excluded.deadline,
        assigned_guard = excluded.assigned_guard,
        active = excluded.active,
        updated_at = excluded.updated_at
    `).bind(eveningTemplateId, siteId, input.eveningGuard || null, input.eveningDeadline || "19:00", input.hasEveningShift ? 1 : 0, now),
  ];

  await db.batch(operations);
  await generateTodayFromTemplatesInternal(input.actor);
  await addAudit("shift_template", siteId, "shift_updated", input.actor, `แก้ไขเวลากะของกลุ่ม ${group.group_name}`);

  return { ok: true, message: `อัปเดตเวลากะของ ${group.group_name} สำเร็จแล้ว` };
}

export async function bulkApplyShiftPreset(input: {
  preset: "24h_07_19" | "24h_06_18" | "night_only_18" | "night_only_19" | "custom";
  morningDeadline?: string;
  eveningDeadline?: string;
  hasMorning?: boolean;
  hasEvening?: boolean;
  actor: string;
}) {
  await ensureDatabase();
  const db = database();
  const now = bangkokNow().iso;

  let hasMorning = true;
  let hasEvening = true;
  let morningTime = "07:00";
  let eveningTime = "19:00";

  if (input.preset === "24h_07_19") {
    hasMorning = true; hasEvening = true; morningTime = "07:00"; eveningTime = "19:00";
  } else if (input.preset === "24h_06_18") {
    hasMorning = true; hasEvening = true; morningTime = "06:00"; eveningTime = "18:00";
  } else if (input.preset === "night_only_18") {
    hasMorning = false; hasEvening = true; eveningTime = "18:00";
  } else if (input.preset === "night_only_19") {
    hasMorning = false; hasEvening = true; eveningTime = "19:00";
  } else if (input.preset === "custom") {
    hasMorning = input.hasMorning ?? true;
    hasEvening = input.hasEvening ?? true;
    morningTime = input.morningDeadline || "07:00";
    eveningTime = input.eveningDeadline || "19:00";
  }

  const groupsResult = await db.prepare("SELECT id, group_name FROM line_group_registry").all<D1Row>();
  const groups = (groupsResult.results || []) as any[];

  for (const g of groups) {
    await updateGroupShiftConfiguration({
      groupId: g.id,
      hasMorningShift: hasMorning,
      morningDeadline: morningTime,
      hasEveningShift: hasEvening,
      eveningDeadline: eveningTime,
      actor: input.actor,
    });
  }

  return {
    ok: true,
    message: `ตั้งค่าเวลากะสำเร็จครบทั้ง ${groups.length} กลุ่มเรียบร้อยแล้ว`,
  };
}

export async function buildMissingShiftAlertSummary(targetTime?: string) {
  await ensureDatabase();
  const db = database();
  const now = bangkokNow();
  const today = now.date;
  const currentMins = minuteFromTime(now.time);

  // ดึงสล็อตที่ถึงเวลาแล้วแต่ยังไม่ยืนยัน
  const slotsResult = await db.prepare(`
    SELECT * FROM coverage_slots 
    WHERE operational_date = ? AND state IN ('waiting', 'missing', 'unassigned')
    ORDER BY deadline ASC, site_name ASC
  `).bind(today).all<D1Row>();

  const allSlotsToday = await db.prepare(`
    SELECT COUNT(*) as total,
           COUNT(CASE WHEN state = 'confirmed' THEN 1 END) as confirmed
    FROM coverage_slots
    WHERE operational_date = ?
  `).bind(today).first<{ total: number; confirmed: number }>();

  const slots = (slotsResult.results || []) as any[];
  
  // กรองเฉพาะสล็อตที่เลยเวลากำหนด (deadline <= current time หรือตรงกับ targetTime)
  const missing = slots.filter((slot) => {
    if (targetTime && slot.deadline !== targetTime) return false;
    const deadlineMins = minuteFromTime(slot.deadline || "00:00");
    return currentMins >= deadlineMins;
  });

  if (!missing.length) {
    return {
      hasMissing: false,
      totalSites: allSlotsToday?.total || 0,
      confirmedSites: allSlotsToday?.confirmed || 0,
      missingCount: 0,
      message: `✅ จุดตรวจทั้งหมดเข้าเวรครบถ้วนเรียบร้อยแล้ว (${allSlotsToday?.confirmed || 0}/${allSlotsToday?.total || 0})`,
    };
  }

  // สร้างข้อความการ์ดสรุป
  const lines = [
    `🚨 [ศูนย์สั่งการ] แจ้งเตือนจุดที่ยังไม่รายงานตัวเข้าเวร`,
    `⏰ ข้อมูล ณ เวลา ${now.time} น. (${today})`,
    `━━━━━━━━━━━━━━━━━━`,
    `📊 ภาพรวม: เข้าเวรแล้ว ${allSlotsToday?.confirmed || 0}/${allSlotsToday?.total || 0} จุด (ขาด ${missing.length} จุด)`,
    `━━━━━━━━━━━━━━━━━━`,
    ``,
    `❌ รายชื่อจุดที่ยังไม่เข้าเวร:`,
  ];

  missing.slice(0, 25).forEach((slot, index) => {
    const deadlineMins = minuteFromTime(slot.deadline || "00:00");
    const late = Math.max(0, currentMins - deadlineMins);
    lines.push(`${index + 1}. ${slot.site_name} (${slot.deadline} น. - สาย ${late} นาที)`);
  });

  if (missing.length > 25) {
    lines.push(`... และอีก ${missing.length - 25} จุด`);
  }

  lines.push(``);
  lines.push(`⚠️ สายตรวจเขตพื้นที่ กรุณา ว.13 โทรเช็กหน้างานด่วนครับ`);

  return {
    hasMissing: true,
    totalSites: allSlotsToday?.total || 0,
    confirmedSites: allSlotsToday?.confirmed || 0,
    missingCount: missing.length,
    missingSlots: missing,
    message: lines.join("\n"),
  };
}

export async function sendShiftAlertToCommandRoom(actor = "system", targetGroupIdOverride?: string) {
  const token = lineEnvironment().LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE Channel Access Token is missing");

  const settings = await getLineReminderSettings();
  const targetGroupId = targetGroupIdOverride || settings.targetGroupId;
  if (!targetGroupId) {
    return { ok: false, error: "ยังไม่ได้ระบุกลุ่มไลน์ศูนย์สั่งการ (Target Command Group)" };
  }

  const summary = await buildMissingShiftAlertSummary();
  if (!summary.hasMissing) {
    return { ok: true, skipped: true, message: summary.message };
  }

  await pushLineText(targetGroupId, summary.message, token);
  await addAudit("line_reminder", targetGroupId, "shift_alert_sent", actor, `ส่งแจ้งเตือนจุดขาดเวร ${summary.missingCount} จุด เข้ากลุ่มสั่งการ`);

  return {
    ok: true,
    sent: true,
    missingCount: summary.missingCount,
    targetGroupId,
    message: summary.message,
  };
}

export async function discoverAndRecoverAllGroups() {
  await ensureDatabase();
  const db = database();
  const token = lineEnvironment().LINE_CHANNEL_ACCESS_TOKEN;
  const now = bangkokNow().iso;

  // 1. ดึงกลุ่มทั้งหมดจาก line_webhook_events
  const eventRows = await db.prepare(`
    SELECT group_id, MAX(received_at) AS last_seen_at, COUNT(*) AS event_count
    FROM line_webhook_events
    WHERE group_id IS NOT NULL AND group_id != ''
    GROUP BY group_id
    ORDER BY last_seen_at DESC
  `).all<D1Row>().catch(() => ({ results: [] }));

  // 2. ดึงกลุ่มที่มีใน registry
  const regRows = await db.prepare(`
    SELECT id, group_name, picture_url, last_seen_at
    FROM line_group_registry
  `).all<D1Row>().catch(() => ({ results: [] }));
  const regMap = new Map<string, any>();
  (regRows.results || []).forEach((r: any) => regMap.set(r.id, r));

  const allFoundGroups: Array<{
    groupId: string;
    groupName: string;
    pictureUrl: string | null;
    lastSeenAt: string | null;
    eventCount: number;
    isCommandCandidate: boolean;
  }> = [];

  const seenIds = new Set<string>();

  // วนลูปกลุ่มจาก webhook events
  for (const er of eventRows.results || []) {
    const rawId = String(er.group_id || "").trim();
    const cleanId = sanitizeLineId(rawId);
    if (!cleanId || seenIds.has(cleanId)) continue;
    seenIds.add(cleanId);

    const reg = regMap.get(cleanId);
    let groupName = reg?.group_name || `กลุ่ม ${cleanId.slice(-6)}`;
    let pictureUrl = reg?.picture_url || null;

    if (token && (!reg || isPlaceholderLineGroupName(groupName, cleanId))) {
      try {
        const profile = await fetchLineGroupProfile(cleanId, token);
        if (profile?.groupName) {
          groupName = profile.groupName;
          pictureUrl = profile.pictureUrl || pictureUrl;
        }
      } catch {
        // ignore
      }
    }

    await db.prepare(`
      INSERT INTO line_group_registry (id, group_name, picture_url, last_seen_at, source, updated_at)
      VALUES (?, ?, ?, ?, 'webhook', ?)
      ON CONFLICT(id) DO UPDATE SET group_name = excluded.group_name, picture_url = COALESCE(excluded.picture_url, line_group_registry.picture_url), last_seen_at = excluded.last_seen_at, updated_at = excluded.updated_at
    `).bind(cleanId, groupName, pictureUrl, er.last_seen_at || now, now).run().catch(() => {});

    const isCommandCandidate = /สายตรวจ|สนง|สำนักงาน|COP|Command|ศูนย์/i.test(groupName);

    allFoundGroups.push({
      groupId: cleanId,
      groupName,
      pictureUrl,
      lastSeenAt: er.last_seen_at ? String(er.last_seen_at) : null,
      eventCount: Number(er.event_count || 0),
      isCommandCandidate,
    });
  }

  // วนลูปกลุ่มที่อยู่ใน registry แต่ไม่มีใน webhook events
  for (const rr of regRows.results || []) {
    const cleanId = sanitizeLineId(String(rr.id || ""));
    if (!cleanId || seenIds.has(cleanId)) continue;
    seenIds.add(cleanId);
    const groupName = String(rr.group_name || `กลุ่ม ${cleanId.slice(-6)}`);
    const isCommandCandidate = /สายตรวจ|สนง|สำนักงาน|COP|Command|ศูนย์/i.test(groupName);
    allFoundGroups.push({
      groupId: cleanId,
      groupName,
      pictureUrl: rr.picture_url ? String(rr.picture_url) : null,
      lastSeenAt: rr.last_seen_at ? String(rr.last_seen_at) : null,
      eventCount: 0,
      isCommandCandidate,
    });
  }

  allFoundGroups.sort((a, b) => Number(b.isCommandCandidate) - Number(a.isCommandCandidate) || String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || "")));

  return allFoundGroups;
}