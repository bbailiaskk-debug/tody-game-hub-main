"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { reportLovableError } from "@/lib/lovable-error-reporting";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [recoveryFailed, setRecoveryFailed] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") console.error(error);
    reportLovableError(error, { boundary: "next_app_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Страницата не се зареди</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Възникна неочаквана грешка. Опитай отново или презареди страницата.
        </p>
        {recoveryFailed ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Повторният опит не успя. Презареди страницата, за да опиташ отново.
          </p>
        ) : null}
        {process.env.NODE_ENV === "development" && error?.message ? (
          <details className="mt-4 text-left text-xs text-muted-foreground">
            <summary className="cursor-pointer">Технически подробности</summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap">{error.message}</pre>
          </details>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              setRecoveryFailed(false);
              try {
                reset();
              } catch (retryError: unknown) {
                console.error("Root route recovery failed", retryError);
                setRecoveryFailed(true);
              }
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Опитай отново
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Презареди страницата
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Към началото
          </Link>
        </div>
      </div>
    </div>
  );
}