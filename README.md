# Hotel Desk

Subscription app sold to many hotels. Each hotel (restaurant, rooms and/or banquet hall) gets:
daily counter (sales by cash / UPI / card / bank / Zomato / Swiggy / credit),
category-wise expenses, cash drawer close, employee advances, attendance,
payroll, dues and partner reports.

Stack: Next.js 16 (App Router, server actions) + Drizzle ORM + Postgres.
Locally the database is embedded Postgres (PGlite, in `.data/`), so nothing
needs installing. In the cloud it is Supabase Postgres (Mumbai region).

## How hotels come on board

1. **Sign up** at `/signup`: hotel name, city, sections (restaurant / rooms /
   banquet), owner name, mobile number (the login) and password. The hotel is
   created on a **14-day free trial** (Growth plan limits) with default expense
   categories and Zomato / Swiggy parties, and the owner is logged in.
   The platform owner can also onboard a hotel from the Platform console.
2. **Get ready checklist** on the owner's dashboard: add employees, create
   logins for managers and partners, set opening cash and first sale, close the
   first day.
3. **Pay**: the hotel pays by UPI / bank (instructions on `/billing`, set with
   `PLATFORM_PAYMENT_NOTE`). The platform owner records the payment on the
   hotel's page; that sets the plan and extends "paid until". Paying during the
   trial keeps the remaining trial days.
4. **Renewal**: 7 days before the end a banner warns the hotel. After the end
   there are 3 grace days with entries still allowed, then the hotel becomes
   **view-only** (data is never deleted). A suspended hotel sees only Billing.

Plans (editable in Platform > Plans): Starter ₹999/mo (25 employees, 5 logins),
Growth ₹1,999/mo (100 employees, 15 logins), Pro ₹3,499/mo (unlimited). Limits
are enforced when adding employees and logins. These prices are placeholders.

Every hotel's data is separated by `hotel_id` on every table; every query and
server action filters on the logged-in user's hotel.

## Run locally

```bash
npm install
npm run seed -- --demo   # platform owner + two demo hotels; logins in .data/logins.txt
npm run dev              # http://localhost:3420
```

Demo: `platform` is the platform owner; `admin` owns "Shree Palace" (paying,
45 days of data, plus manager / cashier / partner / viewer / employee logins);
`sagar` owns "Sagar Residency" (on trial). `npm run seed` without `--demo`
creates only the plans and the platform owner login.
To start over locally: stop the server and delete `.data/pglite`. Always stop
the dev server normally; a hard kill can leave the local database unreadable.

## Salaries, profit and partners

- **Pay salary** from Payroll: per employee ("Pay") or "Pay all balances" for
  the month. The payment leaves today's counter (cash drawer or bank) and is
  counted against the month it is for, so October salary paid on 5 November
  settles October. Payroll balance = earned - advances - daily wages paid -
  salary paid. Each employee has a printable payslip (`/payslip/[id]`), also
  linked from My Salary.
- **Profit after salaries** (dashboard and Partners page) = income - expenses
  - salaries earned by all staff in the month. Daily wages paid from the
  counter are counted once, as salary.
- **Partner shares**: owner sets each partner's % in Settings (total up to
  100%). The Partners page shows each partner's share of the month's profit
  and of the financial year (April-March) so far. A partner's own row is
  highlighted when their login is linked.

## Counter, edits and activity log

- The counter shows one form at a time (Sale / Expense / Advance / Received)
  with tap buttons for payment mode, one-tap "most used" expense categories,
  and a big amount box that keeps focus for the next entry.
- Tap any entry in the day's list to edit or delete it (own entries, or any
  for the owner, only while the day is open; booking entries are changed from
  the booking).
- **Activity log** (owner and partners): every add, change (with before ->
  after), delete, day close / reopen, by whom and when, per day.
- **Install as an app**: open the site on a phone and use "Add to Home
  screen"; it opens full screen with the Hotel Desk icon.

## Bookings (banquet, rooms, tables)

A booking is made for a future date with customer name and mobile, occasion,
date and time slot (or check-in / check-out for rooms), hall or room numbers,
guests / plates, rate and total. Each booking gets a number (BK-0001, per hotel)
and its own customer account, so money flows through the normal books:

- **Advance** taken while booking (or later) is a payment received today. It
  shows in today's counter as cash / UPI / bank. It is not income yet.
- **Confirmation slip** (`/bookings/[id]/slip`): print / save as PDF, or send
  on WhatsApp (opens WhatsApp with the details filled in, to the customer's
  number).
- **Clash check**: the same hall (same date and time slot, or full day) or the
  same room numbers (overlapping nights) cannot be booked twice.
- **Complete** (on or after the date): the final bill becomes today's sale on
  the customer's account; advances are adjusted and the balance shows in Dues.
- **Cancel**: refund part or all of the advance; whatever is kept is today's
  income as a cancellation charge.
- Calendar view, upcoming list, past-date bookings still open, and the next 7
  days on the dashboard.

Managers and cashiers can create bookings and take payments; completing or
cancelling needs a manager or the owner.

## Roles

| Role | Can do |
|---|---|
| superadmin | Platform owner (you). Sees all hotels, records subscription payments, extends trials, suspends hotels, edits plan prices. Cannot see inside a hotel's counter. |
| admin | Everything. Only role that adds or edits employees, logins, categories, parties, and reopens closed days. |
| manager | Counter entries, close the day, attendance for workers assigned to them. No salary figures. |
| cashier | Counter entries only. |
| partner | Read everything (dashboard, counter, payroll, partner shares, activity log, reports). Cannot add or change anything. |
| viewer | Read dashboard, counter and reports. No payroll. |
| employee | Own attendance calendar, salary calculation and advances. |

Staff can enter only for today and yesterday, and only while the day is open.
Once a day is closed it is locked until admin reopens it. Every create, delete,
close and reopen is written to `audit_log`.

## How the numbers work

- Money is stored as integer paise.
- **Cash drawer:** opening cash (yesterday's counted cash) + cash sales + cash
  payments received - cash expenses - cash advances - cash deposited to bank
  = what the drawer should have. The difference from the counted cash is the
  day's short / excess.
- **Dues:** Zomato, Swiggy and credit sales are billed to a party; payments
  received reduce the balance.
- **Payroll:** monthly staff earn salary / days-in-month per paid day (present,
  leave, week off; half day = 0.5). Daily staff earn wage per day worked.
  Overtime = one day's pay / 8 per hour. Advances and daily wages already paid
  from the counter (Labour Wages category, linked to the worker) are deducted.

## Deploy (Supabase + Vercel)

1. Create a Supabase project in region `ap-south-1` (Mumbai). Copy the
   **Transaction pooler** connection string.
2. `DATABASE_URL="postgres://..." npm run seed` once. It runs migrations and
   creates the plans and the `platform` login; the password is in
   `.data/logins.txt` on your machine.
3. Import the repo on Vercel, set `DATABASE_URL` and `PLATFORM_PAYMENT_NOTE`
   (your UPI ID / bank details / WhatsApp number for renewals), deploy.

Schema changes: edit `src/db/schema.ts`, run `npm run db:generate`; migrations
in `drizzle/` apply automatically on server start.

## Not built yet (next phases)

- Online payment (Razorpay) so hotels renew themselves; today the platform
  owner records each payment by hand.
- Sign-up protection (OTP on the mobile number, rate limit).
- WhatsApp daily summary to partners at day close, plus alerts (cash short,
  expense spikes).
- WhatsApp agent: partners ask "today's sale?" and get answers from the data
  (read-only).
- Petpooja sales import, so restaurant sales do not need manual entry.
- Bill photo upload on expenses, Gujarati UI, PDF salary slips.
