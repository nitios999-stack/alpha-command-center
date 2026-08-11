import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const coverageSlots = sqliteTable("coverage_slots", {
  id: text("id").primaryKey(),
  operationalDate: text("operational_date").notNull(),
  wave: text("wave").notNull(),
  siteId: text("site_id").notNull(),
  siteName: text("site_name").notNull(),
  customerName: text("customer_name").notNull(),
  postName: text("post_name").notNull(),
  slotLabel: text("slot_label").notNull(),
  assignedGuard: text("assigned_guard"),
  assignmentType: text("assignment_type").notNull().default("regular"),
  state: text("state").notNull(),
  verificationPolicy: text("verification_policy").notNull().default("standard"),
  deadline: text("deadline").notNull(),
  reportedAt: text("reported_at"),
  source: text("source"),
  lateMinutes: integer("late_minutes").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_coverage_today").on(table.operationalDate, table.wave, table.siteId),
]);

export const operationalSites = sqliteTable("operational_sites", {
  id: text("id").primaryKey(),
  siteName: text("site_name").notNull(),
  customerName: text("customer_name").notNull(),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_operational_sites_active").on(table.active, table.siteName),
]);

export const billingCases = sqliteTable("billing_cases", {
  id: text("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  servicePeriod: text("service_period").notNull(),
  amountSatang: integer("amount_satang").notNull(),
  dueAt: text("due_at").notNull(),
  documentState: text("document_state").notNull().default("incomplete"),
  submissionState: text("submission_state").notNull().default("unscheduled"),
  paymentState: text("payment_state").notNull().default("unpaid"),
  nextAction: text("next_action").notNull(),
  ownerName: text("owner_name").notNull(),
  appointmentAt: text("appointment_at"),
  location: text("location"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_billing_due").on(table.dueAt, table.paymentState),
]);

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  actor: text("actor").notNull(),
  summary: text("summary").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_audit_entity").on(table.entityType, table.entityId, table.createdAt),
]);
