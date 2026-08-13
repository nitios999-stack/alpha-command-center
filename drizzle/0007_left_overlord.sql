CREATE TABLE `line_auto_reply_configs` (
	`group_id` text PRIMARY KEY NOT NULL,
	`mode` text DEFAULT 'silent' NOT NULL,
	`sticker_package_id` text,
	`sticker_id` text,
	`cooldown_minutes` integer DEFAULT 60 NOT NULL,
	`active_hours_start` text DEFAULT '06:00' NOT NULL,
	`active_hours_end` text DEFAULT '22:00' NOT NULL,
	`daily_limit` integer DEFAULT 5 NOT NULL,
	`daily_count` integer DEFAULT 0 NOT NULL,
	`daily_count_date` text,
	`last_reply_at` text,
	`last_inbound_event_id` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `line_manual_batch_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`group_ids` text NOT NULL,
	`sticker_package_id` text NOT NULL,
	`sticker_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `line_outbound_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`trigger_event_id` text,
	`action_type` text NOT NULL,
	`sticker_package_id` text NOT NULL,
	`sticker_id` text NOT NULL,
	`status` text NOT NULL,
	`skip_reason` text,
	`sent_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_outbound_audit_group_time` ON `line_outbound_audit` (`group_id`,`sent_at`);--> statement-breakpoint
CREATE TABLE `line_sticker_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`package_id` text NOT NULL,
	`sticker_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `line_webhook_events` ADD `message_type` text;--> statement-breakpoint
ALTER TABLE `line_webhook_events` ADD `sender_key` text;--> statement-breakpoint
CREATE INDEX `idx_line_events_report_candidate` ON `line_webhook_events` (`group_id`,`message_type`,`received_at`);