import { and, eq } from "drizzle-orm";
import { requirePage } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { removePartner, resetPassword, saveCategory, saveHotelProfile, savePartner, saveUser, setUserActive, updateUserAccess } from "@/lib/actions";
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

// Shown with CSS rather than state so the form's reset also hides the password box again.
function PartnerLogin({
  partner,
  login,
  options,
}: {
  partner?: { phone: string | null; userId: number | null };
  login?: { login: string; role: string; active: boolean };
  options: { value: number; label: string }[];
}) {
  if (login && login.role !== "partner") {
    return (
      <p className="mt-3 text-xs text-muted">
        Linked to {login.login}, which stays as it is.
        <input type="hidden" name="userId" value={partner?.userId ?? ""} />
      </p>
    );
  }
  return (
    <fieldset className="group mt-3">
      {login && <input type="hidden" name="userId" value={partner?.userId ?? ""} />}
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="giveLogin" defaultChecked={login?.active} />
        Give app login
      </label>
      <div className="mt-2 hidden group-has-[input:checked]:block">
        {login && login.login !== partner?.phone && <p className="mb-2 text-xs text-muted">Login ID: {login.login}</p>}
        <Input name="loginPassword" label={login ? "New password (blank keeps it)" : "Password"} type="password" autoComplete="new-password" minLength={8} />
      </div>
      {!login && (
        <div className="mt-2 group-has-[input:checked]:hidden">
          <Select name="userId" label="Or link an existing login" options={options} placeholder="None" />
        </div>
      )}
    </fieldset>
  );
}

export default async function SettingsPage() {
  const me = await requirePage("manageMaster");
  const db = await getDb();
  const { users, employees, expenseCategories: cats } = schema;
  const [userRows, empRows, catRows, partnerRows] = await Promise.all([
    db
      .select({ u: users, emp: employees.name })
      .from(users)
      .leftJoin(employees, eq(employees.id, users.employeeId))
      .where(eq(users.hotelId, me.hotelId))
      .orderBy(users.role, users.name),
    db.select().from(employees).where(and(eq(employees.hotelId, me.hotelId), eq(employees.active, true))).orderBy(employees.name),
    db.select().from(cats).where(eq(cats.hotelId, me.hotelId)).orderBy(cats.name),
    db
      .select()
      .from(schema.partners)
      .where(and(eq(schema.partners.hotelId, me.hotelId), eq(schema.partners.active, true)))
      .orderBy(schema.partners.name),
  ]);
  const allocatedBp = partnerRows.reduce((a, p) => a + p.shareBp, 0);
  const loginOptions = userRows.filter(({ u }) => u.active).map(({ u }) => ({ value: u.id, label: `${u.name} (${u.role})` }));
  const loginName = new Map(userRows.map(({ u }) => [u.id, u.name]));
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
                          <summary className="cursor-pointer text-xs text-muted">Role / employee</summary>
                          <div className="mt-2 w-64">
                            <ActionForm action={updateUserAccess} submit="Save" resetOnOk={false}>
                              <input type="hidden" name="userId" value={u.id} />
                              <div className="space-y-2">
                                <Select name="role" label="Role" options={ROLES} defaultValue={u.role} />
                                <Select
                                  name="employeeId"
                                  label="Linked employee (for My Salary)"
                                  options={empRows.map((e) => ({ value: e.id, label: e.name }))}
                                  defaultValue={u.employeeId ?? ""}
                                  placeholder="None"
                                />
                              </div>
                            </ActionForm>
                          </div>
                        </details>
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

      <Card title="Your data" className="mt-4">
        <p className="text-sm text-muted">Download everything entered for this hotel (sales, expenses, staff, attendance, salaries, bookings, suppliers...) as one Excel file. Keep a copy every month.</p>
        <a href="/export" className="btn btn-ghost mt-3">Download all data (Excel)</a>
      </Card>

      <Card title={`Partners and profit share · ${(allocatedBp / 100).toString()}% allocated`} className="mt-4">
        {partnerRows.length > 0 && (
          <div className="-mx-4 -mt-4 mb-4 overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Partner</th><th className="r">Share</th><th>Login</th><th /></tr></thead>
              <tbody>
                {partnerRows.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}{p.phone && <div className="text-xs font-normal text-muted">{p.phone}</div>}</td>
                    <td className="r num">{p.shareBp / 100}%</td>
                    <td className="text-muted">{p.userId ? loginName.get(p.userId) : "-"}</td>
                    <td className="r">
                      <span className="inline-flex flex-wrap items-center justify-end gap-3">
                        <details className="text-left">
                          <summary className="cursor-pointer text-xs text-muted">Edit</summary>
                          <div className="mt-2 w-64">
                            <ActionForm action={savePartner} submit="Save" resetOnOk={false}>
                              <input type="hidden" name="id" value={p.id} />
                              <div className="space-y-2">
                                <Input name="name" label="Name" defaultValue={p.name} required />
                                <Input name="phone" label="Mobile number" defaultValue={p.phone ?? ""} inputMode="tel" />
                                <Input name="share" label="Share (%)" defaultValue={String(p.shareBp / 100)} inputMode="decimal" required />
                                <PartnerLogin partner={p} login={userRows.find(({ u }) => u.id === p.userId)?.u} options={loginOptions} />
                              </div>
                            </ActionForm>
                          </div>
                        </details>
                        <ActButton run={removePartner.bind(null, p.id)} label="Remove" confirm={`Remove ${p.name} from profit sharing?`} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ActionForm action={savePartner} submit="Add partner">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Input name="name" label="Partner name" required />
            <Input name="phone" label="Mobile number" inputMode="tel" />
            <Input name="share" label="Share (%)" inputMode="decimal" placeholder="e.g. 10" required />
          </div>
          <PartnerLogin options={loginOptions} />
        </ActionForm>
        <p className="mt-2 text-xs text-muted">A partner&apos;s login sees reports and their share, and cannot change entries. The mobile number is the login ID.</p>
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
