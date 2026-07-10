// server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import assistantRoutes from "./routes/assistant.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json({ limit: "2mb" })); // page text can be sizeable
app.use(
  cors({
    origin: "*",  // Chrome extensions send requests from chrome-extension:// origin
    methods: ["GET", "POST"],
  })
);

// Basic abuse protection — Gemini calls cost money/quota per request.
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use("/api", assistantRoutes);

app.get("/", (_req, res) => {
  res.json({ name: "Jarvis AI Companion backend", status: "running" });
});

// Health check — used by the popup to show Online/Offline status
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", model: process.env.OLLAMA_MODEL || "llama3.2:1b" });
});

// Centralized error handler for anything that slips past route-level try/catch
app.use((err, _req, res, _next) => {
  console.error("[server] unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`[jarvis-backend] listening on http://localhost:${PORT}`);
});
