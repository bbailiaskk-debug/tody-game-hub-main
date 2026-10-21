import { createFileRoute, Link } from "@tanstack/react-router";
import { bg } from "date-fns/locale";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Radio,
  Trash2,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Calendar } from "../components/ui/calendar";
import { readPersistedAuthSession } from "../lib/local-persistence";
import { serverGetCalendarEvents, serverSaveCalendarEvents } from "../lib/calendar-functions";
import {
  applyPendingCalendarChanges,
  getPendingCalendarChanges,
  readCalendarEvents,
  readPendingCalendarChanges,
  writePendingCalendarChanges,
  writeCalendarEvents,
  type PendingCalendarChanges,
  type CalendarEvent,
  type CalendarEventKind,
} from "../lib/calendar-events";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/calendar")({
  head: () => {
    const seo = seoHead({
      path: "/calendar",
      title: "Календар за съдържание",
      description: "Планирай кога качваш клипове и кога стриймваш.",
    });
    return { meta: seo.meta, links: seo.links };
  },
  component: ContentCalendarPage,
});

const HOUR_HEIGHT = 64;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const WEEKDAYS = ["НЕД", "ПОН", "ВТО", "СРЯ", "ЧЕТ", "ПЕТ", "СЪБ"];

type CalendarSyncStatus = "loading" | "local" | "syncing" | "synced" | "error";

function syncErrorMessage(error: string) {
  switch (error) {
    case "unauthorized":
      return "Сесията е изтекла. Влез отново, за да синхронизираш календара.";
    case "too_many_events":
      return "Календарът е твърде голям и не може да бъде синхронизиран.";
    case "storage_unavailable":
      return "Облачното съхранение не е налично. Събитията остават на това устройство.";
    default:
      return "Синхронизацията не успя. Събитията остават на това устройство.";
  }
}

function dateToKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function keyToDate(key: string) {
  const [year = 0, month = 1, day = 1] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getWeekDays(date: Date) {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(firstDay);
    day.setDate(firstDay.getDate() + index);
    return day;
  });
}

function ContentCalendarPage() {
  const [selectedDate, setSelectedDate] = useState(() => dateToKey(new Date()));
  const [month, setMonth] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [kind, setKind] = useState<CalendarEventKind>("upload");
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("18:00");
  const [error, setError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [syncStatus, setSyncStatus] = useState<CalendarSyncStatus>("loading");
  const [syncAttempt, setSyncAttempt] = useState(0);
  const authSessionRef = useRef<ReturnType<typeof readPersistedAuthSession>>(null);
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const syncedEventsRef = useRef<CalendarEvent[]>([]);
  const latestEventsRef = useRef<CalendarEvent[]>([]);
  const mutationVersionRef = useRef(0);

  useEffect(() => {
    let active = true;
    const session = readPersistedAuthSession();
    authSessionRef.current = session?.token ? session : null;

    let localEvents: CalendarEvent[] = [];
    let pendingChanges: PendingCalendarChanges | null = null;
    try {
      localEvents = readCalendarEvents(window.localStorage);
      setEvents(localEvents);
    } catch {
      setError("Локалните записи не могат да бъдат прочетени. Провери настройките на браузъра.");
    }
    latestEventsRef.current = localEvents;

    if (!session?.token) {
      setSyncStatus("local");
      return () => {
        active = false;
      };
    }

    try {
      pendingChanges = readPendingCalendarChanges(window.localStorage, session.email);
    } catch {
      setError("Промените за синхронизация не могат да бъдат прочетени от браузъра.");
    }

    void (async () => {
      try {
        const remote = await serverGetCalendarEvents({
          data: { email: session.email, token: session.token! },
        });
        if (!active) return;
        if (!remote.success) {
          setSyncStatus("error");
          setSyncError(syncErrorMessage(remote.error));
          return;
        }

        if (remote.found) {
          syncedEventsRef.current = remote.events;
          const restoredEvents = pendingChanges
            ? applyPendingCalendarChanges(remote.events, pendingChanges)
            : remote.events;
          latestEventsRef.current = restoredEvents;
          setEvents(restoredEvents);
          try {
            writeCalendarEvents(window.localStorage, restoredEvents);
          } catch {
            setError("Облачните събития са заредени, но локалното копие не може да се запази.");
          }
          if (pendingChanges) {
            const restored = await serverSaveCalendarEvents({
              data: { email: session.email, token: session.token!, events: restoredEvents },
            });
            if (!active) return;
            if (!restored.success) {
              setSyncStatus("error");
              setSyncError(syncErrorMessage(restored.error));
              return;
            }
            syncedEventsRef.current = restoredEvents;
            try {
              writePendingCalendarChanges(window.localStorage, session.email, {
                upserts: [],
                deletedIds: [],
              });
            } catch {
              setError(
                "Събитията са синхронизирани, но не можах да изчистя опашката за повторен запис.",
              );
            }
          }
          setSyncStatus("synced");
          setSyncError("");
          return;
        }

        const restoredEvents = pendingChanges
          ? applyPendingCalendarChanges(localEvents, pendingChanges)
          : localEvents;
        latestEventsRef.current = restoredEvents;
        setEvents(restoredEvents);
        if (restoredEvents.length === 0 && !pendingChanges) {
          syncedEventsRef.current = [];
          setEvents([]);
          setSyncStatus("synced");
          setSyncError("");
          return;
        }

        const migration = await serverSaveCalendarEvents({
          data: { email: session.email, token: session.token!, events: restoredEvents },
        });
        if (!active) return;
        if (!migration.success) {
          setSyncStatus("error");
          setSyncError(syncErrorMessage(migration.error));
          return;
        }
        syncedEventsRef.current = restoredEvents;
        try {
          writePendingCalendarChanges(window.localStorage, session.email, {
            upserts: [],
            deletedIds: [],
          });
        } catch {
          setError(
            "Събитията са синхронизирани, но не можах да изчистя опашката за повторен запис.",
          );
        }
        setSyncStatus("synced");
        setSyncError("");
      } catch {
        if (!active) return;
        setSyncStatus("error");
        setSyncError("Няма връзка със сървъра. Събитията остават на това устройство.");
      }
    })();

    return () => {
      active = false;
    };
  }, [syncAttempt]);

  const selectedDateObject = keyToDate(selectedDate);
  const weekDays = useMemo(() => getWeekDays(keyToDate(selectedDate)), [selectedDate]);
  const selectedDateLabel = selectedDateObject.toLocaleDateString("bg-BG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const monthLabel = selectedDateObject.toLocaleDateString("bg-BG", {
    month: "long",
    year: "numeric",
  });
  const selectedEvents = useMemo(
    () =>
      events
        .filter((event) => event.date === selectedDate)
        .sort((left, right) => left.time.localeCompare(right.time)),
    [events, selectedDate],
  );

  function persistEvents(nextEvents: CalendarEvent[]) {
    let localSaved = false;
    latestEventsRef.current = nextEvents;
    try {
      writeCalendarEvents(window.localStorage, nextEvents);
      localSaved = true;
    } catch {
      setError(
        "Локалното копие не беше запазено. Провери настройките и свободното място в браузъра.",
      );
    }

    setEvents(nextEvents);
    const session = authSessionRef.current;
    if (!session?.token) {
      setSyncStatus("local");
      return localSaved;
    }

    const mutationVersion = ++mutationVersionRef.current;
    const pendingChanges = getPendingCalendarChanges(syncedEventsRef.current, nextEvents);
    try {
      writePendingCalendarChanges(window.localStorage, session.email, pendingChanges);
    } catch {
      setError("Не успях да запазя локално опашката за синхронизация.");
    }

    setSyncStatus("syncing");
    setSyncError("");
    const save = async () => {
      try {
        const result = await serverSaveCalendarEvents({
          data: { email: session.email, token: session.token!, events: nextEvents },
        });
        if (!result.success) {
          if (mutationVersion === mutationVersionRef.current) {
            setSyncStatus("error");
            setSyncError(syncErrorMessage(result.error));
          }
          return;
        }
        syncedEventsRef.current = nextEvents;
        const stillPending = getPendingCalendarChanges(nextEvents, latestEventsRef.current);
        try {
          writePendingCalendarChanges(window.localStorage, session.email, stillPending);
        } catch {
          if (mutationVersion === mutationVersionRef.current) {
            setError("Събитията са синхронизирани, но не успях да изчистя локалната опашка.");
          }
        }
        if (mutationVersion === mutationVersionRef.current) {
          setSyncStatus("synced");
          setSyncError("");
        }
      } catch {
        if (mutationVersion === mutationVersionRef.current) {
          setSyncStatus("error");
          setSyncError("Няма връзка със сървъра. Събитията остават на това устройство.");
        }
      }
    };
    syncQueueRef.current = syncQueueRef.current.then(save, save);
    return true;
  }

  function handleAddEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("Въведи име на събитието.");
      return;
    }

    const nextEvents = [
      ...events,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: cleanTitle,
        kind,
        date: selectedDate,
        time,
      },
    ].sort((left, right) =>
      `${left.date} ${left.time}`.localeCompare(`${right.date} ${right.time}`),
    );

    if (persistEvents(nextEvents)) setTitle("");
  }

  function handleDeleteEvent(id: string) {
    persistEvents(events.filter((event) => event.id !== id));
  }

  function moveWeek(amount: number) {
    const nextDate = new Date(selectedDateObject);
    nextDate.setDate(nextDate.getDate() + amount * 7);
    setSelectedDate(dateToKey(nextDate));
    setMonth(nextDate);
  }

  return (
    <main className="min-h-[calc(100vh-68px)] bg-background text-foreground">
      <div className="flex min-h-[calc(100vh-68px)] flex-col lg:flex-row">
        <aside className="w-full shrink-0 border-b border-border/70 bg-[#131613] p-4 lg:w-[292px] lg:border-b-0 lg:border-r">
          <div className="mb-5 flex items-center gap-2 px-1">
            <CalendarDays className="size-5 text-brand" />
            <h1 className="font-display text-lg font-semibold">Календар</h1>
          </div>

          <button
            type="button"
            onClick={() => {
              const today = new Date();
              setSelectedDate(dateToKey(today));
              setMonth(today);
            }}
            className="mb-4 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-surface"
          >
            Днес
          </button>

          <div className="mb-5 rounded-2xl border border-border/60 bg-background/50 p-2">
            <Calendar
              mode="single"
              selected={selectedDateObject}
              onSelect={(date) => {
                if (date) {
                  setSelectedDate(dateToKey(date));
                  setMonth(date);
                }
              }}
              month={month}
              onMonthChange={setMonth}
              locale={bg}
              weekStartsOn={0}
              modifiers={{ hasEvent: events.map((event) => keyToDate(event.date)) }}
              modifiersClassNames={{
                hasEvent: "font-bold underline decoration-brand decoration-2 underline-offset-4",
              }}
              className="mx-auto w-full max-w-[260px] [--cell-size:2rem]"
            />
          </div>

          <section className="rounded-2xl border border-border/70 bg-surface/60 p-4">
            <p className="font-mono text-[0.65rem] tracking-[0.18em] text-brand">НОВО СЪБИТИЕ</p>
            <h2 className="mt-2 text-lg font-semibold">Добави план</h2>
            <p className="mt-1 text-xs capitalize text-muted-foreground">{selectedDateLabel}</p>

            <form className="mt-4 space-y-4" onSubmit={handleAddEvent}>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Тип</legend>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setKind("upload")}
                    aria-pressed={kind === "upload"}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors ${
                      kind === "upload"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Video className="size-4" />
                    Клип
                  </button>
                  <button
                    type="button"
                    onClick={() => setKind("stream")}
                    aria-pressed={kind === "stream"}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors ${
                      kind === "stream"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Radio className="size-4" />
                    Стрийм
                  </button>
                </div>
              </fieldset>

              <label className="block space-y-1.5 text-sm font-medium" htmlFor="calendar-title">
                Име
                <input
                  id="calendar-title"
                  required
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={100}
                  placeholder={kind === "stream" ? "Стрийм на живо" : "Нов клип"}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>

              <label className="block space-y-1.5 text-sm font-medium" htmlFor="calendar-date">
                Дата
                <input
                  id="calendar-date"
                  type="date"
                  required
                  value={selectedDate}
                  onChange={(event) => {
                    const date = event.target.value;
                    if (!date) return;
                    setSelectedDate(date);
                    setMonth(keyToDate(date));
                  }}
                  className="w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>

              <label className="block space-y-1.5 text-sm font-medium" htmlFor="calendar-time">
                Час
                <input
                  id="calendar-time"
                  type="time"
                  required
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  className="w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>

              {error ? (
                <p
                  role="alert"
                  className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                >
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={syncStatus === "loading"}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                <CalendarDays className="size-4" />
                Добави събитие
              </button>
            </form>
            <div className="mt-3 space-y-2 text-[0.7rem] leading-5">
              {syncStatus === "loading" ? (
                <p className="text-muted-foreground">Зареждане и проверка на запазените събития…</p>
              ) : null}
              {syncStatus === "syncing" ? (
                <p role="status" className="text-muted-foreground">
                  Синхронизиране на всички устройства…
                </p>
              ) : null}
              {syncStatus === "synced" ? (
                <p role="status" className="text-primary">
                  Събитията са синхронизирани с профила ти.
                </p>
              ) : null}
              {syncStatus === "local" ? (
                <p className="text-muted-foreground">
                  Запазва се само на това устройство.{" "}
                  <Link
                    to="/login"
                    className="font-semibold text-primary underline underline-offset-2"
                  >
                    Влез в профила
                  </Link>{" "}
                  за синхронизация между устройства.
                </p>
              ) : null}
              {syncError ? (
                <div role="alert" className="space-y-2 text-destructive">
                  <p>{syncError}</p>
                  <button
                    type="button"
                    onClick={() => setSyncAttempt((attempt) => attempt + 1)}
                    className="font-semibold underline underline-offset-2"
                  >
                    Опитай отново
                  </button>
                </div>
              ) : null}
              {error ? (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
          </section>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex min-h-[68px] flex-wrap items-center gap-3 border-b border-border/70 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => moveWeek(-1)}
                aria-label="Предишна седмица"
                className="grid size-9 place-items-center rounded-full text-muted-foreground transition hover:bg-surface hover:text-foreground"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => moveWeek(1)}
                aria-label="Следваща седмица"
                className="grid size-9 place-items-center rounded-full text-muted-foreground transition hover:bg-surface hover:text-foreground"
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
            <h2 className="min-w-[150px] font-display text-xl font-medium capitalize">
              {monthLabel}
            </h2>
            <span className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">
              Седмица
            </span>
            <span className="ml-auto hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              <span className="size-2 rounded-full bg-brand" />
              {events.length} {events.length === 1 ? "събитие" : "събития"}
            </span>
          </header>

          <div className="min-h-0 flex-1 overflow-auto">
            <div className="min-w-[760px]">
              <div className="sticky top-0 z-20 grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-border bg-background/95 backdrop-blur">
                <div className="border-r border-border/50" />
                {weekDays.map((day, index) => {
                  const key = dateToKey(day);
                  const isSelected = key === selectedDate;
                  const isToday = key === dateToKey(new Date());
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedDate(key)}
                      className={`flex h-[66px] flex-col items-center justify-center border-r border-border/50 transition-colors hover:bg-surface/60 ${
                        isSelected ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      <span className="font-mono text-[0.62rem] tracking-[0.16em]">
                        {WEEKDAYS[index]}
                      </span>
                      <span
                        className={`mt-1 grid size-8 place-items-center rounded-full text-sm ${
                          isToday
                            ? "bg-primary font-semibold text-primary-foreground"
                            : isSelected
                              ? "bg-primary/15 font-semibold text-primary"
                              : "text-foreground"
                        }`}
                      >
                        {day.getDate()}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))]">
                <div className="relative">
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="relative h-16 border-b border-border/60 pr-2 text-right"
                    >
                      <span className="absolute -top-2 right-2 bg-background px-1 font-mono text-[0.58rem] text-muted-foreground">
                        {String(hour).padStart(2, "0")}:00
                      </span>
                    </div>
                  ))}
                </div>

                {weekDays.map((day) => {
                  const key = dateToKey(day);
                  const dayEvents = events.filter((event) => event.date === key);
                  return (
                    <div
                      key={key}
                      className="relative border-l border-border/60"
                      style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}
                      onClick={(event) => {
                        const bounds = event.currentTarget.getBoundingClientRect();
                        const hour = Math.max(
                          0,
                          Math.min(23, Math.floor((event.clientY - bounds.top) / HOUR_HEIGHT)),
                        );
                        setSelectedDate(key);
                        setTime(`${String(hour).padStart(2, "0")}:00`);
                      }}
                    >
                      {HOURS.map((hour) => (
                        <div
                          key={hour}
                          className="h-16 border-b border-border/60 transition-colors hover:bg-surface/30"
                        />
                      ))}
                      {dayEvents.map((event) => {
                        const [hour = 0, minute = 0] = event.time.split(":").map(Number);
                        const top = ((hour * 60 + minute) / 60) * HOUR_HEIGHT;
                        const Icon = event.kind === "stream" ? Radio : Video;
                        return (
                          <article
                            key={event.id}
                            onClick={(clickEvent) => clickEvent.stopPropagation()}
                            className={`absolute left-1 right-1 z-10 overflow-hidden rounded-md border px-1.5 py-1 shadow-sm sm:left-1.5 sm:right-1.5 sm:px-2 ${
                              event.kind === "stream"
                                ? "border-sky-400/40 bg-sky-500/15 text-sky-200"
                                : "border-primary/40 bg-primary/15 text-primary"
                            }`}
                            style={{ top: `${top}px`, height: `${HOUR_HEIGHT - 4}px` }}
                          >
                            <div className="flex items-center gap-1 text-[0.62rem] font-semibold sm:text-xs">
                              <Icon className="size-3 shrink-0" />
                              <span className="truncate">{event.title}</span>
                            </div>
                            <p className="mt-1 flex items-center gap-1 text-[0.58rem] opacity-80">
                              <Clock3 className="size-3" />
                              {event.time}
                            </p>
                            <button
                              type="button"
                              aria-label={`Изтрий ${event.title}`}
                              disabled={syncStatus === "loading"}
                              onClick={() => handleDeleteEvent(event.id)}
                              className="absolute bottom-1 right-1 grid size-5 place-items-center rounded hover:bg-black/20"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="border-t border-border/70 bg-surface/30 px-4 py-3 text-xs text-muted-foreground lg:hidden">
            Избран ден: <span className="capitalize text-foreground">{selectedDateLabel}</span>
            {selectedEvents.length > 0
              ? ` · ${selectedEvents.length} ${selectedEvents.length === 1 ? "събитие" : "събития"}`
              : " · няма събития"}
          </div>
        </section>
      </div>
    </main>
  );
}
