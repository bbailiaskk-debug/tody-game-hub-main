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
exports.lintHtmlLike = lintHtmlLike;
const vscode = __importStar(require("vscode"));
const shared_1 = require("./shared");
function lintHtmlLike(document) {
  if (!document || document.isClosed) return [];
  const text = document.getText();
  const tags = (0, shared_1.scanTags)(text, document);
  if (tags.length === 0) return [];
  return analyzeText(tags, text, document);
}
function analyzeText(tags, text, document) {
  const issues = [];
  const headMatch = /<head[^>]*>/i.exec(text);
  const headCloseMatch = /<\/head\s*>/i.exec(text);
  const headOpen = headMatch ? headMatch.index : -1;
  const headClose = headCloseMatch ? headCloseMatch.index : -1;
  const title = tags.find((tag) => tag.name === "title");
  const hasTitleTag = Boolean(title);
  const titleContent = title ? extractChildrenRaw(document, title) : null;
  if (!hasTitleTag) {
    issues.push({
      category: "seo",
      severity: "error",
      range: firstLine(document),
      message: "Missing <title> tag — the single most important on-page SEO factor.",
      rule: "vl-html-title-missing",
    });
  } else if (titleContent === null || titleContent.trim().length === 0) {
    issues.push({
      category: "seo",
      severity: "error",
      range: title.openRange,
      message: "<title> is empty. Add a descriptive 50–60 character title.",
      rule: "vl-html-title-empty",
    });
  } else {
    const length = titleContent.trim().length;
    if (length > 70) {
      issues.push({
        category: "seo",
        severity: "warning",
        range: title.openRange,
        message: `Title is ${length} chars — consider keeping it at or below 60.`,
        rule: "vl-html-title-long",
      });
    }
  }
  const description = findMeta(tags, "name", "description");
  const descriptionContent = description?.attrs.get("content") ?? "";
  if (!description) {
    issues.push({
      category: "seo",
      severity: "error",
      range: firstLine(document),
      message: "Missing meta description — crucial for search CTR.",
      rule: "vl-html-description-missing",
    });
  } else if (descriptionContent.length < 60) {
    issues.push({
      category: "seo",
      severity: "warning",
      range: description.openRange,
      message: `Meta description is short (${descriptionContent.length} chars). Aim for 120–160.`,
      rule: "vl-html-description-short",
    });
  } else if (descriptionContent.length > 165) {
    issues.push({
      category: "seo",
      severity: "warning",
      range: description.openRange,
      message: `Meta description is long (${descriptionContent.length} chars). It may be truncated in results.`,
      rule: "vl-html-description-long",
    });
  }
  if (!findMeta(tags, "name", "viewport")) {
    issues.push({
      category: "a11y",
      severity: "warning",
      range: firstLine(document),
      message: "Missing viewport meta — hurts mobile-first indexation.",
      rule: "vl-html-viewport-missing",
      vital: "LCP",
      delta: 120,
    });
  }
  const canonical = tags.find((tag) => tag.name === "link" && tag.attrs.get("rel") === "canonical");
  if (!canonical) {
    issues.push({
      category: "seo",
      severity: "warning",
      range: firstLine(document),
      message: "Missing canonical link — duplicate content can dilute rankings.",
      rule: "vl-html-canonical-missing",
    });
  }
  const ogTitle = tags.find(
    (tag) => tag.name === "meta" && tag.attrs.get("property") === "og:title",
  );
  const ogImage = tags.find(
    (tag) => tag.name === "meta" && tag.attrs.get("property") === "og:image",
  );
  if (!ogTitle) {
    issues.push({
      category: "seo",
      severity: "warning",
      range: firstLine(document),
      message: "Missing og:title — social shares will show a raw URL.",
      rule: "vl-html-og-title-missing",
    });
  }
  if (!ogImage) {
    issues.push({
      category: "seo",
      severity: "info",
      range: firstLine(document),
      message: "Missing og:image — links shared on social media will lack a preview.",
      rule: "vl-html-og-image-missing",
    });
  }
  if (headOpen >= 0 || headClose >= 0) {
    for (const tag of tags) {
      if (tag.name === "script" && tag.attrs.has("src")) {
        const inHead = inRange(tag.openRange.start, headOpen, headClose);
        const hasDefer = tag.attrs.has("defer") || tag.attrs.has("async");
        if (inHead && !hasDefer) {
          issues.push({
            category: "perf",
            severity: "warning",
            range: tag.openRange,
            message: "Render-blocking script in <head>. Add defer or async.",
            rule: "vl-head-script-blocking",
            vital: "LCP",
            delta: 260,
            fix: {
              title: "Add defer to script",
              replacement: addAttribute(tag.openRange, document, "defer"),
            },
          });
        }
      }
      if (tag.name === "link" && tag.attrs.get("rel") === "stylesheet") {
        const inHead = inRange(tag.openRange.start, headOpen, headClose);
        const hasMedia = tag.attrs.has("media") || tag.attrs.get("rel")?.includes("preload");
        if (inHead && !hasMedia) {
          issues.push({
            category: "perf",
            severity: "info",
            range: tag.openRange,
            message: "Render-blocking stylesheet. Consider preloading or inlining critical CSS.",
            rule: "vl-head-css-blocking",
            vital: "LCP",
            delta: 90,
          });
        }
      }
    }
  }
  for (const tag of tags) {
    if (tag.name !== "img") continue;
    const alt = tag.attrs.get("alt");
    if (alt === undefined) {
      issues.push({
        category: "a11y",
        severity: "warning",
        range: tag.openRange,
        message: "Image has no alt attribute — required for crawlers and screen readers.",
        rule: "vl-img-alt-missing",
        fix: {
          title: "Add empty alt attribute",
          replacement: addAttribute(tag.openRange, document, 'alt=""'),
        },
      });
    } else if (alt === "") {
      issues.push({
        category: "a11y",
        severity: "info",
        range: tag.openRange,
        message: "Image alt is empty — only valid for decorative images.",
        rule: "vl-img-alt-empty",
      });
    }
    const width = tag.attrs.get("width");
    const height = tag.attrs.get("height");
    if (width === undefined || height === undefined) {
      const hasCssClass = tag.attrs.has("class") || tag.attrs.has("className");
      if (!hasCssClass) {
        issues.push({
          category: "images",
          severity: "warning",
          range: tag.openRange,
          message: "Image has no width/height — the browser cannot reserve space, causing CLS.",
          rule: "vl-img-no-dimensions",
          vital: "CLS",
          delta: 0.03,
        });
      }
    }
  }
  return issues;
}
function findMeta(tags, attrName, attrValue) {
  return tags.find(
    (tag) =>
      tag.name === "meta" && tag.attrs.get(attrName)?.toLowerCase() === attrValue.toLowerCase(),
  );
}
function firstLine(document) {
  return new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
}
function extractChildrenRaw(document, tag) {
  const rest = document.getText().slice(tag.openOffset);
  const openEnd = rest.indexOf(">");
  if (openEnd < 0) return null;
  const after = document.getText().slice(tag.openOffset + openEnd + 1);
  const closeIndex = after.toLowerCase().indexOf("</title");
  if (closeIndex < 0) return after;
  return after.slice(0, closeIndex);
}
function inRange(position, startOffset, endOffset) {
  if (startOffset < 0 || endOffset < 0) return false;
  const start = positionToOffset(position);
  return start > startOffset && start < endOffset;
}
function positionToOffset(position) {
  return position.line * 100000 + position.character;
}
function addAttribute(tagRange, document, attribute) {
  const line = document.lineAt(tagRange.start.line).text;
  const insertAt = line.indexOf(">") >= 0 ? line.indexOf(">") : line.length;
  return line.slice(0, insertAt) + ` ${attribute} ` + line.slice(insertAt);
}
//# sourceMappingURL=html.js.map
