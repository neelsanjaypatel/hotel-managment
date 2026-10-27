import { ActionForm, Input, Select } from "@/components/forms";
import { saveEmployee } from "@/lib/actions";
import { rupeesPlain, todayIST } from "@/lib/format";
import type { schema } from "@/db";

type Employee = typeof schema.employees.$inferSelect;

export function EmployeeForm({ employee, managers, nextCode }: { employee?: Employee; managers: { value: number; label: string }[]; nextCode?: string }) {
  const e = employee;
  return (
    <ActionForm action={saveEmployee} submit={e ? "Save changes" : "Add employee"} resetOnOk={!e}>
      {e && <input type="hidden" name="id" value={e.id} />}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Input name="code" label="Employee code" defaultValue={e?.code ?? nextCode} required />
        <Input name="name" label="Full name" defaultValue={e?.name} required />
        <Input name="phone" label="Phone" defaultValue={e?.phone ?? ""} inputMode="tel" />
        <Input name="department" label="Department" defaultValue={e?.department} required list="departments" />
        <Input name="designation" label="Designation" defaultValue={e?.designation ?? ""} />
        <Select name="payType" label="Pay type" defaultValue={e?.payType ?? "monthly"} options={[{ value: "monthly", label: "Monthly salary" }, { value: "daily", label: "Daily wage" }]} />
        <Input name="rate" label="Salary per month / wage per day (₹)" defaultValue={e ? rupeesPlain(e.rate) : ""} inputMode="decimal" required />
        <Input name="joinDate" label="Join date" type="date" defaultValue={e?.joinDate ?? todayIST()} required />
        {e && <Input name="rateFrom" label="If salary changed: applies from" type="date" defaultValue={todayIST()} />}
        <Select name="managerUserId" label="Reports to (manager)" defaultValue={e?.managerUserId ?? ""} options={managers} placeholder="No manager" />
        {e && <Select name="active" label="Status" defaultValue={e.active ? "on" : "off"} options={[{ value: "on", label: "Working" }, { value: "off", label: "Left / inactive" }]} />}
      </div>
      <datalist id="departments">
        {["Kitchen", "Service", "Front Office", "Housekeeping", "Banquet", "Maintenance", "Security", "Accounts"].map((d) => <option key={d} value={d} />)}
      </datalist>
    </ActionForm>
  );
}
