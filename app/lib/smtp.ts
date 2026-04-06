import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

interface SmtpEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
}

interface SmtpResult {
  sent: number;
  failed: number;
  errors: Array<{ email: string; error: string }>;
}

export async function sendSmtpBatch(
  email: string,
  appPassword: string,
  emails: SmtpEmail[]
): Promise<SmtpResult> {
  const result: SmtpResult = { sent: 0, failed: 0, errors: [] };

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true, // Port 465 uses implicit TLS (SMTPS)
    auth: { user: email, pass: appPassword },
    family: 4, // Force IPv4 — avoids ENETUNREACH on networks without IPv6
  } as SMTPTransport.Options);

  // Verify connection first
  try {
    await transporter.verify();
    console.log("[mass-mailer] SMTP connection verified for", email);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "SMTP auth failed";
    console.error("[mass-mailer] SMTP connection FAILED:", msg);
    // Mark all as failed
    for (const e of emails) {
      result.failed++;
      result.errors.push({ email: e.to, error: `SMTP auth failed: ${msg}` });
    }
    return result;
  }

  for (const msg of emails) {
    try {
      const info = await transporter.sendMail({
        from: `"${email.split("@")[0]}" <${email}>`,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
      });
      console.log(`[mass-mailer] Sent to ${msg.to} — messageId: ${info.messageId}`);
      result.sent++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "SMTP send failed";
      console.error(`[mass-mailer] Failed to send to ${msg.to}:`, errorMsg);
      result.failed++;
      result.errors.push({ email: msg.to, error: errorMsg });
    }
  }

  transporter.close();
  return result;
}
