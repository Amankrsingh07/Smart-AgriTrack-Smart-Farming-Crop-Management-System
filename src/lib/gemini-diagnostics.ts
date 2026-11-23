/** Return only bounded diagnostic codes. Provider messages may contain request data. */
export async function geminiHttpFailure(response: Response) {
  const payload: unknown = await response.json().catch(() => null);
  const error = (payload as { error?: { message?: string; status?: string; details?: { reason?: string }[] } } | null)?.error;
  if (Array.isArray(error?.details) && error.details.some(item => item?.reason === "API_KEY_INVALID")) return "INVALID_KEY";
  if (/api key (?:not valid|invalid)|api_key_invalid/i.test(error?.message ?? "")) return "INVALID_KEY";
  if (response.status === 429) return "QUOTA_OR_RATE_LIMIT";
  if (response.status === 401 || response.status === 403) return "AUTHORIZATION";
  if (response.status === 404) return "MODEL_UNAVAILABLE";
  if (response.status === 400) return "INVALID_REQUEST";
  if (response.status >= 500) return "PROVIDER_UNAVAILABLE";
  return "PROVIDER_HTTP";
}

export function geminiTransportFailure(error: unknown) {
  if (error instanceof SyntaxError) return "INVALID_JSON";
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "REQUEST_TIMEOUT";
  return "NETWORK_FAILURE";
}

export function geminiRetryable(response: Response) {
  return [502, 503, 504].includes(response.status) && !response.headers.has("retry-after");
}
