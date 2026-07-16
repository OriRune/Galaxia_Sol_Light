# ADR 0003: recording storage

Status: Accepted

## Context

Task 1.4 must prove the fixed two-target capture pipeline, immediate IndexedDB persistence, bounded missed-slot behavior, and streaming multipart ZIP export using 300 artwork-like 1920 by 1080 frames. It must also project a full 3,600-slot recording from measured nearest-rank p95 frame size and leave no spike data behind.

## Decision

Retain the recording design from sections 13.1–13.8:

- Exactly two independent reusable offscreen HTML canvases.
- Asynchronous `toBlob`; no synchronous data URL or readback path.
- WebP quality 0.90 when a hidden non-empty WebP probe succeeds, otherwise PNG.
- At most two encode-plus-write operations in flight; a third due attempt is marked missed rather than queued.
- Each successful Blob is immediately written as one frame row in IndexedDB.
- ZIP planning reads frame metadata first and assigns ordered frames to a 63 MiB input budget.
- fflate `ZipPassThrough` entries stream already-compressed images without recompression.
- A no-directory-picker fallback builds exactly one numbered part per explicit user action; it never triggers a multi-download burst.

## Measurements

| Browser  | WebP | p95 Blob bytes | p95 toBlob ms | p95 IDB write ms | 300-frame ZIP bytes | Near-63-MiB streamed part bytes | Projected 3600-slot parts | Peak owned bytes |
| -------- | ---- | -------------: | ------------: | ---------------: | ------------------: | ------------------------------: | ------------------------: | ---------------: |
| Chromium | Yes  |         75,330 |           185 |              2.3 |          21,900,734 |                      66,155,772 |                         5 |       82,970,562 |
| Firefox  | Yes  |         76,018 |           217 |                9 |          21,983,254 |                      66,179,826 |                         5 |       82,996,680 |

Both runs created and persisted exactly 300 full-HD frames. The two-target pipeline reached, but never exceeded, two in-flight operations. A forced third attempt while both targets were occupied produced exactly one missed slot in both browsers.

The full-limit projection applies the required formula:

`ceil(3600 × measuredP95FrameBytes / (63 MiB))`

It yields five parts for both measured p95 values. The measured artwork compresses more strongly than the rough 300 KiB planning example in the implementation plan.

## Streaming and fallback proof

The ordinary 300-frame export fits in one part. A separate spike plan reused the persisted Blob inputs sequentially until the 63 MiB frame-input budget was full, then streamed one actual ZIP part:

- Chromium: 66,155,772 output bytes.
- Firefox: 66,179,826 output bytes.

Both remain below the 67,108,864-byte 64 MiB cap. Peak owned accounting includes two RGBA offscreen targets, the complete streamed spike output, and three p95-sized frame buffers; it was 79.13 MiB in Chromium and 79.15 MiB in Firefox.

The fallback proof invoked one explicit part action and observed exactly one part build. No other part was created automatically.

## Cleanup

Each run used a unique proof database. It closed the database and successfully completed `indexedDB.deleteDatabase` before returning. The test asserts this cleanup flag, including failure-path cleanup from `finally`; no captured frame or ZIP spike data is retained.

## Evidence

- `perf/capture-storage.ts`
- `tests/browser/capture-storage.test.ts`
- `docs/evidence/capture-storage-proof.json`

## Consequences

Production recording must preserve the two-target ceiling, immediate write discipline, non-backfilling missed-slot semantics, metadata-first part planning, 63 MiB frame budget, explicit per-part fallback, and resumable database cleanup rules.
