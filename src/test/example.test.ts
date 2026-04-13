import { describe, it, expect } from "vitest";
import { selectBudgetStatuses, type Budget } from "@/store/financeStore";
import type { Transaction } from "@/store/financeStore";

const MONTH = "2026-04";

function makeBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: "b1",
    category: "Food & Dining",
    type: "fixed",
    fixedAmount: 400,
    rolloverBalance: 0,
    alertThreshold: 80,
    ...overrides,
  };
}

function makeTx(amount: number, category = "Food & Dining"): Transaction {
  return {
    id: String(Math.random()),
    type: "expense",
    amount,
    category: category as Transaction["category"],
    date: `${MONTH}-10`,
    note: "",
  };
}

describe("selectBudgetStatuses", () => {
  it("returns ok status when under alert threshold", () => {
    const budget = makeBudget({ fixedAmount: 400, alertThreshold: 80 });
    const tx = [makeTx(100)]; // 25% used
    const [bs] = selectBudgetStatuses([budget], tx, 0, MONTH);
    expect(bs.status).toBe("ok");
    expect(bs.spent).toBe(100);
    expect(bs.remaining).toBe(300);
    expect(bs.percentageUsed).toBeCloseTo(25);
  });

  it("returns warning status when above alertThreshold", () => {
    const budget = makeBudget({ fixedAmount: 400, alertThreshold: 80 });
    const tx = [makeTx(340)]; // 85% used
    const [bs] = selectBudgetStatuses([budget], tx, 0, MONTH);
    expect(bs.status).toBe("warning");
    expect(bs.isInRedZone).toBe(false);
  });

  it("returns danger status when above 90%", () => {
    const budget = makeBudget({ fixedAmount: 400, alertThreshold: 80 });
    const tx = [makeTx(370)]; // 92.5% used
    const [bs] = selectBudgetStatuses([budget], tx, 0, MONTH);
    expect(bs.status).toBe("danger");
    expect(bs.isInRedZone).toBe(true);
  });

  it("returns exceeded status when over limit", () => {
    const budget = makeBudget({ fixedAmount: 400 });
    const tx = [makeTx(450)]; // 112.5% used
    const [bs] = selectBudgetStatuses([budget], tx, 0, MONTH);
    expect(bs.status).toBe("exceeded");
    expect(bs.remaining).toBe(0);
  });

  it("applies rolloverBalance to limitAmount", () => {
    const budget = makeBudget({ fixedAmount: 400, rolloverBalance: 50 });
    const tx = [makeTx(200)];
    const [bs] = selectBudgetStatuses([budget], tx, 0, MONTH);
    expect(bs.limitAmount).toBe(450);
    expect(bs.remaining).toBe(250);
  });

  it("computes percentage-type limit from monthlyIncome", () => {
    const budget = makeBudget({ type: "percentage", percentage: 20, fixedAmount: undefined });
    const tx = [makeTx(200)];
    const monthlyIncome = 1000;
    const [bs] = selectBudgetStatuses([budget], tx, monthlyIncome, MONTH);
    expect(bs.limitAmount).toBe(200); // 20% of 1000
    expect(bs.status).toBe("exceeded");
  });
});

