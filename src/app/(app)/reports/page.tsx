import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import ExportButtons from "../export-buttons";
import Analytics from "../analytics";
import { getTranslations, getLocale } from "next-intl/server";
import { displayLabel } from "@/i18n/display-labels";

export default async function Reports() {
  const user = await getUser();
  if (!user) return null;
  const t = await getTranslations("Records");
  const locale = await getLocale();
  const [expenses, sales, production, farms] = await Promise.all([
    db.expense.findMany({ where: { userId: user.id }, select: { category: true, amount: true, date: true } }),
    db.sale.findMany({ where: { cropCycle: { field: { farm: { userId: user.id } } } }, select: { totalRevenue: true, saleDate: true, cropCycle: { select: { crop: { select: { name: true } } } } } }),
    db.production.findMany({ where: { cropCycle: { field: { farm: { userId: user.id } } } }, select: { quantity: true, unit: true, cropCycle: { select: { crop: { select: { name: true } } } } } }),
    db.farm.findMany({ where: { userId: user.id }, select: { name: true, expenses: { select: { amount: true } } } }),
  ]);
  const totalExpenses = expenses.reduce((sum, row) => sum + Number(row.amount), 0);
  const totalRevenue = sales.reduce((sum, row) => sum + Number(row.totalRevenue), 0);
  const crops = new Map<string, { production: number; revenue: number; unit: string }>();
  for (const row of production) { const name = row.cropCycle.crop.name, value = crops.get(name) || { production: 0, revenue: 0, unit: row.unit }; value.production += Number(row.quantity); value.unit = row.unit; crops.set(name, value); }
  for (const row of sales) { const name = row.cropCycle.crop.name, value = crops.get(name) || { production: 0, revenue: 0, unit: "" }; value.revenue += Number(row.totalRevenue); crops.set(name, value); }
  const exportRows = [
    { section: "Summary", item: "Total expenses", amount: totalExpenses },
    { section: "Summary", item: "Sales revenue", amount: totalRevenue },
    { section: "Summary", item: "Estimated profit / loss", amount: totalRevenue - totalExpenses },
    ...expenses.map(row => ({ section: t("expenseRecords"), item: displayLabel(row.category.toLowerCase().replace(/^./, c => c.toUpperCase()), locale), amount: Number(row.amount), date: row.date.toISOString().slice(0, 10) })),
    ...farms.map(farm => ({ section: "Farm", item: farm.name, amount: farm.expenses.reduce((sum, row) => sum + Number(row.amount), 0) })),
    ...[...crops].map(([crop, row]) => ({ section: t("cropPerformance"), item: displayLabel(crop, locale), amount: row.revenue, production: row.production, unit: row.unit })),
  ];
  return <>
    <p className="muted">{t("summary")}</p>
    <h1 style={{ marginTop: 0 }}>{t("financeReports")}</h1>
    <ExportButtons title={t("financeReports")} filename="agritrack-finance-report" columns={[{ key: "section", label: t("section") }, { key: "item", label: t("item") }, { key: "amount", label: `${t("amount")} / ${t("revenue")} (INR)` }, { key: "production", label: t("productionUnit") }, { key: "unit", label: t("unit") }, { key: "date", label: t("date") }]} rows={exportRows} />
    <p className="muted">{t("financeHelp")}</p>
    <Analytics />
    <div className="split" style={{ marginTop: 20 }}>
      <section className="panel"><h2 style={{ marginTop: 0 }}>{t("farmSummary")}</h2>{farms.length ? farms.map(farm => <div key={farm.name} style={{ padding: "12px 0", borderTop: "1px solid #edf0ec" }}><strong>{farm.name}</strong><p className="muted" style={{ margin: "5px 0" }}>{t("expenses")}: {money(farm.expenses.reduce((sum, row) => sum + Number(row.amount), 0))}</p></div>) : <p className="muted">{t("addFarmsForSummary")}</p>}</section>
      <section className="panel"><h2 style={{ marginTop: 0 }}>{t("cropPerformance")}</h2>{crops.size ? <div style={{ overflowX: "auto" }}><table className="table"><thead><tr><th>{t("crop")}</th><th>{t("productionUnit")}</th><th>{t("revenue")}</th></tr></thead><tbody>{[...crops].map(([name, row]) => <tr key={name}><td>{displayLabel(name, locale)}</td><td>{row.production.toLocaleString(locale)} {row.unit}</td><td>{money(row.revenue)}</td></tr>)}</tbody></table></div> : <p className="muted">{t("recordsAppear")}</p>}</section>
    </div>
  </>;
}
function money(value: number) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value); }
