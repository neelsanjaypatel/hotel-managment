"use client";

import { useState } from "react";
import { ActionForm, Chips, Input, Select } from "@/components/forms";
import { addAdvance, addExpense, addReceipt, addSale, type FormState } from "@/lib/actions";
import { PAY_MODE_LABEL, SALE_MODE_LABEL, UNIT_LABEL, rupeesPlain } from "@/lib/format";

type Opt = { value: number; label: string };
type Action = (state: FormState, fd: FormData) => Promise<FormState>;
const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));
const PAY_MODES = opts(PAY_MODE_LABEL);

// Big amount box: numeric keypad on phones, focus returns here after each save.
function AmountInput({ defaultValue }: { defaultValue?: string }) {
  return (
    <label className="block">
      <span className="label">Amount (₹)</span>
      <input
        name="amount"
        className="field num py-3 text-xl font-semibold"
        inputMode="decimal"
        required
        placeholder="0"
        autoComplete="off"
        defaultValue={defaultValue}
        data-refocus
      />
    </label>
  );
}

// Each form is used to add an entry (date set) or, with `action` + `initial`, to edit one.
type Common = { date: string; action?: Action; initial?: Record<string, unknown> };

const val = (i: Record<string, unknown> | undefined, k: string) => (i?.[k] == null ? undefined : String(i[k]));
const money = (i: Record<string, unknown> | undefined) => (typeof i?.amount === "number" ? rupeesPlain(i.amount) : undefined);

export function SaleForm({ date, units, creditParties, action, initial }: Common & { units: string[]; creditParties: Opt[] }) {
  const [unit, setUnit] = useState(val(initial, "unit") ?? units[0]);
  const [mode, setMode] = useState(val(initial, "mode") ?? "cash");
  return (
    <ActionForm action={action ?? addSale} submit={initial ? "Save changes" : "Add sale"} resetOnOk={!initial} wide>
      {!initial && <input type="hidden" name="date" value={date} />}
      <div className="space-y-3">
        {units.length > 1 && <Chips name="unit" label="Section" options={opts(UNIT_LABEL).filter((o) => units.includes(o.value))} value={unit} onChange={setUnit} />}
        {units.length === 1 && <input type="hidden" name="unit" value={unit} />}
        <Chips name="mode" label="Received as" options={opts(SALE_MODE_LABEL)} value={mode} onChange={setMode} />
        {mode === "credit" && <Select name="partyId" label="Credit customer" options={creditParties} required placeholder="Choose..." defaultValue={val(initial, "partyId")} />}
        <div className="grid grid-cols-2 gap-3">
          <AmountInput defaultValue={money(initial)} />
          <Input name="reference" label="Bill / room / note" placeholder="optional" defaultValue={val(initial, "reference")} />
        </div>
      </div>
    </ActionForm>
  );
}

export function ExpenseForm({
  date,
  categories,
  quickCategories,
  wageCategoryIds,
  workers,
  action,
  initial,
}: Common & { categories: Opt[]; quickCategories: Opt[]; wageCategoryIds: number[]; workers: Opt[] }) {
  const [cat, setCat] = useState(val(initial, "categoryId") ?? "");
  const [paidVia, setPaidVia] = useState(val(initial, "paidVia") ?? "cash");
  const isWages = wageCategoryIds.includes(Number(cat));
  return (
    <ActionForm action={action ?? addExpense} submit={initial ? "Save changes" : "Add expense"} resetOnOk={!initial} onOk={initial ? undefined : () => setCat("")} wide>
      {!initial && <input type="hidden" name="date" value={date} />}
      <div className="space-y-3">
        {quickCategories.length > 0 && (
          <div>
            <span className="label">Most used</span>
            <div className="flex flex-wrap gap-1.5">
              {quickCategories.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCat(String(c.value))}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    cat === String(c.value) ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface hover:bg-surface-2"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className="block">
          <span className="label">Category</span>
          <select name="categoryId" className="field" required value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Choose...</option>
            {categories.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <Chips name="paidVia" label="Paid by" options={PAY_MODES} value={paidVia} onChange={setPaidVia} />
        <div className="grid grid-cols-2 gap-3">
          <AmountInput defaultValue={money(initial)} />
          {isWages ? (
            <Select name="employeeId" label="Worker" options={workers} required placeholder="Choose worker..." defaultValue={val(initial, "employeeId")} />
          ) : (
            <Input name="vendor" label="Vendor / shop" placeholder="optional" defaultValue={val(initial, "vendor")} />
          )}
        </div>
        <Input name="note" label="Note" placeholder="optional" defaultValue={val(initial, "note")} />
      </div>
    </ActionForm>
  );
}

export function AdvanceForm({ date, employees, action, initial }: Common & { employees: Opt[] }) {
  const [paidVia, setPaidVia] = useState(val(initial, "paidVia") ?? "cash");
  return (
    <ActionForm action={action ?? addAdvance} submit={initial ? "Save changes" : "Give advance"} resetOnOk={!initial} wide>
      {!initial && <input type="hidden" name="date" value={date} />}
      <div className="space-y-3">
        <Select name="employeeId" label="Employee" options={employees} required placeholder="Choose..." defaultValue={val(initial, "employeeId")} />
        <Chips name="paidVia" label="Paid by" options={PAY_MODES} value={paidVia} onChange={setPaidVia} />
        <div className="grid grid-cols-2 gap-3">
          <AmountInput defaultValue={money(initial)} />
          <Input name="note" label="Note" placeholder="optional" defaultValue={val(initial, "note")} />
        </div>
      </div>
    </ActionForm>
  );
}

export function ReceiptForm({ date, parties, action, initial }: Common & { parties: Opt[] }) {
  const [mode, setMode] = useState(val(initial, "mode") ?? "bank");
  return (
    <ActionForm action={action ?? addReceipt} submit={initial ? "Save changes" : "Record payment"} resetOnOk={!initial} wide>
      {!initial && <input type="hidden" name="date" value={date} />}
      <div className="space-y-3">
        <Select name="partyId" label="Received from" options={parties} required placeholder="Choose..." defaultValue={val(initial, "partyId")} />
        <Chips name="mode" label="Received in" options={PAY_MODES} value={mode} onChange={setMode} />
        <div className="grid grid-cols-2 gap-3">
          <AmountInput defaultValue={money(initial)} />
          <Input name="note" label="Note" placeholder="e.g. Zomato weekly payout" defaultValue={val(initial, "note")} />
        </div>
      </div>
    </ActionForm>
  );
}

// Salary payments are made from Payroll; here only amount / mode / note can be corrected.
export function SalaryEditForm({ action, initial }: { action: Action; initial: Record<string, unknown> }) {
  const [paidVia, setPaidVia] = useState(val(initial, "paidVia") ?? "cash");
  return (
    <ActionForm action={action} submit="Save changes" resetOnOk={false} wide>
      <div className="space-y-3">
        <Chips name="paidVia" label="Paid by" options={PAY_MODES} value={paidVia} onChange={setPaidVia} />
        <div className="grid grid-cols-2 gap-3">
          <AmountInput defaultValue={money(initial)} />
          <Input name="note" label="Note" placeholder="optional" defaultValue={val(initial, "note")} />
        </div>
      </div>
    </ActionForm>
  );
}

const TABS = [
  { key: "sale", label: "Sale" },
  { key: "expense", label: "Expense" },
  { key: "advance", label: "Advance" },
  { key: "receipt", label: "Received" },
] as const;

// One form at a time behind a tab bar, so the counter fits a phone screen.
export function EntryPanel(props: {
  date: string;
  units: string[];
  creditParties: Opt[];
  categories: Opt[];
  quickCategories: Opt[];
  wageCategoryIds: number[];
  workers: Opt[];
  employees: Opt[];
  parties: Opt[];
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("sale");
  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="grid grid-cols-4 gap-1 border-b border-line p-1.5" role="tablist" aria-label="Entry type">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-2 py-2.5 text-sm font-semibold transition-colors ${
              tab === t.key ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-4" role="tabpanel">
        {tab === "sale" && <SaleForm date={props.date} units={props.units} creditParties={props.creditParties} />}
        {tab === "expense" && (
          <ExpenseForm
            date={props.date}
            categories={props.categories}
            quickCategories={props.quickCategories}
            wageCategoryIds={props.wageCategoryIds}
            workers={props.workers}
          />
        )}
        {tab === "advance" && <AdvanceForm date={props.date} employees={props.employees} />}
        {tab === "receipt" && <ReceiptForm date={props.date} parties={props.parties} />}
      </div>
    </section>
  );
}
