import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MOCK_EMAIL_OUTBOX_KEY,
  collectTemplateRecipients,
  extractEmailDomain,
  isTestEmailAddress,
  readMockEmailOutbox,
  recordMockEmail,
  shouldMockEmailFor,
} from "./email-mock";

const createStorage = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("extractEmailDomain", () => {
  it("returns the domain after the last @", () => {
    expect(extractEmailDomain("user@test.dev")).toBe("test.dev");
    expect(extractEmailDomain("USER@Example.COM")).toBe("example.com");
  });

  it("returns the whole string when there is no @", () => {
    expect(extractEmailDomain("not-an-email")).toBe("not-an-email");
  });
});

describe("isTestEmailAddress", () => {
  it("accepts reserved test domains", () => {
    expect(isTestEmailAddress("a@test.dev")).toBe(true);
    expect(isTestEmailAddress("b@example.com")).toBe(true);
    expect(isTestEmailAddress("c@example.org")).toBe(true);
    expect(isTestEmailAddress("d@localhost")).toBe(true);
    expect(isTestEmailAddress("root@invalid")).toBe(true);
  });

  it("rejects real domains", () => {
    expect(isTestEmailAddress("user@gmail.com")).toBe(false);
    expect(isTestEmailAddress("user@mail.bg")).toBe(false);
  });
});

describe("collectTemplateRecipients", () => {
  it("collects recipient addresses across common param names", () => {
    const recipients = collectTemplateRecipients({
      email: "a@test.dev",
      to_email: "b@gmail.com",
      name: "Somebody",
      email_to: "c@example.com",
    });
    expect(recipients).toEqual(["a@test.dev", "b@gmail.com", "c@example.com"]);
  });

  it("returns an empty array when no recipient is present", () => {
    expect(collectTemplateRecipients({ name: "Only a name" })).toEqual([]);
  });
});

describe("shouldMockEmailFor", () => {
  it("mocks when any recipient uses a reserved test domain", () => {
    expect(shouldMockEmailFor({ email: "e2e-a@test.dev", name: "Tester" })).toBe(true);
  });

  it("does not mock for real domains", () => {
    expect(shouldMockEmailFor({ email: "someone@gmail.com" })).toBe(false);
  });

  it("does not mock when no recipient is detectable", () => {
    expect(shouldMockEmailFor({ resetUrl: "https://example.com/x" })).toBe(false);
  });

  it("forces mocking when VITE_MOCK_EMAIL=1", () => {
    vi.stubEnv("VITE_MOCK_EMAIL", "1");
    expect(shouldMockEmailFor({ email: "someone@gmail.com" })).toBe(true);
  });

  it("forces real sending when VITE_MOCK_EMAIL=0 even for test domains", () => {
    vi.stubEnv("VITE_MOCK_EMAIL", "0");
    expect(shouldMockEmailFor({ email: "e2e-a@test.dev" })).toBe(false);
  });
});

describe("mock email outbox", () => {
  it("records and reads back outbox entries from the injected storage", () => {
    const storage = createStorage();
    recordMockEmail(
      { at: 1, serviceId: "s1", templateId: "t1", templateParams: { email: "a@test.dev" } },
      storage,
    );
    recordMockEmail(
      { at: 2, serviceId: "s1", templateId: "t2", templateParams: { email: "b@test.dev" } },
      storage,
    );

    const outbox = readMockEmailOutbox(storage);
    expect(outbox).toHaveLength(2);
    expect(outbox[0]!.templateId).toBe("t1");
    expect(outbox[1]!.templateId).toBe("t2");
  });

  it("keeps only the most recent entries up to the limit", () => {
    const storage = createStorage();
    for (let index = 0; index < 60; index += 1) {
      recordMockEmail(
        { at: index, serviceId: "s", templateId: `t${index}`, templateParams: {} },
        storage,
      );
    }
    const outbox = readMockEmailOutbox(storage);
    expect(outbox).toHaveLength(50);
    expect(outbox[0]!.templateId).toBe("t10");
    expect(outbox[49]!.templateId).toBe("t59");
  });

  it("survives storage writes under the shared key", () => {
    const storage = createStorage({ [MOCK_EMAIL_OUTBOX_KEY]: "not-json" });
    expect(readMockEmailOutbox(storage)).toEqual([]);
  });
});
