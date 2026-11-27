# Let's Explore Lake Wilson

Website for **Let's Explore**, Cabin 102 at The Cove at Doublehead on Wilson Lake (Town Creek, Alabama): <https://www.letsexplorewilsonlake.com> (the bare domain redirects here)

A plain static site: no build step, no dependencies. Vercel serves the files as-is.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The whole page (all sections, text and links) |
| `styles.css` | All styling |
| `gallery.js` | Photo carousel and full-screen lightbox |
| `gallery/` | The 14 carousel photos. To add or reorder photos, edit the list at the top of `gallery.js` |
| `cabin-6351.jpg`, `cabin-6090.jpg` | Hero and Doublehead section backgrounds |
| `lake-walkthrough.mp4`, `lake-walkthrough-poster.jpg` | Video tour |
| `vercel.json` | Caching and security headers |

Booking is the Hospitable direct-booking widget (the `cdn.hsptb.com` script in the `#book` section of `index.html`). Rates, availability and payments are managed in Hospitable, not here.

## Preview locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploying

Every push to `main` deploys to production on Vercel. Other branches get preview URLs.

## History

Moved Nov 2026 from a ChatGPT-built Next.js/Vinext app on Cloudflare to this static rebuild. Content and design are unchanged.

## Visitor analytics (`/admin`)

First-party, no cookies, no third parties. `track.js` sends what each visit does to `/api/t`; the dashboard at `/admin` reads it back through `/api/admin`.

- **Recorded:** referrer / UTM campaign, device, browser, OS, screen and window size, language, time zone, city-level location (from Vercel's `x-vercel-ip-*` headers), scroll depth, time on each section, every click (label and link, with dead clicks and rage clicks flagged), gallery photos chosen, video plays and progress, booking-calendar focus, copied text, page errors, tab switches.
- **Not recorded:** IP addresses, keystrokes or form contents, anything inside the booking widget. Visitors whose browser sends Global Privacy Control, automated browsers and bots are skipped. `/privacy` describes this; keep it in sync with `track.js`.
- **Storage:** Neon Postgres (tables `lw_sessions`, `lw_events`, created automatically on first use).
- **Retention:** 90 days (older visits are swept automatically).
- **Setup (once):** in Vercel, add **Neon** from the Marketplace (free plan) and connect it to this project (sets `DATABASE_URL`), and add an `ADMIN_KEY` environment variable of 16+ random characters. Redeploy. Without a database, tracking is accepted and dropped silently.
- **Your own visits:** open `/admin` on each of your devices and press "Don't count this device".
- **Files:** `track.js`, `api/t.js`, `api/admin.js`, `lib/analytics.cjs`, `lib/store.cjs`, `admin/`, `privacy.html`, `package.json` (Neon driver).
- **Tests:** `npm install && npm test` (the Postgres test needs local PostgreSQL binaries and skips without them); local site with working API: `node tests/dev-server.cjs` → http://127.0.0.1:8766 (admin key `local-admin-key-123`).
