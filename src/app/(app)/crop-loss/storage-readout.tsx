"use client";

import { useEffect, useRef, useState } from "react";

export function StorageReadout({
  text,
  locale,
}: {
  text: string;
  locale: string;
}) {
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(
    () => () => {
      if (utterance.current) window.speechSynthesis.cancel();
    },
    [],
  );

  function toggle() {
    if (
      !("speechSynthesis" in window) ||
      typeof SpeechSynthesisUtterance !== "function"
    ) {
      setUnavailable(true);
      return;
    }
    if (utterance.current) {
      utterance.current = null;
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = locale.includes("-") ? locale : `${locale}-IN`;
    const prefix = speech.lang.split("-")[0].toLowerCase();
    const voice = window.speechSynthesis
      .getVoices()
      .find((item) => item.lang.split("-")[0].toLowerCase() === prefix);
    if (voice) speech.voice = voice;
    const finish = () => {
      if (utterance.current !== speech) return;
      utterance.current = null;
      setSpeaking(false);
    };
    speech.onend = finish;
    speech.onerror = finish;
    utterance.current = speech;
    setSpeaking(true);
    window.speechSynthesis.speak(speech);
  }

  return (
    <>
      <button className="btn btn-secondary" type="button" onClick={toggle}>
        {speaking ? "Stop reading" : "Read storage risk aloud"}
      </button>
      {unavailable && (
        <p role="status">This browser does not support voice read-out.</p>
      )}
    </>
  );
}
