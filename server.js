// Acebot — backend.
// Serves the built dashboard and proxies Anthropic calls so the API key stays server-side.
//
// The proxy is carried over from Bob the Builder largely unchanged: it was the one piece of that
// codebase worth keeping wholesale. Two problems it solves that are easy to hit and hard to debug:
//   1. A generation can run 1-3 minutes. A reverse proxy in front of this app (nginx defaults to
//      proxy_read_timeout 60s) returns 504 during that silence. So after a 20s grace period we start
//      writing keep-alive whitespace every 15s -- each byte resets the proxy's read timer. JSON.parse
//      ignores leading whitespace, so the client never notices.
//   2. Node's fetch (undici) aborts a request whose response HEADERS take longer than ~5 minutes. A
//      non-streaming call sends no bytes until the whole completion is done, so large generations
//      threw a generic "fetch failed". We request stream:true, consume the SSE, and reassemble a
//      normal non-streaming response shape -- the socket is never idle and the client is unchanged.

import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "32mb" })); // room for base64 knowledge-base uploads

const PORT = process.env.PORT || 3000;
const GENERATOR_MODEL = process.env.GENERATOR_MODEL || "claude-sonnet-5";

// Tolerate the usual paste mistakes: wrapping quotes, stray whitespace.
let ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
if ((ANTHROPIC_API_KEY.startsWith('"') && ANTHROPIC_API_KEY.endsWith('"')) ||
    (ANTHROPIC_API_KEY.startsWith("'") && ANTHROPIC_API_KEY.endsWith("'"))) {
  ANTHROPIC_API_KEY = ANTHROPIC_API_KEY.slice(1, -1).trim();
}

// ── Golden rules ──────────────────────────────────────────────────────────────
// The platform rules are pasted verbatim into every generated prompt, and the method doc is the
// generator's own brain. Both are read from disk on each request so editing the markdown changes
// every subsequent generation with no rebuild -- that is the point of the platform/use-case split.
function readDoc(name) {
  try {
    return fs.readFileSync(path.join(__dirname, "docs", name), "utf8");
  } catch (e) {
    console.error(`[acebot] could not read docs/${name}:`, e.message);
    return "";
  }
}

app.get("/api/rules", (req, res) => {
  const platform = readDoc("platform-rules.md");
  const method = readDoc("prompt-structure.md");
  res.json({
    ok: !!platform && !!method,
    platform,
    methodChars: method.length,
    platformChars: platform.length,
  });
});

app.get("/api/health", (req, res) => res.json({
  ok: true,
  anthropic: !!ANTHROPIC_API_KEY,
  model: GENERATOR_MODEL,
  rules: !!readDoc("platform-rules.md"),
  cli: true,
}));

// ── Generate via the local Claude Code CLI ───────────────────────────────────
// The CLI holds the user's own subscription credentials, so a generation started here is
// billed to their Claude usage — no ANTHROPIC_API_KEY, and nothing to paste into a chat.
// We shell out rather than call the API because the OAuth token is passed to the CLI on a
// file descriptor and is deliberately not readable as an environment variable.
import { spawn } from "node:child_process";

const CLI = process.env.CLAUDE_CLI || "claude";

function cliAvailable() {
  return new Promise(resolve => {
    const p = spawn(CLI, ["--version"], { stdio: "ignore" });
    p.on("error", () => resolve(false));
    p.on("close", code => resolve(code === 0));
  });
}

app.get("/api/generate/available", async (req, res) =>
  res.json({ cli: await cliAvailable(), key: !!ANTHROPIC_API_KEY }));

app.post("/api/generate", async (req, res) => {
  const { system, message } = req.body || {};
  if (!system || !message) {
    return res.status(400).json({ error: "system and message are both required" });
  }
  if (!(await cliAvailable())) {
    return res.status(503).json({
      error: "The Claude Code CLI was not found. Install it, or set ANTHROPIC_API_KEY and use /api/anthropic.",
    });
  }

  // Keep the socket alive: a full prompt takes well over a minute and proxies cut idle connections.
  res.writeHead(200, {
    "content-type": "application/json",
    "cache-control": "no-store",
    "x-accel-buffering": "no",
  });
  const beat = setInterval(() => { try { res.write(" "); } catch {} }, 12000);

  const args = [
    "-p",
    "--output-format", "json",
    "--model", GENERATOR_MODEL,
    "--append-system-prompt", system,
    "--allowed-tools", "",          // generation only; the CLI must not touch the filesystem
    "--permission-mode", "default",
  ];
  const child = spawn(CLI, args, { stdio: ["pipe", "pipe", "pipe"] });
  let out = "", err = "";
  child.stdout.on("data", d => { out += d; });
  child.stderr.on("data", d => { err += d; });
  child.stdin.end(message);

  const kill = setTimeout(() => child.kill("SIGKILL"), 10 * 60 * 1000);

  child.on("error", e => {
    clearInterval(beat); clearTimeout(kill);
    res.end(JSON.stringify({ error: "Could not start the CLI: " + e.message }));
  });

  child.on("close", code => {
    clearInterval(beat); clearTimeout(kill);
    if (code !== 0) {
      return res.end(JSON.stringify({ error: (err || "the CLI exited with code " + code).slice(0, 800) }));
    }
    let prompt = "";
    try {
      const j = JSON.parse(out);
      prompt = typeof j.result === "string" ? j.result : (j.result?.content?.[0]?.text || "");
    } catch {
      prompt = out;   // not JSON — hand back whatever came out rather than losing the work
    }
    if (!prompt.trim()) {
      return res.end(JSON.stringify({ error: "The CLI returned nothing." }));
    }
    res.end(JSON.stringify({ prompt: prompt.trim(), via: "cli" }));
  });
});

// ── Anthropic proxy ───────────────────────────────────────────────────────────
app.post("/api/anthropic", async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: { type: "config_error", message: "ANTHROPIC_API_KEY is not set on the server. Paste your key into .env and restart." },
    });
  }

  let heartbeat = null;
  let streaming = false;
  const beginStream = () => {
    if (streaming || res.headersSent) return;
    streaming = true;
    res.status(200).type("application/json");
    res.write(" ");
    heartbeat = setInterval(() => { try { res.write(" "); } catch {} }, 15000);
  };
  const slowTimer = setTimeout(beginStream, 20000);
  const cleanup = () => { clearTimeout(slowTimer); if (heartbeat) clearInterval(heartbeat); };

  const callUpstream = async () => {
    const body = { ...(req.body || {}), stream: true };
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    // Errors come back as ordinary JSON, not SSE -- pass them through untouched.
    if (!upstream.ok) return { status: upstream.status, text: await upstream.text() };

    let text = "", stopReason = null, usage = null, model = body.model, streamErr = null, buf = "";
    const decoder = new TextDecoder();
    // getReader() rather than `for await` so this behaves the same on every Node version.
    const reader = upstream.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let ev; try { ev = JSON.parse(payload); } catch { continue; }
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") text += ev.delta.text || "";
        else if (ev.type === "message_delta") { if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason; if (ev.usage) usage = ev.usage; }
        else if (ev.type === "message_start" && ev.message) { model = ev.message.model || model; usage = ev.message.usage || usage; }
        else if (ev.type === "error") streamErr = ev.error || { type: "api_error", message: "stream error" };
      }
    }
    if (streamErr) return { status: 502, text: JSON.stringify({ error: streamErr }) };
    return { status: 200, text: JSON.stringify({ type: "message", role: "assistant", model, content: [{ type: "text", text }], stop_reason: stopReason, usage }) };
  };

  try {
    const RETRYABLE = new Set([429, 500, 502, 503, 504, 529]);
    const MAX_TRIES = 5;
    let result, lastErr = null;
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      try {
        result = await callUpstream();
        lastErr = null;
        if (!RETRYABLE.has(result.status) || attempt === MAX_TRIES) break;
        console.warn(`[acebot] upstream ${result.status} — retry ${attempt}/${MAX_TRIES - 1}`);
      } catch (err) {
        lastErr = err;
        const why = err?.cause?.code || err?.cause?.message || err?.code || err?.message;
        console.warn(`[acebot] upstream network error (${why}) — attempt ${attempt}/${MAX_TRIES}`);
        if (attempt === MAX_TRIES) break;
      }
      if (res.writableEnded || res.destroyed) return cleanup(); // client gave up
      await new Promise(r => setTimeout(r, Math.min(1500 * Math.pow(2, attempt - 1), 30000)));
    }
    if (lastErr) throw lastErr;
    cleanup();
    if (streaming) { res.write(result.text); res.end(); }
    else res.status(result.status).type("application/json").send(result.text);
  } catch (e) {
    cleanup();
    const why = e?.cause?.code || e?.cause?.message || e?.code || e?.message || "unknown";
    console.error("[acebot] Anthropic call failed:", why);
    const errBody = { error: { type: "upstream_error", message: "Failed to reach Anthropic: " + why } };
    if (streaming) { try { res.write(JSON.stringify(errBody)); } catch {} res.end(); }
    else res.status(502).json(errBody);
  }
});

// ── Static frontend ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "dist")));
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`[acebot] listening on http://0.0.0.0:${PORT}`);
  console.log(`[acebot] anthropic key ${ANTHROPIC_API_KEY ? "configured" : "MISSING — set ANTHROPIC_API_KEY in .env"}`);
  console.log(`[acebot] platform rules ${readDoc("platform-rules.md") ? "loaded" : "MISSING — docs/platform-rules.md"}`);
});
