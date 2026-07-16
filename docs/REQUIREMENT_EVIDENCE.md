# Normative requirement evidence

This ledger maps every section 19.1 requirement ID to executable evidence. A row is not considered release-green until its listed suite passes on the required platform.

| ID group                     | Executable evidence                                                                                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-GEN-01, R-GEN-02, R-GEN-03 | `domain-validation.test.ts`, `generator.test.ts`, `generation-determinism.test.ts`                                                                                            |
| R-GEN-04, R-GEN-05           | `presets-random.test.ts`, `product-controls.test.ts`                                                                                                                          |
| R-DOMAIN-01, R-BUDGET-01     | `domain-validation.test.ts`, `core-physics-scheduler.test.ts`, `galaxy-workflows.test.ts`                                                                                     |
| R-START-01                   | `e2e/acceptance/01-startup.spec.ts`, `generation-determinism.test.ts`                                                                                                         |
| R-MODE-01..R-MODE-06         | `mode-reducer.test.ts`, `galaxy-workflows.test.ts`, `e2e/acceptance/03-mode-transitions.spec.ts`, `04-build-encounter.spec.ts`, `14-empty-state.spec.ts`                      |
| R-EDIT-01..R-EDIT-03         | `engine-state.test.ts`, `galaxy-workflows.test.ts`, `interaction.test.ts`                                                                                                     |
| R-VIEW-01, R-SELECT-01       | `pixi-viewport.test.ts`, `interaction.test.ts`, `keyboard-accessibility.test.ts`                                                                                              |
| R-SIM-01..R-SIM-04           | `core-physics-scheduler.test.ts`, `physics-calibration.test.ts`                                                                                                               |
| R-SIM-05                     | `engine-state.test.ts`, `simulation-client-errors.test.ts`, `app-health.test.tsx`                                                                                             |
| R-BH-01..R-BH-03             | `core-artwork.test.ts`, `generator.test.ts`, `physics-calibration.test.ts`                                                                                                    |
| R-MERGE-01..R-MERGE-04       | `merger-effects.test.ts`, `physics-calibration.test.ts`, `core-artwork.test.ts`                                                                                               |
| R-ENCOUNTER-01               | `merger-effects.test.ts`, `core-artwork.test.ts`                                                                                                                              |
| R-PLAY-01..R-PLAY-04         | `core-physics-scheduler.test.ts`, `product-controls.test.ts`, `e2e/acceptance/01-startup.spec.ts`                                                                             |
| R-CAM-01..R-CAM-03           | `camera.test.ts`, `interaction.test.ts`, `pixi-viewport.test.ts`                                                                                                              |
| R-HIST-01..R-HIST-04         | `history-timeline.test.ts`, `history-memory.test.ts`, `12-history.acceptance.test.ts`, `e2e/acceptance/12-rewind.spec.ts`                                                     |
| R-UNDO-01, R-UNDO-02         | `undo-store.test.ts`, `engine-state.test.ts`, `13-undo.acceptance.test.ts`, `e2e/acceptance/13-undo.spec.ts`                                                                  |
| R-PRESET-01, R-PRESET-02     | `presets-random.test.ts`, `portable.test.ts`, `library-repository.test.ts`                                                                                                    |
| R-SCENE-01..R-SCENE-03       | `portable.test.ts`, `scene-load.test.ts`, `protocol-transaction.test.ts`                                                                                                      |
| R-CAP-01                     | `screenshot-service.test.ts`, `core-artwork.test.ts`                                                                                                                          |
| R-REC-01..R-REC-03           | `recording-scheduler.test.ts`, `recording-persistence.test.ts`, `recording-export.test.ts`, `capture-storage.test.ts`                                                         |
| R-STATUS-01, R-HELP-01       | `smoke.test.tsx`, `app-health.test.tsx`, `keyboard-accessibility.test.ts`, `e2e/acceptance/03-mode-transitions.spec.ts`                                                       |
| R-VALID-01..R-VALID-03       | `domain-validation.test.ts`, `library-names.test.ts`, `undo-store.test.ts`                                                                                                    |
| R-PERF-01                    | `docs/evidence/production-low-system-edge.json`, `production-balanced-system-edge.json`, `production-high-system-edge.json`, and matching `*-system-firefox.json` raw reports |
| R-RELY-01, R-RELY-02         | `generation-determinism.test.ts`, `portable.test.ts`, `camera.test.ts`                                                                                                        |
| R-PLATFORM-01                | `docs/PLATFORM_RESULTS.md` (Windows/Linux release verification pending)                                                                                                       |

Open rows are intentionally explicit and block Milestone 9 completion.
