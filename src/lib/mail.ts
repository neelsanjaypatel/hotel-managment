import "server-only";
import nodemailer from "nodemailer";

// Sends through a Gmail account with an App Password (SMTP_USER, SMTP_PASS). Free, with a daily
// limit from Google. Without them nothing is sent and the app says so instead of pretending.
export const mailConfigured = () => !!process.env.SMTP_USER && !!process.env.SMTP_PASS;

export async function sendMail(to: string, subject: string, text: string) {
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transport.sendMail({ from: `Hotel Desk <${process.env.SMTP_USER}>`, to, subject, text });
}
