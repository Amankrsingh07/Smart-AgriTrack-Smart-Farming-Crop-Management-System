export type AssistantHistoryItem = { role: string; content: string };

/** Keeps a small, ordered window of prior turns for the Gemini request. */
export function boundedAssistantHistory(
  messages: AssistantHistoryItem[],
  limit = 12,
) {
  return messages
    .filter(
      (message) =>
        (message.role === "USER" || message.role === "ASSISTANT") &&
        message.content.trim(),
    )
    .slice(-limit)
    .map((message) => ({
      role: message.role === "USER" ? ("user" as const) : ("model" as const),
      parts: [{ text: message.content.slice(0, 2400) }],
    }));
}

export function assistantConversationTitle(question: string) {
  const clean = question.trim().replace(/\s+/g, " ");
  return clean.length > 177 ? `${clean.slice(0, 177).trimEnd()}…` : clean;
}

/** Older generated messages can contain lines with an icon placeholder. */
export function assistantDisplayText(content: string) {
  return content
    .split("\n")
    .filter(
      (line) =>
        !/^\s*(?:[•*-]\s*)?(?:svg|<\/?svg(?:\s[^>]*)?>)\s*$/i.test(line),
    )
    .join("\n")
    .trim();
}

export function assistantFieldHistory<
  T extends AssistantHistoryItem & { advice?: unknown },
>(messages: T[], cropCycleId: string | null, changedField: boolean) {
  if (changedField) return [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const { role, advice } = messages[i];
    if (
      role === "USER" &&
      advice &&
      typeof advice === "object" &&
      "cropCycleId" in advice &&
      advice.cropCycleId !== cropCycleId
    ) {
      return messages.slice(i + 2);
    }
  }
  return messages;
}
