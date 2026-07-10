import React, { useEffect, useRef } from "react";

export default function ChatHistory({ history, busy }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history.length, busy]);

  if (history.length === 0 && !busy) {
    return (
      <div className="jarvis-chat jarvis-chat--empty">
        <p>Ask me to summarize this page, explain a paragraph, or read it aloud.</p>
        <p className="jarvis-chat--hint">Try: "Summarize this page" or "Explain this article"</p>
      </div>
    );
  }

  return (
    <div className="jarvis-chat">
      {history.map((turn, i) => (
        <div key={i} className={`jarvis-bubble jarvis-bubble--${turn.role}`}>
          <span className="jarvis-bubble__label">{turn.role === "user" ? "You" : "Jarvis"}</span>
          <p>{turn.content}</p>
        </div>
      ))}
      {busy && (
        <div className="jarvis-bubble jarvis-bubble--assistant jarvis-bubble--thinking">
          <span className="jarvis-bubble__label">Jarvis</span>
          <span className="jarvis-thinking-dots">
            <span />
            <span />
            <span />
          </span>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
