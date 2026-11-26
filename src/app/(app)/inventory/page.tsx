import Link from "next/link";
import { protectionText } from "@/i18n/crop-protection";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { saveInventoryThreshold } from "../../actions";
import { getLocale, getTranslations } from "next-intl/server";
import { displayLabel } from "@/i18n/display-labels";

type InventoryRow = {
  cropName: string;
  unit: string;
  harvested: number;
  sold: number;
  damaged: number;
  discarded: number;
  marketable: number;
  assessedLots: number;
  lots: number;
};

export default async function Inventory({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const user = await getUser();
  if (!user) return null;
  const t = await getTranslations("Records");
  const locale = await getLocale();
  const [productions, thresholds, query] = await Promise.all([
    db.production.findMany({
      where: { cropCycle: { field: { farm: { userId: user.id } } } },
      include: {
        cropCycle: { include: { crop: true } },
        sales: true,
        lossAssessment: true,
      },
      orderBy: { harvestDate: "desc" },
    }),
    db.inventoryThreshold.findMany({ where: { userId: user.id } }),
    searchParams,
  ]);
  const rows = new Map<string, InventoryRow>();
  for (const lot of productions) {
    const cropName = lot.cropCycle.crop.name;
    const key = `${cropName}\u0000${lot.unit}`;
    const row = rows.get(key) ?? {
      cropName,
      unit: lot.unit,
      harvested: 0,
      sold: 0,
      damaged: 0,
      discarded: 0,
      marketable: 0,
      assessedLots: 0,
      lots: 0,
    };
    row.harvested += Number(lot.quantity);
    row.sold += lot.sales.reduce((sum, sale) => sum + Number(sale.quantity), 0);
    const assessment = lot.lossAssessment;
    if (assessment) {
      row.damaged += Number(assessment.damaged);
      row.discarded += Number(assessment.wasted);
      if (
        assessment.quantitiesConfirmed &&
        assessment.unit === lot.unit &&
        assessment.harvestedSnapshot.eq(lot.quantity)
      ) {
        row.marketable += Number(assessment.marketable);
        row.assessedLots += 1;
      }
    }
    row.lots += 1;
    rows.set(key, row);
  }
  const thresholdByKey = new Map(
    thresholds.map((t) => [`${t.cropName}\u0000${t.unit}`, t]),
  );
  const inventory = [...rows.values()].map((row) => ({
    ...row,
    available: Math.max(
      0,
      row.harvested - row.sold - row.damaged - row.discarded,
    ),
    threshold: thresholdByKey.get(`${row.cropName}\u0000${row.unit}`),
  }));
  const lowCount = inventory.filter(
    (row) => row.threshold && row.available <= Number(row.threshold.lowStock),
  ).length;
  const highCount = inventory.filter(
    (row) => row.threshold && row.available > Number(row.threshold.highStock),
  ).length;
  return (
    <>
      <p className="muted">{t("stockSubtitle")}</p>
      <h1 style={{ marginTop: 0 }}>{t("stockTitle")}</h1>
      {query.error && (
        <p role="alert" style={{ color: "#b42318" }}>
          {query.error.replaceAll("+", " ")}
        </p>
      )}
      {query.saved && (
        <p role="status" style={{ color: "var(--green)" }}>
          {query.saved.replaceAll("+", " ")}
        </p>
      )}
      <div
        className="cards"
        style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}
      >
        <div className="panel stat">
          <span className="muted">{t("stockLines")}</span>
          <strong>{inventory.length}</strong>
        </div>
        <div className="panel stat">
          <span className="muted">{t("lowStock")}</span>
          <strong>{lowCount}</strong>
        </div>
        <div className="panel stat">
          <span className="muted">{t("highStock")}</span>
          <strong>{highCount}</strong>
        </div>
      </div>
      <section className="panel" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>{t("currentStock")}</h2>
        {inventory.length > 0 && (
          <Link href="/crop-loss">
            {protectionText(locale, "Harvest loss and prevention")}
          </Link>
        )}
        {inventory.length === 0 ? (
          <p className="muted">{t("harvestForStock")}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t("crop")}</th>
                  <th>{t("harvested")}</th>
                  <th>{t("sold")}</th>
                  <th>{protectionText(locale, "Healthy or marketable")}</th>
                  <th>{protectionText(locale, "Damaged")}</th>
                  <th>{protectionText(locale, "Wasted or discarded")}</th>
                  <th>{protectionText(locale, "Total affected")}</th>
                  <th>{t("available")}</th>
                  <th>{t("stockStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((row) => {
                  const status = !row.threshold
                    ? t("setThresholds")
                    : row.available <= Number(row.threshold.lowStock)
                      ? t("lowStock")
                      : row.available > Number(row.threshold.highStock)
                        ? t("highStock")
                        : t("inRange");
                  return (
                    <tr key={`${row.cropName}-${row.unit}`}>
                      <td>{displayLabel(row.cropName, locale)}</td>
                      <td>
                        {row.harvested.toLocaleString(locale)} {row.unit}{" "}
                        <span className="muted">({row.lots} lots)</span>
                      </td>
                      <td>
                        {row.sold.toLocaleString(locale)} {row.unit}
                      </td>
                      <td>
                        {row.assessedLots === row.lots
                          ? `${row.marketable.toLocaleString(locale)} ${row.unit}`
                          : protectionText(locale, "Unknown")}
                      </td>
                      <td>
                        {row.damaged.toLocaleString(locale)} {row.unit}
                      </td>
                      <td>
                        {row.discarded.toLocaleString(locale)} {row.unit}
                      </td>
                      <td>
                        {(row.damaged + row.discarded).toLocaleString(locale)}{" "}
                        {row.unit}
                      </td>
                      <td>
                        <strong>
                          {row.available.toLocaleString(locale)} {row.unit}
                        </strong>
                      </td>
                      <td>{status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>{t("stockLimits")}</h2>
        <p className="muted">{t("limitsHelp")}</p>
        {inventory.length ? (
          <div style={{ display: "grid", gap: 14 }}>
            {inventory.map((row) => (
              <form
                key={`${row.cropName}-${row.unit}`}
                action={saveInventoryThreshold}
                className="record-edit-form"
              >
                <strong>
                  {displayLabel(row.cropName, locale)} · {row.unit}
                </strong>
                <input type="hidden" name="cropName" value={row.cropName} />
                <input type="hidden" name="unit" value={row.unit} />
                <div className="production-two-fields">
                  <Field label={t("lowLimit", { unit: row.unit })}>
                    <input
                      name="lowStock"
                      type="number"
                      min="0"
                      step="0.001"
                      defaultValue={row.threshold?.lowStock.toString() ?? ""}
                      required
                    />
                  </Field>
                  <Field label={t("highLimit", { unit: row.unit })}>
                    <input
                      name="highStock"
                      type="number"
                      min="0.001"
                      step="0.001"
                      defaultValue={row.threshold?.highStock.toString() ?? ""}
                      required
                    />
                  </Field>
                </div>
                <button className="btn">{t("saveLimits")}</button>
              </form>
            ))}
          </div>
        ) : (
          <p className="muted">{t("needHarvest")}</p>
        )}
      </section>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}
