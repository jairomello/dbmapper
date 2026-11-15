CREATE TABLE `login_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`identity` text NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`attempted_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_attempts_identity_idx` ON `login_attempts` (`identity`,`attempted_at`);--> statement-breakpoint
CREATE INDEX `login_attempts_attempted_at_idx` ON `login_attempts` (`attempted_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'MEMBER' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "users_role_check" CHECK("users"."role" in ('ADMIN', 'MEMBER', 'VIEWER'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);