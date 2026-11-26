import { getLocale } from "next-intl/server";
import { workspaceCatalog } from "@/i18n/crop-protection";
import { ProtectionCatalogProvider } from "@/i18n/crop-protection/client";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { ProtectionLanguage } from "@/i18n/crop-protection/client";
import HarvestCenter from "./ui";
export default async function Harvests({
  searchParams,
}: {
  searchParams: Promise<{ cropCycleId?: string }>;
}) {
  const params = await searchParams;
  const user = await getUser();
  const concerns = user
    ? await db.cropProtectionAssessment
        .findMany({
          where: {
            userId: user.id,
            ...(params.cropCycleId ? { cropCycleId: params.cropCycleId } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 200,
          select: { id: true, cropName: true, findings: true },
        })
        .catch(() => null)
    : [];
  const flagged =
    concerns?.filter((r) => {
      const f = r.findings as { pollutionStatus?: string };
      return f.pollutionStatus && f.pollutionStatus !== "Low Indication";
    }) ?? [];
  const locale = await getLocale();
  const catalog = locale === "en" ? undefined : workspaceCatalog(locale);
  return (
    <ProtectionCatalogProvider value={catalog}>
      <>
        <ProtectionLanguage notice>
          {concerns === null && (
            <p className="notice">
              Crop protection evidence is unavailable. Missing records do not
              establish produce safety.
            </p>
          )}
          {flagged.length > 0 && (
            <section
              className="panel"
              id={`protection-${params.cropCycleId ?? ""}`}
            >
              <h2>Crop protection safety review before harvest use</h2>
              <p>
                Potential contamination observations are recorded. Keep
                potentially contaminated produce separate; do not consume, sell
                or feed it to animals before an appropriate food/feed safety
                assessment. Improvement does not establish safety. These reports
                do not identify an industrial source.
              </p>
              <ul>
                {flagged.map((r) => (
                  <li key={r.id}>{r.cropName}</li>
                ))}
              </ul>
            </section>
          )}
        </ProtectionLanguage>
        <HarvestCenter initialCycleId={params.cropCycleId ?? ""} />
      </>
    </ProtectionCatalogProvider>
  );
}
