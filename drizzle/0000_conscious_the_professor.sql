CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `billing_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_name` text NOT NULL,
	`service_period` text NOT NULL,
	`amount_satang` integer NOT NULL,
	`due_at` text NOT NULL,
	`document_state` text DEFAULT 'incomplete' NOT NULL,
	`submission_state` text DEFAULT 'unscheduled' NOT NULL,
	`payment_state` text DEFAULT 'unpaid' NOT NULL,
	`next_action` text NOT NULL,
	`owner_name` text NOT NULL,
	`appointment_at` text,
	`location` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `coverage_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`operational_date` text NOT NULL,
	`wave` text NOT NULL,
	`site_id` text NOT NULL,
	`site_name` text NOT NULL,
	`customer_name` text NOT NULL,
	`post_name` text NOT NULL,
	`slot_label` text NOT NULL,
	`assigned_guard` text,
	`assignment_type` text DEFAULT 'regular' NOT NULL,
	`state` text NOT NULL,
	`verification_policy` text DEFAULT 'standard' NOT NULL,
	`deadline` text NOT NULL,
	`reported_at` text,
	`source` text,
	`late_minutes` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
