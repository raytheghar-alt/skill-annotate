/**
 * annotation-update.js — Vercel API route for updating annotation status
 *
 * Works as:
 *   - Next.js pages/api route (export default handler)
 *   - Standalone Vercel serverless function
 *
 * Required env vars:
 *   ANNOTATE_SUPABASE_URL      — your Supabase project URL
 *   ANNOTATE_SUPABASE_ANON_KEY — your Supabase anon/public key
 *
 * Accepts: PATCH /api/annotation-update
 * Body (JSON):
 *   {
 *     id:              string  (required) — UUID of the annotation to update
 *     status:          string  (required) — acknowledged | resolved | dismissed
 *     resolved_by:     string  (optional) — identifier of who resolved it (e.g. "ray")
 *     thread_message:  string  (optional) — agent reply to append to thread[]
 *   }
 *
 * Returns: the updated annotation object
 */

// CORS headers
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const VALID_STATUSES = ["acknowledged", "resolved", "dismissed"];

/**
 * Generate a simple UUID v4 without external dependencies.
 * Used to give each thread message a unique id.
 */
function uuidv4() {
  // Use crypto.randomUUID() if available (Node 15+, modern browsers)
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  // Fallback: manual UUID v4 construction via Math.random()
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default async function handler(req, res) {
  // ── Handle CORS preflight ──────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return res.status(200).set(CORS_HEADERS).end();
  }

  // Apply CORS headers to all responses
  Object.entries(CORS_HEADERS).forEach(([key, val]) => res.setHeader(key, val));

  // ── Method guard ───────────────────────────────────────────────────────────
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "Method Not Allowed. Use PATCH." });
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
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Invalid JSON body." });
  }

  const { id, status, resolved_by, thread_message } = body || {};

  // ── Required field validation ──────────────────────────────────────────────
  if (!id) {
    return res.status(400).json({ error: "Missing required field: id" });
  }

  if (!status) {
    return res.status(400).json({ error: "Missing required field: status" });
  }

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(" | ")}`,
    });
  }

  // ── Build the update payload ───────────────────────────────────────────────
  const update = {
    status,
    updated_at: new Date().toISOString(),
    ...(resolved_by && { resolved_by }),
  };

  // ── If thread_message provided, we need to fetch the current thread first ──
  // Supabase doesn't natively support array append in a single PATCH without
  // using a Postgres function. So we: fetch → append → patch.
  if (thread_message) {
    // 1. Fetch the current annotation to get existing thread array
    let fetchRes;
    try {
      fetchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/annotations?id=eq.${encodeURIComponent(id)}&select=thread`,
        {
          method: "GET",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (networkErr) {
      return res.status(500).json({
        error: "Failed to reach Supabase while fetching current thread.",
        details: networkErr.message,
      });
    }

    let fetchData;
    try {
      fetchData = await fetchRes.json();
    } catch {
      return res.status(500).json({
        error: "Could not parse Supabase response while fetching thread.",
      });
    }

    if (!fetchRes.ok || !Array.isArray(fetchData) || fetchData.length === 0) {
      return res.status(404).json({
        error: `Annotation with id "${id}" not found.`,
        details: fetchData,
      });
    }

    // 2. Build the new thread entry
    const existingThread = Array.isArray(fetchData[0].thread)
      ? fetchData[0].thread
      : [];

    const newEntry = {
      id: uuidv4(),
      role: "agent",
      content: thread_message,
      timestamp: Date.now(),
    };

    // 3. Append and include updated thread in the patch payload
    update.thread = [...existingThread, newEntry];
  }

  // ── PATCH the annotation in Supabase ──────────────────────────────────────
  let supabaseRes;
  try {
    supabaseRes = await fetch(
      `${SUPABASE_URL}/rest/v1/annotations?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation", // return the updated row
        },
        body: JSON.stringify(update),
      }
    );
  } catch (networkErr) {
    return res.status(500).json({
      error: "Failed to reach Supabase.",
      details: networkErr.message,
    });
  }

  // ── Handle Supabase response ───────────────────────────────────────────────
  let updated;
  try {
    updated = await supabaseRes.json();
  } catch {
    return res.status(500).json({
      error: "Supabase returned an unparseable response.",
      status: supabaseRes.status,
    });
  }

  if (!supabaseRes.ok) {
    return res.status(500).json({
      error: "Supabase update failed.",
      details: updated,
    });
  }

  // Supabase returns an array with Prefer: return=representation
  const result = Array.isArray(updated) ? updated[0] : updated;

  if (!result) {
    return res.status(404).json({
      error: `Annotation with id "${id}" not found or no rows updated.`,
    });
  }

  return res.status(200).json(result);
}
