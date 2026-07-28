# Onboarding & Help System

A bespoke, **configuration-driven** onboarding layer: a first-run product tour,
a contextual help panel, one-time page hints, tooltips, and a settings reference.
No external tour library — it's tuned to the warm-editorial theme, uses the
`motion` package already in the project, and is safe on this Next 16 / React 19
build.

## Architecture

| Concern | File |
|---|---|
| **All content** (help copy, tour steps, hints) | `frontend/src/lib/help/content.ts` |
| Global state + persistence | `frontend/src/lib/help/HelpProvider.tsx` |
| Floating "?" button + `?` shortcut | `frontend/src/components/help/HelpButton.tsx` |
| Slide-in contextual help panel | `frontend/src/components/help/HelpPanel.tsx` |
| First-run spotlight tour | `frontend/src/components/help/ProductTour.tsx` |
| One-time first-visit coach-mark | `frontend/src/components/help/ProgressiveHint.tsx` |
| Reusable accessible tooltip | `frontend/src/components/help/Tooltip.tsx` |
| Mounted in | `frontend/src/app/dashboard/layout.tsx` |

Everything the user sees is data in `content.ts`. **You never touch component
code to document a page or add a tour step.**

## How to…

### Document a new page
Add an entry to `HELP_CONTENT` in `content.ts`, keyed by its route:

```ts
"/dashboard/reports": {
  emoji: "📄",
  title: "Reports",
  purpose: "…",
  whenToUse: "…",
  workflow: ["step 1", "step 2"],
  bestPractices: ["…"],
  tips: ["…"],
  commonMistakes: ["…"],
  shortcuts: [{ keys: "R", action: "Refresh" }], // optional
  faqs: [{ q: "…", a: "…" }],
},
```

`getHelp()` resolves by longest-prefix, so `/dashboard/reports/123` inherits the
`/dashboard/reports` entry automatically.

### Add a one-time hint for a page
Add to `PROGRESSIVE_HINTS` (exact route match):

```ts
"/dashboard/reports": { title: "First report?", body: "…" },
```

It shows once, then never again until the user clicks **Reset page hints** in
Settings.

### Add or reorder tour steps
Edit `TOUR_STEPS`. A step either spotlights an element by `target` (a CSS
selector — use a stable `data-tour="…"` anchor) or is a centered card (omit
`target`). Add the matching `data-tour` attribute to the element you want to
highlight.

### Document a configuration setting
Add to `SETTINGS_REFERENCE` in `frontend/src/app/dashboard/settings/page.tsx`.

## Persistence

localStorage keys (device-local):
- `lm.onboarding.tourDone.v1` — set when the tour is finished/skipped.
- `lm.onboarding.hintSeen.v1:<route>` — per-page hint dismissal.

Bump the `.v1` suffix to re-show onboarding to everyone after a major revamp.
To persist across devices instead, back these with a `profiles` column + endpoint
and swap the `lsGet/lsSet` calls in `HelpProvider.tsx`.

## Accessibility
- Help panel & tour are `role="dialog"` + `aria-modal`; **Esc** closes both.
- Tour is fully keyboard-driven: **→/Enter** next, **←** back, **Esc** skip.
- `?` opens contextual help (ignored while typing in a field).
- Panel moves focus in on open and restores it on close.
- Tooltip is `role="tooltip"` and reveals on keyboard focus, not just hover.
- All overlays are responsive (full-width on mobile) and re-openable anytime.
