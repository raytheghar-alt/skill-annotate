-- =============================================================================
-- Annotate Skill — Supabase Schema Setup
-- =============================================================================
-- Run this once in your Supabase SQL editor to set up the annotations table.
-- Go to: https://supabase.com/dashboard → your project → SQL Editor → New query
-- Paste this entire file, then click "Run".
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Enable pgcrypto for gen_random_uuid() (already available in Supabase,
--    but included for completeness in case of older instances)
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- -----------------------------------------------------------------------------
-- 1. Create the annotations table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS annotations (

  -- Primary key
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Session grouping — ties multiple annotations from the same page visit together
  session_id        text          NOT NULL,

  -- The full URL of the page where the annotation was made
  -- e.g. "https://myapp.vercel.app/dashboard"
  url               text          NOT NULL,

  -- HTML tag name of the clicked element (e.g. "button", "div", "a")
  element           text          NOT NULL,

  -- Full CSS selector path to the element
  -- e.g. "body > main > .hero > button.cta"
  element_path      text          NOT NULL,

  -- React component tree at the click point, if available
  -- e.g. "App > Layout > HeroSection > CTAButton"
  -- Nullable: only populated when React DevTools hook is accessible
  react_components  text,

  -- The user's actual feedback text
  comment           text          NOT NULL,

  -- Intent classification
  -- Allowed values: fix | change | question | approve
  intent            text          CHECK (intent IN ('fix', 'change', 'question', 'approve')),

  -- Severity level
  -- Allowed values: blocking | important | suggestion
  severity          text          CHECK (severity IN ('blocking', 'important', 'suggestion')),

  -- Workflow status of this annotation
  -- Allowed values: pending | acknowledged | resolved | dismissed
  status            text          NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'acknowledged', 'resolved', 'dismissed')),

  -- Click position as % of viewport width (0–100)
  x                 float8        NOT NULL,

  -- Click position as px from document top (scroll-adjusted)
  y                 float8        NOT NULL,

  -- Bounding box of the target element at time of click
  -- Shape: { x: number, y: number, width: number, height: number }
  bounding_box      jsonb,

  -- CSS classes on the clicked element (space-separated string)
  css_classes       text,

  -- Snapshot of relevant computed styles at click time (serialized as text/JSON)
  computed_styles   text,

  -- Nearby visible text — helps Ray understand context without seeing the screen
  nearby_text       text,

  -- Any text the user had selected when they triggered the annotation
  selected_text     text,

  -- Conversation thread on this annotation
  -- Array of: { id: string, role: "human"|"agent", content: string, timestamp: string }
  -- Starts empty; Ray and the user can reply back and forth here
  thread            jsonb         NOT NULL DEFAULT '[]'::jsonb,

  -- Resolution tracking
  resolved_at       timestamptz,
  resolved_by       text          CHECK (resolved_by IN ('human', 'agent')),

  -- Timestamps
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()

);

-- Add a table comment for documentation
COMMENT ON TABLE annotations IS
  'UI annotations captured from Vercel apps via the OpenClaw annotate skill. '
  'Each row represents one piece of feedback left by a user on a deployed page.';

-- Column comments
COMMENT ON COLUMN annotations.session_id        IS 'Groups all annotations from a single page visit together.';
COMMENT ON COLUMN annotations.url               IS 'Full URL of the page at annotation time, including query string.';
COMMENT ON COLUMN annotations.element           IS 'HTML tag name of the annotated element (button, div, etc.).';
COMMENT ON COLUMN annotations.element_path      IS 'CSS selector path — unique enough to re-locate the element later.';
COMMENT ON COLUMN annotations.react_components  IS 'React component hierarchy if accessible via DevTools hook.';
COMMENT ON COLUMN annotations.comment           IS 'The user''s verbatim feedback text.';
COMMENT ON COLUMN annotations.intent            IS 'fix | change | question | approve';
COMMENT ON COLUMN annotations.severity          IS 'blocking | important | suggestion';
COMMENT ON COLUMN annotations.status            IS 'pending | acknowledged | resolved | dismissed';
COMMENT ON COLUMN annotations.x                IS 'Click X as percentage of viewport width (0–100).';
COMMENT ON COLUMN annotations.y                IS 'Click Y as px from document top (scroll-adjusted).';
COMMENT ON COLUMN annotations.bounding_box      IS 'Element bounding box at click time: {x, y, width, height}.';
COMMENT ON COLUMN annotations.thread            IS 'Back-and-forth replies: [{id, role, content, timestamp}].';
COMMENT ON COLUMN annotations.resolved_by       IS 'Who resolved this: human or agent.';


-- -----------------------------------------------------------------------------
-- 2. Indexes — for the query patterns Ray will use most
-- -----------------------------------------------------------------------------

-- Filter by workflow status (most common: WHERE status = 'pending')
CREATE INDEX IF NOT EXISTS idx_annotations_status
  ON annotations (status);

-- Filter by page URL (fetch all annotations for a given page)
CREATE INDEX IF NOT EXISTS idx_annotations_url
  ON annotations (url);

-- Group/filter by session
CREATE INDEX IF NOT EXISTS idx_annotations_session_id
  ON annotations (session_id);

-- Order by newest first
CREATE INDEX IF NOT EXISTS idx_annotations_created_at
  ON annotations (created_at DESC);


-- -----------------------------------------------------------------------------
-- 3. Auto-update trigger for updated_at
-- -----------------------------------------------------------------------------

-- The trigger function — reusable across tables
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Attach the trigger to annotations
DROP TRIGGER IF EXISTS trg_annotations_updated_at ON annotations;

CREATE TRIGGER trg_annotations_updated_at
  BEFORE UPDATE ON annotations
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();


-- -----------------------------------------------------------------------------
-- 4. Row Level Security (RLS)
-- -----------------------------------------------------------------------------

-- Enable RLS on the table (locks it down by default)
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;

-- Policy: allow the anon role to SELECT annotations
-- Rationale: this is the user's own Supabase project — anon key is scoped to
-- their data only. No cross-tenant risk.
CREATE POLICY "anon_select_annotations"
  ON annotations
  FOR SELECT
  TO anon
  USING (true);

-- Policy: allow the anon role to INSERT new annotations
CREATE POLICY "anon_insert_annotations"
  ON annotations
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Policy: allow the anon role to UPDATE annotations
-- (e.g. Ray updating status, appending to thread)
CREATE POLICY "anon_update_annotations"
  ON annotations
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Note: DELETE is intentionally excluded. Annotations are a record of feedback.
-- To discard one, set status = 'dismissed' instead.


-- -----------------------------------------------------------------------------
-- Done!
-- -----------------------------------------------------------------------------
-- Your annotations table is ready. Drop your Supabase URL and anon key into
-- your Vercel environment variables and you're good to go.
-- See README-supabase.md for the full setup guide.
-- =============================================================================
