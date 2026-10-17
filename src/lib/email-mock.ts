export type MockEmailRecord = {
  at: number;
  serviceId: string;
  templateId: string;
  templateParams: Record<string, string>;
};

type OutboxStorage = Pick<Storage, "getItem" | "setItem"> | undefined;

export const MOCK_EMAIL_OUTBOX_KEY = "__mockEmailOutbox";
export const MOCK_EMAIL_OUTBOX_LIMIT = 50;

export const TEST_EMAIL_DOMAINS: ReadonlyArray<string> = [
  "localhost",
  "test.dev",
  "example.com",
  "example.net",
  "example.org",
  "invalid",
];

const RECIPIENT_PARAM_KEYS = ["email", "to_email", "email_to", "toEmail", "recipient"];

function storage(): OutboxStorage {
  return typeof window !== "undefined" ? window.localStorage : undefined;
}

export function extractEmailDomain(email: string): string {
  const normalized = email.trim().toLowerCase();
  const atIndex = normalized.lastIndexOf("@");
  return atIndex >= 0 ? normalized.slice(atIndex + 1) : normalized;
}

export function isTestEmailAddress(email: string): boolean {
  const domain = extractEmailDomain(email);
  return TEST_EMAIL_DOMAINS.includes(domain);
}

export function collectTemplateRecipients(templateParams: Record<string, string>): string[] {
  const recipients = new Set<string>();
  for (const key of RECIPIENT_PARAM_KEYS) {
    const value = templateParams[key];
    if (value && value.includes("@")) recipients.add(value);
  }
  return Array.from(recipients);
}

export function shouldMockEmailFor(templateParams: Record<string, string>): boolean {
  const envOverride = import.meta.env["VITE_MOCK_EMAIL"] as string | undefined;
  if (envOverride === "1") return true;
  if (envOverride === "0") return false;
  return collectTemplateRecipients(templateParams).some(isTestEmailAddress);
}

export function readMockEmailOutbox(store?: OutboxStorage): MockEmailRecord[] {
  const currentStore = store ?? storage();
  if (!currentStore) return [];
  try {
    const raw = currentStore.getItem(MOCK_EMAIL_OUTBOX_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MockEmailRecord[]) : [];
  } catch {
    return [];
  }
}

export function recordMockEmail(record: MockEmailRecord, store?: OutboxStorage): void {
  const currentStore = store ?? storage();
  if (!currentStore) return;
  const outbox = readMockEmailOutbox(currentStore);
  outbox.push(record);
  const trimmed = outbox.slice(-MOCK_EMAIL_OUTBOX_LIMIT);
  try {
    currentStore.setItem(MOCK_EMAIL_OUTBOX_KEY, JSON.stringify(trimmed));
  } catch {
    return;
  }
}
