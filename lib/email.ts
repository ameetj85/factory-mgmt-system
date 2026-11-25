import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST) throw new Error("SMTP_HOST is not set");
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: SMTP_SECURE === "true",
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  return transporter;
}

/** Base URL used in emailed links. Never derived from request headers, which a client can forge. */
export function appUrl(): string {
  const url = process.env.APP_URL?.replace(/\/+$/, "");
  if (url) return url;
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  throw new Error("APP_URL must be set in production");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function sendPasswordResetEmail(to: string, name: string, resetUrl: string, expiresInMinutes: number) {
  const safeName = escapeHtml(name);
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f3ff;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#2e1065;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e9d5ff;">
          <tr><td style="background:linear-gradient(135deg,#6d28d9,#9333ea);padding:24px 32px;color:#ffffff;font-size:20px;font-weight:600;">
            Factory Management System
          </td></tr>
          <tr><td style="padding:32px;">
            <p style="margin:0 0 16px;font-size:16px;">Hi ${safeName},</p>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4c1d95;">
              We received a request to reset your password. Use the button below to choose a new one.
              This link expires in ${expiresInMinutes} minutes and can only be used once.
            </p>
            <p style="margin:0 0 28px;">
              <a href="${resetUrl}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;">Reset password</a>
            </p>
            <p style="margin:0 0 8px;font-size:13px;color:#6b21a8;">If the button doesn't work, paste this link into your browser:</p>
            <p style="margin:0 0 24px;font-size:13px;word-break:break-all;"><a href="${resetUrl}" style="color:#7c3aed;">${resetUrl}</a></p>
            <p style="margin:0;font-size:13px;color:#6b7280;">If you didn't request this, you can ignore this email. Your password won't change.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = `Hi ${name},

We received a request to reset your Factory Management System password.
Open this link to choose a new one (expires in ${expiresInMinutes} minutes, single use):

${resetUrl}

If you didn't request this, you can ignore this email.`;

  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: "Reset your Factory Management System password",
    text,
    html,
  });
}
