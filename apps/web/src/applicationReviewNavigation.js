export function focusApplicationReviewSearch({ searchForm, searchInput }) {
  searchForm?.scrollIntoView?.({
    behavior: "auto",
    block: "start"
  });
  searchInput?.focus?.({ preventScroll: true });
}

export async function beginApplicationReviewPostSaveTransition({
  searchForm,
  searchInput,
  refreshWork = []
} = {}) {
  focusApplicationReviewSearch({ searchForm, searchInput });
  return Promise.allSettled(
    (Array.isArray(refreshWork) ? refreshWork : [])
      .filter((item) => typeof item === "function")
      .map((item) => item())
  );
}
