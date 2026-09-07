import emailjs from "@emailjs/browser";

const configuredPublicKey = import.meta.env["VITE_EMAILJS_PUBLIC_KEY"] as string | undefined;

export async function sendEmailJsWithFallback(
  serviceId: string,
  templateId: string,
  templateParams: Record<string, string>,
  preferredPublicKey?: string,
) {
  const publicKey = preferredPublicKey ?? configuredPublicKey;
  if (!publicKey) {
    throw new Error("EmailJS public key is not configured.");
  }

  return emailjs.send(serviceId, templateId, templateParams, { publicKey });
}
