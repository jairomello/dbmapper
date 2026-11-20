CREATE TABLE `diagram_layouts` (
	`project_id` text NOT NULL,
	`zone_name` text DEFAULT 'Principal' NOT NULL,
	`positions_json` text DEFAULT '{}' NOT NULL,
	`viewport_x` real DEFAULT 0 NOT NULL,
	`viewport_y` real DEFAULT 0 NOT NULL,
	`zoom` real DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_by` text,
	PRIMARY KEY(`project_id`, `zone_name`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
