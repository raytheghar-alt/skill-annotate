# Supabase Setup — Annotate Skill

This guide gets your Supabase backend ready for the OpenClaw annotate skill in under 5 minutes.

---

## 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **New project**.
3. Pick an organization, give it a name (e.g. `my-app-annotations`), choose a region close to your Vercel deployment, and set a database password.
4. **Free tier is completely fine** — the annotate skill is low-volume by nature.
5. Wait ~1 minute for the project to spin up.

---

## 2. Run the Schema

1. In your Supabase dashboard, go to **SQL Editor** (left sidebar).
2. Click **New query**.
3. Open `setup.sql` from this folder, copy the entire contents, and paste it into the editor.
4. Click **Run** (or `Cmd+Enter`).

You should see a success message. The `annotations` table, indexes, trigger, and RLS policies are now in place.

**You only ever need to run this once.** Re-running is safe (everything uses `IF NOT EXISTS` and `CREATE OR REPLACE`), but there's no reason to repeat it.

---

## 3. Grab Your Credentials

In your Supabase project dashboard:

1. Go to **Project Settings → API** (left sidebar, under the gear icon).
2. Copy two values:
   - **Project URL** — looks like `https://abcdefghijklmnop.supabase.co`
   - **anon / public key** — the long `eyJ...` JWT under "Project API keys"

---

## 4. Set Environment Variables in Vercel

Go to your Vercel project → **Settings → Environment Variables** and add:

### Client-side (if the annotate widget runs in the browser)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_ANNOTATE_SUPABASE_URL` | Your project URL |
| `NEXT_PUBLIC_ANNOTATE_SUPABASE_ANON_KEY` | Your anon/public key |

> Use the `NEXT_PUBLIC_` prefix so Next.js bundles these into the client. Required if the widget sends annotations directly from the browser.

### Server-side only (if you proxy annotations through an API route)

| Variable | Value |
|---|---|
| `ANNOTATE_SUPABASE_URL` | Your project URL |
| `ANNOTATE_SUPABASE_ANON_KEY` | Your anon/public key |

> Without `NEXT_PUBLIC_`, these stay server-side only. Use this if you want an extra layer of indirection (your API route writes to Supabase, the browser never touches it directly).

**Pick one approach and be consistent.** For most setups, the client-side (`NEXT_PUBLIC_`) approach is simpler and works great.

---

## 5. Security Note — The Anon Key Is Fine Here

The Supabase **anon key** is intentionally designed for client-side use. Here's why it's safe in this setup:

- **It's your own project.** There's no other tenant's data in this database — it's just your annotations. Exposure risk is minimal.
- **RLS is enabled.** Row Level Security is on, and the policies only allow `SELECT`, `INSERT`, and `UPDATE`. The anon role cannot `DELETE` rows or access any Supabase internal tables.
- **`DELETE` is blocked by design.** To discard an annotation, set `status = 'dismissed'`. This preserves the feedback history.
- **No sensitive data.** Annotations contain UI feedback and element paths — nothing that warrants secret-level protection.

If you're in a stricter environment (e.g. annotating an internal tool with confidential UI), consider proxying writes through a server-side API route and keeping the key out of the browser bundle.

---

## What Ray Does With This

Once annotations are flowing in, Ray (your OpenClaw agent) can:

- **List pending annotations** — `SELECT * FROM annotations WHERE status = 'pending' ORDER BY created_at DESC`
- **Acknowledge or resolve** — update `status`, set `resolved_at` and `resolved_by`
- **Reply in thread** — append to the `thread` jsonb array with `{id, role: "agent", content, timestamp}`
- **Filter by page** — `WHERE url = 'https://yourapp.com/dashboard'`
- **Filter by severity** — `WHERE severity = 'blocking'`

The schema is designed so Ray can act on feedback without needing browser access to your app.

---

## Troubleshooting

**"permission denied for table annotations"**
→ RLS is on but a policy is missing. Re-run `setup.sql` — the policies are idempotent.

**"relation annotations does not exist"**
→ The SQL didn't run successfully. Check the SQL Editor for errors and re-run.

**Annotations not appearing in Supabase**
→ Check your env vars are set and the Vercel deployment was re-deployed after adding them. Also check browser console for Supabase client errors.

---

*Part of the OpenClaw `annotate` skill. See `SKILL.md` for the full skill documentation.*
