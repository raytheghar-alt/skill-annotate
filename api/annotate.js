/**
 * annotate.js — Vercel API route for creating UI annotations
 *
 * Works as:
 *   - Next.js pages/api route (export default handler)
 *   - Standalone Vercel serverless function
 *
 * Required env vars:
 *   ANNOTATE_SUPABASE_URL      — your Supabase project URL
 *   ANNOTATE_SUPABASE_ANON_KEY — your Supabase anon/public key
 *
 * Accepts: POST /api/annotate
 * Body (JSON):
 *   {
 *     session_id:   string  (required) — unique session identifier
 *     url:          string  (required) — page URL where annotation was made
 *     element:      string  (required) — human-readable element description
 *     element_path: string  (required) — CSS selector or XPath to element
 *     comment:      string  (required) — the annotation text
 *     intent:       string  (optional) — fix | change | question | approve
 *     severity:     string  (optional) — blocking | important | suggestion
 *   }
 */

// CORS headers — widget runs on the user's deployed domain, so we allow all origins
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const VALID_INTENTS = ["fix", "change", "question", "approve"];
const VALID_SEVERITIES = ["blocking", "important", "suggestion"];

export default async function handler(req, res) {
  // ── Handle CORS preflight ──────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return res.status(200).set(CORS_HEADERS).end();
  }

  // Apply CORS headers to all responses
  Object.entries(CORS_HEADERS).forEach(([key, val]) => res.setHeader(key, val));

  // ── Method guard ───────────────────────────────────────────────────────────
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed. Use POST." });
  }

  // ── Env var check ──────────────────────────────────────────────────────────
  const SUPABASE_URL = process.env.ANNOTATE_SUPABASE_URL;
  const SUPABASE_KEY = process.env.ANNOTATE_SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({
      error:
        "Supabase not configured. Set ANNOTATE_SUPABASE_URL and ANNOTATE_SUPABASE_ANON_KEY.",
    });
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body;
  try {
    // Next.js parses JSON body automatically; for standalone Vercel functions
    // the body may arrive as a raw string.
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Invalid JSON body." });
  }

  const {
    session_id,
    url,
    element,
    element_path,
    comment,
    intent,
    severity,
  } = body || {};

  // ── Required field validation ──────────────────────────────────────────────
  const missingFields = [];
  if (!session_id) missingFields.push("session_id");
  if (!url) missingFields.push("url");
  if (!element) missingFields.push("element");
  if (!element_path) missingFields.push("element_path");
  if (!comment) missingFields.push("comment");

  if (missingFields.length > 0) {
    return res.status(400).json({
      error: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  // ── Optional field validation ──────────────────────────────────────────────
  if (intent && !VALID_INTENTS.includes(intent)) {
    return res.status(400).json({
      error: `Invalid intent "${intent}". Must be one of: ${VALID_INTENTS.join(" | ")}`,
    });
  }

  if (severity && !VALID_SEVERITIES.includes(severity)) {
    return res.status(400).json({
      error: `Invalid severity "${severity}". Must be one of: ${VALID_SEVERITIES.join(" | ")}`,
    });
  }

  // ── Build the annotation record ────────────────────────────────────────────
  const annotation = {
    session_id,
    url,
    element,
    element_path,
    comment,
    status: "pending", // default status
    thread: [],        // starts empty; agent replies are appended later
    ...(intent && { intent }),
    ...(severity && { severity }),
  };

  // ── Insert into Supabase ───────────────────────────────────────────────────
  let supabaseRes;
  try {
    supabaseRes = await fetch(`${SUPABASE_URL}/rest/v1/annotations`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation", // return the created row
      },
      body: JSON.stringify(annotation),
    });
  } catch (networkErr) {
    return res.status(500).json({
      error: "Failed to reach Supabase.",
      details: networkErr.message,
    });
  }

  // ── Handle Supabase response ───────────────────────────────────────────────
  let created;
  try {
    created = await supabaseRes.json();
  } catch {
    return res.status(500).json({
      error: "Supabase returned an unparseable response.",
      status: supabaseRes.status,
    });
  }

  if (!supabaseRes.ok) {
    return res.status(500).json({
      error: "Supabase insert failed.",
      details: created,
    });
  }

  // Supabase returns an array when Prefer: return=representation is set
  const result = Array.isArray(created) ? created[0] : created;

  return res.status(201).json(result);
}
