import {
  geminiHttpFailure,
  geminiTransportFailure,
} from "../src/lib/gemini-diagnostics";
import { loadEnvConfig } from "@next/env";
import { fetchLiveMandi } from "../src/lib/live-mandi";
import { loadOpenMeteoForecast } from "../src/lib/open-meteo";
import { weatherFailureDetails } from "../src/lib/weather-diagnostics";

type Outcome = {
  provider: string;
  check: string;
  status: string;
  httpStatus?: number;
  causeCode?: string;
};
loadEnvConfig(process.cwd());

function networkCode(error: unknown) {
  const cause = (
    error as { cause?: { code?: unknown; cause?: { code?: unknown } } }
  )?.cause;
  const code = cause?.code ?? cause?.cause?.code;
  return typeof code === "string" && /^[A-Z0-9_]+$/.test(code)
    ? code
    : "UNCLASSIFIED";
}

async function weather(): Promise<Outcome> {
  // Public coordinates near IARI, New Delhi. No farm or account data is used.
  try {
    const data = await loadOpenMeteoForecast(28.63, 77.15);
    const valid =
      data.daily.time.length === 7 &&
      !!data.current.time &&
      [
        data.current.temperature_2m,
        data.current.relative_humidity_2m,
        data.current.precipitation,
        data.current.wind_speed_10m,
      ].every(Number.isFinite) &&
      [
        data.daily.precipitation_sum,
        data.daily.precipitation_probability_max,
        data.daily.et0_fao_evapotranspiration,
      ].every((series) => series?.some(Number.isFinite));
    return {
      provider: "Open-Meteo",
      check: "public location, seven-day forecast and requested variables",
      status: valid ? "passed" : "incomplete",
    };
  } catch (error) {
    const failure = weatherFailureDetails(error);
    return {
      provider: "Open-Meteo",
      check: "public location forecast",
      status: failure.code,
      httpStatus: failure.httpStatus ?? undefined,
    };
  }
}

async function gemini(): Promise<Outcome[]> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const model = process.env.GEMINI_MODEL;
  const provider = "Gemini";
  if (!key || !model || !/^[\w.-]+$/.test(model)) {
    return [
      {
        provider,
        check: "text and invalid key",
        status: "key or explicit model missing",
      },
    ];
  }
  async function send(
    apiKey: string,
    mode: "text" | "invalid-key" | "image",
  ): Promise<Outcome> {
    const invalid = mode === "invalid-key";
    const check = invalid
      ? "invalid-key rejection"
      : mode === "image"
        ? "synthetic PNG and Hindi JSON response"
        : "configured model and Hindi JSON response";
    const parts: Array<Record<string, unknown>> = [
      {
        text: 'Return a JSON object with a Hindi greeting in the string field "message".',
      },
    ];
    if (mode === "image")
      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
        },
      });
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": apiKey,
          },
          signal: AbortSignal.timeout(12_000),
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: { message: { type: "STRING" } },
                required: ["message"],
              },
            },
          }),
        },
      );
      if (invalid || !response.ok) {
        return {
          provider,
          check,
          status:
            invalid && [400, 401, 403].includes(response.status)
              ? "rejected"
              : "provider HTTP failure",
          httpStatus: response.status,
          causeCode: await geminiHttpFailure(response),
        };
      }
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.find(
        (part: { thought?: boolean; text?: string }) =>
          !part.thought && part.text,
      )?.text;
      const parsed = JSON.parse(text ?? "{}");
      return {
        provider,
        check,
        status:
          typeof parsed.message === "string" &&
          /[\u0900-\u097f]/.test(parsed.message)
            ? "passed"
            : "invalid response schema or language",
      };
    } catch (error) {
      return {
        provider,
        check,
        status: geminiTransportFailure(error),
        causeCode: networkCode(error),
      };
    }
  }
  return [
    await send(key, "text"),
    await send(key, "image"),
    await send("invalid-agritrack-probe", "invalid-key"),
  ];
}

async function mandi(): Promise<Outcome> {
  const provider = "VoiceOfVillage";
  const check = "district-scoped Patna wheat query";
  if (!process.env.VOV_API_KEY?.trim())
    return { provider, check, status: "VOV_API_KEY missing" };
  try {
    const result = await fetchLiveMandi({
      state: "Bihar",
      district: "Patna",
      commodity: "Wheat",
    });
    return {
      provider,
      check,
      status: result.count
        ? "connectivity verified; rows returned"
        : "connectivity verified; empty result",
    };
  } catch (error) {
    const status =
      error instanceof Error
        ? error.message.match(/VoiceOfVillage returned HTTP (\d{3})/)
        : null;
    return {
      provider,
      check,
      status: "request failed",
      httpStatus: status ? Number(status[1]) : undefined,
      causeCode: networkCode(error),
    };
  }
}

async function main() {
  const [weatherResult, geminiResults, mandiResult] = await Promise.all([
    weather(),
    gemini(),
    mandi(),
  ]);
  console.log(
    JSON.stringify(
      [
        ...geminiResults,
        weatherResult,
        mandiResult,
        {
          provider: "data.gov.in",
          check: "application integration",
          status: "bundled snapshot; no live connector configured",
        },
      ],
      null,
      2,
    ),
  );
}
void main();
