"use strict";
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
      }
    : function (o, v) {
        o["default"] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== "default") __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const core_1 = require("./core");
const html_1 = require("./linters/html");
const css_1 = require("./linters/css");
const js_1 = require("./linters/js");
const packages_1 = require("./linters/packages");
const redirects_1 = require("./linters/redirects");
const view_1 = require("./view");
const DIAGNOSTIC_SOURCE = "VitalLens";
function activate(context) {
  if (!isEnabled()) return;
  const diagnostics = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  const store = new core_1.VitalLensStore(diagnostics);
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  statusBar.text = `$(graph-line) VitalLens`;
  statusBar.tooltip = "VitalLens — SEO & Performance Analyzer";
  statusBar.command = "vitallens.showPanel";
  statusBar.show();
  const provider = new view_1.VitalLensViewProvider(store, "vitallens.openIssue");
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
    vscode.commands.registerCommand("vitallens.openIssue", (...args) => {
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
async function refreshAndScanActive(store, provider, statusBar) {
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
async function scanWorkspace(store) {
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
async function scanDocument(store, document) {
  if (isVitalLensSource(document)) {
    store.clear(document.uri);
    return;
  }
  const language = document.languageId;
  let issues = [];
  if (
    language.startsWith("html") ||
    language === "javascriptreact" ||
    language === "typescriptreact"
  ) {
    issues = issues.concat((0, html_1.lintHtmlLike)(document));
  }
  if (language.startsWith("css") || language === "scss" || language === "less") {
    issues = issues.concat((0, css_1.lintCss)(document));
  }
  if (language === "javascript" || language === "typescript") {
    issues = issues.concat((0, js_1.lintJsTypeScript)(document));
  }
  if (/package\.json$/.test(document.fileName)) {
    issues = issues.concat((0, packages_1.lintPackageJson)(document));
  }
  if (
    /redirect|next\.config|routes\./i.test(document.fileName) ||
    hasRedirectLikeContent(document)
  ) {
    issues = issues.concat((0, redirects_1.lintRedirects)(document));
  }
  issues = issues.filter((issue) => stripComments(document, issue));
  if (issues.length > 0) store.update(document.uri, issues);
  else store.clear(document.uri);
}
function hasRedirectLikeContent(document) {
  const text = document.getText();
  return (
    /"(?:source|from|uri)"\s*:\s*"/.test(text) && /"(?:destination|to|redirect)"\s*:\s*"/.test(text)
  );
}
function stripComments(document, issue) {
  const lineNumber = issue.range.start.line;
  if (lineNumber < 0) return true;
  const line = document.lineAt(lineNumber).text;
  const trimmed = line.trimStart();
  if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return false;
  return true;
}
function updateStatusBar(statusBar, store) {
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
function formatVitalValue(vital, value) {
  return vital === "CLS" ? value.toFixed(3) : `${Math.round(value)}`;
}
async function openIssue(store, args) {
  if (!args.length) return;
  const first = args[0];
  if (typeof first === "string" && typeof args[1] === "number") {
    await revealUri(first, args[1]);
    return;
  }
  if (first && typeof first === "object" && "range" in first) {
    const issue = first;
    const uri = store.uriOf(issue);
    if (uri && issue.range) await revealRange(uri, issue.range, issue.message);
    return;
  }
}
async function revealUri(uriString, line) {
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
async function revealRange(uri, range, message) {
  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document);
  editor.selection = new vscode.Selection(range.start, range.end);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  if (message) {
    void vscode.window.showInformationMessage(`VitalLens: ${message}`);
  }
}
class VitalLensCodeLensProvider {
  provideCodeLenses(document) {
    return isEnabled() && /package\.json$/.test(document.fileName)
      ? (0, packages_1.bundleCodeLenses)(document)
      : [];
  }
}
class VitalLensCodeActionProvider {
  store;
  constructor(store) {
    this.store = store;
  }
  provideCodeActions(document, _range, context) {
    const actions = [];
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
function isScannableLanguage(document) {
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
function isVitalLensSource(document) {
  return /[\\/]vitallens-vscode[\\/]/i.test(document.uri.fsPath);
}
function isEnabled() {
  const config = vscode.workspace.getConfiguration("vitallens");
  return config.get("enabled", true);
}
function deactivate() {}
//# sourceMappingURL=extension.js.map
