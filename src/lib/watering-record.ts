export type WateringRecordIdentity = {
  irrigationDate: string;
  waterAppliedLiters: number;
  method: string;
  notes?: string | null;
};

/** Canonical fields used to recognize a repeated submission without merging separate applications. */
export function wateringRecordIdentity(record: WateringRecordIdentity) {
  return {
    irrigationDate: record.irrigationDate,
    waterAppliedLiters: record.waterAppliedLiters,
    method: record.method,
    notes: record.notes?.trim() || null,
  };
}

export function isSameWateringTransaction(
  existing: {
    clientTransactionId: string | null;
    userId: string;
    cropCycleId: string;
    scheduledAt: Date;
    actualQuantityLiters: number | null;
    method: string | null;
    notes: string | null;
  },
  request: WateringRecordIdentity & {
    transactionId: string;
    userId: string;
    cropCycleId: string;
  },
) {
  const normalized = wateringRecordIdentity(request);
  return (
    existing.clientTransactionId === request.transactionId &&
    existing.userId === request.userId &&
    existing.cropCycleId === request.cropCycleId &&
    existing.scheduledAt.getTime() ===
      new Date(`${normalized.irrigationDate}T12:00:00.000Z`).getTime() &&
    existing.actualQuantityLiters === normalized.waterAppliedLiters &&
    existing.method === normalized.method &&
    existing.notes === normalized.notes
  );
}
