import emailjs from "@emailjs/browser";

import { recordMockEmail, shouldMockEmailFor } from "./email-mock";

const configuredPublicKey = import.meta.env["VITE_EMAILJS_PUBLIC_KEY"] as string | undefined;

export async function sendEmailJsWithFallback(
  serviceId: string,
  templateId: string,
  templateParams: Record<string, string>,
  preferredPublicKey?: string,
) {
  if (shouldMockEmailFor(templateParams)) {
    recordMockEmail({ at: Date.now(), serviceId, templateId, templateParams });
    return { __mock: true, serviceId, templateId };
  }

  const publicKey = preferredPublicKey ?? configuredPublicKey;
  if (!publicKey) {
    throw new Error("EmailJS public key is not configured.");
  }

  return emailjs.send(serviceId, templateId, templateParams, { publicKey });
}
