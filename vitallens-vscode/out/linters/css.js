"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lintCss = lintCss;
const LAYOUT_PROPS = /\b(width|height|top|right|bottom|left|margin\b|padding|flex-basis)\s*:/gi;
function lintCss(document) {
  const text = document.getText();
  const issues = [];
  const importRe = /@import\s+url\([^)]*\)|@import\s+['"]/g;
  let match;
  importRe.lastIndex = 0;
  while ((match = importRe.exec(text)) !== null) {
    const importStatement = match[0];
    if (/^@import\s+["'](?:tailwindcss|tw-animate-css)["']/i.test(importStatement)) continue;
    issues.push({
      category: "perf",
      severity: "warning",
      range: rangeAt(document, match.index),
      message:
        "CSS @import blocks parallel downloads and delays First Contentful Paint. Prefer <link> tags.",
      rule: "vl-css-import-blocking",
      vital: "LCP",
      delta: 130,
      fix: {
        title: "Replace with a <link> in head",
        replacement: match[0] + '\n/* Prefer: <link rel="stylesheet" href="..."> */',
      },
    });
  }
  const fontFaceRe = /@font-face\s*\{/gi;
  fontFaceRe.lastIndex = 0;
  while ((match = fontFaceRe.exec(text)) !== null) {
    const openBrace = text.indexOf("{", match.index);
    const closeBrace = text.indexOf("}", openBrace);
    if (openBrace < 0 || closeBrace < 0) continue;
    const block = text.slice(openBrace, closeBrace + 1);
    if (!/font-display\s*:\s*swap/i.test(block)) {
      issues.push({
        category: "perf",
        severity: "warning",
        range: rangeAt(document, match.index),
        message: "@font-face missing font-display: swap — text may render invisibly (FOIT).",
        rule: "vl-css-font-display",
        vital: "CLS",
        delta: 0.02,
        fix: {
          title: "Add font-display: swap",
          replacement: block.replace(/\}\s*$/, "  font-display: swap;\n}"),
        },
      });
    }
  }
  const animRe = /@keyframes\s+[A-Za-z0-9_-]+/g;
  animRe.lastIndex = 0;
  while ((match = animRe.exec(text)) !== null) {
    const name = match[0].replace(/@keyframes\s+/, "").trim();
    const names = [...text.matchAll(/animation(?:\s*-\s*name)?\s*:\s*([^;}\n]+)/g)];
    const used = names.some((n) => n[1].trim().split(/\s+/).slice(0, 1)[0] === name);
    if (!used) continue;
    const blockStart = text.indexOf("{", match.index);
    const blockEnd = text.indexOf("}", blockStart);
    if (blockStart < 0 || blockEnd < 0) continue;
    const block = text.slice(blockStart, blockEnd);
    if (LAYOUT_PROPS.test(block)) {
      LAYOUT_PROPS.lastIndex = 0;
      issues.push({
        category: "perf",
        severity: "warning",
        range: rangeAt(document, match.index),
        message: `Keyframes "${name}" animate layout-affecting properties — this triggers reflows and hurts CLS. Animate transform/opacity instead.`,
        rule: "vl-css-anim-layout",
        vital: "CLS",
        delta: 0.04,
      });
    }
  }
  return issues;
}
function rangeAt(document, offset) {
  const position = document.positionAt(offset);
  return document.lineAt(position.line).range;
}
//# sourceMappingURL=css.js.map
