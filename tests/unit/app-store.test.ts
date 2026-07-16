import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../../src/app/store";
describe("low-frequency application store", () => {
  beforeEach(() => {
    useAppStore.setState({ lastStatusCommitAt: Number.NEGATIVE_INFINITY });
  });
  it("commits status at no more than ten hertz", () => {
    const initial = useAppStore.getState().status,
      next = { ...initial, fps: 55 };
    expect(useAppStore.getState().setStatus(next, 1000)).toBe(true);
    expect(useAppStore.getState().setStatus({ ...next, fps: 56 }, 1099)).toBe(false);
    expect(useAppStore.getState().status.fps).toBe(55);
    expect(useAppStore.getState().setStatus({ ...next, fps: 57 }, 1100)).toBe(true);
  });
});
