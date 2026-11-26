"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HarvestTrackerEntry } from "@/lib/harvest-tracker";

const event = "agritrack:harvest-updated";
const channelName = "agritrack-harvest";

export function notifyHarvestUpdate(cropCycleId?: string) {
  const detail = { cropCycleId };
  window.dispatchEvent(new CustomEvent(event, { detail }));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(channelName);
    channel.postMessage(detail);
    channel.close();
  }
}

export function useHarvestData() {
  const [crops, setCrops] = useState<HarvestTrackerEntry[] | null>(null);
  const [state, setState] = useState<"loading" | "live" | "offline" | "error">(
    "loading",
  );
  const request = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    request.current?.abort();
    request.current = null;
    if (!navigator.onLine) {
      setState("offline");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => {
      if (controller.signal.aborted) return;
      controller.abort();
      setState(navigator.onLine ? "error" : "offline");
    }, 15_000);
    try {
      const response = await fetch("/api/harvests", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) setCrops(null);
      if (!response.ok) throw new Error("Harvest request failed");
      const data = (await response.json()) as { crops: HarvestTrackerEntry[] };
      if (!Array.isArray(data.crops))
        throw new Error("Invalid harvest response");
      if (controller.signal.aborted) return;
      setCrops(data.crops);
      setState("live");
    } catch {
      if (!controller.signal.aborted)
        setState(navigator.onLine ? "error" : "offline");
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    const sync = () => void refresh();
    const visible = () => {
      if (!document.hidden) sync();
    };
    const timer = window.setInterval(sync, 60_000);
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(channelName)
        : null;
    if (channel) channel.onmessage = sync;
    window.addEventListener(event, sync);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    window.addEventListener("pageshow", sync);
    document.addEventListener("visibilitychange", visible);
    sync();
    return () => {
      request.current?.abort();
      clearInterval(timer);
      channel?.close();
      window.removeEventListener(event, sync);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener("pageshow", sync);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);

  return { crops, state, refresh };
}
