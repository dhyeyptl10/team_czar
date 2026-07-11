// useSpeechSynthesis.js
//
// Builds on the original readOut()/readOutHindi() helpers from app.js
// (a fresh SpeechSynthesisUtterance per call, speech.volume = 1, optional
// speech.lang = "hi-IN") and adds what the upgrade needs:
//   - pause / resume / stop / repeat / "continue reading" across a queue of
//     paragraphs (so "read this page" can move paragraph by paragraph)
//   - natural interruption: calling speak() again — or the user saying
//     "stop reading" — cancels whatever is currently being said instead of
//     queuing behind it, so the assistant never talks over itself
//   - onBoundary-driven callback so the panel can highlight the paragraph
//     currently being read aloud

import { useCallback, useRef, useState } from "react";

function pickVoice(lang) {
  if (!lang || typeof window === "undefined") return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const langLower  = lang.toLowerCase();
  const langPrefix = langLower.split("-")[0]; // e.g. "hi" from "hi-IN"

  // 1. Exact match (e.g. "hi-IN")
  let voice = voices.find((v) => v.lang.toLowerCase() === langLower);
  // 2. Prefix match (e.g. any "hi-*" voice)
  if (!voice) voice = voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix));
  // 3. First voice that contains the prefix anywhere
  if (!voice) voice = voices.find((v) => v.lang.toLowerCase().includes(langPrefix));

  return voice || null;
}

export function useSpeechSynthesis({ onParagraphChange } = {}) {
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const queueRef = useRef([]); // remaining paragraphs to read
  const indexRef = useRef(0);
  const lastTextRef = useRef(""); // for "repeat"
  const onParagraphChangeRef = useRef(onParagraphChange);
  onParagraphChangeRef.current = onParagraphChange;

  const speakOne = useCallback((text, lang) => {
    return new Promise((resolve) => {
      const utter = new SpeechSynthesisUtterance();
      utter.text = text;
      utter.volume = 1;
      if (lang) {
        utter.lang = lang;
        const voice = pickVoice(lang);
        if (voice) utter.voice = voice;
      }

      utter.onstart = () => setSpeaking(true);
      utter.onend = () => {
        setSpeaking(false);
        resolve();
      };
      utter.onerror = () => {
        setSpeaking(false);
        resolve();
      };

      lastTextRef.current = text;
      window.speechSynthesis.speak(utter);
    });
  }, []);

  /** Speak a single, one-off message (e.g. assistant chat replies, confirmations). */
  const say = useCallback(
    (text, lang) => {
      window.speechSynthesis.cancel(); // interrupt whatever was playing
      setPaused(false);
      return speakOne(text, lang);
    },
    [speakOne]
  );

  /** Start reading a list of paragraphs from the beginning (or resume index). */
  const readParagraphs = useCallback(
    async (paragraphs, { fromIndex = 0, lang } = {}) => {
      window.speechSynthesis.cancel();
      setPaused(false);
      queueRef.current = paragraphs;
      indexRef.current = fromIndex;

      while (indexRef.current < queueRef.current.length) {
        const i = indexRef.current;
        onParagraphChangeRef.current?.(i);
        // eslint-disable-next-line no-await-in-loop
        await speakOne(queueRef.current[i], lang);
        // if the queue was cleared (stop) or we were paused mid-way, bail
        if (queueRef.current.length === 0) return;
        indexRef.current += 1;
      }
    },
    [speakOne]
  );

  const pause = useCallback(() => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      setPaused(true);
    }
  }, []);

  const resume = useCallback(() => {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setPaused(false);
    }
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    queueRef.current = [];
    setSpeaking(false);
    setPaused(false);
  }, []);

  const repeat = useCallback(
    (lang) => {
      if (lastTextRef.current) return say(lastTextRef.current, lang);
      return Promise.resolve();
    },
    [say]
  );

  const continueReading = useCallback(
    (lang) => {
      if (indexRef.current < queueRef.current.length - 1) {
        return readParagraphs(queueRef.current, { fromIndex: indexRef.current + 1, lang });
      }
      return Promise.resolve();
    },
    [readParagraphs]
  );

  const skip = useCallback(() => {
    window.speechSynthesis.cancel();
  }, []);

  return {
    speaking,
    paused,
    say,
    readParagraphs,
    pause,
    resume,
    stop,
    repeat,
    continueReading,
    skip,
    currentParagraphIndex: indexRef,
  };
}
