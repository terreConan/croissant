# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A personal portfolio for Andrew Shin (CS & EE at Columbia, class of 2030). It has two audiences:

- **Recruiters and hiring managers** looking at experience, research and wins.
- **Peers and friends**: classmates and people met in NYC who want to know who Andrew is.

## Product Purpose

The site should leave a visitor with two things, and neither should be traded for the other:

- **A memorable sense of Andrew as a person**: curious, whimsical, charmed by new things.
- **A credible picture of his work** that a recruiter can scan quickly.

Success: the visitor remembers the site *and* can tell what Andrew has done.

## Positioning

The résumé is the decoration. Each section of experience hangs on an ASCII tree as you scroll:

- school is blue ornaments
- work is red ornaments
- wins are gold ornaments
- side quests are presents
- hobbies are polaroids
- contact is the star

A season toggle turns the tree into a summer beach scene: flags, beach balls and the sun. The site works as a portfolio and as a small interactive piece at the same time.

## Operating Context

- It's a single page. The sections are about, school, work, wins, side quests, hobbies ("off the clock") and say hi.
- People mostly arrive from a shared link: a résumé, LinkedIn, Instagram or GitHub.
- The hobby polaroids open a lightbox of photos.
- Work entries link out to live projects, a PDF poster and a demo video.

## Capabilities and Constraints

- **Stack:** static HTML/CSS/JS (`index.html`, `style.css`, `tree.js`), with no framework and no build step. It's deployed as Cloudflare Workers static assets (`wrangler.jsonc`, with `.assetsignore` excluding the non-site files). For local preview, `python3 serve.py` serves on port 4173 and supports Range requests so the video can be seeked.
- **Not fixed:** the static/no-framework setup is how the site works today. Andrew did not make it a binding commitment.
- **Tree wiring:** elements with `data-tree` get an object on the tree. `data-summer` holds the summer version of the wording.
- **Fixed:** the ASCII tree and the winter/summer toggle must survive any future design work.

## Brand Commitments

- **Voice:** lowercase, casual and conversational for personal copy ("hey! i'm andrew…", "say hi", "side quests"). Proper nouns and organization names keep their normal capitalization. This is binding.
- **Fixed signature elements:** the scroll-to-decorate ASCII tree, and the season toggle ("A little breeze?" / "A little warmth?") with its beach variant. Both are binding.
- **Pixel favicon:** `favicon.png` and `apple-touch-icon.png`.

## Evidence on Hand

- **Org logos:** `assets/logos/`. Columbia crown, Columbia Space Initiative, Brown, SEP (Stanford Encyclopedia of Philosophy), Camp Lapu-lapu.
- **Work imagery** in `assets/work/`:
  - InPhO site
  - Harmonization research poster (JPG and PDF)
  - Columbia Space Initiative HUD mockup
  - CUTC photo
  - Double Pendulums screenshots
  - Philodom banner
  - Project GPT Plus poster and demo video (`.mp4`)
- **Personal photos:** `assets/photos/museums/`, `travel/` and `friends/`.
- **Stated results:**
  - SEP reaches 300,000 weekly readers.
  - 1st place, CS & Systems Software, 71st GSDSEF.
  - International Logic Olympiad: 2nd and 4th worldwide.
  - ACSL Gold Medalist.
  - Conrad Innovator.
  - Project GPT Plus reached 2,000 students.
- **Not on hand:** testimonials, quotes and press. Do not invent any.

## Product Principles

1. **Personality and credibility carry equal weight.** A recruiter scanning fast should still get the facts. A friend should still get the person.
2. **The tree is the structure, not a gimmick.** Sections and decorations stay mapped one-to-one, so new content gets its own ornament.
3. **Use Andrew's own words.** Keep his lowercase, offhand voice and don't swap in polished marketing copy.
4. **Real things only.** Every claim and image is his actual work and life.
