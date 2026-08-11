CREATE TABLE `shift_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`wave` text NOT NULL,
	`post_name` text NOT NULL,
	`slot_label` text NOT NULL,
	`assigned_guard` text,
	`deadline` text NOT NULL,
	`verification_policy` text DEFAULT 'standard' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_shift_templates_wave_active` ON `shift_templates` (`wave`,`active`,`site_id`);--> statement-breakpoint
CREATE INDEX `idx_shift_templates_site_slot` ON `shift_templates` (`site_id`,`wave`,`post_name`,`slot_label`);