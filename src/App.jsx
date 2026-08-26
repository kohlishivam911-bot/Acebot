import { useState, useEffect, useRef } from "react";
import { TOOLS, INDUSTRIES, LANGUAGES, buildSystemPrompt, buildUserMessage, estimateTokens } from "./generator.js";

/* ═══════════════ knowledge-base file reading ═══════════════ */

// PDFs and images go to the model as native blocks. DOCX has to be unzipped first: it is a zip whose
// word/document.xml holds the text. DecompressionStream handles the deflate without a dependency.
async function readDocx(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer);
  for (let i = 0; i < buf.length - 4; i++) {
    if (dv.getUint32(i, true) !== 0x04034b50) continue;          // local file header
    const method = dv.getUint16(i + 8, true);
    const compSize = dv.getUint32(i + 18, true);
    const nameLen = dv.getUint16(i + 26, true);
    const extraLen = dv.getUint16(i + 28, true);
    const nameStart = i + 30;
    const name = new TextDecoder().decode(buf.slice(nameStart, nameStart + nameLen));
    if (name !== "word/document.xml") continue;
    const dataStart = nameStart + nameLen + extraLen;
    const raw = buf.slice(dataStart, dataStart + compSize);
    let xmlBytes = raw;
    if (method === 8) {
      const ds = new DecompressionStream("deflate-raw");
      xmlBytes = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer());
    }
    const xml = new TextDecoder().decode(xmlBytes);
    return xml
      .replace(/<w:p[ >][\s\S]*?(?=<w:p[ >]|$)/g, (m) => m + "\n")
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  throw new Error("could not find document text inside the .docx");
}

const b64 = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(",")[1]);
  r.onerror = rej;
  r.readAsDataURL(file);
});

async function readKbFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "pdf") return { kind: "pdf", name: file.name, data: await b64(file) };
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
    const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
    return { kind: "image", name: file.name, mime, data: await b64(file) };
  }
  if (ext === "docx") return { kind: "text", name: file.name, text: await readDocx(file) };
  if (["txt", "md", "csv"].includes(ext)) return { kind: "text", name: file.name, text: await file.text() };
  if (ext === "doc") throw new Error("legacy .doc is not readable — save it as .docx or PDF");
  throw new Error(`unsupported file type .${ext}`);
}

/* ═══════════════ resilient fetch ═══════════════ */

async function callClaude(body, onRetry, useCli) {
  const RETRYABLE = new Set([429, 500, 502, 503, 504, 529]);
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await fetch(useCli ? "/api/generate" : "/api/anthropic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(useCli
          // The CLI endpoint takes a flat system + message pair, not the Messages API shape.
          ? { system: body.system, message: body.messages[0].content.map(c => c.text || "").join("\n\n") }
          : body),
      });
      if (!r.ok && RETRYABLE.has(r.status) && attempt < 4) {
        onRetry?.(attempt);
        await new Promise(res => setTimeout(res, 1500 * 2 ** (attempt - 1)));
        continue;
      }
      const data = await r.json();
      if (data.error) throw new Error(data.error.message || data.error || "generation failed");
      return useCli ? (data.prompt || "") : (data.content?.[0]?.text || "");
    } catch (e) {
      if (attempt === 4) throw e;
      onRetry?.(attempt);
      await new Promise(res => setTimeout(res, 1500 * 2 ** (attempt - 1)));
    }
  }
}

/* ═══════════════ styles ═══════════════ */

const C = {
  bg: "#F7F7F5", surface: "#FFFFFF", surface2: "#EFEFEC",
  ink: "#16181D", ink2: "#3A3F49", muted: "#5E6470",
  line: "#DCDCD6", line2: "#C9C9C2",
  accent: "#9C6414", accentSoft: "#F5E7D0",
  teal: "#1B635F", clay: "#97392F",
};
const mono = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
const sans = "'Archivo', 'Helvetica Neue', Arial, sans-serif";

const label = { fontFamily: mono, fontSize: 10, fontWeight: 600, letterSpacing: ".11em", textTransform: "uppercase", color: C.muted, display: "block", marginBottom: 7 };
const input = { width: "100%", padding: "9px 11px", borderRadius: 5, border: `1px solid ${C.line}`, background: C.surface, color: C.ink, fontSize: 14, fontFamily: sans, outline: "none", boxSizing: "border-box" };
const card = { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 6, padding: 20, marginBottom: 16 };

function Field({ children, label: l, hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <span style={label}>{l}</span>
      {children}
      {hint && <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}

function Chip({ on, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 12px", borderRadius: 4, cursor: "pointer", fontFamily: sans,
      fontSize: 13, fontWeight: on ? 600 : 500,
      border: `1px solid ${on ? C.accent : C.line}`,
      background: on ? C.accentSoft : C.surface,
      color: on ? C.accent : C.ink2, transition: ".12s",
    }}>{children}</button>
  );
}

/* ═══════════════ app ═══════════════ */

export default function App() {
  const [health, setHealth] = useState(null);
  const [platform, setPlatform] = useState("");

  const [client, setClient] = useState("");
  const [industry, setIndustry] = useState("Healthcare");
  const [direction, setDirection] = useState("inbound");
  const [goal, setGoal] = useState("");
  const [personaName, setPersonaName] = useState("");
  const [personaGender, setPersonaGender] = useState("female");
  const [languages, setLanguages] = useState(["hinglish"]);
  const [tools, setTools] = useState(["hangup"]);
  const [requirements, setRequirements] = useState("");
  const [kb, setKb] = useState([]);
  const [kbErr, setKbErr] = useState("");

  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [out, setOut] = useState("");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    fetch("/api/health").then(r => r.json()).then(setHealth).catch(() => setHealth({ ok: false }));
    fetch("/api/rules").then(r => r.json()).then(d => setPlatform(d.platform || "")).catch(() => {});
  }, []);

  const toggle = (arr, set, id) => set(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);

  async function addFiles(list) {
    setKbErr("");
    for (const f of Array.from(list)) {
      try {
        const parsed = await readKbFile(f);
        setKb(k => [...k, parsed]);
      } catch (e) { setKbErr(`${f.name}: ${e.message}`); }
    }
  }

  async function generate() {
    setErr(""); setOut(""); setBusy(true);
    const phases = ["Deriving the harm model…", "Enumerating boundary axes…", "Writing the flow…", "Writing closures…", "Running the sweep…"];
    let i = 0;
    setPhase(phases[0]);
    const tick = setInterval(() => setPhase(phases[Math.min(++i, phases.length - 1)]), 14000);

    try {
      const viaCli = health?.cli && !health?.anthropic;
      if (viaCli && kb.some(f => f.kind === "pdf" || f.kind === "image")) {
        throw new Error("PDFs and images need the API-key path — set ANTHROPIC_API_KEY, or paste the text into Requirements.");
      }
      const cfg = { client, industry, direction, goal, personaName, personaGender, languages, tools, requirements, kbFiles: kb };
      const content = [{ type: "text", text: buildUserMessage(cfg) }];
      for (const f of kb) {
        if (f.kind === "pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data } });
        else if (f.kind === "image") content.push({ type: "image", source: { type: "base64", media_type: f.mime, data: f.data } });
        else content.push({ type: "text", text: `--- knowledge base: ${f.name} ---\n${f.text}` });
      }
      const text = await callClaude({
        model: health?.model || "claude-sonnet-5",
        max_tokens: 16000,
        system: buildSystemPrompt(platform),
        messages: [{ role: "user", content }],
      }, (n) => setPhase(`Reconnecting (attempt ${n})…`), health?.cli && !health?.anthropic);
      setOut(text.trim());
    } catch (e) {
      setErr(e.message);
    } finally {
      clearInterval(tick); setBusy(false); setPhase("");
    }
  }

  const ready = client.trim() && goal.trim() && languages.length && platform;
  const tok = estimateTokens(out);
  const pct = Math.min(100, (tok / 4000) * 100);
  const over = tok > 4000;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.ink, fontFamily: sans }}>
      {/* header */}
      <header style={{ borderBottom: `1px solid ${C.line}`, background: C.surface, padding: "0 28px" }}>
        <div style={{ maxWidth: 1500, margin: "0 auto", display: "flex", alignItems: "center", gap: 16, height: 60 }}>
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 19, letterSpacing: "-.02em" }}>Acebot</div>
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: C.muted, borderLeft: `1px solid ${C.line}`, paddingLeft: 16 }}>Prompt Builder</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 18, fontFamily: mono, fontSize: 11, color: C.muted }}>
            <span>{health === null ? "…" : health.anthropic ? "✓ key" : "✕ no API key"}</span>
            <span>{platform ? "✓ platform rules" : "✕ rules missing"}</span>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1500, margin: "0 auto", padding: 28, display: "grid", gridTemplateColumns: "minmax(380px, 460px) 1fr", gap: 24, alignItems: "start" }}>

        {/* ── config ── */}
        <div>
          <div style={card}>
            <Field label="Client / bot name"><input style={input} value={client} onChange={e => setClient(e.target.value)} placeholder="Ace Healthcare" /></Field>

            <Field label="Industry">
              <select style={input} value={industry} onChange={e => setIndustry(e.target.value)}>
                {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
              </select>
            </Field>

            <Field label="Call direction" hint={direction === "inbound" ? "The caller rang you — the opener frames what this number does." : "You rang them — the opener references why, then qualifies intent."}>
              <div style={{ display: "flex", gap: 8 }}>
                {["inbound", "outbound"].map(d => <Chip key={d} on={direction === d} onClick={() => setDirection(d)}>{d}</Chip>)}
              </div>
            </Field>

            <Field label="What the call is for" hint="The outcome. The bot earns this before asking for it.">
              <input style={input} value={goal} onChange={e => setGoal(e.target.value)} placeholder="Book an appointment with the right specialist" />
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12 }}>
              <Field label="Persona name"><input style={input} value={personaName} onChange={e => setPersonaName(e.target.value)} placeholder="Anjali" /></Field>
              <Field label="Gender">
                <div style={{ display: "flex", gap: 6 }}>
                  {["female", "male", "unspecified"].map(g => <Chip key={g} on={personaGender === g} onClick={() => setPersonaGender(g)}>{g === "unspecified" ? "—" : g[0].toUpperCase()}</Chip>)}
                </div>
              </Field>
            </div>
          </div>

          <div style={card}>
            <Field label="Languages" hint={languages.length > 1 ? "First is primary. Switching happens only on an explicit request." : "Single register — no switching rules generated."}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {LANGUAGES.map(l => <Chip key={l.id} on={languages.includes(l.id)} onClick={() => toggle(languages, setLanguages, l.id)}>{l.label}</Chip>)}
              </div>
            </Field>
          </div>

          <div style={card}>
            <span style={label}>Tools</span>
            <div style={{ display: "grid", gap: 8 }}>
              {TOOLS.map(t => {
                const on = tools.includes(t.id);
                return (
                  <button key={t.id} onClick={() => toggle(tools, setTools, t.id)} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", cursor: "pointer",
                    border: `1px solid ${on ? t.color : C.line}`, borderRadius: 5, textAlign: "left",
                    background: on ? C.surface : C.surface2, transition: ".12s",
                  }}>
                    <span style={{ width: 30, height: 30, borderRadius: 6, background: on ? t.color : C.line2, color: "#fff", display: "grid", placeItems: "center", fontSize: 15, flexShrink: 0 }}>{t.glyph}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: on ? C.ink : C.muted }}>{t.name}</span>
                      <span style={{ display: "block", fontFamily: mono, fontSize: 10.5, color: C.muted, marginTop: 2 }}>{t.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {!tools.includes("hangup") && (
              <div style={{ fontFamily: mono, fontSize: 11, color: C.clay, marginTop: 10, lineHeight: 1.5 }}>
                Without Hangup the bot cannot end a call. Closures will be written as spoken endings only.
              </div>
            )}
          </div>

          <div style={card}>
            <Field label="Knowledge base" hint="PDF, DOCX, images or text. Only speakable facts are extracted — CRM and backend instructions are ignored.">
              <div onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
                style={{ border: `1.5px dashed ${C.line2}`, borderRadius: 6, padding: "18px 14px", textAlign: "center", cursor: "pointer", background: C.surface2, fontFamily: mono, fontSize: 12, color: C.muted }}>
                Drop files or click to upload
              </div>
              <input ref={fileRef} type="file" multiple hidden accept=".pdf,.docx,.txt,.md,.csv,.jpg,.jpeg,.png,.webp"
                onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
            </Field>
            {kbErr && <div style={{ fontFamily: mono, fontSize: 11, color: C.clay, marginBottom: 8 }}>{kbErr}</div>}
            {kb.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: mono, fontSize: 11.5, padding: "6px 0", borderTop: `1px solid ${C.line}` }}>
                <span style={{ color: C.teal }}>{f.kind}</span>
                <span style={{ color: C.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                <button onClick={() => setKb(kb.filter((_, j) => j !== i))} style={{ marginLeft: "auto", border: "none", background: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 14 }}>×</button>
              </div>
            ))}
          </div>

          <div style={card}>
            <Field label="Requirements" hint="Anything the industry and goal don't imply: scope limits, named people, prices, what the bot must never say.">
              <textarea style={{ ...input, minHeight: 130, fontFamily: mono, fontSize: 12.5, lineHeight: 1.6, resize: "vertical" }}
                value={requirements} onChange={e => setRequirements(e.target.value)}
                placeholder={"Only cardiology, orthopaedics and gastroenterology.\nClinics in Gurgaon and Delhi only.\nConsultation fee is set by the doctor and cannot be negotiated."} />
            </Field>
          </div>

          <button onClick={generate} disabled={!ready || busy} style={{
            width: "100%", padding: "13px", borderRadius: 6, border: "none",
            background: !ready || busy ? C.line2 : C.ink, color: "#fff",
            fontFamily: sans, fontSize: 14.5, fontWeight: 600,
            cursor: !ready || busy ? "not-allowed" : "pointer",
          }}>
            {busy ? phase || "Generating…" : "Generate prompt"}
          </button>
          {!ready && !busy && (
            <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, marginTop: 8, textAlign: "center" }}>
              {!platform ? "docs/platform-rules.md not loaded" : "Client name, goal and a language are required"}
            </div>
          )}
        </div>

        {/* ── output ── */}
        <div style={{ position: "sticky", top: 28 }}>
          <div style={{ ...card, padding: 0, overflow: "hidden", marginBottom: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", borderBottom: `1px solid ${C.line}`, background: C.surface2 }}>
              <span style={{ ...label, marginBottom: 0 }}>Generated prompt</span>
              {out && (
                <>
                  <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 11.5, color: over ? C.clay : C.teal, fontWeight: 600 }}>
                    ~{tok.toLocaleString()} / 4,000 tokens
                  </span>
                  <button onClick={() => { navigator.clipboard.writeText(out); setCopied(true); setTimeout(() => setCopied(false), 1600); }}
                    style={{ padding: "5px 12px", borderRadius: 4, border: `1px solid ${C.line2}`, background: C.surface, cursor: "pointer", fontFamily: mono, fontSize: 11, color: C.ink2 }}>
                    {copied ? "copied" : "copy"}
                  </button>
                </>
              )}
            </div>

            {out && (
              <div style={{ height: 3, background: C.line, position: "relative" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: over ? C.clay : C.teal, transition: ".4s" }} />
              </div>
            )}

            <div style={{ padding: out || err || busy ? 0 : 60 }}>
              {err && <div style={{ padding: 20, fontFamily: mono, fontSize: 12.5, color: C.clay, lineHeight: 1.6 }}>{err}</div>}

              {busy && !out && (
                <div style={{ padding: 60, textAlign: "center", fontFamily: mono, fontSize: 12.5, color: C.muted }}>
                  {phase}
                  <div style={{ marginTop: 14, height: 2, background: C.line, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: "35%", background: C.accent, animation: "slide 1.6s ease-in-out infinite" }} />
                  </div>
                </div>
              )}

              {!out && !err && !busy && (
                <div style={{ textAlign: "center", color: C.muted, fontFamily: mono, fontSize: 12.5, lineHeight: 1.8 }}>
                  Platform rules are pasted in verbatim.<br />
                  Only the use-case half is generated.
                </div>
              )}

              {out && (
                <textarea value={out} onChange={e => setOut(e.target.value)} spellCheck={false}
                  style={{ width: "100%", height: "calc(100vh - 210px)", minHeight: 460, border: "none", outline: "none",
                    padding: "18px 20px", fontFamily: mono, fontSize: 12.5, lineHeight: 1.7, color: C.ink,
                    resize: "none", boxSizing: "border-box", background: C.surface }} />
              )}
            </div>
          </div>

          {over && out && (
            <div style={{ marginTop: 12, padding: "12px 16px", background: C.surface, border: `1px solid ${C.line}`, borderLeft: `2px solid ${C.clay}`, borderRadius: "0 5px 5px 0", fontFamily: mono, fontSize: 11.5, color: C.ink2, lineHeight: 1.6 }}>
              Over the 4,000 ceiling. Move structured, keyed facts to a tool before cutting any rule —
              a price list or branch table the flow can key into is a lookup, not prompt text.
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slide { 0%{transform:translateX(-100%)} 100%{transform:translateX(400%)} }
        * { box-sizing: border-box; }
        body { margin: 0; }
        button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid ${C.accent}; outline-offset: 1px; }
        input:focus, select:focus, textarea:focus { border-color: ${C.accent}; }
        @media (max-width: 1100px) {
          div[style*="grid-template-columns: minmax(380px"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
