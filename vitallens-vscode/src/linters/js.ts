import * as vscode from "vscode";
import { Issue } from "../core";

export function lintJsTypeScript(document: vscode.TextDocument): Issue[] {
  const text = document.getText();
  const issues: Issue[] = [];

  const syncXhrRe = /new\s+XMLHttpRequest\s*\(/g;
  let match: RegExpExecArray | null;
  syncXhrRe.lastIndex = 0;
  while ((match = syncXhrRe.exec(text)) !== null) {
    const tail = text.slice(match.index, match.index + 400);
    const openCall = /\.open\s*\(\s*["'`][^"'`]+["'`]\s*,\s*[^,)\)]+\s*,\s*(false)\s*\)/i.exec(
      tail,
    );
    const asyncFalse = /\.open\(\s*["'][^"'`]+["']\s*,\s*[^)]*\bfalse\b[^)]*\)/.exec(tail);
    if (openCall || asyncFalse) {
      issues.push({
        category: "perf",
        severity: "warning",
        range: rangeAt(document, match.index),
        message:
          "Synchronous XMLHttpRequest freezes the main thread — degrades TTI/INP. Use async fetch.",
        rule: "vl-js-sync-xhr",
        vital: "INP",
        delta: 120,
      });
    }
  }

  const docWriteRe = /document\.write\s*\(/g;
  docWriteRe.lastIndex = 0;
  while ((match = docWriteRe.exec(text)) !== null) {
    issues.push({
      category: "perf",
      severity: "error",
      range: rangeAt(document, match.index),
      message: "document.write is render-blocking and unreliable. Use DOM APIs instead.",
      rule: "vl-js-doc-write",
      vital: "LCP",
      delta: 380,
    });
  }

  const loopRe = /(?:for|while)\s*\(/g;
  loopRe.lastIndex = 0;
  while ((match = loopRe.exec(text)) !== null) {
    const windowStart = match.index;
    const windowEnd = Math.min(text.length, match.index + 1200);
    const window = text.slice(windowStart, windowEnd);
    const reflow = window.match(
      /\.(?:offsetWidth|offsetHeight|clientWidth|clientHeight|scrollTop|scrollHeight)\b/,
    );
    const write = window.match(/(?:innerHTML\s*=|insertAdjacentHTML\s*\(|style\.\w+\s*=)/);
    if (reflow && write) {
      issues.push({
        category: "perf",
        severity: "warning",
        range: rangeAt(document, match.index),
        message:
          "Loop reads layout then writes DOM — causes layout thrashing. Batch reads before writes.",
        rule: "vl-js-layout-thrash",
        vital: "INP",
        delta: 90,
      });
    }
  }

  return issues;
}

function rangeAt(document: vscode.TextDocument, offset: number): vscode.Range {
  const position = document.positionAt(offset);
  return document.lineAt(position.line).range;
}
