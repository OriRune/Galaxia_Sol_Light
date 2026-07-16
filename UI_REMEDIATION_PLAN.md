# Galaxia UI Remediation Implementation Plan

Revision: 2026-07-16

## 1. Purpose and execution rules

This document is the ordered implementation manual for the UI findings recorded in `docs/UI_TEST_FINDINGS_2026-07-16.md`. It supplements `IMPLEMENTATION_PLAN.md`; the specification and the main plan remain authoritative for product behavior and architecture.

Implementation is complete only when:

1. Every task packet in section 4 is complete in order.
2. Each packet's named tests pass before the next packet begins.
3. Findings are reproduced against an isolated build of this workspace before production code changes are made.
4. Any newly discovered issue is added to both the findings and this plan.
5. Static checks, unit tests, browser tests, the production build, and targeted Chromium acceptance tests pass.
6. A final in-app-browser pass confirms the supported 1024 by 768 and standard desktop layouts remain usable.

### 1.1 Rules for the implementation agent

1. Use an isolated port or production artifact whose workspace identity is verified before exploratory testing.
2. Add regression evidence in the same change as each confirmed behavior fix.
3. Do not change simulation, persistence, generation, or rendering contracts to solve a presentation problem.
4. Do not treat an observation from an unverified server as a product defect.
5. Preserve the supported desktop minimum of 1024 by 768 CSS pixels from `IMPLEMENTATION_PLAN.md` section 2.1.
6. Keep primary controls reachable by pointer and keyboard without overlapping hit areas.
7. Prefer user-facing galaxy names and use stable IDs only when no name exists.
8. Run the packet check before proceeding.

## 2. Confirmed scope and investigation boundaries

The first exploratory report was captured from an unverified process already listening on port 5173. Its markup and labels do not match this workspace's `src/app/App.tsx`. Therefore the overlap, counter inconsistency, and UUID-display observations are provisional until reproduced against the isolated workspace artifact.

The current workspace itself has a dense, horizontally scrolling top bar and an existing 1024-pixel drawer breakpoint. The remediation must verify, rather than assume, whether this layout creates overlap, inaccessible controls, or only intentional horizontal scrolling.

## 3. Fixed implementation decisions

- Keep the existing React, Zustand, Worker, Pixi, and repository ownership boundaries.
- Use semantic navigation and tab roles already present in `App.tsx`.
- Add layout regression coverage at 1024 by 768, 1280 by 720, and 1920 by 1080.
- Element rectangles for visible interactive controls may not intersect.
- Horizontal scrolling is acceptable only if every control remains reachable and hit testing activates the intended element; wrapping or compact grouping is preferred when it improves discoverability without reducing the viewport below its minimum.
- Status and selection labels use `descriptor.name` when non-null, otherwise `descriptor.id`.
- Scene totals remain Worker-owned low-frequency status; UI code must not invent replacement totals.

## 4. Ordered implementation task packets

### Task 1.1 - Isolated baseline and finding disposition

Read: `IMPLEMENTATION_PLAN.md` sections 2.1, 14.1, 14.10, 17, and 18 Task 5.1; `SPEC.md` sections 5, 15, and 17; current UI findings.

Actions:

1. Build this workspace and serve the resulting artifact on a dedicated port.
2. Verify the page title, `Modes` tablist, and current status labels match `App.tsx`.
3. Re-run the reported 1280 by 720 interactions and inspect control rectangles.
4. Reclassify each provisional finding as confirmed, not reproduced, or replaced by a more accurate issue.
5. Record any additional baseline issue in the findings and append a task packet below before implementing it.

Packet check:

- Workspace identity is proven by current accessible labels.
- Findings contain environment and disposition evidence.
- No product code changes occur before disposition.

### Task 1.2 - Responsive top-bar usability

Read: `IMPLEMENTATION_PLAN.md` sections 2.1, 14.1, 14.9, and Task 5.1.

If overlap or inaccessible controls is confirmed, implement a responsive top-bar layout with explicit groups and non-overlapping hit areas. Preserve all commands and semantic names. If overlap is not reproduced, add only the regression test needed to prevent it and document the disposition.

Tests:

- At 1024 by 768, 1280 by 720, and 1920 by 1080, visible top-bar interactive rectangles do not intersect.
- Single, Collision, Builder, and Random each become the selected tab after activation when the Worker is ready.
- Mode activation does not focus or mutate a neighboring field.
- Playback, global, capture, recording, help, status, and health content remain reachable.

Packet check:

- Targeted Chromium layout/mode test passes.
- Existing startup, mode-transition, and accessibility tests pass.

### Task 1.3 - Scene summary consistency

Reproduce the reported galaxy/star mismatch against the isolated artifact. If confirmed, trace Worker `STATUS`/`TOPOLOGY` ordering and ensure the UI presents a single coherent revision. If not reproduced, retain a regression that adds and deletes a galaxy and asserts both totals together.

Tests:

- Adding a known-count galaxy updates galaxy and star totals together.
- Deleting it returns both totals together.
- Mode transitions never produce a mixed-revision summary.
- Undo restores both totals together.

Packet check:

- Targeted workflow tests pass without fixed delays.
- No main-thread star arrays or duplicate authoritative totals are introduced.

### Task 1.4 - User-facing selection identity

Verify every selected-galaxy surface uses the name-first fallback already intended by `valueOr(descriptor.name, descriptor.id)`. Fix only surfaces that expose an ID despite a non-null name.

Tests:

- A named added galaxy appears by name in the top status, selection list, and selected configuration heading.
- An unnamed galaxy falls back to its stable ID.
- Renaming updates every user-facing selection surface without regenerating particles.

Packet check:

- Component workflow tests pass.
- Existing name-only non-regeneration evidence remains green.

### Task 1.5 - Full verification and exploratory iteration

Actions:

1. Run formatting check, type checking, lint, architecture check, unit tests, browser tests, and production build.
2. Run targeted Chromium acceptance tests for startup, modes, editing, empty state, camera, and accessibility.
3. Serve the final production artifact in the in-app browser.
4. Exercise startup, all modes, playback, globals, creation/edit/delete, selection/library tabs, help, and responsive layouts.
5. For each newly discovered issue, add a finding and a new ordered task packet, implement it with tests, and repeat this packet.

Verification adjustment discovered during execution:

- Run the Vitest browser project separately from the production build and unit suite. A concurrent run caused Firefox session startup to exceed its timeout.

### Task 1.6 - Firefox environment qualification

The sequential rerun confirmed that the bundled Firefox process cannot initialize its D3D11 compositor or GPU process in the current desktop environment. This occurs before application assertions run.

Actions:

1. Preserve Firefox in the required browser matrix and configuration.
2. Record the exact graphics startup failure in the findings.
3. Complete Chromium verification in the current environment.
4. Re-run `test:browser` and Firefox E2E on a Windows/Linux verification environment with a working supported graphics stack.

Execution result:

- A second Firefox attempt forced software rendering with `MOZ_WEBRENDER=0` and `MOZ_ACCELERATED=0`. Firefox still failed to launch its GPU subprocess before loading any application test. The product cannot safely repair this external graphics-process failure; the required follow-up remains qualification on a machine with a functioning Firefox graphics stack.

Packet check:

- Chromium browser and E2E suites pass locally.
- Firefox is not reported as passing until an actual session runs its assertions.
- No product behavior or browser coverage is weakened to hide the environment failure.

Final exit gate:

- All confirmed high- and medium-impact findings are fixed.
- No console errors or warnings occur in the final browser pass.
- Supported desktop layouts have no overlapping interactive controls.
- Every primary mode and tested control activates its intended behavior.
- Findings and this plan contain final status and verification evidence.

## 5. Completion record

Update this section as packets finish.

| Task                                  | Status                                | Evidence                                                                                                                                           |
| ------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 Isolated baseline                 | Complete                              | Current markup/source identity established; original port 5173 artifact rejected                                                                   |
| 1.2 Responsive top bar                | Complete                              | Three viewport rectangle and mode-safety scenarios pass; no production change required                                                             |
| 1.3 Scene summary                     | Complete                              | Add/delete regression passes with coherent 500/1000-star totals                                                                                    |
| 1.4 Selection identity                | Complete                              | Name-first status, list, and heading regression passes                                                                                             |
| 1.5 Full verification                 | Complete                              | Format, types, lint, architecture, 296 unit tests, 51 Chromium browser tests, build, targeted Chromium assertions, and visible in-app pass succeed |
| 1.6 Firefox environment qualification | Exhausted locally; external follow-up | Normal and forced-software Firefox launches both fail before app assertions because its GPU subprocess cannot start                                |
