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

function siteIdentifier(siteName: string) {
  return "site-" + siteName.trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/g, "-").replace(/(^-|-$)/g, "");
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
    db.prepare("CREATE TABLE IF NOT EXISTS operational_sites (id TEXT PRIMARY KEY, site_name TEXT NOT NULL, customer_name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS coverage_slots (id TEXT PRIMARY KEY, operational_date TEXT NOT NULL, wave TEXT NOT NULL, site_id TEXT NOT NULL, site_name TEXT NOT NULL, customer_name TEXT NOT NULL, post_name TEXT NOT NULL, slot_label TEXT NOT NULL, assigned_guard TEXT, assignment_type TEXT NOT NULL DEFAULT 'regular', state TEXT NOT NULL, verification_policy TEXT NOT NULL DEFAULT 'standard', deadline TEXT NOT NULL, reported_at TEXT, source TEXT, late_minutes INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS billing_cases (id TEXT PRIMARY KEY, customer_name TEXT NOT NULL, service_period TEXT NOT NULL, amount_satang INTEGER NOT NULL, due_at TEXT NOT NULL, document_state TEXT NOT NULL DEFAULT 'incomplete', submission_state TEXT NOT NULL DEFAULT 'unscheduled', payment_state TEXT NOT NULL DEFAULT 'unpaid', next_action TEXT NOT NULL, owner_name TEXT NOT NULL, appointment_at TEXT, location TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL, summary TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_coverage_today ON coverage_slots(operational_date, wave, site_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_billing_due ON billing_cases(due_at, payment_state)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_operational_sites_active ON operational_sites(active, site_name)"),
  ]);

  const count = await db.prepare("SELECT COUNT(*) AS count FROM coverage_slots").first<{ count: number }>();
  if ((count?.count ?? 0) === 0) await seedDemoData();
  await syncSiteRegistryFromSlots();
}

async function syncSiteRegistryFromSlots() {
  const now = bangkokNow().iso;
  await database().prepare("INSERT OR IGNORE INTO operational_sites (id, site_name, customer_name, active, created_at, updated_at) SELECT site_id, MAX(site_name), MAX(customer_name), 1, ?, ? FROM coverage_slots GROUP BY site_id")
    .bind(now, now).run();
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
  const billingResult = await db.prepare("SELECT * FROM billing_cases ORDER BY due_at ASC, updated_at DESC LIMIT 30").all<D1Row>();
  return {
    today,
    now: bangkokNow(),
    slots: (slotResult.results ?? []).map(toCoverageSlot),
    sites: (siteResult.results ?? []).map(toOperationalSite),
    billingCases: (billingResult.results ?? []).map(toBillingCase),
  };
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

export async function addBillingCase(input: { customerName: string; amountBaht: number; dueAt: string; nextAction: string; ownerName: string }) {
  await ensureDatabase();
  const now = bangkokNow().iso;
  const id = "bill-" + crypto.randomUUID();
  const amountSatang = Math.round(input.amountBaht * 100);
  await database().prepare("INSERT INTO billing_cases (id, customer_name, service_period, amount_satang, due_at, document_state, submission_state, payment_state, next_action, owner_name, appointment_at, location, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'incomplete', 'unscheduled', 'unpaid', ?, ?, NULL, NULL, ?, ?)")
    .bind(id, input.customerName, "งวดใหม่", amountSatang, input.dueAt, input.nextAction, input.ownerName, now, now).run();
  await addAudit("billing_case", id, "created", input.ownerName, "สร้างงานวางบิล " + input.customerName);
}
