CREATE TABLE "bookings" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"appointment" text NOT NULL,
	"slot" text NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY,
	"phone" text NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" text PRIMARY KEY,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_appointment_slot_unique" ON "bookings" ("appointment","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_phone_unique" ON "profiles" ("phone");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id");