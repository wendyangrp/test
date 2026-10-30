// Small Node.js server with no dependencies.
// - Serves the static site (HTML, CSS, JS) from the project folder.
// - POST /api/persona-reply: asks the AI to answer as the persona.
//   The API key stays here on the server and is never sent to the browser.

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

// Load settings from .env if present (Node 20.12+).
try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch (e) {
  // No .env file: rely on real environment variables.
}

const PORT = Number(process.env.PORT) || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.MODEL || "claude-haiku-5-5";
const TRUST_PROXY = process.env.TRUST_PROXY === "true";

// Cost guards.
const MAX_BODY_BYTES = 64 * 1024;
const MAX_FIELD_CHARS = 1000;
const MAX_MESSAGE_CHARS = 1000;
const MAX_MESSAGES = 60; // 30 questions + 30 answers; keep in sync with MAX_QUESTIONS in the tool
const MAX_TOKENS = 1500;
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_10_MIN) || 30;
const RATE_WINDOW_MS = 10 * 60 * 1000;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

// Only these top-level folders/files are served, so server code and
// settings files (like .env) can never be downloaded.
const PUBLIC_PATHS = ["index.html", "css", "js", "tools"];

// ---------- Helpers ----------

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function clientId(req) {
  if (TRUST_PROXY) {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) return String(forwarded).split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

// Simple in-memory rate limit: at most RATE_LIMIT requests per visitor
// in each 10-minute window. Resets when the server restarts.
const hits = new Map();

function isRateLimited(id) {
  const now = Date.now();
  const recent = (hits.get(id) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(id, recent);
    return true;
  }
  recent.push(now);
  hits.set(id, recent);
  return false;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, times] of hits) {
    if (times.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(id);
  }
}, RATE_WINDOW_MS).unref();

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// ---------- Persona prompt ----------

const PERSONA_FIELDS = ["name", "age", "occupation", "background", "goals", "frustrations", "personality"];

function cleanPersona(input) {
  if (!input || typeof input !== "object") return null;
  const persona = {};
  for (const key of PERSONA_FIELDS) {
    const value = typeof input[key] === "string" ? input[key].trim() : "";
    persona[key] = value.slice(0, MAX_FIELD_CHARS);
  }
  return persona.name ? persona : null;
}

function cleanMessages(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_MESSAGES) return null;
  const messages = [];
  for (let i = 0; i < input.length; i++) {
    const m = input[i];
    const expectedRole = i % 2 === 0 ? "user" : "assistant";
    if (!m || m.role !== expectedRole || typeof m.content !== "string") return null;
    const content = m.content.trim();
    if (!content || content.length > MAX_MESSAGE_CHARS * 2) return null;
    messages.push({ role: m.role, content });
  }
  // The conversation must end with the student's new question.
  if (messages[messages.length - 1].role !== "user") return null;
  if (messages[messages.length - 1].content.length > MAX_MESSAGE_CHARS) return null;
  return messages;
}

function buildSystemPrompt(p) {
  const lines = [
    "You are role-playing a person being interviewed by a design student.",
    "The student is practising the empathy stage of design thinking: learning about a person's experiences, needs, feelings and frustrations through interviews.",
    "",
    "Here is who you are:",
    `Name: ${p.name}`,
  ];
  if (p.age) lines.push(`Age: ${p.age}`);
  if (p.occupation) lines.push(`Occupation: ${p.occupation}`);
  if (p.background) lines.push(`Background: ${p.background}`);
  if (p.goals) lines.push(`Goals: ${p.goals}`);
  if (p.frustrations) lines.push(`Frustrations: ${p.frustrations}`);
  if (p.personality) lines.push(`Personality and way of talking: ${p.personality}`);
  lines.push(
    "",
    "How to answer:",
    "- Stay in character as this person for the whole conversation, speaking in the first person.",
    "- Answer like a real interviewee in a spoken conversation: usually 2 to 5 sentences, plain everyday language, no lists or headings.",
    "- Share concrete stories, feelings and small details from your life. It is fine to be unsure, to contradict yourself a little, or to not know something.",
    "- You are not a designer. Do not suggest product ideas or solutions unless directly asked, and then only as a regular person would.",
    "- If the student asks a leading or yes/no question, answer it honestly and briefly, the way a real person would.",
    "- Fill in reasonable details that fit the description, but keep them consistent with what you have already said.",
    "- If asked something inappropriate or unrelated to your life, politely steer back to the interview as this person would.",
    "- Never mention that you are an AI or that this is a role-play."
  );
  return lines.join("\n");
}

// ---------- AI call ----------

async function personaReply(persona, messages) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2026-10-21",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      output_config: { effort: "low" },
      system: buildSystemPrompt(persona),
      messages,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(data?.error?.message || `AI service returned ${response.status}`);
    err.status = response.status;
    throw err;
  }

  if (data.stop_reason === "refusal") {
    return { refused: true };
  }

  // The reply may also contain "thinking" blocks; keep only the text.
  const text = (data.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  return { text };
}

async function handlePersonaReply(req, res) {
  if (!API_KEY) {
    sendJson(res, 503, { error: "The AI isn't set up on this server yet (no API key). Ask the site owner to add one." });
    return;
  }

  if (isRateLimited(clientId(req))) {
    sendJson(res, 429, { error: "You're asking questions very quickly. Please wait a few minutes and try again." });
    return;
  }

  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    const tooLarge = e.message === "too_large";
    sendJson(res, tooLarge ? 413 : 400, { error: tooLarge ? "That message is too long." : "The request was not valid." });
    return;
  }

  const persona = cleanPersona(body.persona);
  const messages = cleanMessages(body.messages);
  if (!persona) {
    sendJson(res, 400, { error: "Please give the persona a name before starting." });
    return;
  }
  if (!messages) {
    sendJson(res, 400, {
      error: `The interview could not be sent. Questions can be up to ${MAX_MESSAGE_CHARS} characters, and an interview can have up to ${MAX_MESSAGES / 2} questions.`,
    });
    return;
  }

  try {
    const result = await personaReply(persona, messages);
    if (result.refused) {
      sendJson(res, 422, { error: "The persona couldn't answer that question. Try asking it a different way." });
      return;
    }
    if (!result.text) {
      sendJson(res, 502, { error: "The persona didn't reply. Please try again." });
      return;
    }
    sendJson(res, 200, { reply: result.text });
  } catch (err) {
    console.error("AI request failed:", err.status || "", err.message);
    if (err.status === 429 || err.status === 529) {
      sendJson(res, 503, { error: "The AI service is busy right now. Please try again in a minute." });
    } else if (err.status === 401 || err.status === 403) {
      sendJson(res, 503, { error: "The AI isn't set up correctly on this server. Ask the site owner to check the API key." });
    } else {
      sendJson(res, 502, { error: "Couldn't get a reply from the AI service. Please try again." });
    }
  }
}

// ---------- Static files ----------

function serveStatic(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch (e) {
    res.writeHead(400).end("Bad request");
    return;
  }
  if (urlPath.endsWith("/")) urlPath += "index.html";

  const filePath = path.resolve(ROOT, "." + urlPath);
  const relative = path.relative(ROOT, filePath);
  const topLevel = relative.split(path.sep)[0];

  if (relative.startsWith("..") || path.isAbsolute(relative) || !PUBLIC_PATHS.includes(topLevel)) {
    notFound(res);
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err) return notFound(res);
    if (stats.isDirectory()) {
      // e.g. /tools/persona-interview -> /tools/persona-interview/
      res.writeHead(301, { Location: urlPath + "/" }).end();
      return;
    }
    const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Content-Length": stats.size });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
}

function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Page not found");
}

// ---------- Server ----------

const server = http.createServer((req, res) => {
  if (req.url === "/api/persona-reply") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" }).end();
      return;
    }
    handlePersonaReply(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) sendJson(res, 500, { error: "Something went wrong on the server." });
    });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Empathy Toolkit running at http://localhost:${PORT}`);
  if (!API_KEY) console.warn("Warning: ANTHROPIC_API_KEY is not set. The Persona Interview tool will not be able to reply.");
});
