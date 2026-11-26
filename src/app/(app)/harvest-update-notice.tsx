"use client";

import { useEffect, useRef } from "react";
import { notifyHarvestUpdate } from "./harvest-refresh";

export default function HarvestUpdateNotice({
  revision,
}: {
  revision?: string;
}) {
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!revision || last.current === revision) return;
    last.current = revision;
    notifyHarvestUpdate();
  }, [revision]);
  return null;
}
