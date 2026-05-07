import assert from "node:assert/strict";

import { buildApplicationRemovalState } from "../src/applicationRemovalState.js";

function removesApplicationFromLocalCollections() {
  const result = buildApplicationRemovalState(
    {
      applicationsList: [{ id: "application-1" }, { id: "application-2" }],
      applicationReviewResults: [{ id: "application-1" }, { id: "application-3" }],
      selectedApplicationId: "application-1"
    },
    "application-1"
  );

  assert.deepEqual(result.applicationsList, [{ id: "application-2" }]);
  assert.deepEqual(result.applicationReviewResults, [{ id: "application-3" }]);
  assert.equal(result.selectedApplicationId, null);
}

function keepsSelectionWhenAnotherApplicationIsRemoved() {
  const result = buildApplicationRemovalState(
    {
      applicationsList: [{ id: "application-1" }, { id: "application-2" }],
      applicationReviewResults: [{ id: "application-1" }],
      selectedApplicationId: "application-2"
    },
    "application-1"
  );

  assert.equal(result.selectedApplicationId, "application-2");
}

removesApplicationFromLocalCollections();
keepsSelectionWhenAnotherApplicationIsRemoved();

console.log("application-removal-state-tests: ok");
