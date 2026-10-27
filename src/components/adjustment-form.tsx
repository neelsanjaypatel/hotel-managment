import { addAdjustment } from "@/lib/salary-actions";
import { ActionForm, Input, Select } from "./forms";

const KINDS = [
  { value: "bonus", label: "Bonus (+)" },
  { value: "allowance", label: "Allowance (+)" },
  { value: "deduction", label: "Deduction (−)" },
];

// Owner adds a bonus, allowance or deduction to one employee's pay for a month.
export function AdjustmentForm({ employeeId, month }: { employeeId: number; month: string }) {
  return (
    <ActionForm action={addAdjustment} submit="Add">
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="month" value={month} />
      <div className="space-y-2">
        <Select name="kind" label="Type" options={KINDS} defaultValue="bonus" />
        <Input name="amount" label="Amount (₹)" inputMode="decimal" required />
        <Input name="note" label="Reason (shown on payslip)" required placeholder="e.g. Diwali bonus, extra duty, broken glass" />
      </div>
    </ActionForm>
  );
}
