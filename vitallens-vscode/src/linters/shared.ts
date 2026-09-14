import * as vscode from "vscode";

export interface Tag {
  name: string;
  attrs: Map<string, string>;
  openRange: vscode.Range;
  selfClosing: boolean;
  openOffset: number;
}

const TAG_RE =
  /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[a-zA-Z-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*))?)*)(\/?)\s*>/g;

export function scanTags(text: string, document: vscode.TextDocument): Tag[] {
  const tags: Tag[] = [];
  let match: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((match = TAG_RE.exec(text)) !== null) {
    const openOffset = match.index;
    const rawName = match[1];
    const closing = match[0].startsWith("</");
    if (closing) continue;
    const name = rawName.toLowerCase();
    const attrs = new Map<string, string>();
    const attrText = match[2] ?? "";
    const attrRe = /([a-zA-Z-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g;
    let attrMatch: RegExpExecArray | null;
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

export function lineRange(document: vscode.TextDocument, offset: number): vscode.Range {
  const position = document.positionAt(offset);
  return document.lineAt(position.line).range;
}

export function rangeOfNode(
  document: vscode.TextDocument,
  fromOffset: number,
  toOffset: number,
): vscode.Range {
  return new vscode.Range(document.positionAt(fromOffset), document.positionAt(toOffset));
}

export function contentOfTag(
  document: vscode.TextDocument,
  tag: Tag,
  untilToken: string,
): string | null {
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

export function betweenOffsets(document: vscode.TextDocument, start: number, end: number): string {
  return document.getText().slice(start, end);
}
