import { loadEnvConfig } from "@next/env";
import { db } from "../src/lib/db";
import { indiaDateKey } from "../src/lib/crop-cycle-status";
import { loadOpenMeteoForecast } from "../src/lib/open-meteo";
import { fertilizerRainReview, fertilizerRainReviewSource } from "../src/lib/fertilizer-weather-review";

loadEnvConfig(process.cwd());
async function main() {
  if (!process.argv.includes("--write")) throw new Error("Pass --write to record forecast review notifications in the configured application database.");
  const now = new Date();
  const today = indiaDateKey(now);
  const through = indiaDateKey(new Date(now.getTime() + 6 * 86400000));
  const forecasts = new Map<string, Awaited<ReturnType<typeof loadOpenMeteoForecast>> | null>();
  let cursor: string | undefined;
  let reviews = 0;
  let unavailable = 0;
  do {
    const entries = await db.fertilizerApplication.findMany({
      where: { status: "PLANNED", planId: { not: null }, scheduledDate: { gte: new Date(today), lte: new Date(through) },
        cropCycle: { status: { in: ["ACTIVE", "PLANNED"] }, actualHarvestDate: null } },
      orderBy: { id: "asc" }, take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, scheduledDate: true, cropCycle: { select: { id: true, crop: { select: { name: true } }, field: { select: { farm: { select: { id: true, userId: true, latitude: true, longitude: true } } } } } } },
    });
    for (const entry of entries) {
      const farm = entry.cropCycle.field.farm;
      if (farm.latitude === null || farm.longitude === null) continue;
      if (!forecasts.has(farm.id)) {
        const fetchForecast = () => loadOpenMeteoForecast(farm.latitude!.toNumber(), farm.longitude!.toNumber());
        const forecast = await fetchForecast().catch(async (error: unknown) => {
          const status = (error as { httpStatus?: number })?.httpStatus;
          if (status !== 502 && status !== 503 && status !== 504) return null;
          await new Promise(resolve => setTimeout(resolve, 1000));
          return fetchForecast().catch(() => null);
        });
        forecasts.set(farm.id, forecast);
        if (!forecast) unavailable++;
      }
      const forecast = forecasts.get(farm.id);
      if (!forecast) continue;
      const date = entry.scheduledDate.toISOString().slice(0, 10);
      const review = fertilizerRainReview(forecast, date, today);
      const dedupeKey = `fertilizer-weather:${entry.id}:${date}`;
      await db.$transaction(async tx => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM FertilizerApplication WHERE id = ${entry.id} AND status = 'PLANNED' AND scheduledDate = ${entry.scheduledDate} FOR UPDATE`;
        if (!rows.length) return;
        if (!review) {
          const index = forecast.daily.time.indexOf(date);
          if (index >= 0 && forecast.daily.precipitation_sum[index] === 0) await tx.alert.updateMany({
            where: { userId: farm.userId, dedupeKey, completedAt: null }, data: { readAt: now, completedAt: now },
          });
          return;
        }
        const message = `Open-Meteo forecast for ${date}: ${review.rain} mm${review.probability === null ? "" : `, ${review.probability}% chance`}. Check field conditions and your local advisory before the planned application. Forecast retrieved ${now.toISOString()}. Background: ${fertilizerRainReviewSource}`;
        await tx.alert.upsert({
          where: { userId_dedupeKey: { userId: farm.userId, dedupeKey } },
          create: { userId: farm.userId, dedupeKey, title: "Review fertilizer timing for forecast rain", message, dueOn: entry.scheduledDate,
            cropName: entry.cropCycle.crop.name, href: `/fertilizer-recommendation?cycle=${entry.cropCycle.id}` },
          update: { message },
        });
        reviews++;
      });
    }
    cursor = entries.length === 100 ? entries.at(-1)?.id : undefined;
  } while (cursor);
  console.log(JSON.stringify({ finishedAt: new Date().toISOString(), reviews, unavailable, farmsChecked: forecasts.size }));
  if (unavailable) process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Forecast review failed."); process.exitCode = 1; }).finally(() => db.$disconnect());
