const fs = require("fs");
const path = require("path");
const env = require("../../config/env");

// ==============================
// Static theme fallback
// ==============================
const THEMES_DIR = path.join(__dirname, "themes");
let cachedThemes = null;

function loadStaticThemes() {
  if (cachedThemes) return cachedThemes;
  const files = fs.readdirSync(THEMES_DIR).filter((f) => f.endsWith(".json"));
  const themes = [];
  for (const file of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(THEMES_DIR, file), "utf-8"));
      if (parsed.theme && Array.isArray(parsed.pairs) && parsed.pairs.length > 0) {
        themes.push(parsed);
      }
    } catch { /**/ }
  }
  if (themes.length === 0) throw new Error("No valid static theme files found");
  cachedThemes = themes;
  return cachedThemes;
}

function getRandomStaticThemePair(excludeThemes = []) {
  const themes = loadStaticThemes();
  const eligible = themes.filter((t) => !excludeThemes.includes(t.theme));
  const pool = eligible.length > 0 ? eligible : themes;
  const theme = pool[Math.floor(Math.random() * pool.length)];
  const pair = theme.pairs[Math.floor(Math.random() * theme.pairs.length)];
  return { theme: theme.theme, innocent: pair.innocent, impostor: pair.impostor };
}

// ==============================
// AI helpers
// ==============================
const SYSTEM_PROMPT = `You are a content generator for a Discord party game called "Who Is The Impostor".
You must invent ONE theme and ONE pair of related objects for it.

Rules:
- "innocent" and "impostor" must be two DIFFERENT but clearly RELATED objects within the same theme (e.g. theme "Musical Instruments" -> innocent "Guitar", impostor "Ukulele").
- Keep object names short (1-3 words), family-friendly, and unambiguous.
- Do not reuse extremely generic themes like "Objects" or "Things".
- Respond with STRICT JSON ONLY. No markdown fences, no commentary, no explanation.
- The JSON must match exactly this shape:
{"theme": "string", "innocent": "string", "impostor": "string"}`;

function buildUserPrompt(excludeThemes = []) {
  const exclusion = excludeThemes.length > 0
    ? `Avoid these recently used themes: ${excludeThemes.join(", ")}.`
    : "";
  return `Generate a new theme and object pair for the game now. ${exclusion} Respond with JSON only.`;
}

function parseAndValidate(rawText) {
  if (typeof rawText !== "string" || rawText.trim().length === 0) throw new Error("Empty AI response");
  const cleaned = rawText.trim().replace(/^```(json)?/i, "").replace(/```$/i, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI response is not valid JSON");
    parsed = JSON.parse(match[0]);
  }
  const { theme, innocent, impostor } = parsed;
  if (typeof theme !== "string" || typeof innocent !== "string" || typeof impostor !== "string") {
    throw new Error("AI response missing required string fields");
  }
  if (innocent.trim().toLowerCase() === impostor.trim().toLowerCase()) {
    throw new Error("innocent/impostor objects must differ");
  }
  return { theme: theme.trim(), innocent: innocent.trim(), impostor: impostor.trim() };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ==============================
// AI Provider adapters
// (each model below is hardcoded to that provider's free tier —
//  no model choice needed, just drop in the API key)
// ==============================
async function generateWithGemini(excludeThemes, timeoutMs) {
  if (!env.GEMINI_API_KEY) return null;
  const model = "gemini-2.5-flash-lite"; // free tier, most generous rate limit
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
  try {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: buildUserPrompt(excludeThemes) }] }],
        generationConfig: { temperature: 1.1, responseMimeType: "application/json" },
      }),
    }, timeoutMs);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[ThemeGenerator] Gemini HTTP ${res.status}: ${body.slice(0, 300)}`);
      return null;
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return parseAndValidate(text);
  } catch (err) {
    console.warn(`[ThemeGenerator] Gemini error: ${err.message}`);
    return null;
  }
}

async function generateWithOpenAICompat(baseUrl, apiKey, model, excludeThemes, timeoutMs) {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: buildUserPrompt(excludeThemes) }],
        temperature: 1.1,
        response_format: { type: "json_object" },
      }),
    }, timeoutMs);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[ThemeGenerator] ${baseUrl} HTTP ${res.status}: ${body.slice(0, 300)}`);
      return null;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return parseAndValidate(text);
  } catch (err) {
    console.warn(`[ThemeGenerator] ${baseUrl} error: ${err.message}`);
    return null;
  }
}

// ==============================
// Provider chain
// ==============================
async function generateThemePair(excludeThemes = []) {
  const TIMEOUT = env.AI_REQUEST_TIMEOUT_MS;

  // Gemini
  if (env.GEMINI_API_KEY) {
    const r = await generateWithGemini(excludeThemes, TIMEOUT);
    if (r) return { ...r, source: "ai:gemini" };
  }

  // OpenRouter (free model — uses OpenRouter's auto-routing free-model
  // picker so this doesn't break again every time their free roster changes)
  if (env.OPENROUTER_API_KEY) {
    const r = await generateWithOpenAICompat(
      "https://openrouter.ai/api/v1",
      env.OPENROUTER_API_KEY,
      "openrouter/free",
      excludeThemes, TIMEOUT
    );
    if (r) return { ...r, source: "ai:openrouter" };
  }

  // Grok / xAI (free tier model)
  if (env.GROK_API_KEY) {
    const r = await generateWithOpenAICompat(
      "https://api.x.ai/v1",
      env.GROK_API_KEY,
      "grok-2-latest",
      excludeThemes, TIMEOUT
    );
    if (r) return { ...r, source: "ai:grok" };
  }

  // Groq Llama (free tier)
  if (env.GROQ_API_KEY) {
    const r = await generateWithOpenAICompat(
      "https://api.groq.com/openai/v1",
      env.GROQ_API_KEY,
      "llama-3.3-70b-versatile",
      excludeThemes, TIMEOUT
    );
    if (r) return { ...r, source: "ai:llama-groq" };
  }

  // Static fallback
  console.warn("[Impostor] All AI providers unavailable, using static theme");
  const staticPair = getRandomStaticThemePair(excludeThemes);
  return { ...staticPair, source: "static-fallback" };
}

module.exports = { generateThemePair };