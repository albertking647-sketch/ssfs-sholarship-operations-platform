import assert from "node:assert/strict";

import {
  beginApplicationReviewPostSaveTransition,
  focusApplicationReviewSearch
} from "../src/applicationReviewNavigation.js";

function scrollsAndFocusesReviewSearch() {
  const calls = [];
  const searchForm = {
    scrollIntoView(options) {
      calls.push(["scroll", options]);
    }
  };
  const searchInput = {
    focus(options) {
      calls.push(["focus", options]);
    }
  };

  focusApplicationReviewSearch({ searchForm, searchInput });

  assert.deepEqual(calls, [
    ["scroll", { behavior: "auto", block: "start" }],
    ["focus", { preventScroll: true }]
  ]);
}

function safelyHandlesMissingElements() {
  assert.doesNotThrow(() => {
    focusApplicationReviewSearch({});
  });
}

async function beginsBackgroundRefreshAfterReturningFocus() {
  const events = [];

  const refreshResults = await beginApplicationReviewPostSaveTransition({
    searchForm: {
      scrollIntoView() {
        events.push("scroll");
      }
    },
    searchInput: {
      focus() {
        events.push("focus");
      }
    },
    refreshWork: [
      async () => {
        events.push("refresh-1");
        return "ok";
      },
      async () => {
        events.push("refresh-2");
        throw new Error("boom");
      }
    ]
  });

  assert.deepEqual(events, ["scroll", "focus", "refresh-1", "refresh-2"]);
  assert.equal(refreshResults.length, 2);
  assert.equal(refreshResults[0].status, "fulfilled");
  assert.equal(refreshResults[1].status, "rejected");
}

scrollsAndFocusesReviewSearch();
safelyHandlesMissingElements();
await beginsBackgroundRefreshAfterReturningFocus();

console.log("application-review-navigation-tests: ok");
