# ADR 0002: history storage

Status: Accepted

## Context

Task 1.3 must prove exact rewind and undo storage at the 120,000-star scene maximum while 31 topology-churn keyframes, 20 undo states, a ten-state reconstruction cache, present/reconstruction pins, dual live banks, three publication buffers, and main-thread typed-array caches coexist. Retained deterministic accounting must remain at or below 192 MiB and transient reconstruction accounting at or below 224 MiB.

## Decision

Use section 11.5 block/segment topology:

- Mutable star state is four separate Float32 arrays (`x`, `y`, `vx`, `vy`), exactly 16 bytes per star per state.
- StyleBlock owns five immutable Uint8 arrays, exactly 5 bytes per generated star block.
- Segment records retain a StyleBlock and slice, contiguous live range, and owner slot.
- Keyframes, undo snapshots, pins, and reconstructed states clone mutable arrays but share immutable StyleBlocks through explicit reference counts.
- Mergers concatenate/relabel Segment records without copying style bytes.
- `ownerSlot` is rebuilt from Segment ranges and is not stored in every snapshot.
- Marker reconstruction uses an immediate-eviction, marker-ID-keyed LRU capped at ten states.

The prototype hashes the little-endian mutable arrays, segment fields, and style bytes with the `GALAXIA-ENGINE-1` header using SHA-256. Clone/restore produced the same digest:

`45aec475c6f8c378e80339b561e277171b09c9457d4a91db594fc100a399a87a`

The latest StyleBlock had 22 simultaneous keyframe/post-merger/undo references before releases. Thirty-one distinct immutable blocks remained referenced by the 31 keyframes. Rebuilding owner slots from copied segment records matched every one of 120,000 original slots.

## Deterministic retained accounting

| Owned data                              |     Count/arithmetic |                        Bytes |
| --------------------------------------- | -------------------: | ---------------------------: |
| 31 keyframe mutable states              |     31 × 120000 × 16 |                   59,520,000 |
| Post-keyframe merger state              |          120000 × 16 |                    1,920,000 |
| 20 undo mutable states                  |     20 × 120000 × 16 |                   38,400,000 |
| Ten reconstruction-cache states         |     10 × 120000 × 16 |                   19,200,000 |
| Current and candidate live banks        |      2 × 120000 × 16 |                    3,840,000 |
| Pinned present                          |          120000 × 16 |                    1,920,000 |
| Reconstruction candidate                |          120000 × 16 |                    1,920,000 |
| Three interleaved frame buffers         |   3 × 120000 × 2 × 4 |                    2,880,000 |
| Main owner, hit positions, style copy   | 120000 × (1 + 8 + 5) |                    1,680,000 |
| 31 immutable style blocks, counted once |      31 × 120000 × 5 |                   18,600,000 |
| **Total retained**                      |                      | **149,880,000 (142.94 MiB)** |

The retained result is 51,446,592 bytes below the 192 MiB limit.

## Deterministic transient accounting

The reconstruction/transfer-clone peak adds one mutable 120,000-star state (1,920,000 bytes) while all retained structures remain live:

- Transient peak: 151,800,000 bytes (144.77 MiB).
- Limit: 234,881,024 bytes (224 MiB).
- Margin: 83,081,024 bytes.

No prototype allocation exceeds 32 MiB; the largest individual allocation is a 480,000-byte Float32 component array or 960,000-byte interleaved publication array.

## LRU and topology results

- Replaying across nineteen regular markers caused nine immediate evictions and retained marker IDs 10–19.
- The separate 300 dense single-step-marker replay caused 290 immediate evictions and never exceeded ten states.
- The post-keyframe merger changed owner slots by Segment relabeling while retaining the same immutable style slices.

## Evidence

- `perf/history-memory.ts`
- `tests/unit/history-memory.test.ts`
- `docs/evidence/history-memory-proof.json`

## Consequences

Production history and undo storage must preserve these sharing, ownership-rebuild, cache-cap, and accounting rules. Portable scene persistence remains a separate regeneration-oriented representation.
