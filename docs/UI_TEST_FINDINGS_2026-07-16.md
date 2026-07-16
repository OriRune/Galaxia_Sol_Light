# Galaxia UI Test Findings

**Date:** 2026-07-16

**Original environment:** Codex in-app browser, 1280 x 720 viewport, an unverified process at `http://127.0.0.1:5173`

**Scope:** Exploratory UI, control, interaction, visual-layout, runtime-health, and basic accessibility-name testing.

## Test-environment correction

During remediation on 2026-07-16, the markup served on port 5173 was compared with the current workspace source and found not to match. The observed page used labels and roles absent from the current `src/app/App.tsx`, including a `Mode` navigation label instead of the current `Modes` tablist and different status/control copy. A stale or unrelated local process was already bound to the default port.

The original findings below are retained as investigation history. Each now includes its disposition from the isolated current-workspace regression pass.

## Summary

The original high-, medium-, and low-impact reports were **not reproduced** in the current workspace. A new Chromium regression suite exercised the current application at 1024 by 768, 1280 by 720, and 1920 by 1080. All visible top-bar controls had distinct rectangles, every mode activated correctly, Gravity did not receive unintended focus, scene totals stayed coherent through add/delete, and the named selection appeared in all user-facing surfaces.

No production behavior change was justified. Regression coverage was added to prevent these failure modes from entering the current application.

## Findings

### 1. Provisional: top-bar controls overlap and misroute clicks at 1280 x 720

**Disposition: Not reproduced in the current workspace.** The current top bar uses flex layout with horizontal overflow rather than the overlapping positioned layout observed on port 5173. New tests prove non-intersection and correct activation at 1024 by 768, 1280 by 720, and 1920 by 1080. All three viewport cases passed.

**Observed**

- The mode buttons occupy the following approximate rectangles:
  - Single: x 160-226, y 9-42
  - Collision: x 231-314, y 9-42
  - Builder: x 320-392, y 9-42
  - Random: x 398-480, y 9-42
- The Gravity input occupies x 439-531, y 20-50, directly overlapping Random.
- The initial screenshot also shows the top controls visually layered over one another.
- Clicking Random twice left Collision selected and focused the Gravity input.
- Clicking Builder left Collision selected. In one attempt, unrelated scene/undo state changed: the galaxy count changed from 2 to 1, the selection cleared, the undo count increased, and the displayed star total remained 60,000.

**Expected**

Mode buttons and global controls should not overlap. Clicking Builder or Random should activate only the requested mode and should not focus or mutate unrelated controls or scene state.

**Impact**

Builder and Random are effectively inaccessible with pointer input at this common desktop viewport. Misrouted clicks may also cause unexpected state changes.

**Suggested fix**

- Make the top bar wrap or switch to a compact/two-row layout before controls collide.
- Ensure mode navigation and playback/global controls occupy separate non-overlapping layout regions.
- Add a 1280 x 720 visual/interaction regression test that checks element bounding boxes for intersection and verifies each mode button changes `aria-pressed` to `true`.

### 2. Provisional: scene summary became internally inconsistent after the misrouted mode click

**Disposition: Not reproduced in the current workspace.** The isolated regression added a second 500-star galaxy and observed `2 galaxies, 1000 stars`; deleting it produced `1 galaxies, 500 stars`. The totals changed coherently.

**Observed**

After adding a second 30,000-star galaxy, the summary correctly showed `2 galaxies · 60,000 stars`. Following the failed Builder click, it showed `1 galaxies · 60,000 stars` with no selection.

**Expected**

The galaxy and star totals should describe the same current scene. If only one 30,000-star galaxy remains, the total should be 30,000 unless the remaining galaxy actually contains 60,000 stars.

**Notes**

This may be a secondary symptom of the overlapping-controls defect rather than an independent state-management bug. It should be retested after fixing the top-bar hit areas.

### 3. Provisional: selected galaxy is identified by an internal UUID instead of its name

**Disposition: Not reproduced in the current workspace.** A galaxy named `Test Companion` appeared by name in the top status, scene-galaxy list, and selected-configuration heading. Source inspection confirms a name-first, ID-fallback rule.

**Observed**

After adding a galaxy named `Test Companion`, the inspector and status text displayed `Selected cc188ca5-1df0-4335-99b6-16f1d37ec73c` rather than the supplied name.

**Expected**

Prefer the user-facing galaxy name, optionally followed by a shortened identifier when needed.

**Impact**

This makes selection context harder to understand, especially in multi-galaxy scenes.

## Controls and behaviors verified

The following checks passed during this session:

- Application startup, worker readiness, WebGL readiness, and rewind-marker accumulation.
- No console errors or warnings observed.
- Pause changes the control to Play and status to Paused.
- Step is enabled while paused and responds to activation.
- Speed selection changed from 1x to 2x and the status reflected 2x.
- Performance selection changed from Balanced to Low.
- Trails toggled on and exposed pressed state.
- Collision mode activated correctly from Single.
- Galaxy Type changed to Elliptical.
- Seed changed to 42.
- Central black hole checkbox toggled on.
- Name accepted `Test Companion`.
- Add galaxy created a second galaxy and selected it.
- A performance-budget warning appeared after adding the 30,000-star galaxy under Low performance.
- Help opened an `Interaction help` dialog and closed again.
- Presets tab activated and showed the empty-library state.
- Buttons, inputs, tab list, simulation region, runtime health, and dialog generally exposed descriptive accessible names/roles.

## Not fully exercised

The overlap defect blocked reliable pointer testing of Builder and Random mode workflows. File import/export, downloads, long recordings, capture persistence, destructive library actions, viewport drag/zoom, velocity handles, rewind branching, and multi-size responsive testing were not completed in this exploratory pass.

## Remediation verification

Added `e2e/acceptance/18-ui-remediation.spec.ts` with four Chromium scenarios:

- Non-overlapping, mode-safe top controls at 1024 by 768.
- Non-overlapping, mode-safe top controls at 1280 by 720.
- Non-overlapping, mode-safe top controls at 1920 by 1080.
- Coherent scene totals and name-first selection through add/delete.

All four scenarios passed on 2026-07-16.

### Verification issue: Firefox cannot initialize graphics in this environment

The first broad verification attempt ran unit tests, Vitest browser tests, and the production build concurrently. Vitest reported that Firefox did not connect within its startup timeout; the browser tests that did start passed. A sequential rerun reproduced the Firefox startup failure.

Firefox's process output reports that it failed to launch its GPU process after three attempts, could not obtain a D3D11 compositor device, and could not initialize software WebRender through D3D11. No application test assertion failed in Firefox because the session never opened.

**Disposition:** Environment qualification issue, unresolved in this run. Do not weaken or remove Firefox from the project's browser matrix. Re-run Firefox browser and E2E suites on a Windows/Linux environment with a working supported graphics stack. Chromium evidence remains valid.

### Verification note: local browser-process teardown

The targeted Playwright Chromium scenarios completed all assertions successfully, but the command remained alive until the outer command timeout. The in-app browser also failed to attach reliably to newly opened localhost tabs after earlier connection-refused pages. These behaviors are outside the application page and did not produce application console/assertion failures, but they prevented a clean final in-app-browser handoff in this run.

**Disposition:** Local browser-control/process-lifecycle issue. The repeatable Chromium assertion evidence is retained; repeat the manual in-app-browser pass when the browser surface can attach cleanly.

### Final in-app-browser pass

A clean production build was served from an isolated static server on `http://127.0.0.1:8123` and tested in a fresh, visible in-app-browser session.

Verified successfully:

- Production identity, Worker startup, and renderer startup. The initial foreground startup had no warnings/errors; the later background timeout emitted the expected timeout/unavailable recovery errors described below.
- Play/Pause, 2x speed, gravity 2, Low performance, and Trails.
- Single, Collision, Random, and Builder mode activation.
- Named galaxy creation (`Manual Companion`), name-first selection display, deletion, and coherent return to `1 galaxies, 30000 stars`.
- Selection, Presets, Scenes, Captures, and Recordings tabs.
- Help dialog open and close.
- Supported 1024 by 768, 1280 by 720, and 1920 by 1080 viewport checks, supplementing the automated non-intersection tests.

While the tab was backgrounded, a Pause command timed out and opened the designed recovery UI. Restoring its checkpoint, bringing the in-app browser to the foreground, and repeating Pause completed immediately. This confirms background throttling in the browser surface and successful product recovery behavior; it is not classified as a Galaxia defect.

The console retained `REQUEST_UNDO_SNAPSHOT timed out` and `Simulation Worker is unavailable` entries from that forced recovery path. They correspond to the visible timeout/recovery state and were not new errors after restoration.

## Overall assessment

**Current-workspace disposition: good state with one external qualification exception.** No product defect from the original report is confirmed. Static checks, unit tests, Chromium browser tests, the production build, targeted Chromium acceptance assertions, and the final visible in-app-browser pass all succeed. Firefox remains unqualified on this machine because its own GPU subprocess cannot start, including with software-rendering environment flags.
