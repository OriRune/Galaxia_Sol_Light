# Galaxia Browser Implementation Plan

Revision: 2026-07-15

## 1. Purpose and execution rules

This document is the complete implementation manual for SPEC.md. It is written so that an implementation agent can begin with only SPEC.md and this file, set up the project locally, and complete one bounded task at a time without choosing architecture, inventing algorithms, or weakening a requirement.

This revision supersedes earlier implementation-plan drafts. Files whose names contain PLAN-review or PLAN-review-disposition are historical review evidence, not implementation instructions.

The specification owns observable product behavior. This plan owns internal implementation decisions. If they appear to conflict, stop, preserve the specification behavior, and record the conflict before changing code. Do not silently reinterpret the specification.

Implementation is complete only when:

1. Every task packet in section 18 is complete in order.
2. Every milestone exit gate passes.
3. Every requirement row in section 19 has the named evidence.
4. Every acceptance scenario in SPEC.md section 18 passes.
5. The Windows and Linux local verification records are complete.
6. The hosted Vercel artifact passes the production smoke suite.

### 1.1 Rules for the implementation agent

1. Read every cited plan section and SPEC.md section before starting each task packet.
2. Work on only one task packet at a time.
3. Do not skip a task because a later task appears to cover it.
4. Add the named tests in the same change as the behavior.
5. Run the packet check before proceeding.
6. Run the full milestone gate at the end of a milestone.
7. Do not replace a formula, constant, data shape, state transition, or file format in this plan with a different design because it seems simpler.
8. If an exact design in this plan fails its stated test, use only the bounded fallback or calibration procedure named beside it.
9. Never change a specification threshold. A failing threshold means the implementation or a plan-owned constant must be fixed.
10. Never use Math.random for product state.
11. Never put star arrays or per-frame coordinates in React or Zustand.
12. Never mutate authoritative simulation state on the main thread.
13. Never partially apply invalid imported data.
14. Never add Bash-only, PowerShell-only, Windows-only, or Linux-only package scripts.
15. Keep a task handoff using the template in section 20.

### 1.2 Permitted reasons to stop for human input

The implementation agent should make no new product or architecture choices. Human input is required only for:

- A requested change to SPEC.md behavior.
- Vercel authentication, team selection, project naming, or custom-domain ownership.
- Access to the Windows reference device or a Linux verification machine when the release gate is reached.
- Destructive recovery of real user data.
- A dependency license or security issue that makes a required package unusable.

Everything else is decided in this plan.

## 2. Fixed product, platform, and hosting decisions

### 2.1 Product shape

- Galaxia is a client-only single-page browser application.
- There is no backend, login, account, cloud database, telemetry service, or collaboration service.
- Production hosting is a static Vite build on Vercel.
- All durable application data is origin-local browser data in IndexedDB.
- Portable presets and scenes support browser import/export. Images and recording ZIP parts support browser download.
- Offline/PWA behavior is not required.
- Mobile and touch-only layouts are not required.
- Desktop viewports of 1024 by 768 CSS pixels and larger are supported.

### 2.2 Operating systems and browsers

The release functional matrix is:

| Operating system | Required browsers |
| --- | --- |
| Windows | Current stable Microsoft Edge, current Playwright Chromium, current Playwright Firefox |
| Linux | Current Playwright Chromium, current Playwright Firefox |

On each release, also perform a manual startup, WebGL, save/load, and capture smoke test in the current system Firefox on Windows and Linux. The Playwright-pinned browsers are the repeatable automated qualification; the system-browser smoke detects packaging differences.

Do not claim support for previous browser releases. Do not add Safari or WebKit to the release gate.

Performance qualification uses the reference device in SPEC.md section 17.1:

- Snapdragon X 12-core X1E80100.
- Qualcomm Adreno X1-85 integrated graphics.
- 16 GiB RAM.
- Windows Home 25H2.
- Current stable Microsoft Edge and current stable Firefox.
- 1920 by 1080 CSS-pixel viewport.
- No unrelated foreground workload during the measurement.

Record the exact OS build, browser version, device-pixel ratio, display scale, and graphics-driver version with each benchmark.

### 2.3 Fixed technology stack

- Node.js 24 LTS.
- npm supplied with that Node installation.
- TypeScript in strict mode.
- React for controls and panels.
- Vite for development and production builds.
- PixiJS v8 with an explicitly requested WebGL renderer.
- A dedicated module Web Worker for simulation.
- Zustand for low-frequency UI state.
- Zod for runtime validation.
- Dexie for IndexedDB.
- fflate for streaming ZIP creation.
- Vitest for unit and integration tests.
- Vitest Browser Mode with the Playwright provider for real-browser module and component tests.
- React Testing Library for React behavior.
- Playwright for end-to-end and hosted-artifact tests.
- dependency-cruiser for dependency-direction checks.
- ESLint, TypeScript ESLint, and Prettier for static checks.
- npm-run-all2 for cross-platform script composition.
- Vercel CLI as a project development dependency.

Do not add a React-to-Pixi binding. Do not make one React component per star. Do not require WebGPU, SharedArrayBuffer, cross-origin isolation, a service worker, or the File System Access API.

### 2.4 Deliberate non-goals

Do not implement:

- Scientific star-to-star gravity.
- Star collisions.
- Star-by-star editing.
- Multiple selection.
- Exact portable mid-simulation saves.
- Encoded video output.
- Redo.
- A server or API route.
- Native executables or OS-specific code.
- WebGPU-only rendering.

## 3. Local prerequisites and foundation setup

This section is executable setup guidance, not a suggestion.

### 3.1 Install prerequisites

On Windows and Linux:

1. Install the latest available Node.js 24 LTS patch from the official Node.js distribution.
2. Confirm that node --version begins with v24.
3. Confirm that npm --version succeeds.
4. Install Git if it is not present. Git is used for local history but no remote provider is required.
5. On Windows, install current stable Microsoft Edge and Firefox.
6. On Linux, install current stable Firefox and the system libraries requested by Playwright.

Create these version files:

    .nvmrc
      24

    .node-version
      24

Set package.json engines to:

    node: 24.x
    npm: >=10

Do not pin a Node patch in the repository. The environment-record script captures the exact patch used for each result.

### 3.2 Initialize without overwriting planning files

The folder already contains SPEC.md and this plan. Do not run an interactive scaffolder over the folder. If package.json does not exist, run `npm init -y` first. Then create or rewrite the Vite foundation files directly so the required values below, rather than npm's defaults, are authoritative:

- package.json
- index.html
- tsconfig.json
- tsconfig.app.json
- tsconfig.node.json
- tsconfig.worker.json
- vite.config.ts
- vitest.config.ts
- playwright.config.ts
- eslint.config.js
- .prettierrc.json
- .prettierignore
- .npmrc
- .gitignore
- src/main.tsx
- src/app/App.tsx
- src/app/styles.css

If the folder is not already a valid Git worktree, run git init. Never delete the specification, review files, or plan.

After package.json exists and has been rewritten with `private: true`, `type: "module"`, and version `0.1.0`, run:

    npm config set save-exact true --location=project
    npm install --save-exact react react-dom pixi.js@8 zustand zod dexie fflate
    npm install --save-dev --save-exact typescript vite @vitejs/plugin-react @types/node @types/react @types/react-dom vitest @vitest/coverage-istanbul @vitest/browser-playwright @playwright/test @testing-library/react @testing-library/jest-dom eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh prettier dependency-cruiser npm-run-all2 fake-indexeddb vercel
    npx playwright install chromium firefox

On Linux, if Playwright reports missing system libraries, run:

    npx playwright install-deps chromium firefox

On Windows, do not let Playwright replace an existing Edge installation. The Edge project uses the installed msedge channel.

After installation:

1. Confirm that every dependency and development dependency in package.json has an exact version without a caret or tilde.
2. Keep package-lock.json.
3. Record resolved versions in docs/DEPENDENCIES.md.
4. Do not upgrade a dependency after Milestone 1 without rerunning that dependency's risk gate.

### 3.3 Required TypeScript configuration

Enable:

- strict.
- noUncheckedIndexedAccess.
- exactOptionalPropertyTypes.
- noImplicitOverride.
- noFallthroughCasesInSwitch.
- noImplicitReturns.
- useUnknownInCatchVariables.
- forceConsistentCasingInFileNames.
- isolatedModules.
- verbatimModuleSyntax.

Target ES2022. tsconfig.app.json includes DOM and excludes simulation/worker.ts. tsconfig.worker.json includes WebWorker and excludes React/features/rendering. tsconfig.node.json covers Vite/test configuration and includes Node types. Shared domain/generation/engine modules must compile in both app and Worker configurations without depending on either global environment.

Typed-array hot loops may use a narrowly scoped non-null assertion only when:

1. Equal buffer lengths are asserted once before the loop.
2. The loop bound is one of those lengths.
3. A test covers zero, one, and maximum representative lengths.
4. The ESLint suppression is on the smallest possible line range.

### 3.4 Required package scripts

Use npm-run-all2 so scripts do not depend on shell operators. package.json must expose:

    dev                 vite --host 127.0.0.1
    dev:lan             vite --host 0.0.0.0
    preview             vite preview --host 127.0.0.1
    preview:benchmark   vite preview --host 127.0.0.1 --port 4174
    typecheck:app       tsc --noEmit -p tsconfig.app.json
    typecheck:worker    tsc --noEmit -p tsconfig.worker.json
    typecheck:node      tsc --noEmit -p tsconfig.node.json
    typecheck           run-s typecheck:app typecheck:worker typecheck:node
    lint                eslint . --max-warnings=0
    format              prettier . --write
    format:check        prettier . --check
    test                vitest run --project unit
    test:browser        vitest run --project browser
    test:coverage       vitest run --coverage.enabled --coverage.provider=istanbul
    coverage:check      node scripts/check-coverage.mjs coverage/coverage-final.json
    verify:paths        node scripts/verify-no-absolute-paths.mjs
    build:vite          vite build
    build               run-s typecheck build:vite
    architecture:check  depcruise --config dependency-cruiser.cjs src
    e2e                 playwright test
    e2e:chromium        playwright test --project=chromium
    e2e:firefox         playwright test --project=firefox
    e2e:edge            playwright test --project=edge
    e2e:hosted          playwright test --project=hosted-chromium --project=hosted-firefox
    bench               playwright test --config=perf/playwright.perf.config.ts
    verify              run-s format:check typecheck lint architecture:check verify:paths test:coverage coverage:check build e2e:chromium e2e:firefox
    vercel:build        vercel build
    deploy:preview      vercel
    deploy:production   vercel --prod

The final package.json may contain no shell control operator.

The production build must run type checking before Vite. Vite transpilation is not sufficient.

Foundation configuration contract:

- package.json has private true, type module, and initial version 0.1.0.
- index.html contains one div with id root and loads /src/main.tsx as a module.
- vite.config.ts uses the React plugin, base "/", build target es2022, worker format es, and assetsInclude ["**/*.bin"].
- Vite define exposes __APP_VERSION__ from npm_package_version with 0.0.0-dev only as a non-release fallback.
- src/vite-env.d.ts declares __APP_VERSION__ as a string and includes Vite client types.
- simulationClient creates the Worker with new URL("../simulation/worker.ts", import.meta.url) and type module; do not hard-code an emitted Worker filename.
- playwright.config.ts checks PLAYWRIGHT_BASE_URL once. When absent, it configures only local Chromium/Firefox plus Windows Edge, baseURL http://127.0.0.1:5173, and webServer command npm run dev with reuseExistingServer false. When present, it configures only hosted-chromium/hosted-firefox, uses the validated HTTPS URL as baseURL, and omits webServer. Local projects ignore e2e/hosted; hosted projects run only e2e/hosted. The e2e:hosted script therefore requires the environment value and must fail clearly when it is absent.
- Test screenshots, traces, coverage, dist, node_modules, .vercel, and local environment JSON outside docs are ignored by Git.
- Raw release benchmark JSON deliberately stored under docs/evidence is not ignored.

### 3.5 Test projects

Vitest has two named projects:

- unit: Node environment; pure domain, generation, engine, repository logic with fake-indexeddb.
- browser: Playwright provider; Chromium and Firefox instances; browser-native generation digests, canvas, Worker, storage, and React component tests.

Root coverage uses the Istanbul provider so the same instrumented report can include Node, Chromium, and Firefox projects. Configure JSON and text reporters and include src/**/*.ts and src/**/*.tsx. Exclude declaration files, test files, generated constants/artifacts, main.tsx, and the thin worker.ts bootstrap only; do not exclude engine, renderer, repository, or feature code. scripts/check-coverage.mjs reads coverage/coverage-final.json, aggregates Istanbul statement/branch/function maps by normalized forward-slash path, and enforces section 3.6 for domain, generation, simulation, and all included src. It exits nonzero and prints the failing group/metric/actual percentage. Before a named directory has any included source file, report that group as pending instead of dividing by zero; Task 2.1 makes domain required, Task 2.2 makes generation required, and Task 0.3 makes simulation required, after which skipping that group is forbidden. Overall src is never allowed to be empty. Test this checker with small synthetic pass, fail, empty-pending, and empty-after-required fixtures.

Playwright has:

- chromium: bundled Chromium on Windows and Linux.
- firefox: bundled Firefox on Windows and Linux.
- edge: installed stable Edge, enabled only on Windows.
- hosted-chromium and hosted-firefox: run only against a supplied PLAYWRIGHT_BASE_URL.

Do not use jsdom for behavior that depends on layout, pointer input, canvas, WebGL, Worker transfer, IndexedDB, or browser timing.

### 3.6 Coverage and architecture gates

Coverage floors:

- 90 percent statements, branches, and functions in src/domain.
- 90 percent statements, branches, and functions in src/generation.
- 90 percent statements, branches, and functions in src/simulation.
- 80 percent statements, branches, and functions overall.

dependency-cruiser must enforce:

- domain imports nothing from app, features, rendering, persistence, or React.
- generation imports only domain and generation.
- simulation engine imports only domain, generation, and simulation.
- rendering imports domain and simulation protocol types, but not React features.
- persistence imports domain, but not React or rendering.
- features may import app services, domain, rendering facades, and repositories.
- no module imports simulation/worker.ts except the Worker build entry.
- no circular dependency is allowed.

## 4. Architecture and ownership

### 4.1 Runtime flow

    React controls
        |
        v
    commandDispatcher -----> repositories -----> IndexedDB
        |
        v
    simulationClient <-----> dedicated Worker
        |                         |
        | FRAME                   | authoritative cores, stars, clock,
        v                         | history, effects, snapshots
    PixiViewport <---------------+
        |
        +---- artworkCapture -----> captures and recording frames

### 4.2 Single owners

| Concern | Sole owner | Prohibited duplication |
| --- | --- | --- |
| Live core and star state | Worker engine | Main-thread physics |
| Playback clock and simulation steps | Worker scheduler | Pixi ticker simulation |
| Mode, draft, selection, dialogs | Zustand application store | Worker UI state |
| Camera transform and trail texture | PixiViewport | React per-frame camera state |
| Product selection rule | selectionService | Pixi event auto-selection |
| Mutation ordering and undo coordination | commandDispatcher | Component-specific mutation paths |
| Portable validation | domain schemas | Repository repairs |
| Local durable data | repositories | Direct IndexedDB calls in components |
| Last recovery checkpoint | simulationClient | Zustand checkpoint buffers |
| Recording cadence and metadata | recordingService | React timers |

### 4.3 Main-thread state

Zustand contains only:

- mode.
- draft configuration and optional draft name.
- committed Random category and scenario seed.
- committed ordered GalaxyDescriptor summaries from TOPOLOGY.
- selected galaxy ID or null.
- performance level.
- trails enabled.
- automatic-framing enabled.
- low-frequency Worker status.
- selected-core x/y/vx/vy projection throttled to at most 10 updates per second for numeric display only.
- current modal or panel state.
- pending mutation description.
- history UI status and selected marker ID.
- recording UI status and counters.
- library summaries, never image or frame Blob collections.

Camera center and zoom remain inside PixiViewport. Star and core per-frame coordinates never enter Zustand.

### 4.4 Worker state

The Worker owns:

- Ordered GalaxyRecord list.
- Core position and velocity arrays.
- Live star position and velocity arrays.
- Star ownership segments.
- Immutable style blocks.
- Gravity, selected playback speed, and playing state.
- Fixed-step and active-wall-clock accumulators.
- Encounter and merger effect state.
- History markers, keyframes, command log, and reconstruction cache.
- Undo snapshots requested by the main thread.
- Model revision, frame ID, step index, and event ordinal.

## 5. Exact domain contracts

Use these shapes. Field names may not be changed without updating every schema, portable format, and protocol type.

### 5.1 Closed unions

    GalaxyType =
      spiral | barredSpiral | elliptical | irregular | dwarf

    Mode =
      single | collision | builder | random

    PerformanceLevel =
      low | balanced | high

    PlaybackSpeed =
      0.25 | 0.5 | 1 | 2 | 4

    RandomCategory =
      single | collision | cluster

### 5.2 Records

    Vec2
      x: finite number
      y: finite number

    GalaxyGenerationConfig
      type: GalaxyType
      seed: uint32
      starCount: integer 500..120000
      size: finite number 10..100
      mass: finite number 1..1200
      spin: finite number -2..2
      armCount: integer 1..8 for spiral/barredSpiral; null otherwise
      blackHole: boolean

    GalaxyRecord
      id: stable non-empty ASCII identifier, maximum 100 code points
      generation: GalaxyGenerationConfig
      name: trimmed 1..80-code-point string or null
      position: Vec2, each component -10000..10000
      bulkVelocity: Vec2 whose magnitude is at most 20

    SceneSetup
      galaxies: ordered GalaxyRecord array, length 0..12
      gravity: finite number 0.25..4
      playbackSpeed: PlaybackSpeed
      performanceLevel: PerformanceLevel
      trails: boolean

    EngineSetup
      galaxies: ordered GalaxyRecord array, length 0..12
      gravity: finite number 0.25..4
      playbackSpeed: PlaybackSpeed

EngineSetup is the exact projection sent to the Worker. Performance level and trails remain main-thread-owned and are committed through the coordinated UI part of a scene transaction.

    DraftGalaxy
      generation: GalaxyGenerationConfig
      name: valid name or null

Use null, not undefined, for nullable persisted and protocol fields. Optional object fields are limited to metadata explicitly marked optional.

### 5.3 Constants

Place all observable ranges and defaults in src/domain/ranges.ts:

- Maximum galaxies: 12.
- Maximum scene stars: 120000.
- Maximum scene mass: 1200.
- Default camera center: 0, 0.
- Default camera zoom: 5 CSS pixels per DU.
- Minimum camera zoom: 0.02 CSS pixels per DU.
- Maximum camera zoom: 100 CSS pixels per DU.
- Auto-frame padding factor: 1.20.
- Velocity-handle scale: 2 DU per VU.
- Low default and Random budget: 10000.
- Balanced default and Random budget: 30000.
- High default and Random budget: 60000.

The pure coreRadius function returns max of 2 and 0.10 times size.

### 5.4 Validation order

For all domain data:

1. Reject the wrong primitive type.
2. Reject NaN and infinity.
3. Reject non-integers where integers are required.
4. Canonicalize every accepted numeric negative zero to positive zero before hashing, persistence, protocol transfer, or equality checks. JSON cannot preserve negative zero, so no domain record may retain it.
5. Reject values outside closed ranges.
6. Canonicalize armCount to null only after type validation; never accept an arbitrary arm count for a non-arm type.
7. Validate each galaxy.
8. Reject duplicate IDs.
9. Validate galaxy count, total explicit star count, and total mass.
10. Return a new immutable value; never mutate input data.

Typed invalid inputs are rejected without changing the active value. Direct controls must prevent invalid choices.

### 5.5 Name handling

For product names:

1. Apply String.prototype.trim.
2. Reject an empty result.
3. Count Unicode code points with Array.from.
4. Reject more than 80 code points.
5. Store the trimmed text without normalization so the user's text remains associated.
6. Build a separate uniqueness key with trimmed.normalize("NFC").toLowerCase().

Combining marks count as their own code points. Tests must cover BMP text, astral text, combining sequences, leading/trailing whitespace, 80 code points, and 81 code points.

## 6. Deterministic identity, hashing, and math

Generation reproducibility applies to the same application generation version across Windows/Linux and Chromium/Firefox. The generation implementation must follow this section exactly.

### 6.1 Integer rules

All PRNG and seed-hash intermediate values are unsigned 32-bit integers. After addition, XOR, shift, or multiplication, coerce with unsigned right shift by zero. Use Math.imul for 32-bit multiplication.

### 6.2 mix32

Implement:

    function mix32(value):
      x = value unsigned
      x = x XOR (x unsigned-shift-right 16)
      x = imul(x, 0x7feb352d)
      x = x XOR (x unsigned-shift-right 15)
      x = imul(x, 0x846ca68b)
      x = x XOR (x unsigned-shift-right 16)
      return x unsigned

### 6.3 Word hashing and domain separation

Implement hashWords(domain, words):

1. h = mix32(domain XOR 0x9e3779b9).
2. For each unsigned word in order, h = mix32(h XOR word).
3. Return h.

Fixed domain words:

| Domain | Hex word |
| --- | ---: |
| Position stream | 0x504f534e |
| Velocity stream | 0x56454c4f |
| Style stream | 0x5354594c |
| Galaxy-level variation | 0x47414c58 |
| Random scenario | 0x53434e45 |
| Random child galaxy | 0x4348494c |
| Random ID | 0x4944454e |
| Merger config hash | 0x4d434647 |
| Merger seed | 0x4d455247 |

To hash a finite number into a word sequence, write its IEEE-754 Float64 representation to an eight-byte DataView in little-endian order and hash the lower 32-bit word followed by the upper 32-bit word.

Fixed enum codes:

| Union | Codes |
| --- | --- |
| Galaxy type | spiral 0, barredSpiral 1, elliptical 2, irregular 3, dwarf 4 |
| Performance | low 0, balanced 1, high 2 |
| Random category | single 0, collision 1, cluster 2 |
| Boolean | false 0, true 1 |
| Arm count | null 0; actual arm count 1..8 |

Canonical generation-config words are, in order:

1. Galaxy type code.
2. Seed.
3. Star count.
4. Size lower and upper Float64 words.
5. Mass lower and upper Float64 words.
6. Spin lower and upper Float64 words.
7. Arm-count code.
8. Black-hole code when the named stream includes black-hole state.

No stringification, locale formatting, property enumeration, or JSON serialization participates in a seed.

### 6.4 Mulberry32 PRNG

State is one unsigned 32-bit word.

    nextUint32:
      state = state + 0x6d2b79f5, unsigned
      t = state
      t = imul(t XOR (t unsigned-shift-right 15), t OR 1)
      t = t XOR unsigned(t + imul(t XOR (t unsigned-shift-right 7), t OR 61))
      return unsigned(t XOR (t unsigned-shift-right 14))

    nextFloat:
      return nextUint32 / 4294967296

Required first-five-output vectors:

| Seed | Outputs in hexadecimal |
| ---: | --- |
| 0 | 4434b462, 00159c37, 39285b08, 256d8104, 77a2cbd4 |
| 1 | a087eaf3, 00b349c9, 8706c4eb, fb2627fd, f7e79d2b |
| 4294967295 | e57bf3d3, 3081a5a4, b7350390, f1ade904, d8616a2f |

Every logical stream receives a separately hashed seed. Do not reuse one stream for positions, velocities, and styles.

### 6.5 Prohibited generation operations

ESLint must reject these in src/generation:

- Math.random.
- acos, acosh, asin, asinh, atan, atanh, atan2.
- cbrt.
- cos, cosh.
- exp, expm1.
- hypot.
- log, log1p, log2, log10.
- pow.
- sin, sinh.
- tan, tanh.
- The exponentiation operator.

Allowed:

- Math.sqrt.
- Math.fround.
- Math.floor, ceil, round, trunc.
- Math.min, max, abs, sign.
- Basic arithmetic.
- Integer bit operations and Math.imul.

The lint rule must have a test containing one rejected example for every prohibited operation.

### 6.6 Sine artifact

Create scripts/generate-sine-table.mjs and src/generation/generated/sine-f32.bin.

The generator:

1. Allocates 65536 Float32 entries.
2. For index i, computes Math.fround(Math.sin(2 times Math.PI times i divided by 65536)).
3. Writes the Float32 bytes in little-endian order.
4. Prints the SHA-256 digest.

Run this generator once on the foundation Node 24 environment and commit both artifact and digest in src/generation/sineTableDigest.ts. Product generation reads the committed bytes; it never regenerates the table at runtime. Other machines verify the digest and consume the same bytes.

Loading contract:

1. sineTable.ts exports installSineTable(ArrayBuffer), sinTurn, and cosTurn.
2. installSineTable checks exact byte length 262144, computes SHA-256, compares the committed digest, reads every Float32 little-endian through DataView, and then marks the table ready.
3. Browser bootstrap and worker.ts import the asset URL with the Vite ?url suffix, fetch it, and call installSineTable before generating any galaxy.
4. Worker does not emit READY until the table is installed.
5. A test-only Node setup file reads the committed binary with node:fs/promises and calls installSineTable. Production generation modules never import Node.
6. sinTurn/cosTurn throw a stable SINE_TABLE_NOT_READY error if called before installation.

sinTurn(turns), where one turn is a full circle:

1. reduced = turns minus floor(turns), producing a value in 0 inclusive to 1 exclusive.
2. scaled = Math.fround(reduced times 65536).
3. i0 = floor(scaled) bitwise-and 65535.
4. i1 = i0 plus 1 bitwise-and 65535.
5. fraction = Math.fround(scaled minus floor(scaled)).
6. Return Math.fround(table[i0] plus Math.fround(fraction times Math.fround(table[i1] minus table[i0]))).

cosTurn(turns) is sinTurn(turns plus 0.25).

normalLike(prng) is the sum of exactly twelve nextFloat calls minus 6. It consumes twelve values even when its caller later multiplies the result by zero.

### 6.7 Quantization and digest

Every generated local position and local velocity component is written through Math.fround. Style components are integers.

The canonical generation digest is SHA-256 over this byte sequence:

1. UTF-8 bytes GALAXIA-GEN-1.
2. Little-endian uint32 star count.
3. x Float32 bytes in index order, little-endian.
4. y Float32 bytes.
5. vx Float32 bytes.
6. vy Float32 bytes.
7. red, green, blue, alpha, and pointSize Uint8 bytes in that order.

Do not digest object JSON, IDs, names, placement, timestamps, owner slots, or typed-array native byte order.

## 7. Exact galaxy generation design

All generator functions return local coordinates centered at zero and local velocity without bulk velocity. The Worker adds scene position and bulk velocity.

### 7.1 Shared output and draw discipline

    GeneratedGalaxy
      x, y, vx, vy: Float32Array
      red, green, blue, alpha, pointSize: Uint8Array

All arrays have exactly starCount entries.

For a given configuration:

- positionSeed = hashWords(Position stream, canonical config words excluding blackHole).
- velocitySeed = hashWords(Velocity stream, canonical config words excluding blackHole).
- styleSeed = hashWords(Style stream, canonical config words including type, seed, starCount, size, mass, spin, armCount, and blackHole).
- variationSeed = hashWords(Galaxy-level variation, type code and seed).

Excluding blackHole from position and velocity random streams means the random draws are identical off/on. Black-hole state changes only the deterministic circular-speed calculation and central style.

The first ten star indices are core-reserved. Their reservation radius is 0.95 times coreRadius so Float32 rounding cannot place them outside the core. Remaining stars use the type distribution. This rule guarantees the inner-star requirement at every allowed star count and size.

Every star consumes the same number of position, velocity, and style draws for its type regardless of branches. Where a branch does not need a draw, consume and ignore it. This prevents index-dependent changes after a conditional.

The shared core-reserved point is exact:

    coreReservedPoint(uRadius, uAngle) =
      polar(0.95 times coreRadius times sqrt(uRadius), uAngle)

Every type uses that point directly for indices 0 through 9, without its ordinary bar, clump, axis-ratio, or arm transform. The generator still consumes all position draws that the type normally assigns to that index. This common rule is what the black-hole and minimum-count tests measure.

Draw counts per star are fixed:

| Stream | Spiral | Barred spiral | Elliptical | Irregular | Dwarf |
| --- | ---: | ---: | ---: | ---: | ---: |
| Primary position | 4 | 5 | 4 | 5 | 4 |
| Position jitter | 12 | 12 | 0 | 0 | 0 |
| Velocity | 24 | 24 | 24 | 24 | 24 |
| Style | 4 | 4 | 4 | 4 | 4 |

The position-jitter PRNG used by spiral and barred spiral is seeded with hashWords(Position stream, positionSeed, 0x4a495454). Consume its twelve draws for every star, including a core-reserved star or branch that ignores the resulting normalLike value. Velocity always consumes one twelve-draw normalLike for radial jitter followed by one twelve-draw normalLike for tangential jitter. Style consumes its four values in the order named in section 7.8.

### 7.2 Shared polar and velocity helpers

polar(radius, turns):

    x = fround(radius times cosTurn(turns))
    y = fround(radius times sinTurn(turns))

For a local position with radius r greater than zero:

    radial unit = position divided by r
    tangential unit = negative radialY, radialX

At r zero, radial unit is 1,0 and tangential unit is 0,1.

Internal radial acceleration magnitude at gravity 1 comes from the single `ownerRadialAcceleration` function in `src/domain/physicsContract.ts` defined by sections 8.2 through 8.4. Generation must import it; it must not reproduce the owner-potential formula. Circular speed is:

    sqrt(max(0, r times ownerRadialAcceleration(r, generation, 1)))

Mean tangential speed is spin times circular speed. Add deterministic dispersion:

    radial speed = normalLike(velocity PRNG) times radialSigma times circularSpeed
    tangential jitter = normalLike(velocity PRNG) times tangentialSigma times circularSpeed
    velocity = radialUnit times radialSpeed
               plus tangentialUnit times (meanTangentialSpeed + tangentialJitter)

Dispersion table:

| Type | radialSigma | tangentialSigma |
| --- | ---: | ---: |
| Spiral | 0.010 | 0.015 |
| Barred spiral | 0.020 | 0.025 |
| Elliptical | 0.080 | 0.080 |
| Irregular | 0.060 | 0.060 |
| Dwarf | 0.025 | 0.030 |

### 7.3 Spiral positions

For each star consume u0, u1, u2, and u3 from the position stream.

Core-reserved indices use coreReservedPoint(u0, u1).

Other indices:

1. If u2 is less than 0.15, create a bulge:
   - radius = 0.25 times size times sqrt(u0).
   - turns = u1.
2. Otherwise create an arm/disc star:
   - radius = size times sqrt(u0).
   - arm = floor(u1 times armCount), capped at armCount minus 1.
   - handedness = -1 when spin is negative, otherwise 1.
   - armBaseTurns = arm divided by armCount.
   - twistTurns = handedness times 0.85 times radius divided by size.
   - widthTurns = normalLike value made from a separate fixed position-jitter stream times 0.018 times (0.35 plus 0.65 times radius divided by size).
   - turns = armBaseTurns plus twistTurns plus widthTurns plus 0.04 times (u3 minus 0.5).

The separate position-jitter stream and its consumption follow section 7.1.

### 7.4 Barred-spiral positions

For each star consume u0 through u4 plus the section 7.1 twelve-draw position-jitter value.

The fixed bar orientation is variation PRNG nextFloat.

Core-reserved indices use coreReservedPoint(u0, u1) directly and ignore the computed bar/arm result after consuming its other draws.

For other indices:

1. If u2 is less than 0.28, create a bar point:
   - localBarX = (2 times u0 minus 1) times 0.48 times size.
   - taper = 1 minus abs(localBarX) divided by (0.48 times size).
   - localBarY = normalLike times 0.055 times size times max(0.2, taper).
   - Rotate localBarX, localBarY by bar orientation using sinTurn/cosTurn.
2. Otherwise create an arm point:
   - radius = size times (0.20 plus 0.80 times sqrt(u0)).
   - arm = floor(u1 times armCount), capped.
   - armBaseTurns = barOrientation plus arm divided by armCount.
   - handedness follows spin sign as in spiral.
   - turns = armBaseTurns plus handedness times 0.70 times radius divided by size plus normalLike times 0.020 plus 0.03 times (u4 minus 0.5).

### 7.5 Elliptical positions

Galaxy-level variation:

- orientation = first variation nextFloat.
- axisRatio = 0.55 plus 0.25 times second variation nextFloat.

For each star consume u0, u1, u2, u3.

Core-reserved indices use coreReservedPoint(u0, u1) directly. Other indices use radius size times u0 times u0, producing a concentrated profile.

For a non-reserved index, before rotation:

    ex = radius times cosTurn(u1)
    ey = axisRatio times radius times sinTurn(u1)

Rotate ex, ey by orientation. u2 and u3 are consumed for stream stability and ignored.

### 7.6 Irregular positions

Create exactly four clump centers from the galaxy-level variation stream. For each clump:

- center radius = 0.45 times size times sqrt(nextFloat).
- center turns = nextFloat.
- center is polar(center radius, center turns).

For each star consume u0 through u4.

Core-reserved indices use coreReservedPoint(u0, u1) directly.

For other indices:

1. If u0 is less than 0.80:
   - clump index = floor(u1 times 4), capped at 3.
   - local radius = 0.30 times size times sqrt(u2).
   - local turns = u3.
   - point = clump center plus polar(local radius, local turns).
2. Otherwise:
   - point = polar(size times sqrt(u2), u3).

All clump centers plus local radii are inside 0.75 times size, so no rejection or projection is needed. u4 is consumed and ignored.

### 7.7 Dwarf positions

Galaxy-level variation:

- orientation = first variation nextFloat.
- axisRatio = 0.82 plus 0.13 times second variation nextFloat.

For each star consume u0, u1, u2, u3.

Core-reserved indices use coreReservedPoint(u0, u1) directly. For another index, radius is size times u0 times u0.

Create an axis-scaled polar point with axisRatio, rotate by orientation, and ignore u2/u3 after consuming them.

### 7.8 Style generation

Every star consumes paletteChoice, brightnessChoice, sizeChoice, and alphaChoice.

Palettes are three RGB colors:

| Type | Cool | Mid | Warm |
| --- | --- | --- | --- |
| Spiral | 116,168,255 | 192,215,255 | 255,230,184 |
| Barred spiral | 142,155,255 | 217,197,255 | 255,202,153 |
| Elliptical | 218,184,142 | 244,216,176 | 255,239,207 |
| Irregular | 104,210,218 | 174,153,255 | 255,142,191 |
| Dwarf | 132,171,214 | 190,206,226 | 231,222,196 |

Choose:

- paletteChoice below 0.25: Cool.
- 0.25 through below 0.80: Mid.
- 0.80 or above: Warm.

Multiply each selected channel by 0.75 plus 0.25 times brightnessChoice, round to nearest integer, and clamp 0..255.

Alpha is round of 150 plus 90 times alphaChoice, range 150..240.

Point size:

- sizeChoice below 0.82: 1.
- 0.82 through below 0.98: 2.
- 0.98 or above: 3.

The central object is rendered separately and is not a generated star.

### 7.9 Built-in configurations

First Light is exactly the specification default.

Built-in presets:

| Name | Type | Seed | Stars | Size | Mass | Spin | Arms | Black hole |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Grand Spiral | Spiral | 101 | 30000 | 40 | 25 | 1.0 | 2 | Off |
| Ember Bar | Barred spiral | 202 | 30000 | 40 | 25 | 1.0 | 2 | Off |
| Golden Ellipse | Elliptical | 303 | 30000 | 40 | 25 | 0.6 | n/a | Off |
| Tidepool | Irregular | 404 | 30000 | 40 | 25 | 0.4 | n/a | Off |
| Small Wonder | Dwarf | 505 | 10000 | 25 | 8 | 0.7 | n/a | Off |

These presets are immutable application assets. Users can duplicate them but not overwrite or delete them.

### 7.10 Random scenarios

Performance budgets are exactly 10000, 30000, and 60000.

Scenario root seed:

    hashWords(Random scenario, category code, scenario seed, performance code)

Construct one rootScenarioPrng from that word. Child PRNGs are independently hashed and never consume the root stream. For single and collision, consume no rootScenarioPrng values. For cluster, the first root draw determines count and the second root draw determines phase; there are no other root draws.

Cluster count:

    3 plus rootScenarioPrng.nextUint32 modulo 3

Star allocation:

1. single: entire budget.
2. collision: floor half to galaxy 0, remainder to galaxy 1.
3. cluster: floor budget divided by count to each; give one remainder star to indices from zero upward.

For child i, seed a child PRNG with hashWords(Random child galaxy, root seed, i).

Child configuration:

- type = one of five types by nextUint32 modulo 5.
- seed = nextUint32.
- explicit starCount = allocated count.
- size = fround(28 plus 24 times nextFloat).
- mass = fround(18 plus 24 times nextFloat).
- spin magnitude = fround(0.55 plus 0.90 times nextFloat).
- spin sign is negative when nextUint32 is odd.
- arm count = 2 plus nextUint32 modulo 3 for arm types; null otherwise.
- blackHole is on when nextFloat is below 0.20.
- name is Random Galaxy followed by one-based index.
- ID is r- followed by eight lowercase hexadecimal digits from hashWords(Random ID, root seed, i), a hyphen, and i.

If a deterministic Random ID collides with an earlier child ID, recompute with an additional collision-counter word starting at 1 until unique. This loop is deterministic and bounded to 100 attempts; exhausting it is INVALID_SIMULATION_STATE.

Placement:

- single: position 0,0; velocity 0,0.
- collision:
  - galaxy 0 position -30,0 and velocity +0.25,+0.35.
  - galaxy 1 position +30,0 and velocity -0.25,-0.35.
  - Subtract the mass-weighted mean velocity from both so total configured momentum is zero.
- cluster:
  - radius = 100 DU.
  - phase turns = rootScenarioPrng.nextFloat, the second root draw after count.
  - galaxy i turns = phase plus i divided by count.
  - position = polar(radius, turns).
  - totalMass is the sum of child mass.
  - baseSpeed = min(8, 0.55 times sqrt(BASE_G times totalMass divided by radius)), where BASE_G is the shared calibrated section 8.2 value and initially 64.
  - velocity is tangential at baseSpeed, alternating a deterministic radial perturbation of plus or minus 0.15 VU.
  - Subtract the mass-weighted mean position and velocity so the barycenter is 0,0 with zero momentum.

Random generation always creates explicit star counts and is therefore unaffected by later performance-level changes.

Compute child and barycenter sums in increasing child index. After every child configuration scalar, final position component, and final bulk-velocity component is derived, store it through Math.fround. Do not use array reduce callbacks whose order could be changed during refactoring.

Random Generate dispatches the EngineSetup projection through LOAD_SETUP with postLoadPlaying true. Entering Single through scene replacement dispatches its EngineSetup projection with postLoadPlaying equal to the pre-transition selected playing flag. A saved-scene load dispatches its EngineSetup projection with postLoadPlaying false.

### 7.11 Generation tests

Required tests:

- All range boundaries and just-outside values.
- Negative zero canonicalizes to positive zero and survives JSON round trip without changing a digest.
- PRNG vectors in section 6.4.
- Sine table digest, lookup wraparound, quadrants, and interpolation boundaries.
- Every type at 500 and 120000 stars.
- At 500 stars and size 100, at least ten stars inside core for every type, black hole off and on.
- Black-hole off/on positions are byte-identical.
- Mean inner speed with black hole on is at least 5 percent higher.
- Names and placement do not change generation digest.
- Repeated same input returns same digest.
- Chromium and Firefox on Windows/Linux return the same digest.
- Angular test: 65536 uniform-disc samples in 64 bins have chi-square at most 95 and largest-bin/smallest-bin ratio at most 1.15.
- Random cluster count is 3..5 and all budgets are exact.
- Changing only performance level deterministically changes only the explicit allocation and downstream derived children.

## 8. Exact simulation and physics design

### 8.1 Numerical representation

- Core position, velocity, and acceleration use Float64Array.
- Live star x, y, vx, and vy use Float32Array.
- Live owner slot uses Uint8Array; at most twelve galaxies exist.
- Style uses immutable blocks containing five Uint8 arrays.
- Core calculations use JavaScript Float64 arithmetic.
- After every complete step, star x, y, vx, and vy are written with Math.fround.
- Every completed step is scanned for non-finite values.

Use two reusable mutable state banks so last-valid preservation is real, not aspirational:

- currentBank is the only authoritative/publishable bank.
- candidateBank has core x/y/vx/vy/acceleration arrays and star x/y/vx/vy arrays sized to the current topology.
- For an ordinary step, read only currentBank, write every next value into candidateBank, validate the complete candidate, then swap bank references. Never overwrite currentBank during calculation.
- The kick-drift-kick implementation may update a candidate component multiple times within the step, but no candidate reference is visible outside Engine until commit.
- Reuse both allocations on later same-count steps; no per-step typed-array allocation is allowed.
- Effect/timer state and step counters are copied into a small candidate record and committed with the bank swap.
- Committed descriptors/segments/ownerSlot/style references live in a separate immutable topology object shared by both banks. An ordinary step reads that topology.
- A merger builds a private candidate topology with descriptors/segments/ownerSlot while retaining immutable style-block references. Its private working bank uses that candidate topology. A failed merger step releases candidate-only structures and keeps prior topology/bank/effects/revision.
- A topology-changing command builds and validates a complete candidate engine state before replacing currentBank. Allocate replacement banks only when capacity is insufficient; after commit, retain the old bank only if it becomes the reusable correctly sized candidate, otherwise release it.
- Snapshot, digest, checkpoint, and FRAME always read currentBank.

This extra bank is included in section 11.5 memory accounting. A validation failure discards candidate contents, pauses, emits ERROR_PAUSED, and republishes nothing; the already rendered currentBank remains valid.

Engine content digest used by history/undo/recovery tests is SHA-256 over:

1. UTF-8 header GALAXIA-ENGINE-1.
2. Step index as little-endian uint64 represented by two uint32 words.
3. Gravity and selected playback speed as Float64 little-endian.
4. Ordered galaxy count and, for each galaxy:
   - UTF-8 ID length/content.
   - Canonical generation-config words from section 6.3.
   - Name as uint32 length/content, with 0xffffffff length for null.
   - Core position and velocity Float64 words.
5. Star count.
6. Star x, y, vx, vy Float32 arrays in separate array order, little-endian.
7. Segment owner IDs/ranges and immutable style bytes in live star order.
8. Encounter/effect state sorted by ordered galaxy-pair IDs.
9. Step-accumulator Float64 and any live PRNG state.

The digest excludes playing/paused state, modelRevision, frameId, request IDs, history/undo containers, recovery/checkpoint IDs, and render/camera state. Tests assert those excluded behavioral states separately. Never use JSON or native typed-array byte order for this digest.

### 8.2 Fixed constants

Place generation-affecting BASE_G, EXTENDED_SOFTENING_FRACTION, and BLACK_HOLE_SOFTENING_FRACTION in src/domain/physicsContract.ts. That module also exports the pure scalar `plummerRadialAcceleration` kernel and `ownerRadialAcceleration(r, generation, gravity)`. Generation and simulation both import those functions and constants from the single module; neither may reproduce the owner-potential component split. Place the remaining simulation-only constants in src/simulation/constants.ts.

| Constant | Value |
| --- | ---: |
| Base step DT | 1/60 |
| BASE_G | 64 |
| EXTENDED_SOFTENING_FRACTION | 0.15 times galaxy size |
| BLACK_HOLE_SOFTENING_FRACTION | 0.25 times core radius |
| Tidal differential gain | 5.00 |
| Friction gamma maximum | 24 |
| Friction speed scale | 3 VU |
| Friction speed exponent | 8 |
| Maximum half-friction fraction | 0.20 |
| Encounter threshold multiplier | 2 times summed core radii |
| Merger speed threshold | 1 VU |

Gravity setting multiplies BASE_G in all conservative internal and external acceleration. Generated initial velocities always use gravity 1.

### 8.3 Plummer acceleration

For displacement vector d and softening epsilon:

    denominator = (dot(d,d) + epsilon squared) times sqrt(dot(d,d) + epsilon squared)
    acceleration vector per unit attracting mass = BASE_G times gravity times d divided by denominator

If denominator is zero or non-finite, fail the step.

Core pair softening:

    sqrt((0.15 times sizeA) squared + (0.15 times sizeB) squared)

For every unordered core pair i,j, enumerated by increasing first scene index and then increasing second scene index:

    accelerationI += unitAcceleration times massJ
    accelerationJ -= unitAcceleration times massI

This makes massI times accelerationI plus massJ times accelerationJ equal zero apart from floating rounding.

### 8.4 Owner potential and black hole

For a star relative to its owner:

- Black hole off: 100 percent of owner mass uses softening 0.15 times size.
- Black hole on:
  - 90 percent uses softening 0.15 times size.
  - 10 percent is modeled as a point mass at the exact core center and therefore lies inside the core radius. Its force uses numerical Plummer softening 0.25 times coreRadius to avoid a singularity; that softening is not interpreted as spatially spreading the configured point mass.

The 10 percent component is centered on the core and entirely represents the concentrated mass required by the specification. Total configured mass never changes.

`ownerRadialAcceleration(r, generation, gravity)` is the non-negative magnitude obtained by applying the appropriate component sum at displacement r,0. It returns zero at r zero. Generation calls it with gravity 1; simulation calls the same function with the live gravity setting. For a star at owner-relative position `(r, 0)`, simulation applies x acceleration exactly `-ownerRadialAcceleration(r, generation, gravity)` and y acceleration zero.

Contract test: for r equal to 0, 0.5 times coreRadius, coreRadius, size, and 2 times size, a single-galaxy engine's owner-internal acceleration must equal the shared function exactly, with black hole off and on and gravity 0.1, 1, and 2. This test imports the domain function as its expected value; it must not contain a second reference formula.

### 8.5 Star external acceleration and tides

For each owner core, first compute its conservative acceleration from other cores. Friction is a velocity impulse, not an acceleration term.

For a star owned by galaxy i:

1. Compute owner internal acceleration from section 8.4.
2. Compute conservative acceleration from every other core at the star position.
3. Compute conservative acceleration from every other core at the owner center.
4. differential = externalAtStar minus externalAtOwnerCenter.
5. total star acceleration =
   owner core conservative acceleration
   plus owner internal acceleration
   plus 5.00 times differential.

This makes each galaxy follow its core while providing deliberately visible tidal distortion. Stars do not influence cores or other stars.

After a friction half impulse has accumulated all pair contributions, add each core's summed velocity delta once to every live star owned by that core during that half impulse. This preserves each star's velocity relative to its owner while making the whole galaxy follow dissipative core motion without a pair-times-stars write loop.

### 8.6 Momentum-conserving overlap friction

Friction is applied only between cores whose generation discs overlap.

Within each half impulse, snapshot all core velocities before evaluating any pair. Enumerate overlapping unordered pairs by increasing first scene index and then increasing second scene index. For pair A,B, compute from the snapshot velocities:

    support = sizeA + sizeB
    separation = length(positionB - positionA)
    overlap = clamp((support - separation) / support, 0, 1)
    relativeVelocity = velocityB - velocityA
    speed = length(relativeVelocity)
    q = speed / 3
    q2 = q times q
    q4 = q2 times q2
    q8 = q4 times q4
    gamma = 24 times overlap squared divided by (1 + q8)
    k = clamp(gamma times halfDT, 0, 0.20)

To reduce relative velocity by fraction k while conserving momentum:

    totalMass = massA + massB
    deltaA = relativeVelocity times (massB / totalMass) times k
    deltaB = relativeVelocity times (-massA / totalMass) times k
    accumulatedDeltaA += deltaA
    accumulatedDeltaB += deltaB

After every pair has been evaluated, apply each core's summed delta once to that core and once to every live star owned by it. Do not mutate a core or star velocity while pair impulses are still being computed. This makes pair evaluation independent of mutation order and bounds propagation to one owned-star pass per core per half impulse rather than one pass per pair.

Every section 8.11 calibration fixture has at most two cores, so snapshot/accumulate/apply produces exactly the same arithmetic and reference values for those fixtures. Tests must pin that equality while adding separate three- and twelve-core overlap cases.

Apply this accumulated impulse twice per step as described in section 8.7. High-speed flybys receive very little damping because of q8; slow overlapping systems are captured. A bound overlapping pair is expected to be captured eventually: with the required starting tuple, the SPEC Scenario 5 flyby completes its conforming first pass without merging but is captured and merges at about t = 24.56666667. No acceptance requirement says that this fixture must remain separate forever.

### 8.7 One complete simulation step

Perform exactly:

1. Read the immutable start-of-step core state.
2. Detect all merger-eligible pairs using section 8.8.
3. Apply the disjoint merger set. Newly created remnants cannot merge again until the next step.
4. Rebuild owner slots and segments if topology changed.
5. Compute conservative core accelerations at current positions.
6. Half-kick core velocities by acceleration times DT/2.
7. Apply one accumulated overlap-friction half impulse using the start-of-half-impulse velocity snapshot, then add each core's summed delta once to that core and its owned star velocities.
8. Compute star acceleration at current star/core positions and half-kick star velocities.
9. Drift cores by velocity times DT.
10. Drift stars by velocity times DT, storing Float32.
11. Compute conservative core accelerations at new positions.
12. Half-kick core velocities.
13. Apply the second accumulated overlap-friction half impulse from a new start-of-half-impulse velocity snapshot, then add each core's summed delta once to that core and its owned star velocities.
14. Compute star accelerations at new positions and half-kick star velocities, storing Float32.
15. Update encounter membership and effect timers using the step's activeWallSeconds parameter.
16. Increment stepIndex.
17. Validate every core, star, timer, and count.
18. Publish state only if valid.

Bank discipline for this order: without a merger, steps 5 through 14 read old positions/velocities from currentBank as needed and write half-kicked/drifted/final values to candidateBank. With a merger, step 3 first seeds candidateBank with the reordered merged start state; steps 5 through 14 then treat that candidate as the private working state and may mutate it in place because currentBank still preserves the entire pre-step scene. In both cases, step 18 means one pointer/topology/effect commit after validation, followed by event emission. It never means publishing partially filled arrays.

Keep a last-valid pointer before step 1. On failure, discard the candidate state, pause, retain the previous state, and emit ERROR_PAUSED.

### 8.8 Deterministic mergers

At step start:

1. Enumerate pairs by increasing first scene index, then increasing second scene index.
2. A pair is eligible when separation is no greater than summed core radii and relative speed is no greater than 1.
3. Add an eligible pair only if neither member is already used by an earlier pair.
4. Apply all selected disjoint pairs using their original start-of-step state.
5. Remove all inputs.
6. Append remnants in pair-enumeration order.

Remnant fields:

- mass: exact arithmetic sum.
- center: mass-weighted center.
- bulk velocity: mass-weighted velocity.
- type: elliptical.
- armCount: null.
- size: min of 100 and sqrt(sizeA squared plus sizeB squared).
- spin: clamped mass-weighted spin.
- blackHole: logical OR.
- starCount: sum of live input counts.
- live stars: earlier input's star blocks in their existing order followed by later input's blocks.
- all union stars become owned by the remnant.
- scene order: newest because the remnant is appended.

The linear live-star layout follows scene order. While building the merger candidate bank, first copy unaffected galaxies' live x/y/vx/vy ranges in their surviving scene order. Then append, for each remnant in pair-enumeration order, the earlier input's existing segments followed by the later input's existing segments. Copy mutable star values into those new contiguous ranges, retain style-block slice references in the same order, and rebuild ownerSlot from the resulting segments. Do not sort stars by position or ID.

Canonical merger config hash excludes name, position, velocity, and IDs. Hash, in field order:

1. type code.
2. seed.
3. starCount.
4. Float64 words for size.
5. Float64 words for mass.
6. Float64 words for spin.
7. arm count code, using 0 for null and one-based arm count otherwise.
8. black-hole word 0 or 1.

For earlier input hashA and later input hashB:

    remnantSeed = hashWords(Merger seed, hashA, hashB)

Name:

- Both named: earlier name + " + " + later name.
- One named: that name + " Remnant".
- Neither named: null.
- Truncate from the end to 80 Unicode code points.

Remnant ID:

    m- plus stepIndex in base 10 plus "-" plus remnantSeed as eight lowercase hex digits plus "-" plus pair ordinal

If that ID already exists among unaffected galaxies, append -2, -3, and so on using the first free suffix. This does not affect remnant seed or generated stars.

Live union appearance is retained. Regenerating later uses the new elliptical configuration and remnant seed.

Emit one structural delta listing input IDs, remnant ID, old indices, new index, and model revision.

### 8.9 Encounter and luminance-effect state

For each unordered pair, track whether separation is within two times summed core radii. Also track one encounter episode per core. A core-level encounter interval is the union of the time in which that core is close to one or more other cores plus its following afterglow. This definition prevents overlapping pairs from recursively multiplying luminance.

After all pair inside/outside flags are updated, derive insidePairCount for each core. Process cores in scene order:

1. If insidePairCount changes from zero to positive and no encounter episode exists:
   - Capture the core's current requested peak excluding any encounter component but including its black-hole baseline and an active merger component.
   - Set encounter target to captured peak times 1.18.
   - Set afterglow remaining to 0.
2. If insidePairCount is positive while an episode already exists:
   - Keep its original captured target.
   - Set afterglow remaining to 0. A re-entry during afterglow resumes the same episode; it does not multiply the target.
3. If insidePairCount changes from positive to zero:
   - Set afterglow remaining to 0.55 active real seconds.
4. If insidePairCount remains zero and afterglow is positive:
   - Hold the encounter target unchanged while subtracting activeWallSeconds.
   - Delete the episode only after the held interval has reached at least 0.55 active real seconds; clamp the remaining timer at zero for state storage.

Requested peak for a core is max of its black-hole baseline, active encounter target, and active merger target. Multiple simultaneous encounters therefore share one core-level episode and never stack. Encounter and merger targets are held constant for their entire required interval; they do not fade below the acceptance ratio early. Timers decrement only during visible active playback. They freeze while paused, hidden, or single-stepping.

On merger:

- brighterInput = maximum requested peak of the two inputs immediately before merger.
- remnant merger target = brighterInput times 1.30.
- merger remaining = 1.10 active real seconds.

Hold the merger target unchanged until merger remaining has accumulated 1.10 seconds of visible active playback, then remove it. A remnant can have at most one merger component; a later merger replaces it using the new brighterInput calculation rather than retaining two components.

After a merger batch, delete every encounter-pair entry and core episode containing a removed input ID before rebuilding pair membership. The new remnant begins outside every encounter pair and carries only its merger target/timer; a later simulation step can create an ordinary encounter episode for it. DELETE_GALAXY performs the same pair/episode cleanup. A particle-generation edit clears the edited core's encounter episode, merger component, and pair flags involving that ID; name-only edits do not. LOAD_SETUP and REGENERATE_SCENE start with no pair/episode/merger effect. Undo/history restore and recovery restore the exact pair/effect state contained in their authoritative snapshot. This prevents removed IDs from keeping an afterglow alive or multiplying a descendant's effect.

The margins 18 percent, 30 percent, 0.55 seconds, and 1.10 seconds intentionally exceed the specification's 15 percent, 25 percent, 0.5 second, and 1 second thresholds.

With at most twelve starting galaxies, a lineage can undergo at most eleven mergers. Encounter episodes never stack, so even if every brighter input is in one encounter immediately before every merger, the section 10.8 black-hole-on scene-linear baseline remains below 7.75 after eleven factors of 1.18 times 1.30. Assert requested scene-linear peak is finite and below 8.0; exceeding that mathematical invariant is an implementation error, not a valid-state failure and not a reason to clamp the measurement value. The visible display applies the fixed tone map in section 10.8, so this larger scene-linear range does not create an opaque white display clamp.

### 8.10 Scheduler and active wall time

Playback speed maps to steps per visible real second:

| Speed | Steps/second |
| ---: | ---: |
| 0.25 | 15 |
| 0.5 | 30 |
| 1 | 60 |
| 2 | 120 |
| 4 | 240 |

The Worker receives periodic TICK messages from simulationClient containing current performance.now. It does not use setInterval for authoritative timing.

For each visible playing interval:

1. Split elapsed wall time at every 100 ms history boundary.
2. For each segment, add segmentSeconds times 60 times playbackSpeed to stepAccumulator.
3. While stepAccumulator is at least 1, execute one candidate step and subtract exactly 1 only after that step commits successfully.
4. Stop immediately on a failed step, preserve the unconsumed accumulator, pause, clear the tick origin, and create no marker for the failed boundary.
5. At the history boundary, record a marker after all whole steps due through that boundary.

Each regularly scheduled step receives activeWallSeconds = 1 divided by (60 times the speed that scheduled it). Therefore all completed scheduled steps total one effect-timer second per active real second at every playback speed. A manual single-step receives activeWallSeconds zero because paused stepping is not active playback.

At 0.25x, 100 ms markers alternate between one and two completed steps because the fractional accumulator is retained. At 1x each marker has six steps; at 4x each has twenty-four.

Process at most eight steps in one Worker task. If more remain, post an internal continuation and yield before the next eight. Never drop accumulated visible time. If the backlog exceeds one visible real second for five consecutive seconds, pause with an overload error instead of growing without bound.

On document hidden:

- simulationClient sends VISIBILITY hidden.
- Clear the last tick timestamp.
- Do not accumulate time, step, or create history markers.
- Preserve the selected playing state.

On visible, reset the tick origin and continue without catch-up.

Single-step:

1. Pause if playing.
2. Execute exactly one complete step.
3. Add one special history marker.
4. Preserve playback-speed selection.
5. Remain paused.

### 8.11 Physics calibration procedure

The constants in section 8.2 are the required starting tuple. Build perf/physics-calibration.ts before freezing generation goldens.

Independent core-only reference outputs for the starting tuple and exact step order:

| Fixture | Reference result |
| --- | --- |
| Default attraction at 30 units | separation 94.91200877 DU |
| Scenario 5 at 60 units | separation 122.57215338 DU; direction rotation 104.58194127 degrees; no merger |
| Slow capture | first eligible merge step at about 139.96666667 units with relative speed about 0.69546443 VU |
| Fast flyby, first pass through t = 2 | no merger; minimum relative speed during the first traversal while separation is at most 8 DU is about 16.25513293 VU |

A pure Float64 core harness using the same operation order should match each reported separation/speed within 1e-6 and angle within 1e-6 degree. A larger difference indicates an implementation-order error and must be fixed before running the grid.

Required internal margin gates:

- Default attraction at 160 DU: at least 2 percent separation decrease by 30 units.
- Scenario 5: at least 18 degrees direction rotation, at least 12 percent 90-percent-radius growth, and no merger through 60 units.
- First Light: sampled 300 units, 90-percent radius remains 80..120 percent of initial and at least 97 percent of stars remain within twice initial radius.
- Slow capture: default galaxies at -30 and +30 with zero velocity merge by 240 units.
- Fast close flyby from SPEC Scenario 5 remains above 1.25 VU throughout its first traversal of the merger distance and does not merge before t = 6, by which time the required brightening interval and 0.5-second afterglow have completed. Later capture at about t = 24.56666667 is conforming and is not part of this first-pass gate.
- Momentum residual for every friction application is at most 1e-10 times max(1, momentum magnitudes).

If the starting tuple passes, lock it. If it fails, do not tune manually. Run this ordered grid:

1. G: 60, 64, 68.
2. extended softening fraction: 0.12, 0.15, 0.18.
3. tidal gain: 4.00, 4.50, 5.00, 5.50.
4. friction gamma: 18, 24, 30.
5. friction speed scale: 2.5, 3.0, 3.5.

Keep black-hole softening, exponent, and maximum half-friction fraction fixed.

Evaluate tuples in the nested order listed and select the first tuple that passes every internal margin gate. Run the core-only gates first for each tuple and skip that tuple's star fixtures immediately if a core gate fails. Write one progress record after every tuple and flush it to the raw-results file so progress is observable. A complete 324-tuple sweep is expected to take about 1.5 to 2.5 hours on the reference device; advancing progress is not a hang. Write raw results, total wall time, and the chosen tuple to docs/adr/0004-physics-calibration.md. If no tuple passes, stop: changing the model requires a stronger-agent plan revision, not improvisation.

After choosing the tuple:

1. Regenerate final generation digests because circular velocities may have changed.
2. Run cross-browser digest equality.
3. Lock constants and digests together.
4. Any later constant change reruns the full physics and generation suites.

### 8.12 Required simulation fixtures

Create named factory functions, never duplicate literal setup in tests:

- firstLightFixture.
- defaultAttractionFixture: two default galaxies, seeds 1/2, positions -80/+80, zero velocity.
- scenario5OrbitFixture: exact SPEC Scenario 5 first fixture.
- scenario5FlybyFixture: exact second fixture.
- mergerFixture: exact SPEC Scenario 6.
- slowCaptureFixture: default galaxies at -30/+30, zero velocity.
- blackHolePairFixture: same seeded default galaxy off/on.
- highPerformanceFixture: exact SPEC section 17.1 High fixture.

## 9. Worker protocol and mutation transaction

### 9.1 Protocol-wide fields

Protocol version is 1.

Every acknowledged main-to-Worker request contains:

    protocolVersion: 1
    requestId: uint32
    expectedModelRevision: non-negative safe integer (uint53) or null
    transactionSnapshotId: string or null
    type: closed string
    payload: exact type-specific object

INIT, read-only requests, PLAY, PAUSE, snapshot creation/release, PING, and DISPOSE use null expected revision and operate on the latest state in FIFO order. Mutations use the model revision returned with the transaction snapshot, or the last acknowledged model revision for non-undoable mutation. Undoable mutation requests carry the snapshot ID returned for that transaction; all other requests use null. Request IDs increment modulo 2^32 and skip IDs currently in flight. modelRevision, topologyEpoch, frameId, and stepIndex are non-negative safe integers; incrementing past Number.MAX_SAFE_INTEGER is INVALID_SIMULATION_STATE rather than wrapping.

Exactly three fire-and-forget signals omit requestId and expectedModelRevision and receive no ACK:

| Signal | Payload |
| --- | --- |
| TICK | nowMs |
| SET_VISIBILITY | visible boolean |
| RETURN_FRAME_BUFFER | leaseId and ArrayBuffer |

Signals still contain protocolVersion 1 and their closed type. TICK is sent from the main requestAnimationFrame loop. Visibility changes are sent only from document visibilitychange.

Every Worker event contains protocolVersion and type. Every direct response includes requestId.

modelRevision increments exactly once after:

- Successful load or scene replacement.
- Add, delete, regeneration, generation-config change, name change, move, or velocity change.
- Gravity or selected-speed change.
- An automatic merger batch.
- Successful restore from undo, history branch, or recovery.

It does not increment for ordinary simulation steps, frame publications, play/pause, status, selection, or camera changes.

modelRevision is a monotonic protocol mutation guard within one Worker session. Entering/scrubbing/exiting history never replaces it with a marker's older recorded model revision. The reconstructed state's recorded revision is checked internally for replay correctness only. RESUME_FROM_MARKER and undo restore each advance once from the current protocol revision after old content is installed. After Worker replacement, simulationClient detaches/terminates the old instance, ignores callbacks captured from that instance, establishes a fresh revision-1 session, and resets its acknowledged guard before restore.

topologyEpoch initializes to 0 and increments before every TOPOLOGY publication, including an initial publication, name-only descriptor refresh, automatic merger, or historical topology view. A FRAME names exactly the topologyEpoch whose descriptors/segments/style interpret its arrays. topologyEpoch is a publication compatibility counter, not product state; it may advance without modelRevision.

frameId increments for each FRAME publication. stepIndex increments for each complete simulation step.

### 9.2 Complete command union

No additional production command may be invented without updating this section.

| Command | Payload | Revision rule |
| --- | --- | --- |
| INIT | initial EngineSetup and initialPlaying boolean | expected null; initializes revision 1 |
| PLAY | empty | expected null; no increment |
| PAUSE | empty | expected null; no increment |
| STEP | empty | expected null; no revision unless merger occurs |
| SET_PLAYBACK_SPEED | PlaybackSpeed | increment |
| SET_GRAVITY | finite gravity | increment |
| LOAD_SETUP | complete validated EngineSetup and postLoadPlaying boolean | increment once |
| ADD_GALAXY | complete GalaxyRecord | increment |
| PATCH_GALAXY | galaxyId, proposed GalaxyGenerationConfig, and proposed name/null | increment |
| MOVE_GALAXY | galaxyId and Vec2 | increment |
| SET_BULK_VELOCITY | galaxyId and Vec2 | increment |
| DELETE_GALAXY | galaxyId | increment |
| REGENERATE_SCENE | empty | expected null; increment latest scene |
| REQUEST_UNDO_SNAPSHOT | empty | expected null; no increment |
| COMMIT_UI_ONLY_MUTATION | snapshotId | expected null; no increment |
| RESTORE_UNDO_SNAPSHOT | snapshotId | increment |
| RELEASE_UNDO_SNAPSHOT | snapshotId | expected null; no increment |
| ENTER_HISTORY | markerId | no increment; pauses |
| SCRUB_TO_MARKER | markerId and reconstructionToken | no increment |
| RESUME_FROM_MARKER | markerId | increment and branch |
| EXIT_HISTORY_TO_PRESENT | empty | no increment; restores pinned view under current protocol revision |
| REQUEST_STATE_DIGEST | empty | expected null; no increment |
| REQUEST_SCENE_SETUP | empty | expected null; no increment |
| REQUEST_RECOVERY_CHECKPOINT | empty | expected null; no increment |
| RESTORE_RECOVERY_CHECKPOINT | checkpoint payload | increment |
| PING | nonce | expected null; no increment |
| DISPOSE | empty | expected null; no increment |

PATCH_GALAXY compares the old and proposed generation configurations:

- If only name differs, update name without regenerating.
- If any particle-generation field differs, regenerate only that galaxy, retaining position, bulk velocity, and proposed name.
- If neither generation nor name differs, ACK with result NO_CHANGE and do not increment revision or create an undo entry.

PATCH_GALAXY deliberately omits ID replacement, position, and bulkVelocity from its proposed fields. Worker retains those authoritative values exactly, avoiding a race with a frame published while playback is active. A caller must use MOVE_GALAXY or SET_BULK_VELOCITY for placement fields. ADD_GALAXY rejects an ID already present.

REGENERATE_SCENE is a non-undoable but logged mutation from the specification's closed undo policy. In scene order, regenerate each current descriptor from its stored generation config/seed, translate new local positions by that core's exact current live center, and add that core's exact current live velocity to every new local velocity. Preserve IDs, names, scene order, core center/velocity, globals, selected playing state, main-thread selection, and camera state. Clear encounter/merger effects, rebuild segments/styles, increment revision once, and emit command-correlated TOPOLOGY before ACK. For an empty scene, ACK NO_CHANGE. This command never rerolls a seed or returns a galaxy to its original saved placement.

Worker validation repeats all domain checks. The main thread's validation is not trusted.

REQUEST_UNDO_SNAPSHOT is atomic:

1. Flush every prior TICK because Worker messages are processed in order.
2. Capture the exact state including the selected playing flag.
3. Enter mutation lock without changing that selected flag.
4. While locked, TICK updates the time origin but accumulates no wall time, steps, effects, or history markers.
5. Return UNDO_SNAPSHOT_READY.

The next undoable mutation must carry that snapshot ID. On a changed-result ACK, retain the snapshot for undo and release the lock. On a NO_CHANGE ACK or REJECT, delete the snapshot and release the lock. COMMIT_UI_ONLY_MUTATION retains the snapshot and releases the lock only when its main-thread value actually changed; commandDispatcher cancels instead for an unchanged value. RELEASE_UNDO_SNAPSHOT releases the lock as cancellation when its ID is the active transaction, otherwise it only frees an aged snapshot.

The lock automatically cancels and releases its uncommitted snapshot after 30 seconds. No other undoable mutation can begin while locked. PLAY/PAUSE may change the selected playing flag during the lock, but stepping resumes only after unlock with a reset time origin and no catch-up.

### 9.3 Complete event union

| Event | Required fields |
| --- | --- |
| READY | requestId, modelRevision, status |
| ACK | requestId, modelRevision, result code |
| REJECT | requestId, currentModelRevision, stable error code, human message |
| FRAME | leaseId, frameId, modelRevision, topologyEpoch, stepIndex, interleaved position buffer, CoreFrame array, per-galaxy star bounds |
| TOPOLOGY | modelRevision, topologyEpoch, causeRequestId or null, ordered GalaxyDescriptor array, segment table, immutable style blocks |
| STATUS | modelRevision, topologyEpoch, stepIndex, playing, selected speed, gravity, counts, FPS inputs, effects, health |
| SCENE_DELTA | modelRevision, topologyEpoch, causeRequestId or null, added IDs, removed IDs, merger mappings |
| HISTORY_CHANGED | marker summaries, current marker, history mode |
| UNDO_SNAPSHOT_READY | requestId, snapshotId, modelRevision, estimated bytes |
| DIGEST_RESULT | requestId, digest |
| SCENE_SETUP_RESULT | requestId, EngineSetup whose galaxy positions/velocities are the exact live core state at request processing |
| RECOVERY_CHECKPOINT | checkpointId, modelRevision, stepIndex, activeWallMs, payload |
| ERROR_PAUSED | stable code, message, lastValidStepIndex, modelRevision |
| PONG | nonce |
| WORKER_DISPOSING | requestId |

GalaxyDescriptor contains the complete current non-evolved identity/configuration needed by the editor:

    id
    generation: GalaxyGenerationConfig
    name

Its array index is scene order. It deliberately omits position and velocity because those evolve and come from a CoreFrame with the descriptor cache's exact topologyEpoch.

CoreFrame contains:

    id
    sceneIndex
    x, y
    vx, vy
    coreRadius
    generationSize
    requestedPeakLinearY

Per-galaxy bounds contain exact minimum/maximum live star x/y plus the core center. Empty scenes provide an empty array.

For a successful mutation that changes topology, Worker event order is:

1. TOPOLOGY.
2. SCENE_DELTA when applicable.
3. ACK as the transaction's final success signal.
4. A later FRAME may use the new topology.

The TOPOLOGY and SCENE_DELTA for an acknowledged command carry that command's requestId as causeRequestId. simulationClient validates them but stages them under the in-flight transaction instead of applying them to Pixi, selection, or stores. When the matching ACK arrives, commandDispatcher commits the staged topology, delta, main-thread UI state, acknowledged revision, and undo entry in one synchronous main-thread task. If validation fails, the request times out, or the Worker dies before ACK, discard the staged events and enter the recovery path; never expose a half-applied scene. Receiving ACK without every topology event required by the command is a protocol error.

An automatic merger uses null causeRequestId. Stage its TOPOLOGY by modelRevision/topologyEpoch; the immediately following SCENE_DELTA must have the same null cause, revision, and epoch. Commit both together in one synchronous main-thread task, including descriptor store, Pixi topology, and selection arbitration. A FRAME/STATUS for that epoch cannot precede the pair. A missing/mismatched delta is a protocol error and leaves the prior visible scene intact.

For a successful mutation without topology, ACK is the final success signal. STATUS never substitutes for ACK.

For an automatic merger batch during a step, emit TOPOLOGY then SCENE_DELTA before any FRAME or STATUS for the new modelRevision.

Topology emission matrix:

| Operation | TOPOLOGY | SCENE_DELTA | Final signal |
| --- | --- | --- | --- |
| INIT | always | initial IDs as added, no removed/mappings | READY; stage prior events until READY |
| LOAD_SETUP | always | prior IDs removed/current IDs added | ACK |
| ADD_GALAXY | always | one added ID | ACK |
| DELETE_GALAXY | always | one removed ID | ACK |
| PATCH_GALAXY changed | always, including name-only | none when ordered IDs unchanged | ACK |
| REGENERATE_SCENE non-empty | always | none | ACK |
| MOVE_GALAXY / SET_BULK_VELOCITY | none | none | ACK; later compatible FRAME shows change |
| SET_GRAVITY / SET_PLAYBACK_SPEED | none | none | ACK |
| RESTORE_UNDO_SNAPSHOT / RESTORE_RECOVERY_CHECKPOINT | always | prior/current ID difference | ACK |
| ENTER_HISTORY / SCRUB_TO_MARKER / EXIT_HISTORY_TO_PRESENT / RESUME_FROM_MARKER | emit when descriptor, segment, or style epoch differs from currently published state | emit only when ordered IDs differ | ACK |
| Automatic merger | always with null cause | removed inputs, added remnants, mappings | no ACK; atomic pair commit |

For a command SCENE_DELTA, removed/added arrays follow prior/current scene order and mergerMappings is empty. "Prior/current ID difference" means set difference plus changed order represented by the complete TOPOLOGY; do not falsely report a retained ID as removed/added merely because its index moved. ACK/READY without the matrix-required staged events is PROTOCOL_SEQUENCE recovery, not partial success.

Portable scene save:

1. Capture current main-thread performance level and trails.
2. Send TICK with current performance.now.
3. Send REQUEST_SCENE_SETUP.
4. Worker copies each current live core center and core velocity into the returned GalaxyRecord position/bulkVelocity while retaining current generation/name/order.
5. Main combines that EngineSetup with the captured performance level and trails into SceneSetup.
6. Save that coherent setup. Do not include live star coordinates.

### 9.4 Frame transport

Use exactly three interleaved Float32 position buffers initially. Each buffer has 2 times starCount entries.

1. Worker authoritative arrays are never transferred.
2. Worker publishes only in response to a TICK and only when no prior FRAME lease remains unreturned.
3. Worker copies x,y into a free publication buffer.
4. Worker transfers the buffer with a unique leaseId and marks one publication outstanding.
5. Main validates the CoreFrame IDs/order against the committed GalaxyDescriptor cache, requires frame.topologyEpoch to equal that cache's topologyEpoch, applies the frame synchronously in that message task, renders, retains a small copied CoreFrame cache for editor/status/recovery setup, and returns the large position buffer in a finally block.
6. While one lease is outstanding, later TICKs advance simulation but skip publication. This guarantees that no FRAME backlog can form.
7. If no lease is free, skip publication, not simulation.
8. If one lease remains absent for three publication opportunities, emit FRAME_TRANSPORT, destroy/recreate PixiViewport, and create a new pool of exactly three buffers after invalidating old lease IDs.
9. A late old buffer is discarded, not added to the new pool.

The retained CoreFrame cache is at most twelve records and is not authoritative simulation state. The selected-galaxy editor and velocity overlay read the latest compatible descriptor plus CoreFrame, so automatic mergers expose their full configuration and current velocity without putting star arrays in React. Descriptors remain on the same topologyEpoch across later MOVE, velocity, gravity, speed, and ordinary-step revisions because IDs/order/configuration did not change. If no frame for a newly committed topologyEpoch has arrived, disable position/velocity editing for the affected galaxy until it does. A name-only patch still emits a TOPOLOGY descriptor refresh with a new epoch even though segments/styles are unchanged.

Static styles and segment ownership travel only in TOPOLOGY.

For each TOPOLOGY event, Worker sends:

- The complete ordered GalaxyDescriptor array, copied from authoritative records.
- The complete current segment table.
- Transfer copies made with typedArray.slice of every live style block's red/green/blue/alpha/pointSize arrays.
- Stable styleBlockId references from segments to those copies.

Worker transfers only the copies and retains its authoritative records/style arrays. Main validates descriptor IDs/order, all segment ranges, and total star count as soon as the event arrives. It replaces the prior descriptor/topology/style cache only at the commit point defined in section 9.5. Topology changes are infrequent enough that this complete-copy rule is preferred over a more complex delta protocol.

### 9.5 Mutation transaction state machine

Only commandDispatcher can perform a product mutation. At most one mutation transaction is in flight. Disable other mutation controls while it runs; play/pause and camera controls remain available.

Undoable Worker mutation:

1. Validate proposed input with the pure domain validator.
2. If invalid, show reason and stop. Do not request a snapshot.
3. Send fire-and-forget TICK with current performance.now, then send REQUEST_UNDO_SNAPSHOT.
4. On snapshot success, retain snapshotId but do not push an undo entry.
5. Send the mutation with UNDO_SNAPSHOT_READY.modelRevision and transactionSnapshotId.
6. On ACK:
   - If result is NO_CHANGE, release/delete the transaction snapshot, create no undo entry, and apply only an explicitly declared non-undoable camera event required by the initiating product action. The only release-1 case is reapplying an identical preset in Single, which still enables automatic framing. Do not change draft/selection/engine globals in this branch.
   - Require and apply every staged TOPOLOGY/SCENE_DELTA for that request when the command changes topology.
   - Apply main-thread UI changes in the same synchronous task.
   - Push one coordinated undo entry with snapshotId and the pre-action UI snapshot.
   - Update acknowledged model revision.
7. On REJECT, timeout, or Worker error:
   - REJECT already releases the lock/snapshot.
   - On timeout, send RELEASE_UNDO_SNAPSHOT if possible.
   - Discard any staged TOPOLOGY/SCENE_DELTA for the request.
   - Leave UI state unchanged.
   - Show the reason.
8. Re-enable mutation controls.

Undoable main-only mutation, currently performance level and trails:

1. Validate.
2. Request Worker undo snapshot.
3. Apply the main-thread setting only after snapshot success.
4. Send COMMIT_UI_ONLY_MUTATION.
5. After ACK, push coordinated entry.
6. If apply or commit fails, restore prior main state and release snapshot.

Non-undoable Worker command:

1. Validate if applicable.
2. Send directly.
3. Commit any UI state only after ACK.

Scene load uses:

    validate entire portable object
    request undo snapshot
    send one LOAD_SETUP containing the EngineSetup projection and postLoadPlaying false
    stage the command-correlated TOPOLOGY and optional SCENE_DELTA
    on ACK, atomically commit the staged topology/delta, Builder mode, performance level, trails, paused UI, empty selection, and auto-frame enabled
    push undo entry

No optimistic mutation of authoritative values is permitted.

Before PLAY, PAUSE, or SET_PLAYBACK_SPEED, simulationClient sends TICK with the current performance.now first. FIFO message order charges elapsed time to the old playing/speed state. PLAY and mutation-lock release reset the Worker's tick origin so blocked or paused time is never caught up.

### 9.6 Timeouts and stale messages

- Ordinary acknowledgement timeout: 5 seconds.
- Snapshot or reconstruction timeout: 30 seconds with visible progress after 250 ms.
- Heartbeat PING every 2 seconds while the page is visible.
- Declare Worker unavailable after three unanswered heartbeats or an error/messageerror event.
- Ignore a response whose requestId is no longer in flight.
- Reject a mutation whose expectedModelRevision differs.
- FRAME may be newer than the last status; apply it only when its topologyEpoch exactly equals the committed topology cache, its modelRevision is not older than the last acknowledged mutation revision outside history view, and its star count matches that topology.
- Never apply a FRAME from an older model revision after a replacement.

## 10. Rendering, camera, picking, trails, and luminance

### 10.1 PixiViewport contract

src/rendering/PixiViewport.ts exposes only:

    mount(hostElement, callbacks)
    resize(cssWidth, cssHeight, devicePixelRatio)
    applyTopology(topology)
    applyFrame(frame)
    setTrails(enabled)
    setAutomaticFraming(enabled)
    panByCssPixels(dx, dy)
    zoomAtCssPoint(factor, x, y)
    resetCamera()
    pickAtCssPoint(x, y)
    beginCenterDrag(galaxyId, pointer)
    updateCenterDrag(pointer)
    beginVelocityDrag(galaxyId, pointer)
    updateVelocityDrag(pointer)
    renderArtworkTo(target)
    getMetrics()
    destroy()

React mounts one viewport and calls this facade. It never reaches Pixi objects.

Create Pixi WebGL explicitly. If WebGL initialization fails:

- Keep application controls visible.
- Display a clear unsupported-renderer message.
- Disable play, canvas interaction, capture, and recording.
- Keep import/export and library deletion available.
- Do not silently choose WebGPU or a nonexistent canvas fallback.

### 10.2 Renderer selection and fallback

Primary star renderer:

- One PixiJS v8 ParticleContainer.
- One Particle per star.
- Dynamic property: position only.
- Static properties: vertex/scale and color.
- Call ParticleContainer.update after a topology/style change.
- Supply explicit boundsArea from the current camera-visible world rectangle because ParticleContainer does not calculate bounds.

Create one same-origin procedural star texture:

- 16 by 16 RGBA canvas.
- Radial alpha: opaque through radius 2 pixels, linearly fades to zero at radius 7.
- White RGB; per-star tint supplies color.
- Never fetch a cross-origin texture.

Scale star texture so pointSize 1, 2, 3 corresponds to rendered diameter 2, 4, 6 CSS pixels at device-pixel ratio 1. Maintain those CSS diameters at other DPR values.

For each Pixi Particle:

- anchorX and anchorY are 0.5.
- tint is (red shifted left 16) OR (green shifted left 8) OR blue.
- alpha is alphaByte divided by 255.
- scaleX and scaleY are renderedDiameter divided by 16 because the source texture is 16 pixels.
- ParticleContainer dynamicProperties.position is true.
- dynamicProperties.vertex, rotation, and color are false.
- After any static particle property or particle-list change, call ParticleContainer.update exactly once.

Fallback is allowed only when the Milestone 1 benchmark fails after eliminating per-frame allocation:

- Implement one custom Pixi-compatible WebGL2 instanced-quad renderer.
- One interleaved dynamic position buffer.
- One static byte style buffer.
- One six-vertex-index quad reused for all instances.
- Same texture, camera, layers, and tests.
- Document the decision in docs/adr/0001-particle-renderer.md.
- Delete the unused production renderer. Do not ship two star paths.

### 10.3 Render layers

Use these layers in order:

1. Background: opaque sRGB color 5, 8, 20.
2. Trail feedback.
3. Star particles.
4. Core artwork and central objects.
5. Encounter/merger artwork already represented by requested core luminance plus a subtle ring.
6. Editing overlays: center cross, selection ring, velocity handle.

Artwork-only capture includes layers 1 through 5. It excludes layer 6 and all React DOM.

Use normal premultiplied-alpha source-over blending. Additive blending is forbidden for stars and core artwork because it makes peak-luminance acceptance unstable.

### 10.4 Camera transform

Camera state:

    centerX DU
    centerY DU
    zoom CSS pixels per DU
    cssWidth
    cssHeight
    devicePixelRatio

World to CSS screen:

    sx = (worldX - centerX) times zoom + cssWidth / 2
    sy = cssHeight / 2 - (worldY - centerY) times zoom

CSS screen to world:

    worldX = (sx - cssWidth / 2) / zoom + centerX
    worldY = (cssHeight / 2 - sy) / zoom + centerY

Clamp zoom to 0.02..100.

Point-centered zoom:

1. Convert pointer to worldBefore.
2. Clamp new zoom.
3. Solve centerX/centerY so worldBefore maps back to the same pointer coordinate.
4. Manual zoom disables automatic framing.

Pan by CSS delta:

    centerX -= deltaX / zoom
    centerY += deltaY / zoom

Manual pan disables automatic framing.

Reset camera sets center 0,0 and zoom 5. Reset does not change the automatic-framing enabled flag.

### 10.5 Automatic framing

Use exact live per-galaxy star bounds from FRAME. Union all star bounds and include every core center expanded by its core radius.

For a non-empty scene:

1. boundsCenter is the union center.
2. paddedWidth = max(1, boundsWidth times 1.20).
3. paddedHeight = max(1, boundsHeight times 1.20).
4. targetZoom = clamp(min(cssWidth / paddedWidth, cssHeight / paddedHeight), 0.02, 100).
5. Set camera immediately to boundsCenter and targetZoom before rendering the frame.

No smoothing is used in release 1. Immediate framing makes input mapping and tests deterministic.

For an empty scene, center 0,0 and zoom 5.

One reducer applies framing events in commit order:

| Event | Result |
| --- | --- |
| Startup | enabled |
| Successful Random generation | enabled |
| Successful scene load | enabled |
| Scene-replacing entry to Single | enabled |
| Apply preset in Single | enabled |
| Apply preset in Collision/Builder | preserve |
| Regenerate or in-place edit | preserve |
| Add galaxy | preserve |
| Undo | preserve |
| Rewind/scrub | preserve |
| Manual pan/zoom | disabled |
| Reset camera | preserve |
| Explicit toggle | requested state |
| Scene-preserving mode change | preserve |

No other event enables framing.

### 10.6 Exact rendered-footprint picking

The selectable rendered footprint is the union of:

- Every rendered star disc for that galaxy.
- The rendered opaque core disc for that galaxy.

Trails, effect rings, and editing overlays do not enlarge the footprint.

Maintain a frame-synchronous hit cache:

- screenX and screenY Float32Array, one entry per star.
- renderedRadius Uint8Array, static by pointSize.
- ownerSlot Uint8Array from topology.
- nextIndex Int32Array, one entry per star.
- cellHead Int32Array for 32-CSS-pixel square cells, including a one-cell border outside each viewport edge.
- Core screen position/radius list.
- modelRevision, topologyEpoch, and frameId.

During applyFrame:

1. Set cols = ceil(cssWidth / 32) + 2 and rows = ceil(cssHeight / 32) + 2; resize cellHead only when these dimensions change, then fill it with -1.
2. Transform each star to CSS screen coordinates.
3. Store screenX/screenY.
4. If its center lies in x from -32 inclusive through cssWidth + 32 exclusive and the analogous y range, set cellX = floor(screenX / 32) + 1 and cellY likewise, clamp only the positive partial edge cell to cols-1/rows-1, and insert it at cellHead[cellY times cols plus cellX] using nextIndex.
5. Update the Pixi Particle.
6. Retain the hit cache and return the transferred world-position buffer.

All star radii are at most 3 CSS pixels. On pick:

1. Convert the in-viewport pointer with the same +1 border offset and inspect its cell and the eight neighboring cells.
2. For each star, test squared distance no greater than renderedRadius squared.
3. Add that star's owner as a candidate.
4. Test each core disc exactly and add its galaxy.
5. For candidate galaxies, compute squared distance from pointer to projected core center.
6. Choose the smallest distance.
7. If two squared distances are exactly equal, choose the larger scene index, which is most recently added.
8. If there is no candidate, deselect.

The cache must match the latest applied frame. At pointer-down retain frameId/topologyEpoch. If topologyEpoch changes during a drag, or the selected ID disappears, cancel the interaction and show a brief scene-changed notice. Ordinary newer frames in the same epoch may update the preview; modelRevision alone does not cancel a drag because gravity/speed can change without invalidating ownership.

### 10.7 Drag behavior

Center drag:

- On pointer down, record pointer-to-core world offset.
- On move, proposed center = screenToWorld(pointer) minus the recorded offset.
- Clamp is forbidden; if proposed position leaves the allowed range, show invalid styling and keep the last valid preview.
- On pointer up, commit exactly one MOVE_GALAXY with the last valid proposed center.
- Escape cancels with no mutation.

Velocity drag:

- Handle endpoint in world coordinates = core position plus bulkVelocity times 2 DU per VU.
- Proposed velocity = (pointerWorld minus core position) divided by 2.
- If magnitude exceeds 20, render at the 20-VU boundary but mark invalid; pointer up beyond the limit rejects and preserves the old velocity.
- Pointer up inside range commits one SET_BULK_VELOCITY.
- Escape cancels.

Each completed drag produces at most one undo entry. Intermediate previews are not Worker mutations.

### 10.8 Core artwork and measurable luminance

Create core artwork procedurally. Draw it after stars. An opaque radial core disc covers the entire projected core-radius area, so star overlap cannot own the measured peak. The disc fades from requested scene-linear peak at its center to half that value at its outer edge.

For the visible RGBA8 canvas only, apply the fixed Reinhard display tone map and then convert to a neutral sRGB channel:

    displayY = sceneLinearY / (1 + sceneLinearY)

    if displayY <= 0.0031308:
      srgb = 12.92 times displayY
    otherwise:
      srgb = 1.055 times displayY to the power 1/2.4 minus 0.055

Runtime rendering may use Math.pow; the generation ban does not apply.

Draw:

- Black hole off baseline center: opaque neutral disc with scene-linear Y 0.050.
- Black hole on baseline center: opaque neutral disc with scene-linear Y 0.070 plus a thin cyan ring whose scene-linear luminance is no greater than 0.070, making it visibly distinct without changing the peak measurement.
- Requested encounter or merger peak: replace center Y with the Worker-requested value.
- Disc screen radius: max of 2 CSS pixels and projected coreRadius.
- Stars inside the core are drawn first and are fully covered inside the measurement disc.

These values give:

- Black hole increase: 40 percent, above required 20.
- Encounter target: 18 percent, above required 15.
- Merger target: 30 percent, above required 25.
- The off baseline is more than 19 times the section 10.3 background luminance, so the core cannot satisfy measurement while remaining a near-black patch.
- Worst mathematically possible chained requested scene-linear peak: below 7.75. Reinhard display output remains below 0.89 before sRGB conversion.

Measurement target:

- A WebGL2 RGBA32F scene-linear render target with `EXT_color_buffer_float`; read back through `RGBA/FLOAT` into Float32Array. This target is created only for on-demand measurement/tests and is not the visible canvas.
- Use the identical core geometry, radial falloff, layer order, requested-peak uniform, and fragment luminance calculation as the visible draw. The only output-stage difference is that measurement writes scene-linear values directly while display applies the fixed tone map and sRGB conversion. A separate oracle-only shape or formula is forbidden.
- Fixed 1024 by 512 CSS-pixel viewport, DPR 1, camera center 0,0, zoom 8 CSS pixels per DU, trails off, editing overlays absent.
- Read pixels after artwork render completes.
- Y = 0.2126R + 0.7152G + 0.0722B.
- Peak is maximum texel-center Y inside the projected core-radius disc.
- Ratios use exact measured values with no tolerance subtraction.
- Every baseline peak must be at most 0.070, every requested/measured scene-linear peak must be below 8.0, and the black-hole-off displayed center before sRGB conversion must be at least 12 times the section 10.3 background luminance.
- As a presentation cross-check, read the visible tone-mapped RGBA8 canvas for the baseline black-hole, encounter, and merger fixtures, convert sRGB bytes back to linear display luminance, and require the same 1.20, 1.15, and 1.25 minimum ratios. The float target remains the exact scene-linear measurement contract; the visible cross-check prevents a display transform from hiding the required ordinary-fixture brightening.

The original 0.005/0.007 neutral baseline existed only to keep eleven worst-case chained effects below RGBA8 clipping; it is not a visual requirement. The float measurement target and fixed display tone map remove that coupling. Because the implementation still uses 18/30/40-percent scene-linear margins, do not weaken a ratio for driver tolerance. Each supported browser/GPU must independently pass the float-target completeness/readback probe and every ratio.

### 10.9 Trails

Use two screen-resolution render textures, previous and next.

For each rendered frame with trails enabled:

1. Clear next.
2. Compute previous-camera matrix Mprev and current-camera matrix Mcurrent.
3. Draw previous texture into next with transform Mcurrent times inverse(Mprev).
4. Multiply its alpha by:

       fade = 0.5 to the power (renderDeltaMs / 1200)

   This is a 1.2-second visual half-life independent of render FPS.
5. Draw current star particles into next at 35 percent alpha.
6. Composite next below current stars.
7. Swap textures.

Clear both textures on:

- Successful scene replacement.
- Topology star count becoming zero.
- WebGL context restoration.
- A non-invertible camera matrix.

Do not clear because automatic framing moved. Trail state is visual and is not stored in Worker history; only the trails-enabled global flag participates in undo and scene persistence.

Uniform-smear metric for the exact High fixture with trails and automatic framing enabled:

1. Sample the trail render texture at t = 5 seconds and t = 60 seconds in the fixed benchmark viewport.
2. For each texel use premultiplied linear `Y = 0.2126R + 0.7152G + 0.0722B`. Active texels have alpha at least 1/255; fewer than 100 active texels invalidates the fixture rather than passing it.
3. At t = 60, nearest-rank p99 active-texel Y divided by `max(active-texel median Y, 1/255)` must be at least 2.0.
4. The standard deviation of Y across the complete texture at t = 60 must be at least 50 percent of its t = 5 value.

Task 1.1 runs this metric three times in both reference browsers and records all raw values in ADR 0001. Task 4.4 and the High qualification use the fixed 2.0 and 50-percent gates; they are not recalibrated to a later implementation.

### 10.10 Resource lifecycle

On topology replacement or destroy:

- Remove Particle objects.
- Destroy generated textures and render textures.
- Remove pointer, resize, and ticker listeners.
- Cancel RAF callbacks.
- Clear hit-cache arrays.
- Return or invalidate any leased frame buffer.
- Destroy the Pixi renderer with context-loss disabled unless handling an actual lost context.

Expose debug counters in test builds for Particle count, texture count, render-texture count, listener count, and outstanding leases.

## 11. History, undo, and Worker recovery

### 11.1 History timing and marker identity

History active-wall time advances only while the document is visible and playback is playing.

Regular marker:

- Create at each crossing of an exact 100 ms active-wall boundary.
- Record state after all whole simulation steps due through that boundary.
- markerId is a monotonically increasing uint53 integer.
- Retain latest 300 markers.

Single-step marker:

- Create immediately after its one step.
- Does not alter the next regular 100 ms boundary.
- Counts toward the 300 retained markers.

Marker record:

    markerId
    activeWallTick
    stepIndex
    modelRevision
    eventOrdinal
    keyframeId
    commandLogOffset
    effectTimerResiduals
    exactDigest used only in test/debug builds

activeWallTick counts regular 100 ms boundaries. Special single-step markers repeat the current activeWallTick and are ordered by eventOrdinal.

### 11.2 Keyframes and command log

Create a complete keyframe on:

- History initialization.
- Every tenth regular marker.
- The first topology-changing command inside a one-second interval when the nearest prior keyframe would otherwise require generation during reconstruction.

There is at most one retained keyframe per one-second interval plus one preceding boundary keyframe. When the first topology change creates an early keyframe, it replaces that interval's scheduled tenth-marker keyframe. Later topology changes in the same interval remain in the command log and are replayed. This preserves the 31-keyframe memory bound. The replacement rule permits a gap strictly below two active-wall seconds: at most nineteen regular marker boundaries can lie after an early keyframe and before the next scheduled keyframe. Special single-step markers can be denser and remain bounded only by the 300-marker retention limit.

A keyframe contains:

- Ordered GalaxyRecord list.
- Core Float64 positions and velocities.
- Star Float32 x/y/vx/vy.
- Segment table and references to immutable style blocks.
- Gravity, speed, playing flag at capture, and step accumulator.
- Step index, model revision, event ordinal.
- Effect and encounter state.
- Mulberry state for any live process that consumes randomness.
- Exact command-log offset.

Log every Worker mutation between keyframes with:

    eventOrdinal
    stepIndex before application
    activeWallTick
    recordKind: command | mergerExpectation
    command type and canonical payload
    resulting modelRevision

Assign eventOrdinal synchronously whenever a command mutates engine content, a merger batch completes, or a marker is created. PLAY, PAUSE, TICK, publication, and read-only requests do not receive log records. A marker's eventOrdinal is the ordinal immediately after everything included in that marker.

Automatic mergers are mergerExpectation records containing the start-of-step index, ordered input IDs, output config hashes, and resulting revision. They are verification records, not commands to apply a second time.

### 11.3 Reconstruction

To reconstruct marker M:

1. Increment reconstructionToken.
2. Find the nearest preceding keyframe.
3. Clone it into a reconstruction state; never mutate live present state.
4. At the current stepIndex, apply command records in eventOrdinal order only while their ordinal is no greater than M.eventOrdinal and their recorded stepIndex equals the current step. Validate the recorded resulting revision after each.
5. Before executing the next step, identify any mergerExpectation for that start-of-step index. Execute exactly one production step with the playback-speed-derived activeWallSeconds recorded by the surrounding activeWallTick schedule. Compare any merger batch produced by the step with the expectation; reject missing, extra, or different mergers. Never apply the expectation itself.
6. Repeat command/step interleaving until both stepIndex equals M.stepIndex and every log event through M.eventOrdinal has been consumed. Commands at the same step index but with a later ordinal than the marker are not applied.
7. Split replay at each retained marker boundary, using zero activeWallSeconds for a single-step marker. Verify each passed marker's modelRevision and eventOrdinal and insert its exact reconstructed state into a ten-entry markerId-keyed LRU interval cache. Evict the least-recently-used state immediately on insertion of an eleventh; after a cold replay the retained entries are therefore the ten markers nearest the requested marker. Never retain more than ten states even when nineteen regular markers or up to 300 dense single-step markers are crossed.
8. Verify M's modelRevision/eventOrdinal and, in debug/test, exact digest.
9. Publish only if the token still matches the newest requested token.

If the replay cannot derive an unambiguous next step duration or encounters a log/marker ordering mismatch, fail reconstruction with HISTORY_LOG_CORRUPT and leave the current visible state unchanged. Never guess event order.

While dragging the scrubber:

- Send at most one request every 50 ms.
- Cancel older tokens logically; Worker may finish computation but must not publish it.
- A warm adjacent marker must render within 100 ms on the reference device.
- Show progress if a cold reconstruction exceeds 250 ms.

### 11.4 History mode behavior

Entering history:

1. Pause.
2. Pin an exact present snapshot.
3. Reconstruct selected marker.
4. Set history mode.

Allowed:

- Selection.
- Pan, zoom, reset, explicit automatic-frame toggle.
- Moving through markers.
- Exit to present.
- Resume from selected marker.

Disabled:

- Galaxy edit/add/delete.
- Global settings.
- Preset application.
- Mode changes.
- Scene load.
- Undo.
- Recording.

At every historical topology commit, preserve the main-thread selection only if that ID exists in the reconstructed descriptor array; otherwise deselect. Do not translate a remnant selection back to its former inputs and do not automatically reselect an ID when later scrubbing makes it exist again. Selection changes made by the user while in history follow the ordinary picking rule and remain non-undoable.

EXIT_HISTORY_TO_PRESENT:

- Restore pinned present exactly.
- Keep rewind markers.
- Remain paused.
- Preserve camera.
- Preserve selection only if the selected ID exists in present, otherwise deselect.

RESUME_FROM_MARKER:

- Restore marker exactly.
- Delete every later marker/keyframe/log entry.
- Clear interval cache.
- Increment modelRevision.
- Exit history.
- Start playing at the selected playback speed.
- Preserve camera.
- Preserve selection only if ID exists at the resumed marker.

Merely entering, scrubbing, or exiting to present does not alter undo.

### 11.5 Snapshot storage model

Use block/segment topology:

- A generated or regenerated galaxy creates an immutable StyleBlock with red/green/blue/alpha/pointSize arrays.
- A Segment refers to a contiguous star range, owner galaxy ID, and StyleBlock slice.
- Merger concatenates segments and changes owner IDs without copying style bytes.
- Delete drops segments.
- Live ownerSlot is rebuilt from segments and is not copied into every keyframe.

Exact mutable state costs 16 bytes per star. Style blocks cost 5 bytes per star once per generated block.

Memory targets at 120000 stars:

- Retained history plus undo plus interval cache: at most 192 MiB.
- Transient peak during reconstruction or garbage collection: at most 224 MiB.
- No single allocation above 32 MiB except the browser's internal encoded image Blob.

Worst-case test:

1. Thirty-one one-second keyframe boundaries.
2. One legal topology change during each second.
3. A merger after the last keyframe.
4. Twenty distinct undo snapshots.
5. The hard-capped ten-entry marker-state LRU cache, exercised by a replay that crosses nineteen regular markers and by a separate 300-dense-single-step-marker case.
6. Enter history so pinned present, one reconstruction candidate, authoritative live state, three frame buffers, and the main-thread topology/frame cache coexist.

Use performance.measureUserAgentSpecificMemory when available. Also maintain deterministic byte accounting for every owned typed array, shared style block counted once, log, live state, pin, reconstruction candidate, publication buffer, and main-thread topology copy; the deterministic accounting is the gate when browser memory API is absent. The 192-MiB retained target covers long-lived history/undo/cache plus live/pinned structures. The 224-MiB transient target covers the momentary reconstruction/transfer clone peak.

### 11.6 Undo entries and exact behavior

UndoEntry:

    id
    actionKind from the closed specification list
    workerSnapshotId
    uiSnapshot
    createdAtMonotonic

uiSnapshot contains:

- mode.
- draft.
- committed Random category and scenario seed.
- selection.
- performance level.
- trails.

Camera center, zoom, and automatic-framing state are deliberately absent. Undo preserves their current values and therefore never enables automatic framing.

The Worker snapshot contains all exact engine state and globals it owns.

Keep latest 20 entries. When adding entry 21:

1. Remove oldest.
2. Send RELEASE_UNDO_SNAPSHOT.
3. Release unreferenced style blocks.

Undo:

1. If stack empty, no effect.
2. Disable mutations.
3. Send PAUSE and await ACK.
4. Send RESTORE_UNDO_SNAPSHOT for top entry.
5. RESTORE_UNDO_SNAPSHOT restores exact engine content and selected speed/gravity but explicitly forces playing false, regardless of the captured selected playing flag.
6. On ACK, restore UI snapshot.
7. Pop and release the used snapshot.
8. Clear all rewind history and start a new empty history timeline at restored state.
9. Remain paused.
10. Do not create an undo entry for undo.
11. Re-enable mutations.

If restore fails, keep the entry and current state unchanged and show an error.

The closed undo action list is copied from SPEC.md section 11.2. No other action creates an entry.

### 11.7 Recovery checkpoint

The Worker creates an exact checkpoint:

- Immediately after INIT.
- Immediately after every acknowledged mutation.
- Once per one active visible second while playing.

Checkpoint includes the same engine content as a keyframe plus protocol version. Worker clones authoritative mutable buffers and transfers the clone. simulationClient retains only the newest complete checkpoint outside React/Zustand.

On a new checkpoint:

1. Validate protocol and lengths.
2. Replace the old checkpoint only after the new payload is complete.
3. Release old buffers.

On Worker error, messageerror, or heartbeat death:

- Preserve last rendered canvas.
- Disable mutations and playback.
- Show checkpoint step and age.
- Offer Restore checkpoint and Regenerate from setup as separately labelled actions.
- Restore creates a new Worker, INITs protocol, transfers checkpoint, enters paused state, clears history/history UI and the unusable old-Worker undo stack, preserves the current product mode/draft/performance/trails/camera, and preserves selection only if its ID exists in the restored descriptors. It increments revision from the new Worker's initialized guard rather than exposing the checkpoint's recorded revision.
- Regenerate first constructs a recovery SceneSetup by joining the last committed GalaxyDescriptor array with the latest compatible CoreFrame x/y/vx/vy values and current main-thread performance/trails. Compatibility requires identical ordered IDs and equal topologyEpoch. It creates a new Worker from that setup's EngineSetup projection and stored seeds, enters paused, and clearly states that star evolution after the retained frame is lost. If those compatibility checks fail, disable this option and leave checkpoint restore available.
- Never claim the checkpoint is the last visible frame; it may be up to one active second older.

Both recovery choices cancel/discard any in-flight command transaction and staged topology before starting the new Worker. Regenerate also clears history and the old-Worker undo stack, preserves mode/draft/performance/trails/camera, and validates selection against the regenerated descriptors. Show that undo/rewind were cleared. Neither recovery action creates an undo entry.

An in-Worker invalid-number failure follows SPEC.md: it pauses and retains the exact prior valid state without requiring Worker restart.

## 12. Persistence, portable formats, and naming

### 12.1 Database names and exact schemas

Library database:

    Name: galaxia-library
    Version 1 stores:
      presets:   &id, normalizedName, updatedAt
      scenes:    &id, normalizedName, updatedAt
      captures:  &id, normalizedName, createdAt
      recordings:&id, normalizedName, createdAt, state

Recording-frame database:

    Name: galaxia-recording-frames
    Version 1 stores:
      frames: &[recordingId+slot], recordingId, slot

The ampersand marks a unique primary key in Dexie syntax. normalizedName is not a unique Dexie index because built-in and user scopes can share display text; repositories enforce uniqueness inside each item kind and user scope.

Record shapes:

    PresetRow
      id, name, normalizedName
      createdAt, updatedAt ISO strings
      builtin boolean
      portable PresetFileV1

    SceneRow
      id, name, normalizedName
      createdAt, updatedAt
      portable SceneFileV1

    CaptureRow
      id, name, normalizedName
      createdAt, updatedAt
      mimeType image/png
      width, height positive integers
      blob Blob

    RecordingRow
      id, name, normalizedName
      createdAt, updatedAt
      state recording | complete | interrupted | deleting | failed
      width, height, devicePixelRatio
      mimeType image/webp | image/png
      nominalSlots, capturedCount, missedCount
      lastAttemptedSlot integer -1..3599
      startedAtWall ISO string
      startedAtMonotonic, durationMs
      effectiveSlotLimit
      terminalReason user | duration | quota | encoder | interrupted
      missedRanges array of inclusive start/end slot pairs

    RecordingFrameRow
      recordingId
      slot integer 0..3599
      timestampMs non-negative
      mimeType
      byteLength
      blob

### 12.2 Portable file envelopes

Version constants:

- schemaVersion: 1.
- generationVersion: 1.
- appVersion: package version injected at build.

Version-change rules after the first release:

- Increment schemaVersion only when the portable JSON structure/meaning changes and add an explicit loader/migration policy.
- Increment generationVersion whenever PRNG, deterministic math, generator distributions, style generation, generation-affecting physics constants, or Random scenario construction changes.
- Increment appVersion for every release according to ordinary semantic versioning.
- IndexedDB version is independent from portable schemaVersion.

Preset file:

    kind: galaxia-preset
    schemaVersion: 1
    generationVersion: 1
    appVersion: string
    id: string
    name: string
    exportedAt: ISO string
    payload:
      generation: GalaxyGenerationConfig
      name: string or null

Scene file:

    kind: galaxia-scene
    schemaVersion: 1
    generationVersion: 1
    appVersion: string
    id: string
    name: string
    exportedAt: ISO string
    payload:
      galaxies: ordered GalaxyRecord array
      gravity
      playbackSpeed
      performanceLevel
      trails

No other payload key is accepted. Zod schemas are strict and reject unknown keys inside normative payloads. Envelope metadata may accept only the fields shown.

Portable preset/scene import accepts one UTF-8 JSON File no larger than 1 MiB, parses once, validates the entire unknown value with the strict schema, and never merges raw properties into application objects. Export serializes the validated envelope with JSON.stringify value/null/2, a trailing newline, MIME application/json, and UTF-8 Blob text. Reject a larger file before reading it and route parse/schema failures through INVALID_IMPORT.

Load policy:

- Wrong kind: reject.
- Malformed/truncated JSON: reject.
- schemaVersion other than 1: reject atomically.
- generationVersion 1: load normally.
- Different finite positive integer generationVersion with schema 1: keep the current scene unchanged while showing a confirmation that current-version regeneration can differ; load only after explicit acceptance, then keep a persistent non-blocking notice on the loaded scene.
- Invalid generationVersion type: reject.
- appVersion difference alone: informational.

For SPEC.md section 13, unknown-version rejection means an unrecognized structural schemaVersion. generationVersion is separately recognized compatibility metadata: a different valid value can still describe a structurally known setup, but the user must receive the stated warning before accepting current-version regeneration.

The current scene changes only after full validation and Worker ACK.

### 12.3 Repository rules

- Components never call Dexie.
- Every library mutation is a repository method.
- Save and rename use one Library DB transaction.
- Never overwrite on a name collision.
- Built-in presets cannot be renamed or deleted.
- Save operations do not alter live scene or simulation.
- Return summary rows without Blob content for lists.
- Fetch Blob only for preview or download.
- Handle database unavailable, quota exceeded, blocked upgrade, and VersionError with stable error codes.
- A future IndexedDB version leaves the app running in no-library mode and never deletes/downgrades data.

Import identity rules:

- Validate the portable ID, but never overwrite a local row with it.
- If an imported preset or scene envelope ID is already used locally, create a new cryptographic user ID and retain the original only in non-normative import-source metadata.
- Scene galaxy IDs must be unique inside the imported scene. Because a scene load replaces the current scene, they do not conflict with IDs in the scene being replaced.
- Resolve imported display-name collisions through section 12.4.

Request navigator.storage.persist before the first durable save and before recording. Display granted, denied, or unavailable. Do not promise that persistence prevents eviction.

### 12.4 Unique names

For a desired item name:

1. Validate and trim with section 5.5.
2. If its normalized key is free in that item kind, use it.
3. Otherwise append space plus parenthesized integer starting at 2.
4. Truncate the original base by Unicode code points as needed so the complete suffix fits within 80.
5. Continue until unique.
6. Show the final stored name before confirmation.

No silent overwrite option exists.

Default names use the UTC instant captured when the save starts, formatted from toISOString with milliseconds removed:

- Preset YYYY-MM-DD HH-mm-ss UTC.
- Scene YYYY-MM-DD HH-mm-ss UTC.
- Capture YYYY-MM-DD HH-mm-ss UTC.
- Recording YYYY-MM-DD HH-mm-ss UTC.

Replace the ISO T with a space and colons with hyphens. Pass the result through the same unique-suffix algorithm, so two saves in one second remain distinct.

### 12.5 Export filename normalization

Starting from stored display name:

1. Replace ASCII control characters and each of < > : " / backslash | ? * with underscore.
2. Replace runs of whitespace with one space.
3. Trim.
4. Remove trailing periods and spaces.
5. Examine the substring before the first period case-insensitively. If it is CON, PRN, AUX, NUL, CLOCK$, COM1..COM9, or LPT1..LPT9, prefix underscore. This also protects names such as CON.txt on Windows.
6. If empty, use galaxia.
7. Add extension:
   - .galaxia-preset.json
   - .galaxia-scene.json
   - .png
   - -part-NNN.zip, with part number padded to at least three digits and widened if partCount has more digits.
8. Encode the complete candidate with TextEncoder. Remove base-name code points from the end until base plus any duplicate/part suffix plus extension is at most 200 UTF-8 bytes. This stays below common Linux component limits even for astral names. If truncation empties the base, use galaxia and recheck.
9. If a download name already exists in the current export operation, append -2, -3, and so on before the extension, reapplying the 200-byte rule each time.
10. Show the resulting name to the user.

Browser downloads cannot guarantee filesystem overwrite behavior, so uniqueness is guaranteed within the generated export set and the user is informed.

### 12.6 Database migrations and cleanup

Production version 1 has no upgrade migration. Add a test-only version-2 fixture that adds a harmless index and record.

Rules:

- Migrations are additive unless a separate backup/recovery design is approved.
- Opening a future version catches VersionError and enters no-library mode.
- Never call deleteDatabase as automatic recovery.
- At startup, finish RecordingRow state deleting by deleting its frame rows and then its metadata.
- Mark state recording from a prior session as interrupted, recount persisted frames, compute missing slots through the last attempted slot, and make it discoverable/exportable.
- Remove orphan recording frames only after confirming no RecordingRow exists; run this cleanup in batches of 100 and yield between batches.

## 13. Screenshot and recording design

### 13.1 Artwork capture

Capture uses an offscreen render target with the current viewport's pixel width and height.

Exact pixel-copy path:

1. PixiViewport renders layers 1..5 to its normal WebGL canvas.
2. A hidden reusable HTMLCanvasElement with a 2D context is filled with the background color.
3. drawImage copies the WebGL canvas into the target using the required scale/letterbox rectangle.
4. PixiViewport immediately renders layers 1..6 back to the visible canvas before returning to the browser event loop.
5. Call target.toBlob.

Because the full visible render is restored in the same JavaScript task, editing overlays do not flash off on screen. The WebGL canvas and every texture remain origin-clean. Do not use synchronous toDataURL or readPixels for product capture.

Screenshot:

1. Render layers 1..5.
2. Encode image/png with canvas toBlob.
3. If toBlob returns null, show encoder error and save nothing.
4. Save CaptureRow.
5. Show final unique name and confirmation.
6. Provide list, preview, rename, delete, and download.

Screenshot capture does not pause simulation and is not undoable.

### 13.2 Recording state machine

States:

    idle -> preflighting -> recording -> finalizing -> complete
                          \-> failed
    recording -> finalizing because user, duration, quota, encoder, or page close

Only recordingService owns this state.

Fixed constants:

- Nominal cadence: 30 slots per real second.
- Hard maximum: 3600 slots/120 seconds.
- Minimum safe start: 300 slots/10 seconds.
- Maximum in-flight encode plus write operations: 2.
- ZIP part uncompressed input cap: 64 MiB.
- WebP quality: 0.90.

Maintain exactly two independent offscreen capture targets, one per possible in-flight operation. A target cannot be rendered again until its toBlob callback has completed. This prevents a later frame from changing pixels while an earlier asynchronous encode is pending.

### 13.3 Preflight

At app startup, run one hidden test capture of the current artwork at at most 640 by 360 and detect whether image/webp returns a non-empty WebP Blob. Use WebP when supported; otherwise PNG.

Before recording:

1. Request persistent storage and record status.
2. Capture and encode five representative current frames one at a time without saving.
3. Compute p95 with nearest-rank rule.
4. budgetedFrameBytes = ceil(1.25 times p95).
5. Query navigator.storage.estimate.
6. If quota and usage are available:

       estimatedFree = max(0, quota - usage)
       reserve = 2 times 64 MiB
       frameCapacity = floor(max(0, estimatedFree - reserve) / budgetedFrameBytes)
       quotaLimitedSlots = floor(frameCapacity / 30) times 30
       effectiveSlotLimit = min(3600, quotaLimitedSlots)

7. If effectiveSlotLimit is below 300, refuse start and show needed/available estimate.
8. If estimate is unavailable, effectiveSlotLimit is 3600 and show quota-risk warning.
9. Lock pixel width, height, DPR, camera mapping, MIME type, and effective limit.
10. Create RecordingRow state recording before slot 0.

Discard the five test Blobs.

When `VITE_TEST_HOOKS` is exactly true, the section 15.6 effective-slot-limit hook may replace the computed limit after step 9 and before RecordingRow creation. Validate the override as an integer from 300 through 3600 and show it through the same UI path as a quota-derived limit. Production builds contain no override branch.

### 13.4 Slot scheduler

Use performance.now and one origin startMs.

At every animation opportunity:

    dueExclusive = min(effectiveSlotLimit, floor((nowMs - startMs) times 30 / 1000))

Nominal slot count is therefore a floor function of elapsed wall time. Without a duration limit of 300, exactly 300 slots exists only from 10000 ms inclusive through 10033.333... ms exclusive; an E2E test must not race that 33.333-ms window.

If dueExclusive is greater than nextSlot:

1. Mark every slot from nextSlot through dueExclusive minus 2 missed. Those are irrecoverably older than the newest due slot.
2. Let candidate = dueExclusive minus 1.
3. If in-flight count is below 2, begin candidate capture at this animation opportunity; otherwise mark candidate missed.
4. Set nextSlot to dueExclusive.
5. In one metadata transaction for this scheduler pass, advance lastAttemptedSlot to candidate, set nominalSlots to candidate plus one, and append/merge the immediately missed range. The pending candidate is counted as attempted but not yet captured or missed.

Never backfill an old slot with a later image.

Slot timestamp is exactly (slot plus 1) times 1000/30 relative to start, not encode completion time. Slot 0 is due at 33.333... ms and slot 299 is due at 10000 ms, giving exactly 300 nominal slots in ten seconds.

When document becomes hidden:

- Record hidden start time.
- Do not attempt capture.

On visible:

- Compute every elapsed nominal slot and mark it missed.
- Resume at the next slot.

While encoding is in flight, derive pendingCount = nominalSlots minus capturedCount minus missedCount; it is 0..2. During recording, capturedCount plus missedCount plus pendingCount equals nominalSlots. After finalization, pendingCount is zero and capturedCount plus missedCount equals nominalSlots.

### 13.5 Capture and persistence

For an attempted slot:

1. Increment in-flight after the scheduler's attempted-slot metadata transaction succeeds. If that transaction fails, stop for quota/storage failure without rendering the candidate.
2. Render layers 1..5 into the locked offscreen target using the current camera world mapping scaled to the fixed target.
3. Call toBlob with selected MIME and quality.
4. On null/error, mark that slot missed with encoder reason in a Library DB transaction.
5. On success, write one RecordingFrameRow immediately.
6. Only after the frame transaction commits, increment capturedCount in a Library DB transaction. If this metadata update is interrupted, finalization/startup recount repairs it.
7. Coalesce contiguous missed slots into ranges rather than writing one row per hidden/overdue slot. During recording, nominalSlots is lastAttemptedSlot plus one.
8. Decrement in-flight in finally and refresh displayed counts from the latest metadata.

The visible viewport may resize. The offscreen target and its start-time camera-to-pixel dimensions remain fixed. Camera center/zoom continue to follow current camera state, mapped into the locked target aspect ratio using letterboxing when visible aspect ratio changes. Letterbox color is the background color.

### 13.6 Stop and failure

Stop conditions:

- User: stop accepting new slots.
- Duration: when effectiveSlotLimit slots have elapsed.
- Quota: stop after the failing write.
- Encoder: three consecutive encoder failures stop; isolated failures count missed.
- Page close/crash: recovered as interrupted next session.

Finalization:

1. Wait for at most two in-flight operations.
2. Recount frame rows in IndexedDB.
3. Reconcile nominalSlots as one plus the maximum of persisted lastAttemptedSlot and the largest persisted frame slot. Set capturedCount from rows and missedCount = nominalSlots - capturedCount.
4. Compact missed slots into inclusive ranges.
5. Set durationMs to nominalSlots times 1000/30.
6. Mark state complete or failed with terminal reason.
7. Show name, captured/missed totals, duration, and reason.

Never delete presets/scenes/captures to recover recording quota.

### 13.7 Recording library

Provide:

- Discoverable list after reload.
- Detail view with metadata and first captured frame preview.
- Previous/next captured frame navigation.
- Rename.
- Delete with confirmation and resumable deleting state.
- Export.
- Interrupted/failed badge and reason.

Recording deletion:

1. Mark RecordingRow deleting.
2. Delete frame rows in ascending slot batches of 100, yielding between transactions.
3. Delete RecordingRow only after no frames remain.
4. Startup resumes any row still marked deleting.

### 13.8 ZIP export format

Each part contains:

    manifest.json
    frames/frame-000000.webp or png
    frames/frame-000001.webp or png
    ...

Top-level manifest fields:

    kind: galaxia-recording
    schemaVersion: 1
    appVersion
    recordingId
    name
    width, height, devicePixelRatio
    nominalSlots
    capturedCount
    missedCount
    durationMs
    mimeType
    partNumber
    partCount
    slots:
      slot
      timestampMs
      captured boolean
      partNumber integer or null
      file or null
      missed boolean

For a captured slot, captured is true, missed is false, partNumber identifies the one-based part containing it, and file is frames/frame-SSSSSS.ext where SSSSSS is the zero-padded six-digit nominal slot, not capture ordinal. For a missed slot, captured is false, missed is true, and partNumber/file are null. Every part repeats this complete slot manifest so any part explains wall-clock timing and locates frames in the part set. Only the frame files assigned to the current part are physically included.

Use fflate streaming ZIP with pass-through/store entries for already-compressed WebP/PNG frames; do not recompress image bytes. Add frame Blobs sequentially. Reserve 1 MiB of each 64-MiB part cap for the UTF-8 manifest and ZIP names/headers, so assigned frame byteLength sum is at most 63 MiB. Serialize the completed manifest before frame streaming and assert manifest plus projected name/header overhead is at most 1 MiB; if that invariant fails, stop export with EXPORT_FAILED rather than exceed the memory design. A single frame above 63 MiB is likewise an export error. Never load all frame bytes at once.

Before creating any ZIP bytes, read only RecordingFrameRow slot and byteLength metadata, assign slots to parts in order using the 63-MiB frame budget, and compute partCount. Then build the repeated manifest and stream each planned part. Do not discover partCount by building the archive twice.

Preflight and Task 1.4 must report the projected full-limit part count as `ceil(3600 times measuredP95FrameBytes / (63 MiB))`. At roughly 300 KB per frame this is about seventeen to eighteen parts, so the no-directory-picker fallback can require roughly that many explicit clicks. Show the actual planned part count before export; do not describe a full recording as a single-download workflow.

Export paths:

- If File System Access directory picker is available, ask once and write numbered parts sequentially.
- Otherwise show one button per numbered part. Each click creates/downloads exactly that part, records success, and exposes retry. Do not trigger multiple automatic downloads.

Revoke every object URL after the download click completes or the preview unmounts.

## 14. Application UI and workflow blueprint

### 14.1 Desktop layout

Use one route and a CSS grid:

- Top bar, full width, 52 CSS pixels high.
- Left creation panel, clamp 260..320 pixels.
- Center viewport, minimum 400 by 400 when window permits.
- Right inspector/library panel, clamp 260..340 pixels.
- Bottom history/recording strip, 56 pixels when active and collapsed to 0 otherwise.

At 1024 width:

- Side panels each collapse to tabbed drawers 260 pixels wide.
- Only one drawer may overlay the canvas at a time.
- Top playback controls remain visible.

No control may require hover alone.

### 14.2 Top bar

Contains:

- Mode tabs: Single, Collision, Builder, Random.
- Play/pause.
- Step.
- Playback speed.
- Gravity.
- Performance level.
- Trails toggle.
- Auto-frame toggle.
- Reset camera.
- Screenshot.
- Record/stop.
- Help.

Always visible status:

- Playing or Paused.
- Selected speed.
- Gravity.
- Performance level.
- Galaxy/star counts.
- Measured render FPS.
- Worker health.

### 14.3 Left panel

Single/Collision/Builder:

- Galaxy type.
- Seed field and reroll.
- Star count.
- Size.
- Mass.
- Spin.
- Arm count only for arm types.
- Black-hole toggle.
- Optional name.
- Add button where applicable.
- Apply to selected where applicable.
- Regeneration warning beside particle-generation fields.

Every label uses Size. The phrase Overall scale must not appear in the product UI.

Random:

- Category.
- Scenario seed and reroll.
- Generate.
- Budget preview and deterministic galaxy count after valid seed entry.

Numeric input policy:

- Keep the user's edit string local to the field.
- After String.trim, integer fields require `^[+-]?\d+$`; floating fields require `^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$`. Seed, count, and arm ranges reject a negative result even though the common integer parser recognizes its syntax. Hex, binary, underscores, commas, Infinity, and locale-specific forms are invalid.
- Only after the grammar matches, convert with Number, require finiteness/integer status as appropriate, canonicalize negative zero, and apply the closed range validator.
- Commit on Enter, blur, or completion of a slider/pointer gesture.
- Empty, partial, non-finite, non-integer where required, or out-of-range text remains visibly invalid and dispatches nothing.
- Escape restores the last committed display value.
- Integer controls step by 1.
- Size, mass, position, velocity components, and gravity permit decimal entry with suggested step 0.1.
- Spin suggested step is 0.1.
- A valid Single-mode commit triggers its required regeneration immediately after commit, not on every keystroke.

While a numeric field is focused or contains an uncommitted/invalid local string, throttled Worker status must not overwrite that string. When it is clean and unfocused, synchronize it from the latest committed value. If the selected ID disappears or topologyEpoch changes so the field's target is no longer valid, cancel the edit, close any confirmation, and show scene-changed rather than dispatching to a replacement galaxy.

### 14.4 Right panel

Tabs:

- Selection: selected configuration, numeric position/velocity, move/velocity guidance, delete, save preset.
- Presets: built-ins and user items.
- Scenes.
- Captures.
- Recordings.

Empty selection displays concise picking guidance and no destructive button.

### 14.5 Mode reducer

Implement mode transitions as a pure function returning:

    next mode
    next SceneSetup or preserve marker
    next draft
    next selection
    camera event
    undoable boolean
    worker command or null

Rows:

| From | To | Scene | Draft | Selection | Undo | Camera |
| --- | --- | --- | --- | --- | --- | --- |
| Single | Collision | preserve sole | copy sole config | preserve | no | preserve |
| Single | Builder | preserve sole | copy sole config | preserve | no | preserve |
| Single | Random | preserve | preserve | preserve | no | preserve |
| Collision | Builder | preserve | preserve | preserve | no | preserve |
| Builder | Collision | preserve | preserve | preserve | no | preserve |
| Collision/Builder | Random | preserve until Generate | preserve | preserve | no | preserve |
| Random | Collision/Builder | preserve current | preserve | preserve | no | preserve |
| Any non-Single | Single | selected, else first, else draft; create exactly one galaxy at 0,0 with zero velocity | linked retained config | retained galaxy | yes | enable |
| Any mode | same mode | no change | preserve | preserve | no | preserve |

Entering Single replacement uses one LOAD_SETUP transaction and preserves the pre-transition selected playing flag through postLoadPlaying.

Same-mode re-entry is an explicit no-op for Single, Collision, Builder, and Random. It sends no Worker command and creates no undo entry.

Draft defaults:

- Creating a fresh draft uses the currently selected performance level's default star count.
- Changing performance level does not change the current draft or any existing galaxy.
- The next explicit New draft/Reset draft action uses the new level default.

Budget warning:

- A valid explicit configuration above the selected performance-level budget but within global scene limits is allowed.
- Show a visible non-blocking performance-budget warning before commit.
- Random generation never exceeds its selected-level budget.
- Exceeding 120000 stars, 1200 mass, or twelve galaxies is a rejection, not a warning.

### 14.6 Exact creation and replacement recipes

Use these recipes rather than inferring state changes in components:

Startup:

- Use stable ID first-light.
- Build the exact First Light record at 0,0 with zero velocity, INIT it with playing true, and link the Single draft to its generation/name.
- Do not read a saved scene automatically. Library items are discovered but startup remains the specification state on every new page session.

Single draft commit or selected-galaxy edit:

- Dispatch PATCH_GALAXY with only generation and name. Worker retains live center/velocity.
- In Single, update the linked draft only with the ACK commit. In Collision/Builder, a selected edit changes the selected descriptor but does not change the independent draft.
- A generation change regenerates only that galaxy; a name-only change retains star bytes.

Add current draft in Collision/Builder:

- Create a cryptographic ID.
- Position is screenToWorld at the exact center of the current viewport at click commit time.
- Velocity is 0,0; generation/name are a copy of the committed draft.
- Dispatch ADD_GALAXY, keep the draft unchanged, and select the new ID only at ACK commit.

Apply current draft to selection in Collision/Builder:

- Require a live selected descriptor.
- Dispatch PATCH_GALAXY with the draft generation/name.
- Keep the independent draft unchanged and retain selection.

Apply a preset in Single:

- Keep the sole galaxy ID and its exact live center/velocity.
- Replace generation/name through PATCH_GALAXY, link the draft to the preset values, retain selection, and emit the Apply-preset-in-Single camera event only at ACK.
- This is one undoable preset action, not separate edit/camera actions.

Apply a preset in Collision/Builder:

- Treat it as Add: new cryptographic ID, current viewport center, zero velocity, preset generation/name, subject to all scene limits.
- Keep the draft unchanged, retain existing galaxies, and select the added galaxy at ACK.
- This is one undoable preset action.

Enter Single from any non-Single mode:

1. If the current selected ID is live, retain that descriptor's ID, generation, and name.
2. Otherwise, if the scene is non-empty, retain the first descriptor's ID, generation, and name.
3. Otherwise create a new cryptographic ID and use the draft generation/name.
4. Create exactly one record at 0,0 with zero velocity; preserve current gravity and selected speed.
5. LOAD_SETUP with the pre-transition selected playing flag, link the draft to the retained generation/name, select the retained/new ID, and enable framing in the one ACK commit.

Random Generate:

- Validate committed category/seed/performance and construct the complete section 7.10 SceneSetup records before requesting the mutation snapshot; do not generate star arrays on the main thread. LOAD_SETUP its EngineSetup projection with postLoadPlaying true, and Worker generates the stars.
- At ACK, replace scene, clear selection, enable framing, and keep the committed Random category/seed visible.
- Manual seed text changes only the committed Random seed after validation; it does not generate until Generate is activated.

Random Reroll:

- Obtain and display a new secure uint32 seed using section 14.8, generate the current category immediately, and commit seed plus replacement scene as one undoable action.
- If secure seed generation or scenario validation fails, neither displayed committed seed nor scene changes.

Scene load:

- Preserve the existing independent draft because draft is not part of the persisted closed set.
- LOAD_SETUP the file's engine projection with postLoadPlaying false.
- At ACK, commit file performance/trails, Builder mode, paused state, empty selection, and enabled framing. Do not copy a scene galaxy into the draft implicitly.

DELETE_GALAXY is exposed only in Collision/Builder with a live selection. On ACK remove it and clear selection. Single has no delete command. Every recipe is routed through commandDispatcher, budget validation, and the one-entry transaction in section 9.5.

### 14.7 Selection and merger arbitration

Selection is main-thread authoritative.

When SCENE_DELTA contains merger mappings:

1. Read current selection at delta commit time.
2. If it equals an input ID, select that mapping's remnant.
3. If current selection is a different live ID or null, preserve it.
4. If multiple mappings somehow name the selected input, use the first delta order; disjoint pairs make this unique.

A user deselection after the frame that led to a merger but before delta commit wins because the current selection is no longer an input.

### 14.8 User-created IDs

Use crypto.randomUUID when available.

Fallback:

1. Fill sixteen bytes with crypto.getRandomValues.
2. Set UUID version/variant bits for RFC 4122 v4.
3. Format lowercase hexadecimal UUID.

Retry a generated UUID up to eight times if it collides with an existing local or scene ID. If neither cryptographic API is available, reject add/save with a visible secure-context error. Never fall back to Math.random.

Seed reroll:

1. Fill a Uint32Array of length one with crypto.getRandomValues.
2. If the value differs from the current seed, use and display it.
3. Retry at most eight times when equal.
4. If all eight equal, use current seed plus one modulo 2^32.
5. If crypto.getRandomValues is unavailable, reject with SECURE_RANDOM_UNAVAILABLE.

The displayed uint32 is the only value passed to deterministic generation.

### 14.9 Keyboard and accessibility

When focus is not in an editable field:

- Space: play/pause.
- Period: single-step.
- F: toggle automatic framing.
- Escape: close dialog, cancel drag, or deselect in that priority.

The Space handler must also return without toggling playback when `event.target` is a `button`, `[role="button"]`, `a[href]`, `input`, `select`, `textarea`, or any contenteditable descendant. Native Space activation of the focused control is the only action in those cases; do not dispatch both its click and the global shortcut.

All form controls have visible labels and programmatic names. Buttons use text or accessible labels. Mode tabs use tab semantics. Dialog focus is trapped and returns to the opener. Canvas has an accessible summary of counts, selection, and control instructions; individual stars are not accessibility nodes.

### 14.10 Errors and confirmations

Use non-blocking notices for:

- Validation rejection.
- Storage persistence denied.
- Different generation version.
- Missed recording slots.
- Worker overload/recovery availability.

Use modal confirmation for:

- Delete preset/scene/capture/recording.
- Delete selected galaxy.
- Apply a particle-generation edit that resets evolved stars.
- Regenerate entire scene.

Notices have stable codes used in tests; do not test arbitrary prose.

Stable code registry:

| Code | Meaning |
| --- | --- |
| PROTOCOL_VERSION | Main/Worker protocol mismatch |
| PROTOCOL_SEQUENCE | Required Worker events were missing, mismatched, or out of order |
| INVALID_PAYLOAD | Runtime schema/type validation failed |
| STALE_REVISION | Mutation targeted an obsolete model revision |
| MUTATION_BUSY | Another undoable mutation owns the lock |
| SNAPSHOT_NOT_FOUND | Requested undo/history/recovery state is absent |
| INVALID_VALUE | Typed value is non-finite, non-integer, or out of range |
| SCENE_LIMIT | Galaxy, star, or mass total would exceed a hard limit |
| INVALID_SIMULATION_STATE | A candidate step contained invalid state |
| SIMULATION_OVERLOAD | Step backlog exceeded the bounded rule |
| HISTORY_LOG_CORRUPT | Rewind reconstruction log/marker ordering or merger verification failed |
| WORKER_UNAVAILABLE | Worker error, messageerror, or heartbeat loss |
| FRAME_TRANSPORT | A frame lease/pool invariant failed and viewport transport was rebuilt |
| SINE_TABLE_NOT_READY | Deterministic artifact missing/unverified |
| WEBGL_UNAVAILABLE | WebGL renderer initialization failed |
| STORAGE_UNAVAILABLE | IndexedDB could not open or transact |
| STORAGE_QUOTA | A durable write exceeded quota |
| STORAGE_FUTURE_VERSION | IndexedDB version is newer than this app |
| PERSISTENCE_NOT_GRANTED | Persistent-storage request denied/unavailable |
| INVALID_IMPORT | Portable JSON/envelope/payload rejected |
| GENERATION_VERSION_DIFFERENT | Accepted setup may regenerate differently |
| NAME_CONFLICT | Requested name required a visible unique alternative |
| ENCODE_FAILED | Canvas encoder returned null or threw |
| EXPORT_FAILED | Portable or recording export could not be assembled within format/memory rules |
| RECORDING_LIMIT | Duration or preflight limit reached |
| SECURE_RANDOM_UNAVAILABLE | Required cryptographic ID/seed source absent |

Repositories and Worker may attach a structured field path/details object, but UI branching uses only these codes.

## 15. Testing and measurement contracts

### 15.1 Test layers

Unit:

- Pure ranges, schemas, PRNG, deterministic math, generators, physics functions, mode reducer, naming, manifest assembly.

Worker integration:

- Real Engine instance plus protocol adapter in unit tests.
- Real module Worker in browser tests for transfer, crash, and timing behavior.

Browser component:

- Real Chromium and Firefox through Vitest Browser Mode.
- React controls, focus, validation, IndexedDB, generation digests, canvas readback.

End-to-end:

- Playwright user workflows and acceptance scenarios.
- Do not mock Worker, IndexedDB, or Pixi in acceptance E2E.

Performance:

- Dedicated query mode ?harness=performance, unavailable from normal navigation.
- Production code path with test fixture loader.

### 15.2 Fixed percentile and FPS calculations

Numerical fixture measurements:

- Separation is Euclidean distance between live core centers.
- Core-direction rotation is abs(atan2(cross(initialDirection,currentDirection), dot(initialDirection,currentDirection))) converted to degrees, in 0..180.
- A galaxy's 90-percent-star radius sorts Euclidean distances from that live core to every star currently owned by it and selects zero-based index ceil(0.90 times count) minus 1.
- Inner stars are those whose initial Euclidean distance from the core is no greater than coreRadius.
- Mean inner orbital speed is the arithmetic mean of Euclidean velocity magnitude after subtracting the owner's initial bulk velocity. Use the same reserved inner-star indices in black-hole off/on fixtures.
- Momentum error magnitude is Euclidean length of remnant mass times remnant velocity minus the vector sum of input mass times input velocity.
- Every threshold comparison uses unrounded values; formatting for UI never feeds a test.

Nearest-rank p95:

1. Sort ascending.
2. Index = ceil(0.95 times sample count) minus 1.
3. Return that zero-based item.

Average rendered FPS:

    (number of measured frames minus 1) divided by
    ((last frame timestamp minus first frame timestamp) / 1000)

Frame interval samples are consecutive requestAnimationFrame callback timestamps only when a Pixi render completed.

Visible response latency:

1. Record performance.now immediately before dispatching a test input.
2. Tag the resulting requested UI/model change with inputId.
3. When a render containing that inputId completes, request one additional animation frame.
4. At that callback, subtract the input timestamp.
5. For play/pause status in DOM, the render containing inputId includes both updated DOM status and canvas frame.

Do not use event-handler return time as visible latency.

### 15.3 Performance run

The benchmark harness is self-driving because Playwright's bundled Firefox is not the system stable Firefox named by the specification.

- npm run bench uses Playwright Chromium/Firefox for repeatable regression only.
- Normative runs use npm run build, then npm run preview:benchmark, followed by opening http://127.0.0.1:4174/?harness=performance in the current stable system Edge and system Firefox. Set browser zoom to 100 percent and use full-screen content; the harness refuses to qualify unless its measured CSS content surface is exactly 1920 by 1080.
- The query-only harness is shipped but has no ordinary navigation link and exposes no mutation/fault-injection hooks.
- One Run all button executes warm-up, fixtures, synthetic inputs, measurements, and downloads raw JSON.
- The result includes user agent, viewport, DPR, WebGL strings, app/lockfile version, and a required operator-entered graphics-driver version copied from the reference-device environment record.
- The operator performs no unrelated foreground work during the run.

For each SPEC fixture:

1. Verify the harness surface is 1920 by 1080 CSS pixels. Use the machine's actual DPR/display scale and record them; do not emulate DPR 1 for this performance result.
2. Load exact fixture.
3. Gravity 1, speed 1, trails on, automatic framing on.
4. Warm for 5 seconds.
5. Measure for 60 seconds.
6. Every 2 seconds cycle inputs:
   - pause then play on next frame.
   - pan 20 CSS pixels then re-enable auto-frame.
   - zoom factor 1.05 at a fixed point then re-enable.
   - select a known visible core.
7. Record raw frame intervals and response latencies.
8. Record Worker step time, buffer copy time, particle update time, render time, and owned memory.

Qualification thresholds are exactly SPEC.md section 17.1. No software-renderer result is performance-qualifying.

### 15.4 WebGL tests on local machines

Automated local tests must assert:

- WebGL renderer type, not unsupported path.
- Unmasked renderer string when browser permits.
- Canvas origin remains clean through readPixels/toBlob.
- Context loss and restoration produce a usable paused viewport.

On a headless machine without hardware WebGL, software WebGL may run functional tests, but label performance results non-qualifying.

### 15.5 Golden policy

Provisional digests are allowed during generation implementation.

Final goldens are created only after physics calibration locks circular-velocity constants. A golden update requires:

- Algorithm or constant reason.
- Old/new digest.
- Cross-browser equality.
- Review of First Light, every type, every Random category, and black-hole pair.

Never update a golden merely because a test failed.

### 15.6 Fault injection

Test-only hooks, removed or disabled in production, must support:

- Non-finite star candidate.
- Non-finite core candidate.
- Worker throw.
- Worker ignored heartbeat.
- Stale ACK.
- Leased-buffer apply exception.
- IndexedDB quota error.
- IndexedDB VersionError.
- toBlob null.
- Slow encoder/write.
- Hidden-page fake clock.
- Effective recording-slot-limit override applied after preflight and before RecordingRow creation.
- WebGL context loss.

Production bundle test asserts that the fixture-loading and fault-injection API is absent unless VITE_TEST_HOOKS is exactly true at build time.

### 15.7 Soak tests

- Simulation/app soak: 30 minutes of generated actions across play, add, merge, rewind, undo, replace, capture.
- Recording internal pipeline: 30 fake-clock minutes with fake encoder/store and no 120-second product limit.
- Real recording: full 120-second High fixture on reference device.
- Scene replacement: 500 replacements with stable Pixi/resource counters.
- Worker transport: 10000 publications with forced drops and no unbounded lease count.

## 16. Exact source layout

    src/
      app/
        App.tsx
        bootstrap.ts
        store.ts
        appState.ts
        commandDispatcher.ts
        undoStore.ts
        selectionService.ts
        notices.ts
      domain/
        types.ts
        ranges.ts
        defaults.ts
        derived.ts
        physicsContract.ts
        validation.ts
        schemas.ts
        versioning.ts
        names.ts
      generation/
        mix32.ts
        mulberry32.ts
        deterministicMath.ts
        sineTable.ts
        sineTableDigest.ts
        canonicalDigest.ts
        generateGalaxy.ts
        shared.ts
        styles.ts
        randomScenario.ts
        builtInPresets.ts
        generated/
          sine-f32.bin
        generators/
          spiral.ts
          barredSpiral.ts
          elliptical.ts
          irregular.ts
          dwarf.ts
      simulation/
        protocol.ts
        protocolSchemas.ts
        client.ts
        recovery.ts
        worker.ts
        engine.ts
        scheduler.ts
        constants.ts
        coreAcceleration.ts
        friction.ts
        starAcceleration.ts
        integrator.ts
        merger.ts
        encounterEffects.ts
        validity.ts
        topology.ts
        snapshots.ts
        history.ts
        stateDigest.ts
      rendering/
        PixiViewport.ts
        particleRenderer.ts
        renderLayers.ts
        proceduralTextures.ts
        camera.ts
        autoFrame.ts
        picking.ts
        trails.ts
        coreArtwork.ts
        luminance.ts
        overlays.ts
        artworkCapture.ts
        metrics.ts
      persistence/
        libraryDb.ts
        recordingDb.ts
        presetRepository.ts
        sceneRepository.ts
        captureRepository.ts
        recordingRepository.ts
        portableSchemas.ts
        importExport.ts
        fileNames.ts
        migrations.ts
        cleanup.ts
      recording/
        recordingService.ts
        recordingScheduler.ts
        preflight.ts
        manifest.ts
        zipExporter.ts
      features/
        shell/
        modes/
        draft/
        selection/
        playback/
        camera/
        history/
        presets/
        scenes/
        captures/
        recordings/
        status/
        help/
      testing/
        fixtureFactories.ts
        testHooks.ts
        fakeClock.ts
        benchmarkMetrics.ts
      main.tsx
    scripts/
      check-coverage.mjs
      generate-sine-table.mjs
      record-environment.mjs
      verify-no-absolute-paths.mjs
    tests/
      browser/
      protocol/
    e2e/
      acceptance/
      hosted/
    perf/
      physics-calibration.ts
      renderer-proxy.ts
      reference-bench.ts
      playwright.perf.config.ts
    docs/
      adr/
      DEVELOPMENT.md
      DEPENDENCIES.md
      PLATFORM_RESULTS.md
      ACCEPTANCE_REPORT.md
instancedParticleRenderer.ts remains absent unless the documented fallback is selected. Do not create an unused placeholder for it.

## 17. Vercel configuration

### 17.1 Repository configuration

Create this exact vercel.json:

    {
      "$schema": "https://openapi.vercel.sh/vercel.json",
      "framework": "vite",
      "buildCommand": "npm run build",
      "outputDirectory": "dist",
      "rewrites": [
        {
          "source": "/(.*)",
          "destination": "/index.html"
        }
      ],
      "headers": [
        {
          "source": "/(.*)",
          "headers": [
            {
              "key": "Content-Security-Policy",
              "value": "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
            },
            {
              "key": "X-Content-Type-Options",
              "value": "nosniff"
            },
            {
              "key": "Referrer-Policy",
              "value": "no-referrer"
            },
            {
              "key": "Permissions-Policy",
              "value": "camera=(), microphone=(), geolocation=()"
            }
          ]
        },
        {
          "source": "/assets/(.*)",
          "headers": [
            {
              "key": "Cache-Control",
              "value": "public, max-age=31536000, immutable"
            }
          ]
        },
        {
          "source": "/index.html",
          "headers": [
            {
              "key": "Cache-Control",
              "value": "public, max-age=0, must-revalidate"
            }
          ]
        }
      ]
    }

Do not set Cross-Origin-Opener-Policy or Cross-Origin-Embedder-Policy because shared memory is not used.

### 17.2 Local Vercel validation

Before authentication:

1. npm run build.
2. Serve dist with Vite preview or Playwright webServer.
3. Run hosted Chromium/Firefox smoke against the local production build.
4. Validate vercel.json against its schema.

After the owner supplies Vercel authentication:

1. Run npx vercel link from project root.
2. Select the owner-provided Vercel account/team and project name.
3. Run npm run vercel:build.
4. Run npm run deploy:preview.
5. Capture the preview URL.
6. Run hosted E2E with PLAYWRIGHT_BASE_URL set to that HTTPS URL:
   - Windows PowerShell: set `$env:PLAYWRIGHT_BASE_URL` for the current terminal, then run `npm run e2e:hosted`.
   - Linux shell: run `PLAYWRIGHT_BASE_URL=https://the-preview-url npm run e2e:hosted`.
   - Clear the variable after the hosted run so later local tests start their local server.
7. Only after all hosted tests pass, run npm run deploy:production.
8. Run hosted smoke against production.

No environment variables, functions, or server runtime are required.

## 18. Ordered implementation task packets

Complete these packets in order. A packet should be one local commit or one clearly bounded handoff. Do not combine packets across milestone boundaries.

High-risk map for the implementing agent:

| Area | Why it is difficult | Governing sections | Stop condition |
| --- | --- | --- | --- |
| Risk proofs | Establishes whether renderer, transfer, history memory, capture, and physics are viable | 8, 10, 11, 13; Milestone 1 | Do not build product UI if any numeric gate fails |
| Deterministic generation | Cross-engine bytes, fixed draw counts, committed trig artifact | 5..7; Milestone 2 | Do not freeze goldens before physics constants pass |
| Physics/Worker | Coupled integrator, tides, friction, mergers, timers, transactions | 8..9; Milestone 3 | Do not tune outside the bounded grid or expose partial ACK state |
| Rendering | Large particle updates, trail reprojection, exact picking, luminance readback | 10; Milestone 4 | Use the single documented renderer fallback only after proxy evidence |
| Rewind/undo | Exact interleaved replay, topology lifetime, bounded snapshots | 11; Milestone 6 | Any digest/order mismatch leaves visible state unchanged |
| Persistence/recording | Cross-database crash repair, quota, async encodes, multipart export | 12..13; Milestones 7..8 | Never delete unrelated data or buffer a whole recording |
| Qualification | Real browser/GPU timing and cross-OS evidence | 15; Milestone 9 | Software WebGL and bundled Firefox are non-normative performance evidence |

These are flagged so a weaker agent knows when to slow down and follow the cited contracts literally. A failing stop condition is not permission to improvise a new design.

## Milestone 0 - Reproducible local foundation

Complexity: Standard.

### Task 0.1 - Inventory and initialize

Read: plan sections 1 through 3; SPEC.md sections 1 and 17.

Create:

- Version files.
- package.json and package-lock.json.
- Vite/TypeScript foundation files.
- docs/DEVELOPMENT.md.
- docs/DEPENDENCIES.md.

Steps:

1. Record existing files and preserve them.
2. Install Node 24 LTS and dependencies exactly as section 3 describes.
3. Add exact engines and save-exact configuration.
4. Document identical Windows PowerShell/Command Prompt and Linux terminal commands; npm commands themselves are identical.
5. Document that 127.0.0.1/localhost is the normal secure local-development context, while testing from another device over a LAN may require an HTTPS tunnel for secure-context APIs. Never add a certificate-generation script that is OS-specific.
6. Record exact resolved versions and official package links.

Packet check:

    npm ci
    npm run typecheck
    npm run build

No product code beyond a Hello Galaxia shell is required.

### Task 0.2 - Static checks and test runners

Read: plan sections 3.3 through 3.6, 15.1, and 16; SPEC.md section 17.2.

Create:

- eslint.config.js.
- dependency-cruiser.cjs.
- vitest.config.ts.
- playwright.config.ts.
- scripts/verify-no-absolute-paths.mjs.
- React Testing Library setup.
- One passing unit, browser, and E2E smoke test.

Steps:

1. Configure every script in section 3.4 without shell operators.
2. Enforce generation math bans.
3. Enforce dependency directions.
4. Configure Chromium/Firefox and Windows-only Edge projects.
5. Add architecture fixtures proving an illegal import fails.
6. Configure Istanbul coverage across both Vitest projects and add/test scripts/check-coverage.mjs.
7. Implement `verify-no-absolute-paths.mjs` to scan source, scripts, tests, E2E, perf, and root configuration text files for Windows drive/UNC paths and user-home POSIX paths while excluding generated dependencies/build/evidence. Add a fixture proving each path form fails and a root-relative web URL does not.

Packet check:

    npm run format:check
    npm run lint
    npm run architecture:check
    npm run test
    npm run test:browser
    npm run test:coverage
    npm run coverage:check
    npm run e2e:chromium
    npm run e2e:firefox

### Task 0.3 - Worker and WebGL smoke

Read: plan sections 4, 9.1, 9.6, 10.1 through 10.3, and 16; SPEC.md sections 8.1 and 17.2.

Create:

- Exact protocol base types from section 9.
- Minimal module Worker implementing INIT, READY, PING/PONG, and DISPOSE.
- simulationClient lifecycle.
- PixiViewport that initializes WebGL and paints only the background.
- Worker and WebGL health UI.

Tests:

- Production build emits and loads Worker chunk.
- INIT gets revision 1.
- Wrong protocol version rejects.
- PING/PONG works.
- WebGL path is asserted.
- Unsupported WebGL path keeps library-independent shell stable.

Packet check:

    npm run build
    npm run e2e

### Task 0.4 - Environment records

Read: plan sections 2.2, 3.1, 15.3 through 15.4, and 16; SPEC.md section 17.

Create scripts/record-environment.mjs. It writes a JSON report containing:

- Date.
- OS name/version/architecture.
- Node/npm versions.
- Dependency lockfile hash.
- Browser names/versions.
- Viewport/DPR.
- WebGL vendor/renderer/version.
- Git commit when available.

Run once on the current development machine. Add docs/PLATFORM_RESULTS.md with empty Windows/Linux release sections and the initial local record.

Milestone 0 exit gate:

- Clean npm ci and npm run verify pass on the development OS.
- Worker and WebGL initialize from dist.
- No absolute OS path appears in source or config.
- No dependency range is floating.
- A new agent can follow docs/DEVELOPMENT.md from an empty node_modules folder.

## Milestone 1 - Mandatory technical risk proofs

Complexity: Very high. Do not build feature UI before this passes.

### Task 1.1 - Particle renderer proxy

Read: plan sections 10.1 through 10.3, 10.9, and 15.2 through 15.4; SPEC.md section 17.

Create perf/renderer-proxy.ts, perf/playwright.perf.config.ts, and a test-only performance query mode.

The proxy contains:

- 60000 particles.
- Five groups of 12000.
- The five groups use the exact SPEC section 17.1 High types, seeds, placement, and tangential bulk velocities.
- Continuous deterministic group movement.
- Continuously changing auto-frame camera.
- Trail reprojection.
- Core/effect layers.
- Picking probes.
- The exact section 10.9 trail-smear histogram probes at 5 and 60 seconds.
- Exact 1920 by 1080 CSS-pixel harness surface at the reference machine's actual recorded DPR/display scale.

Measure Worker-copy proxy, particle update, render interval, and visible response.

Run this proxy through the same self-driving local benchmark page in current stable system Edge and system Firefox; do not substitute Playwright's bundled Firefox for this risk decision.

Gate on the reference device in Edge and Firefox:

- Average at least 40 FPS.
- Nearest-rank p95 frame interval at most 37.5 ms.
- p95 visible response at most 75 ms.

Also run 10000, 30000, and 120000 informational cases.

If ParticleContainer fails only after allocation and update profiling is clean, execute the single fallback in section 10.2. Record docs/adr/0001-particle-renderer.md, including three raw trail-smear runs in each browser and pass/fail against both fixed gates.

### Task 1.2 - Transfer pool proof

Read: plan sections 9.4 and 15.7; SPEC.md sections 8.1 and 17.2.

Implement the exact three-lease protocol in a benchmark Worker.

Tests:

- Ten thousand publish/return cycles.
- Forced slow main thread drops publications but does not stall Worker.
- applyFrame throw still returns lease.
- One deliberately unreturned outstanding lease across three publication opportunities triggers exactly one bounded rebuild.
- Late old lease is ignored.
- No fourth live lease exists.

Keep the reusable pool and tests.

### Task 1.3 - History memory proof

Read: plan sections 8.1, 11.1 through 11.6, and 15.7; SPEC.md sections 11.1 and 17.2.

Create a standalone snapshot/topology prototype using section 11.5.

Allocate 120000 stars and run:

- Steady topology.
- Worst-case 31-interval topology churn.
- Post-keyframe merger.
- Twenty undo snapshots.
- Ten-state reconstruction cache while replay crosses nineteen regular markers, plus a separate 300-dense-single-step-marker replay proving immediate LRU eviction.
- Pinned present/reconstruction candidate, live engine, frame pool, and main topology/hit-cache typed arrays concurrently.

Prove:

- Exact state digest after clone/restore.
- Immutable style blocks are reference counted.
- Segment owner rebuild matches original owner slots.
- Retained accounting at most 192 MiB.
- Transient accounting at most 224 MiB.

Record layout and arithmetic in docs/adr/0002-history-storage.md.

### Task 1.4 - Capture/storage proof

Read: plan sections 12.1, 13.1 through 13.8, and 15.7; SPEC.md sections 14.2 and 17.2.

Create 300 1920 by 1080 artwork-like frames through a two-target offscreen pool.

Measure:

- WebP support.
- p95 Blob size.
- toBlob latency.
- IndexedDB write latency.
- Missed slots with queue size 2.
- 64-MiB streaming ZIP part creation.
- Projected full-3600-slot part count using the measured p95 frame size and 63-MiB frame budget.
- Peak owned memory.

Verify explicit one-click-per-part fallback and delete all spike data. Record docs/adr/0003-recording-storage.md.

### Task 1.5 - Core physics proof

Read: plan sections 8.2 through 8.12; SPEC.md sections 8 and 18.5 through 18.7.

Implement pure two-core Plummer, friction, and merger functions from section 8 without Worker/UI.

Run:

- Scenario 5 core orbit/no-merger portion.
- Slow capture.
- Fast flyby first pass through t = 6, plus the documented eventual capture near t = 24.56666667 as an informational reference.
- Merger fixture.
- Momentum residual.

Do not freeze constants yet. Record preliminary results in docs/adr/0004-physics-calibration.md.

Milestone 1 exit gate:

- Renderer meets proxy gate or the single fallback does.
- Transfer pool remains bounded.
- History memory gates pass.
- 300-slot capture and ZIP proof pass.
- Starting physics tuple passes core gates or at least one ordered grid tuple does.
- Four ADRs name the retained production design.

## Milestone 2 - Domain and deterministic generation

Complexity: High.

### Task 2.1 - Domain constants, types, and validation

Read: plan sections 5, 6.1, and 12.2; SPEC.md sections 2, 4, and 16.

Create section 5 modules.

Implement:

- Closed unions.
- Exact records.
- Ranges/defaults/core radius.
- Name validation.
- Scene totals and duplicate-ID rejection.
- Strict Zod schemas.

Tests:

- Every minimum/default/maximum/just-outside value.
- Every invalid primitive and non-finite number.
- Arm applicability.
- Scene totals and duplicate IDs.
- Unicode boundary cases.
- Input object remains unmodified.

### Task 2.2 - Deterministic primitives

Read: plan sections 6 and 15.5; SPEC.md sections 4.1 and 17.2.

Create mix32, hashWords, Mulberry32, sine artifact generator/loader, normalLike, and canonical digest.

Steps:

1. Generate and commit sine-f32.bin.
2. Commit printed digest.
3. Implement little-endian canonical encoders.
4. Add the complete prohibited-operation lint fixture.

Tests:

- PRNG vectors.
- Hash fixed vectors created from the exact implementation and checked by an independent DataView reference in the test.
- Sine file digest/quadrants/wrap.
- normalLike consumes exactly twelve draws.
- Canonical digest is independent of host typed-array byte view.

### Task 2.3 - Shared generator and spiral

Read: plan sections 7.1 through 7.3, 7.8, and 8.2 through 8.4; SPEC.md sections 4.1, 7.1, 8.2, and 17.2.

Implement:

- `domain/physicsContract.ts` constants, scalar Plummer kernel, and owner-potential function before any generator velocity code.
- GeneratedGalaxy allocation.
- Position/velocity/style stream creation.
- Core reservation.
- Shared velocity helper using current provisional physics constants.
- Shared style algorithm.
- Spiral positions.

Tests:

- Correct lengths/types.
- No non-finite output.
- Every coordinate inside intended generation radius except allowed axis transform, which also stays inside.
- Core ten.
- Black-hole position equality.
- Draw-count invariants.

### Task 2.4 - Remaining four generators

Read: plan sections 7.1 through 7.8; SPEC.md sections 4.1, 7.1, and 8.2.

Implement each in a separate file in this order:

1. Barred spiral.
2. Elliptical.
3. Irregular.
4. Dwarf.

After each file, add:

- Minimum/maximum generation test.
- Core-ten test.
- Determinism test.
- Basic distribution test matching its formula.

Do not copy a generic distribution and merely change colors; tests must verify bar concentration, ellipse axis ratio, four irregular clumps, and dwarf concentration.

### Task 2.5 - Built-ins and Random

Read: plan sections 7.9, 7.10, and 14.8; SPEC.md sections 5, 6.4, 12, 18.1, and 18.9.

Implement exact presets and Random algorithm from sections 7.9/7.10.

Tests:

- First Light exact config.
- Five built-ins exact fields.
- Random categories at all three levels.
- Exact budget allocation.
- Cluster count 3..5.
- Barycenter and momentum near zero within 1e-5.
- Same tuple exact setup digest.
- Deterministic IDs.

### Task 2.6 - Browser determinism pack

Read: plan sections 6.7, 7.11, 15.1, and 15.5; SPEC.md sections 17.2 and 18.8 through 18.9.

Create browser tests that run real generation in Chromium and Firefox and write normalized digest JSON.

The comparison script:

1. Runs every fixed fixture in both engines.
2. Sorts by fixture ID.
3. Compares digests byte-for-byte.
4. Fails with fixture ID and both digests.

Run on Windows and Linux when available. Mark digests provisional until Milestone 3.

Milestone 2 exit gate:

- Every generator passes at 500 and 120000 stars.
- Cross-engine digests match.
- Random outputs are valid and explicit.
- Generation has no prohibited math/import.
- No golden is labelled final.

## Milestone 3 - Authoritative simulation Worker

Complexity: Very high. This is the hardest milestone.

### Task 3.1 - Complete protocol and client transaction

Read: plan sections 5.2, 9.1 through 9.6, and 15.6; SPEC.md sections 8.1, 11, and 17.2.

Replace the smoke protocol with every command/event in section 9.

Implement:

- Runtime Zod validation at Worker boundary.
- Request map and timeouts.
- Model revision rules.
- Single in-flight mutation.
- ACK/REJECT behavior.
- Heartbeats.

Tests:

- Every command valid and invalid payload.
- Duplicate request ID.
- Stale revision.
- Late ACK.
- Timeout cleanup.
- Wrong protocol.
- modelRevision never regresses while entering/scrubbing/exiting an older marker; topologyEpoch changes make historical frames unambiguous.
- A TICK that merges immediately before REQUEST_UNDO_SNAPSHOT returns the new revision, and the following mutation succeeds against that revision.
- Mutation lock accumulates no steps/history/effect time and releases on ACK, REJECT, UI-only commit, cancellation, and timeout.
- Command-correlated topology/delta is invisible before ACK, commits with ACK in one task, and is discarded on timeout/death.
- Automatic-merger topology/delta with null causeRequestId commit together without an ACK; a missing/mismatched delta commits neither.

Do not implement React workflow yet; exercise through a test client.

### Task 3.2 - Engine state and topology

Read: plan sections 7.1, 8.1, 8.8 through 8.9, 9.3, and 11.5; SPEC.md sections 4.2, 7.3, 8, and 17.2.

Implement:

- Engine initialization from EngineSetup.
- Local generated stars translated to world position and bulk velocity.
- Ordered cores.
- Complete ordered GalaxyDescriptor projection.
- Segments/style blocks/ownerSlot rebuild.
- Topology event.
- State digest.
- Validation and last-valid state.
- REQUEST_UNDO_SNAPSHOT, RESTORE_UNDO_SNAPSHOT, and RELEASE_UNDO_SNAPSHOT using complete exact copies. Milestone 6 later adds retention accounting and the 20-entry coordinator, not the snapshot primitive.

Tests:

- Empty, one, and twelve galaxies.
- 120000 stars.
- Add/delete/regenerate/patch-name/patch-generation.
- Name-only patch preserves star bytes.
- Regeneration retains exact live core center/velocity, ID/name/order/globals/playing state, reuses seed, and clears effects.
- Automatic-remnant topology exposes its complete generation/name descriptor.

### Task 3.3 - Core physics and scheduler

Read: plan sections 8.2, 8.3, 8.6, 8.7, and 8.10 through 8.12; SPEC.md sections 8.1, 9, and 17.

Move the proven core-pair accumulation and friction functions into production. Import the scalar Plummer kernel and owner-potential function from `domain/physicsContract.ts`; do not create a simulation copy.

Implement:

- Scheduler and TICK.
- Core kick/drift/kick.
- Friction half impulses.
- Page visibility.
- Pause/play/speed/step.
- Backlog yielding and overload pause.

Tests:

- Exact step counts at each speed with fake timestamps.
- 0.25x marker-boundary alternating step counts.
- Hidden time no catch-up.
- Momentum conservation.
- Three- and twelve-core mutually overlapping cases read one start-of-half-impulse velocity snapshot, match a separately accumulated reference, and update each owned star at most once per half impulse.
- Core fixture margins.

### Task 3.4 - Star acceleration and full integrator

Read: plan sections 7.2, 8.1 through 8.5, 8.7, and 8.11; SPEC.md sections 8.1, 8.2, 18.5, and 18.7.

Implement:

- Owner potential.
- Black-hole split.
- Owner-follow plus differential tidal acceleration.
- Star kick/drift/kick and Float32 writes.
- Step validity scan.

Tests:

- Lone core/one-star analytical direction.
- Black-hole mass split and inner speed.
- At r = 0, 0.5 coreRadius, coreRadius, size, and 2 size, black-hole off/on and gravity 0.1/1/2, a one-galaxy engine's x-axis owner acceleration equals the imported domain `ownerRadialAcceleration` result exactly.
- First Light provisional stability.
- Scenario 5 tidal-radius calculation.
- Invalid-number injection retains prior digest and pauses.
- Same-count steps reuse two bank allocations; a failed candidate leaves every currentBank byte/topology/effect/revision unchanged.

### Task 3.5 - Merger and encounter effects

Read: plan sections 8.8, 8.9, and 8.12; SPEC.md sections 8.3 and 18.5 through 18.6.

Implement exact disjoint-pair merger and effect state.

Tests:

- Neither trigger alone merges.
- Both at start merge on that step.
- Three-core overlapping case chooses first disjoint pair and waits for remnant.
- All remnant fields.
- Union ordering and no star increase.
- Deterministic seed/name/ID.
- Scene append order.
- Selection delta data.
- Encounter transitions/afterglow wall-time.
- Multiple simultaneous pairs share one episode; re-entry during afterglow holds rather than multiplies the target.
- Merger effect timer and pause/hidden freeze.
- Pair-map cleanup after merger/delete and exact restoration after undo/load.

### Task 3.6 - Production frame transport and recovery

Read: plan sections 9.3 through 9.6 and 11.7; SPEC.md sections 8.1, 15, and 17.2.

Connect:

- Three-buffer pool.
- FRAME/TOPOLOGY/STATUS.
- Compatible CoreFrame x/y/vx/vy cache and exact descriptor/topologyEpoch join.
- Recovery checkpoints.
- Worker death restart.

Tests:

- Synchronized frame/topology.
- Worker crash retains canvas and checkpoint.
- Exact checkpoint restore.
- Checkpoint age disclosed.
- Old Worker messages ignored and old-Worker undo/history cleared with notice.
- Regenerate alternative differs only when evolved state existed.

### Task 3.7 - Full calibration and final goldens

Read: plan sections 6.7, 7.11, 8.11, 8.12, and 15.5; SPEC.md sections 8, 17.2, and 18.5 through 18.7.

Implement perf/physics-calibration.ts with the exact grid and margin gates.

Steps:

1. Run starting tuple.
2. If necessary run grid in prescribed order.
3. Select first passing tuple.
4. Update constants once.
5. Run all full star/core fixtures.
6. Generate final generation golden JSON.
7. Run Chromium/Firefox comparison on available Windows/Linux machines.
8. Finish ADR 0004.

Milestone 3 exit gate:

- All non-rendered SPEC sections 8, 9, and 17.2 physics assertions pass.
- Calibration margin gates pass together.
- Final goldens are locked.
- Worker is sole simulation owner.
- Error and recovery tests pass.

## Milestone 4 - Viewport, camera, picking, trails, and rendered effects

Complexity: High.

### Task 4.1 - Production particles and layers

Read: plan sections 9.3, 9.4, 10.1 through 10.3, and 10.10; SPEC.md sections 7.2, 10, 14.1, and 17.

Implement procedural textures, retained renderer selected in ADR, exact layer ordering, topology updates, and teardown counters.

Tests:

- Particle count equals star count.
- Only position changes each frame.
- Static update only on topology.
- Origin-clean canvas.
- Five hundred scene replacements do not grow counters.

### Task 4.2 - Camera and automatic framing

Read: plan sections 10.4, 10.5, and 14.6; SPEC.md sections 10, 16, and 18.2.

Implement exact transforms, clamps, pan, point zoom, reset, live-bounds framing, and reducer.

Tests:

- Round trip at min/default/max zoom within one CSS pixel.
- Point zoom exact.
- Empty defaults.
- Every reducer row and no extra enabling event.
- Auto-frame contains all live bounds with 20 percent padding.

### Task 4.3 - Picking and drag

Read: plan sections 10.6, 10.7, and 14.7; SPEC.md sections 7.2, 7.3, 10, and 18.16.

Implement hit grid, exact footprint, selection service, center drag, and velocity drag.

Tests:

- Star-only footprint.
- Core-only footprint.
- Empty space.
- Overlap nearest-core.
- Exact tie newest.
- Returned world buffer does not break cache.
- Stale revision cancels.
- One-pixel center tracking.
- Invalid drag no mutation.
- One commit/undo placeholder per completed drag.

### Task 4.4 - Trails

Read: plan sections 10.4, 10.5, 10.9, and 15.2; SPEC.md sections 9, 10, and 17.

Implement double render texture and camera reprojection.

Tests:

- Toggle does not alter Worker digest.
- Fixed camera leaves aligned trails.
- Scripted pan/zoom centreline within two CSS pixels of reprojected world path.
- At sixty seconds of the exact High fixture with automatic framing, active-texel p99/median is at least 2.0 and complete-texture luminance standard deviation is at least 50 percent of its five-second value, using section 10.9's exact sampling rules.
- Clear-event list is exact.

### Task 4.5 - Core art, luminance, and artwork-only rendering

Read: plan sections 8.9, 10.3, 10.8, 13.1, and 15.4; SPEC.md sections 8.2, 8.3, 14.1, and 18.5 through 18.7.

Implement core discs, BH ring, fixed display tone map, RGBA32F scene-linear readback, and offscreen artwork render. Assert `EXT_color_buffer_float` completeness and Float32 readback before running ratios.

Tests in Chromium and Firefox:

- BH ratio at least 1.20.
- Encounter ratio at least 1.15 for duration.
- Merger ratio at least 1.25 for duration.
- The visible tone-mapped RGBA8 canvas independently passes those three ratios after byte-to-linear conversion.
- Baselines at most 0.070, every scene-linear peak below 8.0, and displayed black-hole-off core at least 12 times background luminance.
- Worst eleven-merger chain stays below 8.0 without measurement clamp; visible Reinhard output stays below 0.89.
- Editing overlays absent from capture target.
- Same-origin toBlob succeeds.

Also run normative readback on reference GPU.

### Task 4.6 - Normative High viewport performance

Read: plan sections 2.2, 10, and 15.2 through 15.4; SPEC.md section 17.1.

Run exact High fixture with full Worker, trails, and auto-frame.

Use the self-driving benchmark in current stable system Edge and system Firefox on the reference device.

Gate:

- At least 30 average FPS.
- p95 frame interval at most 50 ms.
- p95 visible input response at most 100 ms.

If it fails, profile only the categories in section 15.3. Do not remove trails, reduce stars, or relax measurement.

Milestone 4 exit gate:

- SPEC camera and selection behavior passes.
- All rendered luminance clauses pass.
- High fixture passes on Edge/Firefox reference device.
- Artwork capture excludes overlays.

## Milestone 5 - Product workflows and controls

Complexity: Medium-high.

### Task 5.1 - Shell and low-frequency store

Read: plan sections 4, 14.1, 14.3, and 14.4; SPEC.md sections 5, 15, and 17.1.

Build exact layout and Zustand state.

Create undoStore as a non-React-buffer coordinator. During Milestone 5 it accepts successful transaction entries, releases the oldest after twenty, and exposes depth; the Undo control remains disabled until Task 6.4 implements restore. Do not store Worker snapshot buffers in Zustand.

Tests:

- 1024 by 768 drawers remain usable.
- No per-frame React rerender.
- Status updates at 4..10 Hz.
- Canvas accessible summary updates low-frequency only.

### Task 5.2 - Mode reducer

Read: plan sections 9.5, 14.5, and 14.6; SPEC.md sections 6, 11.2, and 18.3.

Implement table before wiring controls.

Tests:

- Every from/to row.
- Collision, Builder, Random, and Single same-mode re-entry are explicit no-ops.
- Any entry from a different mode into Single applies the specification replacement rule.
- Collision/Builder preservation.
- Random entry without Generate preserves.
- Camera event and undoability exact.

### Task 5.3 - Draft, add, selected edit, and delete

Read: plan sections 5, 9.5, and 14.3 through 14.8; SPEC.md sections 6.1 through 6.3, 7, 16, 18.2, 18.4, and 18.14.

Implement controls and commandDispatcher transactions.

Tests:

- Single linked draft regenerates immediately on valid commit.
- Multi-mode draft independent.
- Add at viewport center and sole selection.
- Apply-to-selected retains placement/velocity/name.
- Name-only no regeneration.
- Invalid/over-budget no snapshot and no Worker command.
- Above-level but globally valid explicit count is allowed with a warning and is not clamped.
- Performance-level change preserves the current draft; the next reset/new draft uses the new default.
- Center, selection, and non-zero velocity overlays are distinguishable, and rendered UI text contains no Overall scale label.
- Delete unavailable in Single.
- Empty scene remains usable.

### Task 5.4 - Playback, Random, globals, and status

Read: plan sections 7.10, 8.10, 14.2, 14.6, and 14.10; SPEC.md sections 5, 6.4, 9, 15, 18.1, and 18.9.

Implement:

- Playback controls.
- Gravity/speed.
- Performance level and trails coordinated undo placeholders.
- Regenerate.
- Random generate/reroll.
- Status/help/notices.

Tests:

- Startup exact.
- Pause remembers speed.
- Performance change does not alter existing counts.
- Regenerate keeps seed.
- Random replaces, deselects, enables framing, and plays.
- Invalid seed changes nothing.

### Task 5.5 - Selection, merger arbitration, keyboard, and accessibility

Read: plan sections 9.5, 10.6, 10.7, 14.7, 14.9, and 14.10; SPEC.md sections 7.2, 8.3, 16, 18.6, and 18.16.

Wire selection service and SCENE_DELTA behavior.

Tests:

- User deselection wins race.
- Selected input inherits remnant.
- Other selected galaxy remains selected.
- Keyboard shortcuts ignored in fields.
- Space on focused native/custom buttons and links performs only native activation and never also toggles playback.
- Dialog focus and labelled controls.

Milestone 5 exit gate:

- Acceptance Scenarios 1, 2, 4, and 14 pass.
- Scenario 3 passes except final undo action, completed in Milestone 6.
- No component directly calls Worker postMessage or Dexie.
- React profile has no frame-loop shell render.

## Milestone 6 - Rewind, scrub, undo, and recovery UI

Complexity: Very high.

### Task 6.1 - Production snapshots and memory accounting

Read: plan sections 8.1 and 11.5 through 11.7; SPEC.md sections 11 and 17.2.

Move Task 1.3 design into Worker.

Tests:

- Snapshot/restore every engine field.
- Segment/style reference lifetime.
- Exact digest.
- Deterministic byte accounting.

### Task 6.2 - Markers, keyframes, and log

Read: plan sections 8.10, 11.1, and 11.2; SPEC.md sections 9 and 11.1.

Implement section 11.1/11.2.

Tests:

- Ten regular markers per active second.
- 300 retained after fill.
- Single-step marker.
- Topology commands and merger log.
- Two commands at one step index on opposite sides of a marker retain exact event-ordinal ordering.
- MergerExpectation is verified during step replay and is never applied twice.
- Hidden time none.
- Keyframe retention remains bounded.
- An early topology keyframe followed by nineteen regular markers preserves exact reconstruction and the interval cache never exceeds ten entries.

### Task 6.3 - Reconstruction and history UI

Read: plan sections 11.2 through 11.4 and 15.2; SPEC.md sections 11.1 and 18.12.

Implement token cancellation, interval cache, scrubber, present pin, resume, and exit.

Tests:

- Every marker digest.
- Backward across merger/regeneration.
- Corrupt/missing/extra merger expectation fails without changing the visible state.
- Warm adjacent under 100 ms reference gate.
- Cold replay across nineteen regular markers and a separate 300-dense-single-step-marker interval retains no more than ten cache entries and shows progress after 250 ms.
- Obsolete result not published.
- Exit restores present.
- Resume truncates branch and plays.
- Action availability exact.
- Undo depth unchanged.

### Task 6.4 - Coordinated undo

Read: plan sections 9.5, 11.6, and 14.6; SPEC.md sections 6.5, 11.2, 18.3, and 18.13.

Complete coordinated undo by wiring restore/pop/history-clear behavior to the transaction entries already accumulated through undoStore. Verify snapshot creation and the 20-entry cap for every closed action.

Use a table-driven test listing every included and excluded action from SPEC.md section 11.2.

Tests:

- Failed action no entry.
- Action 21 releases oldest.
- Exact engine/UI restore.
- Camera and automatic-framing state are preserved, not restored by undo.
- Rewind cleared.
- Paused after undo.
- No redo.

### Task 6.5 - Recovery UI and stress

Read: plan sections 9.6, 11.5, 11.7, 15.6, and 15.7; SPEC.md sections 8.1, 11, and 17.2.

Implement checkpoint restore/regenerate choices.

Run:

- Worker death while playing.
- Worker death during snapshot.
- Rapid scrub then Worker death.
- Maximum-state undo.
- Worst memory schedule.

Milestone 6 exit gate:

- Acceptance Scenarios 3 undo clause, 12, and 13 pass.
- Memory gates pass.
- Warm scrub response passes.
- Recovery never silently regenerates.

## Milestone 7 - Presets, scenes, and durable library

Complexity: High.

### Task 7.1 - Databases and availability

Read: plan sections 2.1, 12.1, 12.3, and 12.6; SPEC.md sections 12 through 15.

Implement exact Dexie schemas, repository base, persistence request/status, and no-library mode.

Tests use fake-indexeddb and real browser IndexedDB.

### Task 7.2 - Names and repository CRUD

Read: plan sections 5.5 and 12.3 through 12.5; SPEC.md sections 12 through 14 and 16.

Implement section 12.3..12.5.

Tests:

- Unique suffixes.
- 80-code-point suffix truncation.
- Reserved Windows names.
- All invalid filename characters.
- No overwrite.
- Built-in protection.

### Task 7.3 - Presets and scenes

Read: plan sections 9.5, 12.1 through 12.5, and 14.6; SPEC.md sections 6.1 through 6.3, 12, 13, 18.8, and 18.10.

Implement lists, save, rename, delete, import/export, and apply/load UI.

Scene save must use REQUEST_SCENE_SETUP and combine its coherent live core placements/velocities with current main-thread performance level and trails. It must not reconstruct placement from low-frequency STATUS or the last rendered frame.

Tests:

- Closed field sets.
- Same-version setup digest.
- Built-ins exact.
- Multi-mode preset adds at viewport center without clearing.
- Single preset replaces/enables framing.

### Task 7.4 - Atomic versioned load

Read: plan sections 5.4, 9.5, 12.2, 14.6, and 15.6; SPEC.md sections 11.2, 13, and 18.10 through 18.11.

Implement exact load transaction.

Fault tests at every boundary:

- JSON parse.
- Envelope validation.
- Snapshot request.
- Worker rejection.
- Topology event.
- UI commit.

Every failure before ACK leaves scene/UI digest unchanged. A successful load enters Builder, pauses, deselects, and enables framing.

### Task 7.5 - Migration, rollback, and cleanup

Read: plan sections 12.1 through 12.6 and 15.6; SPEC.md sections 11.2 and 12 through 14.

Implement future-version no-library behavior, test version-2 migration, blocked upgrade, and orphan cleanup.

Milestone 7 exit gate:

- Acceptance Scenarios 8 through 11 pass.
- Windows export imports identically on Linux and vice versa.
- Scene load undo restores exact pre-load live state.
- No invalid load partially applies.

## Milestone 8 - Screenshots and recordings

Complexity: Very high.

### Task 8.1 - Capture library

Read: plan sections 10.3, 13.1, and 13.7; SPEC.md section 14.1.

Implement screenshot flow and CaptureRow UI.

Tests:

- Clean artwork.
- Unique names.
- Reload discovery.
- Preview/rename/delete/download.
- toBlob null failure.

### Task 8.2 - Recording preflight and scheduler

Read: plan sections 13.2 through 13.4 and 15.6; SPEC.md sections 14.2 and 18.15.

Implement feature test, five-frame estimate, formula, fixed target pool of two, slot clock, hidden handling, and effective limit UI.

Fake-clock tests:

- Ten seconds gives 300 slots.
- 120 seconds gives 3600.
- Low quota rounds down to whole seconds.
- Below 300 refuses.
- Unavailable estimate warns and allows 3600.
- Test-only effective-slot-limit override pins 300 after preflight, is shown in the UI, and takes the duration stop path.
- Hidden interval exact misses.

### Task 8.3 - Frame write, finalization, and interruption

Read: plan sections 12.1, 13.4 through 13.7, and 15.6; SPEC.md section 14.2.

Implement rows/state machine.

Tests:

- Slow encode/write misses without blocking input.
- Counts reconcile.
- User/duration/quota/encoder terminal reasons.
- Reload marks recording interrupted and recounts.
- Resize keeps identical dimensions and letterboxing.

### Task 8.4 - Recording library and ZIP export

Read: plan sections 12.3 through 12.5 and 13.7 through 13.8; SPEC.md sections 14.2 and 16.

Implement detail/preview/navigation/rename/delete and preplanned streaming parts.

Tests:

- Complete manifest in every part.
- Slot/file mapping.
- 64 MiB input cap.
- Explicit clicks and retries.
- File System Access progressive path behind capability check.
- Object URL cleanup.

### Task 8.5 - Real and sustained tests

Read: plan sections 13.2 through 13.8 and 15.7; SPEC.md sections 14.2, 17, and 18.15.

Run:

- Acceptance ten-second recording with the test-only effective limit pinned to 300; let the duration path auto-finalize and assert exactly 300 nominal slots instead of racing a manual stop.
- Full two-minute High recording on reference device.
- Thirty-minute fake pipeline.
- Quota failure with existing scene/preset data.

Milestone 8 exit gate:

- Acceptance Scenario 15 passes.
- Full limit finalizes exactly.
- Memory remains bounded and controls responsive.
- Existing library data survives every recording fault.

## Milestone 9 - Full acceptance and local cross-platform release

Complexity: Very high.

### Task 9.1 - Complete requirement tests

Read: plan sections 15.1 and 19.1; every `must` in SPEC.md and SPEC.md section 18.

Create or finish every named test in section 19. Search SPEC.md for every must and confirm a requirement ID and evidence row exists. If a must is missing, add a requirement ID, task evidence, and test before continuing.

### Task 9.2 - Acceptance scenario suite

Read: plan sections 15.1, 15.6, and 19.2; SPEC.md section 18.

Run all seventeen scenario groups from section 19.2 in Chromium, Firefox, and Windows Edge where applicable.

No test may skip because the fixture is slow; use deterministic hooks to advance simulation without waiting wall time when the requirement is simulation-time based. Scenario 15 uses the test-only 300-slot effective-limit override and waits for the duration terminal reason, so its exact 300-slot assertion is deterministic while still exercising a real wall-clock recording.

### Task 9.3 - Reference performance

Read: plan sections 2.2 and 15.2 through 15.4; SPEC.md section 17.1.

Build once, start preview:benchmark, and use the self-driving query harness in current stable system Edge and system Firefox on the reference device. Run all three exact fixtures in each browser, save downloaded raw JSON and the environment record under docs/evidence, and confirm every threshold. Playwright-bundled Firefox results are regression evidence only and cannot replace the system Firefox run.

### Task 9.4 - Windows/Linux verification

Read: plan sections 2.2, 3.1 through 3.5, and 15.4; SPEC.md section 17.2.

On Windows:

    npm ci
    npx playwright install chromium firefox
    npm run verify
    npm run e2e:edge

On Linux:

    npm ci
    npx playwright install --with-deps chromium firefox
    npm run verify

On each OS, manually smoke current system Firefox. Record results in docs/PLATFORM_RESULTS.md. A release cannot substitute one OS for the other.

### Task 9.5 - Soak, accessibility, and report

Read: plan sections 10.10, 14.9, 15.6, 15.7, and 19; SPEC.md sections 15 through 18.

Run all section 15.7 soaks, keyboard checks, screen-reader landmark/form smoke, context-loss test, and production-hook absence test.

Create docs/ACCEPTANCE_REPORT.md linking requirement IDs, test names, raw performance files, OS records, and known non-conformance. Exit-gate violations cannot be listed as accepted known issues.

Milestone 9 exit gate:

- All requirement rows and seventeen scenarios pass.
- Windows and Linux records are green.
- Reference performance passes.
- No known high-severity correctness, data-loss, crash, or unbounded-memory issue.

## Milestone 10 - Vercel release

Complexity: Medium.

### Task 10.1 - Production configuration

Read: plan sections 3.4, 17.1, and 17.2; SPEC.md sections 17 and 19.

Implement vercel.json and hosted test projects.

Tests:

- npm run build.
- Local dist SPA fallback.
- Worker chunks.
- CSP permits Worker, Blob preview/download, IndexedDB, and capture.
- CSP blocks remote script/image test fixtures.
- Root and a deep test path load index.

### Task 10.2 - Preview deployment

Read: plan sections 2.1 and 17.2; SPEC.md sections 12 through 14 and 17.2.

This task requires owner Vercel authentication/team/project selection.

Run section 17.2 preview steps. Run complete hosted smoke:

- Startup/WebGL.
- Worker.
- Preset/scene save and reload.
- Import/export download.
- Screenshot.
- Ten-second recording and one ZIP part.
- Browser refresh and library rediscovery.

### Task 10.3 - Production promotion

Read: plan sections 2.1, 17.2, and 19; SPEC.md sections 17.2 and 18.

Only after preview passes:

1. Deploy production.
2. Record URL and deployment ID.
3. Run hosted Chromium/Firefox smoke.
4. Run current Edge/Firefox smoke on reference Windows device.
5. Update ACCEPTANCE_REPORT with deployment evidence.

Milestone 10 exit gate:

- Static Vercel production works on Windows and Linux release browsers.
- No application server or environment secret is required.
- Production headers preserve all browser features.
- Hosted artifact passes acceptance smoke.

## 19. Requirement and acceptance traceability

### 19.1 Normative requirement map

Each row represents one independently testable requirement group. Test titles begin with the ID.

| ID | Specification behavior | Primary packet | Required evidence |
| --- | --- | --- | --- |
| R-GEN-01 | Same complete config reproduces positions, velocities, visual variation; name/placement excluded | 2.2..2.6 | generation/reproducibility tests and browser digests |
| R-DOMAIN-01 | DU/MU/VU mapping, base step, Size meaning, and core-radius formula are consistent | 2.1, 3.3 | units/core-radius and fixture tests |
| R-GEN-02 | Five types, all closed ranges, valid data | 2.1..2.4 | boundary and maximum generator tests |
| R-GEN-03 | At least ten stars inside every core | 2.3..2.4 | core-reservation tests |
| R-GEN-04 | Random categories/count/budget/reproducibility | 2.5 | randomScenario tests |
| R-GEN-05 | Seed reroll yields displayed reproducible uint32 | 5.3..5.4 | draft/random component and E2E tests |
| R-BUDGET-01 | Level defaults affect later drafts/Random only; explicit above-level values warn; global limits reject | 5.3..5.4 | budget warning and non-destructive limit tests |
| R-START-01 | Exact First Light startup and globals | 5.4 | 01-startup acceptance |
| R-MODE-01 | Single invariant, linked draft, preset replacement, no delete | 5.2..5.3 | mode reducer/component tests |
| R-MODE-02 | Collision add/preserve/viewport-center/sole selection | 5.3 | 04-build-encounter |
| R-MODE-03 | Builder edit/add/delete/preset/scene behavior | 5.2..7.4 | builder and persistence E2E |
| R-MODE-04 | Random preserves until Generate, then replaces/plays/frames/deselects | 5.2..5.4 | random E2E |
| R-MODE-05 | Every transition preserve/replace/draft/selection rule | 5.2, 6.4 | transition table and undo |
| R-MODE-06 | Empty scene remains usable and framed at default | 5.3 | 14-empty-state |
| R-EDIT-01 | Selected particle edit regenerates only target and retains placement/velocity/name | 5.3 | edit digest test |
| R-EDIT-02 | Name-only edit does not regenerate | 3.2, 5.3 | before/after star digest |
| R-EDIT-03 | Move/velocity mapping and limits | 4.3, 5.3 | camera/drag tests |
| R-VIEW-01 | Centers, selection, and non-zero velocity are visually distinct; only Size terminology appears | 4.1, 5.3 | overlay and UI-label tests |
| R-SELECT-01 | At most one; footprint, nearest core, newest tie, empty deselect | 4.3, 5.5 | picking browser tests |
| R-SIM-01 | Continuous motion; stars non-colliding | 3.3..3.4 | engine tests |
| R-SIM-02 | Default attraction threshold | 3.7 | physics acceptance |
| R-SIM-03 | Scenario 5 orbit/tide/non-merger | 3.7 | physics acceptance |
| R-SIM-04 | First Light 300-unit stability | 3.7 | stability acceptance |
| R-SIM-05 | Invalid next state pauses/preserves/keeps controls | 3.4, 5.4 | fault injection |
| R-BH-01 | Distinct object and at least 20 percent peak increase | 4.5 | luminance browser test |
| R-BH-02 | Total mass unchanged, 10 percent concentrated, same positions | 2.3, 3.4 | generation/engine tests |
| R-BH-03 | Inner mean speed at least 5 percent higher | 2.3, 3.4 | black-hole fixture |
| R-MERGE-01 | Exact start-of-step trigger and non-trigger cases | 3.5 | merger unit/acceptance |
| R-MERGE-02 | All remnant fields, star union, seed/name, selection | 3.5, 5.5 | remnant/delta tests |
| R-MERGE-03 | Momentum tolerance and count update | 3.5 | numerical tests |
| R-MERGE-04 | Merger 25 percent brightening/one active second | 4.5 | luminance/timer test |
| R-ENCOUNTER-01 | Close non-merger 15 percent brightening/afterglow | 3.5, 4.5 | flyby luminance test |
| R-PLAY-01 | Play/pause remembers selected speed | 3.3, 5.4 | scheduler/control tests |
| R-PLAY-02 | Closed speed set and independent selection | 2.1, 5.4 | boundary/control tests |
| R-PLAY-03 | Single step exact/pause/history/speed preserved | 3.3, 6.2 | step/history tests |
| R-PLAY-04 | Gravity, performance, trails, regenerate behavior | 5.4, 6.4 | global tests |
| R-CAM-01 | Pan/zoom/reset/explicit auto-frame | 4.2 | camera tests |
| R-CAM-02 | Auto-frame precedence and empty default | 4.2 | reducer tests |
| R-CAM-03 | Point zoom and drag mapping within one pixel | 4.2..4.3 | mapping acceptance |
| R-HIST-01 | Exact 10 Hz, 300 snapshots, single-step marker | 6.2 | marker tests |
| R-HIST-02 | Bidirectional scrub, branch resume, history status | 6.3 | rewind acceptance |
| R-HIST-03 | History action restrictions; selection/camera allowed | 6.3 | UI availability table |
| R-HIST-04 | History navigation does not alter undo | 6.3 | stack-depth test |
| R-UNDO-01 | Exact closed action set and latest 20 | 6.4 | table-driven action test |
| R-UNDO-02 | Exact live/UI restore, pause, clear rewind, no redo | 6.4 | undo acceptance |
| R-PRESET-01 | Built-ins every type and closed saved fields | 2.5, 7.3 | preset tests |
| R-PRESET-02 | Save/discover/load, Single replace, multi add | 7.3 | preset E2E |
| R-SCENE-01 | Save/discover closed fields; exclude session/live state | 7.3 | scene round trip |
| R-SCENE-02 | Atomic invalid rejection with reason | 7.4 | invalid load fault matrix |
| R-SCENE-03 | Successful load Builder/paused/deselect/frame/regenerate | 7.4 | scene-load E2E |
| R-CAP-01 | Screenshot clean, named, discoverable, confirmed | 8.1 | capture E2E |
| R-REC-01 | 120-second/effective limit shown/finalized | 8.2..8.3 | fake-clock/full recording |
| R-REC-02 | 30 slots/sec, misses rather than blocks, live counts | 8.2..8.3 | scheduler/slow pipeline |
| R-REC-03 | Discoverable ordered images and timing export | 8.3..8.4 | manifest/ZIP E2E |
| R-STATUS-01 | FPS/count/playback/gravity/performance/selection/history/recording visible | 5.1..5.4, 8.2 | component/E2E |
| R-HELP-01 | Concise show/hide help | 5.4 | help component test |
| R-VALID-01 | Seed/numeric invalid input non-destructive | 2.1, 5.3..5.4 | boundary/component tests |
| R-VALID-02 | Names preserved; export normalized/shown/no overwrite | 7.2, 8.1..8.4 | naming tests |
| R-VALID-03 | No-target actions stable/no-op | 5.3, 6.4 | no-target tests |
| R-PERF-01 | Three reference fixtures meet FPS/frame/input thresholds | 4.6, 9.3 | raw performance report |
| R-RELY-01 | All types/categories/bounds valid and reproducible | 2.6, 9.1 | browser digest/boundary |
| R-RELY-02 | Save/load closed data and camera mapping | 4.2, 7.4 | persistence/mapping |
| R-PLATFORM-01 | Windows and Linux functional conformance | 9.4 | PLATFORM_RESULTS |

### 19.2 Acceptance scenario test map

| Scenario | Named automated evidence | Completed |
| ---: | --- | ---: |
| 1 | e2e/acceptance/01-startup.spec.ts plus First Light digest | 5 |
| 2 | e2e/acceptance/02-single-editing.spec.ts | 5 |
| 3 | features/modes/modeReducer.test.ts and e2e/acceptance/03-mode-transitions.spec.ts | 6 |
| 4 | e2e/acceptance/04-build-encounter.spec.ts | 5 |
| 5 | simulation/05-interaction.acceptance.test.ts and browser luminance flyby | 4 |
| 6 | simulation/06-merger.acceptance.test.ts and browser merger luminance | 4 |
| 7 | generation core test, simulation/07-black-hole.acceptance.test.ts, browser luminance | 4 |
| 8 | e2e/acceptance/08-preset-reproduction.spec.ts | 7 |
| 9 | generation/09-random-reproduction.acceptance.browser.test.ts | 2, 9 |
| 10 | e2e/acceptance/10-scene-roundtrip.spec.ts | 7 |
| 11 | e2e/acceptance/11-invalid-load.spec.ts | 7 |
| 12 | simulation/12-history.acceptance.test.ts and e2e/acceptance/12-rewind.spec.ts | 6 |
| 13 | app/13-undo.acceptance.test.ts and e2e/acceptance/13-undo.spec.ts | 6 |
| 14 | e2e/acceptance/14-empty-state.spec.ts | 5 |
| 15 | e2e/acceptance/15-capture-recording.spec.ts with 300-slot override and duration auto-stop | 8 |
| 16 | rendering/16-camera.acceptance.test.ts and e2e/acceptance/16-camera.spec.ts | 4 |
| 17 | domain/17-limits.acceptance.test.ts and perf/reference-bench.ts | 9 |

## 20. Task handoff template

Every packet ends with:

    Packet:
    - [number and name]

    Files created/changed:
    - [paths]

    Specification requirements:
    - [requirement IDs and SPEC sections]

    Behavior completed:
    - [exact list]

    Tests added:
    - [test and oracle]

    Commands run:
    - npm run format:check
    - npm run typecheck
    - npm run lint
    - npm run architecture:check
    - [packet-specific tests]

    Results:
    - [pass/fail and relevant metrics]

    Windows/Linux status:
    - [local result or release-stage not yet run]

    Golden/constants changed:
    - [none or old/new plus approved reason]

    ADR/evidence:
    - [paths]

    Remaining packet blockers:
    - [must be empty before next packet]

    Next packet:
    - [number]

## 21. Official implementation references

Recheck these only when initializing or deliberately upgrading dependencies:

- Node.js release status: https://nodejs.org/en/about/previous-releases
- Vite setup and React TypeScript template: https://vite.dev/guide/
- Vite TypeScript behavior: https://vite.dev/guide/features
- PixiJS WebGL renderer: https://pixijs.com/8.x/guides/components/renderers
- PixiJS ParticleContainer: https://pixijs.com/8.x/guides/components/scene-objects/particle-container
- PixiJS render loop: https://pixijs.com/8.x/guides/concepts/render-loop
- Vitest Browser Mode with Playwright: https://vitest.dev/guide/browser/
- Vitest coverage providers/configuration: https://vitest.dev/guide/coverage
- Playwright browser projects/channels: https://playwright.dev/docs/browsers
- Dexie transactions: https://dexie.org/docs/Transaction/Transaction.html
- MDN Web Workers: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
- MDN IndexedDB: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- MDN canvas toBlob: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob
- MDN storage estimate: https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate
- Vercel Vite deployment: https://vercel.com/docs/frameworks/frontend/vite
- Vercel supported Node.js versions: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- Vercel project configuration: https://vercel.com/docs/project-configuration/vercel-json
- Vercel CLI deployment: https://vercel.com/docs/cli/deploy
- ECMA-262 Math object: https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-math-object
