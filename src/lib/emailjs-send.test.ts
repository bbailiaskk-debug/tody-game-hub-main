// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import emailjs from "@emailjs/browser";

import { MOCK_EMAIL_OUTBOX_KEY, readMockEmailOutbox } from "./email-mock";
import { sendEmailJsWithFallback } from "./emailjs-send";

vi.mock("@emailjs/browser", () => ({
  default: { send: vi.fn().mockResolvedValue({ ok: true }) },
  send: vi.fn().mockResolvedValue({ ok: true }),
}));

const sendMock = vi.mocked(emailjs.send);

beforeEach(() => {
  sendMock.mockClear();
  window.localStorage.clear();
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
      { email: "someone@gmail.com", name: "Someone" },
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
      templateParams: { email: "e2e-b@test.dev", name: "Tester" },
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
