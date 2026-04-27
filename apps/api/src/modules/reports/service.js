import {
  applications,
  applicationCriteria,
  awards,
  payments,
  schemes,
  students
} from "../../data/sampleData.js";
import { ValidationError } from "../../lib/errors.js";

let beneficiarySchemeExportWorkbookFactoryPromise = null;
let beneficiarySummaryExportWorkbookFactoryPromise = null;

async function loadBeneficiarySchemeExportWorkbookFactory() {
  if (!beneficiarySchemeExportWorkbookFactoryPromise) {
    beneficiarySchemeExportWorkbookFactoryPromise = import("./beneficiarySchemeExportWorkbook.js")
      .then((module) => module.buildBeneficiarySchemeExportWorkbook)
      .catch((error) => {
        beneficiarySchemeExportWorkbookFactoryPromise = null;
        throw error;
      });
  }

  return beneficiarySchemeExportWorkbookFactoryPromise;
}

async function loadBeneficiarySummaryExportWorkbookFactory() {
  if (!beneficiarySummaryExportWorkbookFactoryPromise) {
    beneficiarySummaryExportWorkbookFactoryPromise = import("./beneficiarySummaryExportWorkbook.js")
      .then((module) => module.buildBeneficiarySummaryExportWorkbook)
      .catch((error) => {
        beneficiarySummaryExportWorkbookFactoryPromise = null;
        throw error;
      });
  }

  return beneficiarySummaryExportWorkbookFactoryPromise;
}

function normalizeAcademicYearLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /^\d{4}\/\d{4}$/.test(text) ? `${text} Academic Year` : text;
}

function getAcademicYearStart(value) {
  const match = normalizeAcademicYearLabel(value).match(/^(\d{4})/);
  return match ? Number(match[1]) : 0;
}

async function resolveCurrentBeneficiaryYearLabel(repositories) {
  const activeSchemes = (await repositories.schemes.list())
    .filter((item) => String(item.status || "active").toLowerCase() === "active")
    .map((item) => normalizeAcademicYearLabel(item.academicYearLabel))
    .filter(Boolean)
    .sort((left, right) => getAcademicYearStart(right) - getAcademicYearStart(left));

  if (activeSchemes.length) {
    return activeSchemes[0];
  }

  const activeCycles = (await repositories.cycles.list())
    .filter((item) => String(item.status || "active").toLowerCase() === "active")
    .map((item) => normalizeAcademicYearLabel(item.label || item.academicYearLabel))
    .filter(Boolean)
    .sort((left, right) => getAcademicYearStart(right) - getAcademicYearStart(left));

  return activeCycles[0] || "";
}

function parseReviewerMetadata(rawValue) {
  if (!rawValue) {
    return {
      reviewDecision: null,
      reviewUpdatedAt: null,
      reviewedByUserId: null,
      reviewedByName: null,
      nameMismatchFlag: false
    };
  }

  if (typeof rawValue === "object") {
    return {
      reviewDecision: rawValue.reviewDecision || null,
      reviewUpdatedAt: rawValue.reviewUpdatedAt || null,
      reviewedByUserId: rawValue.reviewedByUserId || null,
      reviewedByName: rawValue.reviewedByName || null,
      nameMismatchFlag: Boolean(rawValue.nameMismatchFlag)
    };
  }

  try {
    const parsed = JSON.parse(String(rawValue));
    return {
      reviewDecision: parsed.reviewDecision || null,
      reviewUpdatedAt: parsed.reviewUpdatedAt || null,
      reviewedByUserId: parsed.reviewedByUserId || null,
      reviewedByName: parsed.reviewedByName || null,
      nameMismatchFlag: Boolean(parsed.nameMismatchFlag)
    };
  } catch {
    return {
      reviewDecision: null,
      reviewUpdatedAt: null,
      reviewedByUserId: null,
      reviewedByName: null,
      nameMismatchFlag: false
    };
  }
}

function normalizeApplicationDecision(application) {
  const reviewerMeta = parseReviewerMetadata(application.reviewerNotes);
  if (reviewerMeta.reviewDecision) {
    return reviewerMeta.reviewDecision;
  }

  switch (application.eligibilityStatus) {
    case "eligible":
      return "qualified";
    case "ineligible":
      return "disqualified";
    case "requires_review":
      return "pending";
    default:
      return "not_reviewed";
  }
}

async function createReviewerNameLookup(config, repositories) {
  const lookup = new Map((config?.auth?.devTokens || []).map((item) => [String(item.userId), item.fullName]));

  if (repositories?.auth?.listUsers) {
    const users = await repositories.auth.listUsers();
    for (const user of users) {
      if (user?.id && user?.fullName) {
        lookup.set(String(user.id), user.fullName);
      }
    }
  }

  return lookup;
}

async function countAwaitingRecommendedStudents(repositories) {
  const items = await repositories.waitlist.list({
    status: "awaiting_support"
  });
  return items.length;
}

async function buildFoodBankSupportSummary(repositories, currentAcademicYearLabel) {
  if (!repositories.foodBank) {
    return null;
  }

  const records = await repositories.foodBank.list({});
  const hydrated = await Promise.all(
    records.map(async (item) => {
      const student = item?.studentId ? await repositories.students.getById(item.studentId) : null;
      return {
        ...item,
        college: student?.college || "Unknown / not captured"
      };
    })
  );

  const sortedYearLabels = [...new Set(hydrated.map((item) => item.academicYearLabel).filter(Boolean))].sort(
    (left, right) => getAcademicYearStart(right) - getAcademicYearStart(left)
  );
  const resolvedCurrentYearLabel =
    normalizeAcademicYearLabel(currentAcademicYearLabel) || sortedYearLabels[0] || "Current Academic Year";

  const summarizeYear = (yearLabel) => {
    const items = hydrated.filter(
      (item) => normalizeAcademicYearLabel(item.academicYearLabel) === normalizeAcademicYearLabel(yearLabel)
    );
    const supportTypeCounts = {
      foodSupport: 0,
      clothingSupport: 0,
      both: 0
    };
    const collegeMap = new Map();
    for (const item of items) {
      const key = item.college || "Unknown / not captured";
      const existing =
        collegeMap.get(key) || {
          college: key,
          servedCount: 0,
          registeredCount: 0
        };
      existing.registeredCount += 1;
      if (String(item.status) === "served") {
        existing.servedCount += 1;
      }
      collegeMap.set(key, existing);

      const supportTypes = Array.isArray(item.supportTypes) ? item.supportTypes : [];
      const hasFood = supportTypes.includes("food_support");
      const hasClothing = supportTypes.includes("clothing_support");
      if (hasFood) supportTypeCounts.foodSupport += 1;
      if (hasClothing) supportTypeCounts.clothingSupport += 1;
      if (hasFood && hasClothing) supportTypeCounts.both += 1;
    }

    return {
      label: yearLabel,
      totalRegistered: items.length,
      totalServed: items.filter((item) => String(item.status) === "served").length,
      collegesRepresentedCount: new Set(items.map((item) => item.college).filter(Boolean)).size,
      collegeBreakdown: [...collegeMap.values()].sort(
        (left, right) => right.servedCount - left.servedCount || right.registeredCount - left.registeredCount
      ),
      supportTypeCounts
    };
  };

  return {
    currentYearLabel: resolvedCurrentYearLabel,
    currentYear: summarizeYear(resolvedCurrentYearLabel),
    previousYears: sortedYearLabels
      .filter(
        (item) => normalizeAcademicYearLabel(item) !== normalizeAcademicYearLabel(resolvedCurrentYearLabel)
      )
      .map((item) => summarizeYear(item))
  };
}

async function buildSampleDashboard(config, repositories) {
  const activeSchemes = schemes.filter((item) => (item.status || "active") === "active");
  const activeSchemeIds = new Set(activeSchemes.map((item) => item.id));
  const activeApplications = applications.filter((item) => activeSchemeIds.has(item.schemeId));
  const reviewerNames = await createReviewerNameLookup(config, repositories);
  const awaitingRecommendedCount = await countAwaitingRecommendedStudents(repositories);

  const metrics = {
    totalApplications: activeApplications.length,
    qualified: 0,
    pending: 0,
    disqualified: 0,
    notReviewed: 0,
    totalSchemes: activeSchemes.length,
    activeAcademicYears: new Set(
      activeSchemes.map((item) => item.academicYearLabel || item.cycle || item.cycleId).filter(Boolean)
    ).size,
    waitlistSize: awaitingRecommendedCount
  };

  const schemeProgress = activeSchemes.map((scheme) => {
    const schemeApplications = activeApplications.filter((item) => item.schemeId === scheme.id);
    const summary = {
      totalCount: schemeApplications.length,
      reviewedCount: 0,
      qualifiedCount: 0,
      pendingCount: 0,
      disqualifiedCount: 0,
      notReviewedCount: 0
    };

    for (const application of schemeApplications) {
      const decision = normalizeApplicationDecision(application);
      if (decision === "qualified") {
        summary.qualifiedCount += 1;
        summary.reviewedCount += 1;
        metrics.qualified += 1;
      } else if (decision === "pending") {
        summary.pendingCount += 1;
        summary.reviewedCount += 1;
        metrics.pending += 1;
      } else if (decision === "disqualified") {
        summary.disqualifiedCount += 1;
        summary.reviewedCount += 1;
        metrics.disqualified += 1;
      } else {
        summary.notReviewedCount += 1;
        metrics.notReviewed += 1;
      }
    }

    return {
      schemeId: scheme.id,
      schemeName: scheme.name,
      cycleId: scheme.cycleId || null,
      academicYearLabel: scheme.academicYearLabel || scheme.cycle || "",
      ...summary,
      reviewPercentage:
        summary.totalCount > 0 ? Math.round((summary.reviewedCount / summary.totalCount) * 100) : 0
    };
  });

  const criteriaKeys = new Set(
    applicationCriteria.map((item) => `${item.schemeId || ""}:${item.cycleId || ""}`)
  );
  const schemesWithoutCriteria = activeSchemes.filter(
    (item) => !criteriaKeys.has(`${item.id || ""}:${item.cycleId || ""}`)
  ).length;

  const nameMismatchCount = activeApplications.filter((item) =>
    parseReviewerMetadata(item.reviewerNotes).nameMismatchFlag
  ).length;

  const pendingActions = {
    applicationsAwaitingReview: metrics.notReviewed,
    unresolvedRejectedRowCorrections: 0,
    nameMismatchFlags: nameMismatchCount,
    schemesWithoutCriteria
  };

  const recentActivity = activeApplications
    .flatMap((application) => {
      const meta = parseReviewerMetadata(application.reviewerNotes);
      const student = students.find((item) => item.id === application.studentId);
      const scheme = schemes.find((item) => item.id === application.schemeId);
      const baseDetail = [scheme?.name || "Unknown scheme", application.cycle || ""]
        .filter(Boolean)
        .join(" | ");

      const rows = [
        {
          id: `application-created-${application.id}`,
          type: "application_uploaded",
          title: `Application added for ${student?.fullName || "Unknown student"}`,
          detail: baseDetail,
          timestamp: application.submittedAt || null,
          actorName: reviewerNames.get(application.createdBy) || application.createdBy || "System",
          schemeId: application.schemeId,
          cycleId: application.cycleId,
          qualificationStatus: null
        }
      ];

      if (meta.reviewDecision && meta.reviewUpdatedAt) {
        rows.push({
          id: `application-review-${application.id}`,
          type: "decision_made",
          title: `${student?.fullName || "Unknown student"} marked ${meta.reviewDecision}`,
          detail: baseDetail,
          timestamp: meta.reviewUpdatedAt,
          actorName: meta.reviewedByName || reviewerNames.get(meta.reviewedByUserId) || "Reviewer",
          schemeId: application.schemeId,
          cycleId: application.cycleId,
          qualificationStatus: meta.reviewDecision
        });
      }

      return rows;
    })
    .sort((left, right) => new Date(right.timestamp || 0) - new Date(left.timestamp || 0))
    .slice(0, 10);

  const reviewerLeaderboardMap = new Map();
  for (const application of activeApplications) {
    const meta = parseReviewerMetadata(application.reviewerNotes);
    if (!meta.reviewDecision) continue;

    const isRecommendationIntake =
      String(application.recommendationStatus || "").trim().toLowerCase() === "recommended_student";
    const reviewerId =
      meta.reviewedByUserId ||
      application.createdBy ||
      (isRecommendationIntake ? "recommended-students" : null) ||
      "unknown-reviewer";
    const reviewerName =
      meta.reviewedByName ||
      reviewerNames.get(reviewerId) ||
      (isRecommendationIntake ? "Recommended Students" : null) ||
      reviewerId ||
      "Unknown reviewer";
    const existing =
      reviewerLeaderboardMap.get(reviewerId) ||
      {
        reviewerId,
        reviewerName,
        decisionCount: 0,
        qualifiedCount: 0,
        pendingCount: 0,
        disqualifiedCount: 0,
        lastDecisionAt: null
      };

    existing.decisionCount += 1;
    if (meta.reviewDecision === "qualified") existing.qualifiedCount += 1;
    if (meta.reviewDecision === "pending") existing.pendingCount += 1;
    if (meta.reviewDecision === "disqualified") existing.disqualifiedCount += 1;
    if (!existing.lastDecisionAt || new Date(meta.reviewUpdatedAt) > new Date(existing.lastDecisionAt)) {
      existing.lastDecisionAt = meta.reviewUpdatedAt;
    }

    reviewerLeaderboardMap.set(reviewerId, existing);
  }

  const reviewerLeaderboard = [...reviewerLeaderboardMap.values()].sort((left, right) => {
    if (right.decisionCount !== left.decisionCount) {
      return right.decisionCount - left.decisionCount;
    }
    return new Date(right.lastDecisionAt || 0) - new Date(left.lastDecisionAt || 0);
  });

  return {
    metrics,
    schemeProgress,
    recentActivity,
    pendingActions,
    reviewerLeaderboard
  };
}

async function buildDatabaseDashboard({ repositories, database, config }) {
  const [allSchemes, waitlistedEntries] = await Promise.all([
    repositories.schemes.list(),
    repositories.waitlist.list({ status: "awaiting_support" })
  ]);

  const activeSchemes = allSchemes.filter((item) => (item.status || "").toLowerCase() === "active");
  const schemeProgress = await Promise.all(
    activeSchemes.map(async (scheme) => {
      const summary = await repositories.applications.summary({
        schemeId: scheme.id
      });
      const totalApplications = Number(summary.totalApplications || summary.totalCount || 0);
      const reviewedCount = Number(summary.reviewedCount || 0);

      return {
        schemeId: scheme.id,
        schemeName: scheme.name,
        cycleId: scheme.cycleId || null,
        academicYearLabel: scheme.academicYearLabel || "",
        totalCount: totalApplications,
        reviewedCount,
        qualifiedCount: Number(summary.qualifiedCount || 0),
        pendingCount: Number(summary.pendingCount || 0),
        disqualifiedCount: Number(summary.disqualifiedCount || 0),
        notReviewedCount: Number(summary.notReviewedCount || 0),
        reviewPercentage:
          totalApplications > 0
            ? Math.round((reviewedCount / totalApplications) * 100)
            : 0
      };
    })
  );

  const metrics = schemeProgress.reduce(
    (accumulator, item) => {
      accumulator.totalApplications += item.totalCount;
      accumulator.qualified += item.qualifiedCount;
      accumulator.pending += item.pendingCount;
      accumulator.disqualified += item.disqualifiedCount;
      accumulator.notReviewed += item.notReviewedCount;
      return accumulator;
    },
    {
      totalApplications: 0,
      qualified: 0,
      pending: 0,
      disqualified: 0,
      notReviewed: 0,
      totalSchemes: activeSchemes.length,
      activeAcademicYears: new Set(
        activeSchemes.map((item) => item.academicYearLabel || item.cycleId).filter(Boolean)
      ).size,
      waitlistSize: waitlistedEntries.length
    }
  );

  const [nameMismatchResult, reviewerLeaderboardResult, recentDecisionResult, recentUploadResult, recentSchemeResult] =
    await Promise.all([
      database.query(`
        SELECT COUNT(*)::int AS count
        FROM applications a
        WHERE a.reviewer_notes IS NOT NULL
          AND a.reviewer_notes ~ '^\\s*\\{'
          AND COALESCE((a.reviewer_notes::jsonb ->> 'nameMismatchFlag')::boolean, FALSE) = TRUE
      `),
      database.query(`
          SELECT
            COALESCE(
              NULLIF(a.reviewer_notes::jsonb ->> 'reviewedByUserId', ''),
              a.created_by::text,
              CASE
                WHEN LOWER(COALESCE(NULLIF(a.reviewer_notes::jsonb ->> 'reviewReason', ''), '')) = 'recommended student intake' THEN 'recommended-students'
                ELSE NULL
              END
            ) AS reviewer_id,
            COALESCE(
              NULLIF(a.reviewer_notes::jsonb ->> 'reviewedByName', ''),
              CASE
                WHEN LOWER(COALESCE(NULLIF(a.reviewer_notes::jsonb ->> 'reviewReason', ''), '')) = 'recommended student intake' THEN 'Recommended Students'
                ELSE ''
              END
            ) AS reviewer_name,
          COUNT(*)::int AS decision_count,
          COUNT(*) FILTER (WHERE (a.reviewer_notes::jsonb ->> 'reviewDecision') = 'qualified')::int AS qualified_count,
          COUNT(*) FILTER (WHERE (a.reviewer_notes::jsonb ->> 'reviewDecision') = 'pending')::int AS pending_count,
          COUNT(*) FILTER (WHERE (a.reviewer_notes::jsonb ->> 'reviewDecision') = 'disqualified')::int AS disqualified_count,
          MAX(COALESCE(NULLIF(a.reviewer_notes::jsonb ->> 'reviewUpdatedAt', '')::timestamptz, a.updated_at)) AS last_decision_at
        FROM applications a
        WHERE a.reviewer_notes IS NOT NULL
          AND a.reviewer_notes ~ '^\\s*\\{'
          AND NULLIF(a.reviewer_notes::jsonb ->> 'reviewDecision', '') IS NOT NULL
        GROUP BY 1, 2
        ORDER BY decision_count DESC, last_decision_at DESC
        LIMIT 10
      `),
      database.query(`
        SELECT
          a.id::text AS application_id,
          student.full_name AS student_name,
          scheme.name AS scheme_name,
          cycle.academic_year_label,
          a.scheme_id::text AS scheme_id,
          a.cycle_id::text AS cycle_id,
          identifier.identifier_value AS student_reference_id,
          a.reviewer_notes::jsonb ->> 'reviewDecision' AS review_decision,
          COALESCE(
            NULLIF(a.reviewer_notes::jsonb ->> 'reviewedByName', ''),
            CASE
              WHEN LOWER(COALESCE(NULLIF(a.reviewer_notes::jsonb ->> 'reviewReason', ''), '')) = 'recommended student intake' THEN 'Recommended Students'
              ELSE ''
            END
          ) AS reviewer_name,
            COALESCE(
              NULLIF(a.reviewer_notes::jsonb ->> 'reviewedByUserId', ''),
              a.created_by::text,
              CASE
                WHEN LOWER(COALESCE(NULLIF(a.reviewer_notes::jsonb ->> 'reviewReason', ''), '')) = 'recommended student intake' THEN 'recommended-students'
                ELSE NULL
              END
            ) AS reviewer_id,
            COALESCE(NULLIF(a.reviewer_notes::jsonb ->> 'reviewUpdatedAt', '')::timestamptz, a.updated_at) AS activity_at
        FROM applications a
        INNER JOIN students student ON student.id = a.student_id
        LEFT JOIN schemes scheme ON scheme.id = a.scheme_id
        LEFT JOIN application_cycles cycle ON cycle.id = a.cycle_id
        LEFT JOIN student_identifiers identifier
          ON identifier.student_id = student.id
          AND identifier.identifier_type = 'student_reference_id'
          AND identifier.is_primary = TRUE
        WHERE a.reviewer_notes IS NOT NULL
          AND a.reviewer_notes ~ '^\\s*\\{'
          AND NULLIF(a.reviewer_notes::jsonb ->> 'reviewDecision', '') IS NOT NULL
        ORDER BY activity_at DESC
        LIMIT 8
      `),
      database.query(`
        SELECT
          a.id::text AS application_id,
          student.full_name AS student_name,
          scheme.name AS scheme_name,
          cycle.academic_year_label,
          a.scheme_id::text AS scheme_id,
          a.cycle_id::text AS cycle_id,
          identifier.identifier_value AS student_reference_id,
          a.created_at AS activity_at,
          a.created_by
        FROM applications a
        INNER JOIN students student ON student.id = a.student_id
        LEFT JOIN schemes scheme ON scheme.id = a.scheme_id
        LEFT JOIN application_cycles cycle ON cycle.id = a.cycle_id
        LEFT JOIN student_identifiers identifier
          ON identifier.student_id = student.id
          AND identifier.identifier_type = 'student_reference_id'
          AND identifier.is_primary = TRUE
        ORDER BY a.created_at DESC
        LIMIT 8
      `),
      database.query(`
        SELECT
          s.id::text AS scheme_id,
          s.name AS scheme_name,
          s.status,
          COALESCE(s.updated_at, s.created_at) AS activity_at,
          cycle.academic_year_label
        FROM schemes s
        LEFT JOIN scheme_academic_years assignment ON assignment.scheme_id = s.id
        LEFT JOIN application_cycles cycle ON cycle.id = assignment.cycle_id
        ORDER BY COALESCE(s.updated_at, s.created_at) DESC
        LIMIT 6
      `)
    ]);

  const reviewerNames = await createReviewerNameLookup(config, repositories);
  const criteriaChecks = await Promise.all(
    activeSchemes.map(async (scheme) => ({
      schemeId: scheme.id,
      hasCriteria: Boolean(await repositories.applicationCriteria.getBySchemeCycle(scheme.id, scheme.cycleId || ""))
    }))
  );

  const pendingActions = {
    applicationsAwaitingReview: metrics.notReviewed,
    unresolvedRejectedRowCorrections: 0,
    nameMismatchFlags: Number(nameMismatchResult.rows[0]?.count || 0),
    schemesWithoutCriteria: criteriaChecks.filter((item) => !item.hasCriteria).length
  };

  const recentActivity = [
    ...recentDecisionResult.rows.map((row) => ({
      id: `decision-${row.application_id}`,
      type: "decision_made",
      title: `${row.student_name || "Unknown student"} marked ${row.review_decision || "reviewed"}`,
      detail: [row.scheme_name || "Unknown scheme", row.academic_year_label || ""]
        .filter(Boolean)
        .join(" | "),
      timestamp: row.activity_at,
      actorName:
        row.reviewer_name ||
        reviewerNames.get(row.reviewer_id) ||
        (row.reviewer_id === "recommended-students" ? "Recommended Students" : null) ||
        row.reviewer_id ||
        "Reviewer",
      schemeId: row.scheme_id,
      cycleId: row.cycle_id,
      studentReferenceId: row.student_reference_id,
      qualificationStatus: row.review_decision || null
    })),
    ...recentUploadResult.rows.map((row) => ({
      id: `upload-${row.application_id}`,
      type: "application_uploaded",
      title: `Application added for ${row.student_name || "Unknown student"}`,
      detail: [row.scheme_name || "Unknown scheme", row.academic_year_label || ""]
        .filter(Boolean)
        .join(" | "),
      timestamp: row.activity_at,
      actorName: reviewerNames.get(row.created_by) || row.created_by || "System",
      schemeId: row.scheme_id,
      cycleId: row.cycle_id,
      studentReferenceId: row.student_reference_id,
      qualificationStatus: null
    })),
    ...recentSchemeResult.rows.map((row) => ({
      id: `scheme-${row.scheme_id}-${row.activity_at}`,
      type: "scheme_updated",
      title: `Scheme updated: ${row.scheme_name}`,
      detail: [row.academic_year_label || "", row.status || "active"].filter(Boolean).join(" | "),
      timestamp: row.activity_at,
      actorName: "Admin",
      schemeId: row.scheme_id,
      cycleId: null,
      studentReferenceId: null,
      qualificationStatus: null
    }))
  ]
    .sort((left, right) => new Date(right.timestamp || 0) - new Date(left.timestamp || 0))
    .slice(0, 12);

  const reviewerLeaderboard = reviewerLeaderboardResult.rows.map((row) => ({
    reviewerId: row.reviewer_id || "unknown-reviewer",
    reviewerName:
      row.reviewer_name ||
      reviewerNames.get(row.reviewer_id) ||
      (row.reviewer_id === "recommended-students" ? "Recommended Students" : null) ||
      row.reviewer_id ||
      "Unknown reviewer",
    decisionCount: Number(row.decision_count || 0),
    qualifiedCount: Number(row.qualified_count || 0),
    pendingCount: Number(row.pending_count || 0),
    disqualifiedCount: Number(row.disqualified_count || 0),
    lastDecisionAt: row.last_decision_at || null
  }));

  return {
    metrics,
    schemeProgress: schemeProgress.sort((left, right) => left.schemeName.localeCompare(right.schemeName)),
    recentActivity,
    pendingActions,
    reviewerLeaderboard
  };
}

export function createReportService({ repositories, database, config }) {
  async function buildBeneficiarySummaryReport() {
    const currentYearLabel = await resolveCurrentBeneficiaryYearLabel(repositories);
    const [dashboardSummary, filterOptions, foodBankSupport] = await Promise.all([
      repositories.beneficiaries.getDashboardData({
        currentYearLabel
      }),
      repositories.beneficiaries.listFilterOptions(),
      buildFoodBankSupportSummary(repositories, currentYearLabel)
    ]);

    return {
      filterOptions,
      summary: {
        currentYearLabel: dashboardSummary.currentYearLabel,
        currentYear: dashboardSummary.currentYear,
        yearComparison: [
          {
            label: dashboardSummary.currentYearLabel,
            ...dashboardSummary.currentYear
          },
          ...(dashboardSummary.previousYears || [])
        ],
        currentYearSchemeBreakdown: dashboardSummary.currentYear?.sponsorDistribution || [],
        currentYearCollegeBreakdown: dashboardSummary.currentYear?.collegeDistribution || []
      },
      foodBankSupport: foodBankSupport || null
    };
  }

  return {
    async getOverview() {
      if (!database.enabled) {
        const currentBeneficiaryYearLabel = await resolveCurrentBeneficiaryYearLabel(repositories);
        const beneficiarySupport = await repositories.beneficiaries.getDashboardData({
          currentYearLabel: currentBeneficiaryYearLabel
        });
        const recommendedStudentsCount = await countAwaitingRecommendedStudents(repositories);
        const foodBankSummary = await buildFoodBankSupportSummary(
          repositories,
          currentBeneficiaryYearLabel
        );
        return {
          totalStudents: students.length,
          totalSchemes: schemes.length,
          totalApplications: applications.length,
          totalWaitlisted: recommendedStudentsCount,
          totalActiveAwards: awards.filter((item) => item.status === "active").length,
          pendingPayments: payments.filter((item) => item.status === "pending").length,
          completedPayments: payments.filter((item) => item.status === "completed").length,
          beneficiarySupport,
          foodBankSupport: foodBankSummary || null
        };
      }

      const [
        studentResult,
        schemeResult,
        applicationResult,
        activeAwardResult,
        pendingPaymentsResult,
        completedPaymentsResult,
        recommendedStudentsCount
      ] = await Promise.all([
        database.query("SELECT COUNT(*)::INT AS count FROM students"),
        database.query("SELECT COUNT(*)::INT AS count FROM schemes"),
        database.query("SELECT COUNT(*)::INT AS count FROM applications"),
        database.query("SELECT COUNT(*)::INT AS count FROM awards WHERE status = 'active'"),
        database.query("SELECT COUNT(*)::INT AS count FROM payments WHERE status = 'pending'"),
        database.query("SELECT COUNT(*)::INT AS count FROM payments WHERE status = 'completed'"),
        countAwaitingRecommendedStudents(repositories)
      ]);

      const currentBeneficiaryYearLabel = await resolveCurrentBeneficiaryYearLabel(repositories);
      const beneficiarySupport = await repositories.beneficiaries.getDashboardData({
        currentYearLabel: currentBeneficiaryYearLabel
      });
      const foodBankSupport = await buildFoodBankSupportSummary(
        repositories,
        currentBeneficiaryYearLabel
      );
      return {
        totalStudents: studentResult.rows[0].count,
        totalSchemes: schemeResult.rows[0].count,
        totalApplications: applicationResult.rows[0].count,
        totalWaitlisted: recommendedStudentsCount,
        totalActiveAwards: activeAwardResult.rows[0].count,
        pendingPayments: pendingPaymentsResult.rows[0].count,
        completedPayments: completedPaymentsResult.rows[0].count,
        beneficiarySupport,
        foodBankSupport: foodBankSupport || null
      };
    },
    async getDashboard() {
      if (!database.enabled) {
        const dashboard = await buildSampleDashboard(config, repositories);
        dashboard.beneficiarySupport = await repositories.beneficiaries.getDashboardData({
          currentYearLabel: await resolveCurrentBeneficiaryYearLabel(repositories)
        });
        return dashboard;
      }

      const dashboard = await buildDatabaseDashboard({ repositories, database, config });
      dashboard.beneficiarySupport = await repositories.beneficiaries.getDashboardData({
        currentYearLabel: await resolveCurrentBeneficiaryYearLabel(repositories)
      });
      return dashboard;
    },
    async getBeneficiarySchemeReport(filters = {}) {
      const academicYearLabel = String(filters.academicYearLabel || "").trim();
      const schemeName = String(filters.schemeName || "").trim();
      const filterOptions = await repositories.beneficiaries.listFilterOptions();

      if (!academicYearLabel || !schemeName) {
        return {
          filterOptions,
          report: null
        };
      }

      return {
        filterOptions,
        report: await repositories.beneficiaries.getSchemeReport({
          academicYearLabel,
          schemeName
        })
      };
    },
    async getBeneficiarySummaryReport() {
      return buildBeneficiarySummaryReport();
    },
    async exportBeneficiarySummaryReport(actor) {
      const report = await buildBeneficiarySummaryReport();
      const buildBeneficiarySummaryExportWorkbook =
        await loadBeneficiarySummaryExportWorkbookFactory();

      return buildBeneficiarySummaryExportWorkbook({
        report,
        generatedBy: actor?.fullName || actor?.userId || "System"
      });
    },
    async exportBeneficiarySchemeReport(filters = {}, actor) {
      const academicYearLabel = String(filters.academicYearLabel || "").trim();
      const schemeName = String(filters.schemeName || "").trim();
      if (!academicYearLabel) {
        throw new ValidationError("Choose the academic year for the beneficiary scheme export.");
      }
      if (!schemeName) {
        throw new ValidationError("Choose the support name for the beneficiary scheme export.");
      }

      const report = await repositories.beneficiaries.getSchemeReport({
        academicYearLabel,
        schemeName
      });
      if (!report?.items?.length) {
        throw new ValidationError("No beneficiary records were found for that scheme and academic year.");
      }

      const buildBeneficiarySchemeExportWorkbook =
        await loadBeneficiarySchemeExportWorkbookFactory();

      return buildBeneficiarySchemeExportWorkbook({
        report,
        generatedBy: actor?.fullName || actor?.userId || "System"
      });
    }
  };
}
