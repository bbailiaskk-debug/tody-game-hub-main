export type Color = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type Piece = { type: PieceType; color: Color } | null;
export type Board = Piece[][];
export type Square = [number, number];

export type Castling = { wk: boolean; wq: boolean; bk: boolean; bq: boolean };

export type GameState = {
  board: Board;
  turn: Color;
  castling: Castling;
  enPassant: Square | null;
};

export type GameStatus = "playing" | "check" | "checkmate" | "stalemate";

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
export const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

export const PIECE_GLYPH: Record<PieceType, string> = {
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};

export const PROMOTION_TYPES: PieceType[] = ["q", "r", "b", "n"];

export const opposite = (color: Color): Color => (color === "w" ? "b" : "w");

const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

const SLIDE_DIRS: Square[] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

const KNIGHT_OFFSETS: Square[] = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];

export function initialBoard(): Board {
  const emptyRow = (): Piece[] => Array(8).fill(null);
  const backRank = (color: Color): Piece[] =>
    (["r", "n", "b", "q", "k", "b", "n", "r"] as PieceType[]).map((type) => ({ type, color }));
  return [
    backRank("b"),
    Array.from({ length: 8 }, () => ({ type: "p" as const, color: "b" as const })),
    emptyRow(),
    emptyRow(),
    emptyRow(),
    emptyRow(),
    Array.from({ length: 8 }, () => ({ type: "p" as const, color: "w" as const })),
    backRank("w"),
  ];
}

export function initialState(): GameState {
  return {
    board: initialBoard(),
    turn: "w",
    castling: { wk: true, wq: true, bk: true, bq: true },
    enPassant: null,
  };
}

export function findKing(board: Board, color: Color): Square {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r]![c]!;
      if (p && p.type === "k" && p.color === color) return [r, c];
    }
  }
  return [-1, -1];
}

function pieceAttacks(
  board: Board,
  p: Piece,
  fr: number,
  fc: number,
  tr: number,
  tc: number,
): boolean {
  if (!p) return false;
  const dr = tr - fr;
  const dc = tc - fc;

  switch (p.type) {
    case "p": {
      const dir = p.color === "w" ? -1 : 1;
      return dr === dir && (dc === 1 || dc === -1);
    }
    case "n":
      return Math.abs(dr) * Math.abs(dc) === 2;
    case "k":
      return Math.abs(dr) <= 1 && Math.abs(dc) <= 1 && (dr !== 0 || dc !== 0);
    case "b":
      if (Math.abs(dr) !== Math.abs(dc) || dr === 0) return false;
      return isPathClear(board, fr, fc, tr, tc);
    case "r":
      if (dr !== 0 && dc !== 0) return false;
      if (dr === 0 && dc === 0) return false;
      return isPathClear(board, fr, fc, tr, tc);
    case "q":
      if (dr === 0 && dc === 0) return false;
      if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return false;
      return isPathClear(board, fr, fc, tr, tc);
    default:
      return false;
  }
}

function isPathClear(board: Board, fr: number, fc: number, tr: number, tc: number): boolean {
  const dr = Math.sign(tr - fr);
  const dc = Math.sign(tc - fc);
  let r = fr + dr;
  let c = fc + dc;
  while (r !== tr || c !== tc) {
    if (board[r]![c]) return false;
    r += dr;
    c += dc;
  }
  return true;
}

export function attacksSquare(board: Board, attacker: Color, r: number, c: number): boolean {
  for (let rr = 0; rr < 8; rr++) {
    for (let cc = 0; cc < 8; cc++) {
      const p = board[rr]![cc]!;
      if (p && p.color === attacker && pieceAttacks(board, p, rr, cc, r, c)) return true;
    }
  }
  return false;
}

export function isInCheck(board: Board, color: Color): boolean {
  const [kr, kc] = findKing(board, color);
  if (kr < 0) return false;
  return attacksSquare(board, opposite(color), kr, kc);
}

function pseudoMoves(board: Board, fr: number, fc: number, enPassant: Square | null): Square[] {
  const p = board[fr]![fc]!;
  if (!p) return [];
  const moves: Square[] = [];
  const { type, color } = p;
  const dir = color === "w" ? -1 : 1;

  const canOccupy = (r: number, c: number) => {
    const t = board[r]![c]!;
    return !t || t.color !== color;
  };

  if (type === "p") {
    const oneR = fr + dir;
    if (inBounds(oneR, fc) && !board[oneR]![fc]) {
      moves.push([oneR, fc]);
      const startRank = color === "w" ? 6 : 1;
      if (fr === startRank) {
        const twoR = oneR + dir;
        if (inBounds(twoR, fc) && !board[twoR]![fc]) moves.push([twoR, fc]);
      }
    }
    for (const dc of [-1, 1]) {
      const cr = fr + dir;
      const cc = fc + dc;
      if (!inBounds(cr, cc)) continue;
      const t = board[cr]![cc]!;
      if (t && t.color !== color) moves.push([cr, cc]);
      else if (enPassant && cr === enPassant[0] && cc === enPassant[1]) moves.push([cr, cc]);
    }
  } else if (type === "n") {
    for (const [dr, dc] of KNIGHT_OFFSETS) {
      const nr = fr + dr;
      const nc = fc + dc;
      if (inBounds(nr, nc) && canOccupy(nr, nc)) moves.push([nr, nc]);
    }
  } else if (type === "k") {
    for (const [dr, dc] of SLIDE_DIRS) {
      const nr = fr + dr;
      const nc = fc + dc;
      if (inBounds(nr, nc) && canOccupy(nr, nc)) moves.push([nr, nc]);
    }
  } else {
    for (const [dr, dc] of SLIDE_DIRS) {
      const isDiagonal = dr !== 0 && dc !== 0;
      if (type === "b" && !isDiagonal) continue;
      if (type === "r" && isDiagonal) continue;
      let nr = fr + dr;
      let nc = fc + dc;
      while (inBounds(nr, nc)) {
        const t = board[nr]![nc]!;
        if (!t) {
          moves.push([nr, nc]);
        } else {
          if (t.color !== color) moves.push([nr, nc]);
          break;
        }
        nr += dr;
        nc += dc;
      }
    }
  }
  return moves;
}

export function applyMoveCore(
  board: Board,
  from: Square,
  to: Square,
  enPassant: Square | null,
  castling: Castling,
) {
  const [fr, fc] = from;
  const [tr, tc] = to;
  const nb = board.map((row) => [...row]);
  const p = nb[fr]![fc]!;
  nb[fr]![fc] = null;

  let newEnPassant: Square | null = null;
  if (p && p.type === "p" && Math.abs(tr - fr) === 2) {
    newEnPassant = [(tr + fr) / 2, tc];
  }

  if (p && p.type === "p" && enPassant && tr === enPassant[0] && tc === enPassant[1]) {
    nb[fr]![tc] = null;
  }

  nb[tr]![tc] = p;

  const ncast: Castling = { ...castling };
  if (p && p.type === "k") {
    if (p.color === "w") {
      ncast.wk = false;
      ncast.wq = false;
    } else {
      ncast.bk = false;
      ncast.bq = false;
    }
    if (Math.abs(tc - fc) === 2) {
      if (tc === 6) {
        nb[tr]![5] = nb[tr]![7]!;
        nb[tr]![7] = null;
      }
      if (tc === 2) {
        nb[tr]![3] = nb[tr]![0]!;
        nb[tr]![0] = null;
      }
    }
  }

  const disableRookRight = (r: number, c: number, color: Color) => {
    if (r === 7 && c === 0) ncast.wq = false;
    if (r === 7 && c === 7) ncast.wk = false;
    if (r === 0 && c === 0) ncast.bq = false;
    if (r === 0 && c === 7) ncast.bk = false;
  };

  if (p && p.type === "r") disableRookRight(fr, fc, p.color);

  const captured = board[tr]![tc]!;
  if (captured && captured.type === "r") disableRookRight(tr, tc, captured.color);

  return { board: nb, enPassant: newEnPassant, castling: ncast };
}

export function castlingMoves(
  board: Board,
  color: Color,
  castling: Castling,
  enPassant: Square | null,
): Square[] {
  const rank = color === "w" ? 7 : 0;
  const k = board[rank]![4]!;
  if (!k || k.type !== "k" || k.color !== color) return [];
  if (isInCheck(board, color)) return [];
  const enemy = opposite(color);
  const moves: Square[] = [];
  const right =
    color === "w" ? { k: "wk" as const, q: "wq" as const } : { k: "bk" as const, q: "bq" as const };

  if (castling[right.k] && !board[rank]![5] && !board[rank]![6]) {
    if (!attacksSquare(board, enemy, rank, 5) && !attacksSquare(board, enemy, rank, 6)) {
      moves.push([rank, 6]);
    }
  }
  if (castling[right.q] && !board[rank]![1] && !board[rank]![2] && !board[rank]![3]) {
    if (!attacksSquare(board, enemy, rank, 3) && !attacksSquare(board, enemy, rank, 2)) {
      moves.push([rank, 2]);
    }
  }
  return moves;
}

export function legalMovesForSquare(state: GameState, fr: number, fc: number): Square[] {
  const p = state.board[fr]![fc]!;
  if (!p) return [];
  const pseudo = pseudoMoves(state.board, fr, fc, state.enPassant);
  const castling =
    p.type === "k" ? castlingMoves(state.board, p.color, state.castling, state.enPassant) : [];
  const candidates = [...pseudo, ...castling];
  return candidates.filter(([tr, tc]) => {
    const result = applyMoveCore(state.board, [fr, fc], [tr, tc], state.enPassant, state.castling);
    return !isInCheck(result.board, p.color);
  });
}

export function allLegalMoves(state: GameState): { from: Square; to: Square }[] {
  const moves: { from: Square; to: Square }[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r]![c]!;
      if (!p || p.color !== state.turn) continue;
      for (const to of legalMovesForSquare(state, r, c)) {
        moves.push({ from: [r, c], to });
      }
    }
  }
  return moves;
}

export function gameStatus(state: GameState, color: Color = state.turn): GameStatus {
  const inCheck = isInCheck(state.board, color);
  let hasMoves = false;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r]![c]!;
      if (p && p.color === color && legalMovesForSquare(state, r, c).length > 0) {
        hasMoves = true;
        break;
      }
    }
    if (hasMoves) break;
  }
  if (!hasMoves) return inCheck ? "checkmate" : "stalemate";
  return inCheck ? "check" : "playing";
}

export function makeMoveSimple(
  state: GameState,
  from: Square,
  to: Square,
  promotion: PieceType = "q",
): GameState {
  const p = state.board[from[0]]![from[1]]!;
  const result = applyMoveCore(state.board, from, to, state.enPassant, state.castling);
  if (p && p.type === "p" && (to[0] === 0 || to[0] === 7)) {
    result.board[to[0]]![to[1]] = { type: promotion, color: p.color };
  }
  return {
    board: result.board,
    turn: opposite(state.turn),
    castling: result.castling,
    enPassant: result.enPassant,
  };
}
