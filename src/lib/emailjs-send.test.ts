// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import emailjs from "@emailjs/browser";

import { MOCK_EMAIL_OUTBOX_KEY, readMockEmailOutbox } from "./email-mock";
import { ensureRecipientFields, sendEmailJsWithFallback } from "./emailjs-send";

vi.mock("@emailjs/browser", () => ({
  default: { send: vi.fn().mockResolvedValue({ ok: true }) },
  send: vi.fn().mockResolvedValue({ ok: true }),
}));

const sendMock = vi.mocked(emailjs.send);

beforeEach(() => {
  sendMock.mockClear();
  window.localStorage.clear();
});

describe("ensureRecipientFields", () => {
  it("fills to_email and to_name from the common email/name keys", () => {
    expect(ensureRecipientFields({ email: "user@mail.bg", name: "User" })).toEqual({
      email: "user@mail.bg",
      name: "User",
      to_email: "user@mail.bg",
      to_name: "User",
    });
  });

  it("keeps existing to_email and to_name untouched", () => {
    expect(
      ensureRecipientFields({
        email: "a@mail.bg",
        name: "A",
        to_email: "b@mail.bg",
        to_name: "B",
      }),
    ).toEqual({
      email: "a@mail.bg",
      name: "A",
      to_email: "b@mail.bg",
      to_name: "B",
    });
  });

  it("leaves missing recipient fields as is when no email/name is present", () => {
    expect(ensureRecipientFields({ passcode: "123456" })).toEqual({ passcode: "123456" });
  });
});

describe("sendEmailJsWithFallback with the built-in mock module", () => {
  it("sends via EmailJS for a real recipient domain", async () => {
    const result = await sendEmailJsWithFallback(
      "service_real",
      "template_pw",
      { email: "someone@gmail.com", name: "Someone" },
      "pubkey-1",
    );

    expect(result).not.toHaveProperty("__mock");
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      "service_real",
      "template_pw",
      {
        email: "someone@gmail.com",
        name: "Someone",
        to_email: "someone@gmail.com",
        to_name: "Someone",
      },
      { publicKey: "pubkey-1" },
    );
    expect(readMockEmailOutbox()).toEqual([]);
  });

  it("does not call EmailJS for a reserved test domain and records the mock email instead", async () => {
    const result = await sendEmailJsWithFallback(
      "service_auth",
      "template_delete",
      { email: "e2e-b@test.dev", name: "Tester" },
      "pubkey-1",
    );

    expect(result).toMatchObject({
      __mock: true,
      serviceId: "service_auth",
      templateId: "template_delete",
    });
    expect(sendMock).not.toHaveBeenCalled();

    const outbox: unknown[] = readMockEmailOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      serviceId: "service_auth",
      templateId: "template_delete",
      templateParams: {
        email: "e2e-b@test.dev",
        name: "Tester",
        to_email: "e2e-b@test.dev",
        to_name: "Tester",
      },
    });
  });

  it("persists the outbox under the shared key in localStorage", async () => {
    await sendEmailJsWithFallback("s", "t", { to_email: "user@example.com" }, "k");
    const raw = window.localStorage.getItem(MOCK_EMAIL_OUTBOX_KEY);
    expect(raw).toBeTruthy();
    const parsed: unknown[] = JSON.parse(raw ?? "[]");
    expect(parsed).toHaveLength(1);
  });
});
