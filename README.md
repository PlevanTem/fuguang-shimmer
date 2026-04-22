# Shimmer · 浮光

> Upload one photo. Get a color-block diary page.
> 浮光 — 用一张照片，生成属于你的色彩日记。

A niche aesthetic image design tool. Extracts a photo's main colors, stitches it
with a solid color block, and lets you decorate with shapes (solid or cutout).
100% client-side — nothing is uploaded.

**Two playbooks (mirrors 小红书 colour-walk content):**

1. **Color Block** — upload → auto-extract palette → stitched composition with
   auto caption (`cinnamon, 7:48 pm` style).
2. **Creative Collage** — on top of the block, drop shapes (dot, drop, star,
   heart, music note, wave, triangle, hex) in `solid` or `cutout` mode. Cutouts
   punch through the block and reveal the underlying photo.

## Stack

- Vite 5 + TypeScript 5 (strict) — vanilla DOM, no framework
- Canvas 2D for the editor; median-cut for palette extraction
- Google Fonts for `DM Serif Display Italic`, `Inter`, `JetBrains Mono`
- No runtime deps

Total build: ~12 KB gzipped.

## Dev

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # typecheck + bundle to ./dist
npm run preview   # serve the built bundle locally
npm run typecheck # tsc --noEmit
```

## Project layout

```
.
├── .github/workflows/deploy.yml   # GitHub Actions → Pages
├── index.html                     # editor shell (3-pane)
├── public/favicon.svg
├── src/
│   ├── main.ts                    # bootstrap + UI wiring
│   ├── style.css                  # tokens + editor chrome
│   ├── state.ts                   # tiny observable store
│   ├── types.ts                   # Composition / Shape types
│   ├── palette.ts                 # median-cut + color-name matching
│   ├── shapes.ts                  # shape Path2D library
│   └── render.ts                  # canvas composition (image + block + cutout + caption)
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Deploy to GitHub Pages

Everything is wired. Just:

1. Create a repo on GitHub and push this directory to it.
2. In the repo → **Settings → Pages → Build and deployment → Source**, choose
   **GitHub Actions**.
3. Push to `main`. The workflow at `.github/workflows/deploy.yml` builds with
   `VITE_BASE=/<repo-name>/` and publishes `dist/` to Pages.

The site will appear at `https://<your-username>.github.io/<repo-name>/`.

### Deploying elsewhere (Vercel / Netlify / Cloudflare Pages)

`vite.config.ts` defaults to `base: './'`, so the plain output works on any
static host with zero config. Just build and publish `dist/`.

For a custom domain on GitHub Pages, add `VITE_BASE=/` as a repo variable
(or edit the workflow) to override the subpath.

## Keyboard / input shortcuts

- **Upload**: click the drop zone, drag-and-drop onto the editor, or paste
  (Ctrl/Cmd + V) an image from the clipboard.
- **Export**: top-right button — exports a 2000px PNG in the current ratio.
- **Reset**: clears shapes & text overrides without losing the uploaded photo.

## Roadmap

Current build covers the MVP (玩法一 fully + 玩法二 basic shapes). Next up:

- Drag / resize / rotate individual shapes (currently click-to-add only)
- Text-mask layer (reference image ③ — a word repeated as a shape cloud)
- Undo / redo history
- GIF input & GIF export
- Custom shape upload → auto-trace via potrace-wasm
- Templates & preset compositions
