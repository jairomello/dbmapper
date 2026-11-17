CREATE TABLE `agent_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`scope` text NOT NULL,
	`table_id` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_expires_at` text,
	`requested_by` text NOT NULL,
	`error` text,
	`stats_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`table_id`) REFERENCES `tables`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agent_jobs_scope_check" CHECK("agent_jobs"."scope" in ('project', 'table')),
	CONSTRAINT "agent_jobs_status_check" CHECK("agent_jobs"."status" in ('queued', 'running', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `agent_jobs_project_created_idx` ON `agent_jobs` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_jobs_status_idx` ON `agent_jobs` (`status`);--> statement-breakpoint
CREATE TABLE `ai_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`job_id` text NOT NULL,
	`item_type` text NOT NULL,
	`item_id` text NOT NULL,
	`table_id` text,
	`suggested_description` text NOT NULL,
	`context_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_by` text NOT NULL,
	`decided_by` text,
	`decided_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `agent_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`table_id`) REFERENCES `tables`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ai_suggestions_item_type_check" CHECK("ai_suggestions"."item_type" in ('table', 'column')),
	CONSTRAINT "ai_suggestions_status_check" CHECK("ai_suggestions"."status" in ('pending', 'applied', 'rejected'))
);
--> statement-breakpoint
CREATE INDEX `ai_suggestions_project_status_idx` ON `ai_suggestions` (`project_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_suggestions_pending_uq` ON `ai_suggestions` (`item_type`,`item_id`) WHERE "ai_suggestions"."status" = 'pending';--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_project_created_idx` ON `events` (`project_id`,`created_at`);