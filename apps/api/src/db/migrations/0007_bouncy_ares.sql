CREATE TABLE `schema_baselines` (
	`project_id` text PRIMARY KEY NOT NULL,
	`document_json` text NOT NULL,
	`captured_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`captured_by` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`captured_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
