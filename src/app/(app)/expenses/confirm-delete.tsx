"use client";

export default function ConfirmDeleteExpense({
  description,
}: {
  description: string;
}) {
  return (
    <button
      type="submit"
      onClick={(event) => {
        if (
          !window.confirm(
            `Delete this expense${description ? ` (${description})` : ""}?`,
          )
        )
          event.preventDefault();
      }}
      className="text-button"
    >
      Delete
    </button>
  );
}
