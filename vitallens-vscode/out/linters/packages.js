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
exports.lintPackageJson = lintPackageJson;
exports.bundleCodeLenses = bundleCodeLenses;
const vscode = __importStar(require("vscode"));
const KNOWN_SIZES = {
  "react-dom": 42,
  react: 6.5,
  "react-router": 30,
  "react-router-dom": 30,
  "@tanstack/react-router": 95,
  "@tanstack/react-query": 18,
  axios: 31,
  moment: 24,
  lodash: 72,
  "lodash-es": 72,
  jquery: 29,
  three: 160,
  gsap: 45,
  "chart.js": 72,
  recharts: 135,
  d3: 270,
  "d3-array": 12,
  "monaco-editor": 700,
  antd: 95,
  "@mui/material": 145,
  "@material-ui/core": 150,
  bootstrap: 22,
  "framer-motion": 32,
  "styled-components": 42,
  redux: 4,
  zustand: 3,
  "socket.io-client": 30,
  socket: 60,
  express: 60,
  "@emailjs/browser": 9,
  "date-fns": 60,
  "react-day-picker": 60,
  "react-hook-form": 30,
  "react-select": 45,
  "react-icons": 90,
  prismjs: 30,
  dompurify: 30,
  zlib: 8,
};
const SUGGESTIONS = {
  moment: "dayjs (~2 KB) — same API, a fraction of the size",
  axios: "native fetch() — no dependency needed",
  lodash: "lodash-es (tree-shakable) or native ES2022 methods",
  jquery: "vanilla DOM APIs",
  "react-router": "@tanstack/router or React Router v7 (smaller)",
  "styled-components": "CSS Modules / Tailwind CSS vanillar",
  "chart.js": "a tiny SVG-chart lib or hand-rolled sparklines",
  d3: "individual d3-* modules instead of the full bundle",
};
const TTI_PER_KB = 0.45;
function lintPackageJson(document) {
  const text = document.getText();
  const issues = [];
  const deps = collectDependencies(text);
  for (const dep of deps) {
    const lower = dep.name.toLowerCase();
    const size = KNOWN_SIZES[lower];
    if (!size) continue;
    if (size >= 150) {
      issues.push({
        category: "bundles",
        severity: size >= 300 ? "error" : "warning",
        range: dep.range,
        message: `"${dep.name}" is heavy (~${size} KB gzip). ${suggestionFor(lower)}`,
        rule: "vl-pkg-heavy",
        vital: "INP",
        delta: capInp(size * TTI_PER_KB),
      });
    } else if (SUGGESTIONS[lower]) {
      issues.push({
        category: "bundles",
        severity: "warning",
        range: dep.range,
        message: `"${dep.name}" (~${size} KB gzip) can be replaced: ${SUGGESTIONS[lower]}.`,
        rule: "vl-pkg-alternative",
        vital: "INP",
        delta: capInp(size * TTI_PER_KB * 0.7),
      });
    }
  }
  return issues;
}
function bundleCodeLenses(document) {
  const text = document.getText();
  const lenses = [];
  const deps = collectDependencies(text);
  for (const dep of deps) {
    const lower = dep.name.toLowerCase();
    const size = KNOWN_SIZES[lower];
    const suggestion = suggestionFor(lower);
    lenses.push(
      new vscode.CodeLens(dep.range, {
        title: size
          ? `~${size} KB gzip · +${Math.round(size * TTI_PER_KB)}ms TTI${suggestion ? ` · ${suggestion}` : ""}`
          : `unbundled · +${Math.round(sizeUnknownInp(dep.name))}ms TTI`,
        command: "vitallens.openIssue",
        arguments: [document.uri.toString(), dep.range.start.line],
      }),
    );
  }
  return lenses;
}
function suggestionFor(packageName) {
  const suggestion = SUGGESTIONS[packageName];
  return suggestion ? `Try ${suggestion}.` : "";
}
function sizeUnknownInp(name) {
  return (name.length ? 20 : 0) + 40;
}
function capInp(value) {
  return Math.min(Math.round(value), 500);
}
function collectDependencies(text) {
  const sections = findSections(text);
  const deps = [];
  for (const section of sections) {
    filterSection(text, section, deps);
  }
  return deps;
}
const depsSections = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
function findSections(text) {
  const found = [];
  for (const name of depsSections) {
    const re = new RegExp(`"${name}"\\s*:\\s*\\{`, "g");
    let match;
    while ((match = re.exec(text)) !== null) {
      const open = text.indexOf("{", match.index);
      if (open < 0) continue;
      const end = matchingBrace(text, open);
      if (end < 0) continue;
      found.push({ name, open, end });
      re.lastIndex = end;
    }
  }
  return found;
}
function matchingBrace(text, openOffset) {
  let depth = 0;
  let quotes = null;
  let i = openOffset;
  while (i < text.length) {
    const ch = text[i];
    if (quotes) {
      if (ch === "\\") i += 1;
      else if (ch === quotes) quotes = null;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      quotes = ch;
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}
function filterSection(text, section, deps) {
  const sectionText = text.slice(section.open, section.end);
  const re = /"([^"]+)":\s*"([^"]*)"/g;
  let match;
  while ((match = re.exec(sectionText)) !== null) {
    if (match[1] === "$schema" || match[1].startsWith("@types/")) continue;
    const offset = section.open + 1 + match.index;
    deps.push({
      name: match[1],
      range: lineRangeAt(text, offset),
    });
  }
}
function lineRangeAt(text, offset) {
  const upTo = text.slice(0, offset);
  const line = upTo.split("\n").length - 1;
  const lineStart = upTo.lastIndexOf("\n") + 1;
  const lineEnd = text.indexOf("\n", lineStart) >= 0 ? text.indexOf("\n", lineStart) : text.length;
  return new vscode.Range(
    new vscode.Position(line, 0),
    new vscode.Position(line, Math.max(0, lineEnd - lineStart)),
  );
}
//# sourceMappingURL=packages.js.map
