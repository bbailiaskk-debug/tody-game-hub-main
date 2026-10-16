import { describe, expect, it } from "vitest";

import {
  DEFAULT_PLAN,
  GAME_PLAN_REQUIREMENTS,
  isGameLocked,
  isPlanId,
  normalizePlan,
  paidGamePaths,
  paidGamesForPlan,
  planCovers,
  requiredPlanForGame,
} from "./plans";

describe("plans", () => {
  it("gates the paid games behind pro and enterprise", () => {
    expect(requiredPlanForGame("/chess")).toBe("free");
    expect(requiredPlanForGame("/airhockey")).toBe("free");
    expect(requiredPlanForGame("/tictactoe")).toBe("free");
    expect(requiredPlanForGame("/game2048")).toBe("pro");
    expect(requiredPlanForGame("/wordle")).toBe("pro");
    expect(requiredPlanForGame("/sudoku")).toBe("pro");
    expect(requiredPlanForGame("/ddlc")).toBe("pro");
    expect(requiredPlanForGame("/prismheart")).toBe("pro");
    expect(requiredPlanForGame("/streamer")).toBe("pro");
    expect(requiredPlanForGame("/tetris")).toBe("enterprise");
    expect(requiredPlanForGame("/beatbattle")).toBe("enterprise");
    expect(requiredPlanForGame("/crystalrealm")).toBe("enterprise");
    expect(requiredPlanForGame("/candycrush")).toBe("enterprise");
    expect(requiredPlanForGame("/dino")).toBe("enterprise");
  });

  it("locks paid games for visitors without a plan", () => {
    for (const gamePath of paidGamePaths()) {
      expect(isGameLocked(gamePath, null)).toBe(true);
      expect(isGameLocked(gamePath, DEFAULT_PLAN)).toBe(true);
    }
  });

  it("lets enterprise unlock every gated game", () => {
    for (const gamePath of paidGamePaths()) {
      expect(isGameLocked(gamePath, "enterprise")).toBe(false);
    }
  });

  it("keeps the enterprise games out of the pro plan", () => {
    expect(isGameLocked("/crystalrealm", "pro")).toBe(true);
    expect(isGameLocked("/dino", "pro")).toBe(true);
    expect(paidGamesForPlan("pro")).toContain("/sudoku");
    expect(paidGamesForPlan("pro")).not.toContain("/crystalrealm");
  });

  it("treats unknown games as free", () => {
    expect(requiredPlanForGame("/chess")).toBe("free");
    expect(isGameLocked("/chess", null)).toBe(false);
  });

  it("normalizes invalid plan values", () => {
    expect(normalizePlan("vip")).toBe(DEFAULT_PLAN);
    expect(normalizePlan(undefined)).toBe(DEFAULT_PLAN);
    expect(isPlanId("enterprise")).toBe(true);
    expect(isPlanId("Enterprise")).toBe(false);
  });

  it("orders plans so higher tiers include lower ones", () => {
    expect(planCovers("enterprise", "pro")).toBe(true);
    expect(planCovers("pro", "enterprise")).toBe(false);
    expect(planCovers("pro", "free")).toBe(true);
  });

  it("exposes exactly the gated game list", () => {
    expect(Object.keys(GAME_PLAN_REQUIREMENTS)).toHaveLength(14);
    expect(paidGamePaths()).toHaveLength(11);
  });
});
