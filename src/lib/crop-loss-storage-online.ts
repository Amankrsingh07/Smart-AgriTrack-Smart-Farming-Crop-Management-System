import { createHash } from "node:crypto";
import {
  irriIntermediatePaddy,
  storageSources,
} from "../data/agriculture/storage-references";
import { storageCrop, storageMoistureGuideline } from "./crop-loss-storage";

const reviewedDigest =
  "cd3edd00f307d14de4fc179329830f8b23f2c25d6faac3a0dadc0a6b19138167";
const maxBytes = 10 * 1024 * 1024;

export async function verifyIrriStorageSource(fetcher: typeof fetch = fetch) {
  try {
    const response = await fetcher(storageSources.irri, {
      redirect: "error",
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok || !response.body) return false;
    const reader = response.body.getReader();
    const hash = createHash("sha256");
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        return false;
      }
      hash.update(value);
    }
    return hash.digest("hex") === reviewedDigest;
  } catch {
    return false;
  }
}

let cached: { expires: number; verification: Promise<boolean> } | undefined;

function verifyCached() {
  if (!cached || cached.expires <= Date.now()) {
    cached = {
      expires: Date.now() + 10 * 60_000,
      verification: verifyIrriStorageSource(),
    };
  }
  return cached.verification;
}

export async function onlineStorageReference(
  crop: string,
  durationDays?: number,
  verify = verifyCached,
) {
  if (
    storageCrop(crop) !== "paddy" ||
    durationDays == null ||
    !Number.isInteger(durationDays) ||
    durationDays < irriIntermediatePaddy.minDays! ||
    durationDays > irriIntermediatePaddy.maxDays! ||
    storageMoistureGuideline(crop, durationDays).available
  )
    return null;

  return (await verify()) ? irriIntermediatePaddy : null;
}
