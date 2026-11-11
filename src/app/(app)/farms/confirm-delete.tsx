"use client";

export default function ConfirmDeleteFarm({ farmName }: { farmName: string }) {
  return <button
    type="submit"
    onClick={(event) => {
      if (!window.confirm(`Delete “${farmName}”? Its fields, crop cycles, expenses, harvests, and sales will also be deleted.`)) event.preventDefault();
    }}
    style={{ border: "1px solid #d9a5a0", background: "#fff", color: "#a1261d", borderRadius: 9, padding: "9px 13px", cursor: "pointer", fontWeight: 650 }}
  >Delete farm</button>;
}
