import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

const cookieName = "agritrack_session";
function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  return value;
}
function sign(value: string) { return createHmac("sha256", secret()).update(value).digest("hex"); }
export async function createSession(userId: string) {
  const payload = Buffer.from(JSON.stringify({ userId, exp: Date.now() + 1000 * 60 * 60 * 24 * 14 })).toString("base64url");
  (await cookies()).set(cookieName, `${payload}.${sign(payload)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 14 });
}
export async function clearSession() { (await cookies()).delete(cookieName); }
export async function getUser() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const [payload, signature] = token.split("."); if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload)); const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try { const data = JSON.parse(Buffer.from(payload, "base64url").toString()); if (data.exp < Date.now()) return null; return await db.user.findUnique({ where: { id: data.userId }, select: { id: true, name: true, email: true, phone: true, language: true } }); } catch { return null; }
}
