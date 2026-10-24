CREATE TYPE "public"."booking_status" AS ENUM('tentative', 'confirmed', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."booking_slot" AS ENUM('morning', 'lunch', 'evening', 'dinner', 'full_day');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"hotel_id" integer NOT NULL,
	"number" integer NOT NULL,
	"party_id" integer NOT NULL,
	"unit" "business_unit" NOT NULL,
	"title" text NOT NULL,
	"date" date NOT NULL,
	"end_date" date NOT NULL,
	"slot" "booking_slot" DEFAULT 'full_day' NOT NULL,
	"venue" text,
	"guests" integer,
	"rate" integer,
	"total_amount" integer NOT NULL,
	"status" "booking_status" DEFAULT 'confirmed' NOT NULL,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "booking_id" integer;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "booking_id" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_hotel_number" ON "bookings" USING btree ("hotel_id","number");--> statement-breakpoint
CREATE INDEX "bookings_hotel_date" ON "bookings" USING btree ("hotel_id","date");--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;