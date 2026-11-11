"use client";

export default function ConfirmDeleteRecord({ label }: { label: string }) {
  return <button type="submit" onClick={event => { if (!window.confirm(`Delete this ${label}? This cannot be undone.`)) event.preventDefault(); }} className="record-delete-button">Delete {label}</button>;
}
