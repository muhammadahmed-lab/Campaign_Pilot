import { Resend } from "resend";

interface EmailPayload {
  from: string;
  to: string;
  subject: string;
  html: string;
}

interface BatchResult {
  sent: number;
  failed: number;
  errors: Array<{ email: string; error: string }>;
}

export async function sendBatch(
  apiKey: string,
  emails: EmailPayload[]
): Promise<BatchResult> {
  const resend = new Resend(apiKey);
  const result: BatchResult = { sent: 0, failed: 0, errors: [] };

  try {
    const response = await resend.batch.send(
      emails.map((e) => ({
        from: e.from,
        to: [e.to],
        subject: e.subject,
        html: e.html,
      }))
    );

    if (response.error) {
      // Top-level batch error (auth, quota, schema) — all emails failed.
      result.failed = emails.length;
      result.errors = emails.map((e) => ({
        email: e.to,
        error: response.error?.message || "Batch send failed",
      }));
    } else {
      // Per-email results live at response.data.data — each entry has `id` on success.
      const perEmail = (response.data as any)?.data;
      if (!Array.isArray(perEmail) || perEmail.length !== emails.length) {
        // Defensive: shape unexpected and no top-level error → assume batch succeeded.
        result.sent = emails.length;
      } else {
        for (let i = 0; i < emails.length; i++) {
          const item = perEmail[i];
          if (item && typeof item === "object" && typeof item.id === "string" && item.id.length > 0) {
            result.sent += 1;
          } else {
            result.failed += 1;
            const errMsg = (item && (item.error?.message || item.error)) || "Send failed";
            result.errors.push({ email: emails[i].to, error: String(errMsg) });
          }
        }
      }
    }
  } catch (err) {
    result.failed = emails.length;
    result.errors = emails.map((e) => ({
      email: e.to,
      error: err instanceof Error ? err.message : "Unknown error",
    }));
  }

  return result;
}
