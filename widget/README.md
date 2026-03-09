# AnnotateWidget

A drop-in UI annotation tool. Lets users click any element on a page, write feedback, and submit it to your backend. No build step, no dependencies — just one vanilla JS file.

---

## How it works

1. A floating **✏️ button** appears in the bottom-right corner
2. Clicking it enters **annotation mode** — hovering elements highlights them
3. Clicking any element opens a **popup** with a comment field, intent selector, and severity picker
4. On submit, a JSON payload is POSTed to your API endpoint
5. A toast confirms success (or error)
6. Press **ESC** to exit annotation mode at any time

---

## Payload sent on submit

```json
{
  "session_id": "aw-l8k3jf-x9z2",
  "url": "https://yourapp.vercel.app/dashboard",
  "element": "button",
  "element_path": "body > main > .hero-section > button.cta",
  "comment": "This CTA is too small on mobile",
  "intent": "fix",
  "severity": "important",
  "x": 482.0,
  "y": 640.5,
  "bounding_box": { "x": 400, "y": 620, "width": 160, "height": 44 },
  "css_classes": "cta btn-primary",
  "nearby_text": "Get started today",
  "selected_text": ""
}
```

---

## Integration

### 1. Next.js (App Router — `layout.js`)

```jsx
// app/layout.js
import Script from 'next/script'

export default function RootLayout({ children }) {
  const annotateEnabled = process.env.NEXT_PUBLIC_ANNOTATE_ENABLED === 'true'

  return (
    <html lang="en">
      <body>
        {children}

        {annotateEnabled && (
          <>
            <Script
              src="/annotate-widget.js"   {/* put the file in /public */}
              strategy="afterInteractive"
            />
            <Script id="annotate-init" strategy="afterInteractive">
              {`AnnotateWidget.init({ apiUrl: '/api/annotate', enabled: true })`}
            </Script>
          </>
        )}
      </body>
    </html>
  )
}
```

> **Place `annotate-widget.js` in your `/public` folder** so Next.js serves it statically.

---

### 2. Next.js (Pages Router — `_app.js`)

```jsx
// pages/_app.js
import { useEffect } from 'react'
import Script from 'next/script'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />

      {process.env.NEXT_PUBLIC_ANNOTATE_ENABLED === 'true' && (
        <Script
          src="/annotate-widget.js"
          strategy="afterInteractive"
          onLoad={() => {
            window.AnnotateWidget?.init({ apiUrl: '/api/annotate', enabled: true })
          }}
        />
      )}
    </>
  )
}
```

---

### 3. Plain HTML app

Drop the script at the bottom of `<body>`, then call `init()`:

```html
<!DOCTYPE html>
<html>
  <head>...</head>
  <body>

    <!-- Your app content -->

    <!-- AnnotateWidget — add just before </body> -->
    <script src="/annotate-widget.js"></script>
    <script>
      AnnotateWidget.init({
        apiUrl: '/api/annotate',
        enabled: true
      })
    </script>
  </body>
</html>
```

---

### 4. CDN / remote script (any HTML app)

If you host the file on a CDN or raw GitHub:

```html
<script src="https://your-cdn.com/annotate-widget.js"></script>
<script>
  AnnotateWidget.init({ apiUrl: 'https://yourapp.vercel.app/api/annotate', enabled: true })
</script>
```

---

## Controlling with environment variables

Only enable the widget in specific environments (staging, preview, etc.) — never in production unless intentional.

### Next.js

In `.env.local` (or Vercel project settings):

```env
NEXT_PUBLIC_ANNOTATE_ENABLED=true
```

Then guard the init call:

```js
AnnotateWidget.init({
  apiUrl: '/api/annotate',
  enabled: process.env.NEXT_PUBLIC_ANNOTATE_ENABLED === 'true'
})
```

Or conditionally render the `<Script>` tag at all (see examples above) — this avoids loading the JS entirely in production.

### Plain HTML / other frameworks

Use your build tool to inject an env flag, or use a query-param pattern for toggling on preview URLs:

```js
const isAnnotateEnabled = new URLSearchParams(location.search).has('annotate')
AnnotateWidget.init({ apiUrl: '/api/annotate', enabled: isAnnotateEnabled })
```

---

## API route (Vercel)

The widget POSTs to your `apiUrl`. Here's a minimal Vercel API route that stores to Supabase:

```js
// app/api/annotate/route.js  (Next.js App Router)
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export async function POST(request) {
  try {
    const body = await request.json()
    const { error } = await supabase.from('annotations').insert([body])
    if (error) throw error
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[annotate] save failed:', err)
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
```

---

## Programmatic control

```js
AnnotateWidget.activate()       // Turn annotation mode on
AnnotateWidget.deactivate()     // Turn it off (same as ESC)
AnnotateWidget.isActive()       // → true/false
```

---

## Notes

- All styles are injected via a `<style>` tag with prefixed class names (`annotate-*`) — won't leak into your app
- Session ID is stored in `sessionStorage` — persists per tab, not across tabs
- The widget wraps all DOM operations in `try/catch` — it won't crash your app
- Works on any modern browser (Chrome, Firefox, Safari, Edge)
