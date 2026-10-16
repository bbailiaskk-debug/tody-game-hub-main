import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-7xl font-bold text-foreground">404</p>
        <h1 className="mt-4 text-xl font-semibold text-foreground">Страницата не е намерена</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Страницата, която търсиш, не съществува или е преместена.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Към началото
          </Link>
        </div>
      </div>
    </div>
  );
}