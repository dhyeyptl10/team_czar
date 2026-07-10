# Jarvis AI Browser Companion

An intelligent Chrome extension that acts as a personal AI reading assistant on any webpage. Powered by a local Ollama (`llama3.2:1b`) backend — fully offline, 100% private, no cloud API keys needed.

Ask it to summarize, explain a paragraph, explain code, translate text to English, or just talk to it about the page. It reads answers back out loud, and remembers where you left off.

---

## What's inside

```
jarvis-ai-companion/
├── extension/              Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── background.js       Service worker: keyboard shortcut, backend relay
│   ├── icons/
│   ├── src/
│   │   ├── content/        Content script: floating button, panel, voice logic
│   │   │   ├── index.jsx         entry — Shadow DOM mount, selection toolbar
│   │   │   ├── Panel.jsx         main chat/voice UI
│   │   │   ├── content.css       dark glassmorphism theme
│   │   │   ├── components/       VoiceOrb, ChatHistory, Controls, SelectionToolbar
│   │   │   ├── hooks/            useSpeechRecognition, useSpeechSynthesis
│   │   │   └── lib/              extractContent (Readability), api, voiceCommands
│   │   ├── popup/          Toolbar popup (quick open + backend URL setting)
│   │   └── shared/         chrome.storage.local helpers
│   ├── vite.content.config.js
│   ├── vite.popup.config.js
│   └── package.json
└── backend/                Node/Express server
    ├── server.js
    ├── routes/assistant.js /api/assistant, /api/translate, /api/health
    ├── services/ollama.js      Ollama local API wrapper
    ├── services/promptBuilder.js page-grounded prompt construction
    ├── .env.example
    └── package.json
```

## How it works

1. **Content extraction** (`lib/extractContent.js`) runs Mozilla's **Readability** (the Firefox Reader View library) against a clone of the page's DOM, stripping navbars, footers, ads, and cookie banners, and splitting the result into paragraphs and code blocks.
2. The extracted content, the user's message, and the running conversation are sent to the backend, which builds a prompt that instructs your local **Ollama** model to answer **only** from the page content (`services/promptBuilder.js`).
3. Conversation history and reading progress are saved per-page-URL in `chrome.storage.local` (`shared/storage.js`), so re-opening the same article resumes the conversation and reading position.
4. Voice commands ("summarize", "read this page", "explain this paragraph", "explain this code", "continue reading", "repeat", "stop reading", "pause", "resume", "read important points", "what does this mean?", "translate this") are matched in `lib/voiceCommands.js` and handled in `Panel.jsx`.

## Message passing (background ↔ content script)

- `Ctrl+Shift+J` → `chrome.commands` fires in `background.js` → `chrome.tabs.sendMessage(tabId, { type: "JARVIS_TOGGLE_PANEL" })` → `content/index.jsx` toggles the panel.
- The panel calls the backend via `chrome.runtime.sendMessage({ type: "JARVIS_API_REQUEST", path, payload })`, which `background.js` relays with `fetch()` — keeping the backend URL in one place and avoiding page-level CSP/CORS issues that a direct content-script `fetch()` could hit.

---

## Installation

### 1. Prerequisites (Ollama)

You need to have [Ollama](https://ollama.com/) installed on your machine and the `llama3.2:1b` model downloaded.

```bash
# Pull the model
ollama run llama3.2:1b
```

### 2. Backend

```bash
cd backend
npm install
npm start
# → Jarvis backend listening on http://localhost:5000
```

### 3. Extension

```bash
cd extension
npm install
npm run build
```

This produces `extension/dist/content.js`, `content.css`, and `popup.html` next to `manifest.json`.

Then, in Chrome:

1. Go to `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `extension/` folder (the one containing `manifest.json`).
4. Open any article or docs page and press **Ctrl+Shift+J** (or click the toolbar icon → "Open Jarvis on this page").

If your backend isn't running on `http://localhost:5000`, open the toolbar popup and update the **Backend URL** field.

### Rebuilding during development

```bash
npm run dev:content   # rebuilds dist/content.js on change
npm run dev:popup     # rebuilds dist/popup.html on change
```

Reload the extension from `chrome://extensions` after each content-script rebuild (Chrome doesn't hot-reload content scripts).

---

## Environment variables (backend/.env)

| Variable          | Description                                   |
|-------------------|------------------------------------------------|
| `OLLAMA_URL`      | Ollama host, defaults to `http://localhost:11434` |
| `OLLAMA_MODEL`    | Model name, defaults to `llama3.2:1b`             |
| `PORT`            | Server port, defaults to `5000`                 |
| `CORS_ORIGIN`     | Allowed origin(s), `*` for local development    |

---

## Known limitations / next steps

- All data stays local to `chrome.storage.local` and your own machine. Nothing is sent to the cloud.
- The floating button and panel render inside a single Shadow DOM root (`#jarvis-ai-companion-host`), so the host page's CSS can never leak in or be leaked onto — you can safely load this on any site.
