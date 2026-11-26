import React, { type ReactNode } from "react";
import { farmerAdviceLabels } from "@/i18n/farmer-advice-labels";

export default function FarmerAdviceCard({
  locale,
  problem,
  reason,
  actions,
  warning,
  details,
}: {
  locale: string;
  problem: ReactNode;
  reason: ReactNode;
  actions?: readonly ReactNode[];
  warning?: ReactNode;
  details?: ReactNode;
}) {
  const [problemLabel, reasonLabel, actionsLabel, detailsLabel] =
    farmerAdviceLabels(locale);
  return (
    <div className="farmer-advice-card">
      <h3>{problemLabel}</h3>
      <div>{problem}</div>
      <h3>{reasonLabel}</h3>
      <div>{reason}</div>
      <h3>{actionsLabel}</h3>
      {actions?.length ? (
        <ul>
          {actions.map((action, index) => (
            <li key={index}>{action}</li>
          ))}
        </ul>
      ) : null}
      {warning && <div className="muted">{warning}</div>}
      {details && (
        <details>
          <summary>{detailsLabel}</summary>
          {details}
        </details>
      )}
    </div>
  );
}
