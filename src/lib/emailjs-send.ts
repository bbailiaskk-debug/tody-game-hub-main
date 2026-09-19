import emailjs from "@emailjs/browser";

import { EMAILJS_PUBLIC_KEY } from "./emailjs-config";
import { recordMockEmail, shouldMockEmailFor } from "./email-mock";

const configuredPublicKey = EMAILJS_PUBLIC_KEY;

const RECIPIENT_KEYS = ["email", "email_to", "toEmail", "recipient", "to_email"];
const RECIPIENT_NAME_KEYS = ["name", "recipient_name", "recipientName", "to_name"];

export function ensureRecipientFields(
  templateParams: Record<string, string>,
  options?: { keepTemplateRecipient?: boolean },
): Record<string, string> {
  const params = { ...templateParams };
  if (options?.keepTemplateRecipient) {
    return params;
  }
  if (!params["to_email"]) {
    const recipientKey = RECIPIENT_KEYS.find(
      (key) => typeof params[key] === "string" && params[key]!.includes("@"),
    );
    if (recipientKey) params["to_email"] = params[recipientKey]!;
  }
  if (!params["to_name"]) {
    const nameKey = RECIPIENT_NAME_KEYS.find(
      (key) => typeof params[key] === "string" && params[key]!.trim() !== "",
    );
    if (nameKey) params["to_name"] = params[nameKey]!;
  }
  return params;
}

export function describeEmailJsError(error: unknown): string {
  if (error && typeof error === "object") {
    const status = (error as { status?: unknown }).status;
    const text = (error as { text?: unknown }).text ?? (error as { message?: unknown }).message;
    if (status !== undefined) {
      return `status=${String(status)}${typeof text === "string" ? ` :: ${text}` : ""}`;
    }
    if (typeof text === "string") return text;
  }
  return error instanceof Error ? error.message : String(error);
}

export async function sendEmailJsWithFallback(
  serviceId: string,
  templateId: string,
  templateParams: Record<string, string>,
  preferredPublicKey?: string,
  options?: { keepTemplateRecipient?: boolean },
) {
  const recipientSafeParams = ensureRecipientFields(templateParams, options);

  if (shouldMockEmailFor(recipientSafeParams)) {
    recordMockEmail({ at: Date.now(), serviceId, templateId, templateParams: recipientSafeParams });
    return { __mock: true, serviceId, templateId };
  }

  const publicKey = preferredPublicKey ?? configuredPublicKey;
  if (!publicKey) {
    throw new Error("EmailJS public key is not configured.");
  }

  try {
    return await emailjs.send(serviceId, templateId, recipientSafeParams, { publicKey });
  } catch (error) {
    console.warn(
      `EmailJS send failed for service "${serviceId}" template "${templateId}". ${describeEmailJsError(error)}`,
    );
    throw error;
  }
}
