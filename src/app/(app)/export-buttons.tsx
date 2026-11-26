"use client";
import { useTranslations } from "next-intl";

type Column = { key: string; label: string };
type Row = Record<string, string | number | null | undefined>;

export default function ExportButtons({
  title,
  filename,
  columns,
  rows,
}: {
  title: string;
  filename: string;
  columns: Column[];
  rows: Row[];
}) {
  const t = useTranslations("Records");
  if (!rows.length) return null;
  const safeName =
    filename
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "agritrack-export";
  const value = (row: Row, key: string) =>
    row[key] == null ? "" : String(row[key]);
  const csv = () => {
    const quote = (text: string) => `"${text.replaceAll('"', '""')}"`;
    const content = [
      columns.map((c) => quote(c.label)).join(","),
      ...rows.map((row) =>
        columns
          .map((c) => {
            const text = value(row, c.key);
            return quote(/^[=+\-@]/.test(text) ? `'${text}` : text);
          })
          .join(","),
      ),
    ].join("\r\n");
    download(`\uFEFF${content}`, `${safeName}.csv`, "text/csv;charset=utf-8");
  };
  const excel = () => {
    const cell = (text: string) =>
      `<Cell><Data ss:Type="String">${xml(text)}</Data></Cell>`;
    const sheet = [
      `<Row>${columns.map((c) => cell(c.label)).join("")}</Row>`,
      ...rows.map(
        (row) =>
          `<Row>${columns.map((c) => cell(value(row, c.key))).join("")}</Row>`,
      ),
    ].join("");
    const content = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${xml(title.slice(0, 31))}"><Table>${sheet}</Table></Worksheet></Workbook>`;
    download(
      content,
      `${safeName}.xls`,
      "application/vnd.ms-excel;charset=utf-8",
    );
  };
  const pdf = () => {
    const popup = window.open("", "_blank");
    if (!popup) {
      alert(t("pdfBlocked"));
      return;
    }
    const header = columns.map((c) => `<th>${xml(c.label)}</th>`).join("");
    const body = rows
      .map(
        (row) =>
          `<tr>${columns.map((c) => `<td>${xml(value(row, c.key))}</td>`).join("")}</tr>`,
      )
      .join("");
    popup.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${xml(title)}</title><style>body{font:12px Arial,sans-serif;color:#17251d;padding:24px}h1{font-size:20px}p{color:#607168;font-size:11px}table{border-collapse:collapse;width:100%;margin-top:20px}th,td{border:1px solid #d5ded5;padding:7px;text-align:left;vertical-align:top}th{background:#eef4ed}@media print{body{padding:0}tr{break-inside:avoid}}</style></head><body><h1>${xml(title)}</h1><p>AgriTrack · ${xml(t("exported"))} ${xml(new Date().toLocaleString("en-IN"))}</p><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`,
    );
    popup.document.close();
  };
  return (
    <div className="export-actions" aria-label={`${t("export")} ${title}`}>
      <span>{t("export")}:</span>
      <button type="button" onClick={csv}>
        CSV
      </button>
      <button type="button" onClick={excel}>
        Excel
      </button>
      <button type="button" onClick={pdf}>
        PDF
      </button>
    </div>
  );
}

function xml(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
