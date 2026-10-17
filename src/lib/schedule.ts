export function scheduleWork(fn: () => void): number {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(() => fn());
  }
  return window.setTimeout(() => fn(), 0);
}

export function yieldToMainThread(): Promise<void> {
  return new Promise<void>((resolve) => {
    scheduleWork(resolve);
  });
}

export function scheduleIdleWork(fn: () => void): number | void {
  if (
    typeof window !== "undefined" &&
    "requestIdleCallback" in window &&
    typeof (window as Window & { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback === "function"
  ) {
    return (
      window as Window & { requestIdleCallback: (cb: () => void, opts?: object) => number }
    ).requestIdleCallback(fn, { timeout: 2000 });
  }
  return scheduleWork(fn);
}

export function throttle<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs = 100,
): (...args: Args) => void {
  let lastRun = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let pendingArgs: Args | null = null;

  const run = (args: Args) => {
    lastRun = Date.now();
    timeout = undefined;
    pendingArgs = null;
    fn(...args);
  };

  return (...args: Args) => {
    pendingArgs = args;
    const elapsed = Date.now() - lastRun;
    if (timeout !== undefined) return;
    if (elapsed >= waitMs) {
      run(args);
      return;
    }
    timeout = setTimeout(() => {
      if (pendingArgs !== null) run(pendingArgs);
    }, waitMs - elapsed);
  };
}

export function rafThrottle<Args extends unknown[]>(
  fn: (...args: Args) => void,
): (...args: Args) => void {
  let scheduled = false;
  let pendingArgs: Args | null = null;

  const flush = () => {
    scheduled = false;
    const args = pendingArgs;
    pendingArgs = null;
    if (args) fn(...args);
  };

  return (...args: Args) => {
    pendingArgs = args;
    if (scheduled) return;
    scheduled = true;
    scheduleWork(flush);
  };
}
