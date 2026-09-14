import * as vscode from "vscode";
import { Issue, VitalLensStore } from "./core";
import { lintHtmlLike } from "./linters/html";
import { lintCss } from "./linters/css";
import { lintJsTypeScript } from "./linters/js";
import { lintPackageJson, bundleCodeLenses } from "./linters/packages";
import { lintRedirects } from "./linters/redirects";
import { VitalLensViewProvider } from "./view";

const DIAGNOSTIC_SOURCE = "VitalLens";

export function activate(context: vscode.ExtensionContext): void {
  if (!isEnabled()) return;

  const diagnostics = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  const store = new VitalLensStore(diagnostics);

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  statusBar.text = `$(graph-line) VitalLens`;
  statusBar.tooltip = "VitalLens — SEO & Performance Analyzer";
  statusBar.command = "vitallens.showPanel";
  statusBar.show();

  const provider = new VitalLensViewProvider(store, "vitallens.openIssue");
  const treeView = vscode.window.createTreeView("vitallens.view", {
    treeDataProvider: provider,
  });

  context.subscriptions.push(
    diagnostics,
    store,
    statusBar,
    treeView,
    vscode.languages.registerCodeActionsProvider(
      [
        { language: "html" },
        { language: "javascript" },
        { language: "javascriptreact" },
        { language: "typescriptreact" },
        { language: "css" },
        { language: "scss" },
        { language: "less" },
        { language: "json" },
        { language: "jsonc" },
      ],
      new VitalLensCodeActionProvider(store),
    ),
    vscode.languages.registerCodeLensProvider(
      [
        { language: "json", pattern: "**/package.json" },
        { language: "jsonc", pattern: "**/package.json" },
      ],
      new VitalLensCodeLensProvider(),
    ),
  );

  const refresh = () => {
    if (!isEnabled()) return;
    store.reset();
    scanWorkspace(store).then(() => {
      provider.refresh();
      updateStatusBar(statusBar, store);
    });
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("vitallens.refresh", refresh),
    vscode.commands.registerCommand("vitallens.showPanel", () => {
      vscode.commands.executeCommand("workbench.view.extension.vitallens");
    }),
    vscode.commands.registerCommand("vitallens.openIssue", (...args: unknown[]) => {
      void openIssue(store, args);
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (!isEnabled() || !isScannableLanguage(document)) return;
      void scanDocument(store, document).then(() => {
        provider.refresh();
        updateStatusBar(statusBar, store);
      });
    }),
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (!isEnabled() || !isScannableLanguage(document)) return;
      void scanDocument(store, document).then(() => provider.refresh());
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      store.clear(document.uri);
      provider.refresh();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("vitallens")) {
        if (isEnabled()) refresh();
        else {
          store.reset();
          provider.refresh();
          statusBar.text = "$(graph-line) VitalLens (disabled)";
        }
      }
    }),
  );

  setImmediate(() => {
    void refreshAndScanActive(store, provider, statusBar);
  });

  updateStatusBar(statusBar, store);
}

async function refreshAndScanActive(
  store: VitalLensStore,
  provider: VitalLensViewProvider,
  statusBar: vscode.StatusBarItem,
): Promise<void> {
  store.reset();
  await Promise.all(
    vscode.workspace.textDocuments
      .filter((document) => isScannableLanguage(document))
      .map((document) => scanDocument(store, document)),
  );
  await scanWorkspace(store);
  provider.refresh();
  updateStatusBar(statusBar, store);
}

async function scanWorkspace(store: VitalLensStore): Promise<void> {
  const patterns =
    "**/{*.html,*.htm,package.json,next.config.js,next.config.mjs,next.config.ts,next.config.cjs,*.tsx,*.jsx,*.css,*.scss,*.less}";
  const exclude =
    "**/{node_modules,out,dist,.output,build,coverage,.git,.wrangler,vitallens-vscode}/**";
  const uris = await vscode.workspace.findFiles(patterns, exclude, 30000);
  await Promise.all(
    uris.map(async (uri) => {
      try {
        const document = await vscode.workspace.openTextDocument(uri);
        if (isScannableLanguage(document)) {
          await scanDocument(store, document);
        } else {
          store.clear(uri);
        }
      } catch {
        store.clear(uri);
      }
    }),
  );
}

async function scanDocument(store: VitalLensStore, document: vscode.TextDocument): Promise<void> {
  if (isVitalLensSource(document)) {
    store.clear(document.uri);
    return;
  }

  const language = document.languageId;
  let issues: Issue[] = [];

  if (
    language.startsWith("html") ||
    language === "javascriptreact" ||
    language === "typescriptreact"
  ) {
    issues = issues.concat(lintHtmlLike(document));
  }
  if (language.startsWith("css") || language === "scss" || language === "less") {
    issues = issues.concat(lintCss(document));
  }
  if (language === "javascript" || language === "typescript") {
    issues = issues.concat(lintJsTypeScript(document));
  }
  if (/package\.json$/.test(document.fileName)) {
    issues = issues.concat(lintPackageJson(document));
  }
  if (
    /redirect|next\.config|routes\./i.test(document.fileName) ||
    hasRedirectLikeContent(document)
  ) {
    issues = issues.concat(lintRedirects(document));
  }

  issues = issues.filter((issue) => stripComments(document, issue));

  if (issues.length > 0) store.update(document.uri, issues);
  else store.clear(document.uri);
}

function hasRedirectLikeContent(document: vscode.TextDocument): boolean {
  const text = document.getText();
  return (
    /"(?:source|from|uri)"\s*:\s*"/.test(text) && /"(?:destination|to|redirect)"\s*:\s*"/.test(text)
  );
}

function stripComments(document: vscode.TextDocument, issue: Issue): boolean {
  const lineNumber = issue.range.start.line;
  if (lineNumber < 0) return true;
  const line = document.lineAt(lineNumber).text;
  const trimmed = line.trimStart();
  if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return false;
  return true;
}

function updateStatusBar(statusBar: vscode.StatusBarItem, store: VitalLensStore): void {
  const report = store.report;
  statusBar.text = `$(graph-line) VitalLens ${report.score}`;
  statusBar.tooltip =
    `VitalLens ${report.score}/100 · ` +
    `LCP ${formatVitalValue("LCP", report.lcp.value)}ms (${report.lcp.rating}) · ` +
    `CLS ${formatVitalValue("CLS", report.cls.value)} (${report.cls.rating}) · ` +
    `INP ${formatVitalValue("INP", report.inp.value)}ms (${report.inp.rating})`;
  statusBar.color =
    report.score >= 80
      ? new vscode.ThemeColor("charts.green")
      : report.score >= 60
        ? new vscode.ThemeColor("charts.yellow")
        : new vscode.ThemeColor("charts.red");
}

function formatVitalValue(vital: string, value: number): string {
  return vital === "CLS" ? value.toFixed(3) : `${Math.round(value)}`;
}

async function openIssue(store: VitalLensStore, args: unknown[]): Promise<void> {
  if (!args.length) return;
  const first = args[0];

  if (typeof first === "string" && typeof args[1] === "number") {
    await revealUri(first, args[1]);
    return;
  }

  if (first && typeof first === "object" && "range" in first) {
    const issue = first as Issue;
    const uri = store.uriOf(issue);
    if (uri && issue.range) await revealRange(uri, issue.range, issue.message);
    return;
  }
}

async function revealUri(uriString: string, line: number): Promise<void> {
  const uri = vscode.Uri.parse(uriString);
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document);
  const position = new vscode.Position(line, 0);
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
  }
}

async function revealRange(uri: vscode.Uri, range: vscode.Range, message?: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document);
  editor.selection = new vscode.Selection(range.start, range.end);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  if (message) {
    void vscode.window.showInformationMessage(`VitalLens: ${message}`);
  }
}

class VitalLensCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.ProviderResult<vscode.CodeLens[]> {
    return isEnabled() && /package\.json$/.test(document.fileName)
      ? bundleCodeLenses(document)
      : [];
  }
}

class VitalLensCodeActionProvider implements vscode.CodeActionProvider {
  constructor(private readonly store: VitalLensStore) {}

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const storeIssues = this.store.issuesIn(document.uri);
    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== DIAGNOSTIC_SOURCE) continue;
      const matched = storeIssues.find(
        (issue) =>
          issue.range.isEqual(diagnostic.range) &&
          issue.message === diagnostic.message &&
          issue.fix,
      );
      if (!matched || !matched.fix) continue;
      const action = new vscode.CodeAction(matched.fix.title, vscode.CodeActionKind.QuickFix);
      action.isPreferred = true;
      const line = document.lineAt(matched.range.start.line).text;
      const start = new vscode.Position(matched.range.start.line, 0);
      const end = new vscode.Position(matched.range.start.line, line.length);
      action.edit = new vscode.WorkspaceEdit();
      action.edit.replace(document.uri, new vscode.Range(start, end), matched.fix.replacement);
      actions.push(action);
    }
    return actions;
  }
}

function isScannableLanguage(document: vscode.TextDocument): boolean {
  if (isVitalLensSource(document)) return false;

  const language = document.languageId;
  if (
    language.startsWith("html") ||
    language === "css" ||
    language === "scss" ||
    language === "less" ||
    language === "javascript" ||
    language === "javascriptreact" ||
    language === "typescript" ||
    language === "typescriptreact" ||
    language === "json" ||
    language === "jsonc"
  ) {
    return true;
  }
  return /package\.json$/i.test(document.fileName);
}

function isVitalLensSource(document: vscode.TextDocument): boolean {
  return /[\\/]vitallens-vscode[\\/]/i.test(document.uri.fsPath);
}

function isEnabled(): boolean {
  const config = vscode.workspace.getConfiguration("vitallens");
  return config.get<boolean>("enabled", true);
}

export function deactivate(): void {}
