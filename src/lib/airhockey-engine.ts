export const GAME_W = 840;
export const GAME_H = 480;
export const OX = 26;
export const OY = 26;
export const PLAY_W = GAME_W - OX * 2;
export const PLAY_H = GAME_H - OY * 2;
export const CENTER_X = OX + PLAY_W / 2;
export const CENTER_Y = OY + PLAY_H / 2;
export const PUCK_R = 11;
export const PADDLE_R = 21;
export const GOAL_HALF = 54;
export const WIN_SCORE = 7;
export const PADDLE_SPEED = 470;
export const CPU_SPEED = 360;
export const PUCK_MAX = 700;
export const RESTITUTION = 0.85;
export const FRICTION = 0.9975;

export type Paddle = { x: number; y: number; vx: number; vy: number };
export type Puck = { x: number; y: number; vx: number; vy: number };
export type AhWinner = 1 | 2 | null;

export type AhInput = {
  mx: number | null;
  my: number | null;
  dx: number;
  dy: number;
};

export type AhState = {
  p1: Paddle;
  p2: Paddle;
  puck: Puck;
  serveTimer: number;
  score1: number;
  score2: number;
  winner: AhWinner;
};

export type AhStepEvents = {
  onBounce?: () => void;
  onPaddleHit?: () => void;
  onGoal?: (scored: 1 | 2) => void;
  onWin?: (winner: 1 | 2) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function createAhState(): AhState {
  return {
    p1: { x: OX + PLAY_W * 0.2, y: CENTER_Y, vx: 0, vy: 0 },
    p2: { x: OX + PLAY_W * 0.8, y: CENTER_Y, vx: 0, vy: 0 },
    puck: { x: CENTER_X, y: CENTER_Y, vx: -220, vy: 0 },
    serveTimer: 0.7,
    score1: 0,
    score2: 0,
    winner: null,
  };
}

export function resetAhRound(state: AhState, serveDir: -1 | 1): void {
  state.puck = {
    x: CENTER_X,
    y: CENTER_Y,
    vx: serveDir * (180 + Math.random() * 80),
    vy: (Math.random() - 0.5) * 140,
  };
  state.serveTimer = 0.7;
}

function movePaddleToward(p: Paddle, tx: number, ty: number): void {
  const dx = tx - p.x;
  const dy = ty - p.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) {
    p.vx = 0;
    p.vy = 0;
    return;
  }
  p.vx = (dx / dist) * PADDLE_SPEED;
  p.vy = (dy / dist) * PADDLE_SPEED;
}

export function applyPaddleInput(p: Paddle, input: AhInput, dt: number): void {
  if (input.mx !== null && input.my !== null) {
    movePaddleToward(p, input.mx, input.my);
  } else {
    const dx = clamp(input.dx, -1, 1);
    const dy = clamp(input.dy, -1, 1);
    const norm = Math.hypot(dx, dy) || 1;
    p.vx = (dx / norm) * PADDLE_SPEED;
    p.vy = (dy / norm) * PADDLE_SPEED;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.x = clamp(p.x, OX + PADDLE_R, OX + PLAY_W - PADDLE_R);
  p.y = clamp(p.y, OY + PADDLE_R, OY + PLAY_H - PADDLE_R);
}

function collidePuckPaddle(state: AhState, p: Paddle, events: AhStepEvents): void {
  const puck = state.puck;
  const dx = puck.x - p.x;
  const dy = puck.y - p.y;
  const rsum = PUCK_R + PADDLE_R;
  const dist2 = dx * dx + dy * dy;
  if (dist2 >= rsum * rsum) return;
  const dist = Math.sqrt(dist2) || 1;
  const nx = dx / dist;
  const ny = dy / dist;
  puck.x = p.x + nx * (rsum + 0.5);
  puck.y = p.y + ny * (rsum + 0.5);
  const rn = (puck.vx - p.vx) * nx + (puck.vy - p.vy) * ny;
  if (rn < 0) {
    const j = (-(1 + RESTITUTION) / 2) * rn;
    puck.vx += j * nx;
    puck.vy += j * ny;
  }
  puck.vx += p.vx * 0.4;
  puck.vy += p.vy * 0.4;
  events.onPaddleHit?.();
}

export function stepAirHockey(
  state: AhState,
  dt: number,
  inputs: { a: AhInput; b: AhInput },
  events: AhStepEvents = {},
): void {
  if (state.winner) return;
  if (state.serveTimer > 0) {
    state.serveTimer -= dt;
  }

  applyPaddleInput(state.p1, inputs.a, dt);
  applyPaddleInput(state.p2, inputs.b, dt);

  const puck = state.puck;
  if (state.serveTimer <= 0) {
    puck.vx *= FRICTION;
    puck.vy *= FRICTION;
    puck.x += puck.vx * dt;
    puck.y += puck.vy * dt;

    if (puck.y - PUCK_R < OY) {
      puck.y = OY + PUCK_R;
      puck.vy = Math.abs(puck.vy) * 0.8;
      events.onBounce?.();
    } else if (puck.y + PUCK_R > OY + PLAY_H) {
      puck.y = OY + PLAY_H - PUCK_R;
      puck.vy = -Math.abs(puck.vy) * 0.8;
      events.onBounce?.();
    }

    const inGoalMouth = Math.abs(puck.y - CENTER_Y) <= GOAL_HALF;

    if (puck.x - PUCK_R <= OX) {
      if (inGoalMouth) {
        handleAhGoal(state, 1, events);
      } else {
        puck.x = OX + PUCK_R;
        puck.vx = Math.abs(puck.vx) * 0.8;
        events.onBounce?.();
      }
    } else if (puck.x + PUCK_R >= OX + PLAY_W) {
      if (inGoalMouth) {
        handleAhGoal(state, 2, events);
      } else {
        puck.x = OX + PLAY_W - PUCK_R;
        puck.vx = -Math.abs(puck.vx) * 0.8;
        events.onBounce?.();
      }
    }

    collidePuckPaddle(state, state.p1, events);
    collidePuckPaddle(state, state.p2, events);

    const speed = Math.hypot(puck.vx, puck.vy);
    if (speed > 0.0001 && speed < 55) {
      const k = (55 / speed) * 0.4;
      puck.vx += puck.vx * k;
      puck.vy += puck.vy * k;
    }
    const cap = Math.min(1, PUCK_MAX / (Math.hypot(puck.vx, puck.vy) || 1));
    if (cap < 1) {
      puck.vx *= cap;
      puck.vy *= cap;
    }
  }
}

function handleAhGoal(state: AhState, conceder: 1 | 2, events: AhStepEvents): void {
  if (state.winner) return;
  if (conceder === 1) {
    state.score2 += 1;
    events.onGoal?.(2);
    if (state.score2 >= WIN_SCORE) {
      state.winner = 2;
      events.onWin?.(2);
      return;
    }
  } else {
    state.score1 += 1;
    events.onGoal?.(1);
    if (state.score1 >= WIN_SCORE) {
      state.winner = 1;
      events.onWin?.(1);
      return;
    }
  }
  resetAhRound(state, conceder === 1 ? -1 : 1);
}
