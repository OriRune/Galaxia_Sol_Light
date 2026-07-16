# ADR 0001: particle renderer

Status: Accepted

## Context

Task 1.1 requires the 60,000-star High proxy to sustain at least 40 average FPS, nearest-rank p95 frame interval at most 37.5 ms, and p95 visible response at most 75 ms in stable system Edge and system Firefox on the reference device. The proxy also exercises deterministic five-group motion, continuous automatic camera changes, trail reprojection, core/effect artwork, Worker-copy simulation, and picking/input probes on an exact 1920 by 1080 CSS-pixel surface.

The reference environment is Windows 11 ARM64, Qualcomm Adreno X1-45 through ANGLE Direct3D 11, graphics driver 31.0.137.0, system Edge 149.0.7827.55, and system Firefox 152.0 at DPR 2.

## Decision

Use the section 10.2 custom Pixi-compatible WebGL2 instanced-quad fallback and delete the ParticleContainer path.

The retained renderer uses:

- PixiJS only to create and own the WebGL2 application/context.
- One reusable six-index quad.
- One interleaved dynamic `Float32` position buffer.
- One static normalized RGBA byte-style buffer.
- One same-origin 16 by 16 radial-alpha star texture.
- One instanced draw for stars and a separate instanced core/effect draw.
- Two 1920 by 1080 RGBA8 ping-pong trail targets with 1.2-second half-life and camera reprojection.
- Explicit deletion of buffers, vertex array, programs, textures, and framebuffers.

The allocation-clean ParticleContainer proxy still fell below the Firefox FPS gate in later trials even though p95 particle update was 2 ms and p95 render work was 9–10 ms. The selected fallback reduces those Firefox p95 measurements to 1–2 ms and 2–4 ms respectively. Firefox evidence uses three fresh browser instances because a long-lived Firefox session reduced requestAnimationFrame cadence after its first one-minute trial despite 2–3 ms renderer work. Each instance runs the same self-driving local page and produces one raw result; the evidence file combines exactly those three results.

## Normative timing evidence

| Browser | Run | Average FPS | p95 frame ms | p95 response ms | Copy p95 ms | Update p95 ms | Render p95 ms | Result |
| ------- | --: | ----------: | -----------: | --------------: | ----------: | ------------: | ------------: | ------ |
| Edge    |   1 |       56.18 |        18.30 |           17.60 |        0.10 |          0.90 |          0.40 | Pass   |
| Edge    |   2 |       56.17 |        18.30 |           18.80 |        0.10 |          1.00 |          0.30 | Pass   |
| Edge    |   3 |       56.15 |        18.40 |           19.10 |        0.10 |          1.20 |          0.30 | Pass   |
| Firefox |   1 |       47.09 |        33.96 |           37.00 |        0.00 |          2.00 |          4.00 | Pass   |
| Firefox |   2 |       47.50 |        32.32 |           32.00 |        0.00 |          1.00 |          2.00 | Pass   |
| Firefox |   3 |       46.64 |        32.12 |           30.00 |        0.00 |          1.00 |          2.00 | Pass   |

## Raw trail-smear evidence

The fixed gates are t=60 p99/median luminance at least 2.0 and t=60 full-texture standard deviation at least 50 percent of t=5. All comparisons use unrounded evidence values.

| Browser | Run |   t | Active texels | Median Y |    p99 Y | Standard deviation Y | t=60 contrast | Retention | Result |
| ------- | --: | --: | ------------: | -------: | -------: | -------------------: | ------------: | --------: | ------ |
| Edge    |   1 |   5 |        109225 | 0.753955 | 0.916424 |             0.161258 |             - |         - | Valid  |
| Edge    |   1 |  60 |        299111 | 0.160784 | 0.916424 |             0.163298 |          5.70 |    101.3% | Pass   |
| Edge    |   2 |   5 |        109214 | 0.753955 | 0.916424 |             0.161272 |             - |         - | Valid  |
| Edge    |   2 |  60 |        299893 | 0.160784 | 0.916424 |             0.163371 |          5.70 |    101.3% | Pass   |
| Edge    |   3 |   5 |        109218 | 0.753955 | 0.916424 |             0.161289 |             - |         - | Valid  |
| Edge    |   3 |  60 |        299470 | 0.156863 | 0.916424 |             0.163054 |          5.84 |    101.1% | Pass   |
| Firefox |   1 |   5 |        110092 | 0.753671 | 0.916424 |             0.160422 |             - |         - | Valid  |
| Firefox |   1 |  60 |        301572 | 0.070588 | 0.916424 |             0.159411 |         12.98 |     99.4% | Pass   |
| Firefox |   2 |   5 |        110200 | 0.753671 | 0.916424 |             0.160520 |             - |         - | Valid  |
| Firefox |   2 |  60 |        301241 | 0.086275 | 0.916424 |             0.159683 |         10.62 |     99.5% | Pass   |
| Firefox |   3 |   5 |        110327 | 0.751405 | 0.916424 |             0.160372 |             - |         - | Valid  |
| Firefox |   3 |  60 |        301678 | 0.086275 | 0.916424 |             0.159637 |         10.62 |     99.5% | Pass   |

## Informational cases

System Edge one-run results are 55.08 FPS at 10,000 particles, 55.72 FPS at 30,000, and 55.42 FPS at 120,000. These cases are informational and do not use the normative response or 60-second trail gates.

## Evidence

- `docs/evidence/renderer-proxy-system-edge.json`
- `docs/evidence/renderer-proxy-system-firefox.json`
- `docs/evidence/renderer-proxy-informational-10000.json`
- `docs/evidence/renderer-proxy-informational-30000.json`
- `docs/evidence/renderer-proxy-informational-120000.json`

## Consequences

Production rendering will have one star path: the instanced WebGL2 design. ParticleContainer is not retained as a second implementation. The renderer remains WebGL-only and must surface the specified unsupported-renderer behavior if WebGL2 initialization fails.
