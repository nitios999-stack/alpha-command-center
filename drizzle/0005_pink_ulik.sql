CREATE TABLE `line_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`group_name` text NOT NULL,
	`picture_url` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_line_groups_site` ON `line_groups` (`site_id`);--> statement-breakpoint
CREATE INDEX `idx_line_groups_name` ON `line_groups` (`group_name`);