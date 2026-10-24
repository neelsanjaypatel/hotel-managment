"use client";

import { useState } from "react";
import { ActionForm, Input, Select } from "@/components/forms";
import { addAdvance, addExpense, addReceipt, addSale } from "@/lib/actions";
import { PAY_MODE_LABEL, SALE_MODE_LABEL, UNIT_LABEL } from "@/lib/format";

type Opt = { value: number; label: string };
const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));

export function SaleForm({ date, units, creditParties }: { date: string; units: string[]; creditParties: Opt[] }) {
  const [mode, setMode] = useState("cash");
  return (
    <ActionForm action={addSale} submit="Add sale">
      <input type="hidden" name="date" value={date} />
      <div className="grid grid-cols-2 gap-3">
        <Select name="unit" label="Section" options={opts(UNIT_LABEL).filter((o) => units.includes(o.value))} defaultValue={units[0]} />
        <Select name="mode" label="Received as" options={opts(SALE_MODE_LABEL)} defaultValue="cash" onChange={setMode} />
        <Input name="amount" label="Amount (₹)" inputMode="decimal" required placeholder="0" />
        <Input name="reference" label="Bill / room / note" placeholder="optional" />
        {mode === "credit" && (
          <div className="col-span-2">
            <Select name="partyId" label="Credit customer" options={creditParties} required placeholder="Choose..." />
          </div>
        )}
      </div>
    </ActionForm>
  );
}

export function ExpenseForm({
  date,
  categories,
  wageCategoryIds,
  workers,
}: {
  date: string;
  categories: Opt[];
  wageCategoryIds: number[];
  workers: Opt[];
}) {
  const [cat, setCat] = useState("");
  const isWages = wageCategoryIds.includes(Number(cat));
  return (
    <ActionForm action={addExpense} submit="Add expense">
      <input type="hidden" name="date" value={date} />
      <div className="grid grid-cols-2 gap-3">
        <Select name="categoryId" label="Category" options={categories} required placeholder="Choose..." onChange={setCat} />
        <Input name="amount" label="Amount (₹)" inputMode="decimal" required placeholder="0" />
        <Select name="paidVia" label="Paid by" options={opts(PAY_MODE_LABEL)} defaultValue="cash" />
        {isWages ? (
          <Select name="employeeId" label="Worker" options={workers} required placeholder="Choose worker..." />
        ) : (
          <Input name="vendor" label="Vendor / shop" placeholder="optional" />
        )}
        <div className="col-span-2">
          <Input name="note" label="Note" placeholder="optional" />
        </div>
      </div>
    </ActionForm>
  );
}

export function AdvanceForm({ date, employees }: { date: string; employees: Opt[] }) {
  return (
    <ActionForm action={addAdvance} submit="Give advance">
      <input type="hidden" name="date" value={date} />
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Select name="employeeId" label="Employee" options={employees} required placeholder="Choose..." />
        </div>
        <Input name="amount" label="Amount (₹)" inputMode="decimal" required placeholder="0" />
        <Select name="paidVia" label="Paid by" options={opts(PAY_MODE_LABEL)} defaultValue="cash" />
        <div className="col-span-2">
          <Input name="note" label="Note" placeholder="optional" />
        </div>
      </div>
    </ActionForm>
  );
}

export function ReceiptForm({ date, parties }: { date: string; parties: Opt[] }) {
  return (
    <ActionForm action={addReceipt} submit="Record payment">
      <input type="hidden" name="date" value={date} />
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Select name="partyId" label="Received from" options={parties} required placeholder="Choose..." />
        </div>
        <Input name="amount" label="Amount (₹)" inputMode="decimal" required placeholder="0" />
        <Select name="mode" label="Received in" options={opts(PAY_MODE_LABEL)} defaultValue="bank" />
        <div className="col-span-2">
          <Input name="note" label="Note" placeholder="e.g. Zomato weekly payout" />
        </div>
      </div>
    </ActionForm>
  );
}
