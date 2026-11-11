"use client";

export default function ConfirmDeleteCycle({ cropName }: { cropName: string }) {
  return <button type="submit" onClick={event => {
    if (!window.confirm(`Delete the ${cropName} crop cycle? Its irrigation schedules, harvests, and sales will also be deleted. Linked expenses will remain.`)) event.preventDefault();
  }} className="text-button">Delete crop cycle</button>;
}
