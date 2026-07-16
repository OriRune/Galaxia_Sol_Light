# Platform results

## Initial development environment

- Local record: [`docs/evidence/environment-local.json`](evidence/environment-local.json)

## Windows release verification

Status: Pass (2026-07-16).

- Platform: Windows 11 Home 10.0.26200, ARM64.
- Runtime: Node.js 24.16.0, npm 11.13.0, Playwright 1.61.1.
- `npm ci`: pass.
- `npx playwright install chromium firefox`: pass.
- `npm run verify`: pass; 290 unit tests, 45 browser tests, 17 Chromium E2E tests, and 17 Firefox E2E tests.
- `npm run e2e:edge`: pass; 17 tests in current system Edge.
- Coverage gates: domain 97.67/96.49/91.18, generation 99.20/95.88/97.44, simulation 96.12/91.00/95.85, overall 90.71/80.44/86.47 (statements/branches/functions).

### Current release-candidate revalidation

- `npm run verify`: pass in one contiguous run on 2026-07-16; 296 unit tests, 51 Chromium browser tests, 19 Chromium E2E tests, and 19 Firefox E2E tests.
- Coverage gates: domain 97.67/96.49/91.18, generation 99.20/95.88/97.44, simulation 96.14/91.16/95.87, overall 90.29/80.03/90.25 (statements/branches/functions).
- `npm run verify:dist-hosting`: pass for root, deep SPA fallback, and Worker chunk.
- Local hosted production workflow: pass in Chromium and Firefox; Vercel-header-only cases are intentionally deferred to the authenticated preview.
- System Edge: 17 of 19 cases passed in the full run; the two transient failures and their shared editing prerequisite passed immediately in a targeted three-test rerun. This is recorded as rerun evidence rather than misreported as a contiguous full-suite pass.

## Linux release verification

Status: Pass (2026-07-16).

- Platform: Ubuntu 26.04 LTS under WSL2, Linux 6.18.33.2, ARM64.
- Runtime: Node.js 24.18.0, npm 11.16.0, Playwright 1.61.1.
- Verification used an isolated native-Linux checkout at `/home/orion/galaxia-verify` so Windows and Linux native dependencies could not contaminate one another.
- `npm ci`: pass.
- `npx playwright install --with-deps chromium firefox`: pass.
- `npm run verify`: pass in one contiguous run; 290 unit tests, 45 browser tests, 17 Chromium E2E tests, and 17 Firefox E2E tests.
- Coverage gates: domain 97.67/96.49/91.18, generation 99.20/95.88/97.44, simulation 96.19/91.20/95.85, overall 90.74/80.51/86.47 (statements/branches/functions).

## Manual system Firefox smoke

### Windows

Status: Pass (2026-07-16).

- Current stable system Firefox: 152.0.6.
- Production `dist` smoke passed startup, renderer readiness, a 751 by 684 canvas, saved-scene round-trip, and capture persistence (one saved capture).

### Linux

Status: Pass (2026-07-16).

- Current stable system Firefox: 152.0.6 (official Mozilla ARM64 package).
- Production `dist` smoke passed startup, renderer readiness, an 806 by 630 canvas, saved-scene round-trip, and capture persistence (one saved capture).
