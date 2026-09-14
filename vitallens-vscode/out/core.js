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
exports.VitalLensStore = exports.CATEGORY_LABEL = void 0;
exports.buildVitalsReport = buildVitalsReport;
exports.nameForUri = nameForUri;
exports.relativePath = relativePath;
const vscode = __importStar(require("vscode"));
exports.CATEGORY_LABEL = {
  seo: "SEO",
  perf: "Performance",
  images: "Images",
  bundles: "Bundles",
  a11y: "Accessibility",
  redirects: "Redirects",
};
const CATEGORY_WEIGHT = {
  seo: 12,
  perf: 12,
  images: 10,
  bundles: 9,
  a11y: 7,
  redirects: 10,
};
const SEVERITY_FACTOR = {
  error: 1,
  warning: 0.5,
  info: 0.2,
};
function ratingFor(value, good, poor) {
  if (value <= good) return "good";
  if (value < poor) return "needs-improvement";
  return "poor";
}
function buildVitalsReport(issues) {
  const categoryCounts = {
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
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
class VitalLensStore {
  diagnostics;
  onDiagnosticOpen;
  issuesByFile = new Map();
  onDidChange = new vscode.EventEmitter();
  constructor(diagnostics, onDiagnosticOpen = (_uri, _range) => {}) {
    this.diagnostics = diagnostics;
    this.onDiagnosticOpen = onDiagnosticOpen;
    this.diagnostics = diagnostics;
  }
  get onDidChangeEvent() {
    return this.onDidChange.event;
  }
  dispose() {
    this.diagnostics.dispose();
    this.onDidChange.dispose();
  }
  update(uri, issues) {
    this.issuesByFile.set(uri.toString(), issues);
    this.publishDiagnostics(uri, issues);
    this.onDidChange.fire();
  }
  clear(uri) {
    this.issuesByFile.delete(uri.toString());
    this.diagnostics.delete(uri);
    this.onDidChange.fire();
  }
  reset() {
    this.issuesByFile.clear();
    this.diagnostics.clear();
    this.onDidChange.fire();
  }
  get issues() {
    const all = [];
    for (const list of this.issuesByFile.values()) all.push(...list);
    return all;
  }
  get report() {
    return buildVitalsReport(this.issues);
  }
  get fileCount() {
    return this.issuesByFile.size;
  }
  uriOf(issue) {
    for (const [uri, issues] of this.issuesByFile) {
      if (issues.includes(issue)) return vscode.Uri.parse(uri);
    }
    return undefined;
  }
  issuesIn(uri) {
    return this.issuesByFile.get(uri.toString()) ?? [];
  }
  publishDiagnostics(uri, issues) {
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
exports.VitalLensStore = VitalLensStore;
function nameForUri(uri) {
  const segments = uri.path.split("/");
  return segments[segments.length - 1] || uri.toString();
}
function relativePath(uri, root) {
  if (!root) return nameForUri(uri);
  const relative = vscode.workspace.asRelativePath(uri, false);
  return relative || nameForUri(uri);
}
//# sourceMappingURL=core.js.map
