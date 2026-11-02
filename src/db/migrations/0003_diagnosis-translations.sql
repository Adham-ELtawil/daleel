CREATE TABLE `diagnosis_translations` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`locale` text NOT NULL,
	`public_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `diagnosis_translations_attempt_locale_unique` ON `diagnosis_translations` (`attempt_id`,`locale`);