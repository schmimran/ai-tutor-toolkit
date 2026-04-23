# Axiom AI Tutor — UI Style Guide

This is the active style guide for the production frontend.  The Warm Red palette and layout described here are implemented across three stylesheets: `apps/web/public/styles.css` (main chat page), `apps/web/public/login.css` (login page), and `apps/web/public/layout.css` (shared shell for admin, settings, and history pages).  Use this document as a reference when adding new UI components or pages.

---

## Color Tokens

These replace the old dark-purple/cyan palette. The canonical `:root` block lives in `styles.css` (for the main chat page), `login.css` (for the login page), and `layout.css` (shared across admin, settings, and history pages). When adding a new page that uses the shared shell, load `layout.css` rather than copying the token block.

```css
:root {
  /* ── Backgrounds ── */
  --bg:           #fffdf7;   /* page / chat canvas — warm off-white */
  --surface:      #ffffff;   /* cards, bubbles, panels */
  --surface-alt:  #fffbf7;   /* sidebar, input bar bg */

  /* ── Primary (tomato red) ── */
  --accent:       #e8392a;   /* buttons, active states, logo box */
  --accent-dark:  #c42d1e;   /* hover / pressed */
  --accent-light: #fee2e2;   /* active nav bg, light tints */

  /* ── Tutor / secondary accent (amber) ── */
  --tutor-accent:       #f97316;   /* tutor bubble left-border, typing dots, AXIOM label */
  --tutor-accent-light: #fff7ed;   /* tutor bubble bg (optional warm tint) */

  /* ── Student bubble ── */
  --student-bubble: #fef9c3;   /* warm yellow — student chat messages */
  --student-text:   #3d2000;   /* dark warm brown for legibility on yellow */

  /* ── Header / brand panel ── */
  --header-bg:    #b91c1c;   /* main app header + login left panel */

  /* ── Text ── */
  --text:         #1e293b;   /* body copy */
  --text-muted:   #64748b;   /* secondary labels, meta info — must pass WCAG AA on white */

  /* ── Borders ── */
  --border:       #e2e8f0;

  /* ── Dot-grid (chat canvas texture) ── */
  --dot-color:    #fde68a;   /* amber-yellow dots, 1px, 26px grid */

  /* ── Status ── */
  --success: #22c55e;
  --danger:  #ef4444;
}
```

---

## Typography

Load from Google Fonts — add to every page `<head>`:

```html
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
```

| Role | Family | Weight | Notes |
|------|--------|--------|-------|
| Brand wordmark | Nunito | 900 | "Axiom" in header and login panel |
| Headings / nav group labels | Nunito | 700–800 | Section titles, empty-state headline |
| Body / UI | Plus Jakarta Sans | 400–600 | All other text |
| Sub-brand tag ("AI TUTOR") | Plus Jakarta Sans | 600 | 9px, letter-spacing 2.5px, uppercase, 35% opacity |

Base font size: `15px`.

---

## Logo Mark

Inline SVG lightbulb with a yellow lightning bolt inside. Used in three sizes:

**Header / collapsed sidebar (22×22 display, 32×32 viewBox):**
```html
<svg width="22" height="22" viewBox="0 0 32 32" fill="none">
  <!-- bulb dome -->
  <path d="M16 4C10.477 4 6 8.477 6 14C6 17.5 7.9 20.58 10.75 22.35L10.75 25.5Q10.75 26.5 11.75 26.5L20.25 26.5Q21.25 26.5 21.25 25.5L21.25 22.35C24.1 20.58 26 17.5 26 14C26 8.477 21.523 4 16 4Z" fill="white" opacity=".88"/>
  <!-- base rings -->
  <rect x="12.5" y="27.5" width="7" height="1.5" rx=".75" fill="white" opacity=".6"/>
  <rect x="14" y="29.5" width="4" height="1.5" rx=".75" fill="white" opacity=".35"/>
  <!-- inner bolt -->
  <path d="M18 11.5L13.5 17H16.5L13.5 22L20 15.5H17L19.5 11.5Z" fill="rgba(255,220,60,.9)"/>
</svg>
```

**Login brand panel (36×36 display, same viewBox):** same paths, `width="36" height="36"`.

**Logo box container** (header and login panel large mark):
```css
.logo-box {
  background: var(--accent);          /* #e8392a */
  border-radius: 10px;                /* header size */
  box-shadow: 0 4px 14px rgba(232,57,42,0.45);
}
/* Login panel large version: border-radius 18px, box-shadow spread larger */
```

---

## Layout

### Overall shell
```
┌─────────────────────────────────────────────────┐
│  APP HEADER  (64px, var(--header-bg))            │
├──────────┬──────────────────────────────────────┤
│ SIDEBAR  │  MAIN CONTENT                        │
│ 220px    │  flex: 1                             │
│ (or 60px │                                      │
│ collapsed)│                                     │
└──────────┴──────────────────────────────────────┘
```

- Header is **full-width**, always visible — this is the primary branding moment.
- Sidebar is **collapsible**: 220px (open) → 60px icon rail (collapsed). Controlled by hamburger in header.
- Login and Settings are **real full pages**, not overlays or modals.

---

## Header

```
[☰]  [logo-box + Axiom / AI TUTOR]  |  [page title]  ···  [+ New session]  [AC ▾ Alex Chen]
```

- Height: `64px`
- Background: `var(--header-bg)` (`#b91c1c`)
- All text white; muted elements at 35–70% opacity
- Hamburger: 3 lines, `rgba(255,255,255,0.6)`, hover → full white
- Page title: Nunito 700, 15px, `rgba(255,255,255,0.7)`, separated by a 1px white/10% divider
- **+ New session button**: `var(--accent)` bg, white text, `border-radius: 8px`, subtle red shadow
- **User chip**: `rgba(255,255,255,0.07)` bg, 1px `rgba(255,255,255,0.1)` border, `border-radius: 10px`

---

## Sidebar (open — 220px)

- Background: `var(--surface-alt)` (`#fffbf7`)
- Right border: 1px `var(--border)`
- Nav group labels: 10px, 700 weight, 1.8px letter-spacing, uppercase, `#94a3b8`
- Nav links: 13.5px, `#475569`, `border-radius: 9px`, hover `#fff5f5`
- **Active link**: bg `var(--accent-light)` (`#fee2e2`), text `var(--accent-dark)` (`#c42d1e`), weight 700
- Badge (e.g. history count): `var(--tutor-accent)` bg, white text, `border-radius: 10px`
- "soon" labels: italic, `#cbd5e1`
- Footer user row: avatar + name + grade, hover `#fff5f5`

## Sidebar (collapsed — 60px)

- Same bg and border as open
- Icon buttons: 42×42px, `border-radius: 10px`, `#94a3b8`, hover `#fff5f5` / active `var(--accent-light)` + `var(--accent)` color
- Orange dot-badge (8px circle, `var(--tutor-accent)`) on history icon when there are unread sessions
- Avatar at bottom

---

## Chat Canvas

- Background: `var(--bg)` (`#fffdf7`) with dot-grid overlay:
  ```css
  background-color: var(--bg);
  background-image: radial-gradient(var(--dot-color) 1px, transparent 1px);
  background-size: 26px 26px;
  ```
- Content topbar (46px, white, 1px bottom border): session title, meta, subject tag, timer
- Subject tag: `background: #fef3c7; color: var(--accent-dark); border: 1px solid #fde68a`

### Messages

**Student (right-aligned):**
```css
background: var(--student-bubble);   /* #fef9c3 warm yellow */
color: var(--student-text);          /* #3d2000 */
border-radius: 18px 18px 4px 18px;
font-weight: 500;
```

**Tutor / Axiom (left-aligned):**
```css
background: var(--surface);          /* white */
color: var(--text);
border-radius: 4px 18px 18px 18px;
border-left: 3.5px solid var(--tutor-accent);   /* #f97316 orange */
box-shadow: 0 2px 12px rgba(0,0,0,0.07);
```

**"AXIOM" label** above tutor bubble: Nunito 800, 10px, uppercase, 1.2px letter-spacing, `var(--tutor-accent)`.

**Typing indicator:** same styling as tutor bubble; three 8px dots in `var(--tutor-accent)`, bouncing animation.

---

## Input Bar

- Height: `~64px`, white bg, 1.5px top border `#e8eef6`
- Attach button: 40px circle, 1.5px `var(--border)` border, `#64748b` icon
- Input pill: `var(--surface-alt)` bg, 1.5px `var(--border)` border, `border-radius: 20px`
- **Send button**: `var(--accent)` bg, white text, `border-radius: 20px`, red shadow
- **End session**: ghost pill, `var(--border)` border, muted text; hover → `var(--danger)` color

---

## Login Page

Full-page split layout — no floating card, no overlay.

### Left panel (44% width)
- Background: `var(--header-bg)` (`#b91c1c`) — same red as app header
- Centered vertically: large logo box (64px, `border-radius: 18px`) + "Axiom" wordmark (Nunito 900, 34px) + "AI TUTOR" sub-label
- Tagline: 15.5px, `rgba(255,255,255,0.6)`
- Feature bullets: emoji icon in a `rgba(232,57,42,0.4)` rounded badge, 13.5px, `rgba(255,255,255,0.6)`

### Right panel (flex: 1)
- Background: `var(--surface-alt)` (`#fffbf7`)
- Max-width form wrap: 360px
- "Welcome back 👋" heading: Nunito 900, 26px, `var(--text)`
- Tabs (Sign in / Create account): active tab uses `var(--accent)` underline + text color
- Inputs: 44px height, `border-radius: 11px`, focus border `var(--accent)`
- **Sign in button**: full-width, `var(--accent)` bg, `border-radius: 23px`, red shadow
- "Forgot password?" link: `var(--accent)` color

---

## Spacing & Radius Reference

| Element | Border radius |
|---------|--------------|
| Header logo box | 10px |
| Login logo box | 18px |
| Nav links | 9px |
| Icon buttons (collapsed) | 10px |
| Chat bubbles | 18px (flat corner on send/receive edge) |
| Input pill | 20px |
| Send / End session buttons | 20px |
| Form inputs | 11px |
| Sign in button | 23px |
| Subject / count badges | 10–20px |

---

## What NOT to do

- **No dark mode** for now — this is a light-mode-first product targeting high school students.
- **No overlays for pages** — login and settings are real navigable pages (`login.html`, `settings.html`).
- **No institutional blue** — the previous cobalt (#2563eb) and purple (#7c3aed) palettes were explicitly rejected.
- **No Inter font** — Nunito + Plus Jakarta Sans only.
- **No new npm dependencies** in `apps/web/` — the frontend is intentionally dependency-free (CDN only).
- **Do not add a build step** to the frontend.

---

## Reference implementation

`apps/web/public/mockup.html` — a fully working static mockup of all three states (sidebar open, sidebar collapsed, login page). Open it at `http://localhost:3000/mockup.html`.
