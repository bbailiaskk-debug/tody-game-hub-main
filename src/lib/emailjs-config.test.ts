import { describe, expect, it } from "vitest";

import {
  EMAILJS_CODE_TEMPLATE_ID,
  EMAILJS_CONTACT_PUBLIC_KEY,
  EMAILJS_CONTACT_SERVICE_ID,
  EMAILJS_CONTACT_TEMPLATE_ID,
  EMAILJS_PASSWORD_RESET_TEMPLATE_ID,
  EMAILJS_PUBLIC_KEY,
  EMAILJS_SERVICE_ID,
} from "./emailjs-config";

describe("emailjs-config (Account A)", () => {
  it("uses the standard Account A service id and public key", () => {
    expect(EMAILJS_SERVICE_ID).toBe("service_hwzypm3");
    expect(EMAILJS_PUBLIC_KEY).toBe("kuYT07vdIE5ggU-D7");
  });

  it("maps the 6-digit code template and the password-reset-link template", () => {
    expect(EMAILJS_CODE_TEMPLATE_ID).toBe("template_81eb3mc");
    expect(EMAILJS_PASSWORD_RESET_TEMPLATE_ID).toBe("template_3gxwtdg");
  });

  it("uses separate Account B credentials for the contact form", () => {
    expect(EMAILJS_CONTACT_SERVICE_ID).toBe("service_k20134z");
    expect(EMAILJS_CONTACT_TEMPLATE_ID).toBe("template_ls0ocsm");
    expect(EMAILJS_CONTACT_PUBLIC_KEY).toBe("pPXV2aJ44QdXUxZ25");
  });
});
