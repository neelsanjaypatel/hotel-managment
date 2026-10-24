import { and, eq } from "drizzle-orm";
import { requirePage } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { resetPassword, saveCategory, saveHotelProfile, saveUser, setUserActive } from "@/lib/actions";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ActButton, ActionForm, Input, Select } from "@/components/forms";

export const metadata = { title: "Settings" };

const ROLES = [
  { value: "admin", label: "Admin (full control)" },
  { value: "manager", label: "Manager (counter + team attendance)" },
  { value: "cashier", label: "Cashier (counter entries only)" },
  { value: "partner", label: "Partner (view everything)" },
  { value: "viewer", label: "View only (reports, no payroll)" },
  { value: "employee", label: "Employee (own salary only)" },
];

export default async function SettingsPage() {
  const me = await requirePage("manageMaster");
  const db = await getDb();
  const { users, employees, expenseCategories: cats } = schema;
  const [userRows, empRows, catRows] = await Promise.all([
    db
      .select({ u: users, emp: employees.name })
      .from(users)
      .leftJoin(employees, eq(employees.id, users.employeeId))
      .where(eq(users.hotelId, me.hotelId))
      .orderBy(users.role, users.name),
    db.select().from(employees).where(and(eq(employees.hotelId, me.hotelId), eq(employees.active, true))).orderBy(employees.name),
    db.select().from(cats).where(eq(cats.hotelId, me.hotelId)).orderBy(cats.name),
  ]);
  const parents = catRows.filter((c) => !c.parentId);

  return (
    <>
      <PageHeader title="Settings" sub="Hotel details, logins, roles and expense categories. Only admin sees this page." />

      <Card title="Hotel details" className="mb-4">
        <ActionForm action={saveHotelProfile} submit="Save details" resetOnOk={false}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Input name="name" label="Hotel name" defaultValue={me.hotel.name} required />
            <Input name="city" label="City" defaultValue={me.hotel.city ?? ""} />
            <Input name="phone" label="Phone" defaultValue={me.hotel.phone ?? ""} inputMode="tel" />
            <Input name="gstin" label="GSTIN" defaultValue={me.hotel.gstin ?? ""} />
          </div>
          <fieldset className="mt-3 flex flex-wrap gap-4 text-sm">
            <legend className="label">Sections in this hotel</legend>
            <label className="inline-flex items-center gap-2"><input type="checkbox" name="hasRestaurant" defaultChecked={me.hotel.hasRestaurant} /> Restaurant</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" name="hasRooms" defaultChecked={me.hotel.hasRooms} /> Rooms</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" name="hasBanquet" defaultChecked={me.hotel.hasBanquet} /> Banquet</label>
          </fieldset>
        </ActionForm>
      </Card>

      <Card title="Logins">
        <div className="-mx-4 -mt-4 overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Login</th><th>Role</th><th>Employee</th><th /></tr></thead>
            <tbody>
              {userRows.map(({ u, emp }) => (
                <tr key={u.id} className={u.active ? "" : "opacity-55"}>
                  <td className="font-medium">{u.name}</td>
                  <td className="text-muted">{u.login}</td>
                  <td><Badge tone={u.role === "admin" ? "ok" : "neutral"}>{u.role}</Badge></td>
                  <td className="text-muted">{emp ?? ""}</td>
                  <td className="r">
                    {u.id !== me.id && (
                      <span className="inline-flex flex-wrap items-center justify-end gap-3">
                        <details className="text-left">
                          <summary className="cursor-pointer text-xs text-muted">Change password</summary>
                          <div className="mt-2 w-60">
                            <ActionForm action={resetPassword} submit="Set password">
                              <input type="hidden" name="userId" value={u.id} />
                              <Input name="password" label="New password (8+ chars)" type="text" minLength={8} required />
                            </ActionForm>
                          </div>
                        </details>
                        <ActButton
                          run={setUserActive.bind(null, u.id, !u.active)}
                          label={u.active ? "Disable" : "Enable"}
                          confirm={u.active ? `Disable login for ${u.name}?` : undefined}
                        />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 border-t border-line pt-4">
          <h3 className="mb-3 text-sm font-semibold">Create login</h3>
          <ActionForm action={saveUser} submit="Create login">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Input name="name" label="Name" required />
              <Input name="login" label="Login (phone or username)" required autoComplete="off" />
              <Input name="password" label="Password (8+ chars)" type="text" minLength={8} required autoComplete="off" />
              <Select name="role" label="Role" options={ROLES} defaultValue="partner" />
              <Select name="employeeId" label="Link to employee" options={empRows.map((e) => ({ value: e.id, label: e.name }))} placeholder="None" />
            </div>
          </ActionForm>
        </div>
      </Card>

      <Card title="Expense categories" className="mt-4">
        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {parents.map((p) => (
            <div key={p.id}>
              <div className="text-sm font-medium">
                {p.name} {p.isWages && <Badge tone="warn">linked to workers</Badge>}
              </div>
              <ul className="mt-1 space-y-0.5 pl-3 text-sm text-muted">
                {catRows.filter((c) => c.parentId === p.id).map((c) => <li key={c.id}>{c.name}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-4 border-t border-line pt-4">
          <ActionForm action={saveCategory} submit="Add category">
            <div className="grid grid-cols-2 gap-3 sm:max-w-lg">
              <Input name="name" label="Category name" required />
              <Select name="parentId" label="Under" options={parents.map((p) => ({ value: p.id, label: p.name }))} placeholder="Top level" />
            </div>
          </ActionForm>
        </div>
      </Card>
    </>
  );
}
