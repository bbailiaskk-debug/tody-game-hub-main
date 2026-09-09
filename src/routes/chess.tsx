import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LogIn, RotateCcw, Share2, UserPlus, Users } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { useSiteSettings } from "../components/site/theme";
import {
  FILES,
  PIECE_GLYPH,
  PROMOTION_TYPES,
  RANKS,
  allLegalMoves,
  findKing,
  gameStatus,
  initialState,
  isInCheck,
  legalMovesForSquare,
  makeMoveSimple,
  type Board,
  type Color,
  type GameState,
  type GameStatus,
  type PieceType,
  type Square,
} from "../lib/chess-engine";
import { useChessOnline } from "../lib/chess-multiplayer";

export const Route = createFileRoute("/chess")({
  head: () => ({
    meta: [
      { title: "Шах — Todor Khristov Gaming" },
      {
        name: "description",
        content: "Play Chess — classic two-player board game, local or online multiplayer.",
      },
    ],
  }),
  component: ChessPage,
});

type BoardProps = {
  board: Board;
  selected: Square | null;
  legalTargets: Square[];
  lastMove: { from: Square; to: Square } | null;
  kingInCheck: Square | null;
  readonly?: boolean;
  onSquareClick: (r: number, c: number) => void;
};

function ChessBoard({
  board,
  selected,
  legalTargets,
  lastMove,
  kingInCheck,
  readonly = false,
  onSquareClick,
}: BoardProps) {
  return (
    <div className="grid grid-cols-8 overflow-hidden rounded-2xl border border-border/50 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      {board.map((row, r) =>
        row.map((piece, c) => {
          const isLight = (r + c) % 2 === 0;
          const key = `${r}-${c}`;
          const isTarget = legalTargets.some(([tr, tc]) => tr === r && tc === c);
          const isCapture = isTarget && !!piece;
          const isLast =
            (lastMove &&
              ((lastMove.from[0] === r && lastMove.from[1] === c) ||
                (lastMove.to[0] === r && lastMove.to[1] === c))) ||
            false;
          const isSel = selected?.[0] === r && selected?.[1] === c;
          const isCheck = kingInCheck?.[0] === r && kingInCheck?.[1] === c;
          const showFile = r === 7;
          const showRank = c === 0;

          return (
            <button
              key={key}
              type="button"
              disabled={readonly}
              onClick={() => onSquareClick(r, c)}
              className={`relative flex aspect-square items-center justify-center ${
                isLight ? "bg-[#c9d1c0]" : "bg-[#6f8268]"
              } transition-colors`}
              aria-label={`${FILES[c] ?? ""}${RANKS[r] ?? ""}`}
            >
              {isLast && <span className="absolute inset-0 bg-yellow-400/25" />}
              {isSel && <span className="absolute inset-0 bg-brand/30 shadow-[inset_0_0_0_2px_var(--brand)]" />}
              {isCheck && <span className="absolute inset-0 bg-red-500/40 shadow-[inset_0_0_0_2px_#ef4444]" />}
              {isTarget && !isCapture && (
                <span className="absolute size-[clamp(0.7rem,3vw,1.1rem)] rounded-full bg-brand/80 shadow-[0_0_10px_rgba(29,185,84,0.6)]" />
              )}
              {isTarget && isCapture && (
                <span className="absolute inset-0 border-[3px] border-brand/80" />
              )}
              {piece && (
                <span
                  className={`relative z-10 font-mono font-bold leading-none ${
                    piece.color === "w" ? "text-[#f8f3e5]" : "text-[#181d15]"
                  } text-[clamp(1.6rem,6vw,2.9rem)] drop-shadow-[0_2px_2px_rgba(0,0,0,0.45)]`}
                >
                  {PIECE_GLYPH[piece.type]}
                </span>
              )}
              {(showFile || showRank) && (
                <span className="absolute bottom-0.5 flex w-full items-end justify-between px-1 font-mono text-[0.45rem] leading-none text-muted-foreground opacity-70">
                  <span>{showRank ? RANKS[r] : ""}</span>
                  <span>{showFile ? FILES[c] : ""}</span>
                </span>
              )}
            </button>
          );
        }),
      )}
    </div>
  );
}

const BUTTON_CLASS =
  "inline-flex items-center gap-2 rounded-full border border-[#1DB954]/50 bg-[#161B16] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-brand uppercase transition-all duration-200 hover:bg-[#1DB954]/10 hover:shadow-[0_0_18px_rgba(29,185,84,0.25)] active:translate-y-0.5";

function PanelHeader({ statusText, statusTone, right }: { statusText: string; statusTone: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <span className={`inline-flex items-center gap-2 font-mono text-[0.65rem] tracking-[0.18em] uppercase ${statusTone}`}>
        {statusText}
      </span>
      {right}
    </div>
  );
}

type PromotionPickerProps = {
  isBg: boolean;
  isZh: boolean;
  onSelect: (type: PieceType) => void;
};

function PromotionPicker({ isBg, isZh, onSelect }: PromotionPickerProps) {
  return (
    <>
      <span className="font-mono text-lg font-bold tracking-[0.2em] text-foreground">
        {isBg ? "ПРОМОЦИЯ" : isZh ? "升变" : "PROMOTION"}
      </span>
      <span className="px-4 text-center font-mono text-xs tracking-[0.15em] text-muted-foreground uppercase">
        {isBg ? "Избери фигура" : isZh ? "选择棋子" : "Choose an upgrade"}
      </span>
      <div className="mt-2 flex gap-3">
        {PROMOTION_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            aria-label={type}
            className="grid size-14 place-items-center rounded-2xl border border-[#1DB954]/50 bg-[#161B16] font-mono text-3xl text-foreground transition-all duration-200 hover:bg-[#1DB954]/10 hover:shadow-[0_0_18px_rgba(29,185,84,0.25)] active:translate-y-0.5"
          >
            {PIECE_GLYPH[type]}
          </button>
        ))}
      </div>
    </>
  );
}

function statusTextFor(isBg: boolean, isZh: boolean, status: GameStatus, turn: Color): string {
  if (isZh) {
    if (status === "checkmate") return `将死！${turn === "w" ? "黑棋" : "白棋"}获胜`;
    if (status === "stalemate") return "逼和 — 平局";
    if (status === "check") return `将军！轮到${turn === "w" ? "白棋" : "黑棋"}`;
    return `轮到${turn === "w" ? "白棋" : "黑棋"}`;
  }
  if (isBg) {
    if (status === "checkmate") return `МАТ! ${turn === "w" ? "Черните" : "Белите"} печелят`;
    if (status === "stalemate") return "ПАТ — равенство";
    if (status === "check") return `ШАХ! Ход на ${turn === "w" ? "белите" : "черните"}`;
    return `Ход на ${turn === "w" ? "белите" : "черните"}`;
  }
  if (status === "checkmate") return `CHECKMATE! ${turn === "w" ? "Black" : "White"} wins`;
  if (status === "stalemate") return "STALEMATE — draw";
  if (status === "check") return `CHECK! ${turn === "w" ? "White" : "Black"} to move`;
  return `${turn === "w" ? "White" : "Black"} to move`;
}

function LocalChessGame() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";

  const [state, setState] = useState<GameState>(initialState);
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [moveCount, setMoveCount] = useState(0);

  const legalMoves = useMemo(
    () => (selected ? legalMovesForSquare(state, selected[0], selected[1]) : []),
    [state, selected],
  );

  const status = useMemo(() => gameStatus(state), [state]);
  const gameOver = status === "checkmate" || status === "stalemate";

  const kingInCheck = useMemo(() => {
    const inCheck = isInCheck(state.board, state.turn);
    if (!inCheck) return null;
    const [kr, kc] = findKing(state.board, state.turn);
    return kr >= 0 ? ([kr, kc] as Square) : null;
  }, [state]);

  const handleSquareClick = useCallback(
    (r: number, c: number) => {
      if (pendingPromotion || gameOver) return;
      const piece = state.board[r]?.[c];

      if (selected) {
        if (r === selected[0] && c === selected[1]) {
          setSelected(null);
          return;
        }
        const isLegal = legalMoves.some(([tr, tc]) => tr === r && tc === c);
        if (isLegal) {
          const moving = state.board[selected[0]]?.[selected[1]];
          if (moving && moving.type === "p" && (r === 0 || r === 7)) {
            setPendingPromotion({ from: selected, to: [r, c] });
            return;
          }
          setState((prev) => makeMoveSimple(prev, selected, [r, c], "q"));
          setLastMove({ from: selected, to: [r, c] });
          setSelected(null);
          setMoveCount((m) => m + 1);
          return;
        }
        if (piece && piece.color === state.turn) {
          setSelected([r, c]);
          return;
        }
        setSelected(null);
        return;
      }

      if (piece && piece.color === state.turn) {
        setSelected([r, c]);
      }
    },
    [state, selected, legalMoves, pendingPromotion, gameOver],
  );

  const finishPromotion = useCallback(
    (type: PieceType) => {
      if (!pendingPromotion) return;
      setState((prev) => makeMoveSimple(prev, pendingPromotion.from, pendingPromotion.to, type));
      setLastMove(pendingPromotion);
      setSelected(null);
      setMoveCount((m) => m + 1);
      setPendingPromotion(null);
    },
    [pendingPromotion],
  );

  const resetGame = useCallback(() => {
    setState(initialState());
    setSelected(null);
    setPendingPromotion(null);
    setLastMove(null);
    setMoveCount(0);
  }, []);

  return (
    <>
      <div className="relative mt-8 overflow-hidden rounded-3xl border border-border/60 bg-[#161B16] shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
        <PanelHeader
          statusText={statusTextFor(isBg, isZh, status, state.turn)}
          statusTone={
            status === "check"
              ? "text-[#f87171]"
              : gameOver
                ? "text-brand"
                : "text-muted-foreground"
          }
          right={
            <span className="font-mono text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase">
              {isBg ? "Ходове" : isZh ? "步数" : "MOVES"} — {Math.floor(moveCount / 2)}
            </span>
          }
        />

        <div className="flex flex-col items-center justify-center px-5 pb-5">
          <div className="w-full max-w-[560px]">
            <ChessBoard
              board={state.board}
              selected={selected}
              legalTargets={legalMoves}
              lastMove={lastMove}
              kingInCheck={kingInCheck}
              onSquareClick={handleSquareClick}
            />
          </div>
        </div>

        {(gameOver || pendingPromotion) && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#161B16]/85 backdrop-blur-sm">
            {pendingPromotion ? (
              <PromotionPicker isBg={isBg} isZh={isZh} onSelect={finishPromotion} />
            ) : (
              <>
                <span className="font-mono text-2xl font-bold tracking-[0.2em] text-foreground">
                  {status === "checkmate"
                    ? isBg ? "ШАХ МАТ" : isZh ? "将死" : "CHECKMATE"
                    : isBg ? "РАВЕНСТВО" : isZh ? "平局" : "DRAW"}
                </span>
                <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
                  {statusTextFor(isBg, isZh, status, state.turn)}
                </span>
                <button
                  type="button"
                  onClick={resetGame}
                  className={`${BUTTON_CLASS} mt-2`}
                >
                  <RotateCcw className="size-4" />
                  {isBg ? "ИГРАЙ ОТНОВО" : isZh ? "再来一局" : "PLAY AGAIN"}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-center">
        <button type="button" onClick={resetGame} className={BUTTON_CLASS}>
          <RotateCcw className="size-4" />
          {isBg ? "НОВА ИГРА" : isZh ? "新游戏" : "NEW GAME"}
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[0.62rem] tracking-[0.15em] text-muted-foreground uppercase">
        <span>
          <span className="text-[#f8f3e5]">♔</span> — {isBg ? "Бели" : isZh ? "白棋" : "White"}
        </span>
        <span>
          <span className="text-[#181d15]">♚</span> — {isBg ? "Черни" : isZh ? "黑棋" : "Black"}
        </span>
        <span>
          {isBg ? "Рокада, ан пасан и промоция" : isZh ? "王车易位、吃过路兵与升变" : "Castling, en passant, promotion"}
        </span>
      </div>
    </>
  );
}

function OnlineGameLobby({ online }: { online: ReturnType<typeof useChessOnline> }) {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";
  const [codeInput, setCodeInput] = useState("");

  const loggedIn = Boolean(online.myEmail);

  if (online.phase === "connecting") {
    return (
      <div className="mt-8 flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-3xl border border-border/60 bg-[#161B16] p-8 text-center">
        <span className="font-mono text-sm tracking-[0.2em] text-brand uppercase">
          {isBg ? "Свързване…" : isZh ? "连接中…" : "CONNECTING…"}
        </span>
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <div className="mt-8 flex min-h-[260px] flex-col items-center justify-center gap-4 rounded-3xl border border-border/60 bg-[#161B16] p-8 text-center">
        <span className="font-mono text-sm tracking-[0.2em] text-muted-foreground uppercase">
          {isBg ? "Изисква се акаунт" : isZh ? "需要账号" : "ACCOUNT REQUIRED"}
        </span>
        <Link
          to="/login"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-mono text-xs tracking-[0.15em] text-primary-foreground shadow-glow transition-transform hover:-translate-y-0.5"
        >
          <LogIn className="size-4" />
          {isBg ? "ВХОД" : isZh ? "登录" : "LOGIN"}
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-col items-center justify-center gap-5 rounded-3xl border border-border/60 bg-[#161B16] p-8">
      <span className="font-mono text-sm tracking-[0.2em] text-foreground uppercase">
        {isBg ? "Играй с приятел в реално време" : isZh ? "与朋友实时对战" : "PLAY A FRIEND IN REAL TIME"}
      </span>

      <div className="flex w-full max-w-md flex-col gap-3">
        <input
          type="text"
          value={codeInput}
          onChange={(event) => setCodeInput(event.target.value.toUpperCase())}
          placeholder={isBg ? "Код на играта" : isZh ? "游戏代码" : "GAME CODE"}
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-center font-mono text-lg tracking-[0.3em] text-foreground uppercase outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-[#1DB954]/60"
          onKeyDown={(event) => {
            if (event.key === "Enter" && codeInput.trim().length > 0) {
              void online.joinGame(codeInput);
            }
          }}
        />
        <button
          type="button"
          onClick={() => {
            if (codeInput.trim().length > 0) void online.joinGame(codeInput);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-[#1DB954]/50 bg-[#161B16] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-brand uppercase transition-all duration-200 hover:bg-[#1DB954]/10 hover:shadow-[0_0_18px_rgba(29,185,84,0.25)] active:translate-y-0.5"
          disabled={codeInput.trim().length === 0}
        >
          <UserPlus className="size-4" />
          {isBg ? "ПРИСЪЕДИНИ СЕ" : isZh ? "加入游戏" : "JOIN GAME"}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <span className="h-px w-10 bg-border" />
        <span className="font-mono text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase">
          {isBg ? "или" : isZh ? "或" : "or"}
        </span>
        <span className="h-px w-10 bg-border" />
      </div>

      <button
        type="button"
        onClick={() => void online.createGame()}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-3.5 font-mono text-xs font-bold tracking-[0.2em] text-primary-foreground uppercase shadow-glow transition-transform hover:-translate-y-0.5"
      >
        <Users className="size-4" />
        {isBg ? "СЪЗДАЙ ИГРА" : isZh ? "创建游戏" : "CREATE GAME"}
      </button>

      {online.error && online.error !== "login-required" && (
        <span className="font-mono text-xs tracking-[0.15em] text-red-400 uppercase">{online.error}</span>
      )}
    </div>
  );
}

function OnlineChessGame() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";
  const online = useChessOnline();
  const navigate = useNavigate();

  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);

  const snapshot = online.snapshot;
  const state = snapshot?.state ?? null;
  const myRole = online.myRole;

  const legalMoves = useMemo(
    () => (state && selected ? legalMovesForSquare(state, selected[0], selected[1]) : []),
    [state, selected],
  );

  const kingInCheck = useMemo(() => {
    if (!state) return null;
    const inCheck = isInCheck(state.board, state.turn);
    if (!inCheck) return null;
    const [kr, kc] = findKing(state.board, state.turn);
    return kr >= 0 ? ([kr, kc] as Square) : null;
  }, [state]);

  const myColor: Color | null = myRole === "white" ? "w" : myRole === "black" ? "b" : null;
  const isMyTurn = myColor !== null && state?.turn === myColor;
  const canMove =
    online.phase === "playing" &&
    isMyTurn &&
    !snapshot?.result &&
    myRole !== "spectator";
  const gameOver = online.phase === "finished";

  const handleSquareClick = useCallback(
    (r: number, c: number) => {
      if (!canMove || pendingPromotion || !state) return;
      const piece = state.board[r]?.[c];

      if (selected) {
        if (r === selected[0] && c === selected[1]) {
          setSelected(null);
          return;
        }
        const isLegal = legalMoves.some(([tr, tc]) => tr === r && tc === c);
        if (isLegal) {
          const moving = state.board[selected[0]]?.[selected[1]];
          if (moving && moving.type === "p" && (r === 0 || r === 7)) {
            setPendingPromotion({ from: selected, to: [r, c] });
            return;
          }
          online.sendMove(selected, [r, c], "q");
          setSelected(null);
          return;
        }
        if (piece && piece.color === myColor) {
          setSelected([r, c]);
          return;
        }
        setSelected(null);
        return;
      }

      if (piece && piece.color === myColor) {
        setSelected([r, c]);
      }
    },
    [canMove, pendingPromotion, state, selected, legalMoves, online, myColor],
  );

  const finishPromotion = useCallback(
    (type: PieceType) => {
      if (!pendingPromotion) return;
      online.sendMove(pendingPromotion.from, pendingPromotion.to, type);
      setPendingPromotion(null);
      setSelected(null);
    },
    [online, pendingPromotion],
  );

  if (!snapshot || !state) {
    return <OnlineGameLobby online={online} />;
  }

  const joinedCount = [snapshot.players.white, snapshot.players.black].filter(Boolean).length;

  let headerText: string;
  if (online.phase === "error" && online.error) {
    headerText =
      online.error === "disconnected"
        ? isBg ? "СВЪРЗВАНЕТО ПРЕКЪСНАТО" : isZh ? "连接已断开" : "DISCONNECTED"
        : online.error;
  } else if (gameOver && snapshot.result) {
    headerText =
      snapshot.result === "draw"
        ? isBg ? "РАВЕНСТВО — ПАТ" : isZh ? "平局 — 逼和" : "DRAW — STALEMATE"
        : snapshot.result === "white-wins"
          ? isBg ? "ШАХ МАТ — Белите печелят" : isZh ? "将死 — 白棋获胜" : "CHECKMATE — White wins"
          : isBg ? "ШАХ МАТ — Черните печелят" : isZh ? "将死 — 黑棋获胜" : "CHECKMATE — Black wins";
  } else if (joinedCount < 2) {
    headerText = isZh ? "等待对手…" : isBg ? "Чакаме противник…" : "WAITING FOR OPPONENT…";
  } else if (canMove) {
    headerText = isZh ? "你的回合" : isBg ? "Твой ход" : "YOUR TURN";
  } else {
    headerText = isZh ? "对手回合" : isBg ? "Ход на противника" : "OPPONENT'S TURN";
  }

  const headerTone =
    !gameOver && state.turn && isInCheck(state.board, state.turn)
      ? "text-[#f87171]"
      : gameOver
        ? "text-brand"
        : "text-muted-foreground";

  const shareUrl =
    typeof window !== "undefined" && online.gameId
      ? `${window.location.origin}/chess?game=${online.gameId}`
      : "";

  return (
    <>
      <div className="relative mt-8 overflow-hidden rounded-3xl border border-border/60 bg-[#161B16] shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
        <PanelHeader
          statusText={headerText}
          statusTone={headerTone}
          right={
            <span className="font-mono text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase">
              {isBg ? "Ходове" : isZh ? "步数" : "MOVES"} — {Math.floor(snapshot.moveCount / 2)}
            </span>
          }
        />

        <div className="flex flex-col items-center justify-center gap-4 px-5 pb-5">
          <div className="flex w-full max-w-[560px] items-center justify-between gap-2 rounded-xl border border-border/40 bg-surface/40 px-4 py-2 font-mono text-[0.62rem] tracking-[0.15em] uppercase">
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span className={`size-2 shrink-0 rounded-full ${snapshot.players.white?.online ? "bg-[#4ADE80]" : "bg-muted-foreground/40"}`} />
              <span className={`truncate ${myRole === "white" ? "text-foreground" : ""}`}>
                {snapshot.players.white?.name || (isBg ? "Бели" : isZh ? "白棋" : "White")}
              </span>
            </span>
            <span className="text-brand">VS</span>
            <span className="flex min-w-0 items-center justify-end gap-1.5 text-muted-foreground">
              <span className={`truncate ${myRole === "black" ? "text-foreground" : ""}`}>
                {snapshot.players.black?.name || (isBg ? "Черни" : isZh ? "黑棋" : "Black")}
              </span>
              <span className={`size-2 shrink-0 rounded-full ${snapshot.players.black?.online ? "bg-[#4ADE80]" : "bg-muted-foreground/40"}`} />
            </span>
          </div>

          <div className="w-full max-w-[560px]">
            <ChessBoard
              board={state.board}
              selected={selected}
              legalTargets={legalMoves}
              lastMove={snapshot.lastMove}
              kingInCheck={kingInCheck}
              readonly={!canMove}
              onSquareClick={handleSquareClick}
            />
          </div>
        </div>

        {(gameOver || pendingPromotion) && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#161B16]/85 backdrop-blur-sm">
            {pendingPromotion ? (
              <PromotionPicker isBg={isBg} isZh={isZh} onSelect={finishPromotion} />
            ) : (
              <>
                <span className="font-mono text-2xl font-bold tracking-[0.2em] text-foreground">
                  {isBg ? "ШАХ МАТ" : isZh ? "将死" : "CHECKMATE"}
                </span>
                <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
                  {headerText}
                </span>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => online.requestRematch()}
                    className={BUTTON_CLASS}
                  >
                    <RotateCcw className="size-4" />
                    {online.rematch[myRole === "white" ? "white" : "black"]
                      ? isBg ? "Чакаме противника…" : isZh ? "等待对手…" : "WAITING…"
                      : isBg ? "РЕВАНШ" : isZh ? "再来一局" : "REMATCH"}
                  </button>
                </div>
                <span className="font-mono text-[0.6rem] tracking-[0.15em] text-muted-foreground uppercase">
                  {isBg ? "Код" : isZh ? "代码" : "CODE"} — {online.gameId}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        {online.gameId && (
          <>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(shareUrl).catch(() => undefined);
              }}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-5 py-3 font-mono text-[0.65rem] font-bold tracking-[0.18em] text-muted-foreground uppercase transition-colors hover:text-foreground"
            >
              <Share2 className="size-4" />
              {isBg ? "КОПИРАЙ ЛИНК" : isZh ? "复制链接" : "COPY LINK"}
            </button>
            <span className="rounded-full bg-surface-2 px-4 py-2.5 font-mono text-sm font-bold tracking-[0.3em] text-brand">
              {online.gameId}
            </span>
          </>
        )}
        <button
          type="button"
          onClick={() => {
            online.leaveGame();
            void navigate({ to: "/games" });
          }}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-5 py-3 font-mono text-[0.65rem] font-bold tracking-[0.18em] text-muted-foreground uppercase transition-colors hover:text-foreground"
        >
          {isBg ? "НАПУСНИ" : isZh ? "退出" : "LEAVE"}
        </button>
      </div>
    </>
  );
}

function ChessPage() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";
  const [mode, setMode] = useState<"local" | "online">(() => {
    if (typeof window === "undefined") return "local";
    const params = new URLSearchParams(window.location.search);
    return params.get("mode") === "online" ? "online" : "local";
  });

  return (
    <main className="grid-bg min-h-screen">
      <section className="mx-auto max-w-[1000px] px-6 pb-28 pt-20">
        <div className="flex items-center gap-4">
          <span className="label-mono text-brand">08 /</span>
          <span className="label-mono">{isBg ? "ИГРА" : isZh ? "游戏" : "GAME"}</span>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-brand text-[clamp(2.5rem,7vw,4.5rem)] leading-none">
            {isBg ? "ШАХ" : isZh ? "国际象棋" : "CHESS"}
          </h1>
          <div className="flex items-center gap-2 rounded-full border border-border/60 bg-surface/60 p-1">
            <button
              type="button"
              onClick={() => setMode("local")}
              className={`rounded-full px-5 py-2 font-mono text-[0.65rem] font-bold tracking-[0.18em] uppercase transition-colors ${
                mode === "local" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {isBg ? "ЛОКАЛНО" : isZh ? "本地" : "LOCAL"}
            </button>
            <button
              type="button"
              onClick={() => setMode("online")}
              className={`rounded-full px-5 py-2 font-mono text-[0.65rem] font-bold tracking-[0.18em] uppercase transition-colors ${
                mode === "online" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {isBg ? "ОНЛАЙН" : isZh ? "在线" : "ONLINE"}
            </button>
          </div>
        </div>

        <span className="label-mono mt-2 block text-[0.62rem]">
          {isBg ? "НАСТОЛНА КЛАСИКА / МУЛТИПЛЕЙЪР" : isZh ? "棋盘经典 / 多人对战" : "BOARD CLASSIC / MULTIPLAYER"}
        </span>

        {mode === "local" ? <LocalChessGame /> : <OnlineChessGame />}
      </section>
    </main>
  );
}