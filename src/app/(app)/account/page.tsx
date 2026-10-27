import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { changeMyPassword } from "@/lib/actions";
import { Card, PageHeader } from "@/components/ui";
import { ActionForm, Input } from "@/components/forms";

export const metadata = { title: "My account" };

// Every login, including staff of a suspended hotel, can change their own password.
export default async function AccountPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  return (
    <>
      <PageHeader title="My account" sub={user.name} />
      <Card title="Change password" className="max-w-md">
        <ActionForm action={changeMyPassword} submit="Change password">
          <div className="space-y-3">
            <Input name="current" label="Current password" type="password" autoComplete="current-password" required />
            <Input name="password" label="New password (8+ characters)" type="password" autoComplete="new-password" minLength={8} required />
            <Input name="confirm" label="New password again" type="password" autoComplete="new-password" minLength={8} required />
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
