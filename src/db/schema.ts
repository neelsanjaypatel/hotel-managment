import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  boolean,
  date,
  timestamp,
  real,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

// All money columns are integer paise (₹1 = 100) so sums never drift.
// Every business table carries hotel_id; every query filters on it.

export const roleEnum = pgEnum("role", [
  "superadmin", // platform owner: onboards hotels, records subscription payments
  "admin", // hotel owner: full control of their hotel, the only one who edits master data
  "manager", // counter entries + attendance for own team
  "cashier", // counter entries only
  "partner", // read-only, everything
  "viewer", // read-only, dashboard + reports, no payroll
  "employee", // own salary / attendance only
]);

export const unitEnum = pgEnum("business_unit", ["restaurant", "rooms", "banquet"]);

// How a sale was paid. zomato/swiggy/credit create a receivable on a party.
export const saleModeEnum = pgEnum("sale_mode", ["cash", "upi", "card", "bank", "zomato", "swiggy", "credit"]);

// How money actually moved out (or in, for receipts).
export const payModeEnum = pgEnum("pay_mode", ["cash", "upi", "card", "bank"]);

export const payTypeEnum = pgEnum("pay_type", ["monthly", "daily"]);

export const attendanceEnum = pgEnum("attendance_status", [
  "P", // present
  "A", // absent
  "H", // half day
  "L", // paid leave
  "WO", // weekly off (paid for monthly staff)
]);

export const partyKindEnum = pgEnum("party_kind", ["aggregator", "credit", "banquet"]);

export const hotelStatusEnum = pgEnum("hotel_status", ["trial", "active", "suspended"]);

export const bookingStatusEnum = pgEnum("booking_status", ["tentative", "confirmed", "completed", "cancelled"]);

// Part of the day a banquet / restaurant booking takes. Rooms use date to end_date instead.
export const slotEnum = pgEnum("booking_slot", ["morning", "lunch", "evening", "dinner", "full_day"]);

// ---------- platform ----------

export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  priceMonthly: integer("price_monthly").notNull(), // paise
  maxEmployees: integer("max_employees"), // null = unlimited
  maxUsers: integer("max_users"),
  active: boolean("active").notNull().default(true),
});

export const hotels = pgTable("hotels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city"),
  phone: text("phone"),
  gstin: text("gstin"),
  hasRestaurant: boolean("has_restaurant").notNull().default(true),
  hasRooms: boolean("has_rooms").notNull().default(false),
  hasBanquet: boolean("has_banquet").notNull().default(false),
  planId: integer("plan_id")
    .notNull()
    .references(() => plans.id),
  status: hotelStatusEnum("status").notNull().default("trial"),
  trialEndsAt: date("trial_ends_at", { mode: "string" }),
  paidUntil: date("paid_until", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Subscription money received from a hotel; each row extends paid_until.
export const subscriptionPayments = pgTable("subscription_payments", {
  id: serial("id").primaryKey(),
  hotelId: integer("hotel_id")
    .notNull()
    .references(() => hotels.id),
  planId: integer("plan_id")
    .notNull()
    .references(() => plans.id),
  amount: integer("amount").notNull(),
  months: integer("months").notNull(),
  periodFrom: date("period_from", { mode: "string" }).notNull(),
  periodTo: date("period_to", { mode: "string" }).notNull(),
  method: text("method").notNull(), // upi / bank / cash / cheque
  reference: text("reference"),
  recordedBy: integer("recorded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- hotel ----------

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  hotelId: integer("hotel_id").references(() => hotels.id), // null only for superadmin
  name: text("name").notNull(),
  login: text("login").notNull().unique(), // phone number or username, unique across all hotels
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  employeeId: integer("employee_id"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 of the cookie token
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const employees = pgTable(
  "employees",
  {
    id: serial("id").primaryKey(),
    hotelId: integer("hotel_id")
      .notNull()
      .references(() => hotels.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    department: text("department").notNull(), // Kitchen, Service, Housekeeping, Front Office, Banquet...
    designation: text("designation"),
    payType: payTypeEnum("pay_type").notNull(),
    rate: integer("rate").notNull(), // paise: monthly salary or daily wage
    joinDate: date("join_date", { mode: "string" }).notNull(),
    managerUserId: integer("manager_user_id").references(() => users.id),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("employees_hotel_code").on(t.hotelId, t.code)],
);

export const attendance = pgTable(
  "attendance",
  {
    id: serial("id").primaryKey(),
    hotelId: integer("hotel_id")
      .notNull()
      .references(() => hotels.id),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    date: date("date", { mode: "string" }).notNull(),
    status: attendanceEnum("status").notNull(),
    otHours: real("ot_hours").notNull().default(0),
    markedBy: integer("marked_by")
      .notNull()
      .references(() => users.id),
    markedAt: timestamp("marked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("attendance_emp_date").on(t.employeeId, t.date), index("attendance_hotel_date").on(t.hotelId, t.date)],
);

// One row per hotel per business day. Entries can be added only while status = open.
export const dayBooks = pgTable(
  "day_books",
  {
    hotelId: integer("hotel_id")
      .notNull()
      .references(() => hotels.id),
    date: date("date", { mode: "string" }).notNull(),
    openingCash: integer("opening_cash").notNull().default(0),
    countedCash: integer("counted_cash"),
    // Cash taken out of the drawer and deposited in the bank at day close.
    cashDeposit: integer("cash_deposit").notNull().default(0),
    status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
    closedBy: integer("closed_by").references(() => users.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    note: text("note"),
  },
  (t) => [primaryKey({ columns: [t.hotelId, t.date] })],
);

// Zomato, Swiggy, credit customers, banquet clients: anyone who owes the hotel money.
export const parties = pgTable("parties", {
  id: serial("id").primaryKey(),
  hotelId: integer("hotel_id")
    .notNull()
    .references(() => hotels.id),
  name: text("name").notNull(),
  kind: partyKindEnum("kind").notNull(),
  phone: text("phone"),
  active: boolean("active").notNull().default(true),
});

// Future function / room / table booking. Its customer is a party, so advances and the
// final bill flow through receipts and sales like any other dues.
export const bookings = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    hotelId: integer("hotel_id")
      .notNull()
      .references(() => hotels.id),
    number: integer("number").notNull(), // BK-0001, per hotel
    partyId: integer("party_id")
      .notNull()
      .references(() => parties.id),
    unit: unitEnum("unit").notNull(),
    title: text("title").notNull(), // "Wedding reception", "Birthday party", "2 deluxe rooms"
    date: date("date", { mode: "string" }).notNull(), // event date / check-in
    endDate: date("end_date", { mode: "string" }).notNull(), // same as date, or check-out for rooms
    slot: slotEnum("slot").notNull().default("full_day"),
    venue: text("venue"), // hall name or room numbers
    guests: integer("guests"),
    rate: integer("rate"), // paise per plate / per night, optional
    totalAmount: integer("total_amount").notNull(),
    status: bookingStatusEnum("status").notNull().default("confirmed"),
    notes: text("notes"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("bookings_hotel_number").on(t.hotelId, t.number), index("bookings_hotel_date").on(t.hotelId, t.date)],
);

export const sales = pgTable(
  "sales",
  {
    id: serial("id").primaryKey(),
    hotelId: integer("hotel_id")
      .notNull()
      .references(() => hotels.id),
    date: date("date", { mode: "string" }).notNull(),
    unit: unitEnum("unit").notNull(),
    mode: saleModeEnum("mode").notNull(),
    amount: integer("amount").notNull(),
    partyId: integer("party_id").references(() => parties.id),
    reference: text("reference"), // bill no / room no / function name
    bookingId: integer("booking_id").references(() => bookings.id),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sales_hotel_date").on(t.hotelId, t.date)],
);

// Money received against a party's dues (Zomato payout, credit customer pays).
export const receipts = pgTable(
  "receipts",
  {
    id: serial("id").primaryKey(),
    hotelId: integer("hotel_id")
      .notNull()
      .references(() => hotels.id),
    date: date("date", { mode: "string" }).notNull(),
    partyId: integer("party_id")
      .notNull()
      .references(() => parties.id),
    mode: payModeEnum("mode").notNull(),
    amount: integer("amount").notNull(), // negative = refund paid back to the party
    note: text("note"),
    bookingId: integer("booking_id").references(() => bookings.id),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("receipts_hotel_date").on(t.hotelId, t.date)],
);

export const expenseCategories = pgTable("expense_categories", {
  id: serial("id").primaryKey(),
  hotelId: integer("hotel_id")
    .notNull()
    .references(() => hotels.id),
  name: text("name").notNull(),
  parentId: integer("parent_id"),
  // Labour Wages is special: an expense here must name an employee.
  isWages: boolean("is_wages").notNull().default(false),
  active: boolean("active").notNull().default(true),
});

export const expenses = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    hotelId: integer("hotel_id")
      .notNull()
      .references(() => hotels.id),
    date: date("date", { mode: "string" }).notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => expenseCategories.id),
    amount: integer("amount").notNull(),
    paidVia: payModeEnum("paid_via").notNull(),
    vendor: text("vendor"),
    note: text("note"),
    employeeId: integer("employee_id").references(() => employees.id),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("expenses_hotel_date").on(t.hotelId, t.date)],
);

// Advance to an employee; recovered from that month's salary.
export const advances = pgTable(
  "advances",
  {
    id: serial("id").primaryKey(),
    hotelId: integer("hotel_id")
      .notNull()
      .references(() => hotels.id),
    date: date("date", { mode: "string" }).notNull(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    amount: integer("amount").notNull(),
    paidVia: payModeEnum("paid_via").notNull(),
    note: text("note"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("advances_hotel_date").on(t.hotelId, t.date)],
);

// Salary handed to an employee for a month's work. Paid on `date` (cash drawer / bank that
// day), counted against `month`'s payroll so a salary paid on 5 Nov settles October.
export const salaryPayments = pgTable(
  "salary_payments",
  {
    id: serial("id").primaryKey(),
    hotelId: integer("hotel_id")
      .notNull()
      .references(() => hotels.id),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    month: text("month").notNull(), // YYYY-MM the salary is for
    date: date("date", { mode: "string" }).notNull(),
    amount: integer("amount").notNull(),
    paidVia: payModeEnum("paid_via").notNull(),
    note: text("note"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("salary_payments_hotel_date").on(t.hotelId, t.date), index("salary_payments_hotel_month").on(t.hotelId, t.month)],
);

// Owners of the hotel and their share of profit. A partner may also have a login (user_id).
export const partners = pgTable("partners", {
  id: serial("id").primaryKey(),
  hotelId: integer("hotel_id")
    .notNull()
    .references(() => hotels.id),
  name: text("name").notNull(),
  phone: text("phone"),
  shareBp: integer("share_bp").notNull(), // basis points: 2500 = 25%
  userId: integer("user_id").references(() => users.id),
  active: boolean("active").notNull().default(true),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  hotelId: integer("hotel_id"), // null for platform actions
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(), // create | delete | close_day | reopen_day | ...
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  data: jsonb("data"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export type Role = (typeof roleEnum.enumValues)[number];
export type SaleMode = (typeof saleModeEnum.enumValues)[number];
export type PayMode = (typeof payModeEnum.enumValues)[number];
export type Unit = (typeof unitEnum.enumValues)[number];
export type AttendanceStatus = (typeof attendanceEnum.enumValues)[number];
export type Hotel = typeof hotels.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
