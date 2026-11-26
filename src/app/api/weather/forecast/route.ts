import { NextResponse } from "next/server";
import { getUser } from "@/lib/session";
import {
  geocodeIndianDistrict,
  loadOfflineForecast,
  loadOpenMeteoForecast,
} from "@/lib/open-meteo";
import {
  findIndianDistrict,
  findIndianState,
  indianStateNamesMatch,
} from "@/lib/india-location";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await getUser()))
    return NextResponse.json(
      { success: false, error: "Authentication required." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  const params = new URL(request.url).searchParams;
  const stateName = (params.get("state") ?? "").trim().slice(0, 100);
  const districtName = (params.get("district") ?? "").trim().slice(0, 100);
  const state = findIndianState(stateName);
  if (!state || !districtName)
    return NextResponse.json(
      { success: false, error: "Choose an Indian state and enter a district." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  const district = findIndianDistrict(state.code, districtName);
  const geocodingDistrict = district?.name ?? districtName;
  let place: Awaited<ReturnType<typeof geocodeIndianDistrict>> = undefined;
  try {
    place = await geocodeIndianDistrict(geocodingDistrict, state.name);
    if (!place)
      return NextResponse.json(
        {
          success: false,
          error:
            "Open-Meteo could not find this district. Check the farm location or update its spelling.",
        },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    if (place.admin1 && !indianStateNamesMatch(place.admin1, state.name))
      return NextResponse.json(
        {
          success: false,
          error: `Open-Meteo matched ${place.name} in ${place.admin1}, not ${state.name}. Check the saved farm location.`,
        },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    if (!district && !place.admin1)
      return NextResponse.json(
        {
          success: false,
          error:
            "The district is not in the bundled location list and its state could not be verified by Open-Meteo.",
        },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    const forecast = await loadOpenMeteoForecast(
      place.latitude,
      place.longitude,
    );
    return NextResponse.json(
      {
        success: true,
        offlineOnly: false,
        source: `Open-Meteo forecast · approximate district location${district ? "" : " · geocoded district; state verified"}`,
        approximate: true,
        location: {
          ...place,
          name: district?.name ?? place.name,
          admin1: state.name,
        },
        forecast,
        fetchedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.message
        : "Online weather is currently unavailable.";
    if (
      message.includes("could not find this district") ||
      message.includes("not in") ||
      message.includes("matched") ||
      message.includes("state could not be verified")
    ) {
      return NextResponse.json(
        { success: false, error: message },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    // If geocoding identified the district, keep the demo values location-seeded.
    // Never present them as live weather: the client receives explicit source metadata.
    const forecast = loadOfflineForecast(place?.latitude, place?.longitude);
    return NextResponse.json(
      {
        success: true,
        offlineOnly: true,
        source:
          "Offline demonstration values · not a forecast or observed weather",
        fallbackReason: message,
        approximate: true,
        location: {
          name: district?.name ?? geocodingDistrict,
          admin1: state.name,
        },
        forecast,
        fetchedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
