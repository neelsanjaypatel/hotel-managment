import { addAdjustment } from "@/lib/salary-actions";
import { ActionForm, Input, Select } from "./forms";
import { getT } from "@/i18n/server";

const KINDS = [
  { value: "bonus", label: "Bonus (+)" },
  { value: "allowance", label: "Allowance (+)" },
  { value: "deduction", label: "Deduction (−)" },
];

// Owner adds a bonus, allowance or deduction to one employee's pay for a month.
export async function AdjustmentForm({ employeeId, month }: { employeeId: number; month: string }) {
  const t = await getT();
  return (
    <ActionForm action={addAdjustment} submit={t("Add")}>
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="month" value={month} />
      <div className="space-y-2">
        <Select name="kind" label={t("Type")} options={KINDS} defaultValue="bonus" />
        <Input name="amount" label={t("Amount (₹)")} inputMode="decimal" required />
        <Input name="note" label={t("Reason (shown on payslip)")} required placeholder={t("e.g. Diwali bonus, extra duty, broken glass")} />
      </div>
    </ActionForm>
  );
}
