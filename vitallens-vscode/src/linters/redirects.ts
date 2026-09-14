import * as vscode from "vscode";
import { Issue } from "../core";

interface RedirectRule {
  from: string;
  to: string;
  offset: number;
}

const KEY_RE = /"(?:source|from|uri)"\s*:\s*"([^"]*)"/g;
const TARGET_RE = /"(?:destination|to|redirect)"\s*:\s*"([^"]*)"/g;

export function lintRedirects(document: vscode.TextDocument): Issue[] {
  const text = document.getText();
  const issues: Issue[] = [];
  const rules = collectRedirects(text);
  if (rules.length === 0) return issues;

  const cycle = detectCycle(rules);
  if (cycle) {
    const lookup = text.indexOf(`"${cycle.fromBegin}"`);
    issues.push({
      category: "redirects",
      severity: "error",
      range: lineRangeAt(text, lookup >= 0 ? lookup : cycle.fromOffset),
      message: `Redirect loop detected: ${cycle.path}. This will infinitely redirect users.`,
      rule: "vl-redirect-loop",
    });
  }

  for (const rule of rules) {
    const depth = hopCount(rules, rule.from);
    if (depth > 1) {
      issues.push({
        category: "redirects",
        severity: "warning",
        range: lineRangeAt(text, rule.offset),
        message: `Long redirect chain: ${rule.from} → ${rule.to} is ${depth} hops deep. Reduce hops to preserve SEO equity.`,
        rule: "vl-redirect-chain",
      });
    }
    if (rule.from.toLowerCase() === rule.to.toLowerCase()) {
      issues.push({
        category: "redirects",
        severity: "error",
        range: lineRangeAt(text, rule.offset),
        message: `Redirect to itself detected: ${rule.from} → ${rule.to}.`,
        rule: "vl-redirect-self",
      });
    }
  }

  return issues;
}

function collectRedirects(text: string): RedirectRule[] {
  const rules: RedirectRule[] = [];
  const objectRe = /\{/g;
  let match: RegExpExecArray | null;
  objectRe.lastIndex = 0;
  while ((match = objectRe.exec(text)) !== null) {
    const open = match.index;
    const end = matchingBrace(text, open);
    if (end < 0) continue;
    const object = text.slice(open, end + 1);
    const keyPath = extractPair(object, KEY_RE);
    const targetPath = extractPair(object, TARGET_RE);
    if (keyPath && targetPath) {
      rules.push({ from: keyPath, to: targetPath, offset: open });
      objectRe.lastIndex = end + 1;
    }
  }
  return rules;
}

function extractPair(object: string, re: RegExp): string | null {
  re.lastIndex = 0;
  const match = re.exec(object);
  return match ? match[1] : null;
}

function matchingBrace(text: string, openOffset: number): number {
  let depth = 0;
  let i = openOffset;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

function hopCount(rules: RedirectRule[], from: string): number {
  const map = new Map(rules.map((rule) => [rule.from, rule.to]));
  let hops = 0;
  let current = from;
  const seen = new Set<string>();
  while (map.has(current) && !seen.has(current) && hops < 10) {
    seen.add(current);
    current = map.get(current) ?? "";
    hops += 1;
  }
  return hops;
}

function detectCycle(
  rules: RedirectRule[],
): { fromBegin: string; fromOffset: number; path: string } | null {
  const adjacency = new Map<string, { to: string; offset: number }[]>();
  for (const rule of rules) {
    if (!adjacency.has(rule.from)) adjacency.set(rule.from, []);
    adjacency.get(rule.from)!.push({ to: rule.to, offset: rule.offset });
  }

  const visited = new Set<string>();
  const stack: string[] = [];
  const stackSet = new Set<string>();
  let foundPath: string | null = null;

  const dfs = (node: string): boolean => {
    if (stackSet.has(node)) {
      const cycleStart = stack.indexOf(node);
      foundPath = [...stack.slice(cycleStart), node].join(" → ");
      return true;
    }
    if (visited.has(node)) return false;
    visited.add(node);
    stack.push(node);
    stackSet.add(node);
    for (const neighbor of adjacency.get(node) ?? []) {
      if (dfs(neighbor.to)) return true;
    }
    stack.pop();
    stackSet.delete(node);
    return false;
  };

  for (const start of adjacency.keys()) {
    stack.length = 0;
    stackSet.clear();
    if (dfs(start) && foundPath) {
      const rule = rules.find((r) => r.from === start);
      return { fromBegin: start, fromOffset: rule ? rule.offset : 0, path: foundPath };
    }
  }
  return null;
}

function lineRangeAt(text: string, offset: number): vscode.Range {
  const upTo = text.slice(0, offset);
  const line = upTo.split("\n").length - 1;
  const lineStart = upTo.lastIndexOf("\n") + 1;
  const lineEnd = text.indexOf("\n", lineStart) >= 0 ? text.indexOf("\n", lineStart) : text.length;
  return new vscode.Range(
    new vscode.Position(line, 0),
    new vscode.Position(line, Math.max(0, lineEnd - lineStart)),
  );
}
