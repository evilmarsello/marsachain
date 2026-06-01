# Mini App icons (web)

## Why not Android `.xml`

**Vector Drawable** files (`res/drawable/*.xml`) and **mipmap** assets from Android Studio **are not used in the browser**. The web app uses **SVG**, **PNG** (or **WebP**).

Recommendation: export from Figma / Android Studio vector export → **SVG**; for complex raster buttons — **PNG @1x and @2x** (e.g. `name.png` and `name@2x.png`, or only `@2x` with half `width`/`height` in CSS).

## Where to put files

Directory **`webapp/public/icons/`** is served at **`/icons/…`** (Vite copies `public/` as-is).

Example in HTML/template:

```html
<img src="/icons/section-wallet.svg" alt="" width="22" height="22" loading="lazy" />
```

## Names (convention with code)

Add files as needed; you can reference:

| File (example) | Purpose |
|----------------|---------|
| `section-node.svg` | “Node / network” block |
| `section-wallet.svg` | wallet / balance |
| `section-mining.svg` | mining |
| `section-mempool.svg` | mempool |
| `section-validators.svg` | validators |
| `section-telegram.svg` | Telegram / security |
| `app-logo.png` | header logo (copy of Android `res/drawable/logo.png`) |
| `ic_wallet.svg` / `.png` | bottom tab “Wallet” (like Android `@drawable/ic_wallet`) |
| `ic_mining.svg` | “Mining” tab |
| `ic_settings.svg` | “Settings” tab |

Tabs currently use **inline SVG** in code; if you add files with these names, you can switch to `<img src="/icons/ic_wallet.svg" …>` later.

Names **do not have to match exactly** — after adding a file, wire it in `main.ts` (e.g. `card-ico` class) or CSS `background-image`.

## Format

- **SVG** — scales well, small size; check `viewBox` and color (`currentColor` lets CSS control fill).
- **PNG** — shadows/gradients like Android; use 2× size or a separate `@2x` for Retina.

Brand colors: `android-client/app/src/main/res/values/colors.xml` and `drawable/primary_button_background.xml` (`#BC5A2B` buttons, `#FF9500` accent text).
