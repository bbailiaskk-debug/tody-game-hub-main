export type CalendarEventKind = "upload" | "stream";

export type CalendarEvent = {
  id: string;
  title: string;
  kind: CalendarEventKind;
  date: string;
  time: string;
};

export const CALENDAR_EVENTS_STORAGE_KEY = "tody-content-calendar-events";

export type PendingCalendarChanges = {
  upserts: CalendarEvent[];
  deletedIds: string[];
};

export function pendingCalendarChangesKey(email: string) {
  return `tody-content-calendar-pending:${email.trim().toLowerCase()}`;
}

export function isCalendarEvent(value: unknown): value is CalendarEvent {
  if (typeof value !== "object" || value === null) return false;

  const event = value as Record<string, unknown>;
  if (
    typeof event["id"] !== "string" ||
    typeof event["title"] !== "string" ||
    !event["title"].trim() ||
    (event["kind"] !== "upload" && event["kind"] !== "stream") ||
    typeof event["date"] !== "string" ||
    typeof event["time"] !== "string"
  ) {
    return false;
  }

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(event["date"]);
  const timeMatch = /^([01]\d|2[0-3]):[0-5]\d$/.exec(event["time"]);
  if (!dateMatch || !timeMatch) return false;

  const [, year, month, day] = dateMatch;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return (
    date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day)
  );
}

export function readCalendarEvents(storage: Storage): CalendarEvent[] {
  const raw = storage.getItem(CALENDAR_EVENTS_STORAGE_KEY);
  if (raw === null) return [];

  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(isCalendarEvent)) {
    throw new Error("Invalid calendar events");
  }
  return parsed;
}

export function writeCalendarEvents(storage: Storage, events: CalendarEvent[]) {
  storage.setItem(CALENDAR_EVENTS_STORAGE_KEY, JSON.stringify(events));

  const savedEvents = readCalendarEvents(storage);
  if (JSON.stringify(savedEvents) !== JSON.stringify(events)) {
    throw new Error("Calendar events could not be verified after saving");
  }
}

export function readPendingCalendarChanges(
  storage: Storage,
  email: string,
): PendingCalendarChanges | null {
  const raw = storage.getItem(pendingCalendarChangesKey(email));
  if (raw === null) return null;

  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid pending calendar changes");
  }
  const record = parsed as Record<string, unknown>;
  if (
    !Array.isArray(record["upserts"]) ||
    !record["upserts"].every(isCalendarEvent) ||
    !Array.isArray(record["deletedIds"]) ||
    !record["deletedIds"].every((id) => typeof id === "string")
  ) {
    throw new Error("Invalid pending calendar changes");
  }

  return { upserts: record["upserts"], deletedIds: record["deletedIds"] };
}

export function getPendingCalendarChanges(
  syncedEvents: CalendarEvent[],
  currentEvents: CalendarEvent[],
): PendingCalendarChanges {
  const currentById = new Map(currentEvents.map((event) => [event.id, event]));
  const syncedById = new Map(syncedEvents.map((event) => [event.id, event]));
  return {
    upserts: currentEvents.filter(
      (event) => JSON.stringify(syncedById.get(event.id)) !== JSON.stringify(event),
    ),
    deletedIds: syncedEvents.filter((event) => !currentById.has(event.id)).map((event) => event.id),
  };
}

export function applyPendingCalendarChanges(
  syncedEvents: CalendarEvent[],
  changes: PendingCalendarChanges,
) {
  const deletedIds = new Set(changes.deletedIds);
  const eventsById = new Map(
    syncedEvents.filter((event) => !deletedIds.has(event.id)).map((event) => [event.id, event]),
  );
  for (const event of changes.upserts) eventsById.set(event.id, event);
  return [...eventsById.values()].sort((left, right) =>
    `${left.date} ${left.time}`.localeCompare(`${right.date} ${right.time}`),
  );
}

export function writePendingCalendarChanges(
  storage: Storage,
  email: string,
  changes: PendingCalendarChanges,
) {
  const key = pendingCalendarChangesKey(email);
  if (changes.upserts.length === 0 && changes.deletedIds.length === 0) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, JSON.stringify(changes));
}
