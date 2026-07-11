// useSpeechRecognition.js — dual-recognizer approach:
//
//   1. WAKE-WORD recognizer (always-on, en-US, runs in the background)
//      Listens for "Hey Jarvis" (or locale-specific variants) and
//      auto-activates the main mic without any button press.
//
//   2. MAIN recognizer (user-lang, button or wake-word triggered)
//      The normal speech-to-command pipeline.
//
// KEY FIX: listeningRef tracks user-intent so onend never auto-restarts
// after an explicit stop(). Wake recognizer restarts itself silently.

import { useEffect, useRef, useState, useCallback } from "react";
import { storageGet, storageSet } from "../../shared/storage";
import { getLang, LANGUAGES } from "../lib/languages";

const SpeechRecognitionImpl =
  typeof window !== "undefined" &&
  (window.SpeechRecognition || window.webkitSpeechRecognition);

// Flatten all wake words across all languages into one lowercase set
// (we use en-US for the wake recognizer so English phrases always work;
//  the user's native-language wake words are also included here)
function buildWakeSet(currentLangCode) {
  const english = getLang("en-US").wakeWords;
  const native  = getLang(currentLangCode)?.wakeWords || [];
  return new Set([...english, ...native].map((w) => w.toLowerCase()));
}

export function useSpeechRecognition({ onTranscript, onWakeWord } = {}) {
  const [listening, setListening] = useState(false);
  const [wakeListening, setWakeListening]   = useState(false);   // always-on indicator
  const [lang, setLang]           = useState("en-US");
  const [alwaysOnEnabled, setAlwaysOnEnabled] = useState(true);  // user toggle

  const recognitionRef        = useRef(null);
  const wakeRecognitionRef    = useRef(null);
  const listeningRef          = useRef(false); // user wants main mic ON
  const wakeEnabledRef        = useRef(true);  // shadow of alwaysOnEnabled
  const langRef               = useRef("en-US");
  const onTranscriptRef       = useRef(onTranscript);
  const onWakeWordRef         = useRef(onWakeWord);
  onTranscriptRef.current     = onTranscript;
  onWakeWordRef.current       = onWakeWord;
  langRef.current             = lang;

  // ── Load persisted settings ──
  useEffect(() => {
    storageGet(["jarvisLang", "jarvisAlwaysOn"]).then((res) => {
      if (res.jarvisLang)    setLang(res.jarvisLang);
      const ao = res.jarvisAlwaysOn !== false; // default true
      setAlwaysOnEnabled(ao);
      wakeEnabledRef.current = ao;
    });
  }, []);

  // ── MAIN recognizer — re-created whenever lang changes ──
  useEffect(() => {
    if (!SpeechRecognitionImpl) return undefined;

    const recognition = new SpeechRecognitionImpl();
    recognition.continuous     = true;
    recognition.interimResults = false;
    recognition.lang           = lang;
    recognitionRef.current     = recognition;

    recognition.onstart = () => setListening(true);

    recognition.onresult = (event) => {
      const t = event.results[event.resultIndex][0].transcript.trim();
      if (t) onTranscriptRef.current?.(t);
    };

    recognition.onend = () => {
      setListening(false);
      if (listeningRef.current) {
        // Chrome kills recognition after ~60 s silence — restart it.
        setTimeout(() => {
          if (listeningRef.current && recognitionRef.current === recognition) {
            try { recognition.start(); } catch { /* already started */ }
          }
        }, 300);
      }
    };

    recognition.onerror = (e) => {
      console.warn("[Jarvis mic] error:", e.error);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        listeningRef.current = false;
        setListening(false);
      } else if (e.error === "no-speech" || e.error === "audio-capture") {
        setListening(false);
      }
    };

    return () => {
      listeningRef.current = false;
      recognition.onend   = null;
      recognition.onerror = null;
      try { recognition.stop(); } catch { /* ignore */ }
      if (recognitionRef.current === recognition) recognitionRef.current = null;
    };
  }, [lang]);

  // ── WAKE-WORD recognizer — always-on, en-US ──
  useEffect(() => {
    if (!SpeechRecognitionImpl) return undefined;

    let wakeRec = null;
    let destroyed = false;

    function startWake() {
      if (destroyed || !wakeEnabledRef.current) return;
      if (listeningRef.current) {
        // Main mic is already on — don't run wake recognizer at the same time
        setTimeout(startWake, 2000);
        return;
      }

      wakeRec = new SpeechRecognitionImpl();
      wakeRec.continuous     = false; // single result, then restart
      wakeRec.interimResults = false;
      wakeRec.lang           = "en-US"; // wake word in English (most reliable)
      wakeRecognitionRef.current = wakeRec;

      wakeRec.onstart = () => { if (!destroyed) setWakeListening(true); };

      wakeRec.onresult = (event) => {
        const transcript = event.results[0][0].transcript.trim().toLowerCase();
        const wakeSet    = buildWakeSet(langRef.current);

        const triggered = [...wakeSet].some((w) => transcript.includes(w));
        if (triggered) {
          console.log("[Jarvis wake] Wake word detected:", transcript);
          onWakeWordRef.current?.();
          // hand off to main mic immediately
          listeningRef.current = true;
          try { recognitionRef.current?.start(); } catch { /* ignore */ }
        }
      };

      wakeRec.onend = () => {
        if (destroyed) return;
        setWakeListening(false);
        // Restart after a short gap
        if (!listeningRef.current) {
          setTimeout(() => { if (!destroyed) startWake(); }, 400);
        } else {
          // Main mic took over — restart wake rec later when main mic stops
          setTimeout(() => { if (!destroyed) startWake(); }, 3000);
        }
      };

      wakeRec.onerror = (e) => {
        if (destroyed) return;
        setWakeListening(false);
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          // Microphone denied — disable always-on quietly
          wakeEnabledRef.current = false;
          setAlwaysOnEnabled(false);
          return;
        }
        // Transient error — retry
        setTimeout(() => { if (!destroyed) startWake(); }, 800);
      };

      try { wakeRec.start(); } catch { /* already running */ }
    }

    if (wakeEnabledRef.current) startWake();

    return () => {
      destroyed = true;
      setWakeListening(false);
      if (wakeRec) {
        wakeRec.onend   = null;
        wakeRec.onerror = null;
        try { wakeRec.stop(); } catch { /* ignore */ }
      }
      wakeRecognitionRef.current = null;
    };
    // Re-create if alwaysOnEnabled changes (but NOT on lang change — wake rec is always en-US)
  }, [alwaysOnEnabled]);

  // ── Controls ──

  const start = useCallback(() => {
    if (listeningRef.current) return;
    listeningRef.current = true;
    try { recognitionRef.current?.start(); } catch { /* already listening */ }
  }, []);

  const stop = useCallback(() => {
    if (!listeningRef.current) return;
    listeningRef.current = false;
    setListening(false);
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
  }, []);

  const switchLanguage = useCallback(async (nextLang) => {
    const wasListening = listeningRef.current;
    listeningRef.current = false;
    setListening(false);
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    await storageSet({ jarvisLang: nextLang });
    langRef.current = nextLang;
    setLang(nextLang);
    if (wasListening) {
      setTimeout(() => {
        listeningRef.current = true;
        try { recognitionRef.current?.start(); } catch { /* ignore */ }
      }, 500);
    }
  }, []);

  const toggleAlwaysOn = useCallback(async () => {
    const next = !wakeEnabledRef.current;
    wakeEnabledRef.current = next;
    await storageSet({ jarvisAlwaysOn: next });
    setAlwaysOnEnabled(next);
    if (!next && wakeRecognitionRef.current) {
      try { wakeRecognitionRef.current.stop(); } catch { /* ignore */ }
    }
  }, []);

  return {
    supported:       Boolean(SpeechRecognitionImpl),
    listening,
    wakeListening,
    alwaysOnEnabled,
    lang,
    start,
    stop,
    switchLanguage,
    toggleAlwaysOn,
  };
}
