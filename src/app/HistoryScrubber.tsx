import { useEffect, useRef, useState } from "react";

export interface HistoryScrubberProps {
  markerIds: readonly number[];
  selectedMarkerId: number | null;
  busy: boolean;
  onScrub: (markerId: number) => void;
  onExit: () => void;
  onResume: (markerId: number) => void;
}

export function HistoryScrubber({
  markerIds,
  selectedMarkerId,
  busy,
  onScrub,
  onExit,
  onResume,
}: HistoryScrubberProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    pending = useRef<number | null>(null),
    [lastSentAt, setLastSentAt] = useState(Number.NEGATIVE_INFINITY),
    selectedIndex = Math.max(0, markerIds.indexOf(selectedMarkerId ?? markerIds.at(-1) ?? -1));
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const request = (markerId: number) => {
    pending.current = markerId;
    const elapsed = performance.now() - lastSentAt;
    const publish = () => {
      const marker = pending.current;
      pending.current = null;
      timer.current = null;
      if (marker === null) return;
      setLastSentAt(performance.now());
      onScrub(marker);
    };
    if (elapsed >= 50) publish();
    else timer.current ??= setTimeout(publish, 50 - elapsed);
  };
  if (markerIds.length === 0) return null;
  return (
    <section className="history-scrubber" aria-label="Rewind history">
      <strong>History</strong>
      <input
        aria-label="History position"
        type="range"
        min={0}
        max={markerIds.length - 1}
        value={selectedIndex}
        onChange={(event) => {
          const marker = markerIds[Number(event.currentTarget.value)];
          if (marker !== undefined) request(marker);
        }}
      />
      <output>
        {String(selectedIndex + 1)} / {String(markerIds.length)}
      </output>
      {busy && <span role="status">Reconstructing...</span>}
      <button type="button" onClick={onExit}>
        Exit to present
      </button>
      <button
        type="button"
        disabled={selectedMarkerId === null || busy}
        onClick={() => {
          if (selectedMarkerId !== null) onResume(selectedMarkerId);
        }}
      >
        Resume here
      </button>
    </section>
  );
}
