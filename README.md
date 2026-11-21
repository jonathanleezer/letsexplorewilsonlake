# Let's Explore Lake Wilson

Website for **Let's Explore**, Cabin 102 at The Cove at Doublehead on Wilson Lake (Town Creek, Alabama): <https://letsexplorewilsonlake.com>

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
