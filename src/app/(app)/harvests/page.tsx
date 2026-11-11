import HarvestCenter from "./ui";
export default async function Harvests({ searchParams }: { searchParams: Promise<{ cropCycleId?: string }> }) {
  const params = await searchParams;
  return <HarvestCenter initialCycleId={params.cropCycleId ?? ""} />;
}
