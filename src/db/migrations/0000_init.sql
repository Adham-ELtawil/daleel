CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`problem_id` text NOT NULL,
	`parent_attempt_id` text,
	`language` text NOT NULL,
	`code` text NOT NULL,
	`code_hash` text NOT NULL,
	`verdict_reported` text,
	`verdict_test_no` integer,
	`student_note` text,
	`locale` text NOT NULL,
	`status` text NOT NULL,
	`max_hint_level` integer DEFAULT 0 NOT NULL,
	`solved_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `attempts_user_created_idx` ON `attempts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `attempts_problem_code_locale_idx` ON `attempts` (`problem_id`,`code_hash`,`locale`);--> statement-breakpoint
CREATE TABLE `diagnoses` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`result_json` text NOT NULL,
	`bug_class` text NOT NULL,
	`topics_json` text NOT NULL,
	`confidence` real NOT NULL,
	`model` text NOT NULL,
	`reasoning_effort` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `diagnoses_attempt_id_unique` ON `diagnoses` (`attempt_id`);--> statement-breakpoint
CREATE TABLE `hint_ladders` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`locale` text NOT NULL,
	`levels_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hint_ladders_attempt_locale_unique` ON `hint_ladders` (`attempt_id`,`locale`);--> statement-breakpoint
CREATE TABLE `hint_reveals` (
	`attempt_id` text NOT NULL,
	`level` integer NOT NULL,
	`revealed_at` integer NOT NULL,
	PRIMARY KEY(`attempt_id`, `level`),
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `llm_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`step` text NOT NULL,
	`attempt_id` text,
	`model` text NOT NULL,
	`request_hash` text NOT NULL,
	`status` text NOT NULL,
	`http_status` integer,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`cached_tokens` integer NOT NULL,
	`reasoning_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real NOT NULL,
	`latency_ms` integer NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `llm_calls_created_idx` ON `llm_calls` (`created_at`);--> statement-breakpoint
CREATE TABLE `problems` (
	`id` text PRIMARY KEY NOT NULL,
	`judge` text NOT NULL,
	`external_id` text NOT NULL,
	`url` text,
	`title` text NOT NULL,
	`statement_md` text NOT NULL,
	`input_spec_md` text NOT NULL,
	`output_spec_md` text NOT NULL,
	`notes_md` text,
	`samples_json` text NOT NULL,
	`time_limit_ms` integer NOT NULL,
	`memory_limit_mb` integer NOT NULL,
	`rating` integer,
	`tags_json` text NOT NULL,
	`contest_id` text,
	`content_hash` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `problems_judge_external_id_unique` ON `problems` (`judge`,`external_id`);--> statement-breakpoint
CREATE TABLE `stress_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`status` text NOT NULL,
	`runner` text NOT NULL,
	`brute_code` text,
	`tests_json` text NOT NULL,
	`failing_input` text,
	`expected_output` text,
	`actual_output` text,
	`compile_output` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stress_runs_attempt_id_unique` ON `stress_runs` (`attempt_id`);--> statement-breakpoint
CREATE TABLE `team_members` (
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`team_id`, `user_id`),
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `team_members_user_idx` ON `team_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`coach_id` text NOT NULL,
	`invite_code` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`coach_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_invite_code_unique` ON `teams` (`invite_code`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`role` text NOT NULL,
	`locale` text NOT NULL,
	`cf_handle` text,
	`is_guest` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_unique` ON `users` (`handle`);--> statement-breakpoint
CREATE TABLE `walkthroughs` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`locale` text NOT NULL,
	`explanation_json` text NOT NULL,
	`trace_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `walkthroughs_attempt_locale_unique` ON `walkthroughs` (`attempt_id`,`locale`);--> statement-breakpoint
CREATE TABLE `weekly_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`week_start` text NOT NULL,
	`locale` text NOT NULL,
	`stats_json` text NOT NULL,
	`report_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_reports_team_week_locale_unique` ON `weekly_reports` (`team_id`,`week_start`,`locale`);