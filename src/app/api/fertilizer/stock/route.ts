import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  fertilizerGradeSource,
  verifiedFertilizerProducts,
} from "@/lib/fertilizer-product-grades";
import {
  fertilizerStockSchema,
  recordFertilizerMovement,
} from "@/lib/fertilizer-stock";

const grade = z.enum(["Urea", "DAP", "MOP", "SSP"]);
const optionalLabel = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value?.replace(/\s+/g, " ") || null);
const action = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("addProduct"),
    grade,
    manufacturer: optionalLabel(120),
    source: optionalLabel(500),
    packSizeKg: z
      .number()
      .positive()
      .max(9_999_999.999)
      .multipleOf(0.001)
      .optional(),
  }),
  z.object({ action: z.literal("movement"), movement: fertilizerStockSchema }),
]);

export async function POST(request: Request) {
  const user = await getUser();
  if (!user)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  if (!checkRateLimit(`fertilizer-stock:${user.id}`, 30).allowed)
    return NextResponse.json(
      { error: "Try again in a minute." },
      { status: 429 },
    );
  const parsed = action.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the stock details." },
      { status: 400 },
    );
  try {
    if (parsed.data.action === "addProduct") {
      const { grade: name, manufacturer, source, packSizeKg } = parsed.data;
      const identity = {
        ownerId: user.id,
        name,
        organic: false,
        manufacturer,
        packSizeKg: packSizeKg ?? null,
        source: source ?? fertilizerGradeSource.url,
      };
      const product = await db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM User WHERE id = ${user.id} FOR UPDATE`;
          const previous = await tx.fertilizerProduct.findFirst({
            where: {
              ...identity,
              composition: { equals: verifiedFertilizerProducts[name] },
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true },
          });
          return (
            previous ??
            tx.fertilizerProduct.create({
              data: {
                ...identity,
                composition: verifiedFertilizerProducts[name],
              },
              select: { id: true },
            })
          );
        },
        { isolationLevel: "ReadCommitted" },
      );
      return NextResponse.json(product);
    }
    const result = await recordFertilizerMovement(
      user.id,
      parsed.data.movement,
    );
    return "error" in result
      ? NextResponse.json({ error: result.error }, { status: result.status })
      : NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch {
    return NextResponse.json(
      {
        error:
          "Stock could not be saved. Check that the stock and product identity migrations are applied.",
      },
      { status: 503 },
    );
  }
}
