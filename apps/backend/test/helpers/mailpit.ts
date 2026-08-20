/**
 * MailPit API client — the e2e suite's "inbox".
 *
 * The signup email is delivered asynchronously, so `waitForSignupToken` polls
 * the MailPit search endpoint (the only endpoint that filters by recipient)
 * with a small retry budget, then fetches the message detail and extracts the
 * token from the `${FRONTEND_URL}/signup/complete?token=…` link.
 */

const MAILPIT_BASE_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

interface MailPitRecipient {
  Address: string;
  Name?: string;
}

interface MailPitMessageSummary {
  ID: string;
  To: MailPitRecipient[] | null;
}

interface MailPitSearchResponse {
  total: number;
  messages: MailPitMessageSummary[];
}

interface MailPitMessageDetail {
  ID: string;
  Text?: string;
  HTML?: string;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${MAILPIT_BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(
      `MailPit ${path} responded ${res.status} — is MailPit up? (docker compose up -d, UI: ${MAILPIT_BASE_URL})`,
    );
  }
  return (await res.json()) as T;
}

/**
 * Messages whose To header contains exactly `email`. Uses `/api/v1/search`
 * (the `/api/v1/messages?to=` query param is NOT a filter — it is ignored).
 */
export async function messagesTo(
  email: string,
): Promise<MailPitMessageSummary[]> {
  const data = await getJson<MailPitSearchResponse>(
    `/api/v1/search?query=${encodeURIComponent(email)}`,
  );
  return (data.messages ?? []).filter((message) =>
    (message.To ?? []).some((recipient) => recipient.Address === email),
  );
}

/** Extracts the raw token from the signup link inside a message body. */
function extractSignupToken(detail: MailPitMessageDetail): string {
  const tokenRegex = /\/signup\/complete\?token=([A-Za-z0-9_-]+)/;
  const match =
    (detail.Text ?? '').match(tokenRegex) ??
    (detail.HTML ?? '').match(tokenRegex);
  if (!match?.[1]) {
    throw new Error(
      `MailPit message ${detail.ID} contains no /signup/complete?token=… link (Text: ${detail.Text ?? '<empty>'})`,
    );
  }
  return match[1];
}

export interface WaitOptions {
  attempts?: number;
  delayMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls MailPit until the signup email for `email` arrives; returns its token. */
export async function waitForSignupToken(
  email: string,
  { attempts = 10, delayMs = 500 }: WaitOptions = {},
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(delayMs);
    try {
      const found = await messagesTo(email);
      const latest = found[found.length - 1];
      if (latest) {
        const detail = await getJson<MailPitMessageDetail>(
          `/api/v1/message/${latest.ID}`,
        );
        return extractSignupToken(detail);
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `No MailPit message for ${email} after ${attempts} attempts ` +
      `(last error: ${lastError instanceof Error ? lastError.message : String(lastError)}). ` +
      `Prerequisite: docker compose up -d (MailPit SMTP on :1025).`,
  );
}
