import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { expenseCost, netProfit } from "@/lib/finance";

const categories: Record<string, string> = {
  SEEDS: "Seeds",
  FERTILIZER: "Fertilizer",
  PESTICIDES: "Pesticides",
  LABOR: "Labour",
  IRRIGATION: "Irrigation",
  MACHINERY: "Other",
  TRANSPORTATION: "Other",
  OTHER: "Other",
};
const monthLabel = (date: Date) =>
  date.toLocaleString("en-IN", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });

export async function GET(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user)
      return NextResponse.json(
        { error: "Please sign in to view analytics." },
        { status: 401 },
      );
    const params = request.nextUrl.searchParams;
    const range = params.get("range") || "6m";
    const now = new Date();
    let start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    if (range === "6m")
      start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1),
      );
    if (range === "year")
      start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    if (range === "custom") {
      const from = params.get("from"),
        to = params.get("to");
      if (
        !from ||
        !to ||
        !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(to)
      )
        return NextResponse.json(
          { error: "Choose a valid custom date range." },
          { status: 400 },
        );
      start = new Date(`${from}T00:00:00.000Z`);
      const endCheck = new Date(`${to}T23:59:59.999Z`);
      if (
        Number.isNaN(+start) ||
        Number.isNaN(+endCheck) ||
        start.toISOString().slice(0, 10) !== from ||
        endCheck.toISOString().slice(0, 10) !== to ||
        endCheck < start ||
        endCheck > now
      )
        return NextResponse.json(
          { error: "The date range is invalid or ends in the future." },
          { status: 400 },
        );
    }
    const end =
      range === "custom" ? new Date(`${params.get("to")}T23:59:59.999Z`) : now;
    const [expenseRows, saleRows, productionRows] = await Promise.all([
      db.expense.findMany({
        where: { userId: user.id, date: { gte: start, lte: end } },
        select: { amount: true, category: true, date: true },
      }),
      db.sale.findMany({
        where: {
          cropCycle: { field: { farm: { userId: user.id } } },
          saleDate: { gte: start, lte: end },
        },
        select: { totalRevenue: true, saleDate: true },
      }),
      db.production.findMany({
        where: {
          cropCycle: { field: { farm: { userId: user.id } } },
          harvestDate: { gte: start, lte: end },
        },
        select: {
          quantity: true,
          harvestDate: true,
          cropCycle: { select: { crop: { select: { name: true } } } },
        },
      }),
    ]);
    const months: {
      key: string;
      month: string;
      expenses: number;
      revenue: number;
      profit: number;
    }[] = [];
    const cursor = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
    );
    while (cursor <= end) {
      months.push({
        key: `${cursor.getUTCFullYear()}-${cursor.getUTCMonth()}`,
        month: monthLabel(cursor),
        expenses: 0,
        revenue: 0,
        profit: 0,
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    const monthMap = new Map(months.map((item) => [item.key, item]));
    const expenseMap = new Map<string, number>();
    const cropMap = new Map<string, number>();
    for (const row of expenseRows) {
      const amount = expenseCost(row.amount),
        target = monthMap.get(
          `${row.date.getUTCFullYear()}-${row.date.getUTCMonth()}`,
        );
      if (target) target.expenses += amount;
      const category = categories[row.category] || "Other";
      expenseMap.set(category, (expenseMap.get(category) || 0) + amount);
    }
    for (const row of saleRows) {
      const target = monthMap.get(
        `${row.saleDate.getUTCFullYear()}-${row.saleDate.getUTCMonth()}`,
      );
      if (target) target.revenue += Number(row.totalRevenue);
    }
    for (const row of productionRows) {
      const name = row.cropCycle.crop.name;
      cropMap.set(name, (cropMap.get(name) || 0) + Number(row.quantity));
    }
    for (const month of months)
      month.profit = netProfit(month.revenue, month.expenses);
    return NextResponse.json({
      summary: {
        expenses: months.reduce((sum, month) => sum + month.expenses, 0),
        revenue: months.reduce((sum, month) => sum + month.revenue, 0),
        production: productionRows.length,
      },
      monthly: months,
      categories: [...expenseMap].map(([name, value]) => ({ name, value })),
      crops: [...cropMap].map(([name, value]) => ({ name, value })),
    });
  } catch {
    return NextResponse.json(
      { error: "Analytics could not be loaded. Please try again." },
      { status: 500 },
    );
  }
}
