// Live UI Editor: injected Stable IDs for reliable element targeting (dev only)
// This is a Babel plugin used via Vite (@vitejs/plugin-react) or Next.js (next/babel).

import path from 'node:path';

function base64UrlEncode(str) {
	return Buffer.from(String(str), 'utf8')
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/g, '');
}

function resolveTsdSource(node, state) {
	// TanStack (router-plugin) rewrites route files before this plugin runs and
	// records the ORIGINAL source position on each JSX element as a
	// `data-tsd-source` attribute like "/src/routes/index.tsx:136:5". Prefer it
	// over node.loc, which points into the rewritten module (line numbers there
	// don't match the file on disk, breaking the Live UI Editor's apply step).
	if (!node || !node.attributes) return null;
	const attr = node.attributes.find(
		(a) =>
			a &&
			a.type === 'JSXAttribute' &&
			a.name &&
			a.name.name === 'data-tsd-source' &&
			a.value &&
			a.value.type === 'StringLiteral'
	);
	if (!attr) return null;
	const text = attr.value.value;
	const colon = text.lastIndexOf(':');
	if (colon < 0) return null;
	const prevColon = text.lastIndexOf(':', colon - 1);
	if (prevColon < 0) return null;
	const relPath = text.slice(0, prevColon);
	const line = Number(text.slice(prevColon + 1, colon));
	const column = Number(text.slice(colon + 1));
	if (!Number.isFinite(line) || !Number.isFinite(column) || !relPath) return null;
	const absPath = relPath.startsWith('/')
		? path.join(process.cwd(), relPath.slice(1))
		: path.resolve(process.cwd(), relPath);
	return { f: absPath, l: line, c: column };
}

export default function liveUiEditorBabelPlugin(babel) {
	const t = babel.types;
	let counter = 0;
	return {
		name: 'live-ui-editor-data-lui',
		visitor: {
			JSXOpeningElement(path, state) {
				const node = path.node;
				if (!node) return;
				// Skip if already tagged.
				if (node.attributes && node.attributes.some(a => a && a.type === 'JSXAttribute' && a.name && a.name.name === 'data-lui')) return;

				counter += 1;
				const tsd = resolveTsdSource(node, state);
				const file = (state && state.file && state.file.opts && state.file.opts.filename) ? String(state.file.opts.filename) : '';
				const loc = tsd || (node.loc ? { f: file, l: node.loc.start.line, c: node.loc.start.column + 1 } : null);
				if (!loc) return;
				const payload = JSON.stringify(loc);
				const elementId = 'lui:' + base64UrlEncode(payload);
				const attr = t.jsxAttribute(t.jsxIdentifier('data-lui'), t.stringLiteral(elementId));
				node.attributes = [attr, ...(node.attributes || [])];
			}
		}
	};
}
