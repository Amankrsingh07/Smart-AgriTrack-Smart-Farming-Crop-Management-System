import HarvestUpdateNotice from "../harvest-update-notice";
import Link from "next/link";
import { protectionText } from "@/i18n/crop-protection";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import {
  addProduction,
  addSale,
  deleteProduction,
  deleteSale,
  updateProduction,
  updateSale,
} from "../../actions";
import ExportButtons from "../export-buttons";
import ConfirmDeleteRecord from "./confirm-delete-record";
import { getLocale, getTranslations } from "next-intl/server";
import { displayLabel } from "@/i18n/display-labels";

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
export default async function Production({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    saved?: string;
    harvestRevision?: string;
    editLot?: string;
    cycle?: string;
  }>;
}) {
  const user = await getUser();
  if (!user) return null;
  const t = await getTranslations("Records");
  const locale = await getLocale();
  const [cycles, productions, total, query] = await Promise.all([
    db.cropCycle.findMany({
      where: { field: { farm: { userId: user.id } } },
      include: { crop: true, field: { include: { farm: true } } },
      orderBy: { sowingDate: "desc" },
    }),
    db.production.findMany({
      where: { cropCycle: { field: { farm: { userId: user.id } } } },
      include: {
        cropCycle: {
          include: { crop: true, field: { include: { farm: true } } },
        },
        lossAssessment: true,
        sales: { orderBy: { saleDate: "asc" } },
      },
      orderBy: { harvestDate: "desc" },
    }),
    db.sale.aggregate({
      where: { cropCycle: { field: { farm: { userId: user.id } } } },
      _sum: { totalRevenue: true },
    }),
    searchParams,
  ]);
  const exportRows = productions.map((record) => ({
    date: record.harvestDate.toLocaleDateString("en-IN"),
    crop: record.cropCycle.crop.name,
    field: record.cropCycle.field.name,
    harvested: `${Number(record.quantity)} ${record.unit}`,
    sold: `${record.sales.reduce((sum, sale) => sum + Number(sale.quantity), 0)} ${record.unit}`,
    revenue: record.sales.reduce(
      (sum, sale) => sum + Number(sale.totalRevenue),
      0,
    ),
  }));
  return (
    <>
      <p className="muted">{t("productionSubtitle")}</p>
      <h1 style={{ marginTop: 0 }}>{t("production")}</h1>
      {query.error && (
        <p role="alert" style={{ color: "#b42318" }}>
          {query.error.replaceAll("+", " ")}
        </p>
      )}
      <HarvestUpdateNotice revision={query.harvestRevision} />
      {query.saved && (
        <p role="status" style={{ color: "var(--green)" }}>
          {query.saved.replaceAll("+", " ")}
        </p>
      )}
      <div
        className="cards"
        style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}
      >
        <div className="panel stat">
          <span className="muted">{t("revenue")}</span>
          <strong>{money.format(Number(total._sum.totalRevenue || 0))}</strong>
        </div>
        <div className="panel stat">
          <span className="muted">{t("harvestRecords")}</span>
          <strong>{productions.length}</strong>
        </div>
      </div>
      <div className="split" style={{ marginTop: 18 }}>
        <form action={addProduction} className="panel">
          <h2 style={{ marginTop: 0 }}>{t("recordHarvest")}</h2>
          {cycles.length ? (
            <>
              <Field label={t("cropCycle")}>
                <select
                  name="cropCycleId"
                  defaultValue={
                    cycles.some((cycle) => cycle.id === query.cycle)
                      ? query.cycle
                      : cycles[0]?.id
                  }
                >
                  {cycles.map((cycle) => (
                    <option key={cycle.id} value={cycle.id}>
                      {cycle.crop.name} · {cycle.field.farm.name}/
                      {cycle.field.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("harvestDate")}>
                <input
                  name="harvestDate"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </Field>
              <div className="production-two-fields">
                <Field label={t("quantity")}>
                  <input
                    name="quantity"
                    type="number"
                    min="0.001"
                    step="0.001"
                    required
                  />
                </Field>
                <Field label={t("unit")}>
                  <select name="unit">
                    <option>kg</option>
                    <option>quintal</option>
                    <option>tonne</option>
                    <option>bag</option>
                    <option>crate</option>
                  </select>
                </Field>
              </div>
              <Field label={t("gradeOptional")}>
                <input name="grade" />
              </Field>
              <Field label={t("notes")}>
                <input name="notes" />
              </Field>
              <button className="btn">{t("saveHarvest")}</button>
            </>
          ) : (
            <p className="muted">{t("needCropCycle")}</p>
          )}
        </form>
        <form action={addSale} className="panel">
          <h2 style={{ marginTop: 0 }}>{t("recordSale")}</h2>
          {productions.some(
            (record) =>
              Number(record.lossAssessment?.marketable ?? record.quantity) -
                record.sales.reduce(
                  (sum, sale) => sum + Number(sale.quantity),
                  0,
                ) >
              0,
          ) ? (
            <>
              <Field label={t("harvestLot")}>
                <select name="productionId">
                  {productions.map((record) => {
                    const sold = record.sales.reduce(
                      (sum, sale) => sum + Number(sale.quantity),
                      0,
                    );
                    const remaining =
                      Number(
                        record.lossAssessment?.marketable ?? record.quantity,
                      ) - sold;
                    return remaining > 0 ? (
                      <option key={record.id} value={record.id}>
                        {displayLabel(record.cropCycle.crop.name, locale)} ·{" "}
                        {remaining} {record.unit} {t("available")}
                      </option>
                    ) : null;
                  })}
                </select>
              </Field>
              <Field label={t("saleDate")}>
                <input
                  name="saleDate"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </Field>
              <Field label={t("quantitySold")}>
                <input
                  name="quantity"
                  type="number"
                  min="0.001"
                  step="0.001"
                  required
                />
              </Field>
              <Field label={t("price")}>
                <input
                  name="pricePerUnit"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                />
              </Field>
              <Field label={t("buyerOptional")}>
                <input name="buyerName" />
              </Field>
              <button className="btn">{t("saveSale")}</button>
            </>
          ) : (
            <p className="muted">{t("needHarvestForSale")}</p>
          )}
        </form>
      </div>
      <section className="panel harvest-table-panel" style={{ marginTop: 18 }}>
        <div className="harvest-table-heading">
          <h2 style={{ marginTop: 0 }}>{t("harvestSales")}</h2>
          <ExportButtons
            title={t("harvestSales")}
            filename="agritrack-harvests-and-sales"
            columns={[
              { key: "date", label: t("harvestDate") },
              { key: "crop", label: t("crop") },
              { key: "field", label: t("field") },
              { key: "harvested", label: t("harvested") },
              { key: "sold", label: t("sold") },
              { key: "revenue", label: t("revenue") },
            ]}
            rows={exportRows}
          />
        </div>
        {productions.length === 0 ? (
          <p className="muted">{t("noHarvests")}</p>
        ) : (
          <div className="harvest-table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("harvestDate")}</th>
                  <th>{t("crop")}</th>
                  <th>{t("field")}</th>
                  <th>{t("harvested")}</th>
                  <th>{t("sold")}</th>
                  <th>{t("revenue")}</th>
                  <th>{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {productions.map((record) => {
                  const sold = record.sales.reduce(
                      (sum, sale) => sum + Number(sale.quantity),
                      0,
                    ),
                    revenue = record.sales.reduce(
                      (sum, sale) => sum + Number(sale.totalRevenue),
                      0,
                    );
                  return (
                    <tr key={record.id}>
                      <td>{record.harvestDate.toLocaleDateString("en-IN")}</td>
                      <td>
                        {displayLabel(record.cropCycle.crop.name, locale)}
                      </td>
                      <td>{record.cropCycle.field.name}</td>
                      <td>
                        {Number(record.quantity)} {record.unit}
                        {record.yieldPerAcre && (
                          <small className="production-yield">
                            {Number(record.yieldPerAcre).toFixed(2)} kg/acre
                          </small>
                        )}
                        {record.storageDetails && (
                          <small className="production-yield">
                            Storage: {record.storageDetails}
                          </small>
                        )}
                      </td>
                      <td>
                        {sold} {record.unit}
                      </td>
                      <td>{money.format(revenue)}</td>
                      <td>
                        <Link
                          href={`/crop-loss?cycle=${encodeURIComponent(record.cropCycleId)}&lot=${encodeURIComponent(record.id)}`}
                        >
                          {protectionText(locale, "Storage inspection")}
                        </Link>
                        <details
                          className="record-actions"
                          open={query.editLot === record.id}
                        >
                          <summary>{t("editDelete")}</summary>
                          <div className="record-edit-stack">
                            <form
                              action={updateProduction}
                              className="record-edit-form"
                            >
                              <strong>{t("editHarvest")}</strong>
                              <input
                                type="hidden"
                                name="id"
                                value={record.id}
                              />
                              <Field label={t("harvestDate")}>
                                <input
                                  name="harvestDate"
                                  type="date"
                                  defaultValue={record.harvestDate
                                    .toISOString()
                                    .slice(0, 10)}
                                  required
                                />
                              </Field>
                              <Field label={`Quantity (${record.unit})`}>
                                <input
                                  name="quantity"
                                  type="number"
                                  min={sold || 0.001}
                                  step="0.001"
                                  defaultValue={record.quantity.toString()}
                                  required
                                />
                              </Field>
                              <Field label="Grade">
                                <input
                                  name="grade"
                                  defaultValue={record.grade ?? ""}
                                />
                              </Field>
                              <Field label="Storage details">
                                <input
                                  name="storageDetails"
                                  maxLength={1000}
                                  defaultValue={record.storageDetails ?? ""}
                                />
                              </Field>
                              <Field label={t("notes")}>
                                <input
                                  name="notes"
                                  defaultValue={record.notes ?? ""}
                                />
                              </Field>
                              <button className="btn">
                                {t("saveHarvest")}
                              </button>
                            </form>
                            <form action={deleteProduction}>
                              <input
                                type="hidden"
                                name="id"
                                value={record.id}
                              />
                              <ConfirmDeleteRecord label={t("harvest")} />
                            </form>
                            {record.sales.map((sale) => (
                              <div className="record-sale-edit" key={sale.id}>
                                <form
                                  action={updateSale}
                                  className="record-edit-form"
                                >
                                  <strong>{t("editSale")}</strong>
                                  <input
                                    type="hidden"
                                    name="id"
                                    value={sale.id}
                                  />
                                  <Field label={t("saleDate")}>
                                    <input
                                      name="saleDate"
                                      type="date"
                                      defaultValue={sale.saleDate
                                        .toISOString()
                                        .slice(0, 10)}
                                      required
                                    />
                                  </Field>
                                  <Field label={`Quantity (${sale.unit})`}>
                                    <input
                                      name="quantity"
                                      type="number"
                                      min="0.001"
                                      step="0.001"
                                      defaultValue={sale.quantity.toString()}
                                      required
                                    />
                                  </Field>
                                  <Field label={t("price")}>
                                    <input
                                      name="pricePerUnit"
                                      type="number"
                                      min="0.01"
                                      step="0.01"
                                      defaultValue={sale.pricePerUnit.toString()}
                                      required
                                    />
                                  </Field>
                                  <Field label={t("buyer")}>
                                    <input
                                      name="buyerName"
                                      defaultValue={sale.buyerName ?? ""}
                                    />
                                  </Field>
                                  <Field label={t("notes")}>
                                    <input
                                      name="notes"
                                      defaultValue={sale.notes ?? ""}
                                    />
                                  </Field>
                                  <button className="btn">
                                    {t("saveSale")}
                                  </button>
                                </form>
                                <form action={deleteSale}>
                                  <input
                                    type="hidden"
                                    name="id"
                                    value={sale.id}
                                  />
                                  <ConfirmDeleteRecord label={t("sale")} />
                                </form>
                              </div>
                            ))}
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
