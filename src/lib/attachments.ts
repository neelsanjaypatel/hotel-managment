import "server-only";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import type { HotelUser } from "./auth";
import { UserError, type Tx } from "./action-helpers";

export type PhotoKind = "employee_photo" | "bill";

// The browser shrinks photos before sending (components/photo-field). These limits are the
// server's own check, a little above what the browser aims for.
const MAX_BYTES: Record<PhotoKind, number> = { employee_photo: 80_000, bill: 300_000 };

export async function readPhoto(fd: FormData, name: string, kind: PhotoKind) {
  const file = fd.get(name);
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_BYTES[kind]) throw new UserError("That photo is too large. Please take it again.");
  const data = Buffer.from(await file.arrayBuffer());
  // JPEG only: what the browser produces, and safe to serve back.
  if (data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) throw new UserError("That file is not a photo.");
  return { kind, data };
}

export async function storePhoto(tx: Tx, user: HotelUser, photo: { kind: PhotoKind; data: Buffer }) {
  const [row] = await tx
    .insert(schema.attachments)
    .values({ hotelId: user.hotelId, kind: photo.kind, data: photo.data, bytes: photo.data.length, createdBy: user.id })
    .returning({ id: schema.attachments.id });
  return row.id;
}

export async function dropPhoto(tx: Tx, id: unknown) {
  if (typeof id === "number") await tx.delete(schema.attachments).where(eq(schema.attachments.id, id));
}
