import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

export const shiftTemplates = sqliteTable("shift_templates", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  wave: text("wave").notNull(),
  postName: text("post_name").notNull(),
  slotLabel: text("slot_label").notNull(),
  assignedGuard: text("assigned_guard"),
  deadline: text("deadline").notNull(),
  verificationPolicy: text("verification_policy").notNull().default("standard"),
  active: integer("active").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_shift_templates_wave_active").on(table.wave, table.active, table.siteId),
  index("idx_shift_templates_site_slot").on(table.siteId, table.wave, table.postName, table.slotLabel),
]);

export const systemSettings = sqliteTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const lineGroups = sqliteTable("line_groups", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  groupName: text("group_name").notNull(),
  pictureUrl: text("picture_url"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("uq_line_groups_site").on(table.siteId),
  index("idx_line_groups_name").on(table.groupName),
]);

// The registry holds groups discovered by the verified webhook. line_groups is
// deliberately kept as the manager-owned one-point-to-one-group mapping.
export const lineGroupRegistry = sqliteTable("line_group_registry", {
  id: text("id").primaryKey(),
  groupName: text("group_name").notNull(),
  pictureUrl: text("picture_url"),
  lastSeenAt: text("last_seen_at"),
  source: text("source").notNull().default("manual"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_line_registry_name").on(table.groupName),
  index("idx_line_registry_seen").on(table.lastSeenAt),
]);

export const lineWebhookEvents = sqliteTable("line_webhook_events", {
  id: text("id").primaryKey(),
  groupId: text("group_id"),
  eventType: text("event_type").notNull(),
  messageType: text("message_type"),
  senderKey: text("sender_key"),
  receivedAt: text("received_at").notNull(),
  summary: text("summary").notNull(),
}, (table) => [
  index("idx_line_events_group_time").on(table.groupId, table.receivedAt),
  index("idx_line_events_type_time").on(table.eventType, table.receivedAt),
  index("idx_line_events_report_candidate").on(table.groupId, table.messageType, table.receivedAt),
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

export const lineAutoReplyConfigs = sqliteTable("line_auto_reply_configs", {
  groupId: text("group_id").primaryKey(),
  mode: text("mode").notNull().default("silent"),
  stickerPackageId: text("sticker_package_id"),
  stickerId: text("sticker_id"),
  cooldownMinutes: integer("cooldown_minutes").notNull().default(60),
  activeHoursStart: text("active_hours_start").notNull().default("06:00"),
  activeHoursEnd: text("active_hours_end").notNull().default("22:00"),
  dailyLimit: integer("daily_limit").notNull().default(5),
  dailyCount: integer("daily_count").notNull().default(0),
  dailyCountDate: text("daily_count_date"),
  lastReplyAt: text("last_reply_at"),
  lastInboundEventId: text("last_inbound_event_id"),
  updatedAt: text("updated_at").notNull(),
});

export const lineStickerPresets = sqliteTable("line_sticker_presets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  packageId: text("package_id").notNull(),
  stickerId: text("sticker_id").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const lineOutboundAudit = sqliteTable("line_outbound_audit", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  triggerEventId: text("trigger_event_id"),
  actionType: text("action_type").notNull(), // 'auto-reply', 'manual-batch'
  stickerPackageId: text("sticker_package_id").notNull(),
  stickerId: text("sticker_id").notNull(),
  status: text("status").notNull(), // 'sent', 'skipped', 'failed'
  skipReason: text("skip_reason"),
  sentAt: text("sent_at").notNull(),
}, (table) => [
  index("idx_outbound_audit_group_time").on(table.groupId, table.sentAt),
]);

export const lineManualBatchJobs = sqliteTable("line_manual_batch_jobs", {
  id: text("id").primaryKey(),
  groupIds: text("group_ids").notNull(), // JSON array of group IDs
  stickerPackageId: text("sticker_package_id").notNull(),
  stickerId: text("sticker_id").notNull(),
  status: text("status").notNull().default("pending"), // 'pending', 'completed', 'failed'
  createdAt: text("created_at").notNull(),
  createdBy: text("created_by").notNull(),
});
