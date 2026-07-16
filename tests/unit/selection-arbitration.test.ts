import { describe, expect, it } from "vitest";
import { arbitrateSelection } from "../../src/app/selectionService";
import { PROTOCOL_VERSION, type SceneDeltaEvent } from "../../src/simulation/protocol";
const delta: SceneDeltaEvent = {
  protocolVersion: PROTOCOL_VERSION,
  type: "SCENE_DELTA",
  modelRevision: 2,
  topologyEpoch: 2,
  causeRequestId: null,
  addedIds: ["remnant"],
  removedIds: ["a", "b"],
  mergerMappings: [{ inputIds: ["a", "b"], remnantId: "remnant", oldIndices: [0, 1], newIndex: 0 }],
};
describe("selection merger arbitration", () => {
  it("lets a user deselection win the race", () => {
    expect(arbitrateSelection(null, delta, new Set(["remnant", "other"]))).toBeNull();
  });
  it("moves a selected input to its remnant", () => {
    expect(arbitrateSelection("a", delta, new Set(["remnant"]))).toBe("remnant");
  });
  it("preserves a different live selection", () => {
    expect(arbitrateSelection("other", delta, new Set(["remnant", "other"]))).toBe("other");
  });
});
