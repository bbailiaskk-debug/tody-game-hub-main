import * as vscode from "vscode";
import { CATEGORY_LABEL, Category, Issue, VitalLensStore } from "./core";

type Node = ScoreNode | VitalNode | VitalRowNode | CategoryNode | ICategoryCountNode | IssueNode;

const CATEGORY_ICON: Record<Category, string> = {
  seo: "search",
  perf: "zap",
  images: "image",
  bundles: "package",
  a11y: "accessibility",
  redirects: "debug-reverse-continue",
};

const RATING_TEXT: Record<string, string> = {
  good: "GOOD",
  "needs-improvement": "IMPROVE",
  poor: "POOR",
};

export class VitalLensViewProvider implements vscode.TreeDataProvider<Node> {
  private readonly onDidChangeTreeDataEvent = new vscode.EventEmitter<void>();

  constructor(
    private readonly store: VitalLensStore,
    private readonly openIssueCommand: string,
  ) {}

  get onDidChangeTreeData(): vscode.Event<void> {
    return this.onDidChangeTreeDataEvent.event;
  }

  refresh(): void {
    this.onDidChangeTreeDataEvent.fire();
  }

  getTreeItem(node: Node): vscode.TreeItem {
    return node.treeItem();
  }

  getChildren(node?: Node): Node[] {
    if (!node) return this.rootNodes();
    if (node instanceof ScoreNode) return node.children;
    if (node instanceof VitalNode) return node.children;
    if (node instanceof CategoryNode) return node.children;
    return [];
  }

  private rootNodes(): Node[] {
    const report = this.store.report;
    const score = new ScoreNode(report.score, report.categoryCounts, this.store.fileCount);
    const vitals = new VitalNode(report.lcp, report.cls, report.inp);
    const issues = this.groupIssues();
    return [score, vitals, ...issues];
  }

  private groupIssues(): CategoryNode[] {
    const byCategory = new Map<Category, Issue[]>();
    for (const issue of this.store.issues) {
      if (!byCategory.has(issue.category)) byCategory.set(issue.category, []);
      byCategory.get(issue.category)!.push(issue);
    }
    const nodes: CategoryNode[] = [];
    for (const [category, issues] of byCategory) {
      nodes.push(new CategoryNode(category, this.openIssueCommand, issues));
    }
    return nodes.sort((a, b) => b.issueCount - a.issueCount);
  }
}

class ScoreNode {
  readonly children: ICategoryCountNode[];

  constructor(
    readonly score: number,
    counts: Record<Category, number>,
    readonly fileCount: number,
  ) {
    this.children = (Object.keys(counts) as Category[]).map(
      (category) => new ICategoryCountNode(category, counts[category]),
    );
  }

  treeItem(): vscode.TreeItem {
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

  private rating(): string {
    return this.score >= 80 ? "excellent" : this.score >= 60 ? "needs work" : "critical";
  }
}

class ICategoryCountNode {
  constructor(
    readonly category: Category,
    readonly count: number,
  ) {}

  treeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(CATEGORY_LABEL[this.category]);
    item.description = `${this.count} issue(s)`;
    item.iconPath = new vscode.ThemeIcon(CATEGORY_ICON[this.category]);
    return item;
  }
}

class VitalNode {
  readonly children: VitalRowNode[];

  constructor(
    lcp: { value: number; rating: string },
    cls: { value: number; rating: string },
    inp: { value: number; rating: string },
  ) {
    this.children = [
      new VitalRowNode("LCP", lcp.value, lcp.rating, 2500, 4000),
      new VitalRowNode("CLS", cls.value, cls.rating, 0.1, 0.25),
      new VitalRowNode("INP", inp.value, inp.rating, 200, 500),
    ];
  }

  treeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem("Core Web Vitals", vscode.TreeItemCollapsibleState.Collapsed);
    item.iconPath = new vscode.ThemeIcon("pulse");
    item.tooltip = "Predicted Core Web Vitals based on detected issues";
    return item;
  }
}

class VitalRowNode {
  constructor(
    readonly name: string,
    private readonly value: number,
    private readonly rating: string,
    private readonly good: number,
    private readonly poor: number,
  ) {}

  treeItem(): vscode.TreeItem {
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
  readonly children: IssueNode[];

  constructor(
    readonly category: Category,
    private readonly openIssueCommand: string,
    children: Issue[],
  ) {
    this.children = children.map((issue) => new IssueNode(issue, this.openIssueCommand));
  }

  get issueCount(): number {
    return this.children.length;
  }

  treeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(
      CATEGORY_LABEL[this.category],
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    item.description = `${this.issueCount} issue(s)`;
    item.iconPath = new vscode.ThemeIcon(CATEGORY_ICON[this.category]);
    return item;
  }
}

class IssueNode {
  constructor(
    readonly issue: Issue,
    private readonly openIssueCommand: string,
  ) {}

  treeItem(): vscode.TreeItem {
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
