CREATE TABLE `operational_sites` (
	`id` text PRIMARY KEY NOT NULL,
	`site_name` text NOT NULL,
	`customer_name` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_operational_sites_active` ON `operational_sites` (`active`,`site_name`);