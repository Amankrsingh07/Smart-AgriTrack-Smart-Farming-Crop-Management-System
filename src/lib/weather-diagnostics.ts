export type WeatherFailureCode =
  | "MISSING_COORDINATES"
  | "INVALID_COORDINATES"
  | "TIMEOUT"
  | "DNS_FAILURE"
  | "RATE_LIMITED"
  | "PROVIDER_HTTP"
  | "INVALID_RESPONSE"
  | "NETWORK_FAILURE";
export class WeatherForecastError extends Error {
  constructor(
    public code: WeatherFailureCode,
    message: string,
    public httpStatus?: number,
  ) {
    super(message);
    this.name = "WeatherForecastError";
  }
}
export function forecastNetworkFailure(error: unknown) {
  const value = error as { name?: string; cause?: { code?: string } };
  if (
    ["TimeoutError", "AbortError"].includes(value?.name ?? "") ||
    ["ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(value?.cause?.code ?? "")
  )
    return new WeatherForecastError(
      "TIMEOUT",
      "Open-Meteo forecast is unavailable: the request timed out.",
    );
  if (["ENOTFOUND", "EAI_AGAIN"].includes(value?.cause?.code ?? ""))
    return new WeatherForecastError(
      "DNS_FAILURE",
      "Open-Meteo forecast is unavailable: the server could not resolve the weather provider hostname.",
    );
  return new WeatherForecastError(
    "NETWORK_FAILURE",
    "Open-Meteo forecast is unavailable because the weather service could not be reached.",
  );
}
export function weatherFailureDetails(error: unknown) {
  const failure =
    error instanceof WeatherForecastError
      ? error
      : new WeatherForecastError(
          "INVALID_RESPONSE",
          "Open-Meteo returned an invalid or incomplete forecast response.",
        );
  const actions: Record<WeatherFailureCode, string> = {
    MISSING_COORDINATES:
      "Add verified farm latitude/longitude in Farms. No location is guessed.",
    INVALID_COORDINATES: "Correct the saved farm latitude/longitude in Farms.",
    TIMEOUT:
      "Retry weather review. If repeated, check server connectivity to api.open-meteo.com.",
    DNS_FAILURE:
      "Check the application server’s DNS/network access to api.open-meteo.com, then retry.",
    RATE_LIMITED:
      "The provider returned HTTP 429. Wait before retrying; no sample forecast will be substituted.",
    PROVIDER_HTTP:
      "Retry later and check the provider HTTP status. No alternative data is inferred.",
    INVALID_RESPONSE:
      "The provider response failed validation. Retry; incomplete readings are not used for alerts.",
    NETWORK_FAILURE:
      "Check the application server’s outbound HTTPS connection, then retry weather review.",
  };
  return {
    code: failure.code,
    message: failure.message,
    httpStatus: failure.httpStatus ?? null,
    action: actions[failure.code],
    source: "Open-Meteo forecast API",
    sourceUrl: "https://open-meteo.com/en/docs",
    href: failure.code.includes("COORDINATES") ? "/farms" : "/weather",
  };
}
