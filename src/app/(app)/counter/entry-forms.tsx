"use client";

import { useState } from "react";
import { ActionForm, Chips, Input, Select } from "@/components/forms";
import { PhotoField } from "@/components/photo-field";
import { addAdvance, addExpense, addReceipt, addSale, addTransfer, type FormState } from "@/lib/actions";
import { PAY_MODE_LABEL, SALE_MODE_LABEL, UNIT_LABEL, rupeesPlain } from "@/lib/format";
import { useT } from "@/i18n/client";

type Opt = { value: number; label: string; kind?: string };
type Action = (state: FormState, fd: FormData) => Promise<FormState>;
const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));
const PAY_MODES = opts(PAY_MODE_LABEL);
const EXPENSE_MODES = [...PAY_MODES, { value: "credit", label: "On credit" }];

// Big amount box: numeric keypad on phones, focus returns here after each save.
function AmountInput({ defaultValue }: { defaultValue?: string }) {
  const t = useT();
  return (
    <label className="block">
      <span className="label">{t("Amount (₹)")}</span>
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
  const t = useT();
  const [unit, setUnit] = useState(val(initial, "unit") ?? units[0]);
  const [mode, setMode] = useState(val(initial, "mode") ?? "cash");
  return (
    <ActionForm action={action ?? addSale} submit={initial ? t("Save changes") : t("Add sale")} resetOnOk={!initial} wide>
      {!initial && <input type="hidden" name="date" value={date} />}
      <div className="space-y-3">
        {units.length > 1 && <Chips name="unit" label={t("Section")} options={opts(UNIT_LABEL).filter((o) => units.includes(o.value))} value={unit} onChange={setUnit} />}
        {units.length === 1 && <input type="hidden" name="unit" value={unit} />}
        <Chips name="mode" label={t("Received as")} options={opts(SALE_MODE_LABEL)} value={mode} onChange={setMode} />
        {mode === "credit" && <Select name="partyId" label={t("Credit customer")} options={creditParties} required placeholder={t("Choose...")} defaultValue={val(initial, "partyId")} />}
        <div className="grid grid-cols-2 gap-3">
          <AmountInput defaultValue={money(initial)} />
          <Input name="reference" label={t("Bill / room / note")} placeholder={t("optional")} defaultValue={val(initial, "reference")} />
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
  suppliers,
  action,
  initial,
}: Common & { categories: Opt[]; quickCategories: Opt[]; wageCategoryIds: number[]; workers: Opt[]; suppliers: Opt[] }) {
  const t = useT();
  const [cat, setCat] = useState(val(initial, "categoryId") ?? "");
  const [paidVia, setPaidVia] = useState(val(initial, "paidVia") ?? "cash");
  const isWages = wageCategoryIds.includes(Number(cat));
  return (
    <ActionForm action={action ?? addExpense} submit={initial ? t("Save changes") : t("Add expense")} resetOnOk={!initial} onOk={initial ? undefined : () => setCat("")} wide>
      {!initial && <input type="hidden" name="date" value={date} />}
      <div className="space-y-3">
        {quickCategories.length > 0 && (
          <div>
            <span className="label">{t("Most used")}</span>
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
          <span className="label">{t("Category")}</span>
          <select name="categoryId" className="field" required value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">{t("Choose...")}</option>
            {categories.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <Chips name="paidVia" label={t("Paid by")} options={EXPENSE_MODES} value={paidVia} onChange={setPaidVia} />
        <PhotoField name="photo" label={t("Bill photo (optional)")} kind="bill" current={initial?.attachmentId as number | null | undefined} />
        {(paidVia === "credit" || suppliers.length > 0) && (
          <Select
            name="supplierId"
            label={paidVia === "credit" ? t("Supplier (to be paid later)") : t("Supplier (optional)")}
            options={suppliers}
            required={paidVia === "credit"}
            placeholder={paidVia === "credit" ? t("Choose supplier...") : t("None")}
            defaultValue={val(initial, "supplierId")}
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <AmountInput defaultValue={money(initial)} />
          {isWages ? (
            <Select name="employeeId" label={t("Worker")} options={workers} required placeholder={t("Choose worker...")} defaultValue={val(initial, "employeeId")} />
          ) : (
            <Input name="vendor" label={t("Vendor / shop")} placeholder={t("optional")} defaultValue={val(initial, "vendor")} />
          )}
        </div>
        <Input name="note" label={t("Note")} placeholder={t("optional")} defaultValue={val(initial, "note")} />
      </div>
    </ActionForm>
  );
}

export function AdvanceForm({ date, employees, action, initial }: Common & { employees: Opt[] }) {
  const t = useT();
  const [paidVia, setPaidVia] = useState(val(initial, "paidVia") ?? "cash");
  const [recover, setRecover] = useState(initial?.installment == null ? "full" : "monthly");
  return (
    <ActionForm action={action ?? addAdvance} submit={initial ? t("Save changes") : t("Give advance")} resetOnOk={!initial} wide>
      {!initial && <input type="hidden" name="date" value={date} />}
      <div className="space-y-3">
        <Select name="employeeId" label={t("Employee")} options={employees} required placeholder={t("Choose...")} defaultValue={val(initial, "employeeId")} />
        <Chips name="paidVia" label={t("Paid by")} options={PAY_MODES} value={paidVia} onChange={setPaidVia} />
        {typeof initial?.installment === "number" && initial.installment > 0 && (
          <input type="hidden" name="installment" value={rupeesPlain(initial.installment)} />
        )}
        <Chips
          name="recover"
          label={t("Recover")}
          options={[
            { value: "full", label: t("Advance: cut this month") },
            { value: "monthly", label: t("Loan: I set the cut each month") },
          ]}
          value={recover}
          onChange={setRecover}
        />
        <div className="grid grid-cols-2 gap-3">
          <AmountInput defaultValue={money(initial)} />
          <Input name="note" label={t("Note")} placeholder={t("optional")} defaultValue={val(initial, "note")} />
        </div>
        {recover === "monthly" && <Input name="note" label={t("Note")} placeholder={t("optional")} defaultValue={val(initial, "note")} />}
      </div>
    </ActionForm>
  );
}

export function ReceiptForm({ date, parties, action, initial }: Common & { parties: Opt[] }) {
  const t = useT();
  const [mode, setMode] = useState(val(initial, "mode") ?? "bank");
  const [partyId, setPartyId] = useState(val(initial, "partyId") ?? "");
  // Zomato / Swiggy pay out less than they billed; the gap is their commission.
  const aggregator = parties.find((p) => String(p.value) === partyId)?.kind === "aggregator";
  return (
    <ActionForm action={action ?? addReceipt} submit={initial ? t("Save changes") : t("Record payment")} resetOnOk={!initial} wide>
      {!initial && <input type="hidden" name="date" value={date} />}
      <div className="space-y-3">
        <Select name="partyId" label={t("Received from")} options={parties} required placeholder={t("Choose...")} defaultValue={partyId} onChange={setPartyId} />
        <Chips name="mode" label={t("Received in")} options={PAY_MODES} value={mode} onChange={setMode} />
        <div className="grid grid-cols-2 gap-3">
          <AmountInput defaultValue={money(initial)} />
          {aggregator || (typeof initial?.commission === "number" && initial.commission > 0) ? (
            <Input
              name="commission"
              label={t("Commission / tax kept by them (₹)")}
              inputMode="decimal"
              placeholder="0"
              defaultValue={typeof initial?.commission === "number" && initial.commission ? rupeesPlain(initial.commission) : undefined}
            />
          ) : (
            <Input name="note" label={t("Note")} placeholder={t("optional")} defaultValue={val(initial, "note")} />
          )}
        </div>
        {(aggregator || (typeof initial?.commission === "number" && initial.commission > 0)) && (
          <>
            <p className="text-xs text-muted">{t("Amount = money that reached you. Commission settles the rest of their dues and counts as an expense.")}</p>
            <Input name="note" label={t("Note")} placeholder={t("e.g. Zomato weekly payout")} defaultValue={val(initial, "note")} />
          </>
        )}
      </div>
    </ActionForm>
  );
}

// Salary, supplier and partner payments are made elsewhere; here only amount / mode / note
// can be corrected.
export function PaidEditForm({ action, initial }: { action: Action; initial: Record<string, unknown> }) {
  const t = useT();
  const [paidVia, setPaidVia] = useState(val(initial, "paidVia") ?? "cash");
  return (
    <ActionForm action={action} submit={t("Save changes")} resetOnOk={false} wide>
      <div className="space-y-3">
        <Chips name="paidVia" label={t("Paid by")} options={PAY_MODES} value={paidVia} onChange={setPaidVia} />
        <div className="grid grid-cols-2 gap-3">
          <AmountInput defaultValue={money(initial)} />
          <Input name="note" label={t("Note")} placeholder={t("optional")} defaultValue={val(initial, "note")} />
        </div>
      </div>
    </ActionForm>
  );
}

// Money moved between the drawer and the bank during the day.
export function TransferForm({ date, action, initial }: { date: string; action?: Action; initial?: Record<string, unknown> }) {
  const t = useT();
  const [direction, setDirection] = useState(val(initial, "direction") ?? "to_bank");
  return (
    <ActionForm action={action ?? addTransfer} submit={initial ? t("Save changes") : t("Save")} resetOnOk={!initial} wide>
      {!initial && <input type="hidden" name="date" value={date} />}
      <div className="space-y-3">
        <Chips
          name="direction"
          label={t("Direction")}
          options={[
            { value: "to_bank", label: t("Cash → Bank (deposit)") },
            { value: "to_cash", label: t("Bank → Cash (withdraw)") },
          ]}
          value={direction}
          onChange={setDirection}
        />
        <div className="grid grid-cols-2 gap-3">
          <AmountInput defaultValue={money(initial)} />
          <Input name="note" label={t("Note")} placeholder={t("optional")} defaultValue={val(initial, "note")} />
        </div>
      </div>
    </ActionForm>
  );
}

// Pay a supplier or record a partner withdrawal: amount, mode, note, plus hidden ids.
export function PaidForm({
  action,
  hidden,
  submit,
  extra,
}: {
  action: Action;
  hidden: Record<string, string | number>;
  submit: string;
  extra?: React.ReactNode;
}) {
  const t = useT();
  const [paidVia, setPaidVia] = useState("cash");
  return (
    <ActionForm action={action} submit={submit} wide>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="space-y-3">
        {extra}
        <Chips name="paidVia" label={t("Paid by")} options={PAY_MODES} value={paidVia} onChange={setPaidVia} />
        <div className="grid grid-cols-2 gap-3">
          <AmountInput />
          <Input name="note" label={t("Note")} placeholder={t("optional")} />
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
  suppliers: Opt[];
  employees: Opt[];
  parties: Opt[];
}) {
  const t = useT();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("sale");
  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="grid grid-cols-4 gap-1 border-b border-line p-1.5" role="tablist" aria-label={t("Entry type")}>
        {TABS.map((tb) => (
          <button
            key={tb.key}
            type="button"
            role="tab"
            aria-selected={tab === tb.key}
            onClick={() => setTab(tb.key)}
            className={`rounded-lg px-2 py-2.5 text-sm font-semibold transition-colors ${
              tab === tb.key ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {t(tb.label)}
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
            suppliers={props.suppliers}
          />
        )}
        {tab === "advance" && <AdvanceForm date={props.date} employees={props.employees} />}
        {tab === "receipt" && <ReceiptForm date={props.date} parties={props.parties} />}
      </div>
    </section>
  );
}
