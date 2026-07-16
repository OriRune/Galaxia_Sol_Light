# ADR 0004: physics calibration

Status: Accepted; constants and generation goldens frozen at Milestone 3

## Context

Task 1.5 evaluates the section 8.2 starting tuple with a pure Float64 two-core harness before Worker, UI, star fixtures, or generation goldens exist. The operation order is start-of-step merger detection, conservative Plummer acceleration, half kick, snapshot-based accumulated overlap-friction impulse, drift, second half kick, and a second independently snapshotted friction impulse.

## Starting tuple

| Constant                        | Value |
| ------------------------------- | ----: |
| DT                              |  1/60 |
| Base G                          |    64 |
| Extended softening fraction     |  0.15 |
| Friction gamma maximum          |    24 |
| Friction speed scale            |  3 VU |
| Friction speed exponent         |     8 |
| Maximum half-friction fraction  |  0.20 |
| Merger relative-speed threshold |  1 VU |

## Reference comparison

| Fixture                                         |            Measured | Independent reference | Absolute error | Result |
| ----------------------------------------------- | ------------------: | --------------------: | -------------: | ------ |
| Default attraction separation at t=30           |   94.91200876780859 |           94.91200877 |        2.19e-9 | Pass   |
| Scenario 5 separation at t=60                   |  122.57215338056142 |          122.57215338 |       5.61e-10 | Pass   |
| Scenario 5 direction rotation                   | 104.58194127081758° |         104.58194127° |      8.18e-10° | Pass   |
| Slow-capture eligible merge time                |  139.96666666666667 |    about 139.96666667 |        3.33e-9 | Pass   |
| Slow-capture relative speed                     |  0.6954644260007617 |      about 0.69546443 |        4.00e-9 | Pass   |
| Fast-flyby first-pass minimum speed inside 8 DU |  16.255132925545436 |     about 16.25513293 |        4.45e-9 | Pass   |

Every numerical reference is within the required 1e-6 tolerance, confirming the required operation order.

## Core margin gates

- Default attraction decreases separation by 40.68 percent at t=30, above the internal 2 percent margin.
- Scenario 5 rotates 104.58 degrees, remains unmerged through t=60, and exceeds the 18-degree core margin. The separate star-radius/tidal margin belongs to later star-layer calibration.
- Slow capture merges by t=139.9667, before the t=240 limit.
- The fast flyby remains unmerged through t=6 and its first traversal inside the merger distance never falls below 16.2551 VU, above 1.25 VU.
- The same flyby is eventually captured at t=24.5666666667, retained as the required informational reference.
- Maximum measured friction momentum residual is exactly zero; the strictest accumulated reported tolerance ceiling is 2.7043837295325546e-8.

The starting tuple passes all core gates, so the mandated 324-tuple ordered fallback grid was defined and verified but not evaluated. Per the selection rule, no later tuple may replace a passing starting tuple.

## Full production calibration

Task 3.7 reran the starting tuple through the production two-bank Engine and the complete star layer:

- Production default-attraction separation matches 94.91200877 DU within 1e-6.
- Scenario 5 core rotation remains above 18 degrees, stays unmerged through 60 units, and at least one 90-percent star radius grows by at least 12 percent.
- First Light remains inside the 80..120-percent 90-radius band for 300 units and retains at least 97 percent of stars inside twice the initial 90-radius.
- Slow capture and fast first-pass gates retain the core-proof values above.
- Three- and twelve-core accumulated friction cases conserve momentum within the 1e-10 scaled tolerance.
- Black-hole owner acceleration matches the shared domain function exactly at every required radius and gravity, while initial inner speed rises by at least 5 percent.

All full gates pass together. The starting tuple is therefore locked. No grid sweep or constant update was required.

The ten final generation fixtures match byte-for-byte between Windows Chromium and Firefox. Their locked values are in `tests/fixtures/generation-digests.json` and the two normalized evidence files.

## Merger proof

The asymmetric merger fixture produces:

- Deterministic ID `m-7-612532d3-0` and seed 1629827795.
- Exact mass 50 and 5,000 live stars.
- Mass-weighted center `(0.6, 0)` and velocity `(0.02, -0.08)`.
- Elliptical configuration semantics, size 64.03124237432849, clamped mass-weighted spin 0, black hole enabled, and name `Alpha + Beta`.
- Exact momentum preservation through the mass-weighted remnant velocity.

## Evidence

- `perf/physics-calibration.ts`
- `tests/unit/physics-calibration.test.ts`
- `docs/evidence/core-physics-proof.json`
- `docs/evidence/full-physics-calibration.json`
- `docs/evidence/generation-digests-windows-chromium.json`
- `docs/evidence/generation-digests-windows-firefox.json`

## Consequences

The production physics implementation must retain this tuple and operation order. Any later generation-affecting constant change requires the complete physics suite and cross-browser generation digest pack to be rerun and this ADR to be superseded.
