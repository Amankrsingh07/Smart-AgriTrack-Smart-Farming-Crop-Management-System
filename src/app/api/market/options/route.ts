import { NextResponse } from "next/server";
import mandiSnapshot from "@/data/mandi-prices.json";
import { fetchLiveMandi } from "@/lib/live-mandi";
import { getUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const stateAliases: Record<string, string> = { andamanandnicobar: "andamanandnicobarislands", chattisgarh: "chhattisgarh", keralam: "kerala", nctofdelhi: "delhi", pondicherry: "puducherry" };
const normalizeState = (value: string) => stateAliases[normalize(value)] ?? normalize(value);

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const source = params.get("source") ?? "offline";
  const state = normalize(params.get("state") ?? "");
  const district = normalize(params.get("district") ?? "");
  if (source === "online" && district) {
    const user = await getUser();
    if (!user) return NextResponse.json({ commodities: [], error: "Authentication required." }, { status: 401 });
    const rate = checkRateLimit(`market-live:${user.id}`, 20, 60_000);
    if (!rate.allowed) return NextResponse.json({ commodities: [], error: "Too many live mandi requests. Please wait a minute and try again." }, { status: 429 });
    try {
      const result = await fetchLiveMandi({ state: params.get("state") || undefined, district: params.get("district") || undefined });
      const commodities = [...new Set(result.records.map(row => row.commodity).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b));
      return NextResponse.json({ commodities, scope: "data.gov.in", count: result.total });
    } catch (error) {
      return NextResponse.json({ commodities: [], error: error instanceof Error ? error.message : "Could not load online commodity options." }, { status: 503 });
    }
  }
  const commodities = [...new Set(mandiSnapshot.records.filter(row =>
    (!state || normalizeState(row.State ?? "") === normalizeState(state)) &&
    (!district || normalize(row.District ?? "") === district)
  ).map(row => row.Commodity).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b));
  return NextResponse.json({
    commodities,
    scope: "offline-snapshot",
    dataDate: mandiSnapshot.meta.dataDate,
    message: source === "online" ? "Choose a district to load live VoiceOfVillage mandi prices; commodity names here come from the offline reference snapshot." : undefined,
  });
}
