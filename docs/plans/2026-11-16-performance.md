# Portfolio performance implementation plan

> Workflow: Superpowers systematic-debugging, writing-plans, test-driven-development, requesting-code-review, verification-before-completion. Execute in this session under the user's authorization to complete and test the optimization.

**Goal:** Reduce startup bandwidth and unnecessary rendering while preserving all normal-motion visuals, timing, resolution, and interactions.

**Architecture:** Keep GSAP/Lenis and all 49 hero frames. Prepare the existing WebGL carousel near the viewport instead of during startup. Keep the poster fallback until video textures are usable. Scope continuous animation work to visible elements and replace layout-triggering decorative line reveals with equivalent transforms.

**Tech stack:** Next.js 16.3.5, React 19, GSAP, Lenis, Three.js, Playwright/Chromium.

## 1. Establish production baseline and regression tests

- Add `scripts/performance-audit.mjs` for cold-load network, long tasks, layout counts, animation frame timing, and screenshots using Chromium.
- Add `tests/performance.spec.ts` and `playwright.config.ts` for desktop/mobile interactions, deferred resources, hero drawing, reduced motion, and media pause/resume.
- Run the production build at port 3100. Record baseline results in `docs/performance/`.
- Observe deferred-carousel/media tests fail before changing application code.

## 2. Defer work that is not yet visible

- Modify `src/components/sites/tomdekoning/motion.ts` to prepare carousel resources only within a generous viewport margin and clean up observer/pending initialization on teardown.
- Remove the unconditional video loading in `intro()`; prepare videos when the work section is nearby.
- Modify `glassCarousel.ts` to retain posters until the first video is ready and handle failed imports/media without hiding the fallback.
- Verify startup sends no MP4 requests or Three.js chunk; verify entering work still initializes the full glass shader and plays videos.

## 3. Remove unnecessary animation work

- In `motion.ts`, stop offscreen star updates, avoid rewriting unchanged counter text, and use transform reveals for decorative lines.
- Preserve sequence timing and resolution. Verify all 49 frames remain available and replay correctly on reverse scroll.
- Ensure reduced-motion uses a visible static hero and avoids fetching unused frames/3D code.
- Re-run interactions, viewport resize, reduced-motion, video pause/resume, and resource tests.

## 4. Verify and review

- Run `npm run check` and the complete browser suite against the production build.
- Re-run the same audit scenarios for desktop and mobile, including CPU/network throttling.
- Compare screenshots and inspect the hero, scroll sequence, gradient text, button hover, work drag/wheel, video playback, cursor, footer marquee, and contact links.
- Request an independent Superpowers code review; resolve substantive findings.
- Save measured results and limitations in `docs/performance/README.md`. Do not claim device-wide frame rates from local browser timings.
