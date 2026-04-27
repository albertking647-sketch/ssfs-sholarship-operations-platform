function normalizeNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function parseYearNumber(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  const numeric = Number(text);
  if (!Number.isNaN(numeric) && numeric > 0) {
    return numeric;
  }

  const match = text.match(/(\d+)/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeDocumentChecklist(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        const label = normalizeText(item);
        return label ? { label, received: false } : null;
      }

      const label = normalizeText(item?.label);
      if (!label) return null;
      return {
        label,
        received: Boolean(item?.received)
      };
    })
    .filter(Boolean);
}

function createCheck(key, label, status, message) {
  return { key, label, status, message };
}

function createSummary(recommendedDecision, checks, criteria) {
  if (!criteria) {
    return "No screening rules have been saved for this scheme and academic year yet.";
  }

  const failed = checks.filter((item) => item.status === "fail").map((item) => item.message);
  if (failed.length) {
    return failed[0];
  }

  const pending = checks.filter((item) => item.status === "pending").map((item) => item.message);
  if (pending.length) {
    return pending[0];
  }

  switch (recommendedDecision) {
    case "qualified":
      return "All automatic screening checks currently pass.";
    case "pending":
      return "Automatic screening still needs manual confirmation before final review.";
    case "disqualified":
      return "Automatic screening found a rule failure.";
    default:
      return "Automatic screening is waiting for more information.";
  }
}

export function buildApplicationScreeningAssessment({
  criteria,
  application = null,
  matchedStudent = null,
  payload = null,
  nameMismatchFlag = false
}) {
  if (!criteria) {
    return {
      configured: false,
      state: "not_configured",
      recommendedDecision: null,
      summary: "No screening rules have been saved for this scheme and academic year yet.",
      checks: []
    };
  }

  const checks = [];
  const yearValue =
    normalizeText(payload?.year) ||
    normalizeText(application?.year) ||
    normalizeText(matchedStudent?.year) ||
    null;
  const yearNumber = parseYearNumber(yearValue);
  const cwa = normalizeNumber(application?.cwa ?? matchedStudent?.cwa);
  const wassceAggregate = normalizeNumber(
    application?.wassceAggregate ?? matchedStudent?.wassceAggregate
  );
  const requiredDocuments = Array.isArray(criteria.requiredDocuments)
    ? criteria.requiredDocuments.filter(Boolean)
    : [];
  const documentChecklist = normalizeDocumentChecklist(
    application?.documentChecklist ?? payload?.documentChecklist ?? []
  );
  const documentChecklistMap = new Map(
    documentChecklist.map((item) => [String(item.label || "").toLowerCase(), item])
  );
  const interviewStatus = normalizeText(application?.interviewStatus)?.toLowerCase() || null;
  const interviewScore = normalizeNumber(application?.interviewScore);

  if (criteria.cwaCutoff !== null && criteria.cwaCutoff !== undefined) {
    if (yearNumber === 1) {
      checks.push(
        createCheck(
          "cwa",
          "CWA check",
          "not_applicable",
          "CWA screening is not applied to first-year applicants."
        )
      );
    } else if (yearNumber === null) {
      checks.push(
        createCheck(
          "cwa",
          "CWA check",
          "pending",
          "Year is missing, so the CWA cut-off could not be confirmed automatically."
        )
      );
    } else if (cwa === null) {
      checks.push(
        createCheck(
          "cwa",
          "CWA check",
          "pending",
          "No imported CWA history was matched for this student yet, so the academic cut-off needs manual confirmation."
        )
      );
    } else if (cwa >= Number(criteria.cwaCutoff)) {
      checks.push(
        createCheck(
          "cwa",
          "CWA check",
          "pass",
          `CWA ${cwa} meets the ${criteria.cwaCutoff} cut-off.`
        )
      );
    } else {
      checks.push(
        createCheck(
          "cwa",
          "CWA check",
          "fail",
          `CWA ${cwa} is below the ${criteria.cwaCutoff} cut-off.`
        )
      );
    }
  }

  if (criteria.wassceCutoff !== null && criteria.wassceCutoff !== undefined) {
    if (yearNumber !== null && yearNumber > 1) {
      checks.push(
        createCheck(
          "wassce",
          "WASSCE check",
          "not_applicable",
          "WASSCE screening is only applied to first-year applicants."
        )
      );
    } else if (yearNumber === null) {
      checks.push(
        createCheck(
          "wassce",
          "WASSCE check",
          "pending",
          "Year is missing, so the WASSCE cut-off could not be confirmed automatically."
        )
      );
    } else if (wassceAggregate === null) {
      checks.push(
        createCheck(
          "wassce",
          "WASSCE check",
          "pending",
          "WASSCE aggregate is missing, so the first-year academic cut-off needs manual confirmation."
        )
      );
    } else if (wassceAggregate <= Number(criteria.wassceCutoff)) {
      checks.push(
        createCheck(
          "wassce",
          "WASSCE check",
          "pass",
          `WASSCE aggregate ${wassceAggregate} meets the ${criteria.wassceCutoff} cut-off.`
        )
      );
    } else {
      checks.push(
        createCheck(
          "wassce",
          "WASSCE check",
          "fail",
          `WASSCE aggregate ${wassceAggregate} is above the ${criteria.wassceCutoff} cut-off.`
        )
      );
    }
  }

  if (requiredDocuments.length) {
    const missingDocuments = requiredDocuments.filter((item) => {
      const entry = documentChecklistMap.get(String(item).toLowerCase());
      return !entry?.received;
    });

    if (missingDocuments.length === requiredDocuments.length) {
      checks.push(
        createCheck(
          "documents",
          "Documents",
          "pending",
          `Requirement checks are still needed for: ${requiredDocuments.join(", ")}.`
        )
      );
    } else if (missingDocuments.length) {
      checks.push(
        createCheck(
          "documents",
          "Documents",
          "pending",
          `Required items still missing or not yet met: ${missingDocuments.join(", ")}.`
        )
      );
    } else {
      checks.push(
        createCheck(
          "documents",
          "Documents",
          "pass",
          "All required document checks have been met."
        )
      );
    }
  }

  if (criteria.interviewRequired) {
    if (interviewStatus === "completed") {
      checks.push(
        createCheck(
          "interview",
          "Interview",
          "pass",
          interviewScore !== null
            ? `Interview is complete with a recorded score of ${interviewScore}.`
            : "Interview is complete and the requirement has been met."
        )
      );
    } else if (interviewStatus === "waived") {
      checks.push(
        createCheck(
          "interview",
          "Interview",
          "pass",
          "Interview requirement has been waived for this application."
        )
      );
    } else if (interviewStatus === "scheduled") {
      checks.push(
        createCheck(
          "interview",
          "Interview",
          "pending",
          "Interview has been scheduled but is not marked as completed yet."
        )
      );
    } else {
      checks.push(
        createCheck(
          "interview",
          "Interview",
          "pending",
          "Interview is required before the application can be fully cleared."
        )
      );
    }
  }

  if (nameMismatchFlag) {
    checks.push(
      createCheck(
        "data_match",
        "Applicant data match",
        "pending",
        "Uploaded applicant details differ from the registry and need reviewer confirmation."
      )
    );
  }

  const hasFailure = checks.some((item) => item.status === "fail");
  const hasPending = checks.some((item) => item.status === "pending");
  const recommendedDecision = hasFailure
    ? "disqualified"
    : hasPending
      ? "pending"
      : "qualified";

  return {
    configured: true,
    state: hasFailure ? "failed" : hasPending ? "needs_review" : "ready",
    recommendedDecision,
    summary: createSummary(recommendedDecision, checks, criteria),
    checks
  };
}
