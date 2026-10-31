import { and, eq } from "drizzle-orm";
import { can, getUser } from "@/lib/auth";
import { getDb, schema } from "@/db";

// A stored photo, only to logins of the hotel it belongs to. Employee photos go to those who can
// see staff, and to that employee; bills to everyone but plain employee logins.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  const id = Number((await params).id);
  if (!user?.hotelId || !user.access?.canRead || !Number.isInteger(id)) return new Response("Not found", { status: 404 });
  const { attachments, employees } = schema;
  const db = await getDb();
  const [file] = await db.select().from(attachments).where(and(eq(attachments.id, id), eq(attachments.hotelId, user.hotelId)));
  if (!file) return new Response("Not found", { status: 404 });
  let allowed = file.kind === "bill" ? user.role !== "employee" : can(user, "viewEmployees");
  if (!allowed && file.kind === "employee_photo" && user.employeeId) {
    const [mine] = await db.select({ photoId: employees.photoId }).from(employees).where(eq(employees.id, user.employeeId));
    allowed = mine?.photoId === id;
  }
  if (!allowed) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}
