CREATE TABLE `diagram_zones` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`tab_order` integer DEFAULT 0 NOT NULL,
	`members_json` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `diagram_zones_project_name_uq` ON `diagram_zones` (`project_id`,`name`);--> statement-breakpoint
CREATE INDEX `diagram_zones_project_idx` ON `diagram_zones` (`project_id`);