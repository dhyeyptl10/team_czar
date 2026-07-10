// useSpeechRecognition.js — clean, simple, button-only mic control.
// No wake word. One recognizer. No conflicts.

import { useEffect, useRef, useState, useCallback } from "react";
import { storageGet, storageSet } from "../../shared/storage";

const SpeechRecognitionImpl =
  typeof window !== "undefined" &&
  (window.SpeechRecognition || window.webkitSpeechRecognition);

export function useSpeechRecognition({ onTranscript } = {}) {
  const [listening, setListening] = useState(false);
  const [lang, setLang]           = useState("en-US");

  const recognitionRef  = useRef(null);
  const stoppingRef     = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  // Load persisted language preference
  useEffect(() => {
    storageGet("jarvisLang").then(({ jarvisLang }) => {
      setLang(jarvisLang || "en-US");
    });
  }, []);

  useEffect(() => {
    if (!SpeechRecognitionImpl) return undefined;

    const recognition = new SpeechRecognitionImpl();
    recognition.continuous     = true;
    recognition.interimResults = false;
    recognition.lang           = lang;
    recognitionRef.current     = recognition;

    recognition.onstart = () => setListening(true);

    recognition.onresult = (event) => {
      const t = event.results[event.resultIndex][0].transcript.trim().toLowerCase();
      onTranscriptRef.current?.(t);
    };

    // Auto-restart so mic stays alive after browser cuts it off
    recognition.onend = () => {
      setListening(false);
      if (!stoppingRef.current) {
        setTimeout(() => {
          try { recognition.start(); } catch { /* already started */ }
        }, 500);
      }
    };

    recognition.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        stoppingRef.current = true;
        setListening(false);
      }
    };

    return () => {
      stoppingRef.current = true;
      recognition.onend = null;
      try { recognition.stop(); } catch { /* ignore */ }
    };
  }, [lang]);

  const start = useCallback(() => {
    stoppingRef.current = false;
    try { recognitionRef.current?.start(); } catch { /* already listening */ }
  }, []);

  const stop = useCallback(() => {
    stoppingRef.current = true;
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
  }, []);

  const switchLanguage = useCallback(async (nextLang) => {
    await storageSet({ jarvisLang: nextLang });
    setLang(nextLang);
  }, []);

  return { supported: Boolean(SpeechRecognitionImpl), listening, lang, start, stop, switchLanguage };
}
