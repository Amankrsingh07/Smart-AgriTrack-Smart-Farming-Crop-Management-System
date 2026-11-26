import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateSoilAttachment } from "@/lib/soil-attachments";
import {
  inspectionReminderKey,
  readLossReminders,
} from "@/lib/crop-loss-reminders";
import { indiaDateKey } from "@/lib/crop-cycle-status";
import { inspectionInput, storageRisk } from "@/lib/crop-loss-storage";

export async function POST(request: Request) {
  const user = await getUser();
  if (!user)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  if (!checkRateLimit(`storage-inspection:${user.id}`, 20).allowed) {
    return NextResponse.json(
      { error: "Too many updates. Try later." },
      { status: 429 },
    );
  }
  if (Number(request.headers.get("content-length")) > 7 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Inspection upload is too large." },
      { status: 413 },
    );
  }
  const multipart = request.headers
    .get("content-type")
    ?.startsWith("multipart/form-data");
  const form = multipart ? await request.formData().catch(() => null) : null;
  const data = multipart
    ? await new Response(String(form?.get("inspection") ?? "null"))
        .json()
        .catch(() => null)
    : await request.json().catch(() => null);
  const parsed = inspectionInput.safeParse(data);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  const attachments: Prisma.StorageInspectionAttachmentCreateWithoutInspectionInput[] =
    [];
  try {
    const files = form?.getAll("attachments") ?? [];
    if (files.length > 3)
      throw new Error("Attach up to three files per inspection.");
    for (const file of files) {
      if (typeof file === "string" || file.size > 2 * 1024 * 1024)
        throw new Error("Each attachment must be 2 MB or smaller.");
      const content = Buffer.from(await file.arrayBuffer());
      const { filename, mediaType } = validateSoilAttachment(
        content,
        file.name,
        file.type,
      );
      attachments.push({ filename: filename.slice(-191), mediaType, content });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid attachment." },
      { status: 400 },
    );
  }
  const { productionId, version, inspectedOn, findings } = parsed.data;
  const stale = () =>
    NextResponse.json(
      { error: "This inspection changed. Reload the lot and try again." },
      { status: 409 },
    );
  try {
    const result = await db.$transaction(
      async (tx) => {
        const lot = await tx.production.findFirst({
          where: {
            id: productionId,
            cropCycle: { field: { farm: { userId: user.id } } },
          },
          select: {
            harvestDate: true,
            cropCycleId: true,
            cropCycle: { select: { crop: { select: { name: true } } } },
            storageInspections: {
              orderBy: { version: "desc" },
              take: 1,
              select: { version: true },
            },
          },
        });
        if (!lot)
          return NextResponse.json(
            { error: "Harvest lot not found." },
            { status: 404 },
          );
        if (inspectedOn < lot.harvestDate.toISOString().slice(0, 10)) {
          return NextResponse.json(
            { error: "Inspection cannot precede the harvest date." },
            { status: 400 },
          );
        }
        if ((lot.storageInspections[0]?.version ?? 0) !== version)
          return stale();
        if (
          findings.commodityForm &&
          lot.cropCycle.crop.name.trim().toLowerCase() !== "rice"
        )
          return NextResponse.json(
            {
              error: "Rice form can only be selected for a lot saved as Rice.",
            },
            { status: 400 },
          );
        const inspection = await tx.storageInspection.create({
          data: {
            productionId,
            version: version + 1,
            inspectedOn: new Date(inspectedOn),
            findings,
            attachments: { create: attachments },
          },
        });
        const cropName = lot.cropCycle.crop.name;
        const assessment = storageRisk(findings, cropName);
        const actionIds: Record<string, string> = {
          "Grain moisture": "moisture",
          "Pest infestation": "pests",
          "Disease symptoms": "storage-safety",
          "Visible mold": "storage-safety",
          "Storage condition": "store",
          "Indoor temperature (°C)": "storage-climate",
          "Indoor relative humidity (%)": "storage-climate",
        };
        const urgent = (card: (typeof assessment.cards)[number]) =>
          card.status === "High concern" ||
          (assessment.status === "High concern" &&
            card.status === "Potential concern");
        const rows = assessment.cards
          .filter(
            (card) =>
              [
                "High concern",
                "Potential concern",
                "Inspection required",
              ].includes(card.status) && actionIds[card.label],
          )
          .sort((a, b) => Number(urgent(b)) - Number(urgent(a)))
          .map((card) => {
            const actionId = actionIds[card.label];
            return {
              userId: user.id,
              dedupeKey: inspectionReminderKey(
                lot.cropCycleId,
                actionId,
                productionId,
              ),
              title: "Crop loss prevention review",
              message: card.action,
              actionId,
              cropName,
              productionId,
              dueOn: new Date(indiaDateKey(new Date())),
              priority: urgent(card) ? "High" : "Medium",
              href: `/crop-loss?cycle=${encodeURIComponent(lot.cropCycleId)}&lot=${encodeURIComponent(productionId)}`,
            };
          });
        if (rows.length)
          await tx.alert.createMany({ data: rows, skipDuplicates: true });
        for (const row of rows.filter((row) => row.priority === "High")) {
          await tx.alert.updateMany({
            where: {
              userId: user.id,
              dedupeKey: row.dedupeKey,
              completedAt: null,
              OR: [{ priority: null }, { priority: { not: "High" } }],
            },
            data: {
              priority: "High",
              message: row.message,
              dueOn: row.dueOn,
              readAt: null,
            },
          });
        }
        return inspection;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (result instanceof NextResponse) return result;
    return NextResponse.json(
      {
        inspection: result,
        reminders: await readLossReminders(user.id).catch(() => undefined),
      },
      { status: 201 },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034"].includes(error.code)
    )
      return stale();
    return NextResponse.json(
      { error: "Storage inspection unavailable." },
      { status: 503 },
    );
  }
}
