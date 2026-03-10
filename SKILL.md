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

## Setup — Guided First-Time Flow

**Trigger:** User says "set up annotate", "set up skill-annotate", "annotate setup", or env vars are missing when they try to use the skill.

Run this as a conversation — don't dump all steps at once. Walk them through one step at a time, confirm before moving to the next.

---

### Step 0 — Check if already set up

```bash
echo $ANNOTATE_SUPABASE_URL
echo $ANNOTATE_SUPABASE_ANON_KEY
```

If both are set and non-empty → skip to "Test It" section. Already configured.

If missing → start the guided flow below.

---

### Guided Flow (one step at a time)

**Open with:**
> "Let's get skill-annotate set up. It takes about 3 minutes. I'll walk you through each step — just confirm when you're ready to move on."

---

**Step 1 — Create a free Supabase project**

Say:
> "First, go to supabase.com and create a free project. Name it anything — 'skill-annotate' works.
> Once it's provisioned (takes ~30 seconds), let me know and I'll tell you what to grab."

Wait for confirmation. Then:

> "Perfect. Now go to:
> **Project Settings → API**
>
> You'll see two things — copy both:
> 1. **Project URL** — looks like `https://xxxxxxxxxxx.supabase.co`
> 2. **anon / public key** — a long string starting with `eyJ...`
>
> Paste them here when you have them."

When user pastes the values — store them mentally for the next steps.

---

**Step 2 — Run the database schema**

Say:
> "Now go to the **SQL Editor** in your Supabase dashboard (left sidebar).
> Create a new query and paste this SQL — it creates the annotations table and security rules:"

Then output the full contents of `skill-annotate/setup.sql` in a code block.

Say:
> "Click **Run**. You should see 'Success, no rows returned'. Let me know when done."

---

**Step 3 — Add env vars to OpenClaw**

Say:
> "Now I'll save your Supabase credentials to your OpenClaw environment so every app can use them.
> Run these two commands in your terminal:"

```bash
openclaw env set ANNOTATE_SUPABASE_URL="<their project URL>"
openclaw env set ANNOTATE_SUPABASE_ANON_KEY="<their anon key>"
```

Or, if OpenClaw env CLI isn't available, tell them to add to `~/.openclaw/openclaw.json` under `env`:
```json
{
  "env": {
    "ANNOTATE_SUPABASE_URL": "https://xxx.supabase.co",
    "ANNOTATE_SUPABASE_ANON_KEY": "eyJ..."
  }
}
```

Say:
> "This is a one-time step. Every app you annotate in the future will reuse the same Supabase project — no new setup needed."

---

**Step 4 — Add the widget + API routes to an app**

Say:
> "Now let's add the widget to one of your Vercel apps. Which app do you want to annotate first? Give me the repo path on your machine."

Once they give the path:

1. Check the framework:
```bash
cat <repo>/package.json | grep '"next"\|"remix"\|"svelte"\|"nuxt"'
```

2. Copy the 3 API route files to the right location:
   - **Next.js (app router):** `app/api/annotations-list/route.ts`, `app/api/annotation-create/route.ts`, `app/api/annotation-update/route.ts`
   - **Next.js (pages router):** `pages/api/annotations-list.ts`, `pages/api/annotation-create.ts`, `pages/api/annotation-update.ts`
   - **Other:** ask the user where their API routes live

3. Inject widget script into their layout file. Find it:
```bash
find <repo>/app -name "layout.tsx" | head -3
find <repo>/pages -name "_app.tsx" | head -3
```

Add before `</body>`:
```html
<script
  src="https://cdn.jsdelivr.net/gh/raytheghar-alt/skill-annotate/widget/annotate.js"
  data-app-url="https://yourapp.vercel.app"
></script>
```

Replace `data-app-url` with their actual deployed URL.

Say:
> "I've added the API routes and widget. Ready to deploy?"

---

**Step 5 — Deploy**

```bash
cd <repo>
git add .
git commit -m "feat: add skill-annotate widget and API routes"
git push
vercel --prod
```

Say:
> "Deploying. Give it a minute and then open your live app."

---

**Step 6 — Test it**

Say:
> "Open your deployed app. You should see a small floating panel on the right edge of the screen.
>
> Click the panel to open it, then click any element on your page. A tooltip will appear — write some feedback, set severity, hit Submit.
>
> Then come back here and say: **'check my annotations'** — I'll pick it up and show you what I found."

---

**Wrap-up message after full setup:**

> "You're set up. Here's how it works going forward:
>
> — Anyone can drop annotations on your app (the panel is always visible)
> — Feedback persists in Supabase, scoped to your app URL
> — When you're ready for fixes, just say: **'check my annotations'**
> — I'll read the queue, fix the code, and mark everything resolved
>
> For any new app: just copy the 3 API routes + add the widget script. One-time per app, nothing else to configure."

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
