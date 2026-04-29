function normalizeText(value) {
  return String(value || "").trim();
}

function compareAcademicYearsDescending(left, right) {
  return right.localeCompare(left, undefined, { numeric: true, sensitivity: "base" });
}

function compareSemesterLabels(left, right) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

export function normalizeAcademicHistoryImportScopeOptions(payload = {}) {
  const grouped = new Map();
  const items = Array.isArray(payload.items) ? payload.items : [];

  for (const item of items) {
    const academicYearLabel = normalizeText(item?.academicYearLabel);
    if (!academicYearLabel) {
      continue;
    }

    const semesterSet = grouped.get(academicYearLabel) || new Set();
    const semesters = Array.isArray(item?.semesters) ? item.semesters : [];
    for (const semester of semesters) {
      const semesterLabel = normalizeText(semester);
      if (semesterLabel) {
        semesterSet.add(semesterLabel);
      }
    }
    grouped.set(academicYearLabel, semesterSet);
  }

  const normalizedItems = Array.from(grouped.entries())
    .map(([academicYearLabel, semesters]) => ({
      academicYearLabel,
      semesters: Array.from(semesters).sort(compareSemesterLabels)
    }))
    .sort((left, right) =>
      compareAcademicYearsDescending(left.academicYearLabel, right.academicYearLabel)
    );

  return {
    totalAcademicYears:
      Number(payload.totalAcademicYears) > 0
        ? Number(payload.totalAcademicYears)
        : normalizedItems.length,
    items: normalizedItems
  };
}

export function getAcademicHistoryScopeSemesters(options = {}, academicYearLabel = "") {
  const normalizedYear = normalizeText(academicYearLabel);
  const item =
    (Array.isArray(options.items) ? options.items : []).find(
      (entry) => normalizeText(entry?.academicYearLabel) === normalizedYear
    ) || null;

  return Array.isArray(item?.semesters) ? [...item.semesters] : [];
}
