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
exports.lintRedirects = lintRedirects;
const vscode = __importStar(require("vscode"));
const KEY_RE = /"(?:source|from|uri)"\s*:\s*"([^"]*)"/g;
const TARGET_RE = /"(?:destination|to|redirect)"\s*:\s*"([^"]*)"/g;
function lintRedirects(document) {
  const text = document.getText();
  const issues = [];
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
function collectRedirects(text) {
  const rules = [];
  const objectRe = /\{/g;
  let match;
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
function extractPair(object, re) {
  re.lastIndex = 0;
  const match = re.exec(object);
  return match ? match[1] : null;
}
function matchingBrace(text, openOffset) {
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
function hopCount(rules, from) {
  const map = new Map(rules.map((rule) => [rule.from, rule.to]));
  let hops = 0;
  let current = from;
  const seen = new Set();
  while (map.has(current) && !seen.has(current) && hops < 10) {
    seen.add(current);
    current = map.get(current) ?? "";
    hops += 1;
  }
  return hops;
}
function detectCycle(rules) {
  const adjacency = new Map();
  for (const rule of rules) {
    if (!adjacency.has(rule.from)) adjacency.set(rule.from, []);
    adjacency.get(rule.from).push({ to: rule.to, offset: rule.offset });
  }
  const visited = new Set();
  const stack = [];
  const stackSet = new Set();
  let foundPath = null;
  const dfs = (node) => {
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
//# sourceMappingURL=redirects.js.map
