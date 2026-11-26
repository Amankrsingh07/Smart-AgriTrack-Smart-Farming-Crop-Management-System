import { z } from "zod";
import { protectionText } from "../i18n/crop-protection";

export async function simplifyHarvestActions<
  T extends { id: string; text: string; short: string },
>(
  actions: T[],
  options: {
    apiKey?: string;
    model?: string;
    locale?: string;
    language?: string;
    fetcher?: typeof fetch;
  } = {},
) {
  const locale = options.locale ?? "en";
  const localized = actions.map((action) => ({
    ...action,
    text: protectionText(locale, action.text),
    short: protectionText(locale, action.short),
  }));
  const fallback = { mode: "offline" as const, actions };
  if (
    !actions.length ||
    !options.apiKey ||
    !options.model ||
    !/^[\w.-]+$/.test(options.model)
  )
    return fallback;
  try {
    const response = await (options.fetcher ?? fetch)(
      `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": options.apiKey,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: `Select action IDs whose supplied shorter explanation is clear for a farmer reading ${options.language ?? "English"}. Return only an array of selected IDs. Use the supplied wording.`,
              },
            ],
          },
          contents: [
            {
              parts: [
                {
                  text: JSON.stringify(
                    localized.map(({ id, text, short }) => ({
                      id,
                      text,
                      short,
                    })),
                  ),
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: { type: "ARRAY", items: { type: "STRING" } },
            temperature: 0,
            maxOutputTokens: 350,
          },
        }),
      },
    );
    if (!response.ok) return fallback;
    const data = await response.json();
    const ids = z
      .array(z.string())
      .max(actions.length)
      .parse(
        JSON.parse(
          data.candidates?.[0]?.content?.parts
            ?.filter((p: { thought?: boolean }) => !p.thought)
            .map((p: { text?: string }) => p.text ?? "")
            .join(""),
        ),
      );
    if (ids.some((id) => !actions.some((action) => action.id === id)))
      return fallback;
    return {
      mode: "ai" as const,
      actions: actions.map((action) =>
        ids.includes(action.id) ? { ...action, text: action.short } : action,
      ),
    };
  } catch {
    return fallback;
  }
}
