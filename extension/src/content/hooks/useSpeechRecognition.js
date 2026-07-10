// useSpeechRecognition.js
//
// React-ified speech recognition:
//   - continuous + auto-restart-on-end behaviour
//   - en-US / hi-IN language toggle stored via chrome.storage.local
//   - onTranscript callback receives the recognized transcript

import { useEffect, useRef, useState, useCallback } from "react";
import { storageGet, storageSet } from "../../shared/storage";

const SpeechRecognitionImpl =
  typeof window !== "undefined" &&
  (window.SpeechRecognition || window.webkitSpeechRecognition);

export function useSpeechRecognition({ onTranscript } = {}) {
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState("en-US");
  const recognitionRef = useRef(null);
  const stoppingRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  // load persisted language preference
  useEffect(() => {
    storageGet("jarvisLang").then(({ jarvisLang }) => {
      setLang(jarvisLang || "en-US");
    });
  }, []);

  useEffect(() => {
    if (!SpeechRecognitionImpl) return undefined;

    const recognition = new SpeechRecognitionImpl();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = lang;
    recognitionRef.current = recognition;

    recognition.onstart = () => setListening(true);

    recognition.onresult = (event) => {
      const current = event.resultIndex;
      const transcript = event.results[current][0].transcript.trim().toLowerCase();
      onTranscriptRef.current?.(transcript);
    };

    // Auto-restart: browsers stop the recognizer periodically even in
    // "continuous" mode, so we restart unless the user explicitly stopped it.
    recognition.onend = () => {
      setListening(false);
      if (!stoppingRef.current) {
        setTimeout(() => {
          try {
            recognition.start();
          } catch {
            /* already started — ignore */
          }
        }, 500);
      }
    };

    recognition.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        stoppingRef.current = true;
      }
    };

    return () => {
      stoppingRef.current = true;
      recognition.onend = null;
      recognition.stop();
    };
  }, [lang]);

  const start = useCallback(() => {
    stoppingRef.current = false;
    try {
      recognitionRef.current?.start();
    } catch {
      /* already listening — ignore */
    }
  }, []);

  const stop = useCallback(() => {
    stoppingRef.current = true;
    recognitionRef.current?.stop();
  }, []);

  const switchLanguage = useCallback(async (nextLang) => {
    await storageSet({ jarvisLang: nextLang });
    setLang(nextLang);
  }, []);

  return {
    supported: Boolean(SpeechRecognitionImpl),
    listening,
    lang,
    start,
    stop,
    switchLanguage,
  };
}
