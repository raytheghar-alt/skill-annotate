/**
 * annotations-list.js — Vercel API route for listing UI annotations
 *
 * Works as:
 *   - Next.js pages/api route (export default handler)
 *   - Standalone Vercel serverless function
 *
 * Required env vars:
 *   ANNOTATE_SUPABASE_URL      — your Supabase project URL
 *   ANNOTATE_SUPABASE_ANON_KEY — your Supabase anon/public key
 *
 * Accepts: GET /api/annotations-list
 * Query params:
 *   status  — filter by status (default: "pending")
 *             values: pending | acknowledged | resolved | dismissed
 *   url     — optional, filter by page URL (exact match)
 *   limit   — max results to return (default: 50, max: 200)
 *
 * Returns: JSON array of annotation objects
 */

// CORS headers — same as annotate.js so browser clients can poll this too
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async function handler(req, res) {
  // ── Handle CORS preflight ──────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return res.status(200).set(CORS_HEADERS).end();
  }

  // Apply CORS headers to all responses
  Object.entries(CORS_HEADERS).forEach(([key, val]) => res.setHeader(key, val));

  // ── Method guard ───────────────────────────────────────────────────────────
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed. Use GET." });
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

  // ── Parse query params ─────────────────────────────────────────────────────
  const {
    status = "pending",
    url,
    limit: rawLimit = "50",
  } = req.query || {};

  // Clamp limit to a safe range (1–200)
  const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 50, 1), 200);

  // ── Build Supabase query string ────────────────────────────────────────────
  // Supabase REST API uses PostgREST filter syntax:
  //   status=eq.pending
  //   url=eq.<encoded>
  //   order=created_at.asc
  //   limit=50
  const params = new URLSearchParams();
  params.set("status", `eq.${status}`);
  params.set("order", "created_at.asc");
  params.set("limit", String(limit));

  // Optional URL filter — exact match
  if (url) {
    params.set("url", `eq.${url}`);
  }

  const endpoint = `${SUPABASE_URL}/rest/v1/annotations?${params.toString()}`;

  // ── Fetch from Supabase ────────────────────────────────────────────────────
  let supabaseRes;
  try {
    supabaseRes = await fetch(endpoint, {
      method: "GET",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        // Ask Supabase to return total count in headers (optional, handy for pagination)
        Prefer: "count=exact",
      },
    });
  } catch (networkErr) {
    return res.status(500).json({
      error: "Failed to reach Supabase.",
      details: networkErr.message,
    });
  }

  // ── Handle Supabase response ───────────────────────────────────────────────
  let annotations;
  try {
    annotations = await supabaseRes.json();
  } catch {
    return res.status(500).json({
      error: "Supabase returned an unparseable response.",
      status: supabaseRes.status,
    });
  }

  if (!supabaseRes.ok) {
    return res.status(500).json({
      error: "Supabase query failed.",
      details: annotations,
    });
  }

  // Supabase returns an array for SELECT queries
  return res.status(200).json(Array.isArray(annotations) ? annotations : []);
}
