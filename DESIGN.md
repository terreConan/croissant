---
name: Andrew Shin
description: A portfolio that hangs on an ASCII tree, with experience, projects and a season to switch.
colors:
  espresso: "#2a1b12"
  parchment: "#cfc7ba"
  driftwood: "#9a8e7f"
  cream: "#f4eee3"
  ember-tip: "#3a281c"
  espresso-veil: "rgba(30, 19, 12, 0.82)"
  beach-towel-blue: "#2b3dc3"
  summer-text: "#e3e7ff"
  summer-dim: "#b8c0f5"
  summer-strong: "#ffffff"
  summer-tip: "#1f2c98"
  summer-veil: "rgba(22, 32, 120, 0.8)"
  ornament-blue: "#5492ff"
  ornament-red: "#f11c22"
  ornament-gold: "#ffbf32"
  star-gold: "#ffe654"
  flag-blue: "#8ce0ff"
  flag-red: "#ff463e"
  flag-yellow: "#ffe046"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, Helvetica Neue, Helvetica, Segoe UI, Arial, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, Helvetica Neue, Helvetica, Segoe UI, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.6
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Helvetica Neue, Helvetica, Segoe UI, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.6
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Helvetica Neue, Helvetica, Segoe UI, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "ui-monospace, SF Mono, SFMono-Regular, Menlo, Consolas, Liberation Mono, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  photo: "3px"
  shot: "6px"
  full: "50%"
spacing:
  xs: "2px"
  sm: "10px"
  md: "16px"
  lg: "22px"
  xl: "72px"
  gutter: "clamp(24px, 6vw, 110px)"
  section: "16vh"
components:
  season-toggle:
    textColor: "{colors.parchment}"
    typography: "{typography.body}"
    padding: "6px 0"
  season-toggle-hover:
    textColor: "{colors.cream}"
  nav-link:
    textColor: "{colors.driftwood}"
    typography: "{typography.label}"
  nav-link-hover:
    textColor: "{colors.cream}"
  card-title:
    textColor: "{colors.cream}"
    typography: "{typography.title}"
  shot:
    rounded: "{rounded.shot}"
    width: "100%"
  tooltip:
    backgroundColor: "{colors.ember-tip}"
    textColor: "{colors.cream}"
    padding: "3px 8px"
  contact-link:
    textColor: "{colors.cream}"
    typography: "{typography.body}"
---

# Design System: Andrew Shin

## Overview

**Creative North Star: "The Terminal Hearth"**

The warmth here is made of code. The left side of the screen is a living ASCII tree: a 3D point cloud drawn as monospace characters, with a soft glow behind it. The right side is a narrow column of text. Everything is small and set in the system typeface. The column sits on the same espresso background as the tree, with no boxes around it, so the text reads like notes left beside a fire. Switch the season and the room turns into a bright beach afternoon. The whole page changes over, but the column stays put and keeps the same rules.

The text side is **precise and understated**:

- It uses one typeface family and one size (15px).
- Hierarchy comes from brightness, never from size.
- The labels are small and monospace.
- Spacing is exact and nothing is there for decoration.

All the expression belongs to the tree. The column's job is to be quietly legible while the tree is the thing you look at.

**Key Characteristics:**
- **The page is two layers.** A fixed full-viewport canvas (the tree) sits behind a text column that scrolls on the right.
- **Hierarchy is luminance.** Strong, text and dim levels at one size, with no type scale beyond the 26px name.
- **One mono voice for labels.** The nav, hints, meta and footer are all 12px monospace.
- **Completely flat.** There are no boxes, borders or shadows on the text side.
- **Two complete themes.** Winter (espresso) and summer (beach towel blue) swap every neutral.
- **Colour is borrowed.** It appears in the text only when a card's ornament lights up on the tree.

## Colors

The palette is a warm, low-contrast neutral ramp on near-black brown, with saturated ornament colours that live on the tree. Summer swaps the whole neutral ramp for blue.

### Primary
- **Espresso** (`espresso`): the winter page. It's the background of both the body and the tree stage, and the browser `theme-color`. Its warmth is the hearth.
- **Beach Towel Blue** (`beach-towel-blue`): the summer page. It replaces Espresso everywhere when `data-theme="summer"` is set, and `theme-color` follows it.

### Tertiary (tree-owned accents)
These are drawn by the tree and exposed to the text only through the runtime `--accent` property. The value is the ornament's colour × 1.1, clamped.

| Ornament | Section | Winter token | Summer token |
|---|---|---|---|
| Blue ornament / blue flag | school | `ornament-blue` | `flag-blue` |
| Red ornament / red flag | work | `ornament-red` | `flag-red` |
| Gold ornament / yellow flag | wins | `ornament-gold` | `flag-yellow` |
| Star / sun | contact | `star-gold` | — |

Presents, beach balls and polaroids take their colour from their own geometry.

### Neutral

Winter neutrals:
- **Parchment** (`parchment`): body text and the season toggle.
- **Driftwood** (`driftwood`): secondary text. Used for details, meta, hints, nav links and the footer.
- **Cream** (`cream`): the strong level. Used for the name, card titles, contact links and every hover state.
- **Ember Tip** (`ember-tip`): the tree tooltip's background. It's one step lighter than Espresso.
- **Espresso Veil** (`espresso-veil`): the lightbox scrim, under an 18px backdrop blur.

The summer counterparts match one-to-one:

| Role | Winter | Summer |
|---|---|---|
| Text | `parchment` | `summer-text` |
| Dim | `driftwood` | `summer-dim` |
| Strong | `cream` | `summer-strong` |
| Tooltip | `ember-tip` | `summer-tip` |
| Veil | `espresso-veil` | `summer-veil` |

Section headings (`h2`) are Cream at 600. Their ornament key, e.g. "(red ornaments)", is Driftwood at 400. Summer Dim was lifted to 4.65:1 on Beach Towel Blue to pass AA.

### Named Rules
**The Tree Owns Colour Rule.** The text column is neutral. Saturated colour appears there only when a card's matching ornament lights up: the card title takes `--accent` when the card is lit from the tree, hovered with a mouse, or holds focus. Don't add accent colours to links, keys, buttons or backgrounds.

**The Whole-Season Rule.** Every neutral has a summer counterpart. A new colour is incomplete until it's defined under both `:root` and `:root[data-theme="summer"]`.

## Typography

**Display, body and title font:** the system UI sans (`-apple-system`, `BlinkMacSystemFont`, Helvetica Neue, then Segoe UI and Arial).

**Label font:** the system monospace (`ui-monospace`, SF Mono, Menlo, Consolas).

**Character:** the sans is neutral and native, so it disappears. The mono labels echo the ASCII tree's characters and tie the column to the canvas.

### Hierarchy
- **Display** (600, 26px, line height 1.2, -0.01em): the name in the hero, and nowhere else.
- **Headline** (600, 15px, 1.6): section headings in Cream, matching card titles in weight so a section never reads weaker than its own entries. Each is followed by a Driftwood `.key` at 400 that names its ornament, e.g. "(red ornaments)".
- **Title** (600, 15px, 1.6): card titles in Cream. They change to the ornament accent when lit.
- **Body** (400, 15px, 1.6): role lines and the about paragraphs, in Parchment. Details use the same size in Driftwood. The column caps at 480px, about 70 characters.
- **Label** (400, 12px mono): the nav, meta ("class of 2030"), the scroll hint, the lightbox position and hint, and the footer. All are lowercase.

Paragraphs use `text-wrap: pretty` so no single word is stranded on a last line.

### Named Rules
**The One Size Rule.** Everything except the name is 15px. Rank comes from weight (600 vs 400) and luminance (strong, text, dim), never from a bigger font.

**The Lowercase Mono Rule.** Labels are 12px monospace and lowercase. They are never uppercase or letter-spaced.

## Layout

- **Desktop (900px and up):**
  - The tree stage is `position: fixed` and fills the viewport.
  - The content column is `min(480px, 42vw)` wide and pinned right with a `clamp(24px, 6vw, 110px)` margin.
  - Sections are flex columns with 16px gaps and 16vh vertical padding.
  - The hero is a full viewport tall, centred vertically, with 10px gaps.
  - The fixed nav sits top-right on the same gutter, at least the column's width, on one line. Behind it, an espresso-to-transparent strip fades out content scrolling underneath. The season toggle sits top-left (26px, 18px).
  - The column ignores pointer events except on its content, so drags fall through to the tree.
- **Rhythm:**
  - Work entries are 72px apart (56px on phone).
  - Other entries are 22px apart. Projects are 15px apart.
  - Images sit 12–18px below their text.
- **Phone (under 900px):**
  - The tree becomes a fixed top band, 46svh tall, with a 24px fade into the background below it. Once the hero is past, it eases to 28svh (0.35s ease-out; instant under reduced motion) so reading gets about 72% of the screen. The canvas re-renders at the new size.
  - The nav sits in the hero, under the hint, as a wrapping lowercase section index.
  - Content runs full width with 24px side padding, starting below the band.
  - Sections use 56px padding and a scroll-margin equal to the compact band.

## Elevation & Depth

The page is flat. Depth comes from only two sources:

- **The tree's own light.** A second canvas, blurred 9px, saturated 1.3× and screen-blended at 45% (28% in summer).
- **The lightbox.** A tinted veil with an 18px backdrop blur.

The one shadow belongs to the photo you've opened in the lightbox (`0 24px 70px rgba(0,0,0,0.6)`). The other photos there are dimmed and lightly blurred.

### Named Rules
**The Flat Column Rule.** Nothing on the text side gets a box, border, background panel or shadow. If something needs separating, use spacing or luminance.

## Shapes

Corners are barely softened:

- Screenshots, banners and video are clipped to a 6px radius.
- Lightbox photos use 3px.
- The only full circle is the season toggle's dot: a 22px ring, half filled, which rotates 180° in summer.
- Images default to a 16/10 crop. Video is 16/9.

## Components

### Season Toggle
This is the signature control: a half-filled ring followed by a lowercase-casual question ("A little breeze?" / "A little warmth?").

- No background or border. The text is Parchment and changes to Cream on hover or focus.
- The dot rotates over 0.4s with an ease curve.
- It's 16px on desktop and 15px on phone.

### Navigation
- A row of lowercase 12px mono words, 18px apart. Each label is the section heading word for word.
- Driftwood at rest, Cream on hover or focus.
- No underline and no active indicator.
- On phone it becomes the section index in the hero.

### Cards / Entries
A card has no container. It's a flex column: an optional logo row, a title, a role line and a detail.

- **Logo row:** the logo (28px tall by default, adjustable per logo with `--h` and `--lift`), then the title, then right-aligned mono meta.
- **Focus:** only the polaroid cards (which open the lightbox) are tab stops. Other cards light up when a link inside them takes focus. Every focus shows a 1px Cream outline at a 4px offset; the accent title is an extra cue, never the only one.

### Shots (media)
- Screenshots, banners and video run full column width with 6px clipped corners.
- Linked shots fade to 85% opacity on hover or focus.
- **Soft shots** (`.soft`): slightly desaturated and blurred, with a radial vignette. Used for photographic banners so they sit back into the espresso.
- **Muted shots** (`.muted`): brightness 0.8 for bright white website screenshots, so they don't flare in the dark room.
- Several images of one destination share one link.
- Paired shots sit side by side with a 12px gap.

### Links
- **Contact links:** Cream text with a Driftwood underline (3px offset). The underline brightens to Cream on hover.
- **Inline detail links:** inherit Driftwood and change to Cream on hover.

### Tree Tooltip
- A plain rectangle in Ember Tip, with 13px Cream text and 3px × 8px padding.
- Reads "<section heading> · <card title>", e.g. "work · InPhO", so the tree and the column share one vocabulary.
- No radius, and it never wraps.
- Follows the hovered ornament.

### Lightbox
- A full-screen veil over the page. It fades in over 0.5s.
- Clicking a polaroid card opens it as a draggable spread of photos.
- It is a modal dialog named after the album. Focus moves in, everything behind is inert, and focus returns to the card on close.
- A mono hint shows the position and how to leave: "5–6 / 32 · scroll · esc to close", or "swipe · tap to close" on touch.

## Do's and Don'ts

### Do:
- **Do** keep every new token paired across winter and summer.
- **Do** rank text by luminance (Cream, Parchment, Driftwood) at 15px. Only the name is larger (26px).
- **Do** use 12px lowercase monospace for any label, meta or hint.
- **Do** give every new section a `data-tree` object and a `.key` naming it, e.g. "(presents)". Give it a summer wording too.
- **Do** keep the Cream focus outline on everything focusable, and remove motion under `prefers-reduced-motion`.
- **Do** name each section once and reuse that word in the nav, heading and tooltip.

### Don't:
- **Don't** put boxes, borders, panels or shadows on the text column.
- **Don't** use ornament colours anywhere in the text except a lit, hovered or focused card title.
- **Don't** make an element a tab stop unless it does something.
- **Don't** add a heading size between 15px and 26px, or uppercase or letter-spaced labels.
- **Don't** let content cover or block the tree on desktop. The column stays right of the gutter and ignores pointer events between items.
