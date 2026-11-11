type Item = { label: string; value: number };

export default function ReportCharts({ expenses, crops }: { expenses: Item[]; crops: Item[] }) {
  return <div className="split" style={{ marginTop: 18 }}>
    <Chart title="Expenses by category" items={expenses} color="#5c9c68" />
    <Chart title="Recorded revenue by crop" items={crops} color="#c08b43" />
  </div>;
}

function Chart({ title, items, color }: { title: string; items: Item[]; color: string }) {
  const maximum = Math.max(...items.map(item => item.value), 0);
  return <section className="panel"><h2 style={{ marginTop: 0 }}>{title}</h2>{items.length === 0 ? <p className="muted">No data yet.</p> : <div style={{ display: "grid", gap: 12 }}>{items.map(item => <div key={item.label}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}><span>{item.label}</span><strong>{new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(item.value)}</strong></div>
    <div role="img" aria-label={`${item.label}: ${Math.round(maximum ? item.value / maximum * 100 : 0)}% of maximum`} style={{ height: 8, borderRadius: 8, background: "#e9eee8", marginTop: 6 }}><div style={{ width: `${maximum ? Math.max(item.value / maximum * 100, item.value > 0 ? 2 : 0) : 0}%`, height: "100%", borderRadius: 8, background: color }} /></div>
  </div>)}</div>}</section>;
}
