import * as vscode from "vscode";

export type Vital = "LCP" | "CLS" | "INP";

export type Category = "seo" | "perf" | "images" | "bundles" | "a11y" | "redirects";

export type Severity = "error" | "warning" | "info";

export type Rating = "good" | "needs-improvement" | "poor";

export interface Fix {
  title: string;
  replacement: string;
}

export interface Issue {
  category: Category;
  severity: Severity;
  range: vscode.Range;
  message: string;
  rule: string;
  vital?: Vital;
  delta?: number;
  fix?: Fix;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  seo: "SEO",
  perf: "Performance",
  images: "Images",
  bundles: "Bundles",
  a11y: "Accessibility",
  redirects: "Redirects",
};

const CATEGORY_WEIGHT: Record<Category, number> = {
  seo: 12,
  perf: 12,
  images: 10,
  bundles: 9,
  a11y: 7,
  redirects: 10,
};

const SEVERITY_FACTOR: Record<Severity, number> = {
  error: 1,
  warning: 0.5,
  info: 0.2,
};

export interface VitalsReport {
  score: number;
  lcp: { value: number; rating: Rating };
  cls: { value: number; rating: Rating };
  inp: { value: number; rating: Rating };
  categoryCounts: Record<Category, number>;
}

function ratingFor(value: number, good: number, poor: number): Rating {
  if (value <= good) return "good";
  if (value < poor) return "needs-improvement";
  return "poor";
}

export function buildVitalsReport(issues: Issue[]): VitalsReport {
  const categoryCounts: Record<Category, number> = {
    seo: 0,
    perf: 0,
    images: 0,
    bundles: 0,
    a11y: 0,
    redirects: 0,
  };

  for (const issue of issues) {
    categoryCounts[issue.category] += 1;
  }

  let lcpMs = 2100;
  let cls = 0.02;
  let inpMs = 40;

  for (const issue of issues) {
    if (issue.vital === "LCP" && issue.delta != null) lcpMs += issue.delta;
    if (issue.vital === "CLS" && issue.delta != null) cls += issue.delta;
    if (issue.vital === "INP" && issue.delta != null) inpMs += issue.delta;
  }

  lcpMs = clamp(lcpMs, 300, 12000);
  cls = clamp(cls, 0, 1);
  inpMs = clamp(inpMs, 10, 1000);

  let score = 100;
  for (const issue of issues) {
    score -= CATEGORY_WEIGHT[issue.category] * SEVERITY_FACTOR[issue.severity];
  }
  score = clamp(Math.round(score), 0, 100);

  return {
    score,
    lcp: { value: lcpMs, rating: ratingFor(lcpMs, 2500, 4000) },
    cls: { value: cls, rating: ratingFor(cls, 0.1, 0.25) },
    inp: { value: inpMs, rating: ratingFor(inpMs, 200, 500) },
    categoryCounts,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export class VitalLensStore implements vscode.Disposable {
  private readonly issuesByFile = new Map<string, Issue[]>();
  private readonly onDidChange = new vscode.EventEmitter<void>();

  constructor(
    readonly diagnostics: vscode.DiagnosticCollection,
    readonly onDiagnosticOpen = (_uri: vscode.Uri, _range: vscode.Range) => {},
  ) {
    this.diagnostics = diagnostics;
  }

  get onDidChangeEvent(): vscode.Event<void> {
    return this.onDidChange.event;
  }

  dispose(): void {
    this.diagnostics.dispose();
    this.onDidChange.dispose();
  }

  update(uri: vscode.Uri, issues: Issue[]): void {
    this.issuesByFile.set(uri.toString(), issues);
    this.publishDiagnostics(uri, issues);
    this.onDidChange.fire();
  }

  clear(uri: vscode.Uri): void {
    this.issuesByFile.delete(uri.toString());
    this.diagnostics.delete(uri);
    this.onDidChange.fire();
  }

  reset(): void {
    this.issuesByFile.clear();
    this.diagnostics.clear();
    this.onDidChange.fire();
  }

  get issues(): Issue[] {
    const all: Issue[] = [];
    for (const list of this.issuesByFile.values()) all.push(...list);
    return all;
  }

  get report(): VitalsReport {
    return buildVitalsReport(this.issues);
  }

  get fileCount(): number {
    return this.issuesByFile.size;
  }

  uriOf(issue: Issue): vscode.Uri | undefined {
    for (const [uri, issues] of this.issuesByFile) {
      if (issues.includes(issue)) return vscode.Uri.parse(uri);
    }
    return undefined;
  }

  issuesIn(uri: vscode.Uri): Issue[] {
    return this.issuesByFile.get(uri.toString()) ?? [];
  }

  private publishDiagnostics(uri: vscode.Uri, issues: Issue[]): void {
    const mapped = issues.map((issue) => {
      const diagnostic = new vscode.Diagnostic(
        issue.range,
        issue.message,
        issue.severity === "error"
          ? vscode.DiagnosticSeverity.Error
          : issue.severity === "warning"
            ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Information,
      );
      diagnostic.source = "VitalLens";
      diagnostic.code = issue.rule;
      return diagnostic;
    });
    this.diagnostics.set(uri, mapped);
  }
}

export function nameForUri(uri: vscode.Uri): string {
  const segments = uri.path.split("/");
  return segments[segments.length - 1] || uri.toString();
}

export function relativePath(uri: vscode.Uri, root?: vscode.WorkspaceFolder): string {
  if (!root) return nameForUri(uri);
  const relative = vscode.workspace.asRelativePath(uri, false);
  return relative || nameForUri(uri);
}
