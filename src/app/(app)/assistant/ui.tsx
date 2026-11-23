"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRight, Check, Copy, MessageSquare, Pause, Play, Plus, RotateCcw, Send, Square, Trash2, Volume2 } from "lucide-react";
import FarmerAdviceCard from "../farmer-advice-card";
import { assistantDisplayText } from "@/lib/assistant-chat";
import { assistantChatText } from "@/i18n/assistant-chat";

type CropOption = { id: string; crop: string; farm: string; field: string; season: string; status: string; sowingDate: string | null };
type Advice = { situation: string; possibleCauses: string; nextSteps: string[]; expertHelp: string; details?: string; followUpQuestions?: string[] };
type Source = { label: string; url: string };
type ChatMessage = { id: string; role: "USER" | "ASSISTANT"; content: string; mode?: string | null; advice?: Advice | { onlineIssue: string } | null; sources?: Source[] | null };
type Conversation = { id: string; title: string; updatedAt: string; cropCycleId: string | null };
const speechLanguage: Record<string, string> = { en: "en-IN", hi: "hi-IN", pa: "pa-IN", mr: "mr-IN", gu: "gu-IN", bn: "bn-IN", ta: "ta-IN", te: "te-IN", kn: "kn-IN", ml: "ml-IN", or: "or-IN" };

async function readJsonResponse(response: Response): Promise<Record<string, unknown> | null> {
  const body = await response.text();
  if (!body.trim()) return null;
  try {
    const value: unknown = JSON.parse(body);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function responseError(data: Record<string, unknown> | null, fallback: string, status: number, localize: (key: Parameters<typeof assistantChatText>[1]) => string) {
  if (data?.code === "CHAT_STORAGE_UNAVAILABLE" || data?.code === "CHAT_STORAGE_ERROR") return localize("storageUnavailable");
  if (data?.code === "CHAT_SCHEMA_UNAVAILABLE") return localize("schemaUnavailable");
  return typeof data?.error === "string" && data.error.trim() ? data.error : `${fallback} (${status})`;
}

function onlineUnavailableText(issue: string, hindi: boolean) {
  if (issue === "QUOTA_OR_RATE_LIMIT") return hindi ? "ऑनलाइन सेवा व्यस्त है। कुछ देर बाद फिर कोशिश करें।" : "The online service is busy. Try again in a moment.";
  if (issue === "REQUEST_TIMEOUT") return hindi ? "ऑनलाइन जवाब आने में बहुत समय लगा।" : "The online answer took too long.";
  if (issue === "INVALID_KEY" || issue === "AUTHORIZATION" || issue === "NOT_CONFIGURED") {
    return hindi ? "ऑनलाइन सेवा अभी उपलब्ध नहीं है। सेवा की सेटिंग जाँचने की जरूरत है।" : "Online answers are unavailable. The service configuration needs attention.";
  }
  return hindi ? "ऑनलाइन जवाब अभी उपलब्ध नहीं है।" : "An online answer is unavailable right now.";
}

export default function AssistantForm({ initialQuestion = "", cycle = "", cycles = [] }: { initialQuestion?: string; cycle?: string; cycles?: CropOption[] }) {
  const t = useTranslations("Assistant");
  const locale = useLocale();
  const label = (key: Parameters<typeof assistantChatText>[1]) => assistantChatText(locale, key);
  const [question, setQuestion] = useState(initialQuestion);
  const [selectedCycle, setSelectedCycle] = useState(cycle);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [speechState, setSpeechState] = useState<{ id: string; state: "speaking" | "paused" } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  async function refreshConversations() {
    try {
      const response = await fetch("/api/assistant/conversations", { cache: "no-store" });
      if (response.ok) {
        const data = await readJsonResponse(response);
        const items = Array.isArray(data?.conversations) ? data.conversations as Array<Conversation & { _count?: { messages: number } }> : [];
        setConversations(items.filter(item => (item._count?.messages ?? 0) > 0));
      }
    } catch { /* Keep the active chat usable if only the history list is unavailable. */ }
    finally { setHistoryLoading(false); }
  }
  useEffect(() => { void refreshConversations(); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy]);
  useEffect(() => () => { if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel(); }, []);

  function startNewChat() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeechState(null);
    setConversationId(""); setMessages([]); setError(""); setQuestion(""); setHistoryOpen(false); setSelectedCycle(cycle);
  }

  async function openConversation(id: string) {
    setError(""); setHistoryOpen(false);
    try {
      const response = await fetch(`/api/assistant/conversations/${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await readJsonResponse(response);
      const conversation = data?.conversation as { id?: string; messages?: ChatMessage[]; cropCycleId?: string | null } | undefined;
      if (!response.ok || !conversation?.id || !Array.isArray(conversation.messages)) throw new Error(responseError(data, t("requestFailed"), response.status, label));
      setConversationId(conversation.id);
      setMessages(conversation.messages);
      setSelectedCycle(conversation.cropCycleId ?? "");
      setQuestion("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("requestFailed")); }
  }

  async function deleteConversation(id: string) {
    if (!window.confirm(label("confirmDelete"))) return;
    try {
      const response = await fetch(`/api/assistant/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      if (id === conversationId) startNewChat();
      await refreshConversations();
    } catch { setError(t("requestFailed")); }
  }

  function answerMessage(data: Record<string, unknown> | null): ChatMessage {
    if (typeof data?.messageId !== "string" || typeof data.answer !== "string") throw new Error(t("requestFailed"));
    return { id: data.messageId, role: "ASSISTANT", content: data.answer,
      mode: typeof data.mode === "string" ? data.mode : "offline",
      advice: (data.advice ?? null) as ChatMessage["advice"],
      sources: Array.isArray(data.sources) ? data.sources as Source[] : [],
    };
  }

  async function retryOnline(message: ChatMessage) {
    if (sendingRef.current || !conversationId) return;
    sendingRef.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/assistant", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, retryMessageId: message.id }), signal: AbortSignal.timeout(45_000),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(responseError(data, t("requestFailed"), response.status, label));
      const updated = answerMessage(data);
      setMessages(turns => turns.map(turn => turn.id === message.id ? updated : turn));
    } catch (cause) {
      setError(cause instanceof DOMException && cause.name === "TimeoutError" ? t("timeout") : cause instanceof Error ? cause.message : t("requestFailed"));
    } finally { sendingRef.current = false; setBusy(false); }
  }

  async function sendQuestion(value: string) {
    const text = value.trim();
    if (sendingRef.current || text.length < 5) return;
    sendingRef.current = true; setBusy(true); setError(""); setQuestion("");
    const localUserId = `local-user-${crypto.randomUUID()}`;
    setMessages(previous => [...previous, { id: localUserId, role: "USER", content: text }]);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text, cropCycleId: selectedCycle || null, conversationId: conversationId || undefined, requestId: crypto.randomUUID() }),
        signal: AbortSignal.timeout(45_000),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(responseError(data, t("requestFailed"), response.status, label));
      const responseConversationId = data?.conversationId;
      const responseAnswer = data?.answer;
      if (typeof responseConversationId !== "string" || typeof responseAnswer !== "string") throw new Error(responseError(data, t("requestFailed"), response.status, label));
      const newAnswer = answerMessage(data);
      setConversationId(responseConversationId);
      if (typeof data?.cropCycleId === "string") setSelectedCycle(data.cropCycleId);
      setMessages(previous => [...previous.filter(message => message.id !== localUserId),
        { id: `user-${crypto.randomUUID()}`, role: "USER", content: text },
        newAnswer,
      ]);
      await refreshConversations();
    } catch (cause) {
      setMessages(previous => previous.filter(message => message.id !== localUserId));
      setQuestion(text);
      setError(cause instanceof DOMException && cause.name === "TimeoutError" ? t("timeout") : cause instanceof Error ? cause.message : t("requestFailed"));
    } finally { sendingRef.current = false; setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await sendQuestion(question); }
  async function copyMessage(message: ChatMessage) {
    try { await navigator.clipboard.writeText(assistantDisplayText(message.content)); setCopiedId(message.id); window.setTimeout(() => setCopiedId(""), 1600); }
    catch { setError(t("requestFailed")); }
  }
  function speak(message: ChatMessage) {
    if (!("speechSynthesis" in window)) { setError(label("listen") + " is not supported in this browser."); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(assistantDisplayText(message.content));
    utterance.lang = speechLanguage[locale === "en" && /[\u0900-\u097f]/u.test(utterance.text) ? "hi" : locale] ?? "en-IN";
    const languagePrefix = utterance.lang.split("-")[0].toLowerCase();
    const voice = window.speechSynthesis.getVoices().find(item => item.lang.toLowerCase().startsWith(languagePrefix));
    if (voice) utterance.voice = voice;
    utterance.onend = () => setSpeechState(null);
    utterance.onerror = () => setSpeechState(null);
    utteranceRef.current = utterance;
    setSpeechState({ id: message.id, state: "speaking" });
    window.speechSynthesis.speak(utterance);
  }
  function toggleSpeech(message: ChatMessage) {
    if (speechState?.id !== message.id) { speak(message); return; }
    if (speechState.state === "paused") { window.speechSynthesis.resume(); setSpeechState({ id: message.id, state: "speaking" }); }
    else { window.speechSynthesis.pause(); setSpeechState({ id: message.id, state: "paused" }); }
  }
  function stopSpeech() { window.speechSynthesis.cancel(); utteranceRef.current = null; setSpeechState(null); }

  const prompts = [t("promptSowing"), t("promptWater"), t("promptHarvest")];
  const selectedCrop = cycles.find(item => item.id === selectedCycle);

  return <div className={`assistant-workspace${historyOpen ? " history-open" : ""}`}>
    {historyOpen && <button className="assistant-history-backdrop" aria-label={t("close")} onClick={() => setHistoryOpen(false)} />}
    <aside className="assistant-history" aria-label={label("previous")}>
      <div className="assistant-history-heading"><strong>{label("previous")}</strong><button type="button" disabled={busy} onClick={startNewChat} aria-label={label("newChat")}><Plus size={17}/></button></div>
      <button type="button" className="assistant-new-chat" disabled={busy} onClick={startNewChat}><Plus size={17}/>{label("newChat")}</button>
      <div className="assistant-history-list">
        {historyLoading ? <p className="muted">{label("loading")}</p> : conversations.length === 0 ? <p className="muted">{label("noHistory")}</p> : conversations.map(item => <div className={`assistant-history-item${conversationId === item.id ? " active" : ""}`} key={item.id}>
          <button type="button" className="assistant-history-open" disabled={busy} onClick={() => void openConversation(item.id)}><MessageSquare size={16}/><span>{item.title}</span></button>
          <button type="button" className="assistant-history-delete" disabled={busy} aria-label={`${label("delete")} · ${item.title}`} onClick={() => void deleteConversation(item.id)}><Trash2 size={15}/></button>
        </div>)}
      </div>
      <div className="assistant-history-note">{label("offlineNote")}</div>
    </aside>

    <section className="assistant-chat-pane" aria-label={t("title")}>
      <header className="assistant-chat-header">
        <button type="button" className="assistant-mobile-history" disabled={busy} onClick={() => setHistoryOpen(true)} aria-label={label("previous")}><MessageSquare size={18}/></button>
        <div><strong>{conversationId ? conversations.find(item => item.id === conversationId)?.title ?? t("title") : label("newChat")}</strong><small>{selectedCrop ? `${selectedCrop.crop} · ${selectedCrop.farm} · ${selectedCrop.field}` : label("general")}</small></div>
        {conversationId && <button type="button" className="assistant-delete-current" disabled={busy} onClick={() => void deleteConversation(conversationId)} aria-label={label("delete")}><Trash2 size={17}/></button>}
      </header>

      <div className="assistant-chat-messages" aria-live="polite">
        {messages.length === 0 && <div className="assistant-welcome"><span><MessageSquare size={24}/></span><h2>{t("title")}</h2><p>{label("welcome")}</p><div>{prompts.map(prompt => <button type="button" key={prompt} onClick={() => setQuestion(prompt)}>{prompt}</button>)}</div></div>}
        {messages.map((message, index) => {
          const advice = message.advice && "situation" in message.advice ? message.advice : null;
          const issue = message.advice && "onlineIssue" in message.advice ? message.advice.onlineIssue : null;
          const hindi = locale === "hi" || /[\u0900-\u097f]/u.test(message.content);
          return <article className={`assistant-message ${message.role === "USER" ? "user" : "model"}`} key={message.id}>
          <div className="assistant-bubble">
            {message.role === "USER" ? <p>{message.content}</p> : <>
              {advice ? <FarmerAdviceCard locale={locale} problem={assistantDisplayText(advice.situation)} reason={assistantDisplayText(advice.possibleCauses)} actions={advice.nextSteps.map(assistantDisplayText).filter(Boolean)} warning={assistantDisplayText(advice.expertHelp)} details={advice.details && assistantDisplayText(advice.details)}/> : <p className="assistant-answer-text">{assistantDisplayText(message.content)}</p>}
              <div className="assistant-message-tools">
                <button type="button" onClick={() => void copyMessage(message)}>{copiedId === message.id ? <Check size={15}/> : <Copy size={15}/>} {copiedId === message.id ? label("copied") : label("copy")}</button>
                {speechState?.id === message.id ? <>
                  <button type="button" onClick={() => toggleSpeech(message)}>{speechState.state === "paused" ? <Play size={15}/> : <Pause size={15}/>} {speechState.state === "paused" ? label("resume") : label("pause")}</button>
                  <button type="button" onClick={stopSpeech}><Square size={14}/> {label("stop")}</button>
                </> : <button type="button" onClick={() => speak(message)}><Volume2 size={15}/> {label("listen")}</button>}
              </div>
              {message.mode && <p className="assistant-mode-note">{message.mode === "online" ? "Gemini AI" : hindi ? "ऑफ़लाइन जानकारी" : "Offline information"}</p>}
              {issue && <div className="assistant-message-tools">
                <span role="status">{onlineUnavailableText(issue, hindi)}</span>
                {index === messages.length - 1 && <button type="button" disabled={busy} onClick={() => void retryOnline(message)}>
                  <RotateCcw size={15}/>{hindi ? "ऑनलाइन फिर कोशिश करें" : "Retry Online"}
                </button>}
              </div>}
              {message.sources?.length ? <div className="assistant-sources"><strong>{label("source")}</strong>{message.sources.filter(source => /^https?:\/\//i.test(source.url)).map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label} <ArrowUpRight aria-hidden="true" size={13}/></a>)}</div> : null}
              {advice?.followUpQuestions?.length ? <div className="assistant-followups"><span>{label("followUps")}</span>{advice.followUpQuestions.map((followup, index) => <button type="button" key={`${message.id}:${index}`} onClick={() => setQuestion(followup)}>{followup}</button>)}</div> : null}
            </>}
          </div>
        </article>; })}
        {busy && <div className="assistant-message model"><div className="assistant-bubble assistant-thinking"><span className="assistant-thinking-dot"/><span className="assistant-thinking-dot"/><span className="assistant-thinking-dot"/><span>{t("thinking")}</span></div></div>}
        <div ref={messagesEndRef}/>
      </div>

      <div className="assistant-composer-wrap">
        {error && <div className="assistant-error" role="alert"><p>{error}</p>{question.trim().length >= 5 && <button type="button" disabled={busy} onClick={() => void sendQuestion(question)}><RotateCcw size={15}/>{label("retry")}</button>}</div>}
        {cycles.length > 0 && <label className="assistant-crop-picker"><span>{label("selectCrop")}</span><select disabled={busy} value={selectedCycle} onChange={event => setSelectedCycle(event.target.value)}><option value="">{label("general")}</option>{cycles.map(item => <option key={item.id} value={item.id}>{item.crop} · {item.farm} / {item.field} · {item.season}</option>)}</select></label>}
        <form className="assistant-composer" onSubmit={submit}>
          <textarea aria-label={t("question")} rows={2} maxLength={1200} minLength={5} value={question} onChange={event => setQuestion(event.target.value)} placeholder={t("placeholder")} required/>
          <div className="assistant-composer-footer"><small>{question.length}/1,200</small><button type="submit" className="btn" disabled={busy || question.trim().length < 5}><Send size={16}/>{busy ? t("thinking") : t("ask")}</button></div>
        </form>
      </div>
    </section>
  </div>;
}
