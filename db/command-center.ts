import { getFirebaseD1Database } from "../lib/firebase-d1.ts";
import { createHash, randomUUID } from "node:crypto";

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

let cachedDynamicToken: string | null = null;

export function setCachedLineToken(token: string | null) {
  cachedDynamicToken = token;
}

export async function getEffectiveLineToken(): Promise<string | null> {
  if (cachedDynamicToken) return cachedDynamicToken;
  try {
    const db = database();
    const tokenSetting = await db.prepare("SELECT value FROM system_settings WHERE key = 'line_channel_access_token'").first<D1Row>();
    if (tokenSetting?.value) {
      const val = String(tokenSetting.value).trim();
      if (val) {
        cachedDynamicToken = val;
        return val;
      }
    }
  } catch {}
  const envToken = lineEnvironment().LINE_CHANNEL_ACCESS_TOKEN;
  if (envToken) return envToken.trim();
  return null;
}

function lineEnvironment() {
  const processEnv = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
  const channelAccessToken = cachedDynamicToken || (env as Record<string, string>).LINE_CHANNEL_ACCESS_TOKEN || processEnv.LINE_CHANNEL_ACCESS_TOKEN;
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

export function minuteFromTime(time: string) {
  const bits = time.split(":");
  return Number(bits[0]) * 60 + Number(bits[1]);
}

export function deadlineMinute(deadline: string) {
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
    db.prepare("CREATE TABLE IF NOT EXISTS line_webhook_events (id TEXT PRIMARY KEY, group_id TEXT, event_type TEXT NOT NULL, message_type TEXT, sender_key TEXT, raw_user_id TEXT, received_at TEXT NOT NULL, summary TEXT NOT NULL)"),
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
    db.prepare(`CREATE TABLE IF NOT EXISTS guard_profiles (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      guard_name TEXT NOT NULL,
      display_name TEXT,
      picture_url TEXT,
      phone_number TEXT,
      preferred_shift TEXT NOT NULL DEFAULT 'all',
      role TEXT NOT NULL DEFAULT 'regular',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS employer_inquiries (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      site_name TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      sender_key TEXT,
      message_text TEXT NOT NULL,
      urgency TEXT NOT NULL DEFAULT 'p3_general',
      category TEXT NOT NULL DEFAULT 'general',
      status TEXT NOT NULL DEFAULT 'pending',
      acknowledged_by TEXT,
      acknowledged_at TEXT,
      dispatched_at TEXT,
      resolved_at TEXT,
      received_at TEXT NOT NULL
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
    db.prepare("CREATE INDEX IF NOT EXISTS idx_guard_profiles_site ON guard_profiles(site_id, active)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_employer_inquiries_urgency_time ON employer_inquiries(urgency, status, received_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_employer_inquiries_group_time ON employer_inquiries(group_id, received_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_line_events_group_time ON line_webhook_events(group_id, received_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_line_events_type_time ON line_webhook_events(event_type, received_at)"),
    db.prepare("ALTER TABLE line_webhook_events ADD COLUMN message_type TEXT"),
    db.prepare("ALTER TABLE line_webhook_events ADD COLUMN sender_key TEXT"),
    db.prepare("ALTER TABLE line_webhook_events ADD COLUMN raw_user_id TEXT"),
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

export async function syncTodayCoverageSlotsFromTemplates(operationalDate?: string) {
  const db = database();
  const now = bangkokNow();
  const date = operationalDate || now.date;
  const nowIso = now.iso;

  // 1. Fetch active shift templates joined with active site names
  const templatesResult = await db.prepare(`
    SELECT st.*, os.site_name, os.customer_name 
    FROM shift_templates st
    JOIN operational_sites os ON st.site_id = os.id
    WHERE st.active = 1 AND os.active = 1
  `).all<D1Row>();

  const templates = (templatesResult.results || []) as any[];
  const operations: any[] = [];

  for (const t of templates) {
    const slotId = `slot-${date}-${t.wave}-${t.site_id}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    const cleanDeadline = String(t.deadline || (t.wave === "morning" ? "07:00" : "19:00")).trim();
    const assignedGuard = t.assigned_guard ? String(t.assigned_guard).trim() : null;

    // Update deadline and metadata on existing slots for this site/wave/date
    operations.push(
      db.prepare(`
        UPDATE coverage_slots 
        SET deadline = ?, 
            site_name = ?, 
            customer_name = ?,
            post_name = ?,
            slot_label = ?,
            assigned_guard = COALESCE(coverage_slots.assigned_guard, ?),
            updated_at = ?
        WHERE site_id = ? AND wave = ? AND operational_date = ?
      `).bind(
        cleanDeadline, 
        String(t.site_name), 
        String(t.customer_name), 
        String(t.post_name || "จุดประจำ"),
        String(t.slot_label || "ช่อง 1"),
        assignedGuard, 
        nowIso, 
        String(t.site_id), 
        String(t.wave), 
        date
      )
    );

    // Insert slot if it does not exist yet today
    operations.push(
      db.prepare(`
        INSERT OR IGNORE INTO coverage_slots (
          id, operational_date, wave, site_id, site_name, customer_name,
          post_name, slot_label, assigned_guard, assignment_type,
          state, verification_policy, deadline, reported_at, source, late_minutes, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, 'regular',
          'waiting', 'standard', ?, NULL, NULL, 0, ?
        )
      `).bind(
        slotId,
        date,
        String(t.wave),
        String(t.site_id),
        String(t.site_name),
        String(t.customer_name),
        String(t.post_name || "จุดประจำ"),
        String(t.slot_label || "ช่อง 1"),
        assignedGuard,
        cleanDeadline,
        nowIso
      )
    );
  }

  for (let offset = 0; offset < operations.length; offset += 50) {
    await db.batch(operations.slice(offset, offset + 50));
  }

  // 2. Prune today's unconfirmed slots (waiting, missing, unassigned) for deactivated or removed shift templates
  await db.prepare(`
    DELETE FROM coverage_slots
    WHERE operational_date = ?
      AND state IN ('waiting', 'missing', 'unassigned')
      AND NOT EXISTS (
        SELECT 1 FROM shift_templates st
        JOIN operational_sites os ON st.site_id = os.id
        WHERE st.site_id = coverage_slots.site_id
          AND st.wave = coverage_slots.wave
          AND st.active = 1
          AND os.active = 1
      )
  `).bind(date).run().catch(() => {});
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
    const templateId = templateIdentifier(siteId, wave, postName, slotLabel);
    if (enabled) {
      operations.push(db.prepare("INSERT INTO shift_templates (id, site_id, wave, post_name, slot_label, assigned_guard, deadline, verification_policy, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'standard', 1, ?) ON CONFLICT(id) DO UPDATE SET assigned_guard = excluded.assigned_guard, deadline = excluded.deadline, active = 1, updated_at = excluded.updated_at")
        .bind(templateId, siteId, wave, postName, slotLabel, guard?.trim() || null, deadline, now));
    } else {
      operations.push(
        db.prepare("UPDATE shift_templates SET active = 0, updated_at = ? WHERE site_id = ? AND wave = ?")
          .bind(now, siteId, wave),
        db.prepare("DELETE FROM coverage_slots WHERE site_id = ? AND wave = ? AND state = 'waiting'")
          .bind(siteId, wave)
      );
    }
  };
  addTemplate("morning", input.morningEnabled !== false, input.morningGuard, morningDeadline);
  addTemplate("evening", input.eveningEnabled !== false, input.eveningGuard, eveningDeadline);
  await db.batch(operations);
  await syncTodayCoverageSlotsFromTemplates();
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
  await syncTodayCoverageSlotsFromTemplates();
  await addAudit("line_point", "bulk", "enabled", actor, `เปิดใช้งานกลุ่ม LINE เป็นกลุ่มหลัก ${activated + alreadyActive} จุด · เติมกะ ${initialized} รายการ · ข้าม ${skipped} กลุ่ม`);
  return { activated, alreadyActive, initialized, skipped, generated: 0, total: activated + alreadyActive };
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
  rawUserId?: string;
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
    db.prepare("INSERT OR IGNORE INTO line_webhook_events (id, group_id, event_type, message_type, sender_key, raw_user_id, received_at, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(eventId, groupId, input.eventType.slice(0, 48), input.messageType?.slice(0, 32) || null, input.senderKey?.slice(0, 32) || null, input.rawUserId?.slice(0, 64) || null, receivedAt, "Webhook ที่ตรวจสอบลายเซ็นแล้ว; ไม่เก็บข้อความในกลุ่ม"),
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
  return operations.length;
}

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
// 4-LAYER GUARD & SHIFT HANDOVER INTELLIGENCE ENGINE
// ---------------------------------------------------------------------------

// 1. คำที่บ่งบอกว่าเป็นการออกเวร/ส่งมอบเวรของกะเดิม (Outgoing Shift / Leaving Handover)
const SHIFT_LEAVE_KEYWORDS = [
  "ออกเวร", "เลิกงาน", "เลิกกะ", "ลงเวร", "หมดกะ", "หมดเวลา", "กลับบ้าน", 
  "ส่งเวร", "ส่งมอบแล้ว", "ส่งมอบงาน", "กลับแล้ว", "บ๊ายบาย", "จบกะ", "ส่งมอบหน้าที่", "เลิกผลัด"
];

// 2. คำที่บ่งบอกว่าเป็นการคุยงานของนายจ้าง / ลูกค้า / นิติบุคคล / ลูกบ้าน (Client / Employer Phrases)
const CLIENT_EMPLOYER_KEYWORDS = [
  "ฝากดู", "แจ้งเรื่อง", "ช่วยดู", "ทำไม", "รปภ.อยู่ไหน", "นิติ", "ช่าง", 
  "พัสดุ", "กุญแจ", "ประตูค้าง", "น้ำรั่ว", "ขยะ", "ลูกค้า", "ร้องเรียน", 
  "ขอความร่วมมือ", "ที่จอดรถ", "บอร์ด", "กรรมการ", "ช่วยตาม", "เช็คกล้อง", "ทำไมไม่มีรปภ", "รปภไปไหน"
];

// 3. คำที่ รปภ. มักใช้เมื่อเข้าเวร/รับมอบเวร (Incoming Guard Check-in Phrases)
const GUARD_ENTER_KEYWORDS = [
  "รับมอบเวร", "รับเวร", "เข้าเวร", "พร้อมปฏิบัติหน้าที่", "ว.4", "ว4", 
  "ผลัด1", "ผลัด2", "ผลัดเช้า", "ผลัดดึก", "เข้าจุด", "ประจำจุด", "เริ่มงาน", 
  "รายงานผลัด", "รายงานเข้าเวร", "เข้าป้อม", "สแตนด์บาย", "standby", "เหตุการณ์ปกติ",
  "มาแล้ว", "ถึงแล้ว", "ป้อมหน้า", "ป้อมหลัง"
];

async function isEstablishedGuardSender(db: any, groupId: string, senderKey?: string): Promise<boolean> {
  if (!senderKey) return false;
  try {
    const countRow = (await db.prepare(`
      SELECT COUNT(*) as count 
      FROM line_webhook_events 
      WHERE group_id = ? AND sender_key = ?
    `).bind(groupId, senderKey).first()) as { count?: number } | null;

    return (countRow?.count || 0) >= 2;
  } catch {
    return false;
  }
}

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

    // 3. ตรวจสอบว่ามีสล็อตไหนอยู่ในกรอบเวลาเข้าเวร (กะดึก: อนุญาตก่อนเวลาไม่เกิน 30 นาที ยกเว้นมีคำว่า ว.4/รับมอบเวร)
    for (const slot of slots) {
      const deadlineMins = minuteFromTime(slot.deadline || "18:00");
      const cleanText = input.text ? input.text.toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]/g, "") : "";

      // LAYER 1: ตรวจจับคำออกเวรของกะเดิม (Outgoing Handover Filter)
      const isLeavingText = cleanText && SHIFT_LEAVE_KEYWORDS.some((kw) => {
        const cleanKw = kw.toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]/g, "");
        return cleanText.includes(cleanKw);
      });

      if (isLeavingText) {
        // กะเดิมพิมพ์ออกเวร -> ไม่นับเป็นเข้าเวรของกะใหม่! แต่บันทึกโน้ตไว้ว่ากะเก่าส่งเวรแล้ว
        await addAudit(
          "coverage_slot",
          slot.id,
          "shift_handover_out",
          "LINE Webhook (Outgoing)",
          `กะเก่าส่งเวร/ออกเวรจุด ${slot.site_name} (สถานะ: รอกะใหม่มารับมอบ)`
        );
        continue; // ข้ามการยืนยันสล็อตนี้ เพื่อรอกะใหม่มารายงานตัว
      }

      // LAYER 2: ตรวจจับภาษาลูกค้า/นายจ้าง (Anti-Employer/Client Filter)
      const employerCheck = input.text ? classifyEmployerMessage(input.text) : null;
      const isClientText = Boolean(employerCheck?.isUrgent) || (cleanText && CLIENT_EMPLOYER_KEYWORDS.some((kw) => {
        const cleanKw = kw.toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]/g, "");
        return cleanText.includes(cleanKw);
      }));

      if (isClientText) {
        // ลูกค้า/นายจ้างพิมพ์ข้อความ/สั่งงาน -> ไม่นำมานับเข้าเวรเด็ดขาด!
        continue;
      }

      // LAYER 3: ตรวจสอบคำเฉพาะของ รปภ. (Guard-Exclusive Enter Keywords)
      const hasGuardEnterKeyword = cleanText && GUARD_ENTER_KEYWORDS.some((kw) => {
        const cleanKw = kw.toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]/g, "");
        return cleanText.includes(cleanKw);
      });

      // LAYER 4: ตรวจสอบรูปภาพ + กรอบเวลาที่สมจริง (Realistic Shift Check-in Window)
      // กะเช้า: รองรับการรายงานตัวตั้งแต่ 05:00 ถึงช่วงสาย
      // กะดึก: รองรับการรายงานตัวตั้งแต่ 16:30 ถึงช่วงดึก
      const isMorningSlot = slot.wave === "morning";
      const isEveningSlot = slot.wave === "evening";

      let inShiftTimeWindow = false;
      if (isMorningSlot) {
        // ผลัดเช้า (05:00 - 12:00)
        inShiftTimeWindow = currentMinutes >= (5 * 60) && currentMinutes <= (12 * 60);
      } else if (isEveningSlot) {
        // ผลัดดึก (16:30 - 23:59 หรือ 00:00 - 05:00)
        inShiftTimeWindow = currentMinutes >= (16 * 60 + 30) || currentMinutes <= (5 * 60);
      } else {
        const windowStart = hasGuardEnterKeyword ? deadlineMins - 120 : deadlineMins - 90;
        const windowEnd = deadlineMins + 360;
        inShiftTimeWindow = currentMinutes >= windowStart && currentMinutes <= windowEnd;
      }

      if (!inShiftTimeWindow) {
        // อยู่นอกกรอบเวลารายงานตัวเข้าเวรของกะนี้ ข้ามไป
        continue;
      }

      const isPhotoOrLocation = input.messageType === "image" || input.messageType === "location" || Boolean(input.messageType?.startsWith("image"));
      const isGuardSender = await isEstablishedGuardSender(db, input.groupId, input.senderKey);

      // ตรวจสอบข้อมูลผู้ส่งจากทำเนียบ (รปภ. ประจำ / สแปร์กลาง / นายจ้าง)
      let registeredGuard: any = null;
      if (input.senderKey) {
        registeredGuard = (await db.prepare(`
          SELECT guard_name, role, site_id FROM guard_profiles 
          WHERE active = 1 AND (display_name = ? OR id = ?) AND (site_id = ? OR site_id = 'all' OR role = 'spare' OR role = 'employer')
          LIMIT 1
        `).bind(input.senderKey, input.senderKey, group.site_id).first()) as any;
      }

      // ถ้านายจ้างส่งข้อความหรือรูปภาพ ห้ามนำมานับเป็นการเข้าเวรของ รปภ. เด็ดขาด
      if (registeredGuard?.role === "employer") {
        continue;
      }

      // เงื่อนไขในการยืนยันเข้าเวร:
      // 1. มีคีย์เวิร์ดของ รปภ. ชัดเจน (เช่น "ว.4", "รับมอบเวร", "เข้าเวร")
      // 2. หรือ ส่งรูปภาพในช่วง 30 นาทีรอบเวลาเริ่มกะ (17:30 - 18:30) โดยไม่ใช่ข้อความนายจ้าง
      const shouldConfirm = hasGuardEnterKeyword || (isPhotoOrLocation && !cleanText) || (isPhotoOrLocation && isGuardSender && !isClientText);

      if (shouldConfirm) {
        const lateMins = Math.max(0, currentMinutes - deadlineMins);
        
        const isSpareExplicit = cleanText && (/สแปร์|แทน|แทนเวร|สแปร์แทน/.test(cleanText));
        const isSpare = isSpareExplicit || registeredGuard?.role === "spare" || registeredGuard?.site_id === "all";
        const guardName = registeredGuard?.guard_name || slot.assigned_guard;

          let guardTypeLabel = isSpare 
            ? (guardName ? `สแปร์แทนเวร: ${guardName}` : "สแปร์แทนเวร") 
            : (guardName ? `ประจำ (${guardName})` : "ประจำจุด");

          let sourceText = `LINE รายงานตัว (${guardTypeLabel})`;
          if (hasGuardEnterKeyword) {
            sourceText = isSpare ? `LINE สแปร์เข้าแทนเวร (ว.4: ${guardName || "สแปร์"})` : `LINE รับมอบเวร (ว.4: ${guardTypeLabel})`;
          } else if (isPhotoOrLocation && isGuardSender) {
            sourceText = `LINE ภาพถ่าย รปภ. (${guardTypeLabel})`;
          } else if (isPhotoOrLocation) {
            sourceText = `LINE ส่งรูปถ่ายเข้าจุด (${guardTypeLabel})`;
          }

          await db.prepare(`
            UPDATE coverage_slots 
            SET state = 'confirmed',
                reported_at = ?,
                source = ?,
                late_minutes = ?,
                updated_at = ?
            WHERE id = ?
          `).bind(now.time, sourceText, lateMins, now.iso, slot.id).run();

          await addAudit(
            "coverage_slot", 
            slot.id, 
            isSpareExplicit ? "shift_checked_in_spare" : "shift_checked_in_regular", 
            "LINE Webhook Multi-Guard Engine", 
            `รปภ. เข้าเวรจุด ${slot.site_name} (${slot.post_name || "ป้อมประจำ"}) [${guardTypeLabel}] เวลา ${now.time}${lateMins > 0 ? ` (สาย ${lateMins} นาที)` : " (ตรงเวลา)"} · ${sourceText}`
          );

          return { 
            checkedIn: true, 
            siteName: slot.site_name, 
            deadline: slot.deadline, 
            lateMinutes: lateMins 
          };
        }
      }

    return { checkedIn: false };
  } catch (err) {
    return { checkedIn: false };
  }
}

export async function confirmSlotById(input: {
  slotId: string;
  guardType?: "regular" | "spare";
  spareName?: string;
  actor?: string;
}) {
  await ensureDatabase();
  const db = database();
  const now = bangkokNow();
  const actor = input.actor || "LINE 1-Click Button";
  const guardType = input.guardType || "regular";

  const slot = (await db.prepare("SELECT * FROM coverage_slots WHERE id = ?").bind(input.slotId).first()) as any;
  if (!slot) return { ok: false, message: "ไม่พบข้อมูลจุดตรวจนี้ในระบบ" };

  const deadlineMins = minuteFromTime(slot.deadline || "00:00");
  const currentMins = minuteFromTime(now.time);
  const lateMinutes = Math.max(0, currentMins - deadlineMins);

  const guardTitle = guardType === "spare" 
    ? (input.spareName ? `รปภ. สแปร์แทน (${input.spareName})` : "รปภ. สแปร์แทนเวร")
    : (slot.assigned_guard ? `รปภ. ประจำ (${slot.assigned_guard})` : "รปภ. ประจำจุด");

  const sourceText = `LINE 1-Click (${guardTitle})`;

  await db.prepare(`
    UPDATE coverage_slots 
    SET state = 'confirmed',
        reported_at = ?,
        source = ?,
        late_minutes = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(now.time, sourceText, lateMinutes, now.iso, input.slotId).run();

  await addAudit(
    "coverage_slot",
    input.slotId,
    guardType === "spare" ? "shift_confirmed_spare" : "shift_confirmed_regular",
    actor,
    `กดเช็คเข้าเวรจุด ${slot.site_name} (${slot.post_name || "ป้อมหลัก"}) [${guardTitle}] เวลา ${now.time} น.`
  );

  return {
    ok: true,
    siteName: slot.site_name,
    postName: slot.post_name,
    guardTitle,
    deadline: slot.deadline,
    wave: slot.wave,
    message: [
      `✅ [ALPHA COP] ยืนยันเข้าเวรสำเร็จ!`,
      `🏢 จุด: ${slot.site_name} · ${slot.post_name || "ป้อมประจำ"}`,
      `👮 สถานะกำลังพล: ${guardTitle}`,
      `⏰ เวลาบันทึก: ${now.time} น. (${lateMinutes > 0 ? `สาย ${lateMinutes} นาที` : "ตรงเวลา"})`,
      `👤 ผู้ยืนยัน: ${actor}`,
      `━━━━━━━━━━━━━━━━━━`,
      `ระบบบันทึกยอดกำลังพลเรียบร้อยแล้วครับ 🫡`,
    ].join("\n"),
  };
}

export async function batchApproveSlotsWithPhotos(input?: {
  wave?: "morning" | "evening" | "all";
  actor?: string;
}) {
  await ensureDatabase();
  const db = database();
  const now = bangkokNow();
  const today = now.date;
  const currentHour = Number(now.time.slice(0, 2));
  const wave = input?.wave || (currentHour >= 16 || currentHour < 5 ? "evening" : "morning");
  const actor = input?.actor || "สายตรวจ (อนุมัติภาพถ่ายทั้งหมด 1-Tap)";

  let query = `
    SELECT * FROM coverage_slots 
    WHERE operational_date = ? AND state IN ('waiting', 'missing', 'unassigned')
  `;
  const params: any[] = [today];
  if (wave !== "all") {
    query += ` AND wave = ?`;
    params.push(wave);
  }

  const slotsResult = await db.prepare(query).bind(...params).all<D1Row>();
  const slots = (slotsResult.results || []) as any[];

  if (!slots.length) {
    return {
      ok: true,
      count: 0,
      message: `✅ จุดตรวจของกะนี้เข้าเวรครบถ้วนเรียบร้อยแล้วทั้งหมดครับ`,
    };
  }

  // อนุมัติผ่านทั้งหมด
  for (const slot of slots) {
    const deadlineMins = minuteFromTime(slot.deadline || "00:00");
    const currentMins = minuteFromTime(now.time);
    const lateMinutes = Math.max(0, currentMins - deadlineMins);
    const guardTitle = slot.assigned_guard ? `รปภ. ประจำ (${slot.assigned_guard})` : "รปภ. ประจำจุด";

    await db.prepare(`
      UPDATE coverage_slots 
      SET state = 'confirmed',
          reported_at = ?,
          source = ?,
          late_minutes = ?,
          updated_at = ?
      WHERE id = ?
    `).bind(now.time, `1-Tap อนุมัติภาพถ่าย (${guardTitle})`, lateMinutes, now.iso, slot.id).run();

    await addAudit(
      "coverage_slot",
      slot.id,
      "shift_batch_approved",
      actor,
      `สายตรวจแตะอนุมัติเข้าเวรทั้งผลัดจุด ${slot.site_name} (${slot.post_name || "ป้อมประจำ"}) เวลา ${now.time} น.`
    );
  }

  const waveLabel = wave === "evening" ? "ผลัดดึก" : "ผลัดเช้า";

  return {
    ok: true,
    count: slots.length,
    wave,
    message: [
      `⚡ [ALPHA COP] สายตรวจอนุมัติเข้าเวรทั้งผลัดสำเร็จ!`,
      `🕒 รอบเวลา: ${waveLabel} (${now.time} น.)`,
      `👥 ยืนยันกำลังพลผ่านทั้งหมด: ${slots.length} นาย`,
      `👤 ผู้ยืนยัน: ${actor}`,
      `━━━━━━━━━━━━━━━━━━`,
      `ระบบบันทึกยอดกำลังพลขึ้นบอร์ดควบคุม 100% เรียบร้อยแล้วครับ 🫡`,
    ].join("\n"),
  };
}

export async function buildShiftAttendanceFlexMessage(input?: { wave?: "morning" | "evening" | "all"; targetTime?: string }) {
  const summary = await buildMissingShiftAlertSummary(input);
  const now = bangkokNow();
  const today = now.date;

  const isClear = !summary.hasMissing;
  const headerBgColor = isClear ? "#059669" : summary.wave === "evening" ? "#4f46e5" : "#d97706";
  const headerTitle = isClear 
    ? "✅ กำลังพลเข้าเวรครบถ้วน 100%" 
    : `🚨 สรุปกำลังพลค้างเข้าเวร (${summary.wave === "evening" ? "ผลัดดึก" : "ผลัดเช้า"})`;

  // สร้างแถวรายการจุดที่ขาดพร้อมปุ่มกด Postback 2 ปุ่ม: [ประจำ] และ [สแปร์แทน]
  const missingRows: any[] = [];
  
  if (summary.hasMissing && summary.missingSlots) {
    summary.missingSlots.slice(0, 10).forEach((slot: any, idx: number) => {
      const deadline = slot.deadline || "00:00";
      const postLabel = slot.post_name ? ` · ${slot.post_name}` : "";
      const guardLabel = slot.assigned_guard ? ` (ประจำ: ${slot.assigned_guard})` : "";

      missingRows.push({
        type: "box",
        layout: "vertical",
        paddingAll: "10px",
        backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
        cornerRadius: "8px",
        margin: "6px",
        borderColor: "#e2e8f0",
        borderWidth: "1px",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: `${idx + 1}. ${slot.site_name}${postLabel}`,
                size: "sm",
                weight: "bold",
                color: "#0f172a",
                wrap: true,
                flex: 1,
              },
            ],
          },
          {
            type: "text",
            text: `⏰ กำหนด ${deadline} น.${guardLabel}`,
            size: "xxs",
            color: "#64748b",
            margin: "xs",
          },
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            margin: "sm",
            contents: [
              {
                type: "button",
                action: {
                  type: "postback",
                  label: "🔘 คนประจำ",
                  data: `action=checkin_regular&slotId=${slot.id}&siteName=${encodeURIComponent(slot.site_name)}`,
                  displayText: `ยืนยันคนประจำ ${slot.site_name}${postLabel}`,
                },
                style: "primary",
                color: "#0284c7",
                height: "sm",
                flex: 1,
              },
              {
                type: "button",
                action: {
                  type: "postback",
                  label: "🔄 สแปร์แทน",
                  data: `action=checkin_spare&slotId=${slot.id}&siteName=${encodeURIComponent(slot.site_name)}`,
                  displayText: `ยืนยันสแปร์แทน ${slot.site_name}${postLabel}`,
                },
                style: "secondary",
                color: "#475569",
                height: "sm",
                flex: 1,
              },
            ],
          },
        ],
      });
    });

    if (summary.missingSlots.length > 10) {
      missingRows.push({
        type: "text",
        text: `... และอีก ${summary.missingSlots.length - 10} นาย (ดูต่อในบอร์ดเว็บ)`,
        size: "xs",
        color: "#94a3b8",
        align: "center",
        margin: "md",
      });
    }
  }

  // ปุ่มกดอนุมัติทั้งผลัด 1-Tap ด้านบนการ์ด
  const batchApproveHeaderButton = summary.hasMissing ? [
    {
      type: "button",
      action: {
        type: "postback",
        label: `⚡ อนุมัติทั้งผลัด (${summary.missingCount} นาย)`,
        data: `action=batch_approve&wave=${summary.wave}`,
        displayText: `⚡ อนุมัติเข้าเวรทั้งผลัด (${summary.wave === "evening" ? "ผลัดดึก" : "ผลัดเช้า"})`,
      },
      style: "primary",
      color: "#16a34a",
      height: "sm",
      margin: "sm",
    },
  ] : [];

  const flexBubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: headerBgColor,
      paddingAll: "16px",
      contents: [
        {
          type: "text",
          text: headerTitle,
          weight: "bold",
          color: "#ffffff",
          size: "lg",
        },
        {
          type: "text",
          text: `⏰ ข้อมูล ณ ${now.time} น. (${today}) · เข้าแล้ว ${summary.confirmedSites}/${summary.totalSites} นาย`,
          color: "#e2e8f0",
          size: "xs",
          margin: "xs",
        },
        ...batchApproveHeaderButton,
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "12px",
      contents: isClear
        ? [
            {
              type: "text",
              text: `🎉 ยอดเยี่ยม! กำลังพลทุกจุดรายงานตัวครบถ้วน 100% เรียบร้อยแล้ว`,
              size: "sm",
              color: "#16a34a",
              weight: "bold",
              align: "center",
              margin: "md",
            },
          ]
        : [
            {
              type: "text",
              text: `❌ รายชื่อจุดและป้อมที่ยังค้างเข้าเวร (${summary.missingCount} นาย):`,
              size: "xs",
              weight: "bold",
              color: "#ef4444",
              margin: "none",
            },
            {
              type: "box",
              layout: "vertical",
              margin: "sm",
              contents: missingRows,
            },
          ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "10px",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          contents: [
            {
              type: "button",
              action: {
                type: "message",
                label: "☀️ สรุปกะเช้า",
                text: "สรุปกะเช้า",
              },
              style: "secondary",
              height: "sm",
            },
            {
              type: "button",
              action: {
                type: "message",
                label: "🌙 สรุปกะดึก",
                text: "สรุปกะดึก",
              },
              style: "secondary",
              height: "sm",
            },
          ],
        },
        {
          type: "button",
          action: {
            type: "uri",
            label: "📱 เปิดแผงตรวจสายตรวจ (มือถือ)",
            uri: "https://alpha-command-center-1--alphacommandcenter-d3341.asia-southeast1.hosted.app/?tab=patrol",
          },
          style: "primary",
          color: "#0284c7",
          height: "sm",
        },
      ],
    },
  };

  const flexMessage = {
    type: "flex",
    altText: summary.message.slice(0, 300),
    contents: flexBubble,
    quickReply: {
      items: [
        {
          type: "action",
          action: { type: "message", label: "☀️ สรุปกะเช้า", text: "สรุปกะเช้า" },
        },
        {
          type: "action",
          action: { type: "message", label: "🌙 สรุปกะดึก", text: "สรุปกะดึก" },
        },
        {
          type: "action",
          action: { type: "message", label: "🔄 อัปเดตสด", text: "สรุปเข้าเวร" },
        },
      ],
    },
  };

  return {
    ...summary,
    flexMessage,
  };
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

export async function discoverAndRecoverAllGroups() {
  await ensureDatabase();
  const db = database();
  const res = await db.prepare(`
    SELECT r.id, r.group_name, r.picture_url, r.updated_at
    FROM line_group_registry r
    ORDER BY r.updated_at DESC
  `).all<any>();
  return res.results || [];
}

export async function sendShiftAlertToCommandRoom(actor = "admin", targetGroupId?: string) {
  const summary = await buildMissingShiftAlertSummary();
  const flex = await buildShiftAttendanceFlexMessage();
  return {
    ok: true,
    sent: true,
    actor,
    targetGroupId,
    summary,
    flex,
  };
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

  await syncTodayCoverageSlotsFromTemplates();
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
    db.prepare(`
      INSERT INTO shift_templates (id, site_id, wave, post_name, slot_label, assigned_guard, deadline, verification_policy, active, updated_at)
      VALUES (?, ?, 'morning', 'จุดประจำ', 'ช่อง 1', ?, ?, 'standard', ?, ?)
      ON CONFLICT(id) DO UPDATE SET 
        deadline = excluded.deadline,
        assigned_guard = excluded.assigned_guard,
        active = excluded.active,
        updated_at = excluded.updated_at
    `).bind(morningTemplateId, siteId, input.morningGuard || null, input.morningDeadline || "07:00", input.hasMorningShift ? 1 : 0, now),

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

  if (!input.hasMorningShift) {
    operations.push(
      db.prepare("DELETE FROM coverage_slots WHERE site_id = ? AND wave = 'morning' AND state IN ('waiting', 'missing', 'unassigned')")
        .bind(siteId)
    );
  }

  if (!input.hasEveningShift) {
    operations.push(
      db.prepare("DELETE FROM coverage_slots WHERE site_id = ? AND wave = 'evening' AND state IN ('waiting', 'missing', 'unassigned')")
        .bind(siteId)
    );
  }

  await db.batch(operations);
  await syncTodayCoverageSlotsFromTemplates();
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

  await syncTodayCoverageSlotsFromTemplates();

  return {
    ok: true,
    message: `ตั้งค่าเวลากะสำเร็จครบทั้ง ${groups.length} กลุ่มเรียบร้อยแล้ว`,
  };
}

export async function buildMissingShiftAlertSummary(input?: { wave?: "morning" | "evening" | "all"; targetTime?: string }) {
  await ensureDatabase();
  const db = database();
  const now = bangkokNow();
  const today = now.date;
  const currentMins = minuteFromTime(now.time);
  const currentHour = Number(now.time.slice(0, 2));

  const wave = input?.wave || (currentHour >= 16 || currentHour < 5 ? "evening" : "morning");
  const waveLabel = wave === "evening" ? "🌙 ผลัดดึก (18:00 - 06:00)" : "☀️ ผลัดเช้า (06:00 - 18:00)";

  let query = `
    SELECT * FROM coverage_slots 
    WHERE operational_date = ? AND state IN ('waiting', 'missing', 'unassigned')
  `;
  const params: any[] = [today];

  if (wave !== "all") {
    query += ` AND wave = ?`;
    params.push(wave);
  }

  query += ` ORDER BY deadline ASC, site_name ASC`;

  const slotsResult = await db.prepare(query).bind(...params).all<D1Row>();

  let allQuery = `
    SELECT COUNT(*) as total,
           COUNT(CASE WHEN state = 'confirmed' THEN 1 END) as confirmed
    FROM coverage_slots
    WHERE operational_date = ?
  `;
  const allParams: any[] = [today];
  if (wave !== "all") {
    allQuery += ` AND wave = ?`;
    allParams.push(wave);
  }

  const allSlotsToday = await db.prepare(allQuery).bind(...allParams).first<{ total: number; confirmed: number }>();
  const slots = (slotsResult.results || []) as any[];

  const missing = slots.filter((slot) => {
    if (input?.targetTime && slot.deadline !== input.targetTime) return false;
    return true;
  });

  const totalCount = allSlotsToday?.total || 0;
  const confirmedCount = allSlotsToday?.confirmed || 0;

  if (!missing.length) {
    return {
      hasMissing: false,
      wave,
      waveLabel,
      totalSites: totalCount,
      confirmedSites: confirmedCount,
      missingCount: 0,
      missingSlots: [],
      message: [
        `✅ [ศูนย์สั่งการ ALPHA COP] รายงานสถานะเข้าเวร`,
        `${waveLabel}`,
        `⏰ ข้อมูล ณ เวลา ${now.time} น. (${today})`,
        `━━━━━━━━━━━━━━━━━━`,
        `🎉 จุดตรวจทั้งหมดเข้าเวรครบถ้วน 100% แล้วครับ (${confirmedCount}/${totalCount} จุด)`,
        `━━━━━━━━━━━━━━━━━━`,
      ].join("\n"),
    };
  }

  const lines = [
    `🚨 [ศูนย์สั่งการ ALPHA COP] แจ้งเตือนจุดค้างเข้าเวร`,
    `${waveLabel}`,
    `⏰ ข้อมูล ณ เวลา ${now.time} น. (${today})`,
    `━━━━━━━━━━━━━━━━━━`,
    `📊 ภาพรวม: เข้าแล้ว ${confirmedCount}/${totalCount} นาย · ค้าง ${missing.length} นาย`,
    `━━━━━━━━━━━━━━━━━━`,
    ``,
    `❌ รายชื่อจุดและป้อมที่ยังไม่มีรายงานเข้าเวร:`,
  ];

  missing.slice(0, 30).forEach((slot, index) => {
    const deadlineMins = minuteFromTime(slot.deadline || "00:00");
    const diff = currentMins - deadlineMins;
    const timeStatus = diff > 0 ? `(สาย ${diff} นาที)` : `(กำหนด ${slot.deadline} น.)`;
    const post = slot.post_name ? ` · ${slot.post_name}` : "";
    const guard = slot.assigned_guard ? ` [ประจำ: ${slot.assigned_guard}]` : "";
    lines.push(`${index + 1}. ${slot.site_name}${post}${guard} ${timeStatus}`);
  });

  if (missing.length > 30) {
    lines.push(`... และอีก ${missing.length - 30} นาย`);
  }

  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━`);
  lines.push(`💡 วิธียืนยันผ่านไลน์:`);
  lines.push(`- คนประจำมา: พิมพ์ "ยืนยัน [ลำดับหรือชื่อจุด]" เช่น "ยืนยัน 1"`);
  lines.push(`- สแปร์มาแทน: พิมพ์ "สแปร์ [ลำดับหรือชื่อจุด]" เช่น "สแปร์ 1"`);
  lines.push(`หรือ แตะปุ่มบนการ์ดในไลน์ได้ทันทีครับ 🫡`);

  return {
    hasMissing: true,
    wave,
    waveLabel,
    totalSites: totalCount,
    confirmedSites: confirmedCount,
    missingCount: missing.length,
    missingSlots: missing,
    message: lines.join("\n"),
  };
}

export async function confirmSlotFromLineCommand(input: {
  query: string;
  actor?: string;
  wave?: "morning" | "evening";
}) {
  await ensureDatabase();
  const db = database();
  const now = bangkokNow();
  const today = now.date;
  const rawQuery = String(input.query || "").trim();

  if (!rawQuery) {
    return { ok: false, message: "กรุณาระบุชื่อจุดหรือลำดับ เช่น 'ยืนยัน 1' หรือ 'สแปร์ 1' หรือ 'ยืนยัน Best Western'" };
  }

  const isSpare = /สแปร์|แทน|spare/i.test(rawQuery);
  const searchTarget = rawQuery.replace(/^(?:ยืนยัน|คอนเฟิร์ม|เช็คเข้า|สแปร์|แทน)\s*/i, "").replace(/สแปร์|แทน/i, "").trim();

  const slotsResult = await db.prepare(`
    SELECT * FROM coverage_slots 
    WHERE operational_date = ? AND state IN ('waiting', 'missing', 'unassigned')
    ORDER BY deadline ASC, site_name ASC
  `).bind(today).all<D1Row>();

  const slots = (slotsResult.results || []) as any[];
  if (!slots.length) {
    return { ok: true, message: `✅ จุดตรวจทั้งหมดของวันนี้เข้าเวรครบถ้วนเรียบร้อยแล้วครับ` };
  }

  let targetSlot: any = null;

  const indexMatch = searchTarget.match(/^#?(\d+)$/);
  if (indexMatch) {
    const idx = parseInt(indexMatch[1], 10) - 1;
    if (idx >= 0 && idx < slots.length) {
      targetSlot = slots[idx];
    }
  }

  if (!targetSlot) {
    const cleanQuery = (searchTarget || rawQuery).toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]/g, "");
    targetSlot = slots.find((s) => {
      const cleanSite = (s.site_name || "").toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]/g, "");
      return cleanSite.includes(cleanQuery);
    });
  }

  if (!targetSlot) {
    return {
      ok: false,
      message: `❌ ไม่พบจุดที่ตรงกับ "${rawQuery}" ในรายการที่ค้างเข้าเวรวันนี้\nกรุณาตรวจชื่อจุด หรือพิมพ์ "สรุปเข้าเวร" เพื่อดูรายการลำดับครับ`,
    };
  }

  const guardTitle = isSpare 
    ? "รปภ. สแปร์แทนเวร" 
    : (targetSlot.assigned_guard ? `รปภ. ประจำ (${targetSlot.assigned_guard})` : "รปภ. ประจำจุด");

  const deadlineMins = minuteFromTime(targetSlot.deadline || "00:00");
  const currentMins = minuteFromTime(now.time);
  const lateMinutes = Math.max(0, currentMins - deadlineMins);
  const sourceText = `LINE คำสั่งแชท (${guardTitle})`;

  await db.prepare(`
    UPDATE coverage_slots 
    SET state = 'confirmed',
        reported_at = ?,
        source = ?,
        late_minutes = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(now.time, sourceText, lateMinutes, now.iso, targetSlot.id).run();

  await addAudit(
    "coverage_slot",
    targetSlot.id,
    isSpare ? "shift_confirmed_spare_chat" : "shift_confirmed_regular_chat",
    input.actor || "LINE Command",
    `ยืนยันเข้าเวรจุด ${targetSlot.site_name} (${targetSlot.post_name || "ป้อมประจำ"}) [${guardTitle}] เวลา ${now.time} น.`
  );

  return {
    ok: true,
    siteName: targetSlot.site_name,
    postName: targetSlot.post_name,
    guardTitle,
    deadline: targetSlot.deadline,
    wave: targetSlot.wave,
    message: [
      `✅ [ALPHA COP] ยืนยันเข้าเวรสำเร็จ!`,
      `🏢 จุด: ${targetSlot.site_name} · ${targetSlot.post_name || "ป้อมประจำ"}`,
      `👮 สถานะกำลังพล: ${guardTitle}`,
      `⏰ เวลาบันทึก: ${now.time} น. (${lateMinutes > 0 ? `สาย ${lateMinutes} นาที` : "ตรงเวลา"})`,
      `👤 ผู้ยืนยัน: คำสั่งไลน์ศูนย์สั่งการ`,
      `━━━━━━━━━━━━━━━━━━`,
      `ระบบบันทึกยอดกำลังพลเข้าระบบเรียบร้อยแล้วครับ 🫡`,
    ].join("\n"),
  };
}

// -------------------------------------------------------------
// GUARD DIRECTORY & MULTI-GUARD PROFILES
// -------------------------------------------------------------

export type GuardProfile = {
  id: string;
  siteId: string;
  siteName?: string;
  guardName: string;
  displayName: string | null;
  pictureUrl: string | null;
  phoneNumber: string | null;
  preferredShift: "morning" | "evening" | "all";
  role: "regular" | "spare" | "head_guard" | "employer";
  active: number;
  createdAt: string;
  updatedAt: string;
};

export async function purgePlaceholderGuardProfiles(actor = "admin"): Promise<{
  ok: boolean;
  purgedCount: number;
  message: string;
}> {
  await ensureDatabase();
  const db = database();
  const res = await db.prepare(`
    DELETE FROM guard_profiles 
    WHERE guard_name LIKE 'รปภ. ประจำ%' 
       OR guard_name LIKE 'รปภ. สแปร์กลาง%'
       OR id LIKE 'guard-line-point-%'
       OR (guard_name LIKE 'รปภ. (U-%' AND (display_name IS NULL OR display_name = ''))
       OR (guard_name LIKE 'รปภ. LINE (%' AND (display_name IS NULL OR display_name = ''))
  `).run();

  await addAudit("guard_profile", "all_placeholders", "purge", actor, `โละล้างข้อมูลจำลอง รปภ. เก่าทั้งหมด (${res.changes} รายการ)`);
  return {
    ok: true,
    purgedCount: res.changes,
    message: `โละล้างข้อมูลจำลองสำเร็จ ${res.changes} รายการ เพื่อเตรียมรับโปรไฟล์ LINE จริง`,
  };
}

export async function purgeAllLegacyEventsAndPlaceholders(actor = "admin"): Promise<{
  ok: boolean;
  purgedGuards: number;
  purgedEvents: number;
  message: string;
}> {
  await ensureDatabase();
  const db = database();
  
  // 1. Delete all fake placeholder guards, legacy hashes, and bot accounts
  const gRes = await db.prepare(`
    DELETE FROM guard_profiles 
    WHERE guard_name LIKE 'รปภ. ประจำ%' 
       OR guard_name LIKE 'รปภ. สแปร์กลาง%'
       OR id LIKE 'guard-line-point-%'
       OR id LIKE 'U-%'
       OR guard_name LIKE 'U-%'
       OR (guard_name LIKE 'รปภ. (U-%' AND (display_name IS NULL OR display_name = ''))
       OR (guard_name LIKE 'รปภ. LINE (%' AND (display_name IS NULL OR display_name = ''))
       OR (display_name LIKE 'U-%' AND (picture_url IS NULL OR picture_url = ''))
       OR guard_name LIKE '%bot%'
       OR guard_name LIKE '%บอท%'
  `).run();

  // 2. Delete legacy webhook events that do not have a real raw_user_id (hashed only)
  const eRes = await db.prepare(`
    DELETE FROM line_webhook_events 
    WHERE raw_user_id IS NULL OR raw_user_id = '' OR raw_user_id LIKE 'U-%' OR sender_key LIKE 'U-%'
  `).run();

  const countG = Number(gRes.changes || 0);
  const countE = Number(eRes.changes || 0);

  await addAudit("system", "clean_reset", "purge_all", actor, `โละล้างข้อมูลประวัติเก่าและข้อมูลจำลองทั้งหมด (${countG} โปรไฟล์, ${countE} อีเวนต์)`);

  return {
    ok: true,
    purgedGuards: countG,
    purgedEvents: countE,
    message: `โละล้างประวัติจำลองและแชทเก่าเรียบร้อย (${countG} โปรไฟล์, ${countE} รายการ) พร้อมรับข้อมูลโปรไฟล์จริง`,
  };
}

export async function getGuardProfiles(siteId?: string): Promise<GuardProfile[]> {
  await ensureDatabase();
  const db = database();
  const botUserId = await getEffectiveBotUserId();
  const lineToken = await getEffectiveLineToken();

  // 1. Auto-discover any real LINE senders from webhook events not yet registered in guard_profiles
  try {
    const unmappedSenders = (await db.prepare(`
      SELECT 
        lwe.raw_user_id,
        lwe.sender_key,
        lwe.group_id,
        COALESCE(lg.site_id, lgr.site_id, '') as site_id
      FROM line_webhook_events lwe
      LEFT JOIN line_groups lg ON lwe.group_id = lg.id
      LEFT JOIN line_group_registry lgr ON lwe.group_id = lgr.id
      LEFT JOIN guard_profiles gp ON (gp.id = lwe.raw_user_id OR gp.id = lwe.sender_key) AND gp.active = 1
      WHERE gp.id IS NULL
        AND (
          (lwe.raw_user_id LIKE 'U%' AND length(lwe.raw_user_id) >= 30)
          OR (lwe.sender_key LIKE 'U%' AND length(lwe.sender_key) >= 30)
        )
      GROUP BY COALESCE(NULLIF(lwe.raw_user_id, ''), lwe.sender_key), lwe.group_id
      LIMIT 30
    `).all<any>()).results || [];

    for (const sender of unmappedSenders) {
      const uId = String(sender.raw_user_id || sender.sender_key || "").trim();
      if (!uId || (botUserId && uId === botUserId)) continue;
      const targetSiteId = sender.site_id || linePointSiteIdentifier(sender.group_id);
      
      let fetchedName = `รปภ. (${uId.slice(-6)})`;
      let fetchedPic: string | null = null;

      if (lineToken && uId.startsWith("U") && uId.length >= 30) {
        try {
          let res = await fetch(`https://api.line.me/v2/bot/group/${encodeURIComponent(sender.group_id)}/member/${encodeURIComponent(uId)}`, {
            headers: { Authorization: `Bearer ${lineToken}` },
          });
          if (!res.ok) {
            res = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(uId)}`, {
              headers: { Authorization: `Bearer ${lineToken}` },
            });
          }
          if (res.ok) {
            const pJson = await res.json() as any;
            if (pJson.displayName) {
              fetchedName = String(pJson.displayName).trim();
              fetchedPic = pJson.pictureUrl ? String(pJson.pictureUrl).trim() : null;
            }
          }
        } catch {}
      }

      // Check if this is the bot's name
      if (fetchedName.toLowerCase().includes("bot") || fetchedName.includes("บอท")) continue;

      const now = bangkokNow().iso;
      await db.prepare(`
        INSERT INTO guard_profiles (id, site_id, guard_name, display_name, picture_url, preferred_shift, role, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'all', 'regular', 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          display_name = COALESCE(excluded.display_name, guard_profiles.display_name),
          picture_url = COALESCE(excluded.picture_url, guard_profiles.picture_url),
          updated_at = excluded.updated_at
      `).bind(uId, targetSiteId, fetchedName, fetchedName, fetchedPic, now, now).run();
    }
  } catch {}

  // 2. Fetch all active guard and employer profiles
  let query = `
    SELECT gp.*, os.site_name
    FROM guard_profiles gp
    LEFT JOIN operational_sites os ON gp.site_id = os.id
    WHERE gp.active = 1
      AND gp.guard_name NOT LIKE 'รปภ. ประจำ%'
      AND gp.guard_name NOT LIKE 'รปภ. สแปร์กลาง%'
      AND gp.id NOT LIKE 'guard-line-point-%'
      AND gp.guard_name NOT LIKE 'U-%'
      AND gp.guard_name NOT LIKE '%bot%'
      AND gp.guard_name NOT LIKE '%บอท%'
  `;
  const params: any[] = [];
  if (siteId === "spares_only") {
    query += " AND (gp.role = 'spare' OR gp.site_id = 'all')";
  } else if (siteId === "employers_only") {
    query += " AND gp.role = 'employer'";
  } else if (siteId && siteId !== "all") {
    query += " AND (gp.site_id = ? OR gp.site_id = 'all' OR gp.role = 'spare' OR gp.role = 'employer')";
    params.push(siteId);
  }
  query += " ORDER BY CASE WHEN gp.role = 'employer' THEN 2 WHEN gp.site_id = 'all' THEN 1 ELSE 0 END, os.site_name ASC, gp.role ASC, gp.guard_name ASC";

  const rows = (await db.prepare(query).bind(...params).all<any>()).results || [];
  return rows
    .filter((r: any) => {
      const uId = String(r.id || "").trim();
      const gName = String(r.guard_name || "").trim();
      if (botUserId && uId === botUserId) return false;
      if (gName.toLowerCase().includes("bot") || gName.includes("บอท")) return false;
      return true;
    })
    .map((r: any) => {
      let displayGuardName = String(r.guard_name || "").trim();
      const rawDisplayName = String(r.display_name || "").trim();

      if (!displayGuardName && rawDisplayName) {
        displayGuardName = rawDisplayName;
      }

      return {
        id: String(r.id),
        siteId: String(r.site_id),
        siteName: r.site_id === "all" ? "🌐 สแปร์กลาง (ทุกจุด)" : (r.site_name ? String(r.site_name) : undefined),
        guardName: displayGuardName || `ผู้ส่ง (${String(r.id).slice(-6)})`,
        displayName: r.display_name ? String(r.display_name) : null,
        pictureUrl: r.picture_url ? String(r.picture_url) : null,
        phoneNumber: r.phone_number ? String(r.phone_number) : null,
        preferredShift: (r.preferred_shift || "all") as "morning" | "evening" | "all",
        role: (r.role || "regular") as "regular" | "spare" | "head_guard" | "employer",
        active: Number(r.active ?? 1),
        createdAt: String(r.created_at || ""),
        updatedAt: String(r.updated_at || ""),
      };
    });
}

export async function saveGuardProfile(data: {
  id?: string;
  siteId: string;
  guardName: string;
  displayName?: string;
  pictureUrl?: string | null;
  phoneNumber?: string | null;
  preferredShift?: string;
  role?: string;
  active?: number;
}): Promise<GuardProfile> {
  await ensureDatabase();
  const db = database();
  const now = bangkokNow().iso;
  const id = data.id?.trim() || `guard-${randomUUID().slice(0, 8)}`;

  await db.prepare(`
    INSERT INTO guard_profiles (id, site_id, guard_name, display_name, picture_url, phone_number, preferred_shift, role, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      site_id = excluded.site_id,
      guard_name = excluded.guard_name,
      display_name = COALESCE(excluded.display_name, guard_profiles.display_name),
      picture_url = COALESCE(excluded.picture_url, guard_profiles.picture_url),
      phone_number = excluded.phone_number,
      preferred_shift = excluded.preferred_shift,
      role = CASE 
        WHEN guard_profiles.role = 'employer' AND excluded.role = 'regular' THEN 'employer'
        WHEN guard_profiles.role = 'spare' AND excluded.role = 'regular' THEN 'spare'
        WHEN guard_profiles.role = 'head_guard' AND excluded.role = 'regular' THEN 'head_guard'
        ELSE COALESCE(excluded.role, guard_profiles.role, 'regular')
      END,
      active = excluded.active,
      updated_at = excluded.updated_at
  `).bind(
    id,
    data.siteId,
    data.guardName.trim(),
    data.displayName?.trim() || null,
    data.pictureUrl?.trim() || null,
    data.phoneNumber?.trim() || null,
    data.preferredShift || "all",
    data.role || "regular",
    data.active ?? 1,
    now,
    now
  ).run();

  await addAudit("guard_profile", id, "save", "admin", `บันทึกข้อมูล รปภ. ${data.guardName}`);

  const list = await getGuardProfiles();
  return list.find((g) => g.id === id) || {
    id,
    siteId: data.siteId,
    guardName: data.guardName,
    displayName: data.displayName || null,
    pictureUrl: data.pictureUrl || null,
    phoneNumber: data.phoneNumber || null,
    preferredShift: (data.preferredShift || "all") as any,
    role: (data.role || "regular") as any,
    active: data.active ?? 1,
    createdAt: now,
    updatedAt: now,
  };
}

export async function deleteGuardProfile(guardId: string): Promise<void> {
  await ensureDatabase();
  const db = database();
  await db.prepare("UPDATE guard_profiles SET active = 0, updated_at = ? WHERE id = ?").bind(bangkokNow().iso, guardId).run();
  await addAudit("guard_profile", guardId, "delete", "admin", `ลบ/ปิดใช้งาน รปภ. ID ${guardId}`);
}

export async function getRecentWebhookSenders(options?: number | {
  siteId?: string;
  groupId?: string;
  limit?: number;
}): Promise<Array<{
  senderKey: string;
  groupId: string;
  groupName: string;
  siteId?: string;
  siteName?: string;
  lastSeenAt: string;
  messageType?: string;
  lastSummary?: string;
  messageCount: number;
  isBound: boolean;
  guardName?: string;
  role?: string;
}>> {
  await ensureDatabase();
  const db = database();

  const opts = typeof options === "number" ? { limit: options } : options || {};
  const limit = opts.limit || 50;

  let query = `
    SELECT 
      COALESCE(NULLIF(lwe.raw_user_id, ''), NULLIF(lwe.sender_key, '')) as sender_key,
      lwe.group_id, 
      COALESCE(lgr.group_name, lg.group_name, lwe.group_id) as group_name,
      lg.site_id,
      os.site_name,
      MAX(lwe.received_at) as last_seen_at,
      MAX(lwe.message_type) as message_type,
      MAX(lwe.summary) as last_summary,
      COUNT(lwe.id) as message_count,
      gp.id as guard_id,
      gp.guard_name,
      gp.display_name,
      gp.picture_url,
      gp.role
    FROM line_webhook_events lwe
    LEFT JOIN line_group_registry lgr ON lwe.group_id = lgr.id
    LEFT JOIN line_groups lg ON lwe.group_id = lg.id
    LEFT JOIN operational_sites os ON lg.site_id = os.id
    LEFT JOIN guard_profiles gp ON (gp.id = lwe.raw_user_id OR gp.id = lwe.sender_key OR gp.display_name = lwe.raw_user_id OR gp.display_name = lwe.sender_key) AND gp.active = 1
    WHERE (lwe.raw_user_id IS NOT NULL AND lwe.raw_user_id != '') OR (lwe.sender_key IS NOT NULL AND lwe.sender_key != '')
  `;
  const params: any[] = [];

  if (opts.siteId && opts.siteId !== "all") {
    query += " AND lg.site_id = ?";
    params.push(opts.siteId);
  }
  if (opts.groupId) {
    query += " AND lwe.group_id = ?";
    params.push(opts.groupId);
  }

  query += `
    GROUP BY COALESCE(NULLIF(lwe.raw_user_id, ''), NULLIF(lwe.sender_key, '')), lwe.group_id
    ORDER BY last_seen_at DESC
    LIMIT ?
  `;
  params.push(limit);

  const rows = (await db.prepare(query).bind(...params).all<any>()).results || [];

  const lineToken = await getEffectiveLineToken();
  const sendersToFetch: { groupId: string; rawUserId: string; row: any }[] = [];

  for (const r of rows) {
    const rawUid = String(r.sender_key || "").trim();
    if (rawUid.startsWith("U") && rawUid.length === 33 && (!r.display_name || r.display_name.startsWith("U-") || !r.picture_url)) {
      sendersToFetch.push({ groupId: String(r.group_id), rawUserId: rawUid, row: r });
    }
  }

  if (lineToken && sendersToFetch.length > 0) {
    await Promise.allSettled(
      sendersToFetch.slice(0, 20).map(async ({ groupId, rawUserId, row }) => {
        try {
          let res = await fetch(`https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/member/${encodeURIComponent(rawUserId)}`, {
            headers: { Authorization: `Bearer ${lineToken}` },
          });
          if (!res.ok) {
            res = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(rawUserId)}`, {
              headers: { Authorization: `Bearer ${lineToken}` },
            });
          }
          if (res.ok) {
            const pJson = await res.json();
            if (pJson.displayName) {
              row.display_name = pJson.displayName;
              row.picture_url = pJson.pictureUrl || null;
              await db.prepare(`
                UPDATE guard_profiles 
                SET display_name = ?, picture_url = COALESCE(?, picture_url), updated_at = ?
                WHERE id = ? OR display_name = ?
              `).bind(pJson.displayName, pJson.pictureUrl || null, bangkokNow().iso, rawUserId, rawUserId).run();
            }
          }
        } catch {}
      })
    );
  }

  return rows.map((r: any) => {
    let cleanGuardName: string | undefined = undefined;
    if (r.guard_name && !r.guard_name.startsWith("รปภ. ประจำ ") && !r.guard_name.startsWith("รปภ. สแปร์กลาง ") && !/^U-[A-F0-9]{16}$/i.test(r.guard_name) && !/^U[0-9a-fA-F]{32}$/i.test(r.guard_name)) {
      cleanGuardName = String(r.guard_name).trim();
    } else if (r.display_name && !/^U-[A-F0-9]{16}$/i.test(r.display_name) && !/^U[0-9a-fA-F]{32}$/i.test(r.display_name)) {
      cleanGuardName = String(r.display_name).trim();
    }

    return {
      senderKey: String(r.sender_key),
      rawUserId: r.sender_key?.startsWith("U") && r.sender_key.length === 33 ? r.sender_key : undefined,
      groupId: String(r.group_id),
      groupName: String(r.group_name || `กลุ่ม ${String(r.group_id).slice(-6)}`),
      siteId: r.site_id ? String(r.site_id) : undefined,
      siteName: r.site_name ? String(r.site_name) : undefined,
      lastSeenAt: String(r.last_seen_at),
      messageType: r.message_type ? String(r.message_type) : undefined,
      lastSummary: r.last_summary ? String(r.last_summary) : undefined,
      messageCount: Number(r.message_count || 1),
      isBound: Boolean(r.guard_id),
      guardName: cleanGuardName,
      displayName: r.display_name ? String(r.display_name) : undefined,
      pictureUrl: r.picture_url ? String(r.picture_url) : undefined,
      role: r.role ? String(r.role) : undefined,
    };
  });
}

export async function autoSyncGuardsFromLine(actor = "admin"): Promise<{
  ok: boolean;
  totalSynced: number;
  newGuards: number;
  updatedGuards: number;
  sparesDetected: number;
  profilesFetched: number;
  groupsScanned: number;
  message: string;
}> {
  await ensureDatabase();
  const db = database();
  const now = bangkokNow().iso;

  // --- 1. Resolve LINE token for profile API calls ---
  const lineToken = await getEffectiveLineToken();

  const profileCache = new Map<string, { displayName: string; pictureUrl: string | null; source: string }>();
  let profilesFetched = 0;
  let groupsScanned = 0;

  // Track discovered guards: key = guard unique id (userId, senderKey, or rosterId) -> details
  const discoveredGuards = new Map<string, {
    id: string;
    groupIds: Set<string>;
    siteIds: Set<string>;
    siteName?: string;
    groupName?: string;
    guardName?: string;
    displayName?: string;
    pictureUrl?: string | null;
    source: string;
  }>();

  // --- 2. Query all known LINE groups ---
  const knownGroups = (await db.prepare(`
    SELECT r.id, r.group_name, r.picture_url, m.site_id, os.site_name
    FROM line_group_registry r
    LEFT JOIN line_groups m ON m.id = r.id
    LEFT JOIN operational_sites os ON m.site_id = os.id
  `).all<any>()).results || [];

  // --- 3. Strategy A: Direct Group Members API (GET /v2/bot/group/{groupId}/members/ids) ---
  if (lineToken) {
    for (const grp of knownGroups) {
      const groupId = String(grp.id).trim();
      if (!groupId || !groupId.startsWith("C")) continue;
      groupsScanned++;

      let nextContinuationToken: string | undefined = undefined;
      let groupMemberCount = 0;

      // Loop to fetch all member IDs with continuation token (up to 300 members per group)
      do {
        try {
          const url: string = `https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/members/ids${nextContinuationToken ? `?start=${encodeURIComponent(nextContinuationToken)}` : ""}`;
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${lineToken}` },
          });

          if (res.ok) {
            const data = (await res.json()) as { memberIds?: string[]; next?: string };
            const memberIds = data.memberIds || [];
            nextContinuationToken = data.next;

            for (const memberId of memberIds) {
              const uId = String(memberId).trim();
              if (!uId) continue;
              groupMemberCount++;

              // Fetch member profile from group endpoint
              if (!profileCache.has(uId)) {
                try {
                  const pRes = await fetch(`https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/member/${encodeURIComponent(uId)}`, {
                    headers: { Authorization: `Bearer ${lineToken}` },
                  });
                  if (pRes.ok) {
                    const pJson = (await pRes.json()) as any;
                    if (pJson.displayName) {
                      profileCache.set(uId, {
                        displayName: String(pJson.displayName),
                        pictureUrl: pJson.pictureUrl ? String(pJson.pictureUrl) : null,
                        source: "line_group_member_api",
                      });
                      profilesFetched++;
                    }
                  }
                } catch {}
              }

              const profile = profileCache.get(uId);
              const targetSiteId = grp.site_id || linePointSiteIdentifier(groupId);

              const existing = discoveredGuards.get(uId) || {
                id: uId,
                groupIds: new Set<string>(),
                siteIds: new Set<string>(),
                siteName: grp.site_name,
                groupName: grp.group_name,
                guardName: profile?.displayName || `รปภ. (${uId.slice(-6)})`,
                displayName: profile?.displayName || uId,
                pictureUrl: profile?.pictureUrl || null,
                source: "line_group_members",
              };

              existing.groupIds.add(groupId);
              existing.siteIds.add(targetSiteId);
              if (profile?.displayName) {
                existing.guardName = profile.displayName;
                existing.displayName = profile.displayName;
                existing.pictureUrl = profile.pictureUrl || existing.pictureUrl;
              }
              discoveredGuards.set(uId, existing);
            }
          } else {
            // 403 Forbidden means unverified account -> fall back to webhook events & roster
            break;
          }
        } catch {
          break;
        }
      } while (nextContinuationToken && groupMemberCount < 300);
    }
  }

  // --- 4. Strategy B: Webhook Event Senders (All unique senders in DB) ---
  const sendersResult = await db.prepare(`
    SELECT 
      COALESCE(NULLIF(lwe.raw_user_id, ''), NULLIF(lwe.sender_key, '')) as sender_id,
      lwe.raw_user_id,
      lwe.sender_key,
      lwe.group_id, 
      COALESCE(lgr.group_name, lg.group_name, lwe.group_id) as group_name,
      lg.site_id,
      os.site_name,
      MAX(lwe.received_at) as last_seen_at,
      COUNT(lwe.id) as message_count
    FROM line_webhook_events lwe
    LEFT JOIN line_group_registry lgr ON lwe.group_id = lgr.id
    LEFT JOIN line_groups lg ON lwe.group_id = lg.id
    LEFT JOIN operational_sites os ON lg.site_id = os.id
    WHERE (lwe.raw_user_id IS NOT NULL AND lwe.raw_user_id != '') 
       OR (lwe.sender_key IS NOT NULL AND lwe.sender_key != '')
    GROUP BY COALESCE(NULLIF(lwe.raw_user_id, ''), NULLIF(lwe.sender_key, '')), lwe.group_id
  `).all<D1Row>();

  const senders = (sendersResult.results || []) as any[];

  // For any senders with real raw_user_id (or 33-character sender_key starting with U)
  const sendersToFetch: { groupId: string; rawUserId: string }[] = [];
  for (const s of senders) {
    const rawUid = String(s.raw_user_id || s.sender_id || "").trim();
    if (rawUid.startsWith("U") && rawUid.length >= 30 && !profileCache.has(rawUid)) {
      sendersToFetch.push({ groupId: String(s.group_id), rawUserId: rawUid });
    }
  }

  if (lineToken && sendersToFetch.length > 0) {
    const batchSize = 10;
    for (let i = 0; i < sendersToFetch.length; i += batchSize) {
      const batch = sendersToFetch.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map(async ({ groupId, rawUserId }) => {
          try {
            let res = await fetch(`https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/member/${encodeURIComponent(rawUserId)}`, {
              headers: { Authorization: `Bearer ${lineToken}` },
            });
            if (!res.ok) {
              res = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(rawUserId)}`, {
                headers: { Authorization: `Bearer ${lineToken}` },
              });
            }
            if (res.ok) {
              const pJson = (await res.json()) as any;
              if (pJson.displayName) {
                profileCache.set(rawUserId, {
                  displayName: String(pJson.displayName),
                  pictureUrl: pJson.pictureUrl ? String(pJson.pictureUrl) : null,
                  source: "line_webhook_profile",
                });
                profilesFetched++;
              }
            }
          } catch {}
        })
      );
    }
  }

  for (const s of senders) {
    const sId = String(s.sender_id || s.raw_user_id || s.sender_key || "").trim();
    if (!sId) continue;
    const rawUid = String(s.raw_user_id || (sId.startsWith("U") && sId.length >= 30 ? sId : "")).trim();
    const lineProfile = rawUid ? profileCache.get(rawUid) : undefined;
    if (!lineProfile?.displayName) {
      // Skip legacy unverified hashes with no real LINE display name
      continue;
    }

    const finalGuardName = lineProfile.displayName;

    const targetSiteId = s.site_id || linePointSiteIdentifier(s.group_id);
    const existing = discoveredGuards.get(sId) || {
      id: sId,
      groupIds: new Set<string>(),
      siteIds: new Set<string>(),
      siteName: s.site_name,
      groupName: s.group_name,
      guardName: finalGuardName,
      displayName: lineProfile.displayName,
      pictureUrl: lineProfile.pictureUrl || null,
      source: "webhook_events",
    };

    existing.groupIds.add(String(s.group_id));
    existing.siteIds.add(targetSiteId);
    existing.guardName = lineProfile.displayName;
    existing.displayName = lineProfile.displayName;
    existing.pictureUrl = lineProfile.pictureUrl || existing.pictureUrl;
    discoveredGuards.set(sId, existing);
  }

  // --- 5. Strategy C: Shift Templates & Coverage Slots Assigned Guards ---
  const assignedGuards = (await db.prepare(`
    SELECT DISTINCT site_id, assigned_guard
    FROM shift_templates
    WHERE assigned_guard IS NOT NULL AND trim(assigned_guard) != ''
    UNION
    SELECT DISTINCT site_id, assigned_guard
    FROM coverage_slots
    WHERE assigned_guard IS NOT NULL AND trim(assigned_guard) != ''
  `).all<any>()).results || [];

  for (const ag of assignedGuards) {
    const rawName = String(ag.assigned_guard || "").trim();
    const siteId = String(ag.site_id || "").trim();
    if (!rawName || rawName.startsWith("รปภ. ประจำ") || rawName.startsWith("รปภ. สแปร์") || !siteId) continue;

    // Check if this guard name already exists in discovered guards
    let matched = false;
    for (const g of discoveredGuards.values()) {
      if (g.guardName === rawName || g.displayName === rawName) {
        g.siteIds.add(siteId);
        matched = true;
        break;
      }
    }

    if (!matched) {
      const guardId = `guard-${siteId}-${rawName.replace(/[^a-zA-Z0-9ก-๙]/g, "_").slice(0, 32)}`;
      discoveredGuards.set(guardId, {
        id: guardId,
        groupIds: new Set<string>(),
        siteIds: new Set([siteId]),
        guardName: rawName,
        displayName: rawName,
        pictureUrl: "👮‍♂️",
        source: "shift_roster",
      });
    }
  }

  // --- 6. Write all discovered guards into guard_profiles table ---
  let sparesDetected = 0;
  let updatedGuards = 0;
  const operations: any[] = [];

  for (const guard of discoveredGuards.values()) {
    const isMultiGroup = guard.groupIds.size > 1 || guard.siteIds.size > 1;
    const firstSiteId = Array.from(guard.siteIds)[0] || "all";
    const siteId = isMultiGroup ? "all" : firstSiteId;
    const role = isMultiGroup ? "spare" : "regular";
    if (isMultiGroup) sparesDetected++;

    const displayPicture = guard.pictureUrl || (isMultiGroup ? "🌐" : "👮‍♂️");

    operations.push(
      db.prepare(`
        INSERT INTO guard_profiles (
          id, site_id, guard_name, display_name, picture_url, phone_number, preferred_shift, role, active, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, NULL, 'all', ?, 1, ?, ?
        )
        ON CONFLICT(id) DO UPDATE SET
          site_id = CASE WHEN guard_profiles.site_id != 'all' AND excluded.site_id = 'all' THEN 'all' ELSE COALESCE(NULLIF(guard_profiles.site_id, ''), excluded.site_id) END,
          guard_name = CASE 
            WHEN excluded.guard_name NOT LIKE 'รปภ. ประจำ%' AND excluded.guard_name NOT LIKE 'รปภ. สแปร์%' AND excluded.guard_name NOT LIKE 'U-%' AND excluded.guard_name NOT LIKE 'U%'
            THEN excluded.guard_name
            ELSE COALESCE(NULLIF(guard_profiles.guard_name, ''), excluded.guard_name)
          END,
          display_name = COALESCE(NULLIF(excluded.display_name, ''), guard_profiles.display_name),
          picture_url = CASE 
            WHEN excluded.picture_url LIKE 'https://%' THEN excluded.picture_url 
            ELSE COALESCE(NULLIF(guard_profiles.picture_url, '👮‍♂️'), NULLIF(guard_profiles.picture_url, '🌐'), excluded.picture_url) 
          END,
          role = CASE WHEN excluded.role = 'spare' THEN 'spare' ELSE guard_profiles.role END,
          active = 1,
          updated_at = excluded.updated_at
      `).bind(
        guard.id,
        siteId,
        guard.guardName || guard.displayName || `รปภ. (${guard.id.slice(0, 6)})`,
        guard.displayName || null,
        displayPicture,
        role,
        now,
        now
      )
    );
    updatedGuards++;
  }

  for (let offset = 0; offset < operations.length; offset += 50) {
    await db.batch(operations.slice(offset, offset + 50));
  }

  const total = updatedGuards;
  await addAudit(
    "guard_profile",
    "bulk_sync",
    "auto_sync",
    actor,
    `ซิงค์ทำเนียบ รปภ. ${total} บัญชี (ดึงโปรไฟล์ LINE จริง ${profilesFetched} คน, จากกลุ่ม LINE ${groupsScanned} กลุ่ม, สแปร์กลาง ${sparesDetected})`
  );

  return {
    ok: true,
    totalSynced: total,
    newGuards: 0,
    updatedGuards,
    sparesDetected,
    profilesFetched,
    groupsScanned,
    message: `ซิงค์ทำเนียบ รปภ. สำเร็จ ${total} บัญชี — สแกนกลุ่ม LINE ${groupsScanned} กลุ่ม, ดึงโปรไฟล์ LINE จริงได้ ${profilesFetched} คน (ตรวจพบสแปร์กลาง ${sparesDetected} คน)`,
  };
}

// -------------------------------------------------------------
// EMPLOYER SENTINEL (ZERO-QUOTA LIVE FEED)
// -------------------------------------------------------------

export type EmployerInquiry = {
  id: string;
  groupId: string;
  siteName: string;
  senderName: string;
  senderKey: string | null;
  messageText: string;
  urgency: "p1_critical" | "p2_service" | "p3_general";
  category: string;
  status: "pending" | "acknowledged" | "dispatched" | "resolved";
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  dispatchedAt: string | null;
  resolvedAt: string | null;
  receivedAt: string;
  slaMinutes?: number;
};

export function classifyEmployerMessage(text: string): {
  urgency: "p1_critical" | "p2_service" | "p3_general";
  category: string;
  title: string;
  isUrgent: boolean;
} {
  const lower = text.toLowerCase();

  // 🔴 P1: CRITICAL / COMPLAINT / INCIDENT / MENTION
  const isMention = /@(all|everyone|alpha|รปภ|หัวหน้า|สายตรวจ|แอดมิน|admin)/i.test(text);
  const criticalPatterns = [
    { regex: /ไม่อยู่ป้อม|ไม่เห็นรปภ|รปภ\.?ไปไหน|ป้อมว่าง|ไม่มีคนเฝ้า/i, category: "guard_missing", title: "🔴 รปภ. ไม่อยู่ป้อม / ป้อมว่าง" },
    { regex: /หลับ|นอนหลับ|แอบหลับ|หลับยาม|งีบ/i, category: "guard_sleeping", title: "🔴 พบ รปภ. หลับยาม" },
    { regex: /เมา|ดื่ม|แอลกอฮอล์|กลิ่นเหล้า|สุรา/i, category: "guard_drunk", title: "🔴 รปภ. ดื่มแอลกอฮอล์" },
    { regex: /ขโมย|โจร|งัด|ขโมยของ|บุกรุก|คนแปลกหน้า/i, category: "theft_intrusion", title: "🚨 มีขโมย / บุกรุก / ของหาย" },
    { regex: /ทะเลาะ|ตีกัน|ทำร้าย|มีปากเสียง|ขู่/i, category: "violence", title: "🚨 เหตุทะเลาะวิวาท" },
    { regex: /ไฟไหม้|ควัน|กลิ่นไหม้|แก๊สรั่ว|ระเบิด/i, category: "fire_hazard", title: "🔥 แจ้งเตือนเหตุเพลิงไหม้ / แก๊ส" },
    { regex: /น้ำท่วม|น้ำรั่ว|ท่อแตก|น้ำล้น/i, category: "flood_pipe", title: "🌊 น้ำท่วม / ท่อประปาแตก" },
    { regex: /ชน|อุบัติเหตุ|รถชน|เฉี่ยว/i, category: "accident", title: "🚗 เกิดอุบัติเหตุ / รถชน" },
    { regex: /เปิดไม้กั้นไม่ได้|ไม้กั้นค้าง|ระบบล่ม|สแกนไม่ติด/i, category: "barrier_failure", title: "⚠️ ระบบไม้กั้นเสีย / ใช้งานไม่ได้" },
    { regex: /ร้องเรียน|ไม่สุภาพ|พูดจาไม่ดี|กิริยา/i, category: "complaint", title: "⚠️ ร้องเรียนพฤติกรรม รปภ." },
    { regex: /ขอดูกล้อง|ตรวจกล้อง|ย้อนหลัง|cctv/i, category: "cctv_request", title: "📹 ขอดูกล้องวงจรปิด CCTV" },
  ];

  for (const p of criticalPatterns) {
    if (p.regex.test(text)) {
      return { urgency: "p1_critical", category: p.category, title: p.title, isUrgent: true };
    }
  }

  if (isMention) {
    return { urgency: "p1_critical", category: "mention", title: "🔔 นายจ้างแท็กเรียกศูนย์/รปภ.", isUrgent: true };
  }

  // 🟡 P2: SERVICE / VISITOR / PARKING / DELIVERY
  const servicePatterns = [
    { regex: /ช่าง|ผู้รับเหมา|ซ่อม|ต่อเติม|ช่างแอร์|ช่างไฟ/i, category: "contractor", title: "🛠️ แจ้งช่าง / ผู้รับเหมาเข้าพื้นที่" },
    { regex: /พัสดุ|ไปรษณีย์|flash|kerry|j&t|shopee|lazada/i, category: "parcel", title: "📦 แจ้งรับพัสดุ / ส่งของ" },
    { regex: /จอดรถ|จอดขวาง|ขวางทาง|ขวางหน้าบ้าน/i, category: "parking", title: "🚗 แจ้งรถจอดขวางทาง" },
    { regex: /แลกบัตร|ผู้มาติดต่อ|แขก|เพื่อน/i, category: "visitor", title: "👤 แจ้งผู้มาติดต่อ / แลกบัตร" },
    { regex: /ลืมของ|กุญแจ|ทำตก/i, category: "lost_found", title: "🔑 แจ้งลืมของ / กุญแจ" },
    { regex: /ไรเดอร์|grab|lineman|foodpanda|robinhood/i, category: "rider", title: "🛵 ไรเดอร์ส่งอาหาร" },
  ];

  for (const s of servicePatterns) {
    if (s.regex.test(text)) {
      return { urgency: "p2_service", category: s.category, title: s.title, isUrgent: false };
    }
  }

  // ⚪ P3: GENERAL
  return { urgency: "p3_general", category: "general", title: "💬 ข้อความทั่วไป", isUrgent: false };
}

export async function recordEmployerInquiry(input: {
  groupId: string;
  siteName?: string;
  senderName?: string;
  senderKey?: string;
  messageText: string;
}): Promise<EmployerInquiry | null> {
  const text = input.messageText.trim();
  if (!text || text.length < 2) return null;

  await ensureDatabase();
  const db = database();
  const now = bangkokNow();
  const id = `inq-${randomUUID().slice(0, 10)}`;

  // Find site name if not given
  let siteName = input.siteName || "";
  if (!siteName) {
    const groupRow = (await db.prepare(`
      SELECT lg.group_name, os.site_name
      FROM line_groups lg
      LEFT JOIN operational_sites os ON lg.site_id = os.id
      WHERE lg.id = ?
    `).bind(input.groupId).first()) as any;
    siteName = groupRow?.site_name || groupRow?.group_name || `กลุ่ม ${input.groupId.slice(-6)}`;
  }

  const classification = classifyEmployerMessage(text);

  await db.prepare(`
    INSERT INTO employer_inquiries (
      id, group_id, site_name, sender_name, sender_key, message_text,
      urgency, category, status, received_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).bind(
    id,
    input.groupId,
    siteName || "ไม่ระบุจุด",
    input.senderName || (input.senderKey ? `นายจ้าง (${input.senderKey.slice(0, 6)})` : "นายจ้าง/ลูกบ้าน"),
    input.senderKey || null,
    text,
    classification.urgency,
    classification.category,
    now.iso
  ).run();

  return {
    id,
    groupId: input.groupId,
    siteName: siteName || "ไม่ระบุจุด",
    senderName: input.senderName || "นายจ้าง/ลูกบ้าน",
    senderKey: input.senderKey || null,
    messageText: text,
    urgency: classification.urgency,
    category: classification.category,
    status: "pending",
    acknowledgedBy: null,
    acknowledgedAt: null,
    dispatchedAt: null,
    resolvedAt: null,
    receivedAt: now.iso,
    slaMinutes: 0,
  };
}

export async function getEmployerInquiries(options?: {
  status?: string;
  urgency?: string;
  limit?: number;
}): Promise<{
  inquiries: EmployerInquiry[];
  stats: {
    total: number;
    pendingP1: number;
    pendingP2: number;
    resolvedToday: number;
  };
}> {
  await ensureDatabase();
  const db = database();
  const nowMs = Date.now();
  const today = bangkokNow().date;

  let query = "SELECT * FROM employer_inquiries WHERE 1=1";
  const params: any[] = [];

  if (options?.status && options.status !== "all") {
    query += " AND status = ?";
    params.push(options.status);
  }
  if (options?.urgency && options.urgency !== "all") {
    query += " AND urgency = ?";
    params.push(options.urgency);
  }

  query += " ORDER BY CASE urgency WHEN 'p1_critical' THEN 1 WHEN 'p2_service' THEN 2 ELSE 3 END, received_at DESC LIMIT ?";
  params.push(options?.limit || 50);

  const rows = (await db.prepare(query).bind(...params).all<any>()).results || [];

  const inquiries: EmployerInquiry[] = rows.map((r: any) => {
    const receivedMs = Date.parse(r.received_at);
    const slaMinutes = Number.isFinite(receivedMs) ? Math.max(0, Math.floor((nowMs - receivedMs) / 60000)) : 0;
    return {
      id: String(r.id),
      groupId: String(r.group_id),
      siteName: String(r.site_name || "ไม่ระบุจุด"),
      senderName: String(r.sender_name || "นายจ้าง"),
      senderKey: r.sender_key ? String(r.sender_key) : null,
      messageText: String(r.message_text || ""),
      urgency: (r.urgency || "p3_general") as any,
      category: String(r.category || "general"),
      status: (r.status || "pending") as any,
      acknowledgedBy: r.acknowledged_by ? String(r.acknowledged_by) : null,
      acknowledgedAt: r.acknowledged_at ? String(r.acknowledged_at) : null,
      dispatchedAt: r.dispatched_at ? String(r.dispatched_at) : null,
      resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
      receivedAt: String(r.received_at),
      slaMinutes,
    };
  });

  // Calculate quick stats
  const allRows = (await db.prepare(`
    SELECT urgency, status, received_at FROM employer_inquiries
    WHERE received_at >= ?
  `).bind(`${today}T00:00:00`).all<any>()).results || [];

  let pendingP1 = 0;
  let pendingP2 = 0;
  let resolvedToday = 0;

  allRows.forEach((r: any) => {
    if (r.status === "pending" || r.status === "acknowledged") {
      if (r.urgency === "p1_critical") pendingP1++;
      if (r.urgency === "p2_service") pendingP2++;
    }
    if (r.status === "resolved") {
      resolvedToday++;
    }
  });

  return {
    inquiries,
    stats: {
      total: allRows.length,
      pendingP1,
      pendingP2,
      resolvedToday,
    },
  };
}

export async function updateInquiryStatus(
  inquiryId: string,
  status: "acknowledged" | "dispatched" | "resolved",
  actor = "operator"
): Promise<EmployerInquiry | null> {
  await ensureDatabase();
  const db = database();
  const now = bangkokNow().iso;

  if (status === "acknowledged") {
    await db.prepare(`
      UPDATE employer_inquiries 
      SET status = 'acknowledged', acknowledged_by = ?, acknowledged_at = ?
      WHERE id = ?
    `).bind(actor, now, inquiryId).run();
  } else if (status === "dispatched") {
    await db.prepare(`
      UPDATE employer_inquiries 
      SET status = 'dispatched', dispatched_at = ?, acknowledged_by = COALESCE(acknowledged_by, ?), acknowledged_at = COALESCE(acknowledged_at, ?)
      WHERE id = ?
    `).bind(now, actor, now, inquiryId).run();
  } else if (status === "resolved") {
    await db.prepare(`
      UPDATE employer_inquiries 
      SET status = 'resolved', resolved_at = ?, acknowledged_by = COALESCE(acknowledged_by, ?), acknowledged_at = COALESCE(acknowledged_at, ?)
      WHERE id = ?
    `).bind(now, actor, now, inquiryId).run();
  }

  await addAudit("employer_inquiry", inquiryId, `status_${status}`, actor, `อัปเดตสถานะข้อความนายจ้างเป็น ${status}`);

  const inq = (await db.prepare("SELECT * FROM employer_inquiries WHERE id = ?").bind(inquiryId).first()) as any;
  if (!inq) return null;

  return {
    id: String(inq.id),
    groupId: String(inq.group_id),
    siteName: String(inq.site_name),
    senderName: String(inq.sender_name),
    senderKey: inq.sender_key ? String(inq.sender_key) : null,
    messageText: String(inq.message_text),
    urgency: inq.urgency,
    category: inq.category,
    status: inq.status,
    acknowledgedBy: inq.acknowledged_by,
    acknowledgedAt: inq.acknowledged_at,
    dispatchedAt: inq.dispatched_at,
    resolvedAt: inq.resolved_at,
    receivedAt: inq.received_at,
  };
}

let cachedBotUserId: string | null = null;

export async function getEffectiveBotUserId(): Promise<string | null> {
  if (cachedBotUserId) return cachedBotUserId;
  const info = await getLineBotInfo();
  return info.userId || null;
}

export async function getLineBotStatus(): Promise<{
  configured: boolean;
  valid: boolean;
  botName?: string;
  basicId?: string;
  userId?: string;
  pictureUrl?: string;
  error?: string;
}> {
  return getLineBotInfo();
}

export async function getLineBotInfo(): Promise<{
  configured: boolean;
  valid: boolean;
  botName?: string;
  basicId?: string;
  userId?: string;
  pictureUrl?: string;
  error?: string;
}> {
  const token = await getEffectiveLineToken();
  if (!token) {
    return { configured: false, valid: false, error: "ยังไม่ได้ระบุ LINE Channel Access Token" };
  }
  
  try {
    const res = await fetch("https://api.line.me/v2/bot/info", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json() as any;
    if (res.ok && (json.basicId || json.userId)) {
      if (json.userId) cachedBotUserId = String(json.userId).trim();
      return {
        configured: true,
        valid: true,
        botName: json.displayName,
        basicId: json.basicId,
        userId: json.userId,
        pictureUrl: json.pictureUrl,
      };
    }
    return {
      configured: true,
      valid: false,
      error: json.message || "Token ไม่ถูกต้อง หรือหมดอายุ (401)",
    };
  } catch (err: any) {
    return {
      configured: true,
      valid: false,
      error: err.message || "ไม่สามารถเชื่อมต่อกับ LINE API ได้",
    };
  }
}

export async function saveLineAccessToken(token: string, actor = "admin"): Promise<{
  ok: boolean;
  botName?: string;
  basicId?: string;
  pictureUrl?: string;
  error?: string;
}> {
  const cleanToken = token.trim();
  if (!cleanToken) {
    return { ok: false, error: "กรุณาระบุ Channel Access Token" };
  }

  try {
    const res = await fetch("https://api.line.me/v2/bot/info", {
      headers: { Authorization: `Bearer ${cleanToken}` },
    });
    const json = await res.json() as any;
    if (!res.ok || !json.basicId) {
      return { ok: false, error: json.message || "Token ไม่ถูกต้อง หรือหมดอายุ (401) กรุณาคัดลอกใหม่จาก LINE Developers Console" };
    }

    await ensureDatabase();
    const db = database();
    const now = bangkokNow().iso;
    await db.prepare("INSERT INTO system_settings (key, value, updated_at) VALUES ('line_channel_access_token', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .bind(cleanToken, now).run();

    setCachedLineToken(cleanToken);

    await addAudit("system_setting", "line_token", "updated", actor, `อัปเดต LINE Channel Access Token สำหรับบอท ${json.displayName || json.basicId}`);

    // Trigger autoSyncGuardsFromLine in background
    autoSyncGuardsFromLine(actor).catch(() => {});

    return {
      ok: true,
      botName: json.displayName,
      basicId: json.basicId,
      pictureUrl: json.pictureUrl,
    };
  } catch (err: any) {
    return { ok: false, error: err.message || "ไม่สามารถเชื่อมต่อกับ LINE API ได้" };
  }
}