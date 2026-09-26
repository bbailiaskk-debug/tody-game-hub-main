export const PLAN_IDS = ["free", "pro", "enterprise"] as const;

export type PlanId = (typeof PLAN_IDS)[number];

export type PaidPlanId = Exclude<PlanId, "free">;

export const DEFAULT_PLAN: PlanId = "free";

const PLAN_RANK: Record<PlanId, number> = {
  free: 0,
  pro: 1,
  enterprise: 2,
};

export const PLAN_DETAILS: Record<
  PlanId,
  { price: string; name: { bg: string; en: string; zh: string } }
> = {
  free: { price: "0,00 €", name: { bg: "Старт", en: "Starter", zh: "入门" } },
  pro: { price: "50,00 €", name: { bg: "Про", en: "Pro", zh: "专业版" } },
  enterprise: { price: "150,00 €", name: { bg: "Enterprise", en: "Enterprise", zh: "企业版" } },
};

export const GAME_PLAN_REQUIREMENTS = {
  "/chess": "free",
  "/airhockey": "free",
  "/tictactoe": "free",
  "/game2048": "pro",
  "/wordle": "pro",
  "/sudoku": "pro",
  "/ddlc": "pro",
  "/prismheart": "pro",
  "/streamer": "pro",
  "/tetris": "enterprise",
  "/beatbattle": "enterprise",
  "/crystalrealm": "enterprise",
  "/candycrush": "enterprise",
  "/dino": "enterprise",
} as const satisfies Record<string, PlanId>;

export type GatedGamePath = keyof typeof GAME_PLAN_REQUIREMENTS;

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export function normalizePlan(value: unknown): PlanId {
  return isPlanId(value) ? value : DEFAULT_PLAN;
}

export function requiredPlanForGame(gamePath: string): PlanId {
  const knownRequirement = GAME_PLAN_REQUIREMENTS[gamePath as GatedGamePath];
  return knownRequirement ?? DEFAULT_PLAN;
}

export function planCovers(plan: unknown, required: PlanId): boolean {
  return PLAN_RANK[normalizePlan(plan)] >= PLAN_RANK[required];
}

export function isGameLocked(gamePath: string, plan: unknown): boolean {
  return !planCovers(plan, requiredPlanForGame(gamePath));
}

export function paidGamePaths(): string[] {
  return Object.entries(GAME_PLAN_REQUIREMENTS)
    .filter(([, requiredPlan]) => requiredPlan !== DEFAULT_PLAN)
    .map(([gamePath]) => gamePath);
}

export function paidGamesForPlan(plan: PlanId): string[] {
  return Object.entries(GAME_PLAN_REQUIREMENTS)
    .filter(([, requiredPlan]) => requiredPlan !== DEFAULT_PLAN && planCovers(plan, requiredPlan))
    .map(([gamePath]) => gamePath);
}
