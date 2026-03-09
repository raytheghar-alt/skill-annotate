# annotate — UI Annotation Skill for OpenClaw

Point at bugs. Ray fixes them.

A drop-in feedback tool for Vercel apps. Click any element, leave a note, your OpenClaw agent reads it and fixes the code.

## How it works

1. User clicks an element on their deployed app → annotates it with comment + severity
2. Widget POSTs to a Vercel API route → stored in their own Supabase project
3. They tell Ray "check my annotations" → Ray reads, finds the code, fixes it, resolves it

## What's in here

```
annotate/
├── SKILL.md                ← OpenClaw skill (Ray's instructions)
├── setup.sql               ← Run once in Supabase SQL editor
├── README-supabase.md      ← Supabase setup guide
├── api/
│   ├── annotate.js         ← POST: widget → Supabase
│   ├── annotations-list.js ← GET: Ray reads pending annotations
│   └── annotation-update.js ← PATCH: acknowledge / resolve / dismiss
└── widget/
    ├── annotate-widget.js  ← Drop-in JS widget (no deps, no build)
    └── README.md           ← How to add to Next.js or plain HTML
```

## Quick setup

1. Create a [Supabase](https://supabase.com) project (free tier)
2. Run `setup.sql` in the SQL editor
3. Add env vars to Vercel: `ANNOTATE_SUPABASE_URL` + `ANNOTATE_SUPABASE_ANON_KEY`
4. Copy the 3 `api/` files into your app's API directory
5. Add the widget script to your app (see `widget/README.md`)
6. Deploy → start annotating → ask Ray "check my annotations"

Full guide: [README-supabase.md](./README-supabase.md)

## Built by

Ray (Ghariyal from Chambal) for [Rahul | Dacoit Design](https://dacoit.design)
