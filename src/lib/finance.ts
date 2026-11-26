import { Prisma } from "@prisma/client";

export function saleRevenue(
  quantity: string,
  pricePerUnit: string,
): Prisma.Decimal {
  return new Prisma.Decimal(quantity).mul(new Prisma.Decimal(pricePerUnit));
}

export function canSellQuantity(
  produced: Prisma.Decimal,
  alreadySold: Prisma.Decimal[],
  requested: Prisma.Decimal,
): boolean {
  const sold = alreadySold.reduce(
    (total, value) => total.add(value),
    new Prisma.Decimal(0),
  );
  return requested.gt(0) && requested.lte(produced.sub(sold));
}

export function estimatedProfitLoss(
  revenue: Prisma.Decimal,
  expenses: Prisma.Decimal,
): Prisma.Decimal {
  return revenue.sub(expenses);
}

/** Expense records are stored as costs. Normalize legacy negative values to a
 * positive cost before subtracting so expenses cannot increase profit. */
export function expenseCost(amount: number | Prisma.Decimal): number {
  return Math.abs(Number(amount));
}

export function netProfit(revenue: number, expenses: number): number {
  return revenue - expenses;
}

export function profitStatus(value: number): "profit" | "loss" | "break-even" {
  return value > 0 ? "profit" : value < 0 ? "loss" : "break-even";
}
