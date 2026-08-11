CREATE INDEX `idx_audit_entity` ON `audit_logs` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_billing_due` ON `billing_cases` (`due_at`,`payment_state`);--> statement-breakpoint
CREATE INDEX `idx_coverage_today` ON `coverage_slots` (`operational_date`,`wave`,`site_id`);