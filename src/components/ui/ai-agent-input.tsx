import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  ArrowUp,
  BookOpen,
  Check,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Plus,
  X,
} from "lucide-react";
import styles from "@/components/ui/ai-agent-input-utils/PromptInput.module.css";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const ENHANCED =
  "This is an example prompt — rewritten to be clear and specific: state the goal, add the relevant context and constraints, define the expected output format and tone, and note any assumptions. Ask a clarifying question first if key details are missing.";

async function mockEnhance(prompt: string, signal?: AbortSignal): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 2500));
  if (signal?.aborted) throw new Error("Aborted");
  return ENHANCED;
}

const MODELS = [
  {
    id: "claude-opus-4.8",
    name: "Claude Opus 4.8",
    desc: "Anthropic's most capable model — best for complex, multi-step reasoning.",
    context: "200k context window",
  },
  {
    id: "gpt-5.6",
    name: "GPT-5.6",
    desc: "OpenAI's flagship — strong all-round performance and tool use.",
    context: "400k context window",
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    desc: "Google's long-context model — great for large documents and codebases.",
    context: "1M context window",
  },
] as const;

type ModelId = (typeof MODELS)[number]["id"];
const DEFAULT_MODEL_ID: ModelId = MODELS[0]?.id ?? "gemini-2.5-pro";

const SKILLS = [
  { id: "deep-research", name: "Deep Research" },
  { id: "code-review", name: "Code Review" },
  { id: "web-search", name: "Web Search" },
  { id: "summarize", name: "Summarize" },
] as const;

function ModelIcon({ id }: { id?: string }) {
  if (id?.startsWith("gpt")) {
    return (
      <svg width="12" height="12" viewBox="0 0 320 320" fill="currentColor" aria-hidden="true">
        <path d="m297.06 130.97c7.26-21.79 4.76-45.66-6.85-65.48-17.46-30.4-52.56-46.04-86.84-38.68-15.25-17.18-37.16-26.95-60.13-26.81-35.04-.08-66.13 22.48-76.91 55.82-22.51 4.61-41.94 18.7-53.31 38.67-17.59 30.32-13.58 68.54 9.92 94.54-7.26 21.79-4.76 45.66 6.85 65.48 17.46 30.4 52.56 46.04 86.84 38.68 15.24 17.18 37.16 26.95 60.13 26.8 35.06.09 66.16-22.49 76.94-55.86 22.51-4.61 41.94-18.7 53.31-38.67 17.57-30.32 13.55-68.51-9.94-94.51zm-120.28 168.11c-14.03.02-27.62-4.89-38.39-13.88.49-.26 1.34-.73 1.89-1.07l63.72-36.8c3.26-1.85 5.26-5.32 5.24-9.07v-89.83l26.93 15.55c.29.14.48.42.52.74v74.39c-.04 33.08-26.83 59.9-59.91 59.97zm-128.84-55.03c-7.03-12.14-9.56-26.37-7.15-40.18.47.28 1.3.79 1.89 1.13l63.72 36.8c3.23 1.89 7.23 1.89 10.47 0l77.79-44.92v31.1c.02.32-.13.63-.38.83l-64.41 37.19c-28.69 16.52-65.33 6.7-81.92-21.95zm-16.77-139.09c7-12.16 18.05-21.46 31.21-26.29 0 .55-.03 1.52-.03 2.2v73.61c-.02 3.74 1.98 7.21 5.23 9.06l77.79 44.91-26.93 15.55c-.27.18-.61.21-.91.08l-64.42-37.22c-28.63-16.58-38.45-53.21-21.95-81.89zm221.26 51.49-77.79-44.92 26.93-15.54c.27-.18.61-.21.91-.08l64.42 37.19c28.68 16.57 38.51 53.26 21.94 81.94-7.01 12.14-18.05 21.44-31.2 26.28v-75.81c.03-3.74-1.96-7.2-5.2-9.06zm26.8-40.34c-.47-.29-1.3-.79-1.89-1.13l-63.72-36.8c-3.23-1.89-7.23-1.89-10.47 0l-77.79 44.92v-31.1c-.02-.32.13-.63.38-.83l64.41-37.16c28.69-16.55 65.37-6.7 81.91 22 6.99 12.12 9.52 26.31 7.15 40.1zm-168.51 55.43-26.94-15.55c-.29-.14-.48-.42-.52-.74v-74.39c.02-33.12 26.89-59.96 60.01-59.94 14.01 0 27.57 4.92 38.34 13.88-.49.26-1.33.73-1.89 1.07l-63.72 36.8c-3.26 1.85-5.26 5.31-5.24 9.06l-.04 89.79zm14.63-31.54 34.65-20.01 34.65 20v40.01l-34.65 20-34.65-20z" />
      </svg>
    );
  }

  if (id?.startsWith("claude")) {
    return (
      <svg width="12" height="12" viewBox="0 0 100 100" fill="#d97757" aria-hidden="true">
        <path d="m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z" />
      </svg>
    );
  }

  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M16 8.016A8.522 8.522 0 0 0 8.016 16h-.032A8.521 8.521 0 0 0 0 8.016v-.032A8.521 8.521 0 0 0 7.984 0h.032A8.522 8.522 0 0 0 16 7.984v.032z"
        fill="url(#pi-gemini-grad)"
      />
      <defs>
        <radialGradient
          id="pi-gemini-grad"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="matrix(16.1326 5.4553 -43.70045 129.2322 1.588 6.503)"
        >
          <stop offset=".067" stopColor="#9168C0" />
          <stop offset=".343" stopColor="#5684D1" />
          <stop offset=".672" stopColor="#1BA1E3" />
        </radialGradient>
      </defs>
    </svg>
  );
}

const skillName = (id: string) => SKILLS.find((skill) => skill.id === id)?.name ?? id;

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character] ?? character,
  );

type Phase = "idle" | "enhancing" | "enhanced";
type Attachment = { id: number; name: string; kind: "image" | "file" };

export default function PromptInput({
  onEnhance = mockEnhance,
}: {
  onEnhance?: (prompt: string, signal?: AbortSignal) => Promise<string>;
} = {}) {
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [menuOpen, setMenuOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);
  const [model, setModel] = useState<ModelId>(DEFAULT_MODEL_ID);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [exitingAtt, setExitingAtt] = useState<number[]>([]);
  const [pillMounted, setPillMounted] = useState(false);
  const [pillExiting, setPillExiting] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashKeyboard, setSlashKeyboard] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const preEnhanceHTML = useRef("");
  const pendingHTML = useRef<string | null>(null);
  const flipFrom = useRef<number | null>(null);
  const savedRange = useRef<Range | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const slashOpenRef = useRef(false);
  const slashIndexRef = useRef(0);
  const slashResultsRef = useRef<Array<(typeof SKILLS)[number]>>([]);
  const slashQueryRef = useRef("");
  const slashTokenRef = useRef<{ node: Text; start: number; end: number } | null>(null);
  const ignoreHoverRef = useRef(false);
  const applySlashRef = useRef<(id: string) => void>(() => undefined);
  const handleSlashKeyRef = useRef<
    (event: { key: string; preventDefault: () => void; stopPropagation?: () => void }) => boolean
  >(() => false);
  const slashKeyLock = useRef(false);

  const hasText = value.trim().length > 0;
  const enhancing = phase === "enhancing";
  const sendActive = hasText && !enhancing;
  const showPill = hasText && !enhancing;
  const slashResults = SKILLS.filter((skill) =>
    skill.name.toLowerCase().includes(slashQuery.toLowerCase()),
  );
  slashOpenRef.current = slashOpen;
  slashIndexRef.current = slashIndex;
  slashResultsRef.current = slashResults;

  const focusEnd = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedRange.current = range.cloneRange();
  };

  const syncFromEditor = () => {
    const editor = editorRef.current;
    if (!editor) return;
    setValue(editor.textContent ?? "");
    editor.querySelectorAll<HTMLElement>(`.${styles.skillPill}`).forEach((pill) => {
      let atStart = true;
      for (let node = pill.previousSibling; node; node = node.previousSibling) {
        if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() === "") {
          continue;
        }
        atStart = false;
        break;
      }
      pill.toggleAttribute("data-start", atStart);
    });
  };

  const saveSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (selection && selection.rangeCount && editor && editor.contains(selection.anchorNode)) {
      savedRange.current = selection.getRangeAt(0).cloneRange();
    }
  };

  const closeSlash = () => {
    setSlashOpen(false);
    setSlashQuery("");
    setSlashIndex(0);
    setSlashKeyboard(false);
    slashQueryRef.current = "";
    slashTokenRef.current = null;
    ignoreHoverRef.current = false;
  };

  const buildPill = (id: string) => {
    const name = skillName(id);
    const element = document.createElement("span");
    element.className = styles.skillPill;
    element.setAttribute("contenteditable", "false");
    element.dataset["skill"] = id;
    element.innerHTML =
      '<span class="' +
      styles.skillPillLabel +
      '">/' +
      escapeHtml(name) +
      '</span><button type="button" class="' +
      styles.skillPillX +
      '" data-remove="1" aria-label="Remove ' +
      escapeHtml(name) +
      '"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>';
    return element;
  };

  const insertPillOverRange = (range: Range, id: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    range.deleteContents();
    const pill = buildPill(id);
    range.insertNode(pill);
    const space = document.createTextNode(" ");
    pill.after(space);
    const after = document.createRange();
    after.setStartAfter(space);
    after.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(after);
    editor.focus();
    savedRange.current = after.cloneRange();
    syncFromEditor();
  };

  const addSkillFromMenu = (id: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    let range: Range | null = null;
    if (selection && selection.rangeCount && editor.contains(selection.anchorNode)) {
      range = selection.getRangeAt(0).cloneRange();
    } else if (savedRange.current && editor.contains(savedRange.current.startContainer)) {
      range = savedRange.current.cloneRange();
    }
    if (!range) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    insertPillOverRange(range, id);
    setMenuOpen(false);
  };

  const applySlash = (id: string) => {
    const editor = editorRef.current;
    if (!editor) {
      closeSlash();
      return;
    }
    let range: Range | null = null;
    const token = slashTokenRef.current;
    if (
      token &&
      token.node.isConnected &&
      editor.contains(token.node) &&
      token.end <= (token.node.textContent?.length ?? 0)
    ) {
      range = document.createRange();
      range.setStart(token.node, token.start);
      range.setEnd(token.node, token.end);
    } else {
      const selection = window.getSelection();
      if (selection && selection.rangeCount) {
        const caret = selection.getRangeAt(0);
        range = caret.cloneRange();
        const node = caret.startContainer;
        if (node.nodeType === Node.TEXT_NODE && editor.contains(node)) {
          const before = (node.textContent ?? "").slice(0, caret.startOffset);
          const match = before.match(/\/([^\s/]*)$/);
          if (match) {
            range = document.createRange();
            range.setStart(node, caret.startOffset - match[0].length);
            range.setEnd(node, caret.startOffset);
          }
        }
      }
    }
    if (!range) {
      closeSlash();
      return;
    }
    insertPillOverRange(range, id);
    closeSlash();
  };
  applySlashRef.current = applySlash;

  const detectSlash = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || !selection.rangeCount || !selection.isCollapsed) {
      closeSlash();
      return;
    }
    const range = selection.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE || !editor.contains(node)) {
      closeSlash();
      return;
    }
    const before = (node.textContent ?? "").slice(0, range.startOffset);
    const match = before.match(/(?:^|\s)\/([^\s/]*)$/);
    if (!match) {
      closeSlash();
      return;
    }
    const query = match[1] ?? "";
    const slashStart = before.length - query.length - 1;
    slashTokenRef.current = {
      node: node as Text,
      start: slashStart,
      end: range.startOffset,
    };
    if (query !== slashQueryRef.current) {
      slashQueryRef.current = query;
      setSlashIndex(0);
    }
    setSlashQuery(query);
    setSlashOpen(true);
  };

  const onEditorInput = () => {
    syncFromEditor();
    if (phase === "enhanced") setPhase("idle");
    detectSlash();
  };

  const moveSlash = (delta: number) => {
    const results = slashResultsRef.current;
    if (!results.length) return;
    ignoreHoverRef.current = true;
    setSlashKeyboard(true);
    setSlashIndex((index) => (index + delta + results.length * 10) % results.length);
  };

  const handleSlashKey = (event: {
    key: string;
    preventDefault: () => void;
    stopPropagation?: () => void;
  }) => {
    const results = slashResultsRef.current;
    if (!slashOpenRef.current || !results.length) return false;
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Enter" &&
      event.key !== "Tab" &&
      event.key !== "Escape"
    ) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation?.();
    if (slashKeyLock.current) return true;
    slashKeyLock.current = true;
    queueMicrotask(() => {
      slashKeyLock.current = false;
    });
    if (event.key === "ArrowDown") {
      moveSlash(1);
      return true;
    }
    if (event.key === "ArrowUp") {
      moveSlash(-1);
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      const selected = results[slashIndexRef.current] ?? results[0];
      if (selected) applySlashRef.current(selected.id);
      return true;
    }
    if (event.key === "Escape") {
      closeSlash();
      return true;
    }
    return false;
  };
  handleSlashKeyRef.current = handleSlashKey;

  const onEditorKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (handleSlashKey(event)) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  useEffect(() => {
    if (!slashOpen) return;
    const onKey = (event: KeyboardEvent) => {
      handleSlashKeyRef.current(event);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [slashOpen]);

  useEffect(() => {
    if (!slashOpen || !slashResults.length) return;
    if (slashIndex >= slashResults.length) setSlashIndex(0);
  }, [slashOpen, slashResults.length, slashIndex]);

  const onEditorClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      saveSelection();
      return;
    }
    const remove = target.closest("[data-remove]");
    if (remove) {
      event.preventDefault();
      const pill = remove.closest<HTMLElement>("[data-skill]");
      if (pill) {
        const separator = pill.nextSibling;
        const width = pill.getBoundingClientRect().width;
        pill.style.maxWidth = `${width}px`;
        pill.style.overflow = "hidden";
        pill.style.whiteSpace = "nowrap";
        void pill.offsetWidth;
        pill.style.transition =
          "max-width 180ms cubic-bezier(0.22,1,0.36,1), margin 180ms cubic-bezier(0.22,1,0.36,1), padding 180ms cubic-bezier(0.22,1,0.36,1)";
        pill.setAttribute("data-exit", "");
        pill.style.maxWidth = "0px";
        pill.style.marginLeft = "0px";
        pill.style.marginRight = "0px";
        pill.style.paddingLeft = "0px";
        pill.style.paddingRight = "0px";
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          const separatorText = separator?.textContent ?? "";
          if (separator && separator.nodeType === Node.TEXT_NODE && separatorText.startsWith(" ")) {
            const rest = separatorText.slice(1);
            if (rest) separator.textContent = rest;
            else separator.parentNode?.removeChild(separator);
          }
          pill.remove();
          syncFromEditor();
          editorRef.current?.focus();
        };
        pill.addEventListener("animationend", finish, { once: true });
        setTimeout(finish, 220);
      }
      return;
    }
    saveSelection();
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || !plusRef.current?.contains(target)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      setSkillsOpen(false);
      setHoveredModel(null);
    }
  }, [menuOpen]);

  useIsomorphicLayoutEffect(() => {
    if (enhancing || pendingHTML.current === null) return;
    const editor = editorRef.current;
    if (!editor) return;
    editor.innerHTML = pendingHTML.current;
    pendingHTML.current = null;
    syncFromEditor();
    requestAnimationFrame(focusEnd);

    const frame = frameRef.current;
    const from = flipFrom.current;
    flipFrom.current = null;
    if (!frame || from === null) return;
    const to = frame.offsetHeight;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || from === to) return;
    frame.style.height = `${from}px`;
    frame.style.overflow = "hidden";
    void frame.offsetHeight;
    frame.style.transition = "height 200ms cubic-bezier(0.22, 1, 0.36, 1)";
    frame.style.height = `${to}px`;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      frame.style.transition = "";
      frame.style.height = "";
      frame.style.overflow = "";
      frame.removeEventListener("transitionend", finish);
    };
    frame.addEventListener("transitionend", finish);
    setTimeout(finish, 260);
  }, [phase, enhancing]);

  useEffect(() => {
    if (showPill) {
      setPillMounted(true);
      setPillExiting(false);
      return;
    }
    if (!pillMounted) return;
    if (enhancing) {
      setPillMounted(false);
      setPillExiting(false);
      return;
    }
    setPillExiting(true);
    const timer = setTimeout(() => {
      setPillMounted(false);
      setPillExiting(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [showPill, enhancing, pillMounted]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const runEnhance = async () => {
    if (!hasText || enhancing) return;
    preEnhanceHTML.current = editorRef.current?.innerHTML ?? "";
    setPhase("enhancing");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await onEnhance(value, controller.signal);
      if (controller.signal.aborted) return;
      if (typeof result !== "string") throw new Error("Prompt enhancer returned invalid text");
      pendingHTML.current = escapeHtml(result);
      flipFrom.current = frameRef.current?.offsetHeight ?? null;
      setPhase("enhanced");
    } catch {
      if (controller.signal.aborted) return;
      pendingHTML.current = preEnhanceHTML.current;
      setPhase("idle");
    }
  };

  const revert = () => {
    abortRef.current?.abort();
    pendingHTML.current = preEnhanceHTML.current;
    flipFrom.current = frameRef.current?.offsetHeight ?? null;
    setPhase("idle");
  };

  const send = () => {
    if (!sendActive) return;
    const editor = editorRef.current;
    if (editor) editor.innerHTML = "";
    setValue("");
    setPhase("idle");
    setAttachments([]);
    setExitingAtt([]);
    closeSlash();
    requestAnimationFrame(() => editorRef.current?.focus());
  };

  const removeAttachment = (id: number) => {
    setExitingAtt((exiting) => (exiting.includes(id) ? exiting : [...exiting, id]));
    window.setTimeout(() => {
      setAttachments((current) => current.filter((attachment) => attachment.id !== id));
      setExitingAtt((exiting) => exiting.filter((current) => current !== id));
    }, 200);
  };

  const openPicker = (kind: Attachment["kind"]) => {
    const input = fileRef.current;
    if (!input) return;
    input.accept = kind === "image" ? "image/*" : "";
    input.value = "";
    input.dataset["kind"] = kind;
    input.click();
    setMenuOpen(false);
  };

  return (
    <div className={styles.wrap}>
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          const input = event.currentTarget;
          const files = Array.from(input.files ?? []);
          if (!files.length) return;
          const fallback: Attachment["kind"] = input.dataset["kind"] === "image" ? "image" : "file";
          setAttachments((current) => [
            ...current,
            ...files.map((file) => ({
              id: nextId.current++,
              name: file.name,
              kind: file.type?.startsWith("image/") ? ("image" as const) : fallback,
            })),
          ]);
          input.value = "";
          requestAnimationFrame(() => editorRef.current?.focus());
        }}
      />

      <div ref={frameRef} className={styles.frame} data-enhancing={enhancing || undefined}>
        {attachments.length > 0 && (
          <div className={styles.chips}>
            {attachments.map((attachment) => (
              <span
                key={attachment.id}
                className={styles.chip}
                data-exit={exitingAtt.includes(attachment.id) || undefined}
              >
                <span className={styles.chipIcon}>
                  {attachment.kind === "image" ? <ImageIcon size={13} /> : <Paperclip size={13} />}
                </span>
                <span className={styles.chipName}>{attachment.name}</span>
                <button
                  type="button"
                  className={styles.chipRemove}
                  aria-label={`Remove ${attachment.name}`}
                  onClick={() => removeAttachment(attachment.id)}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className={styles.editorWrap}>
          {enhancing ? (
            <div className={styles.enhancingText} aria-live="polite">
              {value}
            </div>
          ) : (
            <div
              ref={editorRef}
              className={styles.field}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label="Ask AI Agent"
              data-empty={!hasText || undefined}
              data-placeholder="Ask AI Agent"
              onInput={onEditorInput}
              onKeyDown={onEditorKeyDown}
              onKeyUp={saveSelection}
              onMouseUp={saveSelection}
              onBlur={saveSelection}
              onClick={onEditorClick}
            />
          )}

          {slashOpen && !enhancing && (
            <div
              className={styles.slashMenu}
              role="listbox"
              aria-label="Skills"
              data-keyboard={slashKeyboard || undefined}
              onMouseMove={() => {
                ignoreHoverRef.current = false;
                if (slashKeyboard) setSlashKeyboard(false);
              }}
            >
              <div className={styles.slashLabel}>Skills</div>
              {slashResults.length ? (
                slashResults.map((skill, index) => (
                  <button
                    key={skill.id}
                    type="button"
                    role="option"
                    aria-selected={index === slashIndex}
                    className={[styles.menuItem, index === slashIndex && styles.menuItemActive]
                      .filter(Boolean)
                      .join(" ")}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => {
                      if (ignoreHoverRef.current) return;
                      setSlashIndex(index);
                    }}
                    onClick={() => applySlash(skill.id)}
                  >
                    <span className={styles.menuName}>{skill.name}</span>
                  </button>
                ))
              ) : (
                <div className={styles.slashEmpty}>No matching skills</div>
              )}
            </div>
          )}
        </div>

        <div className={styles.row}>
          <div className={styles.plusWrap} ref={plusRef}>
            <button
              type="button"
              className={[styles.iconBtn, styles.plus].join(" ")}
              data-open={menuOpen || undefined}
              aria-label="Add attachment or switch model"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className={styles.plusIcon}>
                <Plus size={14} />
              </span>
            </button>

            {menuOpen && (
              <div className={styles.menu} role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => openPicker("image")}
                >
                  <span className={styles.menuIcon}>
                    <ImageIcon size={14} />
                  </span>
                  <span className={styles.menuName}>Add photos</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => openPicker("file")}
                >
                  <span className={styles.menuIcon}>
                    <Paperclip size={14} />
                  </span>
                  <span className={styles.menuName}>Attach files</span>
                </button>
                <div className={styles.menuDivider} />
                <div
                  className={styles.menuSub}
                  onMouseEnter={() => setSkillsOpen(true)}
                  onMouseLeave={() => setSkillsOpen(false)}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    aria-haspopup="menu"
                    aria-expanded={skillsOpen}
                    onClick={() => setSkillsOpen(true)}
                  >
                    <span className={styles.menuIcon}>
                      <BookOpen size={14} />
                    </span>
                    <span className={styles.menuName}>Skills</span>
                    <span className={styles.menuChevron}>
                      <ChevronRight size={14} />
                    </span>
                  </button>
                  {skillsOpen && (
                    <div className={styles.menuFlyout} role="menu">
                      {SKILLS.map((skill) => (
                        <button
                          key={skill.id}
                          type="button"
                          role="menuitem"
                          className={styles.menuItem}
                          onClick={() => addSkillFromMenu(skill.id)}
                        >
                          <span className={styles.menuName}>{skill.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className={styles.menuDivider} />
                <div className={styles.menuLabel}>Model</div>
                {MODELS.map((item) => (
                  <div
                    key={item.id}
                    className={styles.menuSub}
                    onMouseEnter={() => setHoveredModel(item.id)}
                    onMouseLeave={() => setHoveredModel(null)}
                  >
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={model === item.id}
                      className={styles.menuItem}
                      onClick={() => {
                        setModel(item.id);
                        setMenuOpen(false);
                      }}
                    >
                      <span className={styles.menuBrand}>
                        <ModelIcon id={item.id} />
                      </span>
                      <span className={styles.menuName}>{item.name}</span>
                      {model === item.id && (
                        <span className={styles.menuCheck}>
                          <Check size={14} />
                        </span>
                      )}
                    </button>
                    {hoveredModel === item.id && (
                      <div className={styles.menuPopover} role="tooltip">
                        <div className={styles.popoverTitle}>{item.name}</div>
                        <p className={styles.popoverDesc}>{item.desc}</p>
                        <div className={styles.popoverMeta}>{item.context}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.right}>
            {enhancing ? (
              <span
                className={[styles.iconBtn, styles.spinnerBtn].join(" ")}
                aria-label="Enhancing prompt"
              >
                <Loader2 size={14} className={styles.spinner} />
              </span>
            ) : (
              pillMounted && (
                <button
                  type="button"
                  className={[styles.pill, pillExiting && styles.pillExit]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={phase === "enhanced" ? revert : runEnhance}
                >
                  {phase === "enhanced" ? "Revert" : "Enhance Prompt"}
                </button>
              )
            )}
            <button
              type="button"
              className={[styles.iconBtn, styles.send, sendActive && styles.sendActive]
                .filter(Boolean)
                .join(" ")}
              aria-label="Send"
              disabled={!sendActive}
              onClick={send}
            >
              <ArrowUp size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
