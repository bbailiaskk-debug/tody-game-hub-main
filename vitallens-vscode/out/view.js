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
exports.VitalLensViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const core_1 = require("./core");
const CATEGORY_ICON = {
  seo: "search",
  perf: "zap",
  images: "image",
  bundles: "package",
  a11y: "accessibility",
  redirects: "debug-reverse-continue",
};
const RATING_TEXT = {
  good: "GOOD",
  "needs-improvement": "IMPROVE",
  poor: "POOR",
};
class VitalLensViewProvider {
  store;
  openIssueCommand;
  onDidChangeTreeDataEvent = new vscode.EventEmitter();
  constructor(store, openIssueCommand) {
    this.store = store;
    this.openIssueCommand = openIssueCommand;
  }
  get onDidChangeTreeData() {
    return this.onDidChangeTreeDataEvent.event;
  }
  refresh() {
    this.onDidChangeTreeDataEvent.fire();
  }
  getTreeItem(node) {
    return node.treeItem();
  }
  getChildren(node) {
    if (!node) return this.rootNodes();
    if (node instanceof ScoreNode) return node.children;
    if (node instanceof VitalNode) return node.children;
    if (node instanceof CategoryNode) return node.children;
    return [];
  }
  rootNodes() {
    const report = this.store.report;
    const score = new ScoreNode(report.score, report.categoryCounts, this.store.fileCount);
    const vitals = new VitalNode(report.lcp, report.cls, report.inp);
    const issues = this.groupIssues();
    return [score, vitals, ...issues];
  }
  groupIssues() {
    const byCategory = new Map();
    for (const issue of this.store.issues) {
      if (!byCategory.has(issue.category)) byCategory.set(issue.category, []);
      byCategory.get(issue.category).push(issue);
    }
    const nodes = [];
    for (const [category, issues] of byCategory) {
      nodes.push(new CategoryNode(category, this.openIssueCommand, issues));
    }
    return nodes.sort((a, b) => b.issueCount - a.issueCount);
  }
}
exports.VitalLensViewProvider = VitalLensViewProvider;
class ScoreNode {
  score;
  fileCount;
  children;
  constructor(score, counts, fileCount) {
    this.score = score;
    this.fileCount = fileCount;
    this.children = Object.keys(counts).map(
      (category) => new ICategoryCountNode(category, counts[category]),
    );
  }
  treeItem() {
    const item = new vscode.TreeItem(
      `Score  ${this.score}/100`,
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    item.description = this.rating();
    item.iconPath = new vscode.ThemeIcon(
      this.score >= 80 ? "pass" : this.score >= 60 ? "warning" : "error",
      this.score >= 80
        ? new vscode.ThemeColor("charts.green")
        : this.score >= 60
          ? new vscode.ThemeColor("charts.yellow")
          : new vscode.ThemeColor("charts.red"),
    );
    item.tooltip = `Predicted Lighthouse score · scanned ${this.fileCount} file(s)`;
    item.contextValue = "vitallens.score";
    return item;
  }
  rating() {
    return this.score >= 80 ? "excellent" : this.score >= 60 ? "needs work" : "critical";
  }
}
class ICategoryCountNode {
  category;
  count;
  constructor(category, count) {
    this.category = category;
    this.count = count;
  }
  treeItem() {
    const item = new vscode.TreeItem(core_1.CATEGORY_LABEL[this.category]);
    item.description = `${this.count} issue(s)`;
    item.iconPath = new vscode.ThemeIcon(CATEGORY_ICON[this.category]);
    return item;
  }
}
class VitalNode {
  children;
  constructor(lcp, cls, inp) {
    this.children = [
      new VitalRowNode("LCP", lcp.value, lcp.rating, 2500, 4000),
      new VitalRowNode("CLS", cls.value, cls.rating, 0.1, 0.25),
      new VitalRowNode("INP", inp.value, inp.rating, 200, 500),
    ];
  }
  treeItem() {
    const item = new vscode.TreeItem("Core Web Vitals", vscode.TreeItemCollapsibleState.Collapsed);
    item.iconPath = new vscode.ThemeIcon("pulse");
    item.tooltip = "Predicted Core Web Vitals based on detected issues";
    return item;
  }
}
class VitalRowNode {
  name;
  value;
  rating;
  good;
  poor;
  constructor(name, value, rating, good, poor) {
    this.name = name;
    this.value = value;
    this.rating = rating;
    this.good = good;
    this.poor = poor;
  }
  treeItem() {
    const colored = new vscode.ThemeColor(
      this.rating === "good"
        ? "charts.green"
        : this.rating === "needs-improvement"
          ? "charts.yellow"
          : "charts.red",
    );
    const item = new vscode.TreeItem(this.name);
    item.description = `${this.rating === "CLS" ? this.value.toFixed(3) : `${Math.round(this.value)}ms`}  ·  ${RATING_TEXT[this.rating]}`;
    item.iconPath = new vscode.ThemeIcon("check", colored);
    item.tooltip = `Threshold: good ≤ ${this.good}, poor ≥ ${this.poor}`;
    return item;
  }
}
class CategoryNode {
  category;
  openIssueCommand;
  children;
  constructor(category, openIssueCommand, children) {
    this.category = category;
    this.openIssueCommand = openIssueCommand;
    this.children = children.map((issue) => new IssueNode(issue, this.openIssueCommand));
  }
  get issueCount() {
    return this.children.length;
  }
  treeItem() {
    const item = new vscode.TreeItem(
      core_1.CATEGORY_LABEL[this.category],
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    item.description = `${this.issueCount} issue(s)`;
    item.iconPath = new vscode.ThemeIcon(CATEGORY_ICON[this.category]);
    return item;
  }
}
class IssueNode {
  issue;
  openIssueCommand;
  constructor(issue, openIssueCommand) {
    this.issue = issue;
    this.openIssueCommand = openIssueCommand;
  }
  treeItem() {
    const item = new vscode.TreeItem(this.issue.message, vscode.TreeItemCollapsibleState.None);
    item.tooltip = `${this.issue.rule}\n${this.issue.message}`;
    item.iconPath = new vscode.ThemeIcon(
      this.issue.severity === "error"
        ? "error"
        : this.issue.severity === "warning"
          ? "warning"
          : "info",
      this.issue.severity === "error"
        ? new vscode.ThemeColor("charts.red")
        : this.issue.severity === "warning"
          ? new vscode.ThemeColor("charts.yellow")
          : undefined,
    );
    item.description = this.issue.rule;
    item.command = {
      command: this.openIssueCommand,
      title: "Open issue",
      arguments: [this.issue],
    };
    item.contextValue = "vitallens.issue";
    return item;
  }
}
//# sourceMappingURL=view.js.map
