CREATE TABLE `columns` (
	`id` text PRIMARY KEY NOT NULL,
	`table_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`primary_key` integer DEFAULT false NOT NULL,
	`foreign_key` integer DEFAULT false NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`business_terms` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'UNCHANGED' NOT NULL,
	`reviewed` integer DEFAULT false NOT NULL,
	`description_source` text DEFAULT 'human' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`table_id`) REFERENCES `tables`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `columns_table_name_uq` ON `columns` (`table_id`,`name`);--> statement-breakpoint
CREATE INDEX `columns_table_idx` ON `columns` (`table_id`);--> statement-breakpoint
CREATE TABLE `import_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`sql_hash` text NOT NULL,
	`plan_snapshot` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `import_runs_project_idx` ON `import_runs` (`project_id`);--> statement-breakpoint
CREATE INDEX `import_runs_created_idx` ON `import_runs` (`created_at`);--> statement-breakpoint
CREATE TABLE `relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`table_id` text NOT NULL,
	`target_table` text NOT NULL,
	`local_columns` text DEFAULT '[]' NOT NULL,
	`referenced_columns` text DEFAULT '[]' NOT NULL,
	`constraint_name` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`reviewed` integer DEFAULT false NOT NULL,
	`description_source` text DEFAULT 'human' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`table_id`) REFERENCES `tables`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `relationships_table_idx` ON `relationships` (`table_id`);--> statement-breakpoint
CREATE TABLE `tables` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`business_terms` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'UNCHANGED' NOT NULL,
	`reviewed` integer DEFAULT false NOT NULL,
	`description_source` text DEFAULT 'human' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tables_project_name_uq` ON `tables` (`project_id`,`name`);--> statement-breakpoint
CREATE INDEX `tables_project_idx` ON `tables` (`project_id`);--> statement-breakpoint
ALTER TABLE `projects` ADD `description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `business_terms` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `reviewed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `description_source` text DEFAULT 'human' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `reviewed_by` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `reviewed_at` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL;