/** Fail closed before any schema setup or test writes. No production override. */
export function requireTestDatabase(raw: string | undefined) {
  if (!raw)
    throw new Error(
      "TEST_DATABASE_URL is required; existing DATABASE_URL is never used as a fallback.",
    );
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      "TEST_DATABASE_URL must be a valid dedicated MySQL test URL.",
    );
  }
  if (
    url.protocol !== "mysql:" ||
    !/^agritrack_(?:[a-z0-9]+_)*test(?:_[a-z0-9]+)*$/.test(
      url.pathname.slice(1),
    )
  )
    throw new Error("Use an explicitly named agritrack_*test* MySQL database.");
  if (!["localhost", "127.0.0.1", "mysql"].includes(url.hostname))
    throw new Error("Integration tests require a local or CI MySQL service.");
  return raw;
}
