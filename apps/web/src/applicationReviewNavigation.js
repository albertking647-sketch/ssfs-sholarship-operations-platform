export function focusApplicationReviewSearch({ searchForm, searchInput }) {
  searchForm?.scrollIntoView?.({
    behavior: "smooth",
    block: "start"
  });
  searchInput?.focus?.({ preventScroll: true });
}
