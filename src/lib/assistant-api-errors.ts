import { NextResponse } from "next/server";

type AssistantFailure = { status: number; message: string; code: string };

export function assistantApiFailure(error: unknown, area: string): AssistantFailure {
  const candidate = error as { code?: unknown; name?: unknown } | null;
  const code = typeof candidate?.code === "string" ? candidate.code : undefined;
  const name = typeof candidate?.name === "string" ? candidate.name : "UnknownError";

  // Keep logs useful for operators while excluding provider payloads, user data,
  // SQL, connection strings, and credentials.
  console.error("Assistant request failed", { area, prismaCode: code, errorName: name });

  if (["P2021", "P2022"].includes(code ?? "")) {
    return { status: 503, code: "CHAT_SCHEMA_UNAVAILABLE", message: "Chat storage is not ready yet. Please contact support or retry after the database update." };
  }
  if (["P1001", "P1002", "P1017", "P2024"].includes(code ?? "") || name === "PrismaClientInitializationError") {
    return { status: 503, code: "CHAT_STORAGE_UNAVAILABLE", message: "Chat storage is temporarily unavailable. Please try again shortly." };
  }
  if (name === "PrismaClientKnownRequestError" || name === "PrismaClientUnknownRequestError" || name === "PrismaClientRustPanicError") {
    return { status: 503, code: "CHAT_STORAGE_ERROR", message: "We could not save this chat right now. Your question is still in the box; please retry in a moment." };
  }
  return { status: 500, code: "ASSISTANT_UNAVAILABLE", message: "The assistant could not complete that request. Please try again." };
}

export function assistantErrorResponse(error: unknown, area: string) {
  const failure = assistantApiFailure(error, area);
  return NextResponse.json({ error: failure.message, code: failure.code }, { status: failure.status, headers: { "Cache-Control": "private, no-store" } });
}
