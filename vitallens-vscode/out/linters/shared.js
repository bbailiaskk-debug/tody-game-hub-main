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
exports.scanTags = scanTags;
exports.lineRange = lineRange;
exports.rangeOfNode = rangeOfNode;
exports.contentOfTag = contentOfTag;
exports.betweenOffsets = betweenOffsets;
const vscode = __importStar(require("vscode"));
const TAG_RE =
  /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[a-zA-Z-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*))?)*)(\/?)\s*>/g;
function scanTags(text, document) {
  const tags = [];
  let match;
  TAG_RE.lastIndex = 0;
  while ((match = TAG_RE.exec(text)) !== null) {
    const openOffset = match.index;
    const rawName = match[1];
    const closing = match[0].startsWith("</");
    if (closing) continue;
    const name = rawName.toLowerCase();
    const attrs = new Map();
    const attrText = match[2] ?? "";
    const attrRe = /([a-zA-Z-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g;
    let attrMatch;
    attrRe.lastIndex = 0;
    while ((attrMatch = attrRe.exec(attrText)) !== null) {
      const attrName = attrMatch[1];
      const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";
      attrs.set(attrName.toLowerCase(), attrValue.trim());
    }
    const content = match[0];
    const endOffset = openOffset + content.length;
    tags.push({
      name,
      attrs,
      openRange: new vscode.Range(document.positionAt(openOffset), document.positionAt(endOffset)),
      selfClosing: content.endsWith("/>") || content.endsWith("/ >") || content.endsWith("/\n>"),
      openOffset,
    });
  }
  return tags;
}
function lineRange(document, offset) {
  const position = document.positionAt(offset);
  return document.lineAt(position.line).range;
}
function rangeOfNode(document, fromOffset, toOffset) {
  return new vscode.Range(document.positionAt(fromOffset), document.positionAt(toOffset));
}
function contentOfTag(document, tag, untilToken) {
  const afterOpen = tag.openOffset + (tag.selfClosing ? 0 : 0);
  const rest = document.getText().slice(tag.openOffset);
  const openEnd = rest.indexOf(">");
  if (openEnd < 0) return null;
  const afterOpenTag = tag.openOffset + openEnd + 1;
  const tail = document.getText().slice(afterOpenTag);
  const closeIndex = tail.toLowerCase().indexOf(untilToken);
  if (closeIndex < 0) return null;
  return tail.slice(0, closeIndex);
}
function betweenOffsets(document, start, end) {
  return document.getText().slice(start, end);
}
//# sourceMappingURL=shared.js.map
