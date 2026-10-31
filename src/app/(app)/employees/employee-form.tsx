import { ActionForm, Input, Select } from "@/components/forms";
import { saveEmployee } from "@/lib/actions";
import { rupeesPlain, todayIST } from "@/lib/format";
import { PhotoField } from "@/components/photo-field";
import type { schema } from "@/db";

type Employee = typeof schema.employees.$inferSelect;
type Login = Pick<typeof schema.users.$inferSelect, "login" | "role" | "active">;

const ROLES = [
  { value: "employee", label: "Employee" },
  { value: "cashier", label: "Cashier" },
  { value: "manager", label: "Manager" },
  { value: "viewer", label: "Viewer" },
];

export function EmployeeForm({
  employee,
  login,
  managers,
  nextCode,
}: {
  employee?: Employee;
  login?: Login;
  managers: { value: number; label: string }[];
  nextCode?: string;
}) {
  const e = employee;
  const staffLogin = !login || ROLES.some((r) => r.value === login.role);
  return (
    <ActionForm action={saveEmployee} submit={e ? "Save changes" : "Add employee"} resetOnOk={!e}>
      {e && <input type="hidden" name="id" value={e.id} />}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Input name="code" label="Employee code" defaultValue={e?.code ?? nextCode} required />
        <Input name="name" label="Full name" defaultValue={e?.name} required />
        <Input name="phone" label="Mobile number" defaultValue={e?.phone ?? ""} inputMode="tel" />
        <Input name="department" label="Department" defaultValue={e?.department} required list="departments" />
        <Input name="designation" label="Designation" defaultValue={e?.designation ?? ""} />
        <Select name="payType" label="Pay type" defaultValue={e?.payType ?? "monthly"} options={[{ value: "monthly", label: "Monthly salary" }, { value: "daily", label: "Daily wage" }]} />
        <Input name="rate" label="Salary per month / wage per day (₹)" defaultValue={e ? rupeesPlain(e.rate) : ""} inputMode="decimal" required />
        <Input name="joinDate" label="Join date" type="date" defaultValue={e?.joinDate ?? todayIST()} required />
        {e && <Input name="rateFrom" label="If salary changed: applies from" type="date" defaultValue={todayIST()} />}
        <Select name="managerUserId" label="Reports to (manager)" defaultValue={e?.managerUserId ?? ""} options={managers} placeholder="No manager" />
        <Input
          name="aadhaar"
          label={e?.aadhaarLast4 ? "New Aadhaar (blank keeps it)" : "Aadhaar number"}
          placeholder={e?.aadhaarLast4 ? `XXXX XXXX ${e.aadhaarLast4}` : "12 digits"}
          inputMode="numeric"
          autoComplete="off"
          maxLength={14}
        />
        {e && <Select name="active" label="Status" defaultValue={e.active ? "on" : "off"} options={[{ value: "on", label: "Working" }, { value: "off", label: "Left / inactive" }]} />}
      </div>
      <div className="mt-4">
        <PhotoField name="photo" label="Employee photo" kind="photo" current={e?.photoId} />
      </div>
      {staffLogin ? (
        // Shown with CSS rather than state so the form's reset also hides it again.
        <fieldset className="group mt-4 border-t border-line pt-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="giveLogin" defaultChecked={login?.active} />
            Give app login
          </label>
          <div className="mt-3 hidden grid-cols-2 gap-3 group-has-[input:checked]:grid md:grid-cols-4">
            <div className="text-sm">
              <div className="text-muted">Login ID</div>
              <div className="py-2">{login && login.login !== e?.phone ? login.login : "Their mobile number"}</div>
            </div>
            <Input name="loginPassword" label={login ? "New password (blank keeps it)" : "Password"} type="password" autoComplete="new-password" minLength={8} />
            <Select name="loginRole" label="What they can do" defaultValue={login?.role ?? "employee"} options={ROLES} />
            <p className="col-span-2 text-xs text-muted md:col-span-4">
              Employee: own pay and attendance. Cashier: daily counter. Manager: also closes the day and marks attendance. Viewer: reports only.
            </p>
          </div>
        </fieldset>
      ) : (
        <p className="mt-4 text-sm text-muted">Login {login?.login} is an owner or partner login. Change it in Settings.</p>
      )}
      <datalist id="departments">
        {["Kitchen", "Service", "Front Office", "Housekeeping", "Banquet", "Maintenance", "Security", "Accounts"].map((d) => <option key={d} value={d} />)}
      </datalist>
    </ActionForm>
  );
}
