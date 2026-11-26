import { Prisma } from "@prisma/client";
import { z } from "zod";

const quantityText = z
  .union([z.string(), z.number().finite()])
  .transform((value) => String(value).trim())
  .pipe(
    z
      .string()
      .regex(
        /^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/,
        "Enter a quantity greater than zero with up to three decimal places.",
      ),
  );
export const expectedHarvestInput = z
  .object({
    cropCycleId: z
      .string()
      .trim()
      .min(1, "Choose a saved crop cycle.")
      .max(191),
    expectedHarvestQuantity: quantityText,
    expectedHarvestUnit: z
      .string()
      .trim()
      .min(1, "Choose a harvest unit.")
      .max(24),
  })
  .strict();

export type ExpectedHarvestInput = z.infer<typeof expectedHarvestInput>;
export type ExpectedHarvestUser = { id: string };
export type ExpectedHarvestDependencies = {
  getUser: () => Promise<ExpectedHarvestUser | null>;
  allowRequest: (userId: string) => boolean;
  save: (
    userId: string,
    input: ExpectedHarvestInput,
  ) => Promise<{ quantity: string; unit: string } | null>;
  onDatabaseError?: (error: unknown, reference: string) => void;
  createReference?: () => string;
};

function prismaCode(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code
    : typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
}

export async function handleExpectedHarvestPatch(
  request: Request,
  dependencies: ExpectedHarvestDependencies,
) {
  let user: ExpectedHarvestUser | null;
  try {
    user = await dependencies.getUser();
  } catch {
    return Response.json(
      { error: "Authentication could not be checked. Please try again." },
      { status: 503 },
    );
  }
  if (!user)
    return Response.json(
      { error: "Sign in to save expected harvest." },
      { status: 401 },
    );
  if (!dependencies.allowRequest(user.id))
    return Response.json(
      { error: "Too many updates. Wait a moment and try again." },
      { status: 429 },
    );

  const body = await request.json().catch(() => null);
  const parsed = expectedHarvestInput.safeParse(body);
  if (!parsed.success)
    return Response.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Check the expected harvest details.",
      },
      { status: 400 },
    );
  const quantity = new Prisma.Decimal(parsed.data.expectedHarvestQuantity);
  if (!quantity.gt(0))
    return Response.json(
      { error: "Expected harvest must be greater than zero." },
      { status: 400 },
    );
  const input = {
    ...parsed.data,
    expectedHarvestQuantity: quantity.toFixed(3),
  };

  try {
    const saved = await dependencies.save(user.id, input);
    if (!saved)
      return Response.json(
        {
          error:
            "This crop cycle was not found under your farm. Refresh the page and choose one of your saved cycles.",
        },
        { status: 404 },
      );
    return Response.json({
      success: true,
      expectedHarvestQuantity: saved.quantity,
      expectedHarvestUnit: saved.unit,
      message: "Expected harvest saved.",
    });
  } catch (error) {
    const reference =
      dependencies.createReference?.() ?? `expected-harvest-${Date.now()}`;
    dependencies.onDatabaseError?.(error, reference);
    const code = prismaCode(error);
    if (code === "P2022")
      return Response.json(
        {
          error:
            "The database is missing the expected-harvest columns. Apply the pending Smart AgriTrack migration, then retry.",
          reference,
        },
        { status: 503 },
      );
    if (code === "P2025")
      return Response.json(
        {
          error:
            "The crop cycle changed or was removed. Refresh the page and retry.",
          reference,
        },
        { status: 409 },
      );
    if (code === "P1001" || code === "P1002" || code === "P1017")
      return Response.json(
        {
          error:
            "The database is unavailable. Your expected harvest was not saved; retry when the connection is restored.",
          reference,
        },
        { status: 503 },
      );
    return Response.json(
      {
        error: `Expected harvest could not be saved because of a database error. Reference: ${reference}.`,
        reference,
      },
      { status: 500 },
    );
  }
}
