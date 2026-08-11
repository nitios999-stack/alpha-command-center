CREATE TABLE `line_group_registry` (
	`id` text PRIMARY KEY NOT NULL,
	`group_name` text NOT NULL,
	`picture_url` text,
	`last_seen_at` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_line_registry_name` ON `line_group_registry` (`group_name`);--> statement-breakpoint
CREATE INDEX `idx_line_registry_seen` ON `line_group_registry` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `line_webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text,
	`event_type` text NOT NULL,
	`received_at` text NOT NULL,
	`summary` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_line_events_group_time` ON `line_webhook_events` (`group_id`,`received_at`);--> statement-breakpoint
CREATE INDEX `idx_line_events_type_time` ON `line_webhook_events` (`event_type`,`received_at`);