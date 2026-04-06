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
      result.failed = emails.length;
      result.errors = emails.map((e) => ({
        email: e.to,
        error: response.error?.message || "Batch send failed",
      }));
    } else {
      result.sent = emails.length;
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
