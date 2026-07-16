# Galaxia acceptance report

Recorded: 2026-07-16.

## Release-gate summary

Milestone 9 is green. The complete Windows and Linux verification records are in [PLATFORM_RESULTS.md](PLATFORM_RESULTS.md). The current suite passes 293 unit tests, 46 browser tests, nineteen Chromium E2E tests, nineteen Firefox E2E tests, and nineteen system Edge E2E tests after the Task 9.5 additions. Production dependencies report zero known vulnerabilities with `npm audit --omit=dev`.

## Normative requirement evidence

| Requirement IDs                                                  | Primary named evidence                                                                                      | Result |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------ |
| R-GEN-01..05, R-DOMAIN-01, R-BUDGET-01, R-RELY-01                | `generation-determinism`, generator/unit boundary suites, `09-random-reproduction`, generation digest files | Pass   |
| R-START-01, R-MODE-01..06, R-EDIT-01..03, R-VIEW-01, R-SELECT-01 | acceptance `01` through `04`, `14`, mode/workflow, interaction and rendering suites                         | Pass   |
| R-SIM-01..05, R-BH-01..03, R-MERGE-01..04, R-ENCOUNTER-01        | engine, physics calibration, merger/effect, black-hole, core-art browser suites                             | Pass   |
| R-PLAY-01..04, R-CAM-01..03                                      | scheduler/control/camera suites; acceptance `01`, `16`, and `17`                                            | Pass   |
| R-HIST-01..04, R-UNDO-01..02                                     | history timeline/memory, undo, acceptance `12` and `13`                                                     | Pass   |
| R-PRESET-01..02, R-SCENE-01..03                                  | repository/portable/load suites; acceptance `08`, `10`, and `11`                                            | Pass   |
| R-CAP-01, R-REC-01..03                                           | capture/storage/export suites; acceptance `15`; `real-recording-soak`                                       | Pass   |
| R-STATUS-01, R-HELP-01, R-VALID-01..03                           | component/workflow suites; acceptance `02`, `03`, `11`, and `17`                                            | Pass   |
| R-PERF-01                                                        | exact Low/Balanced/High system Edge and Firefox evidence listed below                                       | Pass   |
| R-RELY-02                                                        | scene/camera tests and Chromium/Firefox context-loss restoration test                                       | Pass   |
| R-PLATFORM-01                                                    | [PLATFORM_RESULTS.md](PLATFORM_RESULTS.md)                                                                  | Pass   |

The detailed packet-to-requirement trace is preserved in `docs/handoffs/0.1-*` through `docs/handoffs/9.5-*`; test titles retain the normative IDs.

## Acceptance scenarios

| Scenario | Named evidence                                                  | Result |
| -------: | --------------------------------------------------------------- | ------ |
|        1 | `e2e/acceptance/01-startup.spec.ts`, First Light digest         | Pass   |
|        2 | `e2e/acceptance/02-single-editing.spec.ts`                      | Pass   |
|        3 | mode reducer and `03-mode-transitions.spec.ts`                  | Pass   |
|        4 | `04-build-encounter.spec.ts`                                    | Pass   |
|        5 | `05-interaction.acceptance.test.ts`, flyby luminance            | Pass   |
|        6 | `06-merger.acceptance.test.ts`, merger luminance                | Pass   |
|        7 | core reservation, `07-black-hole.acceptance.test.ts`, luminance | Pass   |
|        8 | `08-preset-reproduction.spec.ts`                                | Pass   |
|        9 | `09-random-reproduction.acceptance.browser.test.ts`             | Pass   |
|       10 | `10-scene-roundtrip.spec.ts`                                    | Pass   |
|       11 | `11-invalid-load.spec.ts`                                       | Pass   |
|       12 | `12-history.acceptance.test.ts`, `12-rewind.spec.ts`            | Pass   |
|       13 | `13-undo.acceptance.test.ts`, `13-undo.spec.ts`                 | Pass   |
|       14 | `14-empty-state.spec.ts`                                        | Pass   |
|       15 | `15-capture-recording.spec.ts`, `real-recording-soak.spec.ts`   | Pass   |
|       16 | `16-camera.acceptance.test.ts`, `16-camera.spec.ts`             | Pass   |
|       17 | `17-limits.acceptance.test.ts`, reference performance matrix    | Pass   |

## Performance and raw records

- Edge: [Low](evidence/production-low-system-edge.json), [Balanced](evidence/production-balanced-system-edge.json), [High](evidence/production-high-system-edge.json).
- Firefox: [Low](evidence/production-low-system-firefox.json), [Balanced](evidence/production-balanced-system-firefox.json), [High](evidence/production-high-system-firefox.json).
- Renderer risk proof: [system Edge](evidence/renderer-proxy-system-edge.json), [system Firefox](evidence/renderer-proxy-system-firefox.json).
- Environment: [initial local record](evidence/environment-local.json) and [platform release record](PLATFORM_RESULTS.md).

All six production fixture runs exceed 30 FPS and remain within the 50 ms frame-p95 and 100 ms visible-response-p95 gates. Neither normative browser used a software renderer.

## Soak, lifecycle, and accessibility evidence

- `release-soaks.test.ts`: 30 fake-clock minutes across play, add, merge, rewind, undo, replacement, and capture; 30 fake-clock recording minutes and 54,000 slots without the product duration limit.
- `real-recording-soak.spec.ts`: full 120-second exact High fixture; 3,600 nominal/effective slots; duration finalization through the real renderer, encoder, and IndexedDB path.
- `pixi-viewport.test.ts`: 500 topology replacements with stable particle, texture, render-texture, and listener counters.
- `transfer-pool.test.ts`: 10,000 Worker publications, forced drops/rebuild, maximum three live buffers, and zero outstanding leases at completion.
- `17-accessibility-reliability.spec.ts`: landmark/form naming, tab semantics, keyboard commands, dialog focus return, and WebGL context loss/restoration in Chromium and Firefox.
- `verify-production-hooks.mjs`: production output contains no fixture-loading, performance-harness, or fault-injection API.

## Known non-conformance

None. No exit-gate violation or known high-severity correctness, data-loss, crash, or unbounded-memory issue remains open.
