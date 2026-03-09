# annotate — UI Annotation Skill for OpenClaw
Version: 1.0.0
Author: raytheghar-alt
Trigger: UI feedback, annotations, fix UI issues

---

## When to Use This Skill

Load and follow this skill when the user says any of:
- "check my annotations"
- "fix my annotations"
- "what feedback do I have"
- "review UI feedback"
- "annotate mode" / "annotation mode"
- "fix the UI issues"
- "watch for annotations" / "annotation watch mode"

---

## Prerequisites — Check First

Before anything else, verify these env vars are set in your environment:
- `ANNOTATE_SUPABASE_URL`
- `ANNOTATE_SUPABASE_ANON_KEY`

```bash
echo $ANNOTATE_SUPABASE_URL
echo $ANNOTATE_SUPABASE_ANON_KEY
```

If either is missing or empty: stop and tell the user:
> "You're missing Supabase env vars. Check `skill-annotate/README-supabase.md` for setup instructions."

Do not proceed without both vars set.

Also confirm you know the user's **app URL** (e.g. `https://myapp.vercel.app`). If not known, ask:
> "What's your app URL? (e.g. https://yourapp.vercel.app)"

---

## Step 1 — Fetch Pending Annotations

```bash
curl -s "$APP_URL/api/annotations-list?status=pending" \
  -H "Content-Type: application/json"
```

Response shape:
```json
[
  {
    "id": "uuid",
    "element_path": ".hero-section > h1",
    "comment": "Font size too small on mobile",
    "severity": "blocking" | "major" | "minor" | "suggestion",
    "intent": "fix" | "question" | "idea",
    "status": "pending",
    "created_at": "2026-03-09T10:00:00Z"
  }
]
```

If the response is empty (`[]`): tell the user "No pending annotations. You're clean."

If the request fails: check that the API routes are deployed (see Setup section).

---

## Step 2 — Display Summary

Show a clean grouped summary before acting:

```
📋 Annotations (5 total)

🔴 Blocking (2)
  1. .hero-section > h1 — "Font size too small on mobile" [fix]
  2. #checkout-btn — "Button not visible on dark mode" [fix]

🟡 Important (1)
  3. .nav-menu — "Dropdown overlaps content on iPad" [fix]

💡 Suggestion (2)
  4. .footer-links — "Links too close together" [change]
  5. .pricing-card — "Consider adding a highlight for recommended tier" [question]
```

Severity order: blocking → important → suggestion.

---

## Step 3 — Act on Annotations

Process in severity order (blocking first). For each annotation:

### 3a. Acknowledge

```bash
curl -s -X PATCH "$APP_URL/api/annotation-update" \
  -H "Content-Type: application/json" \
  -d '{"id": "<annotation_id>", "status": "acknowledged"}'
```

### 3b. Find the Code

Use the `element_path` CSS selector to locate the relevant component in the codebase:

```bash
# Search for the selector string across component files
grep -r "hero-section" src/ --include="*.tsx" --include="*.jsx" --include="*.css" -l
grep -r "checkout-btn" src/ --include="*.tsx" --include="*.jsx" --include="*.css" -l
```

Strategy:
- Strip CSS selector syntax (`.`, `#`, `>`) to extract plain class/id names
- Search for those strings across `src/`, `components/`, `app/`, `pages/`
- If multiple files match, read each briefly and pick the one that renders the element

### 3c. Make the Fix

Read the file, understand the issue from the comment, make the targeted fix. Keep changes minimal and surgical — don't refactor unrelated code.

Examples:
- "Font size too small on mobile" → find the Tailwind class or CSS rule, add responsive size
- "Button not visible on dark mode" → find the color class, add `dark:` variant
- "Dropdown overlaps content" → find z-index or positioning, adjust

### 3d. Resolve

After fixing:

```bash
curl -s -X PATCH "$APP_URL/api/annotation-update" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "<annotation_id>",
    "status": "resolved",
    "resolved_by": "agent",
    "thread_message": "Fixed: <one-line description of what you changed>"
  }'
```

`thread_message` example: `"Fixed: Added responsive text size (text-2xl → text-xl sm:text-2xl) to hero h1"`

### 3e. Skip / Dismiss

If an annotation is a question or idea you can't act on (intent: "question" or "idea"), or if the selector doesn't match any code:

```bash
curl -s -X PATCH "$APP_URL/api/annotation-update" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "<annotation_id>",
    "status": "dismissed",
    "resolved_by": "agent",
    "thread_message": "<reason: question/idea/selector not found>"
  }'
```

---

## Step 4 — Report Back

After processing all annotations:

```
✅ Done. Processed 5 annotations.

Fixed (3):
  • .hero-section > h1 — Added responsive font size
  • #checkout-btn — Added dark mode visibility (dark:text-white)
  • .nav-menu — Fixed z-index on dropdown (z-10 → z-50)

Dismissed (2):
  • .footer-links — Skipped (suggestion, no code change needed)
  • .pricing-card — Skipped (idea, not actionable)

Changes are local. Deploy when ready.
```

---

## Watch Mode

If the user says **"watch for annotations"** or **"annotation watch mode"**:

Poll every 30 seconds:
```bash
while true; do
  RESULT=$(curl -s "$APP_URL/api/annotations-list?status=pending")
  COUNT=$(echo $RESULT | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
  if [ "$COUNT" -gt "0" ]; then
    echo "New annotations found: $COUNT"
    # process them (Steps 1-4 above)
  fi
  sleep 30
done
```

Tell the user: "Watching for annotations on `$APP_URL`. I'll process them as they come in. Say 'stop watching' to exit."

Continue until the user says stop.

---

## Setup — New User Flow

If the user hasn't set up the skill yet, walk them through this:

### 1. Create a Supabase Project
- Go to [supabase.com](https://supabase.com) → New project (free tier is fine)
- Note your **Project URL** and **Anon Key** (Settings → API)

### 2. Run the Database Schema
- In Supabase Dashboard → SQL Editor
- Run the contents of `skill-annotate/setup.sql`
- This creates the `annotations` table with the right columns and RLS policies

### 3. Add Env Vars to Vercel
In your Vercel project settings → Environment Variables, add:
```
ANNOTATE_SUPABASE_URL=https://your-project.supabase.co
ANNOTATE_SUPABASE_ANON_KEY=your-anon-key
```

Also add to your local `.env.local` for development.

### 4. Add the Widget to Your App
- See `skill-annotate/widget/README.md` for drop-in instructions
- Typically: import the widget script and call `initAnnotate()` in your layout

### 5. Add the 3 API Routes
Copy from `skill-annotate/api/` into your app's API directory:
- `annotations-list.ts` — GET, returns annotations by status
- `annotation-create.ts` — POST, creates a new annotation
- `annotation-update.ts` — PATCH, updates status/thread

### 6. Deploy
```bash
git add . && git commit -m "feat: add annotation widget and API routes"
vercel --prod
```

### 7. Test It
- Open your deployed app
- Click an element while holding the annotation key (default: `Alt+Click`)
- Add a comment, set severity, submit
- Ask Ray: "check my annotations"

Full Supabase setup details: `skill-annotate/README-supabase.md`
Widget customization: `skill-annotate/widget/README.md`

---

## API Reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/annotations-list?status=pending` | Fetch annotations by status |
| POST | `/api/annotation-create` | Create annotation (widget does this) |
| PATCH | `/api/annotation-update` | Update status, add thread message |

**Valid statuses:** `pending` → `acknowledged` → `resolved` / `dismissed`

**Severity levels:** `blocking`, `important`, `suggestion`

**Intent types:** `fix`, `change`, `question`, `approve`

---

## Error Handling

| Error | Action |
|-------|--------|
| API returns 404 | API routes not deployed. Tell user to add them (see Setup step 5). |
| API returns 500 | Supabase connection issue. Check env vars are in Vercel. |
| Empty selector match | Dismiss annotation with note "selector not found in codebase" |
| Env vars missing | Stop and point to README-supabase.md |
| App URL unknown | Ask user before proceeding |
