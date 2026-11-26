"use client";

export default function ConfirmDeleteCycle({
  confirmation,
}: {
  confirmation: string;
}) {
  return (
    <button
      type="submit"
      onClick={(event) => {
        if (!window.confirm(confirmation)) event.preventDefault();
      }}
      className="text-button"
    >
      Delete crop cycle
    </button>
  );
}
