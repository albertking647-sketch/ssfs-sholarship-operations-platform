export function buildApplicationRemovalState(currentState = {}, applicationId) {
  const removedId = String(applicationId || "");
  const removeById = (items = []) =>
    Array.isArray(items) ? items.filter((item) => String(item.id || "") !== removedId) : [];

  return {
    applicationsList: removeById(currentState.applicationsList),
    applicationReviewResults: removeById(currentState.applicationReviewResults),
    selectedApplicationId:
      String(currentState.selectedApplicationId || "") === removedId
        ? null
        : currentState.selectedApplicationId || null
  };
}
