import assert from "node:assert/strict";

import { focusApplicationReviewSearch } from "../src/applicationReviewNavigation.js";

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
    ["scroll", { behavior: "smooth", block: "start" }],
    ["focus", { preventScroll: true }]
  ]);
}

function safelyHandlesMissingElements() {
  assert.doesNotThrow(() => {
    focusApplicationReviewSearch({});
  });
}

scrollsAndFocusesReviewSearch();
safelyHandlesMissingElements();

console.log("application-review-navigation-tests: ok");
