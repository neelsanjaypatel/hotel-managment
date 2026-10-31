CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_log_hotel_at" ON "audit_log" USING btree ("hotel_id","at");--> statement-breakpoint
CREATE INDEX "expenses_supplier" ON "expenses" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "receipts_party" ON "receipts" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "receipts_booking" ON "receipts" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "sales_party" ON "sales" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "sales_booking" ON "sales" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "supplier_payments_supplier" ON "supplier_payments" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "users_hotel" ON "users" USING btree ("hotel_id");