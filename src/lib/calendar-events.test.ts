import { describe, expect, it } from "vitest";
import {
  applyPendingCalendarChanges,
  CALENDAR_EVENTS_STORAGE_KEY,
  getPendingCalendarChanges,
  pendingCalendarChangesKey,
  readPendingCalendarChanges,
  readCalendarEvents,
  writeCalendarEvents,
  writePendingCalendarChanges,
  type CalendarEvent,
} from "./calendar-events";

function createMemoryStorage(initialValue: string | null = null): Storage {
  const values = new Map<string, string>();
  if (initialValue !== null) values.set(CALENDAR_EVENTS_STORAGE_KEY, initialValue);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

describe("calendar event persistence", () => {
  it("keeps clip and stream plans after reading saved browser storage", () => {
    const storage = createMemoryStorage();
    const events: CalendarEvent[] = [
      { id: "clip-1", title: "Нов клип", kind: "upload", date: "2026-10-21", time: "18:30" },
      {
        id: "stream-1",
        title: "Стрийм на живо",
        kind: "stream",
        date: "2026-10-22",
        time: "20:00",
      },
    ];

    writeCalendarEvents(storage, events);

    expect(readCalendarEvents(storage)).toEqual(events);
  });

  it("does not silently discard malformed saved data", () => {
    const storage = createMemoryStorage('{"not":"an array"}');

    expect(() => readCalendarEvents(storage)).toThrow("Invalid calendar events");
  });

  it("rejects invalid event dates and times", () => {
    const storage = createMemoryStorage(
      JSON.stringify([
        { id: "bad-date", title: "Клип", kind: "upload", date: "2026-02-30", time: "18:00" },
      ]),
    );

    expect(() => readCalendarEvents(storage)).toThrow("Invalid calendar events");
  });

  it("keeps unsynced additions and deletions when combining with another device's events", () => {
    const existing: CalendarEvent[] = [
      { id: "delete-me", title: "Стар план", kind: "upload", date: "2026-10-21", time: "18:00" },
      { id: "keep-me", title: "Стрийм", kind: "stream", date: "2026-10-22", time: "20:00" },
    ];
    const current: CalendarEvent[] = [
      existing[1]!,
      { id: "new-plan", title: "Нов клип", kind: "upload", date: "2026-10-23", time: "17:00" },
    ];
    const savedOnOtherDevice: CalendarEvent[] = [
      ...existing,
      { id: "other-device", title: "Друг план", kind: "stream", date: "2026-10-24", time: "19:00" },
    ];
    const changes = getPendingCalendarChanges(existing, current);
    const merged = applyPendingCalendarChanges(savedOnOtherDevice, changes);

    expect(merged.map((event) => event.id)).toEqual(["keep-me", "new-plan", "other-device"]);
  });

  it("persists pending changes until a later successful cloud sync", () => {
    const storage = createMemoryStorage();
    const changes = {
      upserts: [
        {
          id: "pending",
          title: "План",
          kind: "upload" as const,
          date: "2026-10-21",
          time: "18:00",
        },
      ],
      deletedIds: ["deleted"],
    };

    writePendingCalendarChanges(storage, "creator@example.com", changes);

    expect(readPendingCalendarChanges(storage, "creator@example.com")).toEqual(changes);
    expect(storage.getItem(pendingCalendarChangesKey("creator@example.com"))).not.toBeNull();
    writePendingCalendarChanges(storage, "creator@example.com", { upserts: [], deletedIds: [] });
    expect(readPendingCalendarChanges(storage, "creator@example.com")).toBeNull();
  });
});
