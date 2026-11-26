import { PrismaClient } from "@prisma/client";
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/** Detect a dev server that was started before the crop-calendar migration/client was generated. */
export function hasCropCalendarPrismaModel() {
  const delegate = (db as unknown as Record<string, unknown>)
    .cropCalendarEvent as { findMany?: unknown } | undefined;
  return typeof delegate?.findMany === "function";
}
