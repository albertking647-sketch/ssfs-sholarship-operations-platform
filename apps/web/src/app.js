import {
  deriveDefaultApiUrl,
  getSanitizedLoginUrl,
  shouldUseStoredApiUrl
} from "./network.js";

import {
  getVisibleModulesForRole,
  resolveModuleForRole
} from "./roleAccess.js";
import {
  readStoredAuthTokenFromStorages,
  writeStoredAuthTokenToStorages
} from "./authSession.js";
import {
  buildAccessShellState,
  shouldAttemptSessionRestore
} from "./accessShellState.js";
import {
  isAuthenticationSessionErrorMessage,
  resolveSessionFailurePolicy
} from "./sessionFailurePolicy.js";
import { focusApplicationReviewSearch } from "./applicationReviewNavigation.js";

const STORAGE_KEY = "sop-theme";

const DASHBOARD_REJECTED_ROWS_KEY = "ssfs-dashboard-unresolved-application-issues";
const ACTIVE_MODULE_KEY = "ssfs-active-module";
const ACTIVE_REGISTRY_SECTION_KEY = "ssfs-active-registry-section";
const ACTIVE_APPLICATIONS_SECTION_KEY = "ssfs-active-applications-section";
const ACTIVE_BENEFICIARY_SECTION_KEY = "ssfs-active-beneficiary-section";
const DASHBOARD_ACTIVITY_HIDDEN_KEY = "ssfs-dashboard-activity-hidden";
const DASHBOARD_BENEFICIARY_HISTORICAL_HIDDEN_KEY =
  "ssfs-dashboard-beneficiary-historical-hidden";
const APPLICATION_CWA_COVERAGE_HIDDEN_KEY = "ssfs-application-cwa-coverage-hidden";
const APPLICATION_BULK_INTERVIEW_HIDDEN_KEY = "ssfs-application-bulk-interview-hidden";
const APPLICATION_REVIEW_RESULTS_HIDDEN_KEY = "ssfs-application-review-results-hidden";
const API_URL_KEY = "ssfs-api-url";
const AUTH_USERNAME_KEY = "ssfs-auth-username";
const DEFAULT_API_URL = deriveDefaultApiUrl(globalThis.location, "http://127.0.0.1:4400");

const MODULE_META = {
  dashboard: {
    title: "Dashboard",
    description:
      "This landing page brings together live application metrics, review momentum, pending actions, and operational activity."
  },
  registry: {
    title: "Student Registry",
    description:
      "The registry is now the first working module. Import files, preview row quality, and build a clean student database."
  },
  applications: {
    title: "Applications",
    description:
      "This module will handle application intake, eligibility checks, weighted scoring, and shortlist preparation."
  },
  waitlist: {
    title: "Recommended Students",
    description:
      "This module will manage students who approach SSFS for support and later get recommended into suitable schemes."
  },
  awards: {
    title: "Beneficiaries & Support",
    description:
      "This module will manage beneficiary lists, paid support records, and historical beneficiary imports."
  },
  support: {
    title: "Food & Clothing Support",
    description:
      "This module now focuses on food and clothing support registration, counselor-list intake, served-status tracking, and registry-backed student confirmation."
  },
  reports: {
    title: "Reports",
    description:
      "This module will bring together management dashboards, donor summaries, and audit-ready exports."
  }
};

const APPLICATION_REVIEW_REASONS = {
  qualified: [
    "All required checks completed",
    "Meets academic and document requirements",
    "Approved after reviewer assessment"
  ],
  disqualified: [
    "Did not meet WASSCE cut-off",
    "Did not meet CWA cut-off",
    "Required admission letter not provided",
    "Required results slip not provided",
    "Required application form not provided",
    "Required statement of need not provided",
    "Incomplete required documents",
    "Could not verify student record against registry",
    "Duplicate application for the same scheme and academic year",
    "Already benefiting from a conflicting scholarship",
    "Failed eligibility checks",
    "Other disqualification reason"
  ],
  pending: [
    "Awaiting admission letter",
    "Awaiting results slip",
    "Awaiting completed application form",
    "Awaiting statement of need",
    "Awaiting document verification",
    "Awaiting academic record confirmation",
    "Awaiting interview outcome",
    "Awaiting committee review",
    "Possible registry name mismatch requires review",
    "Possible duplicate record requires review",
    "Other pending review reason"
  ]
};

const EMPTY_BENEFICIARY_DASHBOARD = {
  currentYearLabel: "Current Academic Year",
  currentYear: {
    totalBeneficiaries: 0,
    totalAmountPaidLabel: "GHS 0",
    currencyTotals: [{ currency: "GHS", amount: 0, amountLabel: "GHS 0" }],
    importedListsCount: 0,
    waitlistPromotions: 0,
    cohortCounts: {
      current: 0,
      new: 0,
      untagged: 0,
      carriedForward: 0
    },
    collegeTaggedCount: 0,
    collegesRepresentedCount: 0,
    supportMix: [],
    sponsorDistribution: [],
    collegeDistribution: []
  },
  previousYears: []
};

const state = {
  theme: safeLocalStorageGet(STORAGE_KEY, "light") || "light",
  activeModule: safeLocalStorageGet(ACTIVE_MODULE_KEY, "dashboard") || "dashboard",
  activeSection: safeLocalStorageGet(ACTIVE_REGISTRY_SECTION_KEY, "import") || "import",
  activeApplicationsSection:
    safeLocalStorageGet(ACTIVE_APPLICATIONS_SECTION_KEY, "import") || "import",
  activeBeneficiarySection:
    safeLocalStorageGet(ACTIVE_BENEFICIARY_SECTION_KEY, "imports") || "imports",
  reportsOverview: null,
  reportsBeneficiarySummary: null,
  reportsBeneficiarySchemeReport: null,
  beneficiaryPreview: null,
  beneficiaryPreviewFilter: "all",
  beneficiaryDuplicateStrategy: "skip",
  beneficiaryDuplicateRowActions: {},
  lastBeneficiaryImport: null,
  beneficiaryImportHistory: [],
  beneficiaryFilterOptions: {
    academicYears: [],
    schemeNames: [],
    colleges: []
  },
  beneficiaryRecords: [],
  beneficiaryEditingRecordId: null,
  beneficiaryRecordHistory: null,
  beneficiaryAuditFeed: [],
  recommendedPreview: null,
  lastRecommendedImport: null,
  recommendedRecords: [],
  recommendedEditingRecordId: null,
  recommendedManualPreview: null,
  recommendedFilterOptions: {
    academicYears: [],
    schemeNames: [],
    statuses: []
  },
  recommendedSummary: {
    total: 0,
    awaitingSupport: 0,
    supported: 0,
    linkedApplications: 0,
    linkedBeneficiaries: 0
  },
  recommendedSelectedRecordId: null,
  supportFoodBankManualPreview: null,
  supportFoodBankEditingRecordId: null,
  supportFoodBankPreview: null,
  lastSupportFoodBankImport: null,
  supportFoodBankRecords: [],
  supportFoodBankFilterOptions: {
    academicYears: [],
    statuses: []
  },
  supportFoodBankSummary: {
    total: 0,
    registered: 0,
    served: 0,
    supportTypeCounts: {
      foodSupport: 0,
      clothingSupport: 0,
      both: 0
    }
  },
  preview: null,
  lastImport: null,
  duplicateResolutions: {},
  applicationPreview: null,
  lastApplicationsImport: null,
  applicationInterviewPreview: null,
  lastApplicationInterviewImport: null,
  applicationMessagingPreview: null,
  applicationMessagingHistory: [],
  applicationMessagingChannel: "email",
  applicationMessagingSenderEmail: "",
  applicationMessagingSenderPhone: "",
  applicationMessagingSenderWhatsApp: "",
  applicationMessagingSendingEnabled: false,
  applicationMessagingSmsEnabled: false,
  applicationMessagingWhatsAppEnabled: false,
  applicationMessagingProvider: "",
  applicationMessagingDraftSubject: "",
  applicationMessagingDraftBody: "",
  applicationMessagingRecipientEdits: {},
  applicationAuditHistory: [],
  applicationIssueQueue: [],
  resolvedApplicationIssueRows: {},
  schemes: [],
  cycles: [],
  applicationsList: [],
  applicationReviewResults: [],
  applicationReviewSummary: {
    totalApplications: 0,
    reviewedCount: 0,
    qualifiedCount: 0,
    pendingCount: 0,
    disqualifiedCount: 0,
    notReviewedCount: 0
  },
  applicationCwaCoverage: {
    summary: {
      totalApplications: 0,
      matchedCwaCount: 0,
      missingCwaCount: 0,
      coveragePercentage: 0
    },
    missingItems: [],
    totalMissingItems: 0,
    returnedMissingItems: 0,
    missingItemsTruncated: false
  },
  applicationCriteria: null,
  applicationReviewCriteria: null,
  editingSchemeId: null,
  schemePanelHidden: false,
  criteriaPanelHidden: false,
  applicationsRegistryHidden: false,
  applicationReviewHidden: false,
  applicationReviewResultsHidden:
    safeLocalStorageGet(APPLICATION_REVIEW_RESULTS_HIDDEN_KEY, "false") === "true",
  applicationBulkInterviewHidden:
    safeLocalStorageGet(APPLICATION_BULK_INTERVIEW_HIDDEN_KEY, "false") === "true",
  applicationCwaCoverageHidden:
    safeLocalStorageGet(APPLICATION_CWA_COVERAGE_HIDDEN_KEY, "false") === "true",
  dashboardActivityHidden:
    safeLocalStorageGet(DASHBOARD_ACTIVITY_HIDDEN_KEY, "false") === "true",
  dashboardBeneficiaryHistoricalHidden:
    safeLocalStorageGet(DASHBOARD_BENEFICIARY_HISTORICAL_HIDDEN_KEY, "true") !== "false",
  selectedApplicationId: null,
  selectedApplicationIssueRowNumber: null,
  singleApplicationMatch: null,
  issueApplicationMatch: null,
  academicHistoryPreview: null,
  lastAcademicHistoryImport: null,
  academicHistoryList: [],
  session: null,
  sessionRestorePending: false,
  accessUsers: [],
  dashboard: null,
  searchResults: [],
  selectedStudent: null,
  flaggedResults: [],
  selectedFlaggedStudent: null,
  registryStats: {
    existingRegistryStudents: 0,
    existingAcademicHistoryRecords: 0
  }
};

let recommendedPreviewLookupTimer = null;
let supportFoodBankPreviewLookupTimer = null;

const elements = {
  loginGate: document.querySelector("#loginGate"),
  restoreGate: document.querySelector("#restoreGate"),
  appShell: document.querySelector("#appShell"),
  loginForm: document.querySelector("#loginForm"),
  loginApiUrl: document.querySelector("#loginApiUrl"),
  loginUsername: document.querySelector("#loginUsername"),
  loginPassword: document.querySelector("#loginPassword"),
  loginButton: document.querySelector("#loginButton"),
  loginMessage: document.querySelector("#loginMessage"),
  apiUrl: document.querySelector("#apiUrl"),
  authToken: document.querySelector("#authToken"),
  sessionSummary: document.querySelector("#sessionSummary"),
  logoutButton: document.querySelector("#logoutButton"),
  dashboardMessage: document.querySelector("#dashboardMessage"),
  dashboardMetricCards: document.querySelector("#dashboardMetricCards"),
  dashboardDecisionChart: document.querySelector("#dashboardDecisionChart"),
  dashboardSchemeChart: document.querySelector("#dashboardSchemeChart"),
  dashboardSchemeProgress: document.querySelector("#dashboardSchemeProgress"),
  dashboardAlertsList: document.querySelector("#dashboardAlertsList"),
  dashboardActivityBody: document.querySelector("#dashboardActivityBody"),
  dashboardActivityFeed: document.querySelector("#dashboardActivityFeed"),
  dashboardActivityToggleButton: document.querySelector("#dashboardActivityToggleButton"),
  dashboardReviewerLeaderboard: document.querySelector("#dashboardReviewerLeaderboard"),
  dashboardBeneficiaryMetricCards: document.querySelector("#dashboardBeneficiaryMetricCards"),
  dashboardBeneficiarySupportChart: document.querySelector("#dashboardBeneficiarySupportChart"),
  dashboardBeneficiarySchemeChart: document.querySelector("#dashboardBeneficiarySchemeChart"),
  dashboardBeneficiaryCollegeChart: document.querySelector("#dashboardBeneficiaryCollegeChart"),
  dashboardBeneficiaryHistoricalBody: document.querySelector("#dashboardBeneficiaryHistoricalBody"),
  dashboardBeneficiaryHistoricalYears: document.querySelector("#dashboardBeneficiaryHistoricalYears"),
  dashboardBeneficiaryHistoricalHint: document.querySelector("#dashboardBeneficiaryHistoricalHint"),
  dashboardBeneficiaryHistoricalToggleButton: document.querySelector(
    "#dashboardBeneficiaryHistoricalToggleButton"
  ),
  studentImportMode: document.querySelector("#studentImportMode"),
  importForm: document.querySelector("#importForm"),
  previewButton: document.querySelector("#previewButton"),
  importButton: document.querySelector("#importButton"),
  clearRegistryButton: document.querySelector("#clearRegistryButton"),
  autoResolveDuplicatesButton: document.querySelector("#autoResolveDuplicatesButton"),
  applyDuplicateResolutionButton: document.querySelector("#applyDuplicateResolutionButton"),
  applicationsImportForm: document.querySelector("#applicationsImportForm"),
  applicationSchemeSelect: document.querySelector("#applicationSchemeSelect"),
  applicationCycleSelect: document.querySelector("#applicationCycleSelect"),
  applicationTabButtons: document.querySelectorAll("[data-application-section]"),
  applicationSectionViews: document.querySelectorAll("[data-application-section-view]"),
  beneficiaryTabButtons: document.querySelectorAll("[data-beneficiary-section]"),
  beneficiarySectionViews: document.querySelectorAll("[data-beneficiary-section-view]"),
  beneficiaryImportForm: document.querySelector("#beneficiaryImportForm"),
  beneficiaryFilterForm: document.querySelector("#beneficiaryFilterForm"),
  beneficiaryImportMode: document.querySelector("#beneficiaryImportMode"),
  beneficiaryCohort: document.querySelector("#beneficiaryCohort"),
  beneficiaryImportCurrency: document.querySelector("#beneficiaryImportCurrency"),
  beneficiaryCategorizedByCollege: document.querySelector("#beneficiaryCategorizedByCollege"),
  beneficiaryDuplicateStrategy: document.querySelector("#beneficiaryDuplicateStrategy"),
  beneficiaryFile: document.querySelector("#beneficiaryFile"),
  selectedBeneficiaryFileName: document.querySelector("#selectedBeneficiaryFileName"),
  beneficiaryPreviewButton: document.querySelector("#beneficiaryPreviewButton"),
  beneficiaryImportButton: document.querySelector("#beneficiaryImportButton"),
  beneficiaryImportMessage: document.querySelector("#beneficiaryImportMessage"),
  beneficiarySummaryCards: document.querySelector("#beneficiarySummaryCards"),
  beneficiaryPreviewFilter: document.querySelector("#beneficiaryPreviewFilter"),
  beneficiaryIssueList: document.querySelector("#beneficiaryIssueList"),
  beneficiaryDuplicateReviewMessage: document.querySelector("#beneficiaryDuplicateReviewMessage"),
  beneficiaryDuplicateReviewList: document.querySelector("#beneficiaryDuplicateReviewList"),
  beneficiaryValidRowsTable: document.querySelector("#beneficiaryValidRowsTable"),
  beneficiaryImportResultSummary: document.querySelector("#beneficiaryImportResultSummary"),
  beneficiaryImportedRowsList: document.querySelector("#beneficiaryImportedRowsList"),
  beneficiarySearchQuery: document.querySelector("#beneficiarySearchQuery"),
  beneficiaryAcademicYearFilter: document.querySelector("#beneficiaryAcademicYearFilter"),
  beneficiarySchemeFilter: document.querySelector("#beneficiarySchemeFilter"),
    beneficiaryCollegeFilter: document.querySelector("#beneficiaryCollegeFilter"),
    beneficiarySupportTypeFilter: document.querySelector("#beneficiarySupportTypeFilter"),
    beneficiaryReloadButton: document.querySelector("#beneficiaryReloadButton"),
  beneficiaryClearScopedButton: document.querySelector("#beneficiaryClearScopedButton"),
  beneficiaryListMessage: document.querySelector("#beneficiaryListMessage"),
  beneficiaryHistoryMessage: document.querySelector("#beneficiaryHistoryMessage"),
  beneficiaryImportHistoryList: document.querySelector("#beneficiaryImportHistoryList"),
  beneficiaryList: document.querySelector("#beneficiaryList"),
  beneficiaryEditorForm: document.querySelector("#beneficiaryEditorForm"),
  beneficiaryEditorAcademicYear: document.querySelector("#beneficiaryEditorAcademicYear"),
  beneficiaryEditorSchemeName: document.querySelector("#beneficiaryEditorSchemeName"),
  beneficiaryEditorFullName: document.querySelector("#beneficiaryEditorFullName"),
  beneficiaryEditorStudentReferenceId: document.querySelector("#beneficiaryEditorStudentReferenceId"),
  beneficiaryEditorIndexNumber: document.querySelector("#beneficiaryEditorIndexNumber"),
  beneficiaryEditorSponsorName: document.querySelector("#beneficiaryEditorSponsorName"),
  beneficiaryEditorCollege: document.querySelector("#beneficiaryEditorCollege"),
  beneficiaryEditorAmountPaid: document.querySelector("#beneficiaryEditorAmountPaid"),
  beneficiaryEditorCurrency: document.querySelector("#beneficiaryEditorCurrency"),
  beneficiaryEditorSupportType: document.querySelector("#beneficiaryEditorSupportType"),
  beneficiaryEditorCohort: document.querySelector("#beneficiaryEditorCohort"),
  beneficiaryEditorRemarks: document.querySelector("#beneficiaryEditorRemarks"),
  beneficiaryEditorReplaceExisting: document.querySelector("#beneficiaryEditorReplaceExisting"),
  beneficiaryEditorChangeReason: document.querySelector("#beneficiaryEditorChangeReason"),
  beneficiaryEditorRemovalReason: document.querySelector("#beneficiaryEditorRemovalReason"),
  beneficiaryEditorSaveButton: document.querySelector("#beneficiaryEditorSaveButton"),
  beneficiaryEditorDeleteButton: document.querySelector("#beneficiaryEditorDeleteButton"),
  beneficiaryEditorCancelButton: document.querySelector("#beneficiaryEditorCancelButton"),
  beneficiaryEditorMessage: document.querySelector("#beneficiaryEditorMessage"),
  beneficiaryRecordHistoryMessage: document.querySelector("#beneficiaryRecordHistoryMessage"),
  beneficiaryRecordHistoryList: document.querySelector("#beneficiaryRecordHistoryList"),
  beneficiaryAuditFilterForm: document.querySelector("#beneficiaryAuditFilterForm"),
  beneficiaryAuditEventTypeFilter: document.querySelector("#beneficiaryAuditEventTypeFilter"),
  beneficiaryAuditReloadButton: document.querySelector("#beneficiaryAuditReloadButton"),
  beneficiaryAuditMessage: document.querySelector("#beneficiaryAuditMessage"),
  beneficiaryAuditList: document.querySelector("#beneficiaryAuditList"),
  recommendedSummaryCards: document.querySelector("#recommendedSummaryCards"),
  recommendedMessage: document.querySelector("#recommendedMessage"),
  recommendedFormTitle: document.querySelector("#recommendedFormTitle"),
  recommendedCreateForm: document.querySelector("#recommendedCreateForm"),
  recommendedSchemeSelect: document.querySelector("#recommendedSchemeSelect"),
  recommendedStudentReferenceId: document.querySelector("#recommendedStudentReferenceId"),
  recommendedRegistryPreview: document.querySelector("#recommendedRegistryPreview"),
  recommendedReason: document.querySelector("#recommendedReason"),
  recommendedNotes: document.querySelector("#recommendedNotes"),
  recommendedCreateButton: document.querySelector("#recommendedCreateButton"),
  recommendedCancelButton: document.querySelector("#recommendedCancelButton"),
  recommendedCreateMessage: document.querySelector("#recommendedCreateMessage"),
  recommendedImportForm: document.querySelector("#recommendedImportForm"),
  recommendedFile: document.querySelector("#recommendedFile"),
  selectedRecommendedFileName: document.querySelector("#selectedRecommendedFileName"),
  recommendedPreviewButton: document.querySelector("#recommendedPreviewButton"),
  recommendedImportButton: document.querySelector("#recommendedImportButton"),
  recommendedImportMessage: document.querySelector("#recommendedImportMessage"),
  recommendedPreviewSummaryCards: document.querySelector("#recommendedPreviewSummaryCards"),
  recommendedPreviewList: document.querySelector("#recommendedPreviewList"),
  recommendedFilterForm: document.querySelector("#recommendedFilterForm"),
  recommendedSearchQuery: document.querySelector("#recommendedSearchQuery"),
  recommendedCycleFilter: document.querySelector("#recommendedCycleFilter"),
  recommendedSchemeFilter: document.querySelector("#recommendedSchemeFilter"),
  recommendedStatusFilter: document.querySelector("#recommendedStatusFilter"),
  recommendedReloadButton: document.querySelector("#recommendedReloadButton"),
  recommendedListMessage: document.querySelector("#recommendedListMessage"),
  recommendedList: document.querySelector("#recommendedList"),
  recommendedSelectedSummary: document.querySelector("#recommendedSelectedSummary"),
  recommendedSupportForm: document.querySelector("#recommendedSupportForm"),
  recommendedSupportAmount: document.querySelector("#recommendedSupportAmount"),
  recommendedSupportType: document.querySelector("#recommendedSupportType"),
  recommendedSupportSponsor: document.querySelector("#recommendedSupportSponsor"),
  recommendedSupportCohort: document.querySelector("#recommendedSupportCohort"),
  recommendedSupportRemarks: document.querySelector("#recommendedSupportRemarks"),
  recommendedSupportButton: document.querySelector("#recommendedSupportButton"),
  recommendedSupportMessage: document.querySelector("#recommendedSupportMessage"),
  supportProgramsMessage: document.querySelector("#supportProgramsMessage"),
  supportFoodBankFormTitle: document.querySelector("#supportFoodBankFormTitle"),
  supportFoodBankForm: document.querySelector("#supportFoodBankForm"),
  supportFoodBankAcademicYear: document.querySelector("#supportFoodBankAcademicYear"),
  supportFoodBankSemester: document.querySelector("#supportFoodBankSemester"),
  supportFoodBankStudentReferenceId: document.querySelector("#supportFoodBankStudentReferenceId"),
  supportFoodBankRegistryPreview: document.querySelector("#supportFoodBankRegistryPreview"),
  supportFoodBankReferralSource: document.querySelector("#supportFoodBankReferralSource"),
  supportFoodBankTypeFood: document.querySelector("#supportFoodBankTypeFood"),
  supportFoodBankTypeClothing: document.querySelector("#supportFoodBankTypeClothing"),
  supportFoodBankCreateButton: document.querySelector("#supportFoodBankCreateButton"),
  supportFoodBankCancelButton: document.querySelector("#supportFoodBankCancelButton"),
  supportFoodBankCreateMessage: document.querySelector("#supportFoodBankCreateMessage"),
  supportFoodBankImportForm: document.querySelector("#supportFoodBankImportForm"),
  supportFoodBankFile: document.querySelector("#supportFoodBankFile"),
  selectedSupportFoodBankFileName: document.querySelector("#selectedSupportFoodBankFileName"),
  supportFoodBankPreviewButton: document.querySelector("#supportFoodBankPreviewButton"),
  supportFoodBankImportButton: document.querySelector("#supportFoodBankImportButton"),
  supportFoodBankImportMessage: document.querySelector("#supportFoodBankImportMessage"),
  supportFoodBankPreviewSummaryCards: document.querySelector("#supportFoodBankPreviewSummaryCards"),
  supportFoodBankPreviewList: document.querySelector("#supportFoodBankPreviewList"),
  supportFoodBankFilterForm: document.querySelector("#supportFoodBankFilterForm"),
  supportFoodBankAcademicYearFilter: document.querySelector("#supportFoodBankAcademicYearFilter"),
  supportFoodBankStatusFilter: document.querySelector("#supportFoodBankStatusFilter"),
  supportFoodBankSearchQuery: document.querySelector("#supportFoodBankSearchQuery"),
  supportFoodBankReloadButton: document.querySelector("#supportFoodBankReloadButton"),
  supportFoodBankListMessage: document.querySelector("#supportFoodBankListMessage"),
  supportFoodBankList: document.querySelector("#supportFoodBankList"),
  reportsOverviewMessage: document.querySelector("#reportsOverviewMessage"),
  reportsSummaryCards: document.querySelector("#reportsSummaryCards"),
  reportsFoodBankSummaryCards: document.querySelector("#reportsFoodBankSummaryCards"),
  reportsFoodBankCollegeTable: document.querySelector("#reportsFoodBankCollegeTable"),
  reportsBeneficiarySummaryCards: document.querySelector("#reportsBeneficiarySummaryCards"),
  reportsBeneficiarySummaryExportButton: document.querySelector("#reportsBeneficiarySummaryExportButton"),
  reportsBeneficiaryYearComparisonTable: document.querySelector("#reportsBeneficiaryYearComparisonTable"),
  reportsBeneficiarySchemeChart: document.querySelector("#reportsBeneficiarySchemeChart"),
  reportsBeneficiaryCollegeChart: document.querySelector("#reportsBeneficiaryCollegeChart"),
  reportsBeneficiarySchemeForm: document.querySelector("#reportsBeneficiarySchemeForm"),
  reportsBeneficiaryAcademicYear: document.querySelector("#reportsBeneficiaryAcademicYear"),
  reportsBeneficiarySchemeName: document.querySelector("#reportsBeneficiarySchemeName"),
  reportsBeneficiaryLoadButton: document.querySelector("#reportsBeneficiaryLoadButton"),
  reportsBeneficiaryExportButton: document.querySelector("#reportsBeneficiaryExportButton"),
  reportsBeneficiarySchemeMessage: document.querySelector("#reportsBeneficiarySchemeMessage"),
  reportsBeneficiarySchemeCards: document.querySelector("#reportsBeneficiarySchemeCards"),
  reportsBeneficiarySchemeCollegeTable: document.querySelector("#reportsBeneficiarySchemeCollegeTable"),
  schemeForm: document.querySelector("#schemeForm"),
  schemeNameInput: document.querySelector("#schemeNameInput"),
  schemeCategoryInput: document.querySelector("#schemeCategoryInput"),
  schemeAcademicYearSelect: document.querySelector("#schemeAcademicYearSelect"),
  schemeAcademicYearManualField: document.querySelector("#schemeAcademicYearManualField"),
  schemeAcademicYearManualInput: document.querySelector("#schemeAcademicYearManualInput"),
  schemeSaveButton: document.querySelector("#schemeSaveButton"),
  schemeCancelButton: document.querySelector("#schemeCancelButton"),
  schemeMessage: document.querySelector("#schemeMessage"),
  schemeList: document.querySelector("#schemeList"),
  schemePanelBody: document.querySelector("#schemePanelBody"),
  schemePanelToggleButton: document.querySelector("#schemePanelToggleButton"),
  applicationImportMode: document.querySelector("#applicationImportMode"),
  applicationFile: document.querySelector("#applicationFile"),
  selectedApplicationFileName: document.querySelector("#selectedApplicationFileName"),
  applicationCriteriaForm: document.querySelector("#applicationCriteriaForm"),
  applicationRequiredDocuments: document.querySelector("#applicationRequiredDocuments"),
  applicationCwaCutoff: document.querySelector("#applicationCwaCutoff"),
  applicationWassceCutoff: document.querySelector("#applicationWassceCutoff"),
  applicationInterviewRequired: document.querySelector("#applicationInterviewRequired"),
  applicationCriteriaNotes: document.querySelector("#applicationCriteriaNotes"),
  applicationCriteriaSaveButton: document.querySelector("#applicationCriteriaSaveButton"),
  applicationCriteriaMessage: document.querySelector("#applicationCriteriaMessage"),
  criteriaPanelBody: document.querySelector("#criteriaPanelBody"),
  criteriaToggleButton: document.querySelector("#criteriaToggleButton"),
  applicationPreviewButton: document.querySelector("#applicationPreviewButton"),
  applicationImportButton: document.querySelector("#applicationImportButton"),
  applicationsSummaryCards: document.querySelector("#applicationsSummaryCards"),
  applicationsIssueList: document.querySelector("#applicationsIssueList"),
  applicationsValidRowsTable: document.querySelector("#applicationsValidRowsTable"),
  applicationsImportedRowsList: document.querySelector("#applicationsImportedRowsList"),
  applicationsRejectedRowsList: document.querySelector("#applicationsRejectedRowsList"),
  applicationsFormMessage: document.querySelector("#applicationsFormMessage"),
  applicationsListMessage: document.querySelector("#applicationsListMessage"),
  applicationsList: document.querySelector("#applicationsList"),
  applicationsRegistryBody: document.querySelector("#applicationsRegistryBody"),
  applicationsToggleButton: document.querySelector("#applicationsToggleButton"),
  applicationsReloadButton: document.querySelector("#applicationsReloadButton"),
  applicationReviewSummaryCards: document.querySelector("#applicationReviewSummaryCards"),
  applicationReviewMetricsMessage: document.querySelector("#applicationReviewMetricsMessage"),
  applicationCwaCoverageBody: document.querySelector("#applicationCwaCoverageBody"),
  applicationCwaCoverageMessage: document.querySelector("#applicationCwaCoverageMessage"),
  applicationCwaCoverageCards: document.querySelector("#applicationCwaCoverageCards"),
  applicationCwaCoverageList: document.querySelector("#applicationCwaCoverageList"),
  applicationCwaCoverageToggleButton: document.querySelector("#applicationCwaCoverageToggleButton"),
  applicationInterviewImportForm: document.querySelector("#applicationInterviewImportForm"),
  applicationInterviewFile: document.querySelector("#applicationInterviewFile"),
  selectedApplicationInterviewFileName: document.querySelector("#selectedApplicationInterviewFileName"),
  applicationInterviewPreviewButton: document.querySelector("#applicationInterviewPreviewButton"),
  applicationInterviewImportButton: document.querySelector("#applicationInterviewImportButton"),
  applicationInterviewImportMessage: document.querySelector("#applicationInterviewImportMessage"),
  applicationInterviewSummaryCards: document.querySelector("#applicationInterviewSummaryCards"),
  applicationInterviewIssueList: document.querySelector("#applicationInterviewIssueList"),
  applicationInterviewValidRowsTable: document.querySelector("#applicationInterviewValidRowsTable"),
  applicationInterviewImportedRowsList: document.querySelector("#applicationInterviewImportedRowsList"),
  applicationInterviewRejectedRowsList: document.querySelector("#applicationInterviewRejectedRowsList"),
  applicationReviewSearchForm: document.querySelector("#applicationReviewSearchForm"),
  applicationReviewSearchReference: document.querySelector("#applicationReviewSearchReference"),
  applicationReviewSearchButton: document.querySelector("#applicationReviewSearchButton"),
  applicationReviewSearchResetButton: document.querySelector("#applicationReviewSearchResetButton"),
  applicationReviewResultsBody: document.querySelector("#applicationReviewResultsBody"),
  applicationReviewResultsList: document.querySelector("#applicationReviewResultsList"),
  applicationReviewResultsToggleButton: document.querySelector("#applicationReviewResultsToggleButton"),
  applicationReviewResultsTopButton: document.querySelector("#applicationReviewResultsTopButton"),
  singleApplicationForm: document.querySelector("#singleApplicationForm"),
  singleApplicationReferenceId: document.querySelector("#singleApplicationReferenceId"),
  singleApplicationLookupButton: document.querySelector("#singleApplicationLookupButton"),
  singleApplicationLookupSummary: document.querySelector("#singleApplicationLookupSummary"),
  singleApplicationUploadedName: document.querySelector("#singleApplicationUploadedName"),
  singleApplicationApplicantEmail: document.querySelector("#singleApplicationApplicantEmail"),
  singleApplicationProgram: document.querySelector("#singleApplicationProgram"),
  singleApplicationYear: document.querySelector("#singleApplicationYear"),
  singleApplicationScore: document.querySelector("#singleApplicationScore"),
  singleApplicationNotes: document.querySelector("#singleApplicationNotes"),
  singleApplicationMessage: document.querySelector("#singleApplicationMessage"),
  singleApplicationAddButton: document.querySelector("#singleApplicationAddButton"),
  applicationIssueEditorList: document.querySelector("#applicationIssueEditorList"),
  applicationIssueEditForm: document.querySelector("#applicationIssueEditForm"),
  applicationIssueQueueId: document.querySelector("#applicationIssueQueueId"),
  applicationIssueRowNumber: document.querySelector("#applicationIssueRowNumber"),
  applicationIssueReferenceId: document.querySelector("#applicationIssueReferenceId"),
  applicationIssueFullName: document.querySelector("#applicationIssueFullName"),
  applicationIssueProgram: document.querySelector("#applicationIssueProgram"),
  applicationIssueYear: document.querySelector("#applicationIssueYear"),
  applicationIssueScore: document.querySelector("#applicationIssueScore"),
  applicationIssueNotes: document.querySelector("#applicationIssueNotes"),
  applicationIssueLookupButton: document.querySelector("#applicationIssueLookupButton"),
  applicationIssueLookupSummary: document.querySelector("#applicationIssueLookupSummary"),
  applicationIssueEditorMessage: document.querySelector("#applicationIssueEditorMessage"),
  applicationIssueSaveButton: document.querySelector("#applicationIssueSaveButton"),
  applicationReviewBody: document.querySelector("#applicationsReviewBody"),
  applicationReviewToggleButton: document.querySelector("#applicationReviewToggleButton"),
  applicationReviewMessage: document.querySelector("#applicationReviewMessage"),
  applicationBulkInterviewBody: document.querySelector("#applicationBulkInterviewBody"),
  applicationBulkInterviewToggleButton: document.querySelector("#applicationBulkInterviewToggleButton"),
  applicationBulkInterviewForm: document.querySelector("#applicationBulkInterviewForm"),
  applicationBulkInterviewStatus: document.querySelector("#applicationBulkInterviewStatus"),
  applicationBulkInterviewDate: document.querySelector("#applicationBulkInterviewDate"),
  applicationBulkInterviewNotes: document.querySelector("#applicationBulkInterviewNotes"),
  applicationBulkInterviewApplyButton: document.querySelector("#applicationBulkInterviewApplyButton"),
  applicationBulkInterviewMessage: document.querySelector("#applicationBulkInterviewMessage"),
  applicationExportFont: document.querySelector("#applicationExportFont"),
  applicationExportMessage: document.querySelector("#applicationExportMessage"),
  applicationExportCards: document.querySelector("#applicationExportCards"),
  applicationMessagingForm: document.querySelector("#applicationMessagingForm"),
  applicationMessagingChannel: document.querySelector("#applicationMessagingChannel"),
  applicationMessagingSenderField: document.querySelector("#applicationMessagingSenderField"),
  applicationMessagingSender: document.querySelector("#applicationMessagingSender"),
  applicationMessagingSenderPhoneField: document.querySelector("#applicationMessagingSenderPhoneField"),
  applicationMessagingSenderPhone: document.querySelector("#applicationMessagingSenderPhone"),
  applicationMessagingSenderWhatsAppField: document.querySelector("#applicationMessagingSenderWhatsAppField"),
  applicationMessagingSenderWhatsApp: document.querySelector("#applicationMessagingSenderWhatsApp"),
  applicationMessagingType: document.querySelector("#applicationMessagingType"),
  applicationMessagingSubjectField: document.querySelector("#applicationMessagingSubjectField"),
  applicationMessagingSubject: document.querySelector("#applicationMessagingSubject"),
  applicationMessagingBody: document.querySelector("#applicationMessagingBody"),
  applicationMessagingBodyCharCount: document.querySelector("#applicationMessagingBodyCharCount"),
  applicationMessagingTemplateResetButton: document.querySelector("#applicationMessagingTemplateResetButton"),
  applicationMessagingPreviewButton: document.querySelector("#applicationMessagingPreviewButton"),
  applicationMessagingLogButton: document.querySelector("#applicationMessagingLogButton"),
  applicationMessagingMessage: document.querySelector("#applicationMessagingMessage"),
  applicationMessagingSummaryCards: document.querySelector("#applicationMessagingSummaryCards"),
  applicationMessagingTemplatePreview: document.querySelector("#applicationMessagingTemplatePreview"),
  applicationMessagingRecipientList: document.querySelector("#applicationMessagingRecipientList"),
  applicationMessagingHistoryList: document.querySelector("#applicationMessagingHistoryList"),
  applicationOutcomeForm: document.querySelector("#applicationOutcomeForm"),
  applicationOutcomeSourceStatus: document.querySelector("#applicationOutcomeSourceStatus"),
  applicationOutcomeDecision: document.querySelector("#applicationOutcomeDecision"),
  applicationOutcomeNotes: document.querySelector("#applicationOutcomeNotes"),
  applicationOutcomeApplyButton: document.querySelector("#applicationOutcomeApplyButton"),
  applicationOutcomeSummaryCards: document.querySelector("#applicationOutcomeSummaryCards"),
  applicationOutcomeDistributionCards: document.querySelector("#applicationOutcomeDistributionCards"),
  applicationOutcomeList: document.querySelector("#applicationOutcomeList"),
  applicationOutcomeMessage: document.querySelector("#applicationOutcomeMessage"),
  applicationReviewSummary: document.querySelector("#applicationReviewSummary"),
  applicationAuditHistoryMessage: document.querySelector("#applicationAuditHistoryMessage"),
  applicationAuditHistoryList: document.querySelector("#applicationAuditHistoryList"),
  applicationReviewComparison: document.querySelector("#applicationReviewComparison"),
  applicationReviewCriteria: document.querySelector("#applicationReviewCriteria"),
  applicationAcademicEntryForm: document.querySelector("#applicationAcademicEntryForm"),
  applicationAcademicEntryCwa: document.querySelector("#applicationAcademicEntryCwa"),
  applicationAcademicEntryWassce: document.querySelector("#applicationAcademicEntryWassce"),
  applicationAcademicEntrySaveButton: document.querySelector("#applicationAcademicEntrySaveButton"),
  applicationAcademicEntryMessage: document.querySelector("#applicationAcademicEntryMessage"),
  applicationReviewDocumentChecklist: document.querySelector("#applicationReviewDocumentChecklist"),
  applicationReviewForm: document.querySelector("#applicationReviewForm"),
  applicationReviewDecision: document.querySelector("#applicationReviewDecision"),
  applicationReviewReason: document.querySelector("#applicationReviewReason"),
  applicationReviewUseRegistryData: document.querySelector("#applicationReviewUseRegistryData"),
  applicationReviewUploadedName: document.querySelector("#applicationReviewUploadedName"),
  applicationReviewUploadedReferenceId: document.querySelector("#applicationReviewUploadedReferenceId"),
  applicationReviewInterviewStatus: document.querySelector("#applicationReviewInterviewStatus"),
  applicationReviewInterviewScore: document.querySelector("#applicationReviewInterviewScore"),
  applicationReviewInterviewDate: document.querySelector("#applicationReviewInterviewDate"),
  applicationReviewInterviewNotes: document.querySelector("#applicationReviewInterviewNotes"),
  applicationReviewComment: document.querySelector("#applicationReviewComment"),
  applicationReviewSaveButton: document.querySelector("#applicationReviewSaveButton"),
  studentFile: document.querySelector("#studentFile"),
  selectedFileName: document.querySelector("#selectedFileName"),
  academicHistoryImportForm: document.querySelector("#academicHistoryImportForm"),
  academicHistorySemesterLabel: document.querySelector("#academicHistorySemesterLabel"),
  academicHistoryAcademicYearOverride: document.querySelector("#academicHistoryAcademicYearOverride"),
  academicHistoryFile: document.querySelector("#academicHistoryFile"),
  selectedAcademicHistoryFileName: document.querySelector("#selectedAcademicHistoryFileName"),
  academicHistoryPreviewButton: document.querySelector("#academicHistoryPreviewButton"),
  academicHistoryImportButton: document.querySelector("#academicHistoryImportButton"),
  academicHistoryMessage: document.querySelector("#academicHistoryMessage"),
  academicHistorySummaryCards: document.querySelector("#academicHistorySummaryCards"),
  academicHistoryValidRowsTable: document.querySelector("#academicHistoryValidRowsTable"),
  academicHistoryIssueList: document.querySelector("#academicHistoryIssueList"),
  academicHistoryResultsList: document.querySelector("#academicHistoryResultsList"),
  academicHistoryImportedRowsList: document.querySelector("#academicHistoryImportedRowsList"),
  academicHistoryRejectedRowsList: document.querySelector("#academicHistoryRejectedRowsList"),
  academicHistorySearchForm: document.querySelector("#academicHistorySearchForm"),
  academicHistorySearchQuery: document.querySelector("#academicHistorySearchQuery"),
  academicHistorySearchReferenceId: document.querySelector("#academicHistorySearchReferenceId"),
  academicHistorySearchIndexNumber: document.querySelector("#academicHistorySearchIndexNumber"),
  academicHistorySearchButton: document.querySelector("#academicHistorySearchButton"),
  academicHistorySearchResetButton: document.querySelector("#academicHistorySearchResetButton"),
  academicHistorySearchMessage: document.querySelector("#academicHistorySearchMessage"),
  summaryCards: document.querySelector("#summaryCards"),
  validRowsTable: document.querySelector("#validRowsTable"),
  issueList: document.querySelector("#issueList"),
  duplicateResolutionList: document.querySelector("#duplicateResolutionList"),
  duplicateResolutionMessage: document.querySelector("#duplicateResolutionMessage"),
  importedRowsList: document.querySelector("#importedRowsList"),
  rejectedRowsList: document.querySelector("#rejectedRowsList"),
  formMessage: document.querySelector("#formMessage"),
  searchForm: document.querySelector("#searchForm"),
  searchQuery: document.querySelector("#searchQuery"),
  searchReferenceId: document.querySelector("#searchReferenceId"),
  searchIndexNumber: document.querySelector("#searchIndexNumber"),
  searchButton: document.querySelector("#searchButton"),
  searchResetButton: document.querySelector("#searchResetButton"),
  searchMessage: document.querySelector("#searchMessage"),
  searchResultsList: document.querySelector("#searchResultsList"),
  studentDetailCard: document.querySelector("#studentDetailCard"),
  flagReviewForm: document.querySelector("#flagReviewForm"),
  flagMode: document.querySelector("#flagMode"),
  flagQuery: document.querySelector("#flagQuery"),
  flagReviewButton: document.querySelector("#flagReviewButton"),
  flagResetButton: document.querySelector("#flagResetButton"),
  flagReviewMessage: document.querySelector("#flagReviewMessage"),
  flaggedResultsList: document.querySelector("#flaggedResultsList"),
  flaggedDetailCard: document.querySelector("#flaggedDetailCard"),
  sessionCard: document.querySelector("#sessionCard"),
  apiHealthBadge: document.querySelector("#apiHealthBadge"),
  themeButtons: document.querySelectorAll("[data-theme-choice]"),
  tokenButtons: document.querySelectorAll("[data-token]"),
  accessManagementPanel: document.querySelector("#accessManagementPanel"),
  accessManagementForm: document.querySelector("#accessManagementForm"),
  accessFullName: document.querySelector("#accessFullName"),
  accessUsername: document.querySelector("#accessUsername"),
  accessRole: document.querySelector("#accessRole"),
  accessPassword: document.querySelector("#accessPassword"),
  accessManagementMessage: document.querySelector("#accessManagementMessage"),
  accessManagementList: document.querySelector("#accessManagementList"),
  navItems: document.querySelectorAll("[data-module]"),
  moduleViews: document.querySelectorAll("[data-module-view]"),
  moduleTitle: document.querySelector("#moduleTitle"),
  moduleDescription: document.querySelector("#moduleDescription"),
  moduleTabs: document.querySelectorAll("[data-section]"),
  sectionViews: document.querySelectorAll("[data-section-view]")
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeLocalStorageGet(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // ignore storage errors in restricted browser contexts
  }
}

function safeLocalStorageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage errors in restricted browser contexts
  }
}

function persistWorkspaceState() {
  safeLocalStorageSet(ACTIVE_MODULE_KEY, state.activeModule || "dashboard");
  safeLocalStorageSet(ACTIVE_REGISTRY_SECTION_KEY, state.activeSection || "import");
  safeLocalStorageSet(
    ACTIVE_APPLICATIONS_SECTION_KEY,
    state.activeApplicationsSection || "import"
  );
  safeLocalStorageSet(
    ACTIVE_BENEFICIARY_SECTION_KEY,
    state.activeBeneficiarySection || "imports"
  );
}

function persistPanelState() {
  safeLocalStorageSet(DASHBOARD_ACTIVITY_HIDDEN_KEY, state.dashboardActivityHidden);
  safeLocalStorageSet(
    DASHBOARD_BENEFICIARY_HISTORICAL_HIDDEN_KEY,
    state.dashboardBeneficiaryHistoricalHidden
  );
  safeLocalStorageSet(
    APPLICATION_REVIEW_RESULTS_HIDDEN_KEY,
    state.applicationReviewResultsHidden
  );
  safeLocalStorageSet(
    APPLICATION_BULK_INTERVIEW_HIDDEN_KEY,
    state.applicationBulkInterviewHidden
  );
  safeLocalStorageSet(
    APPLICATION_CWA_COVERAGE_HIDDEN_KEY,
    state.applicationCwaCoverageHidden
  );
}

function persistConnectionState() {
  safeLocalStorageSet(API_URL_KEY, elements.apiUrl?.value?.trim() || "");
  safeLocalStorageSet(AUTH_USERNAME_KEY, elements.loginUsername?.value?.trim() || "");
  writeStoredAuthTokenToStorages(
    [globalThis.sessionStorage, globalThis.localStorage],
    elements.authToken?.value?.trim() || ""
  );
}

function restoreConnectionState() {
  const storedApiUrl = safeLocalStorageGet(API_URL_KEY, "").trim();
  const storedUsername = safeLocalStorageGet(AUTH_USERNAME_KEY, "").trim();
  const currentDefaultApiUrl = deriveDefaultApiUrl(globalThis.location, DEFAULT_API_URL);

  if (shouldUseStoredApiUrl(storedApiUrl, globalThis.location)) {
    elements.apiUrl.value = storedApiUrl;
  } else {
    elements.apiUrl.value = currentDefaultApiUrl;
    safeLocalStorageSet(API_URL_KEY, currentDefaultApiUrl);
  }
  if (elements.loginApiUrl) {
    elements.loginApiUrl.value = elements.apiUrl.value;
  }
  elements.authToken.value = readStoredAuthTokenFromStorages([
    globalThis.sessionStorage,
    globalThis.localStorage
  ]);
  state.sessionRestorePending = shouldAttemptSessionRestore(elements.authToken.value);
  if (storedUsername && elements.loginUsername) {
    elements.loginUsername.value = storedUsername;
  }
}

function syncTokenPresetButtons() {
  if (!elements.tokenButtons.length) {
    return;
  }
  const activeToken = elements.authToken?.value?.trim() || "";
  for (const tokenButton of elements.tokenButtons) {
    tokenButton.classList.toggle("is-active", (tokenButton.dataset.token || "") === activeToken);
  }
}

function isAuthenticated() {
  return Boolean(state.session?.authenticated && state.session?.actor);
}

function setLoginMessage(text, tone = "warning") {
  if (!elements.loginMessage) {
    return;
  }
  elements.loginMessage.textContent = text;
  elements.loginMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`.trim();
}

function renderSessionSummary() {
  if (!elements.sessionSummary) {
    return;
  }

  if (!isAuthenticated()) {
    elements.sessionSummary.textContent = "Not signed in";
    return;
  }

  const actor = state.session?.actor || {};
  const roleLabel =
    String(actor.roleCode || "")
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "User";
  elements.sessionSummary.textContent = `${actor.fullName || actor.username || "Staff"} • ${roleLabel}`;
}

function syncAccessManagementVisibility() {
  if (!elements.accessManagementPanel) {
    return;
  }
  elements.accessManagementPanel.hidden = !isAuthenticated() || getCurrentActorRole() !== "admin";
}

function renderAccessShell() {
  const accessShellState = buildAccessShellState({
    authenticated: isAuthenticated(),
    sessionRestorePending: state.sessionRestorePending
  });
  if (globalThis.document?.documentElement) {
    globalThis.document.documentElement.dataset.authBoot = accessShellState.authBootMode;
  }
  if (elements.loginGate) {
    elements.loginGate.hidden = accessShellState.loginGateHidden;
  }
  if (elements.restoreGate) {
    elements.restoreGate.hidden = accessShellState.restoreGateHidden;
  }
  if (elements.loginForm) {
    elements.loginForm.hidden = accessShellState.loginFormHidden;
  }
  if (elements.appShell) {
    elements.appShell.hidden = accessShellState.appShellHidden;
  }
  if (elements.logoutButton) {
    elements.logoutButton.hidden = accessShellState.logoutHidden;
  }
  if (accessShellState.loginMessage) {
    setLoginMessage(accessShellState.loginMessage, accessShellState.loginTone);
  }
  renderSessionSummary();
  syncAccessManagementVisibility();
}

function renderAccessUsers() {
  if (!elements.accessManagementList) {
    return;
  }

  if (!isAuthenticated() || getCurrentActorRole() !== "admin") {
    elements.accessManagementList.innerHTML =
      `<p class="empty-state">Admin-only staff accounts will appear here after sign-in.</p>`;
    return;
  }

  const users = Array.isArray(state.accessUsers) ? state.accessUsers : [];
  const activeAdminCount = users.filter((item) => {
    const isActive = String(item.status || "").toLowerCase() === "active";
    return isActive && String(item.roleCode || "").toLowerCase() === "admin";
  }).length;
  if (!users.length) {
    elements.accessManagementList.innerHTML =
      `<p class="empty-state">No staff accounts have been created yet.</p>`;
    return;
  }

  elements.accessManagementList.innerHTML = users
      .map((item) => {
        const isActive = String(item.status || "").toLowerCase() === "active";
        const isProtectedBootstrapAdmin = Boolean(item.isProtectedAdmin);
        const isProtectedLastAdmin =
          isActive &&
          String(item.roleCode || "").toLowerCase() === "admin" &&
          activeAdminCount <= 1;
        const isProtectedAdmin = isProtectedBootstrapAdmin || isProtectedLastAdmin;
        const roleLabel =
          String(item.roleCode || "")
            .split("_")
          .filter(Boolean)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ") || "Reviewer";
      const alternateRole = item.roleCode === "admin" ? "reviewer" : "admin";
      const alternateRoleLabel = alternateRole === "admin" ? "Make admin" : "Set reviewer";
      return `
        <article class="search-result-card fade-in access-user-card">
          <div class="search-result-heading">
              <div>
                <h4>${escapeHtml(item.fullName || item.username || "Unnamed staff account")}</h4>
                <p>${escapeHtml(item.username || "No username")} | ${escapeHtml(roleLabel)}</p>
              </div>
              <div class="detail-flags">
                ${createFlagPill(isActive ? "Active" : "Inactive", isActive ? "success" : "warning")}
                ${
                  isProtectedAdmin
                    ? createFlagPill("Protected admin", "warning")
                    : ""
                }
              </div>
            </div>
            <div class="detail-grid">
            <div class="detail-item">
              <span>Username</span>
              <strong>${escapeHtml(item.username || "Not captured")}</strong>
            </div>
            <div class="detail-item">
              <span>Role</span>
              <strong>${escapeHtml(roleLabel)}</strong>
            </div>
          </div>
          <div class="action-row">
              <button class="action-button tertiary" type="button" data-access-action="role" data-access-user-id="${escapeHtml(
                item.id
              )}" data-access-role="${escapeHtml(alternateRole)}"${
                isProtectedAdmin ? " disabled" : ""
              }>${escapeHtml(alternateRoleLabel)}</button>
              <button class="action-button secondary" type="button" data-access-action="status" data-access-user-id="${escapeHtml(
                item.id
              )}" data-access-status="${isActive ? "inactive" : "active"}"${
                isProtectedAdmin ? " disabled" : ""
              }>${isActive ? "Deactivate" : "Activate"}</button>
              <button class="action-button ghost" type="button" data-access-action="reset-password" data-access-user-id="${escapeHtml(
                item.id
              )}">Reset password</button>
              <button class="action-button ghost" type="button" data-access-action="remove" data-access-user-id="${escapeHtml(
                item.id
              )}" data-access-user-name="${escapeHtml(item.fullName || item.username || "this staff account")}"${
                isProtectedAdmin ? " disabled" : ""
              }>Remove</button>
            </div>
          </article>
        `;
    })
    .join("");
}

async function loadAccessUsers() {
  if (!isAuthenticated() || getCurrentActorRole() !== "admin") {
    state.accessUsers = [];
    renderAccessUsers();
    return;
  }

  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    return;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/api/auth/users`, {
      headers: {
        ...getAuthHeaders()
      }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "Unable to load staff accounts.");
      }
      state.accessUsers = Array.isArray(payload.items) ? payload.items : [];
      const activeAdminCount = state.accessUsers.filter((item) => {
        const isActive = String(item.status || "").toLowerCase() === "active";
        return isActive && String(item.roleCode || "").toLowerCase() === "admin";
      }).length;
      const hasProtectedAdmin = state.accessUsers.some((item) => Boolean(item.isProtectedAdmin));
      renderAccessUsers();
      if (elements.accessManagementMessage) {
        elements.accessManagementMessage.textContent =
          hasProtectedAdmin
            ? "The protected bootstrap admin cannot be renamed, deactivated, demoted, or removed. The last active admin is also protected."
            : activeAdminCount <= 1
              ? "The last active admin account is protected from role changes, deactivation, and removal."
              : "Admin-created accounts can be activated, deactivated, reset, and removed from the list below.";
        elements.accessManagementMessage.className = "inline-note tone-success";
      }
    } catch (error) {
      state.accessUsers = [];
      renderAccessUsers();
    if (elements.accessManagementMessage) {
      elements.accessManagementMessage.textContent = error.message || "Unable to load staff accounts.";
      elements.accessManagementMessage.className = "inline-note tone-error";
    }
  }
}

async function refreshRoleScopedWorkspace() {
  if (!isAuthenticated()) {
    return;
  }

  const sharedLoaders = [
    () => loadDashboard(),
    () => loadApplicationOptions(),
    () => loadApplicationsList(),
    () => refreshApplicationReviewWorkspace(),
    () => loadApplicationCriteria(),
    () => loadApplicationMessagingSettings(),
    () => loadApplicationIssueQueue(),
    () => loadApplicationMessagingHistory(),
    () => loadSupportFoodBankRecords()
  ];

  const adminOnlyLoaders = [
    () => loadRegistryStats(),
    () => loadBeneficiaryRecords(),
    () => loadRecommendedRecords(),
    () => loadReportsOverview()
  ];

  const loaders = getCurrentActorRole() === "admin" ? [...sharedLoaders, ...adminOnlyLoaders] : sharedLoaders;
  await Promise.allSettled(loaders.map((loader) => loader()));
}

async function handleAccessManagementSubmit(event) {
  event.preventDefault();

  if (getCurrentActorRole() !== "admin") {
    if (elements.accessManagementMessage) {
      elements.accessManagementMessage.textContent = "Only admins can create staff accounts.";
      elements.accessManagementMessage.className = "inline-note tone-error";
    }
    return;
  }

  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    if (elements.accessManagementMessage) {
      elements.accessManagementMessage.textContent = "Connection is not ready yet. Refresh and try again.";
      elements.accessManagementMessage.className = "inline-note tone-error";
    }
    return;
  }

  const payload = {
    fullName: elements.accessFullName?.value?.trim() || "",
    username: elements.accessUsername?.value?.trim() || "",
    roleCode: elements.accessRole?.value || "reviewer",
    password: elements.accessPassword?.value || ""
  };

  if (elements.accessCreateButton) {
    elements.accessCreateButton.disabled = true;
  }
  if (elements.accessManagementMessage) {
    elements.accessManagementMessage.textContent = "Creating staff account...";
    elements.accessManagementMessage.className = "inline-note tone-warning";
  }

  try {
    const response = await fetch(`${apiBaseUrl}/api/auth/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.message || "Unable to create the staff account.");
    }

    elements.accessManagementForm?.reset();
    if (elements.accessRole) {
      elements.accessRole.value = "reviewer";
    }
    if (elements.accessManagementMessage) {
      elements.accessManagementMessage.textContent = `${result.item?.fullName || payload.fullName} can now sign in with the assigned role.`;
      elements.accessManagementMessage.className = "inline-note tone-success";
    }
    await loadAccessUsers();
  } catch (error) {
    if (elements.accessManagementMessage) {
      elements.accessManagementMessage.textContent = error.message || "Unable to create the staff account.";
      elements.accessManagementMessage.className = "inline-note tone-error";
    }
  } finally {
    if (elements.accessCreateButton) {
      elements.accessCreateButton.disabled = false;
    }
  }
}

async function handleAccessAction(button) {
  if (!button || getCurrentActorRole() !== "admin") {
    return;
  }

  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    if (elements.accessManagementMessage) {
      elements.accessManagementMessage.textContent = "Connection is not ready yet. Refresh and try again.";
      elements.accessManagementMessage.className = "inline-note tone-error";
    }
    return;
  }

  const userId = String(button.dataset.accessUserId || "").trim();
  const action = String(button.dataset.accessAction || "").trim();
  if (!userId || !action) {
    return;
  }

  button.disabled = true;
  try {
    if (action === "role") {
      const roleCode = String(button.dataset.accessRole || "").trim();
      const response = await fetch(`${apiBaseUrl}/api/auth/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ roleCode })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.message || "Unable to update the staff role.");
      }
      if (elements.accessManagementMessage) {
        elements.accessManagementMessage.textContent = `${result.item?.fullName || "Staff account"} is now assigned as ${roleCode}.`;
        elements.accessManagementMessage.className = "inline-note tone-success";
      }
    } else if (action === "status") {
      const status = String(button.dataset.accessStatus || "").trim();
      const response = await fetch(`${apiBaseUrl}/api/auth/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ status })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.message || "Unable to update the staff status.");
      }
      if (elements.accessManagementMessage) {
        elements.accessManagementMessage.textContent = `${result.item?.fullName || "Staff account"} is now ${status}.`;
        elements.accessManagementMessage.className = "inline-note tone-success";
      }
    } else if (action === "reset-password") {
      const password = window.prompt("Enter the new password for this staff account.");
      if (password === null) {
        return;
      }
      const response = await fetch(
        `${apiBaseUrl}/api/auth/users/${encodeURIComponent(userId)}/reset-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders()
          },
          body: JSON.stringify({ password })
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.message || "Unable to reset the password.");
      }
      if (elements.accessManagementMessage) {
        elements.accessManagementMessage.textContent = "Password reset completed.";
        elements.accessManagementMessage.className = "inline-note tone-success";
      }
    } else if (action === "remove") {
      const userName = String(button.dataset.accessUserName || "this staff account");
      const confirmed = window.confirm(`Remove ${userName} from platform access?`);
      if (!confirmed) {
        return;
      }

      const response = await fetch(`${apiBaseUrl}/api/auth/users/${encodeURIComponent(userId)}`, {
        method: "DELETE",
        headers: {
          ...getAuthHeaders()
        }
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.message || "Unable to remove the staff account.");
      }
      if (elements.accessManagementMessage) {
        elements.accessManagementMessage.textContent = `${userName} has been removed from platform access.`;
        elements.accessManagementMessage.className = "inline-note tone-success";
      }
    }

    await loadAccessUsers();
  } catch (error) {
    if (elements.accessManagementMessage) {
      elements.accessManagementMessage.textContent = error.message || "Unable to update staff access.";
      elements.accessManagementMessage.className = "inline-note tone-error";
    }
  } finally {
    button.disabled = false;
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  const apiBaseUrl = String(elements.loginApiUrl?.value || "").trim().replace(/\/$/, "");
  const username = String(elements.loginUsername?.value || "").trim();
  const password = String(elements.loginPassword?.value || "");

  state.sessionRestorePending = false;
  elements.apiUrl.value = apiBaseUrl;
  persistConnectionState();

  if (!apiBaseUrl) {
    setLoginMessage("Connection is not ready yet. Refresh and try again.", "error");
    return;
  }

  if (!username || !password) {
    setLoginMessage("Enter your username and password to continue.", "error");
    return;
  }

  if (elements.loginButton) {
    elements.loginButton.disabled = true;
  }
  setLoginMessage("Signing in...", "warning");

  try {
    const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to sign in.");
    }

    elements.authToken.value = payload.token || "";
    elements.loginPassword.value = "";
    persistConnectionState();
    setLoginMessage(`Welcome back, ${payload.actor?.fullName || username}.`, "success");
    await requestSession({ reloadData: true });
  } catch (error) {
    elements.authToken.value = "";
    persistConnectionState();
    setLoginMessage(error.message || "Unable to sign in.", "error");
    state.session = null;
    renderAccessShell();
  } finally {
    if (elements.loginButton) {
      elements.loginButton.disabled = false;
    }
  }
}

async function handleLogout() {
  const apiBaseUrl = getApiBaseUrl();
  const hadToken = Boolean(elements.authToken?.value?.trim());

  if (apiBaseUrl && hadToken) {
    try {
      await fetch(`${apiBaseUrl}/api/auth/logout`, {
        method: "POST",
        headers: {
          ...getAuthHeaders()
        }
      });
    } catch {
      // ignore logout transport errors and continue local cleanup
    }
  }

  elements.authToken.value = "";
  state.session = null;
  state.sessionRestorePending = false;
  state.accessUsers = [];
  persistConnectionState();
  renderAccessUsers();
  renderAccessShell();
  setLoginMessage("Signed out. Enter your username and password to continue.", "warning");
  await requestSession();
}

function sanitizeWorkspaceState() {
  state.activeModule = resolveModuleForRole(getCurrentActorRole(), state.activeModule);
  if (!MODULE_META[state.activeModule]) {
    state.activeModule = "dashboard";
  }

  const validRegistrySections = new Set(["import", "search", "duplicates", "history"]);
  if (!validRegistrySections.has(state.activeSection)) {
    state.activeSection = "import";
  }

  const validApplicationSections = new Set([
    "import",
    "registry",
    "review",
    "exports",
    "outcomes",
    "messaging"
  ]);
  if (!validApplicationSections.has(state.activeApplicationsSection)) {
    state.activeApplicationsSection = "import";
  }

  const validBeneficiarySections = new Set([
    "imports",
    "beneficiaries"
  ]);
  if (!validBeneficiarySections.has(state.activeBeneficiarySection)) {
    state.activeBeneficiarySection = "imports";
  }
}

function renderDashboardBeneficiaryHistoricalVisibility() {
  if (elements.dashboardBeneficiaryHistoricalBody) {
    elements.dashboardBeneficiaryHistoricalBody.hidden = state.dashboardBeneficiaryHistoricalHidden;
  }
  if (elements.dashboardBeneficiaryHistoricalHint) {
    elements.dashboardBeneficiaryHistoricalHint.hidden = !state.dashboardBeneficiaryHistoricalHidden;
  }
  if (elements.dashboardBeneficiaryHistoricalToggleButton) {
    elements.dashboardBeneficiaryHistoricalToggleButton.textContent =
      state.dashboardBeneficiaryHistoricalHidden
        ? "Show earlier academic years"
        : "Hide earlier academic years";
  }
  persistPanelState();
}

function formatRelativeDateTime(value) {
  if (!value) return "Just now";
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return "Unknown time";
  }

  const diffMs = Date.now() - timestamp.getTime();
  const absMs = Math.abs(diffMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (absMs < minute) return "Just now";
  if (absMs < hour) return `${Math.round(absMs / minute)} min ago`;
  if (absMs < day) return `${Math.round(absMs / hour)} hr ago`;
  if (absMs < 7 * day) return `${Math.round(absMs / day)} day(s) ago`;

  return timestamp.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function clampPercentage(value) {
  const normalized = Number(value || 0);
  if (!Number.isFinite(normalized)) return 0;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function normalizeDocumentChecklistItems(items = []) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => {
      if (typeof item === "string") {
        const label = item.trim();
        return label ? { label, received: false } : null;
      }

      const label = String(item?.label || "").trim();
      if (!label) return null;
      return {
        label,
        received: Boolean(item?.received)
      };
    })
    .filter(Boolean);
}

function buildApplicationDocumentChecklist(criteria, application) {
  const requiredDocuments = Array.isArray(criteria?.requiredDocuments)
    ? criteria.requiredDocuments.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const savedChecklist = normalizeDocumentChecklistItems(application?.documentChecklist || []);
  const savedMap = new Map(savedChecklist.map((item) => [item.label.toLowerCase(), item]));

  return requiredDocuments.map((label) => {
    const existing = savedMap.get(label.toLowerCase());
    return {
      label,
      received: Boolean(existing?.received)
    };
  });
}

function renderApplicationDocumentChecklist(criteria, application, canReview) {
  if (!application) {
    elements.applicationReviewDocumentChecklist.innerHTML =
      `<p class="empty-state">Select an application to review its required documents.</p>`;
    return;
  }

  const checklist = buildApplicationDocumentChecklist(criteria, application);
  if (!checklist.length) {
    elements.applicationReviewDocumentChecklist.innerHTML = `
      <div class="inline-note tone-warning">
        No required documents are configured for this scheme and academic year yet.
      </div>
    `;
    return;
  }

  elements.applicationReviewDocumentChecklist.innerHTML = `
    <div class="document-checklist-grid">
      ${checklist
        .map(
          (item, index) => `
            <label class="document-checklist-item ${item.received ? "is-received" : "is-missing"}">
              <input
                type="checkbox"
                data-document-check-item
                data-document-label="${escapeHtml(item.label)}"
                ${item.received ? "checked" : ""}
                ${canReview ? "" : "disabled"}
              />
              <span class="document-checklist-label">
                <strong>${escapeHtml(item.label)}</strong>
                <span>${item.received ? "Present or requirement met" : "Still missing or requirement not yet met"}</span>
              </span>
              <span class="dashboard-mini-pill">${item.received ? "Submitted" : "Pending"}</span>
            </label>
          `
        )
        .join("")}
    </div>
  `;
}

function collectApplicationDocumentChecklist() {
  return Array.from(
    elements.applicationReviewDocumentChecklist.querySelectorAll("[data-document-check-item]")
  ).map((input) => ({
    label: input.dataset.documentLabel || "",
    received: Boolean(input.checked)
  }));
}

function createDashboardDecisionChart(metrics = {}) {
  const segments = [
    { key: "qualified", label: "Qualified", value: Number(metrics.qualified || 0), color: "#2D7A5F" },
    { key: "pending", label: "Pending", value: Number(metrics.pending || 0), color: "#D9A441" },
    { key: "disqualified", label: "Disqualified", value: Number(metrics.disqualified || 0), color: "#B04A5A" },
    { key: "notReviewed", label: "Yet to review", value: Number(metrics.notReviewed || 0), color: "#4B6382" }
  ];
  const total = segments.reduce((sum, item) => sum + item.value, 0);

  if (!total) {
    return `<p class="empty-state">Decision chart will appear once applications exist in active schemes.</p>`;
  }

  let cursor = 0;
  const gradient = segments
    .map((item) => {
      const start = cursor;
      const span = (item.value / total) * 100;
      cursor += span;
      return `${item.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    })
    .join(", ");

  return `
    <div class="dashboard-chart dashboard-donut-chart fade-in">
      <div class="dashboard-donut" style="background: conic-gradient(${gradient});">
        <div class="dashboard-donut-hole">
          <span class="dashboard-donut-total">${escapeHtml(total)}</span>
          <span class="dashboard-donut-label">Active applications</span>
        </div>
      </div>
      <div class="dashboard-chart-legend">
        ${segments
          .map(
            (item) => `
              <div class="dashboard-legend-row">
                <span class="dashboard-legend-swatch" style="background:${item.color};"></span>
                <span class="dashboard-legend-label">${escapeHtml(item.label)}</span>
                <strong class="dashboard-legend-value">${escapeHtml(item.value)}</strong>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function createDashboardSchemeChart(items = []) {
  if (!items.length) {
    return `<p class="empty-state">Scheme progress chart will appear once active schemes have applications.</p>`;
  }

  const highest = Math.max(...items.map((item) => Number(item.totalCount || 0)), 1);
  return `
    <div class="dashboard-chart dashboard-bar-chart fade-in">
      ${items
        .slice(0, 6)
        .map((item) => {
          const total = Number(item.totalCount || 0);
          const reviewed = Number(item.reviewedCount || 0);
          const height = total > 0 ? Math.max(18, Math.round((total / highest) * 150)) : 18;
          const reviewedHeight =
            total > 0 ? Math.max(8, Math.round((Math.min(reviewed, total) / total) * height)) : 0;
          return `
            <button
              class="dashboard-bar-column"
              type="button"
              data-dashboard-action="${escapeHtml(
                JSON.stringify({
                  section: "review",
                  schemeId: item.schemeId || "",
                  cycleId: item.cycleId || ""
                })
              )}"
            >
              <div class="dashboard-bar-stack" style="height:${height}px;">
                <span class="dashboard-bar-total"></span>
                <span class="dashboard-bar-reviewed" style="height:${reviewedHeight}px;"></span>
              </div>
              <span class="dashboard-bar-label">${escapeHtml(item.schemeName || "Scheme")}</span>
              <span class="dashboard-bar-meta">${escapeHtml(clampPercentage(item.reviewPercentage || 0))}%</span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function getBeneficiaryDashboardData(dashboard) {
  const candidate = dashboard?.beneficiarySupport;
  if (
    candidate &&
    candidate.currentYear &&
    Array.isArray(candidate.currentYear.supportMix) &&
    Array.isArray(candidate.currentYear.sponsorDistribution)
  ) {
    return candidate;
  }
  return EMPTY_BENEFICIARY_DASHBOARD;
}

function createBeneficiarySupportMixChart(items = []) {
  if (!items.length) {
    return `<p class="empty-state">Beneficiary support mix will appear here.</p>`;
  }

  const total = items.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const gradient = items
    .map((item, index) => {
      const start = items
        .slice(0, index)
        .reduce((sum, segment) => sum + (total ? (Number(segment.value || 0) / total) * 100 : 0), 0);
      const end = start + (total ? (Number(item.value || 0) / total) * 100 : 0);
      return `${item.color} ${start}% ${end}%`;
    })
    .join(", ");

  return `
    <div class="dashboard-chart dashboard-donut-chart fade-in">
      <div class="dashboard-donut" style="background: conic-gradient(${gradient});">
        <div class="dashboard-donut-hole">
          <span class="dashboard-donut-total">${escapeHtml(total)}</span>
          <span class="dashboard-donut-label">Support records</span>
        </div>
      </div>
      <div class="dashboard-chart-legend">
        ${items
          .map(
            (item) => `
              <div class="dashboard-legend-row">
                <span class="dashboard-legend-swatch" style="background:${escapeHtml(item.color)};"></span>
                <span class="dashboard-legend-label">${escapeHtml(item.label)}</span>
                <strong class="dashboard-legend-value">${escapeHtml(item.value)}</strong>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function createBeneficiaryDistributionChart(items = []) {
  if (!items.length) {
    return `<p class="empty-state">Beneficiary distribution will appear here.</p>`;
  }

  const highest = Math.max(...items.map((item) => Number(item.value || 0)), 1);
  return `
    <div class="dashboard-chart dashboard-bar-chart fade-in">
      ${items
        .map((item) => {
          const value = Number(item.value || 0);
          const height = Math.max(18, Math.round((value / highest) * 150));
          return `
            <div class="dashboard-bar-column dashboard-bar-column--static">
              <div class="dashboard-bar-stack" style="height:${height}px;">
                <span class="dashboard-bar-reviewed" style="height:${height}px; background:${escapeHtml(
                  item.color || "#2D7A5F"
                )};"></span>
              </div>
              <span class="dashboard-bar-label">${escapeHtml(item.label)}</span>
              <span class="dashboard-bar-meta">${escapeHtml(value)}${
                item.amountPaidLabel ? ` | ${escapeHtml(item.amountPaidLabel)}` : ""
              }</span>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderBeneficiaryCurrencyBreakdown(currencyTotals = [], emptyLabel = "GHS 0") {
  const safeTotals = Array.isArray(currencyTotals) ? currencyTotals.filter((item) => item?.amountLabel) : [];
  if (!safeTotals.length) {
    return `
      <div class="dashboard-currency-pills">
        <span class="dashboard-mini-pill">${escapeHtml(emptyLabel)}</span>
      </div>
    `;
  }

  return `
    <div class="dashboard-currency-pills">
      ${safeTotals
        .map(
          (item) =>
            `<span class="dashboard-mini-pill">${escapeHtml(
              item.amountLabel || `${item.currency || "GHS"} 0`
            )}</span>`
        )
        .join("")}
    </div>
  `;
}

function renderDashboardBeneficiarySection(dashboard) {
  const beneficiaryData = getBeneficiaryDashboardData(dashboard);
  const currentYear = beneficiaryData.currentYear || {};
  const cohortCounts = currentYear.cohortCounts || {};

  if (elements.dashboardBeneficiaryMetricCards) {
    elements.dashboardBeneficiaryMetricCards.innerHTML = `
      <article class="metric-card dashboard-beneficiary-card dashboard-beneficiary-card--success fade-in">
        <span class="metric-label">Total beneficiaries</span>
        <strong class="metric-value">${escapeHtml(currentYear.totalBeneficiaries ?? 0)}</strong>
        <span class="detail-subcopy">${escapeHtml(
          beneficiaryData.currentYearLabel || "Current Academic Year"
        )}</span>
      </article>
      <article class="metric-card dashboard-beneficiary-card dashboard-beneficiary-card--accent fade-in">
        <span class="metric-label">Amount totals</span>
        <strong class="metric-value">${escapeHtml(currentYear.totalAmountPaidLabel || "GHS 0")}</strong>
        <span class="detail-subcopy">Support paid across the active beneficiary lists, grouped by recorded currency</span>
        ${renderBeneficiaryCurrencyBreakdown(
          currentYear.currencyTotals || [],
          currentYear.totalAmountPaidLabel || "GHS 0"
        )}
      </article>
      <article class="metric-card dashboard-beneficiary-card dashboard-beneficiary-card--info fade-in">
        <span class="metric-label">Imported lists</span>
        <strong class="metric-value">${escapeHtml(currentYear.importedListsCount ?? 0)}</strong>
        <span class="detail-subcopy">Beneficiary files captured for the year</span>
      </article>
      <article class="metric-card dashboard-beneficiary-card dashboard-beneficiary-card--warning fade-in">
        <span class="metric-label">Recommendation-linked beneficiaries</span>
        <strong class="metric-value">${escapeHtml(currentYear.waitlistPromotions ?? 0)}</strong>
        <span class="detail-subcopy">Recommended students later moved into support</span>
      </article>
      <article class="metric-card dashboard-beneficiary-card dashboard-beneficiary-card--success fade-in">
        <span class="metric-label">Current cohort</span>
        <strong class="metric-value">${escapeHtml(cohortCounts.current ?? 0)}</strong>
        <span class="detail-subcopy">Continuing beneficiaries in the current year</span>
      </article>
      <article class="metric-card dashboard-beneficiary-card dashboard-beneficiary-card--accent fade-in">
        <span class="metric-label">New cohort</span>
        <strong class="metric-value">${escapeHtml(cohortCounts.new ?? 0)}</strong>
        <span class="detail-subcopy">Fresh beneficiaries added in the current year</span>
      </article>
      <article class="metric-card dashboard-beneficiary-card dashboard-beneficiary-card--info fade-in">
        <span class="metric-label">Not tagged</span>
        <strong class="metric-value">${escapeHtml(cohortCounts.untagged ?? 0)}</strong>
        <span class="detail-subcopy">Imported without a cohort tag</span>
      </article>
      <article class="metric-card dashboard-beneficiary-card dashboard-beneficiary-card--warning fade-in">
        <span class="metric-label">Carried forward</span>
        <strong class="metric-value">${escapeHtml(cohortCounts.carriedForward ?? 0)}</strong>
        <span class="detail-subcopy">Prior-year new beneficiaries now treated as current</span>
      </article>
    `;
  }

  if (elements.dashboardBeneficiarySupportChart) {
    elements.dashboardBeneficiarySupportChart.innerHTML = createBeneficiarySupportMixChart(
      currentYear.supportMix || []
    );
  }

  if (elements.dashboardBeneficiarySchemeChart) {
    elements.dashboardBeneficiarySchemeChart.innerHTML = createBeneficiaryDistributionChart(
      currentYear.sponsorDistribution || []
    );
  }

  if (elements.dashboardBeneficiaryCollegeChart) {
    elements.dashboardBeneficiaryCollegeChart.innerHTML = createBeneficiaryDistributionChart(
      currentYear.collegeDistribution || []
    );
  }

  if (elements.dashboardBeneficiaryHistoricalYears) {
    const previousYears = Array.isArray(beneficiaryData.previousYears)
      ? beneficiaryData.previousYears
      : [];
    elements.dashboardBeneficiaryHistoricalYears.innerHTML = previousYears.length
      ? previousYears
          .map(
            (year) => `
              <article class="dashboard-year-card fade-in">
                <div class="dashboard-card-top">
                  <div class="dashboard-card-copy">
                    <strong>${escapeHtml(year.label || "Academic Year")}</strong>
                    <p>Historical beneficiary totals kept available for comparison.</p>
                  </div>
                </div>
                <div class="dashboard-year-metrics">
                  <span class="dashboard-mini-pill">Beneficiaries: ${escapeHtml(
                    year.totalBeneficiaries ?? 0
                  )}</span>
                  <span class="dashboard-mini-pill">Amount totals: ${escapeHtml(
                    year.totalAmountPaidLabel || "GHS 0"
                  )}</span>
                  ${(Array.isArray(year.currencyTotals) ? year.currencyTotals : [])
                    .map(
                      (item) =>
                        `<span class="dashboard-mini-pill">${escapeHtml(
                          item.amountLabel || `${item.currency || "GHS"} 0`
                        )}</span>`
                    )
                    .join("")}
                  <span class="dashboard-mini-pill">Imported lists: ${escapeHtml(
                    year.importedListsCount ?? 0
                  )}</span>
                  <span class="dashboard-mini-pill">Recommendation-linked beneficiaries: ${escapeHtml(
                    year.waitlistPromotions ?? 0
                  )}</span>
                  <span class="dashboard-mini-pill">Current: ${escapeHtml(
                    year.cohortCounts?.current ?? 0
                  )}</span>
                  <span class="dashboard-mini-pill">New: ${escapeHtml(
                    year.cohortCounts?.new ?? 0
                  )}</span>
                  <span class="dashboard-mini-pill">Carried forward: ${escapeHtml(
                    year.cohortCounts?.carriedForward ?? 0
                  )}</span>
                </div>
              </article>
            `
          )
          .join("")
      : `<p class="empty-state">No earlier academic years are available yet.</p>`;
  }

  renderDashboardBeneficiaryHistoricalVisibility();
}

function setBeneficiaryImportMessage(text, tone = "warning") {
  if (!elements.beneficiaryImportMessage) return;
  elements.beneficiaryImportMessage.textContent = text;
  elements.beneficiaryImportMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setBeneficiaryDuplicateReviewMessage(text, tone = "warning") {
  if (!elements.beneficiaryDuplicateReviewMessage) return;
  elements.beneficiaryDuplicateReviewMessage.textContent = text;
  elements.beneficiaryDuplicateReviewMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setBeneficiaryListMessage(text, tone = "warning") {
  if (!elements.beneficiaryListMessage) return;
  elements.beneficiaryListMessage.textContent = text;
  elements.beneficiaryListMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setBeneficiaryHistoryMessage(text, tone = "warning") {
  if (!elements.beneficiaryHistoryMessage) return;
  elements.beneficiaryHistoryMessage.textContent = text;
  elements.beneficiaryHistoryMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setBeneficiaryEditorMessage(text, tone = "warning") {
  if (!elements.beneficiaryEditorMessage) return;
  elements.beneficiaryEditorMessage.textContent = text;
  elements.beneficiaryEditorMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setBeneficiaryRecordHistoryMessage(text, tone = "warning") {
  if (!elements.beneficiaryRecordHistoryMessage) return;
  elements.beneficiaryRecordHistoryMessage.textContent = text;
  elements.beneficiaryRecordHistoryMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setBeneficiaryAuditMessage(text, tone = "warning") {
  if (!elements.beneficiaryAuditMessage) return;
  elements.beneficiaryAuditMessage.textContent = text;
  elements.beneficiaryAuditMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setRecommendedMessage(text, tone = "warning") {
  if (!elements.recommendedMessage) return;
  elements.recommendedMessage.textContent = text;
  elements.recommendedMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setRecommendedCreateMessage(text, tone = "warning") {
  if (!elements.recommendedCreateMessage) return;
  elements.recommendedCreateMessage.textContent = text;
  elements.recommendedCreateMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setRecommendedImportMessage(text, tone = "warning") {
  if (!elements.recommendedImportMessage) return;
  elements.recommendedImportMessage.textContent = text;
  elements.recommendedImportMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setRecommendedListMessage(text, tone = "warning") {
  if (!elements.recommendedListMessage) return;
  elements.recommendedListMessage.textContent = text;
  elements.recommendedListMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setRecommendedSupportMessage(text, tone = "warning") {
  if (!elements.recommendedSupportMessage) return;
  elements.recommendedSupportMessage.textContent = text;
  elements.recommendedSupportMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setRecommendedApplicationMessage(text, tone = "warning") {
  if (!elements.recommendedApplicationMessage) return;
  elements.recommendedApplicationMessage.textContent = text;
  elements.recommendedApplicationMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function getRecommendedRecordTone(status) {
  return String(status || "").trim().toLowerCase() === "supported" ? "success" : "warning";
}

function formatRecommendedStatusLabel(status) {
  return String(status || "").trim().toLowerCase() === "supported"
    ? "Supported"
    : "Awaiting support";
}

function renderRecommendedSummary(summary = state.recommendedSummary) {
  if (!elements.recommendedSummaryCards) return;
  const safeSummary = {
    total: Number(summary?.total || 0),
    awaitingSupport: Number(summary?.awaitingSupport || 0),
    supported: Number(summary?.supported || 0),
    linkedApplications: Number(summary?.linkedApplications || 0),
    linkedBeneficiaries: Number(summary?.linkedBeneficiaries || 0)
  };

  elements.recommendedSummaryCards.innerHTML = `
    <article class="metric-card"><span class="metric-label">Total records</span><strong class="metric-value">${safeSummary.total}</strong></article>
    <article class="metric-card"><span class="metric-label">Awaiting support</span><strong class="metric-value">${safeSummary.awaitingSupport}</strong></article>
    <article class="metric-card"><span class="metric-label">Supported</span><strong class="metric-value">${safeSummary.supported}</strong></article>
    <article class="metric-card"><span class="metric-label">Added to Applications</span><strong class="metric-value">${safeSummary.linkedApplications}</strong></article>
    <article class="metric-card"><span class="metric-label">Added to Beneficiaries</span><strong class="metric-value">${safeSummary.linkedBeneficiaries}</strong></article>
  `;
}

function renderRecommendedPreviewSummary(summary = {}) {
  if (!elements.recommendedPreviewSummaryCards) return;
  elements.recommendedPreviewSummaryCards.innerHTML = `
    <article class="metric-card"><span class="metric-label">Total rows</span><strong class="metric-value">${escapeHtml(summary.totalRows ?? 0)}</strong></article>
    <article class="metric-card"><span class="metric-label">Valid rows</span><strong class="metric-value">${escapeHtml(summary.validRows ?? 0)}</strong></article>
    <article class="metric-card"><span class="metric-label">Rows needing attention</span><strong class="metric-value">${escapeHtml(summary.invalidRows ?? 0)}</strong></article>
  `;
}

function renderRecommendedPreview(rows = state.recommendedPreview?.rows || []) {
  if (!elements.recommendedPreviewList) return;
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) {
    elements.recommendedPreviewList.innerHTML =
      `<p class="empty-state">Recommended-student preview rows will appear here after preview.</p>`;
    return;
  }

  elements.recommendedPreviewList.innerHTML = safeRows
    .slice(0, 20)
    .map(
      (row) => `
        <article class="search-result-card fade-in">
          <div class="search-result-top">
            <div>
              <strong>Row ${escapeHtml(row.rowNumber)}</strong>
              <p class="detail-subcopy">${escapeHtml(row.payload?.fullName || "Unnamed student")} | ${escapeHtml(
                row.payload?.schemeName || "No scheme"
              )}</p>
            </div>
            <span class="flag-pill ${row.status === "valid" ? "success" : "warning"}">${escapeHtml(
              row.status === "valid" ? "Ready" : "Needs attention"
            )}</span>
          </div>
          <p class="detail-subcopy">
            Ref: ${escapeHtml(row.payload?.studentReferenceId || "N/A")} | ${escapeHtml(
              row.payload?.academicYearLabel || "No academic year"
            )}
          </p>
          ${
            row.issues?.length
              ? `<ul class="issue-list">${row.issues
                  .map((issue) => `<li>${escapeHtml(issue)}</li>`)
                  .join("")}</ul>`
              : ""
          }
          ${
            row.warnings?.length
              ? `<p class="detail-subcopy">${escapeHtml(row.warnings.join(" "))}</p>`
              : ""
          }
        </article>
      `
    )
    .join("");
}

function renderRecommendedSchemeOptions() {
  if (!elements.recommendedSchemeSelect) return;
  const activeSchemes = (state.schemes || []).filter(
    (item) => String(item.status || "").toLowerCase() === "active"
  );
  elements.recommendedSchemeSelect.innerHTML = [
    `<option value="">Choose a scheme</option>`,
    ...activeSchemes.map(
      (item) =>
        `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} | ${escapeHtml(
          item.academicYearLabel || item.cycleLabel || "No academic year"
        )}</option>`
    )
  ].join("");
}

function renderRecommendedFilterOptions(filterOptions = state.recommendedFilterOptions) {
  const academicYears = Array.isArray(filterOptions?.academicYears) ? filterOptions.academicYears : [];
  const schemeNames = Array.isArray(filterOptions?.schemeNames) ? filterOptions.schemeNames : [];
  const statuses = Array.isArray(filterOptions?.statuses) ? filterOptions.statuses : [];

  if (elements.recommendedCycleFilter) {
    const currentValue = elements.recommendedCycleFilter.value;
    elements.recommendedCycleFilter.innerHTML = [
      `<option value="">All academic years</option>`,
      ...academicYears.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`)
    ].join("");
    elements.recommendedCycleFilter.value = academicYears.includes(currentValue) ? currentValue : "";
  }

  if (elements.recommendedSchemeFilter) {
    const currentValue = elements.recommendedSchemeFilter.value;
    elements.recommendedSchemeFilter.innerHTML = [
      `<option value="">All schemes</option>`,
      ...schemeNames.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`)
    ].join("");
    elements.recommendedSchemeFilter.value = schemeNames.includes(currentValue) ? currentValue : "";
  }

  if (elements.recommendedStatusFilter) {
    const currentValue = elements.recommendedStatusFilter.value;
    const availableStatuses = statuses.length ? statuses : ["awaiting_support", "supported"];
    elements.recommendedStatusFilter.innerHTML = [
      `<option value="">All statuses</option>`,
      ...availableStatuses.map(
        (item) =>
          `<option value="${escapeHtml(item)}">${escapeHtml(formatRecommendedStatusLabel(item))}</option>`
      )
    ].join("");
    elements.recommendedStatusFilter.value = availableStatuses.includes(currentValue) ? currentValue : "";
  }
}

function renderRecommendedManualPreview() {
  if (!elements.recommendedRegistryPreview) return;

  const preview = state.recommendedManualPreview;
  if (!preview) {
    elements.recommendedRegistryPreview.className = "helper-text field-span-2";
    elements.recommendedRegistryPreview.innerHTML =
      "Enter a student ID / reference number to preview the matched registry student before saving this recommendation.";
    return;
  }

  if (preview.loading) {
    elements.recommendedRegistryPreview.className = "inline-note tone-warning field-span-2";
    elements.recommendedRegistryPreview.textContent = "Checking the registry for this student...";
    return;
  }

  if (preview.error) {
    elements.recommendedRegistryPreview.className = "inline-note tone-error field-span-2";
    elements.recommendedRegistryPreview.textContent = preview.error;
    return;
  }

  const item = preview.item || null;
  if (!item) {
    elements.recommendedRegistryPreview.className = "inline-note tone-warning field-span-2";
    elements.recommendedRegistryPreview.textContent =
      "No registry student matched that student ID / reference number yet.";
    return;
  }

  elements.recommendedRegistryPreview.className = "inline-note tone-success field-span-2";
  elements.recommendedRegistryPreview.innerHTML = `
    <strong>${escapeHtml(item.fullName || "Matched student")}</strong><br />
    Ref: ${escapeHtml(item.studentReferenceId || "N/A")} | Index: ${escapeHtml(
      item.indexNumber || "N/A"
    )}<br />
    Programme: ${escapeHtml(item.program || "N/A")} | Year: ${escapeHtml(item.year || "N/A")}<br />
    College: ${escapeHtml(item.college || "N/A")} | Email: ${escapeHtml(item.email || "N/A")}
  `;
}

function renderSupportFoodBankAcademicYearOptions() {
  if (!elements.supportFoodBankAcademicYear) return;
  const currentValue = elements.supportFoodBankAcademicYear.value;
  const cycleLabels = (state.cycles || [])
    .map((item) => item.academicYearLabel || item.label || "")
    .filter(Boolean);
  const uniqueCycleLabels = [...new Set(cycleLabels)];
  elements.supportFoodBankAcademicYear.innerHTML = [
    `<option value="">Choose academic year</option>`,
    ...uniqueCycleLabels.map(
      (item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`
    )
  ].join("");
  elements.supportFoodBankAcademicYear.value = uniqueCycleLabels.includes(currentValue) ? currentValue : "";
}

function formatSupportFoodBankSupportTypeLabel(value) {
  switch (String(value || "").trim().toLowerCase()) {
    case "food_support":
      return "Food Support";
    case "clothing_support":
      return "Clothing Support";
    default:
      return "";
  }
}

function formatSupportFoodBankSemesterLabel(value) {
  switch (String(value || "").trim().toLowerCase()) {
    case "first_semester":
      return "First Semester";
    case "second_semester":
      return "Second Semester";
    default:
      return "Semester not captured";
  }
}

function formatSupportFoodBankSupportTypes(supportTypes = []) {
  const safeTypes = Array.isArray(supportTypes) ? supportTypes : [];
  const labels = safeTypes
    .map((item) => formatSupportFoodBankSupportTypeLabel(item))
    .filter(Boolean);
  return labels.length ? labels.join(" + ") : "Not selected";
}

function getSelectedSupportFoodBankSupportTypes() {
  const values = [];
  if (elements.supportFoodBankTypeFood?.checked) {
    values.push("food_support");
  }
  if (elements.supportFoodBankTypeClothing?.checked) {
    values.push("clothing_support");
  }
  return values;
}

function setSelectedSupportFoodBankSupportTypes(supportTypes = []) {
  const safeTypes = Array.isArray(supportTypes) ? supportTypes : [];
  if (elements.supportFoodBankTypeFood) {
    elements.supportFoodBankTypeFood.checked = safeTypes.includes("food_support");
  }
  if (elements.supportFoodBankTypeClothing) {
    elements.supportFoodBankTypeClothing.checked = safeTypes.includes("clothing_support");
  }
}

function renderSupportFoodBankManualPreview() {
  if (!elements.supportFoodBankRegistryPreview) return;

  const preview = state.supportFoodBankManualPreview;
  if (!preview) {
    elements.supportFoodBankRegistryPreview.className = "helper-text field-span-2";
    elements.supportFoodBankRegistryPreview.innerHTML =
      "Enter a student ID / reference number to preview the matched registry student before food or clothing support is recorded.";
    return;
  }

  if (preview.loading) {
    elements.supportFoodBankRegistryPreview.className = "inline-note tone-warning field-span-2";
    elements.supportFoodBankRegistryPreview.textContent = "Checking the registry for this student...";
    return;
  }

  if (preview.error) {
    elements.supportFoodBankRegistryPreview.className = "inline-note tone-error field-span-2";
    elements.supportFoodBankRegistryPreview.textContent = preview.error;
    return;
  }

  const item = preview.item || null;
  if (!item) {
    elements.supportFoodBankRegistryPreview.className = "inline-note tone-warning field-span-2";
    elements.supportFoodBankRegistryPreview.textContent =
      "No registry student matched that student ID / reference number yet.";
    return;
  }

  elements.supportFoodBankRegistryPreview.className = "inline-note tone-success field-span-2";
  elements.supportFoodBankRegistryPreview.innerHTML = `
    <strong>${escapeHtml(item.fullName || "Matched student")}</strong><br />
    Ref: ${escapeHtml(item.studentReferenceId || "N/A")} | Index: ${escapeHtml(
      item.indexNumber || "N/A"
    )}<br />
    Programme: ${escapeHtml(item.program || "N/A")} | Year: ${escapeHtml(item.year || "N/A")}<br />
    College: ${escapeHtml(item.college || "N/A")} | Email: ${escapeHtml(item.email || "N/A")}
  `;
}

function renderSupportFoodBankPreviewSummary() {
  if (!elements.supportFoodBankPreviewSummaryCards) return;
  const summary = state.supportFoodBankPreview?.summary || {
    totalRows: 0,
    matchedRows: 0,
    invalidRows: 0
  };
  elements.supportFoodBankPreviewSummaryCards.innerHTML = `
    <article class="metric-card"><span class="metric-label">Total rows</span><strong class="metric-value">${escapeHtml(summary.totalRows ?? 0)}</strong></article>
    <article class="metric-card"><span class="metric-label">Registry matched</span><strong class="metric-value">${escapeHtml(summary.matchedRows ?? 0)}</strong></article>
    <article class="metric-card"><span class="metric-label">Needs attention</span><strong class="metric-value">${escapeHtml(summary.invalidRows ?? 0)}</strong></article>
  `;
}

function setSupportFoodBankCreateMessage(text, tone = "warning") {
  if (!elements.supportFoodBankCreateMessage) return;
  elements.supportFoodBankCreateMessage.textContent = text;
  elements.supportFoodBankCreateMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setSupportFoodBankImportMessage(text, tone = "warning") {
  if (!elements.supportFoodBankImportMessage) return;
  elements.supportFoodBankImportMessage.textContent = text;
  elements.supportFoodBankImportMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setSupportFoodBankListMessage(text, tone = "warning") {
  if (!elements.supportFoodBankListMessage) return;
  elements.supportFoodBankListMessage.textContent = text;
  elements.supportFoodBankListMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function renderSupportFoodBankFilterOptions() {
  const options = state.supportFoodBankFilterOptions || { academicYears: [], statuses: [] };
  if (elements.supportFoodBankAcademicYearFilter) {
    const current = elements.supportFoodBankAcademicYearFilter.value;
    const academicYears = Array.isArray(options.academicYears) ? options.academicYears : [];
    elements.supportFoodBankAcademicYearFilter.innerHTML = [
      `<option value="">All academic years</option>`,
      ...academicYears.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`)
    ].join("");
    elements.supportFoodBankAcademicYearFilter.value = academicYears.includes(current) ? current : "";
  }
  if (elements.supportFoodBankStatusFilter) {
    const current = elements.supportFoodBankStatusFilter.value;
    const statuses = Array.isArray(options.statuses) ? options.statuses : [];
    elements.supportFoodBankStatusFilter.innerHTML = [
      `<option value="">All statuses</option>`,
      ...statuses.map(
        (item) =>
          `<option value="${escapeHtml(item)}">${escapeHtml(
            item === "served" ? "Served" : "Registered"
          )}</option>`
      )
    ].join("");
    elements.supportFoodBankStatusFilter.value = statuses.includes(current) ? current : "";
  }
}

function renderSupportFoodBankPreviewRows(rows = []) {
  if (!elements.supportFoodBankPreviewList) return;
  const items = Array.isArray(rows) ? rows : [];
  if (!items.length) {
    elements.supportFoodBankPreviewList.innerHTML =
      `<p class="empty-state">Food and clothing preview rows will appear here after preview.</p>`;
    return;
  }

  elements.supportFoodBankPreviewList.innerHTML = items
    .map(
      (row) => `
        <article class="search-result-card fade-in">
          <div class="search-result-top">
            <div>
              <strong>${escapeHtml(row.payload?.fullName || row.matchedStudent?.fullName || `Row ${row.rowNumber}`)}</strong>
              <p class="detail-subcopy">${escapeHtml(
                [row.payload?.academicYearLabel || "No academic year", formatSupportFoodBankSemesterLabel(row.payload?.semester)].filter(Boolean).join(" | ")
              )}</p>
            </div>
            <span class="flag-pill ${row.status === "valid" ? "success" : "error"}">${escapeHtml(
              row.status === "valid" ? "Ready" : "Needs attention"
            )}</span>
          </div>
          <div class="search-meta">
            <span class="meta-pill">Ref: ${escapeHtml(
              row.payload?.studentReferenceId || row.matchedStudent?.studentReferenceId || "N/A"
            )}</span>
            <span class="meta-pill">Source: ${escapeHtml(row.payload?.referralSource || "Not provided")}</span>
            <span class="meta-pill">Support: ${escapeHtml(
              formatSupportFoodBankSupportTypes(row.payload?.supportTypes || [])
            )}</span>
          </div>
          ${
            row.issues?.length
              ? `<ul class="issue-list">${row.issues
                  .map((issue) => `<li>${escapeHtml(issue)}</li>`)
                  .join("")}</ul>`
              : row.matchedStudent
                ? `<p class="detail-subcopy">Matched registry student: ${escapeHtml(
                    row.matchedStudent.fullName || "Matched student"
                  )}</p>`
                : ""
          }
        </article>
      `
    )
    .join("");
}

function renderSupportFoodBankRecords(items = state.supportFoodBankRecords) {
  if (!elements.supportFoodBankList) return;
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) {
    elements.supportFoodBankList.innerHTML =
      `<p class="empty-state">Food & Clothing registration records will appear here.</p>`;
    return;
  }

  elements.supportFoodBankList.innerHTML = safeItems
    .map(
      (item) => `
        <article class="search-result-card fade-in">
          <div class="search-result-top">
            <div>
              <strong>${escapeHtml(item.fullName || "Unknown student")}</strong>
              <p class="detail-subcopy">${escapeHtml(
                [item.academicYearLabel || "No academic year", formatSupportFoodBankSemesterLabel(item.semester)].filter(Boolean).join(" | ")
              )}</p>
            </div>
            <span class="flag-pill ${item.status === "served" ? "success" : "warning"}">${escapeHtml(
              item.status === "served" ? "Served" : "Registered"
            )}</span>
          </div>
          <div class="search-meta">
            <span class="meta-pill">Ref: ${escapeHtml(item.studentReferenceId || "N/A")}</span>
            <span class="meta-pill">College: ${escapeHtml(item.college || "N/A")}</span>
            <span class="meta-pill">Referral: ${escapeHtml(item.referralSource || "Not provided")}</span>
            <span class="meta-pill">Support: ${escapeHtml(
              formatSupportFoodBankSupportTypes(item.supportTypes || [])
            )}</span>
          </div>
          <div class="scheme-card-actions">
            <button
              class="action-button tertiary"
              type="button"
              data-food-bank-edit="${escapeHtml(item.id)}"
            >
              Edit
            </button>
            <button
              class="action-button tertiary"
              type="button"
              data-food-bank-remove="${escapeHtml(item.id)}"
            >
              Remove
            </button>
            <button
              class="action-button secondary"
              type="button"
              data-food-bank-served="${escapeHtml(item.id)}"
              ${item.status === "served" ? "disabled" : ""}
            >
              ${item.status === "served" ? "Already served" : "Mark served"}
            </button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderSupportFoodBankCreateFormState() {
  const isEditing = Boolean(state.supportFoodBankEditingRecordId);
  if (elements.supportFoodBankFormTitle) {
    elements.supportFoodBankFormTitle.textContent = isEditing
      ? "Edit a food or clothing support registration"
      : "Preview a student before recording food or clothing support";
  }
  if (elements.supportFoodBankCreateButton) {
    elements.supportFoodBankCreateButton.textContent = isEditing
      ? "Save support changes"
      : "Register student";
  }
  if (elements.supportFoodBankCancelButton) {
    elements.supportFoodBankCancelButton.hidden = !isEditing;
  }
}

function resetSupportFoodBankForm(options = {}) {
  if (supportFoodBankPreviewLookupTimer) {
    clearTimeout(supportFoodBankPreviewLookupTimer);
    supportFoodBankPreviewLookupTimer = null;
  }
  state.supportFoodBankEditingRecordId = null;
  state.supportFoodBankManualPreview = null;
  elements.supportFoodBankForm?.reset();
  setSelectedSupportFoodBankSupportTypes([]);
  renderSupportFoodBankAcademicYearOptions();
  renderSupportFoodBankManualPreview();
  renderSupportFoodBankCreateFormState();
  if (!options.preserveMessage) {
    setSupportFoodBankCreateMessage(
      "This uses the same registry-first matching pattern as Recommended Students so the student details and support types are confirmed before intake.",
      "warning"
    );
  }
}

function renderRecommendedCreateFormState() {
  const isEditing = Boolean(state.recommendedEditingRecordId);
  if (elements.recommendedFormTitle) {
    elements.recommendedFormTitle.textContent = isEditing
      ? "Edit a recommended student"
      : "Add a recommended student directly";
  }
  if (elements.recommendedCreateButton) {
    elements.recommendedCreateButton.textContent = isEditing
      ? "Save recommended student changes"
      : "Add recommended student";
  }
  if (elements.recommendedCancelButton) {
    elements.recommendedCancelButton.hidden = !isEditing;
  }
}

function resetRecommendedCreateForm(options = {}) {
  if (recommendedPreviewLookupTimer) {
    clearTimeout(recommendedPreviewLookupTimer);
    recommendedPreviewLookupTimer = null;
  }
  state.recommendedEditingRecordId = null;
  state.recommendedManualPreview = null;
  elements.recommendedCreateForm?.reset();
  renderRecommendedSchemeOptions();
  renderRecommendedManualPreview();
  renderRecommendedCreateFormState();
  if (!options.preserveMessage) {
    setRecommendedCreateMessage(
      "The student ID / reference number is matched to the registry first. The matched registry name, email, college, programme, and year are what follow the student into Applications and Beneficiaries handoffs.",
      "warning"
    );
  }
}

function renderRecommendedSelectedSummary() {
  if (!elements.recommendedSelectedSummary) return;
  const record = state.recommendedRecords.find(
    (item) => String(item.id) === String(state.recommendedSelectedRecordId || "")
  );
  if (!record) {
    elements.recommendedSelectedSummary.innerHTML =
      `Choose a recommended student from the records list to prepare a Beneficiaries &amp; Support handoff.`;
    return;
  }

  elements.recommendedSelectedSummary.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item">
        <span>Student</span>
        <strong>${escapeHtml(record.fullName || "Unnamed student")}</strong>
      </div>
      <div class="detail-item">
        <span>Reference ID</span>
        <strong>${escapeHtml(record.studentReferenceId || "N/A")}</strong>
      </div>
      <div class="detail-item">
        <span>Scheme</span>
        <strong>${escapeHtml(record.schemeName || "No scheme")}</strong>
      </div>
      <div class="detail-item">
        <span>Academic year</span>
        <strong>${escapeHtml(record.cycleLabel || "No academic year")}</strong>
      </div>
      <div class="detail-item">
        <span>Status</span>
        <strong>${escapeHtml(formatRecommendedStatusLabel(record.status))}</strong>
      </div>
      <div class="detail-item">
        <span>Applications status</span>
        <strong>${escapeHtml(record.linkedApplicationId ? `Application ${record.linkedApplicationId}` : "Not added yet")}</strong>
      </div>
      <div class="detail-item">
        <span>Beneficiaries handoff</span>
        <strong>${escapeHtml(record.linkedBeneficiaryId ? `Beneficiary ${record.linkedBeneficiaryId}` : "Not added yet")}</strong>
      </div>
    </div>
  `;
}

function renderRecommendedRecords(items = state.recommendedRecords) {
  if (!elements.recommendedList) return;
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) {
    elements.recommendedList.innerHTML =
      `<p class="empty-state">Recommended student records will appear here.</p>`;
    return;
  }

  elements.recommendedList.innerHTML = safeItems
    .map(
      (item) => `
        <article class="search-result-card fade-in ${
          String(item.id) === String(state.recommendedSelectedRecordId || "") ? "is-selected" : ""
        }">
          <div class="search-result-top">
            <div>
              <strong>${escapeHtml(item.fullName || "Unnamed student")}</strong>
              <p class="detail-subcopy">${escapeHtml(item.schemeName || "No scheme")} | ${escapeHtml(
                item.cycleLabel || "No academic year"
              )}</p>
            </div>
            <span class="flag-pill ${escapeHtml(getRecommendedRecordTone(item.status))}">${escapeHtml(
              formatRecommendedStatusLabel(item.status)
            )}</span>
          </div>
          <div class="search-meta">
            <span class="meta-pill">Ref: ${escapeHtml(item.studentReferenceId || "N/A")}</span>
            <span class="meta-pill">Index: ${escapeHtml(item.indexNumber || "N/A")}</span>
            <span class="meta-pill">Program: ${escapeHtml(item.program || "N/A")}</span>
            <span class="meta-pill">Year: ${escapeHtml(item.year || "N/A")}</span>
          </div>
          ${
            item.recommendationReason
              ? `<p class="detail-subcopy">Reason: ${escapeHtml(item.recommendationReason)}</p>`
              : ""
          }
          ${
            item.notes
              ? `<p class="detail-subcopy">Notes: ${escapeHtml(item.notes)}</p>`
              : ""
          }
          <div class="action-row">
            <button class="action-button tertiary" type="button" data-recommended-select="${escapeHtml(
              item.id
            )}">Prepare support handoff</button>
            <button
              class="action-button secondary"
              type="button"
              data-recommended-application="${escapeHtml(item.id)}"
              ${item.linkedApplicationId ? "disabled" : ""}
            >
              ${item.linkedApplicationId ? "Already in Applications" : "Add to Applications"}
            </button>
            <button
              class="action-button ghost"
              type="button"
              data-recommended-beneficiary="${escapeHtml(item.id)}"
              ${item.linkedBeneficiaryId || item.status === "supported" ? "disabled" : ""}
            >
              ${item.linkedBeneficiaryId || item.status === "supported"
                ? "Already supported"
                : "Support this student"}
            </button>
            <button
              class="action-button tertiary"
              type="button"
              data-recommended-edit="${escapeHtml(item.id)}"
              ${item.linkedApplicationId || item.linkedBeneficiaryId || item.status === "supported" ? "disabled" : ""}
            >
              Edit
            </button>
            <button
              class="action-button tertiary"
              type="button"
              data-recommended-remove="${escapeHtml(item.id)}"
              ${item.linkedApplicationId || item.linkedBeneficiaryId || item.status === "supported" ? "disabled" : ""}
            >
              Remove
            </button>
          </div>
        </article>
      `
    )
    .join("");
}

function syncRecommendedControls() {
  const canManage = canManageRecommendedStudents();
  const canImport = canManageRecommendedImports();
  const hasPreviewRows = Number(state.recommendedPreview?.summary?.validRows || 0) > 0;
  const selectedRecord = state.recommendedRecords.find(
    (item) => String(item.id) === String(state.recommendedSelectedRecordId || "")
  );
  const hasSelectedRecord = Boolean(selectedRecord);

  if (elements.recommendedCreateButton) {
    elements.recommendedCreateButton.disabled = !canManage;
  }
  if (elements.recommendedPreviewButton) {
    elements.recommendedPreviewButton.disabled = !canImport;
  }
  if (elements.recommendedImportButton) {
    elements.recommendedImportButton.disabled = !canImport || !hasPreviewRows;
  }
  if (elements.recommendedApplicationButton) {
    elements.recommendedApplicationButton.disabled =
      !canManage || !hasSelectedRecord || Boolean(selectedRecord?.linkedApplicationId);
  }
  if (elements.recommendedSupportButton) {
    elements.recommendedSupportButton.disabled = !canManage || !hasSelectedRecord;
  }
}

function setReportsOverviewMessage(text, tone = "warning") {
  if (!elements.reportsOverviewMessage) return;
  elements.reportsOverviewMessage.textContent = text;
  elements.reportsOverviewMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setReportsBeneficiarySchemeMessage(text, tone = "warning") {
  if (!elements.reportsBeneficiarySchemeMessage) return;
  elements.reportsBeneficiarySchemeMessage.textContent = text;
  elements.reportsBeneficiarySchemeMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function getBeneficiaryCohortTotals(summary = {}) {
  return {
    current: Number(summary?.cohortTotals?.current || 0),
    new: Number(summary?.cohortTotals?.new || 0),
    untagged: Number(summary?.cohortTotals?.untagged || 0),
    carriedForward: Number(summary?.cohortTotals?.carriedForward || 0)
  };
}

function getBeneficiaryPreviewCategory(row = {}) {
  const warningsAndIssues = [...(row.issues || []), ...(row.warnings || [])].join(" ").toLowerCase();

  if (
    row?.payload?.carriedForwardFromPriorYear ||
    warningsAndIssues.includes("previous academic year") ||
    warningsAndIssues.includes("carried forward")
  ) {
    return "carried_forward";
  }
  if (warningsAndIssues.includes("duplicate") || warningsAndIssues.includes("already exists")) {
    return "duplicate";
  }
  if (row?.payload?.beneficiaryCohort === "new") {
    return "new";
  }
  if (row?.payload?.beneficiaryCohort === "current") {
    return "current";
  }
  return "all";
}

function getFilteredBeneficiaryPreviewRows(rows = state.beneficiaryPreview?.rows || []) {
  const selectedFilter = state.beneficiaryPreviewFilter || "all";
  if (selectedFilter === "all") {
    return Array.isArray(rows) ? rows : [];
  }

  return (Array.isArray(rows) ? rows : []).filter(
    (row) => getBeneficiaryPreviewCategory(row) === selectedFilter
  );
}

function getDuplicateReviewRows(rows = state.beneficiaryPreview?.rows || []) {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const combined = [...(row.issues || []), ...(row.warnings || [])].join(" ").toLowerCase();
    return combined.includes("already exists") || combined.includes("duplicate") || combined.includes("other support records");
  });
}

function getBeneficiaryDuplicateStrategyLabel(value) {
  const strategy = String(value || "skip");
  if (strategy === "import_anyway") return "Import anyway";
  if (strategy === "replace_existing") return "Replace existing";
  return "Skip";
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function renderBeneficiarySummary(summary = {}) {
  if (!elements.beneficiarySummaryCards) return;
  elements.beneficiarySummaryCards.innerHTML = `
        <article class="metric-card">
          <span class="metric-label">Total rows</span>
      <strong class="metric-value">${escapeHtml(summary.totalRows ?? 0)}</strong>
    </article>
    <article class="metric-card">
      <span class="metric-label">Valid rows</span>
      <strong class="metric-value">${escapeHtml(summary.validRows ?? 0)}</strong>
    </article>
      <article class="metric-card">
        <span class="metric-label">Rows needing attention</span>
        <strong class="metric-value">${escapeHtml(summary.invalidRows ?? 0)}</strong>
      </article>
        <article class="metric-card">
          <span class="metric-label">Blank support type rows</span>
          <strong class="metric-value">${escapeHtml(summary.unknownSupportTypeRows ?? 0)}</strong>
        </article>
        <article class="metric-card">
          <span class="metric-label">Carried forward rows</span>
          <strong class="metric-value">${escapeHtml(summary.rolledForwardRows ?? 0)}</strong>
        </article>
        <article class="metric-card">
          <span class="metric-label">Duplicate rows</span>
          <strong class="metric-value">${escapeHtml(summary.duplicateRows ?? 0)}</strong>
        </article>
        <article class="metric-card">
          <span class="metric-label">Cross-scheme/year duplicates</span>
          <strong class="metric-value">${escapeHtml(summary.crossScopeDuplicateRows ?? 0)}</strong>
        </article>
        <article class="metric-card">
          <span class="metric-label">Cohort-tagged rows</span>
          <strong class="metric-value">${escapeHtml(summary.cohortTaggedRows ?? 0)}</strong>
        </article>
    `;
}

function renderBeneficiaryIssues(rows = []) {
  if (!elements.beneficiaryIssueList) return;
  const issues = getFilteredBeneficiaryPreviewRows(rows).filter((row) => row.status !== "valid");
  if (!issues.length) {
    elements.beneficiaryIssueList.innerHTML =
      `<p class="empty-state">No beneficiary import issues match the current preview filter.</p>`;
    return;
  }

  elements.beneficiaryIssueList.innerHTML = issues
    .slice(0, 20)
    .map(
      (row) => `
        <article class="search-result-card fade-in">
          <div class="search-result-top">
            <div>
              <strong>Row ${escapeHtml(row.rowNumber)}</strong>
              <p class="detail-subcopy">${escapeHtml(row.payload?.fullName || "Unnamed beneficiary")} | ${escapeHtml(
                row.payload?.academicYearLabel || "No academic year"
              )}</p>
            </div>
          </div>
          <ul class="issue-list">
            ${row.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}
          </ul>
          ${
            row.warnings?.length
              ? `<p class="detail-subcopy">${escapeHtml(row.warnings.join(" "))}</p>`
              : ""
          }
        </article>
      `
    )
    .join("");
}

function renderBeneficiaryDuplicateReview(rows = state.beneficiaryPreview?.rows || []) {
  if (!elements.beneficiaryDuplicateReviewList) return;
  const duplicateRows = getDuplicateReviewRows(rows);
  if (!duplicateRows.length) {
    elements.beneficiaryDuplicateReviewList.innerHTML =
      `<p class="empty-state">No duplicate review items match this preview yet.</p>`;
    return;
  }

  elements.beneficiaryDuplicateReviewList.innerHTML = duplicateRows
    .map((row) => {
      const isActionableDuplicate = [...(row.issues || []), ...(row.warnings || [])]
        .join(" ")
        .toLowerCase()
        .includes("same support name and academic year");
      const selectedAction =
        state.beneficiaryDuplicateRowActions[row.rowNumber] ||
        row.duplicateStrategy ||
        state.beneficiaryDuplicateStrategy ||
        "skip";

      return `
        <article class="search-result-card fade-in">
          <div class="search-result-top">
            <div>
              <strong>Row ${escapeHtml(row.rowNumber)}</strong>
              <p class="detail-subcopy">${escapeHtml(row.payload?.fullName || "Unnamed beneficiary")} | ${escapeHtml(
                row.payload?.schemeName || "No support"
              )} | ${escapeHtml(row.payload?.academicYearLabel || "No year")}</p>
            </div>
            <span class="dashboard-mini-pill">${escapeHtml(row.payload?.studentReferenceId || "No ID")}</span>
          </div>
          <p class="detail-subcopy">${escapeHtml(
            [...(row.issues || []), ...(row.warnings || [])].join(" ")
          )}</p>
          ${
            isActionableDuplicate
              ? `<label class="field duplicate-resolution-field">
                  <span>Duplicate action for this row</span>
                  <select class="select-field" data-beneficiary-duplicate-row="${escapeHtml(row.rowNumber)}">
                    <option value="skip" ${selectedAction === "skip" ? "selected" : ""}>Skip row</option>
                    <option value="import_anyway" ${selectedAction === "import_anyway" ? "selected" : ""}>Import anyway</option>
                    <option value="replace_existing" ${selectedAction === "replace_existing" ? "selected" : ""}>Replace existing</option>
                  </select>
                </label>`
              : `<p class="detail-subcopy">Cross-scheme/year duplicate warning only. This row is still importable unless another issue blocks it.</p>`
          }
        </article>
      `;
    })
    .join("");
}

function renderBeneficiaryValidRows(rows = []) {
  if (!elements.beneficiaryValidRowsTable) return;
  const validRows = getFilteredBeneficiaryPreviewRows(rows)
    .filter((row) => row.status === "valid")
    .slice(0, 15);
  if (!validRows.length) {
        elements.beneficiaryValidRowsTable.innerHTML =
          `<tr><td colspan="7" class="empty-cell">No beneficiary preview rows match the current filter yet.</td></tr>`;
        return;
  }

  elements.beneficiaryValidRowsTable.innerHTML = validRows
      .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.payload?.academicYearLabel || "—")}</td>
            <td>${escapeHtml(row.payload?.schemeName || "—")}</td>
              <td>${escapeHtml(row.payload?.fullName || "—")}</td>
              <td>${escapeHtml(row.payload?.college || "—")}</td>
              <td>${escapeHtml(row.payload?.currency || "GHS")} ${escapeHtml(row.payload?.amountPaid ?? "0")}</td>
              <td>${escapeHtml(row.payload?.supportType || "unknown")}${
                row.warnings?.length
                  ? `<div class="detail-subcopy">${escapeHtml(row.warnings.join(" "))}</div>`
                  : ""
            }</td>
            <td>${escapeHtml(row.payload?.beneficiaryCohort || "not tagged")}</td>
          </tr>
        `
      )
      .join("");
}

function renderBeneficiaryImportResults(result = state.lastBeneficiaryImport) {
  if (elements.beneficiaryImportResultSummary) {
    const cohortTotals = getBeneficiaryCohortTotals(result?.summary || {});
    elements.beneficiaryImportResultSummary.innerHTML = `
      <article class="metric-card"><span class="metric-label">Imported rows</span><strong class="metric-value">${escapeHtml(
        result?.summary?.importedRows ?? 0
      )}</strong></article>
      <article class="metric-card"><span class="metric-label">Replaced existing</span><strong class="metric-value">${escapeHtml(
        result?.summary?.replacedRows ?? 0
      )}</strong></article>
      <article class="metric-card"><span class="metric-label">Current</span><strong class="metric-value">${escapeHtml(
        cohortTotals.current
      )}</strong></article>
      <article class="metric-card"><span class="metric-label">New</span><strong class="metric-value">${escapeHtml(
        cohortTotals.new
      )}</strong></article>
      <article class="metric-card"><span class="metric-label">Not tagged</span><strong class="metric-value">${escapeHtml(
        cohortTotals.untagged
      )}</strong></article>
      <article class="metric-card"><span class="metric-label">Carried forward</span><strong class="metric-value">${escapeHtml(
        cohortTotals.carriedForward
      )}</strong></article>
    `;
  }
  if (!elements.beneficiaryImportedRowsList) return;
  if (!result?.items?.length) {
    elements.beneficiaryImportedRowsList.innerHTML =
      `<p class="empty-state">Imported beneficiary rows will appear here after a successful import.</p>`;
    return;
  }

  elements.beneficiaryImportedRowsList.innerHTML = result.items
    .slice(0, 20)
    .map(
      (item) => `
        <article class="search-result-card fade-in">
          <div class="search-result-top">
            <div>
              <strong>${escapeHtml(item.fullName || "Unnamed beneficiary")}</strong>
              <p class="detail-subcopy">${escapeHtml(item.academicYearLabel || "No academic year")} | ${escapeHtml(
                item.schemeName || "No support name"
              )}</p>
            </div>
            <span class="dashboard-mini-pill">${escapeHtml(item.currency || "GHS")} ${escapeHtml(
              item.amountPaid ?? 0
            )}</span>
            </div>
            <p class="detail-subcopy">Batch: ${escapeHtml(result.batchReference || "N/A")} | Import mode: ${escapeHtml(
              item.importMode || "historical_archive"
            )} | Duplicate action: ${escapeHtml(
              getBeneficiaryDuplicateStrategyLabel(result?.duplicateStrategy || state.beneficiaryDuplicateStrategy)
            )} | Cohort: ${escapeHtml(item.beneficiaryCohort || "not tagged")}${
              item.carriedForwardFromPriorYear ? " | Carried forward from prior-year new cohort" : ""
            }</p>
            ${
              item.linkedWaitlistEntryId
                ? `<p class="detail-subcopy">Trace: linked recommendation record ${escapeHtml(
                    item.linkedWaitlistEntryId
                  )}${item.linkedApplicationId ? ` | Application ${escapeHtml(item.linkedApplicationId)}` : ""}</p>`
                : ""
            }
          </article>
        `
    )
    .join("");
}

function renderBeneficiaryRecords(items = state.beneficiaryRecords) {
  if (!elements.beneficiaryList) return;
  if (!items.length) {
    elements.beneficiaryList.innerHTML =
      `<p class="empty-state">No beneficiary records match the current filters yet.</p>`;
    return;
  }

  elements.beneficiaryList.innerHTML = items
    .map(
      (item) => `
        <article class="search-result-card fade-in ${
          String(item.id) === String(state.beneficiaryEditingRecordId || "") ? "is-selected" : ""
        }">
          <div class="search-result-top">
            <div>
              <strong>${escapeHtml(item.fullName || "Unnamed beneficiary")}</strong>
              <p class="detail-subcopy">${escapeHtml(item.schemeName || "No support name")} | ${escapeHtml(
                item.academicYearLabel || "No academic year"
              )}</p>
            </div>
            <span class="dashboard-mini-pill">${escapeHtml(item.currency || "GHS")} ${escapeHtml(
              item.amountPaid ?? 0
            )}</span>
          </div>
            <p class="detail-subcopy">
              ${escapeHtml(item.sponsorName || "Sponsor not provided")} | ${escapeHtml(item.supportType || "unknown")} support${
                item.college ? ` | ${escapeHtml(item.college)}` : ""
              }
            </p>
            <p class="detail-subcopy">
              Reference: ${escapeHtml(item.studentReferenceId || "N/A")} | Index: ${escapeHtml(
                item.indexNumber || "N/A"
              )} | Import mode: ${escapeHtml(item.importMode || "historical_archive")} | Cohort: ${escapeHtml(
                item.beneficiaryCohort || "not tagged"
              )}${item.carriedForwardFromPriorYear ? " | Carried forward" : ""}
            </p>
          ${
            item.linkedWaitlistEntryId
              ? `<p class="detail-subcopy">Trace: promoted from recommendation record ${escapeHtml(
                  item.linkedWaitlistEntryId
                )}${item.linkedApplicationId ? ` | Application ${escapeHtml(item.linkedApplicationId)}` : ""}</p>`
              : ""
          }
          ${
            item.remarks
              ? `<p class="detail-subcopy">Remarks: ${escapeHtml(item.remarks)}</p>`
              : ""
          }
          ${
            canManageBeneficiaryImports()
              ? `<div class="action-row">
                  <button class="action-button tertiary" type="button" data-beneficiary-edit="${escapeHtml(
                    item.id
                  )}">Manage row</button>
                  <button class="action-button ghost" type="button" data-beneficiary-history="${escapeHtml(
                    item.id
                  )}">View history</button>
                </div>`
              : `<div class="action-row">
                  <button class="action-button ghost" type="button" data-beneficiary-history="${escapeHtml(
                    item.id
                  )}">View history</button>
                </div>`
          }
        </article>
      `
    )
      .join("");
}

function renderBeneficiaryEditor(recordId = state.beneficiaryEditingRecordId) {
  const target = state.beneficiaryRecords.find((item) => String(item.id) === String(recordId || ""));
  state.beneficiaryEditingRecordId = target ? target.id : null;

  if (elements.beneficiaryEditorAcademicYear) {
    elements.beneficiaryEditorAcademicYear.value = target?.academicYearLabel || "";
    elements.beneficiaryEditorSchemeName.value = target?.schemeName || "";
    elements.beneficiaryEditorFullName.value = target?.fullName || "";
    elements.beneficiaryEditorStudentReferenceId.value = target?.studentReferenceId || "";
    elements.beneficiaryEditorIndexNumber.value = target?.indexNumber || "";
    elements.beneficiaryEditorSponsorName.value = target?.sponsorName || "";
    elements.beneficiaryEditorCollege.value = target?.college || "";
    elements.beneficiaryEditorAmountPaid.value = target?.amountPaid ?? "";
    elements.beneficiaryEditorCurrency.value = target?.currency || "GHS";
    elements.beneficiaryEditorSupportType.value = target?.supportType || "unknown";
    elements.beneficiaryEditorCohort.value = target?.beneficiaryCohort || "";
    elements.beneficiaryEditorRemarks.value = target?.remarks || "";
    elements.beneficiaryEditorReplaceExisting.checked = false;
    elements.beneficiaryEditorChangeReason.value = "";
    if (!target) {
      elements.beneficiaryEditorRemovalReason.value = "";
    }
  }

  const disabled = !target || !canManageBeneficiaryImports();
  if (elements.beneficiaryEditorSaveButton) elements.beneficiaryEditorSaveButton.disabled = disabled;
  if (elements.beneficiaryEditorDeleteButton) elements.beneficiaryEditorDeleteButton.disabled = disabled;
  if (elements.beneficiaryEditorCancelButton) elements.beneficiaryEditorCancelButton.disabled = !target;

  if (!target) {
    setBeneficiaryEditorMessage(
      "Select a beneficiary row to edit its lifecycle details and review safe replacement or removal controls.",
      "warning"
    );
    return;
  }

  setBeneficiaryEditorMessage(
    `Managing ${target.fullName || "the selected beneficiary"} under ${target.schemeName || "the selected support"}.`,
    "success"
  );
}

function renderBeneficiaryRecordHistory(history = state.beneficiaryRecordHistory) {
  if (!elements.beneficiaryRecordHistoryList) return;
  const items = history?.items || [];
  if (!items.length) {
    elements.beneficiaryRecordHistoryList.innerHTML =
      `<p class="empty-state">No beneficiary record history loaded yet.</p>`;
    return;
  }

  elements.beneficiaryRecordHistoryList.innerHTML = items
    .map(
      (item) => `
        <article class="search-result-card fade-in">
          <div class="search-result-top">
            <div>
              <strong>${escapeHtml(formatDecisionLabel(String(item.eventType || "").replaceAll("_", " ")))}</strong>
              <p class="detail-subcopy">${escapeHtml(item.summary || "Beneficiary lifecycle update")}</p>
            </div>
            <span class="dashboard-mini-pill">${escapeHtml(formatDateTime(item.createdAt) || "Unknown")}</span>
          </div>
          <p class="detail-subcopy">
            Actor: ${escapeHtml(item.actorName || "System")}${
              item.batchReference ? ` | Batch: ${escapeHtml(item.batchReference)}` : ""
            }
          </p>
          ${item.reason ? `<p class="detail-subcopy">Reason: ${escapeHtml(item.reason)}</p>` : ""}
          ${
            item.snapshot
              ? `<p class="detail-subcopy">Snapshot: ${escapeHtml(
                  `${item.snapshot.academicYearLabel || "No year"} | ${item.snapshot.schemeName || "No support"} | ${item.snapshot.studentReferenceId || "No ref"}`
                )}</p>
                 <p class="detail-subcopy">Amount: ${escapeHtml(
                   `${item.snapshot.currency || "GHS"} ${Number(item.snapshot.amountPaid || 0).toLocaleString(undefined, {
                     minimumFractionDigits: 0,
                     maximumFractionDigits: 2
                   })}`
                 )} | Cohort: ${escapeHtml(
                   item.snapshot.beneficiaryCohort
                     ? formatDecisionLabel(String(item.snapshot.beneficiaryCohort))
                     : "Not tagged"
                 )}${item.snapshot.college ? ` | College: ${escapeHtml(item.snapshot.college)}` : ""}</p>`
              : ""
          }
        </article>
      `
    )
    .join("");
}

function renderBeneficiaryAuditFeed(items = state.beneficiaryAuditFeed) {
  if (!elements.beneficiaryAuditList) return;
  if (!(items || []).length) {
    elements.beneficiaryAuditList.innerHTML =
      `<p class="empty-state">No beneficiary lifecycle events match the current filters yet.</p>`;
    return;
  }

  elements.beneficiaryAuditList.innerHTML = (items || [])
    .map(
      (item) => `
        <article class="search-result-card fade-in">
          <div class="search-result-top">
            <div>
              <strong>${escapeHtml(formatDecisionLabel(String(item.eventType || "").replaceAll("_", " ")))}</strong>
              <p class="detail-subcopy">${escapeHtml(item.summary || "Beneficiary lifecycle update")}</p>
            </div>
            <span class="dashboard-mini-pill">${escapeHtml(formatDateTime(item.createdAt) || "Unknown")}</span>
          </div>
          <p class="detail-subcopy">
            ${escapeHtml(item.schemeName || "No support")} | ${escapeHtml(item.academicYearLabel || "No academic year")} | ${escapeHtml(item.studentReferenceId || "No reference ID")}
          </p>
          <p class="detail-subcopy">
            Actor: ${escapeHtml(item.actorName || "System")}${
              item.batchReference ? ` | Batch: ${escapeHtml(item.batchReference)}` : ""
            }
          </p>
          ${item.reason ? `<p class="detail-subcopy">Reason: ${escapeHtml(item.reason)}</p>` : ""}
        </article>
      `
    )
    .join("");
}

function renderBeneficiaryImportHistory(history = state.beneficiaryImportHistory) {
  if (!elements.beneficiaryImportHistoryList) return;
  const items = history?.items || [];
  if (!items.length) {
    elements.beneficiaryImportHistoryList.innerHTML =
      `<p class="empty-state">No beneficiary import history matches the current academic year and support selection yet.</p>`;
    return;
  }

  elements.beneficiaryImportHistoryList.innerHTML = items
    .map(
      (item, index) => `
        <article class="search-result-card fade-in">
          <div class="search-result-top">
            <div>
              <strong>${escapeHtml(item.fileName || "Unknown source")}</strong>
              <p class="detail-subcopy">${escapeHtml(item.schemeName || "No support name")} | ${escapeHtml(
                item.academicYearLabel || "No academic year"
              )}</p>
            </div>
            <span class="dashboard-mini-pill">${escapeHtml(item.rowCount ?? 0)} row(s)</span>
          </div>
          <p class="detail-subcopy">Batch: ${escapeHtml(item.batchReference || "N/A")} | Import mode: ${escapeHtml(
            item.importMode || "historical_archive"
          )} | Duplicate action: ${escapeHtml(
            getBeneficiaryDuplicateStrategyLabel(item.duplicateStrategy || "skip")
          )}</p>
          <p class="detail-subcopy">Status: ${escapeHtml(
            item.status || "active"
          )} | Created: ${escapeHtml(formatDateTime(item.createdAt) || "Unknown")} | Imported by: ${escapeHtml(
            item.createdByName || "Not recorded"
          )}</p>
          ${
            item.replacedRows
              ? `<p class="detail-subcopy">Replaced rows: ${escapeHtml(item.replacedRows)}</p>`
              : ""
          }
          ${
            item.status === "rolled_back"
              ? `<p class="detail-subcopy">Rollback: ${escapeHtml(
                  item.rollbackDeletedRows ?? 0
                )} row(s) removed on ${escapeHtml(formatDateTime(item.rolledBackAt) || "Unknown")} by ${escapeHtml(
                  item.rolledBackByName || "Not recorded"
                )}${item.rollbackReason ? ` | Reason: ${escapeHtml(item.rollbackReason)}` : ""}</p>`
              : ""
          }
          ${
            canManageBeneficiaryImports() && index === 0 && item.status !== "rolled_back"
              ? `<div class="action-row">
                  <button class="action-button danger" type="button" data-beneficiary-rollback="${escapeHtml(
                    item.batchReference
                  )}">Rollback latest batch</button>
                </div>`
              : ""
          }
        </article>
      `
    )
    .join("");
}

function populateBeneficiaryFilterSelect(selectElement, values, emptyLabel, previousValue = "") {
  if (!selectElement) return;
  const options = Array.isArray(values) ? values : [];
  selectElement.innerHTML = [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...options.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
  ].join("");

  if (previousValue && options.includes(previousValue)) {
    selectElement.value = previousValue;
  } else {
    selectElement.value = "";
  }
}

function renderBeneficiaryFilterOptions(filterOptions = state.beneficiaryFilterOptions) {
  const safeOptions = filterOptions || { academicYears: [], schemeNames: [], colleges: [] };
  populateBeneficiaryFilterSelect(
    elements.beneficiaryAcademicYearFilter,
    safeOptions.academicYears,
    "All academic years",
    elements.beneficiaryAcademicYearFilter?.value || ""
  );
  populateBeneficiaryFilterSelect(
    elements.beneficiarySchemeFilter,
    safeOptions.schemeNames,
    "All support names",
    elements.beneficiarySchemeFilter?.value || ""
  );
  populateBeneficiaryFilterSelect(
    elements.beneficiaryCollegeFilter,
    safeOptions.colleges,
    "All colleges",
    elements.beneficiaryCollegeFilter?.value || ""
  );
  populateBeneficiaryFilterSelect(
    elements.reportsBeneficiaryAcademicYear,
    safeOptions.academicYears,
    "Choose academic year",
    elements.reportsBeneficiaryAcademicYear?.value || ""
  );
  populateBeneficiaryFilterSelect(
    elements.reportsBeneficiarySchemeName,
    safeOptions.schemeNames,
    "Choose support name",
    elements.reportsBeneficiarySchemeName?.value || ""
  );
  if (
    (!elements.reportsBeneficiaryAcademicYear?.value || !elements.reportsBeneficiarySchemeName?.value) &&
    state.reportsBeneficiarySchemeReport
  ) {
    state.reportsBeneficiarySchemeReport = null;
    renderReportsBeneficiarySchemeReport();
  }
  syncReportsBeneficiarySchemeControls();
}

function renderReportsBeneficiarySchemeReport(report = state.reportsBeneficiarySchemeReport) {
  if (elements.reportsBeneficiarySchemeCards) {
    elements.reportsBeneficiarySchemeCards.innerHTML = `
      <article class="metric-card"><span class="metric-label">Beneficiaries</span><strong class="metric-value">${escapeHtml(
        report?.totalBeneficiaries ?? 0
      )}</strong></article>
      <article class="metric-card"><span class="metric-label">Amount totals</span><strong class="metric-value">${escapeHtml(
        report?.totalAmountPaidLabel || "GHS 0"
      )}</strong>${renderBeneficiaryCurrencyBreakdown(
        report?.currencyTotals || [],
        report?.totalAmountPaidLabel || "GHS 0"
      )}</article>
      <article class="metric-card"><span class="metric-label">Current</span><strong class="metric-value">${escapeHtml(
        report?.cohortCounts?.current ?? 0
      )}</strong></article>
      <article class="metric-card"><span class="metric-label">New</span><strong class="metric-value">${escapeHtml(
        report?.cohortCounts?.new ?? 0
      )}</strong></article>
      <article class="metric-card"><span class="metric-label">Not tagged</span><strong class="metric-value">${escapeHtml(
        report?.cohortCounts?.untagged ?? 0
      )}</strong></article>
      <article class="metric-card"><span class="metric-label">Carried forward</span><strong class="metric-value">${escapeHtml(
        report?.cohortCounts?.carriedForward ?? 0
      )}</strong></article>
      <article class="metric-card"><span class="metric-label">Colleges represented</span><strong class="metric-value">${escapeHtml(
        report?.collegesRepresentedCount ?? 0
      )}</strong></article>
    `;
  }

  if (!elements.reportsBeneficiarySchemeCollegeTable) return;
  if (!report?.collegeBreakdown?.length) {
    elements.reportsBeneficiarySchemeCollegeTable.innerHTML =
      `<tr><td colspan="7" class="empty-cell">Scheme college breakdown will appear here.</td></tr>`;
    return;
  }

  elements.reportsBeneficiarySchemeCollegeTable.innerHTML = report.collegeBreakdown
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.college || "Not tagged")}</td>
          <td>${escapeHtml(item.beneficiaryCount ?? 0)}</td>
          <td>${escapeHtml(item.amountPaidLabel || "GHS 0")}</td>
          <td>${escapeHtml(item.cohortCounts?.current ?? 0)}</td>
          <td>${escapeHtml(item.cohortCounts?.new ?? 0)}</td>
          <td>${escapeHtml(item.cohortCounts?.untagged ?? 0)}</td>
          <td>${escapeHtml(item.cohortCounts?.carriedForward ?? 0)}</td>
        </tr>
      `
    )
    .join("");
}

function syncReportsBeneficiarySchemeControls() {
  const hasSelection =
    Boolean(elements.reportsBeneficiaryAcademicYear?.value) &&
    Boolean(elements.reportsBeneficiarySchemeName?.value);
  if (elements.reportsBeneficiaryLoadButton) {
    elements.reportsBeneficiaryLoadButton.disabled = !hasSelection;
  }
  if (elements.reportsBeneficiaryExportButton) {
    elements.reportsBeneficiaryExportButton.disabled = !hasSelection;
  }
}

function buildBeneficiaryListUrl() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    throw new Error("Enter the API URL first.");
  }

  const url = new URL(`${apiBaseUrl}/api/beneficiaries`);
  const query = elements.beneficiarySearchQuery?.value.trim();
  const academicYearLabel = elements.beneficiaryAcademicYearFilter?.value.trim();
  const schemeName = elements.beneficiarySchemeFilter?.value.trim();
  const college = elements.beneficiaryCollegeFilter?.value.trim();
  const supportType = elements.beneficiarySupportTypeFilter?.value || "";

  if (query) url.searchParams.set("q", query);
  if (academicYearLabel) url.searchParams.set("academicYearLabel", academicYearLabel);
  if (schemeName) url.searchParams.set("schemeName", schemeName);
  if (college) url.searchParams.set("college", college);
  if (supportType) url.searchParams.set("supportType", supportType);

  return url.toString();
}

function getScopedBeneficiaryClearSelection() {
  return {
    academicYearLabel: elements.beneficiaryAcademicYearFilter?.value.trim() || "",
    schemeName: elements.beneficiarySchemeFilter?.value.trim() || ""
  };
}

function getBeneficiaryDuplicateStrategy() {
  return elements.beneficiaryDuplicateStrategy?.value || state.beneficiaryDuplicateStrategy || "skip";
}

async function postBeneficiaryImport(endpoint) {
  const apiBaseUrl = getApiBaseUrl();
  const files = Array.from(elements.beneficiaryFile.files || []);

  if (!canManageBeneficiaryImports()) {
    throw new Error("Only admins can import beneficiary files.");
  }
  if (!apiBaseUrl) {
    throw new Error("Enter the API URL first.");
  }
  if (!files.length) {
    throw new Error("Choose at least one beneficiary file first.");
  }

  const formData = new FormData();
  formData.append("importMode", elements.beneficiaryImportMode.value || "historical_archive");
  formData.append("beneficiaryCohort", elements.beneficiaryCohort?.value || "");
  formData.append("defaultCurrency", elements.beneficiaryImportCurrency?.value || "");
  formData.append(
    "categorizedByCollege",
    elements.beneficiaryCategorizedByCollege?.checked ? "true" : "false"
  );
  formData.append("duplicateStrategy", getBeneficiaryDuplicateStrategy());
  formData.append(
    "allowDuplicates",
    getBeneficiaryDuplicateStrategy() === "import_anyway" ? "true" : "false"
  );
  formData.append("duplicateRowActions", JSON.stringify(state.beneficiaryDuplicateRowActions || {}));
  for (const file of files) {
    formData.append("files", file);
  }

  const response = await fetch(`${apiBaseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      ...getAuthHeaders()
    },
    body: formData
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "The beneficiary import request failed.");
  }

  return payload;
}

async function handleBeneficiaryPreview(event) {
  event?.preventDefault();
  state.activeModule = "awards";
  state.activeBeneficiarySection = "imports";
  renderModuleShell();

  if (elements.beneficiaryPreviewButton) {
    elements.beneficiaryPreviewButton.disabled = true;
  }
  if (elements.beneficiaryImportButton) {
    elements.beneficiaryImportButton.disabled = true;
  }
  setBeneficiaryImportMessage("Generating beneficiary import preview...", "warning");

  try {
    const payload = await postBeneficiaryImport("/api/beneficiaries/import/preview");
    state.beneficiaryDuplicateStrategy = payload.duplicateStrategy || getBeneficiaryDuplicateStrategy();
    state.beneficiaryDuplicateRowActions = { ...(payload.duplicateRowActions || state.beneficiaryDuplicateRowActions) };
    state.beneficiaryPreview = payload;
    state.lastBeneficiaryImport = null;
      renderBeneficiarySummary(payload.summary || {});
      renderBeneficiaryValidRows(payload.rows || []);
      renderBeneficiaryIssues(payload.rows || []);
      renderBeneficiaryDuplicateReview(payload.rows || []);
      renderBeneficiaryImportResults(null);
      const supportTypeNote =
        Number(payload.summary?.unknownSupportTypeRows || 0) > 0
          ? ` ${payload.summary?.unknownSupportTypeRows || 0} row(s) have blank support type and will default to Unknown / other.`
          : "";
      const rolledForwardNote =
        Number(payload.summary?.rolledForwardRows || 0) > 0
          ? ` ${payload.summary?.rolledForwardRows || 0} row(s) were carried forward into Current Beneficiaries because those students were tagged as new beneficiaries in the previous academic year.`
          : "";
      const duplicateNote =
        Number(payload.summary?.duplicateRows || 0) > 0
          ? ` ${payload.summary?.duplicateRows || 0} row(s) duplicate an existing or uploaded beneficiary record for the same support and academic year.`
          : "";
      const crossScopeNote =
        Number(payload.summary?.crossScopeDuplicateRows || 0) > 0
          ? ` ${payload.summary?.crossScopeDuplicateRows || 0} row(s) share a student ID with other schemes or academic years and were flagged for review.`
          : "";
      setBeneficiaryImportMessage(
        `Preview ready. ${payload.summary?.validRows || 0} row(s) are ready to import and ${
          payload.summary?.invalidRows || 0
        } row(s) need attention. Duplicate action: ${getBeneficiaryDuplicateStrategyLabel(
          state.beneficiaryDuplicateStrategy
        )}.${supportTypeNote}${rolledForwardNote}${duplicateNote}${crossScopeNote}`,
        payload.summary?.invalidRows ? "warning" : "success"
      );
      setBeneficiaryDuplicateReviewMessage(
        duplicateNote || crossScopeNote
          ? "Review duplicate rows below. You can override the batch-wide action row by row where needed."
          : "No duplicate rows need manual review in this preview.",
        duplicateNote || crossScopeNote ? "warning" : "success"
      );
  } catch (error) {
    setBeneficiaryImportMessage(error.message, "error");
  } finally {
    syncBeneficiaryControls();
  }
}

async function handleBeneficiaryImport() {
  state.activeModule = "awards";
  state.activeBeneficiarySection = "imports";
  renderModuleShell();

  if (elements.beneficiaryPreviewButton) {
    elements.beneficiaryPreviewButton.disabled = true;
  }
  if (elements.beneficiaryImportButton) {
    elements.beneficiaryImportButton.disabled = true;
  }
  setBeneficiaryImportMessage("Importing beneficiary rows...", "warning");

  try {
    const payload = await postBeneficiaryImport("/api/beneficiaries/import");
    state.beneficiaryDuplicateStrategy = payload.duplicateStrategy || getBeneficiaryDuplicateStrategy();
    state.beneficiaryDuplicateRowActions = {};
    state.lastBeneficiaryImport = payload;
    state.beneficiaryPreview = payload.preview || state.beneficiaryPreview;
    renderBeneficiarySummary(payload.preview?.summary || payload.summary || {});
    renderBeneficiaryValidRows(payload.preview?.rows || []);
    renderBeneficiaryIssues(payload.preview?.rows || []);
    renderBeneficiaryDuplicateReview(payload.preview?.rows || []);
    renderBeneficiaryImportResults(payload);
      const supportTypeNote =
        Number(payload.preview?.summary?.unknownSupportTypeRows || 0) > 0
          ? ` ${payload.preview?.summary?.unknownSupportTypeRows || 0} imported row(s) defaulted blank support type to Unknown / other.`
          : "";
      const rolledForwardNote =
        Number(payload.preview?.summary?.rolledForwardRows || 0) > 0
          ? ` ${payload.preview?.summary?.rolledForwardRows || 0} row(s) were carried forward into Current Beneficiaries from the previous academic year's new cohort.`
          : "";
      const duplicateNote =
        Number(payload.summary?.duplicateRows || 0) > 0
          ? ` ${payload.summary?.duplicateRows || 0} duplicate row(s) were handled with ${getBeneficiaryDuplicateStrategyLabel(
              state.beneficiaryDuplicateStrategy
            )}.`
          : "";
      const crossScopeNote =
        Number(payload.summary?.crossScopeDuplicateRows || 0) > 0
          ? ` ${payload.summary?.crossScopeDuplicateRows || 0} row(s) were also flagged because the same student ID exists in other schemes or academic years.`
          : "";
      const cohortTotals = getBeneficiaryCohortTotals(payload.summary || {});
      setBeneficiaryImportMessage(
        `Beneficiary import complete. ${payload.summary?.importedRows || 0} row(s) were imported and ${
          payload.summary?.rejectedRows || 0
        } row(s) were rejected. ${payload.summary?.replacedRows || 0} existing row(s) were replaced. Cohorts imported: ${cohortTotals.current} current, ${cohortTotals.new} new, ${
          cohortTotals.untagged
        } not tagged, ${cohortTotals.carriedForward} carried forward.${supportTypeNote}${rolledForwardNote}${duplicateNote}${crossScopeNote}`,
        payload.summary?.rejectedRows ? "warning" : "success"
      );
    setBeneficiaryDuplicateReviewMessage(
      `Import used the ${getBeneficiaryDuplicateStrategyLabel(
        state.beneficiaryDuplicateStrategy
      )} duplicate action, with any row-level overrides applied where you selected them.`,
      "success"
    );
    await loadBeneficiaryRecords();
    await loadBeneficiaryImportHistory();
    await loadBeneficiaryAuditFeed();
    await loadDashboard();
    await loadReportsOverview();
  } catch (error) {
    setBeneficiaryImportMessage(error.message, "error");
  } finally {
    syncBeneficiaryControls();
  }
}

async function loadBeneficiaryRecords() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    return;
  }

  setBeneficiaryListMessage("Loading beneficiary records...", "warning");
  try {
    const response = await fetch(buildBeneficiaryListUrl(), {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to load beneficiary records.");
      }

      state.beneficiaryRecords = payload.items || [];
      state.beneficiaryFilterOptions = payload.filterOptions || {
        academicYears: [],
        schemeNames: [],
        colleges: []
      };
      renderBeneficiaryFilterOptions(state.beneficiaryFilterOptions);
      renderBeneficiaryRecords(state.beneficiaryRecords);
      if (
        state.beneficiaryEditingRecordId &&
        !state.beneficiaryRecords.some(
          (item) => String(item.id) === String(state.beneficiaryEditingRecordId)
        )
      ) {
        state.beneficiaryEditingRecordId = null;
        state.beneficiaryRecordHistory = null;
      }
    renderBeneficiaryEditor();
    renderBeneficiaryRecordHistory();
    setBeneficiaryListMessage(
      `Loaded ${payload.total || 0} beneficiary record(s).`,
      payload.total ? "success" : "warning"
    );
    await loadBeneficiaryImportHistory();
    await loadBeneficiaryAuditFeed();
  } catch (error) {
      state.beneficiaryRecords = [];
      state.beneficiaryFilterOptions = state.beneficiaryFilterOptions || {
        academicYears: [],
        schemeNames: [],
        colleges: []
      };
      renderBeneficiaryRecords([]);
      state.beneficiaryEditingRecordId = null;
      state.beneficiaryRecordHistory = null;
      renderBeneficiaryEditor();
      renderBeneficiaryRecordHistory();
      state.beneficiaryImportHistory = [];
      renderBeneficiaryImportHistory([]);
      setBeneficiaryHistoryMessage("Unable to load beneficiary import history.", "error");
      state.beneficiaryAuditFeed = [];
      renderBeneficiaryAuditFeed([]);
      setBeneficiaryAuditMessage("Unable to load beneficiary lifecycle audit.", "error");
      setBeneficiaryListMessage(error.message, "error");
    }
}

async function loadBeneficiaryImportHistory() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    return;
  }

  const { academicYearLabel, schemeName } = getScopedBeneficiaryClearSelection();
  if (!academicYearLabel || !schemeName) {
    state.beneficiaryImportHistory = [];
    renderBeneficiaryImportHistory([]);
    setBeneficiaryHistoryMessage(
      "Choose both the academic year and support name to load import history.",
      "warning"
    );
    return;
  }

  setBeneficiaryHistoryMessage("Loading beneficiary import history...", "warning");
  try {
    const url = new URL(`${apiBaseUrl}/api/beneficiaries/import-history`);
    url.searchParams.set("academicYearLabel", academicYearLabel);
    url.searchParams.set("schemeName", schemeName);
    const response = await fetch(url.toString(), {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to load beneficiary import history.");
    }

    state.beneficiaryImportHistory = payload;
    renderBeneficiaryImportHistory(payload);
    setBeneficiaryHistoryMessage(
      `Loaded ${payload.total || 0} beneficiary import batch(es).`,
      payload.total ? "success" : "warning"
    );
  } catch (error) {
    state.beneficiaryImportHistory = [];
    renderBeneficiaryImportHistory([]);
    setBeneficiaryHistoryMessage(error.message, "error");
  }
}

function buildRecommendedListUrl() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    throw new Error("Enter the API URL first.");
  }

  const url = new URL(`${apiBaseUrl}/api/waitlist`);
  const q = elements.recommendedSearchQuery?.value.trim();
  const cycleLabel = elements.recommendedCycleFilter?.value.trim();
  const schemeName = elements.recommendedSchemeFilter?.value.trim();
  const status = elements.recommendedStatusFilter?.value || "";

  if (q) url.searchParams.set("q", q);
  if (status) url.searchParams.set("status", status);

  if (cycleLabel || schemeName) {
    const matchedScheme = (state.schemes || []).find((item) => {
      if (schemeName && String(item.name || "").trim() !== schemeName) return false;
      const itemYear = String(item.academicYearLabel || item.cycleLabel || "").trim();
      if (cycleLabel && itemYear !== cycleLabel) return false;
      return true;
    });
    if (matchedScheme?.id) {
      url.searchParams.set("schemeId", matchedScheme.id);
      if (matchedScheme.cycleId) {
        url.searchParams.set("cycleId", matchedScheme.cycleId);
      }
    } else if (cycleLabel) {
      const matchedCycle = (state.cycles || []).find(
        (item) => String(item.label || item.academicYearLabel || "").trim() === cycleLabel
      );
      if (matchedCycle?.id) {
        url.searchParams.set("cycleId", matchedCycle.id);
      }
    }
  }

  return url.toString();
}

async function postRecommendedImport(endpoint) {
  const apiBaseUrl = getApiBaseUrl();
  const files = Array.from(elements.recommendedFile?.files || []);

  if (!canManageRecommendedImports()) {
    throw new Error("Only admins can import recommended-student files.");
  }
  if (!apiBaseUrl) {
    throw new Error("Enter the API URL first.");
  }
  if (!files.length) {
    throw new Error("Choose at least one recommended-students file first.");
  }

  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }

  const response = await fetch(`${apiBaseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      ...getAuthHeaders()
    },
    body: formData
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "The recommended-students import request failed.");
  }
  return payload;
}

async function loadRecommendedRecords() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) return;

  setRecommendedListMessage("Loading recommended students...", "warning");
  try {
    const response = await fetch(buildRecommendedListUrl(), {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to load recommended students.");
    }

    state.recommendedRecords = payload.items || [];
    if (
      state.recommendedSelectedRecordId &&
      !state.recommendedRecords.some(
        (item) => String(item.id) === String(state.recommendedSelectedRecordId || "")
      )
    ) {
      state.recommendedSelectedRecordId = null;
    }
    if (
      state.recommendedEditingRecordId &&
      !state.recommendedRecords.some(
        (item) => String(item.id) === String(state.recommendedEditingRecordId || "")
      )
    ) {
      resetRecommendedCreateForm({ preserveMessage: true });
    }
    state.recommendedSummary = payload.summary || state.recommendedSummary;
    state.recommendedFilterOptions = payload.filterOptions || state.recommendedFilterOptions;
    renderRecommendedSummary(state.recommendedSummary);
    renderRecommendedFilterOptions(state.recommendedFilterOptions);
    renderRecommendedRecords(state.recommendedRecords);
    renderRecommendedSelectedSummary();
    setRecommendedListMessage(
      `Loaded ${payload.total || 0} recommended student record(s).`,
      payload.total ? "success" : "warning"
    );
  } catch (error) {
    state.recommendedRecords = [];
    renderRecommendedRecords([]);
    renderRecommendedSelectedSummary();
    setRecommendedListMessage(error.message, "error");
  } finally {
    syncRecommendedControls();
  }
}

async function lookupRecommendedStudentPreview(studentReferenceId) {
  const apiBaseUrl = getApiBaseUrl();
  const identifier = String(studentReferenceId || "").trim();

  if (!identifier) {
    state.recommendedManualPreview = null;
    renderRecommendedManualPreview();
    return;
  }

  if (!apiBaseUrl) {
    state.recommendedManualPreview = {
      error: "Enter the API URL first so the registry preview can run."
    };
    renderRecommendedManualPreview();
    return;
  }

  state.recommendedManualPreview = { loading: true };
  renderRecommendedManualPreview();

  try {
    const url = new URL(`${apiBaseUrl}/api/students/search`);
    url.searchParams.set("studentReferenceId", identifier);
    const response = await fetch(url, {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to load the registry preview.");
    }

    const matches = Array.isArray(payload.items) ? payload.items : [];
    state.recommendedManualPreview = {
      item: matches.length ? matches[0] : null
    };
  } catch (error) {
    state.recommendedManualPreview = {
      error: error.message || "Unable to load the registry preview."
    };
  }

  renderRecommendedManualPreview();
}

async function lookupSupportFoodBankStudentPreview(studentReferenceId) {
  const identifier = String(studentReferenceId || "").trim();

  if (!identifier) {
    state.supportFoodBankManualPreview = null;
    renderSupportFoodBankManualPreview();
    return;
  }

  state.supportFoodBankManualPreview = { loading: true };
  renderSupportFoodBankManualPreview();

  try {
    const student = await lookupStudentByReferenceId(identifier);
    state.supportFoodBankManualPreview = {
      item: student
    };
  } catch (error) {
    state.supportFoodBankManualPreview = {
      error: error.message || "Unable to load the registry preview."
    };
  }

  renderSupportFoodBankManualPreview();
}

function scheduleRecommendedStudentPreviewLookup() {
  if (recommendedPreviewLookupTimer) {
    clearTimeout(recommendedPreviewLookupTimer);
  }

  const studentReferenceId = elements.recommendedStudentReferenceId?.value.trim() || "";
  if (!studentReferenceId) {
    state.recommendedManualPreview = null;
    renderRecommendedManualPreview();
    return;
  }

  recommendedPreviewLookupTimer = setTimeout(() => {
    recommendedPreviewLookupTimer = null;
    void lookupRecommendedStudentPreview(studentReferenceId);
  }, 250);
}

function scheduleSupportFoodBankPreviewLookup() {
  if (supportFoodBankPreviewLookupTimer) {
    clearTimeout(supportFoodBankPreviewLookupTimer);
  }

  const studentReferenceId = elements.supportFoodBankStudentReferenceId?.value.trim() || "";
  if (!studentReferenceId) {
    state.supportFoodBankManualPreview = null;
    renderSupportFoodBankManualPreview();
    return;
  }

  supportFoodBankPreviewLookupTimer = setTimeout(() => {
    supportFoodBankPreviewLookupTimer = null;
    void lookupSupportFoodBankStudentPreview(studentReferenceId);
  }, 250);
}

async function handleSupportFoodBankCreate(event) {
  event?.preventDefault();
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    setSupportFoodBankCreateMessage("Enter the API URL first.", "error");
    return;
  }

  const academicYearLabel = elements.supportFoodBankAcademicYear?.value || "";
  const semester = elements.supportFoodBankSemester?.value || "";
  const studentReferenceId = elements.supportFoodBankStudentReferenceId?.value.trim() || "";
  const supportTypes = getSelectedSupportFoodBankSupportTypes();
  if (!academicYearLabel) {
    setSupportFoodBankCreateMessage("Choose the academic year first.", "error");
    return;
  }
  if (!semester) {
    setSupportFoodBankCreateMessage("Choose the semester first.", "error");
    return;
  }
  if (!studentReferenceId) {
    setSupportFoodBankCreateMessage("Student ID / Reference Number is required.", "error");
    return;
  }
  if (!supportTypes.length) {
    setSupportFoodBankCreateMessage("Choose at least one support type before saving.", "error");
    return;
  }

  if (elements.supportFoodBankCreateButton) {
    elements.supportFoodBankCreateButton.disabled = true;
  }
  setSupportFoodBankCreateMessage(
    state.supportFoodBankEditingRecordId
      ? "Saving support registration changes..."
      : "Saving support registration...",
    "warning"
  );

  try {
    const isEditing = Boolean(state.supportFoodBankEditingRecordId);
    const response = await fetch(
      isEditing
        ? `${apiBaseUrl}/api/food-bank/${encodeURIComponent(state.supportFoodBankEditingRecordId)}`
        : `${apiBaseUrl}/api/food-bank`,
      {
        method: isEditing ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          academicYearLabel,
          semester,
          studentReferenceId,
          referralSource: elements.supportFoodBankReferralSource?.value || "",
          supportTypes
        })
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(
          payload.message ||
          (isEditing
            ? "Unable to update the support registration."
            : "Unable to save the support registration.")
        );
    }

    setSupportFoodBankCreateMessage(
      isEditing ? "Support registration updated." : "Support registration saved.",
      "success"
    );
    resetSupportFoodBankForm({ preserveMessage: true });
    await loadSupportFoodBankRecords();
    await loadReportsOverview();
  } catch (error) {
    setSupportFoodBankCreateMessage(error.message, "error");
  } finally {
    if (elements.supportFoodBankCreateButton) {
      elements.supportFoodBankCreateButton.disabled = false;
    }
  }
}

function beginSupportFoodBankEdit(recordId) {
  const record = state.supportFoodBankRecords.find((item) => String(item.id) === String(recordId || ""));
  if (!record) {
    setSupportFoodBankListMessage("Choose a valid support record before editing.", "error");
    return;
  }

  state.supportFoodBankEditingRecordId = String(record.id);
  if (elements.supportFoodBankAcademicYear) {
    elements.supportFoodBankAcademicYear.value = record.academicYearLabel || "";
  }
  if (elements.supportFoodBankSemester) {
    elements.supportFoodBankSemester.value = record.semester || "";
  }
  if (elements.supportFoodBankStudentReferenceId) {
    elements.supportFoodBankStudentReferenceId.value = record.studentReferenceId || "";
  }
  if (elements.supportFoodBankReferralSource) {
    elements.supportFoodBankReferralSource.value = record.referralSource || "";
  }
  setSelectedSupportFoodBankSupportTypes(record.supportTypes || []);
  state.supportFoodBankManualPreview = {
    item: {
      fullName: record.fullName || null,
      studentReferenceId: record.studentReferenceId || null,
      indexNumber: record.indexNumber || null,
      email: record.email || null,
      college: record.college || null,
      program: record.program || null,
      year: record.year || null
    }
  };
  renderSupportFoodBankManualPreview();
  renderSupportFoodBankCreateFormState();
  setSupportFoodBankCreateMessage(
    "Edit the support registration details here, then save the updated record.",
    "warning"
  );
  elements.supportFoodBankForm?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

async function handleSupportFoodBankPreview(event) {
  event?.preventDefault();
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    setSupportFoodBankImportMessage("Enter the API URL first.", "error");
    return;
  }

  const files = Array.from(elements.supportFoodBankFile?.files || []);
  if (!files.length) {
    setSupportFoodBankImportMessage("Choose at least one support registration file first.", "error");
    return;
  }

  if (elements.supportFoodBankPreviewButton) {
    elements.supportFoodBankPreviewButton.disabled = true;
  }
  setSupportFoodBankImportMessage("Previewing food and clothing support import...", "warning");

  try {
    const formData = new FormData();
    for (const file of files) {
      formData.append("file", file);
    }
    const response = await fetch(`${apiBaseUrl}/api/food-bank/import/preview`, {
      method: "POST",
      headers: {
        Authorization: getAuthHeaders().Authorization || ""
      },
      body: formData
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to preview the support registration import.");
    }

    state.supportFoodBankPreview = payload;
    renderSupportFoodBankPreviewSummary();
    renderSupportFoodBankPreviewRows(payload.rows || []);
    if (elements.supportFoodBankImportButton) {
      elements.supportFoodBankImportButton.disabled = !(payload.summary?.validRows > 0);
    }
    setSupportFoodBankImportMessage(
      `Preview ready. ${payload.summary?.validRows || 0} row(s) are ready to import and ${payload.summary?.invalidRows || 0} row(s) need attention.`,
      payload.summary?.invalidRows ? "warning" : "success"
    );
  } catch (error) {
    state.supportFoodBankPreview = null;
    renderSupportFoodBankPreviewSummary();
    renderSupportFoodBankPreviewRows([]);
    if (elements.supportFoodBankImportButton) {
      elements.supportFoodBankImportButton.disabled = true;
    }
    setSupportFoodBankImportMessage(error.message, "error");
  } finally {
    if (elements.supportFoodBankPreviewButton) {
      elements.supportFoodBankPreviewButton.disabled = false;
    }
  }
}

async function handleSupportFoodBankImport() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    setSupportFoodBankImportMessage("Enter the API URL first.", "error");
    return;
  }

  const files = Array.from(elements.supportFoodBankFile?.files || []);
  if (!files.length) {
    setSupportFoodBankImportMessage("Choose at least one support registration file first.", "error");
    return;
  }

  if (elements.supportFoodBankImportButton) {
    elements.supportFoodBankImportButton.disabled = true;
  }
  setSupportFoodBankImportMessage("Importing food and clothing support registrations...", "warning");

  try {
    const formData = new FormData();
    for (const file of files) {
      formData.append("file", file);
    }
    const response = await fetch(`${apiBaseUrl}/api/food-bank/import`, {
      method: "POST",
      headers: {
        Authorization: getAuthHeaders().Authorization || ""
      },
      body: formData
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to import support registrations.");
    }

    state.lastSupportFoodBankImport = payload;
    setSupportFoodBankImportMessage(
      `Imported ${payload.summary?.importedRows || 0} support registration row(s).`,
      "success"
    );
    await loadSupportFoodBankRecords();
    await loadReportsOverview();
  } catch (error) {
    setSupportFoodBankImportMessage(error.message, "error");
  } finally {
    if (elements.supportFoodBankImportButton) {
      elements.supportFoodBankImportButton.disabled =
        !(state.supportFoodBankPreview?.summary?.validRows > 0);
    }
  }
}

async function loadSupportFoodBankRecords() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    state.supportFoodBankRecords = [];
    renderSupportFoodBankRecords([]);
    setSupportFoodBankListMessage("Enter the API URL first.", "error");
    return;
  }

  setSupportFoodBankListMessage("Loading food and clothing support registrations...", "warning");
  try {
    const url = new URL(`${apiBaseUrl}/api/food-bank`);
    if (elements.supportFoodBankAcademicYearFilter?.value) {
      url.searchParams.set("academicYearLabel", elements.supportFoodBankAcademicYearFilter.value);
    }
    if (elements.supportFoodBankStatusFilter?.value) {
      url.searchParams.set("status", elements.supportFoodBankStatusFilter.value);
    }
    if (elements.supportFoodBankSearchQuery?.value.trim()) {
      url.searchParams.set("q", elements.supportFoodBankSearchQuery.value.trim());
    }
    const response = await fetch(url, {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to load support registrations.");
    }

    state.supportFoodBankRecords = payload.items || [];
    state.supportFoodBankFilterOptions = payload.filterOptions || state.supportFoodBankFilterOptions;
    state.supportFoodBankSummary = payload.summary || state.supportFoodBankSummary;
    renderSupportFoodBankFilterOptions();
    renderSupportFoodBankRecords(state.supportFoodBankRecords);
    setSupportFoodBankListMessage(
      `Loaded ${payload.total || 0} support registration record(s).`,
      payload.total ? "success" : "warning"
    );
  } catch (error) {
    state.supportFoodBankRecords = [];
    renderSupportFoodBankRecords([]);
    setSupportFoodBankListMessage(error.message, "error");
  }
}

async function handleSupportFoodBankMarkServed(recordId) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    setSupportFoodBankListMessage("Enter the API URL first.", "error");
    return;
  }

  setSupportFoodBankListMessage("Marking support registration as served...", "warning");
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/food-bank/${encodeURIComponent(recordId)}/mark-served`,
      {
        method: "POST",
        headers: {
          ...getAuthHeaders()
        }
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to update the support registration.");
    }

    await loadSupportFoodBankRecords();
    await loadReportsOverview();
    setSupportFoodBankListMessage("Support registration marked as served.", "success");
  } catch (error) {
    setSupportFoodBankListMessage(error.message, "error");
  }
}

async function handleSupportFoodBankRemove(recordId) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    setSupportFoodBankListMessage("Enter the API URL first.", "error");
    return;
  }
  if (!window.confirm("Remove this support registration? This action cannot be undone.")) {
    return;
  }

  setSupportFoodBankListMessage("Removing support registration...", "warning");
  try {
    const response = await fetch(`${apiBaseUrl}/api/food-bank/${encodeURIComponent(recordId)}`, {
      method: "DELETE",
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to remove the support registration.");
    }
    if (String(state.supportFoodBankEditingRecordId || "") === String(recordId)) {
      resetSupportFoodBankForm({ preserveMessage: true });
    }
    await loadSupportFoodBankRecords();
    await loadReportsOverview();
    setSupportFoodBankListMessage("Support registration removed.", "success");
  } catch (error) {
    setSupportFoodBankListMessage(error.message, "error");
  }
}

function beginRecommendedEdit(recordId) {
  const record = state.recommendedRecords.find((item) => String(item.id) === String(recordId || ""));
  if (!record) {
    setRecommendedCreateMessage("Choose a valid recommended student before editing.", "error");
    return;
  }

  state.recommendedEditingRecordId = String(record.id);
  if (elements.recommendedSchemeSelect) {
    elements.recommendedSchemeSelect.value = record.schemeId || "";
  }
  if (elements.recommendedStudentReferenceId) {
    elements.recommendedStudentReferenceId.value = record.studentReferenceId || "";
  }
  if (elements.recommendedReason) {
    elements.recommendedReason.value = record.recommendationReason || "";
  }
  if (elements.recommendedNotes) {
    elements.recommendedNotes.value = record.notes || "";
  }
  state.recommendedManualPreview = {
    item: {
      fullName: record.fullName || null,
      studentReferenceId: record.studentReferenceId || null,
      indexNumber: record.indexNumber || null,
      email: record.email || null,
      college: record.college || null,
      program: record.program || null,
      year: record.year || null
    }
  };
  renderRecommendedManualPreview();
  renderRecommendedCreateFormState();
  setRecommendedCreateMessage(
    "Edit the recommendation details here, then save the updated record.",
    "warning"
  );
  elements.recommendedCreateForm?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

async function handleRecommendedRemove(recordId) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    setRecommendedListMessage("Enter the API URL first.", "error");
    return;
  }
  if (!canManageRecommendedStudents()) {
    setRecommendedListMessage("Only admins and reviewers can remove recommended students.", "error");
    return;
  }
  if (
    !window.confirm(
      "Remove this recommended student record? This only works before any Applications or Beneficiaries handoff."
    )
  ) {
    return;
  }

  setRecommendedListMessage("Removing recommended student...", "warning");
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/waitlist/${encodeURIComponent(recordId)}`,
      {
        method: "DELETE",
        headers: {
          ...getAuthHeaders()
        }
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to remove the recommended student.");
    }

    if (String(state.recommendedSelectedRecordId || "") === String(recordId)) {
      state.recommendedSelectedRecordId = null;
    }
    if (String(state.recommendedEditingRecordId || "") === String(recordId)) {
      resetRecommendedCreateForm({ preserveMessage: true });
    }

    await loadRecommendedRecords();
    await loadDashboard();
    setRecommendedListMessage("Recommended student removed.", "success");
  } catch (error) {
    setRecommendedListMessage(error.message, "error");
  }
}

async function handleRecommendedCreate(event) {
  event?.preventDefault();
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    setRecommendedCreateMessage("Enter the API URL first.", "error");
    return;
  }
  if (!canManageRecommendedStudents()) {
    setRecommendedCreateMessage("Only admins and reviewers can add recommended students.", "error");
    return;
  }

  const schemeId = elements.recommendedSchemeSelect?.value || "";
  const studentReferenceId = elements.recommendedStudentReferenceId?.value.trim() || "";
  const recommendationReason = elements.recommendedReason?.value.trim() || "";
  const notes = elements.recommendedNotes?.value.trim() || "";
  if (!schemeId) {
    setRecommendedCreateMessage("Choose an available scheme first.", "error");
    return;
  }
  if (!studentReferenceId) {
    setRecommendedCreateMessage("Student ID / Reference Number is required.", "error");
    return;
  }

  elements.recommendedCreateButton.disabled = true;
  setRecommendedCreateMessage(
    state.recommendedEditingRecordId ? "Saving recommended student changes..." : "Adding recommended student...",
    "warning"
  );

  try {
    const matchedScheme = (state.schemes || []).find((item) => String(item.id) === schemeId);
    const isEditing = Boolean(state.recommendedEditingRecordId);
    const response = await fetch(
      isEditing
        ? `${apiBaseUrl}/api/waitlist/${encodeURIComponent(state.recommendedEditingRecordId)}`
        : `${apiBaseUrl}/api/waitlist`,
      {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          schemeId,
          cycleId: matchedScheme?.cycleId || "",
          studentReferenceId,
          recommendationReason,
          notes
        })
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload.message ||
          (isEditing
            ? "Unable to update the recommended student."
            : "Unable to add the recommended student.")
      );
    }

    resetRecommendedCreateForm({ preserveMessage: true });
    setRecommendedCreateMessage(
      isEditing
        ? `${payload.item?.fullName || "The student"} was updated successfully.`
        : `${payload.item?.fullName || "The student"} was added as a recommended student for ${payload.item?.schemeName || "the selected scheme"}.`,
      "success"
    );
    await loadRecommendedRecords();
    await loadDashboard();
  } catch (error) {
    setRecommendedCreateMessage(error.message, "error");
  } finally {
    syncRecommendedControls();
  }
}

async function handleRecommendedPreview(event) {
  event?.preventDefault();
  state.activeModule = "waitlist";
  renderModuleShell();

  if (elements.recommendedPreviewButton) {
    elements.recommendedPreviewButton.disabled = true;
  }
  if (elements.recommendedImportButton) {
    elements.recommendedImportButton.disabled = true;
  }
  setRecommendedImportMessage("Generating recommended-students import preview...", "warning");

  try {
    const payload = await postRecommendedImport("/api/waitlist/import/preview");
    state.recommendedPreview = payload;
    state.lastRecommendedImport = null;
    renderRecommendedPreviewSummary(payload.summary || {});
    renderRecommendedPreview(payload.rows || []);
    setRecommendedImportMessage(
      `Preview ready. ${payload.summary?.validRows || 0} row(s) are ready and ${payload.summary?.invalidRows || 0} row(s) need attention.`,
      payload.summary?.invalidRows ? "warning" : "success"
    );
  } catch (error) {
    setRecommendedImportMessage(error.message, "error");
  } finally {
    syncRecommendedControls();
  }
}

async function handleRecommendedImport() {
  state.activeModule = "waitlist";
  renderModuleShell();

  if (elements.recommendedPreviewButton) {
    elements.recommendedPreviewButton.disabled = true;
  }
  if (elements.recommendedImportButton) {
    elements.recommendedImportButton.disabled = true;
  }
  setRecommendedImportMessage("Importing recommended students...", "warning");

  try {
    const payload = await postRecommendedImport("/api/waitlist/import");
    state.lastRecommendedImport = payload;
    state.recommendedPreview = payload;
    renderRecommendedPreviewSummary(payload.summary || {});
    renderRecommendedPreview(payload.rows || []);
    setRecommendedImportMessage(
      `Import complete. ${payload.summary?.importedRows || 0} row(s) were imported and ${payload.summary?.invalidRows || 0} row(s) were rejected.`,
      payload.summary?.invalidRows ? "warning" : "success"
    );
    await loadRecommendedRecords();
    await loadDashboard();
  } catch (error) {
    setRecommendedImportMessage(error.message, "error");
  } finally {
    syncRecommendedControls();
  }
}

function selectRecommendedRecord(recordId) {
  state.recommendedSelectedRecordId = recordId || null;
  renderRecommendedRecords(state.recommendedRecords);
  renderRecommendedSelectedSummary();
  setRecommendedSupportMessage(
    state.recommendedSelectedRecordId
      ? "Selected recommendation ready for support handoff."
      : "Choose a recommended student before adding support.",
    state.recommendedSelectedRecordId ? "success" : "warning"
  );
  syncRecommendedControls();
}

async function handleRecommendedApplicationHandoff(recordId) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    setRecommendedListMessage("Enter the API URL first.", "error");
    return;
  }

  setRecommendedListMessage("Adding recommended student into Applications...", "warning");
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/waitlist/${encodeURIComponent(recordId)}/handoff/application`,
      {
        method: "POST",
        headers: {
          ...getAuthHeaders()
        }
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to add the recommended student into Applications.");
    }

    await loadRecommendedRecords();
    await loadApplicationsList();
    await refreshApplicationReviewWorkspace({
      qualificationStatus: "qualified"
    });
    await loadDashboard();
    setRecommendedListMessage(
      `${payload.record?.fullName || "The student"} was added to Applications as qualified.`,
      "success"
    );
  } catch (error) {
    setRecommendedListMessage(error.message, "error");
  }
}

async function handleRecommendedSupportHandoff(event) {
  event?.preventDefault();
  const apiBaseUrl = getApiBaseUrl();
  const recordId = state.recommendedSelectedRecordId;
  if (!apiBaseUrl) {
    setRecommendedSupportMessage("Enter the API URL first.", "error");
    return;
  }
  if (!recordId) {
    setRecommendedSupportMessage("Choose a recommended student first.", "error");
    return;
  }

  const amountPaid = elements.recommendedSupportAmount?.value || "";
  const supportType = elements.recommendedSupportType?.value || "";
  if (!amountPaid) {
    setRecommendedSupportMessage("Amount paid is required before support handoff.", "error");
    return;
  }
  if (!supportType) {
    setRecommendedSupportMessage("Choose whether the support is internal or external.", "error");
    return;
  }

  elements.recommendedSupportButton.disabled = true;
  setRecommendedSupportMessage("Adding the selected recommendation into Beneficiaries & Support...", "warning");
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/waitlist/${encodeURIComponent(recordId)}/handoff/beneficiary`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          amountPaid,
          supportType,
          sponsorName: elements.recommendedSupportSponsor?.value.trim() || "",
          beneficiaryCohort: elements.recommendedSupportCohort?.value || "",
          remarks: elements.recommendedSupportRemarks?.value.trim() || ""
        })
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to add the selected recommendation into Beneficiaries & Support.");
    }

    elements.recommendedSupportForm?.reset();
    setRecommendedSupportMessage(
      `${payload.record?.fullName || "The student"} is now marked as supported and has been added into Beneficiaries & Support.`,
      "success"
    );
    await loadRecommendedRecords();
    await loadBeneficiaryRecords();
    await loadDashboard();
    await loadReportsOverview();
  } catch (error) {
    setRecommendedSupportMessage(error.message, "error");
  } finally {
    syncRecommendedControls();
  }
}

async function loadBeneficiaryAuditFeed() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    return;
  }

  const { academicYearLabel, schemeName } = getScopedBeneficiaryClearSelection();
  if (!academicYearLabel || !schemeName) {
    state.beneficiaryAuditFeed = [];
    renderBeneficiaryAuditFeed([]);
    setBeneficiaryAuditMessage(
      "Choose an academic year and support name to review beneficiary lifecycle activity.",
      "warning"
    );
    return;
  }

  setBeneficiaryAuditMessage("Loading beneficiary lifecycle audit...", "warning");
  try {
    const url = new URL(`${apiBaseUrl}/api/beneficiaries/audit`);
    url.searchParams.set("academicYearLabel", academicYearLabel);
    url.searchParams.set("schemeName", schemeName);
    const eventType = elements.beneficiaryAuditEventTypeFilter?.value || "";
    if (eventType) {
      url.searchParams.set("eventType", eventType);
    }

    const response = await fetch(url, {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to load beneficiary lifecycle audit.");
    }

    state.beneficiaryAuditFeed = payload.items || [];
    renderBeneficiaryAuditFeed(state.beneficiaryAuditFeed);
    setBeneficiaryAuditMessage(
      `Loaded ${payload.total || 0} lifecycle event(s) for ${schemeName} in ${academicYearLabel}.`,
      payload.total ? "success" : "warning"
    );
  } catch (error) {
    state.beneficiaryAuditFeed = [];
    renderBeneficiaryAuditFeed([]);
    setBeneficiaryAuditMessage(error.message, "error");
  }
}

async function loadBeneficiaryRecordHistory(recordId = state.beneficiaryEditingRecordId) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !recordId) {
    state.beneficiaryRecordHistory = null;
    renderBeneficiaryRecordHistory();
    setBeneficiaryRecordHistoryMessage(
      "Select a beneficiary row to load its import, update, replacement, and removal history.",
      "warning"
    );
    return;
  }

  setBeneficiaryRecordHistoryMessage("Loading beneficiary record history...", "warning");
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/beneficiaries/${encodeURIComponent(recordId)}/history`,
      {
        headers: {
          ...getAuthHeaders()
        }
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to load beneficiary record history.");
    }
    state.beneficiaryRecordHistory = payload;
    renderBeneficiaryRecordHistory(payload);
    setBeneficiaryRecordHistoryMessage(
      `Loaded ${payload.total || 0} lifecycle event(s) for the selected beneficiary row.`,
      payload.total ? "success" : "warning"
    );
  } catch (error) {
    state.beneficiaryRecordHistory = null;
    renderBeneficiaryRecordHistory();
    setBeneficiaryRecordHistoryMessage(error.message, "error");
  }
}

function focusBeneficiaryLifecycleTarget(target = "editor") {
  if (target === "history") {
    elements.beneficiaryRecordHistoryMessage?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
    elements.beneficiaryRecordHistoryList?.setAttribute("tabindex", "-1");
    elements.beneficiaryRecordHistoryList?.focus({ preventScroll: true });
    return;
  }

  elements.beneficiaryEditorMessage?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
  const preferredFocusTarget =
    elements.beneficiaryEditorFullName ||
    elements.beneficiaryEditorAcademicYear ||
    elements.beneficiaryEditorForm;
  preferredFocusTarget?.focus({ preventScroll: true });
}

async function openBeneficiaryLifecycle(recordId, options = {}) {
  state.beneficiaryEditingRecordId = recordId;
  renderBeneficiaryEditor(recordId);
  focusBeneficiaryLifecycleTarget(options.focusDelete ? "editor" : "editor");
  await loadBeneficiaryRecordHistory(recordId);
  if (options.focusDelete && elements.beneficiaryEditorRemovalReason) {
    elements.beneficiaryEditorRemovalReason.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
    elements.beneficiaryEditorRemovalReason.focus();
  }
}

async function handleBeneficiaryRowEdit(recordId) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !state.beneficiaryEditingRecordId) return;

  setBeneficiaryEditorMessage("Saving beneficiary lifecycle changes...", "warning");
  try {
    const reason = elements.beneficiaryEditorChangeReason?.value.trim() || "";
    if (!reason) {
      throw new Error("Enter a change reason before saving beneficiary updates.");
    }
    const response = await fetch(`${apiBaseUrl}/api/beneficiaries/${encodeURIComponent(state.beneficiaryEditingRecordId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        academicYearLabel: elements.beneficiaryEditorAcademicYear?.value || "",
        schemeName: elements.beneficiaryEditorSchemeName?.value || "",
        fullName: elements.beneficiaryEditorFullName?.value || "",
        studentReferenceId: elements.beneficiaryEditorStudentReferenceId?.value || "",
        indexNumber: elements.beneficiaryEditorIndexNumber?.value || "",
        sponsorName: elements.beneficiaryEditorSponsorName?.value || "",
        college: elements.beneficiaryEditorCollege?.value || "",
        amountPaid: elements.beneficiaryEditorAmountPaid?.value || "",
        currency: elements.beneficiaryEditorCurrency?.value || "",
        supportType: elements.beneficiaryEditorSupportType?.value || "",
        beneficiaryCohort: elements.beneficiaryEditorCohort?.value || "",
        remarks: elements.beneficiaryEditorRemarks?.value || "",
        replaceExisting: Boolean(elements.beneficiaryEditorReplaceExisting?.checked),
        reason
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to update beneficiary record.");
    }

    setBeneficiaryEditorMessage("Beneficiary record updated.", "success");
    await loadBeneficiaryRecords();
    await loadDashboard();
    await loadReportsOverview();
    await loadBeneficiaryAuditFeed();
    renderBeneficiaryEditor(payload.item?.id || state.beneficiaryEditingRecordId);
    await loadBeneficiaryRecordHistory(payload.item?.id || state.beneficiaryEditingRecordId);
  } catch (error) {
    setBeneficiaryEditorMessage(error.message, "error");
  }
}

async function handleBeneficiaryRowDelete(recordId) {
  const apiBaseUrl = getApiBaseUrl();
  const targetId = recordId || state.beneficiaryEditingRecordId;
  if (!apiBaseUrl || !targetId) return;
  const reason = elements.beneficiaryEditorRemovalReason?.value.trim() || "";
  if (!reason) {
    setBeneficiaryEditorMessage("Enter a removal reason before deleting the selected beneficiary row.", "error");
    return;
  }
  if (!window.confirm("Remove this beneficiary row? The row will be deleted, but the audit trail will be kept.")) {
    setBeneficiaryEditorMessage("Beneficiary row removal cancelled.", "warning");
    return;
  }

  setBeneficiaryEditorMessage("Removing beneficiary record...", "warning");
  try {
    const response = await fetch(`${apiBaseUrl}/api/beneficiaries/${encodeURIComponent(targetId)}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify({ reason })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to remove beneficiary record.");
    }

    state.beneficiaryEditingRecordId = null;
    state.beneficiaryRecordHistory = null;
    renderBeneficiaryEditor();
    renderBeneficiaryRecordHistory();
    setBeneficiaryEditorMessage("Beneficiary row removed.", "success");
    await loadBeneficiaryRecords();
    await loadBeneficiaryImportHistory();
    await loadDashboard();
    await loadReportsOverview();
  } catch (error) {
    setBeneficiaryEditorMessage(error.message, "error");
  }
}

async function handleBeneficiaryBatchRollback(batchReference) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) return;
  if (
    !window.confirm(
      "Roll back the latest imported beneficiary batch for this scheme and academic year? This will remove every row created by that file."
    )
  ) {
    return;
  }
  const reason =
    window.prompt(
      "Enter a short rollback reason for the audit trail.",
      "Imported beneficiary file was incorrect"
    ) || "";

  setBeneficiaryHistoryMessage("Rolling back beneficiary batch...", "warning");
  try {
    const response = await fetch(`${apiBaseUrl}/api/beneficiaries/rollback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        batchReference,
        reason: reason.trim()
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to roll back beneficiary batch.");
    }

    setBeneficiaryHistoryMessage(
      `Rolled back ${payload.deletedRows || 0} beneficiary row(s) from the selected batch.`,
      "success"
    );
    await loadBeneficiaryRecords();
    await loadBeneficiaryImportHistory();
    await loadBeneficiaryAuditFeed();
    await loadDashboard();
    await loadReportsOverview();
  } catch (error) {
    setBeneficiaryHistoryMessage(error.message, "error");
  }
}

function renderReportsOverview(summary = state.reportsOverview) {
  const safeSummary = summary || {
    totalStudents: 0,
    totalSchemes: 0,
    totalApplications: 0,
    totalActiveAwards: 0,
    beneficiarySupport: EMPTY_BENEFICIARY_DASHBOARD,
    foodBankSupport: {
      currentYearLabel: "Current Academic Year",
      currentYear: {
        totalRegistered: 0,
        totalServed: 0,
        collegesRepresentedCount: 0,
        collegeBreakdown: [],
        supportTypeCounts: {
          foodSupport: 0,
          clothingSupport: 0,
          both: 0
        }
      }
    }
  };
  const beneficiarySupport = safeSummary.beneficiarySupport || EMPTY_BENEFICIARY_DASHBOARD;
  const foodBankSupport = safeSummary.foodBankSupport || {
    currentYearLabel: "Current Academic Year",
    currentYear: {
      totalRegistered: 0,
      totalServed: 0,
      collegesRepresentedCount: 0,
      collegeBreakdown: [],
      supportTypeCounts: {
        foodSupport: 0,
        clothingSupport: 0,
        both: 0
      }
    }
  };
  const currentYear = beneficiarySupport.currentYear || EMPTY_BENEFICIARY_DASHBOARD.currentYear;
  const cohortCounts = currentYear.cohortCounts || {};

  if (elements.reportsSummaryCards) {
    elements.reportsSummaryCards.innerHTML = `
      <article class="metric-card"><span class="metric-label">Students</span><strong class="metric-value">${escapeHtml(
        safeSummary.totalStudents ?? 0
      )}</strong></article>
      <article class="metric-card"><span class="metric-label">Schemes</span><strong class="metric-value">${escapeHtml(
        safeSummary.totalSchemes ?? 0
      )}</strong></article>
      <article class="metric-card"><span class="metric-label">Applications</span><strong class="metric-value">${escapeHtml(
        safeSummary.totalApplications ?? 0
      )}</strong></article>
      <article class="metric-card"><span class="metric-label">Active awards</span><strong class="metric-value">${escapeHtml(
        safeSummary.totalActiveAwards ?? 0
      )}</strong></article>
    `;
  }

  if (elements.reportsBeneficiarySummaryCards) {
    elements.reportsBeneficiarySummaryCards.innerHTML = `
      <article class="metric-card"><span class="metric-label">Total beneficiaries</span><strong class="metric-value">${escapeHtml(
        currentYear.totalBeneficiaries ?? 0
      )}</strong></article>
      <article class="metric-card"><span class="metric-label">Amount paid</span><strong class="metric-value">${escapeHtml(
        currentYear.totalAmountPaidLabel || "GHS 0"
      )}</strong>${renderBeneficiaryCurrencyBreakdown(
        currentYear.currencyTotals || [],
        currentYear.totalAmountPaidLabel || "GHS 0"
      )}</article>
      <article class="metric-card"><span class="metric-label">Colleges represented</span><strong class="metric-value">${escapeHtml(
        currentYear.collegesRepresentedCount ?? 0
      )}</strong></article>
      <article class="metric-card"><span class="metric-label">College-tagged records</span><strong class="metric-value">${escapeHtml(
        currentYear.collegeTaggedCount ?? 0
      )}</strong></article>
      <article class="metric-card"><span class="metric-label">Current</span><strong class="metric-value">${escapeHtml(
        cohortCounts.current ?? 0
      )}</strong></article>
      <article class="metric-card"><span class="metric-label">New</span><strong class="metric-value">${escapeHtml(
        cohortCounts.new ?? 0
      )}</strong></article>
      <article class="metric-card"><span class="metric-label">Not tagged</span><strong class="metric-value">${escapeHtml(
        cohortCounts.untagged ?? 0
      )}</strong></article>
      <article class="metric-card"><span class="metric-label">Carried forward</span><strong class="metric-value">${escapeHtml(
        cohortCounts.carriedForward ?? 0
      )}</strong></article>
    `;
  }

  if (elements.reportsFoodBankSummaryCards) {
    const supportTypeCounts = foodBankSupport.currentYear?.supportTypeCounts || {};
    elements.reportsFoodBankSummaryCards.innerHTML = `
      <article class="metric-card"><span class="metric-label">Registered</span><strong class="metric-value">${escapeHtml(
        foodBankSupport.currentYear?.totalRegistered ?? 0
      )}</strong></article>
      <article class="metric-card"><span class="metric-label">Served</span><strong class="metric-value">${escapeHtml(
        foodBankSupport.currentYear?.totalServed ?? 0
      )}</strong></article>
      <article class="metric-card"><span class="metric-label">Colleges represented</span><strong class="metric-value">${escapeHtml(
        foodBankSupport.currentYear?.collegesRepresentedCount ?? 0
      )}</strong></article>
      <article class="metric-card"><span class="metric-label">Food support</span><strong class="metric-value">${escapeHtml(
        supportTypeCounts.foodSupport ?? 0
      )}</strong></article>
      <article class="metric-card"><span class="metric-label">Clothing support</span><strong class="metric-value">${escapeHtml(
        supportTypeCounts.clothingSupport ?? 0
      )}</strong></article>
      <article class="metric-card"><span class="metric-label">Both</span><strong class="metric-value">${escapeHtml(
        supportTypeCounts.both ?? 0
      )}</strong></article>
    `;
  }

  if (elements.reportsFoodBankCollegeTable) {
    const rows = Array.isArray(foodBankSupport.currentYear?.collegeBreakdown)
      ? foodBankSupport.currentYear.collegeBreakdown
      : [];
    elements.reportsFoodBankCollegeTable.innerHTML = rows.length
      ? rows
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(item.college || "Unknown / not captured")}</td>
                <td>${escapeHtml(item.registeredCount ?? 0)}</td>
                <td>${escapeHtml(item.servedCount ?? 0)}</td>
              </tr>
            `
          )
          .join("")
      : `<tr><td colspan="3" class="empty-cell">Food & Clothing college breakdown will appear here once records are saved.</td></tr>`;
  }

  if (elements.reportsBeneficiaryCollegeChart) {
    elements.reportsBeneficiaryCollegeChart.innerHTML = createBeneficiaryDistributionChart(
      currentYear.collegeDistribution || []
    );
  }
  if (elements.reportsBeneficiarySchemeChart) {
    elements.reportsBeneficiarySchemeChart.innerHTML = createBeneficiaryDistributionChart(
      currentYear.sponsorDistribution || []
    );
  }
  if (elements.reportsBeneficiaryYearComparisonTable) {
    const rows = [
      {
        label: beneficiarySupport.currentYearLabel,
        ...currentYear
      },
      ...(beneficiarySupport.previousYears || [])
    ];
    elements.reportsBeneficiaryYearComparisonTable.innerHTML = rows.length
      ? rows
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(item.label || "Unknown year")}</td>
                <td>${escapeHtml(item.totalBeneficiaries ?? 0)}</td>
                <td>${escapeHtml(item.totalAmountPaidLabel || "GHS 0")}</td>
                <td>${escapeHtml(item.importedListsCount ?? 0)}</td>
                <td>${escapeHtml(item.cohortCounts?.current ?? 0)}</td>
                <td>${escapeHtml(item.cohortCounts?.new ?? 0)}</td>
                <td>${escapeHtml(item.cohortCounts?.carriedForward ?? 0)}</td>
              </tr>
            `
          )
          .join("")
      : `<tr><td colspan="7" class="empty-cell">Beneficiary year comparison will appear here.</td></tr>`;
  }
}

async function loadReportsOverview() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    state.reportsOverview = null;
    renderReportsOverview();
    setReportsOverviewMessage("Enter the API URL first to load the reporting overview.", "error");
    return;
  }

  setReportsOverviewMessage("Loading reporting overview...", "warning");
  try {
    const response = await fetch(`${apiBaseUrl}/api/reports/overview`, {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to load reports overview.");
    }

    state.reportsOverview = payload.summary || null;
    renderReportsOverview(state.reportsOverview);
    setReportsOverviewMessage("Reporting overview is up to date.", "success");
  } catch (error) {
    state.reportsOverview = null;
    renderReportsOverview();
    setReportsOverviewMessage(error.message, "error");
  }
}

async function loadReportsBeneficiarySchemeReport(event) {
  event?.preventDefault();
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    setReportsBeneficiarySchemeMessage("Enter the API URL first to load the scheme report.", "error");
    return;
  }

  const academicYearLabel = elements.reportsBeneficiaryAcademicYear?.value || "";
  const schemeName = elements.reportsBeneficiarySchemeName?.value || "";
  if (!academicYearLabel || !schemeName) {
    state.reportsBeneficiarySchemeReport = null;
    renderReportsBeneficiarySchemeReport();
    setReportsBeneficiarySchemeMessage(
      "Choose both the academic year and support name before loading the scheme report.",
      "warning"
    );
    return;
  }

  if (elements.reportsBeneficiaryLoadButton) {
    elements.reportsBeneficiaryLoadButton.disabled = true;
  }
  setReportsBeneficiarySchemeMessage("Loading beneficiary scheme report...", "warning");

  try {
    const url = new URL(`${apiBaseUrl}/api/reports/beneficiaries/scheme`);
    url.searchParams.set("academicYearLabel", academicYearLabel);
    url.searchParams.set("schemeName", schemeName);
    const response = await fetch(url.toString(), {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to load the beneficiary scheme report.");
    }

    if (payload.filterOptions) {
      state.beneficiaryFilterOptions = {
        academicYears: payload.filterOptions.academicYears || [],
        schemeNames: payload.filterOptions.schemeNames || [],
        colleges: payload.filterOptions.colleges || []
      };
      renderBeneficiaryFilterOptions(state.beneficiaryFilterOptions);
      if (elements.reportsBeneficiaryAcademicYear) {
        elements.reportsBeneficiaryAcademicYear.value = academicYearLabel;
      }
      if (elements.reportsBeneficiarySchemeName) {
        elements.reportsBeneficiarySchemeName.value = schemeName;
      }
    }

    state.reportsBeneficiarySchemeReport = payload.report || null;
    renderReportsBeneficiarySchemeReport(state.reportsBeneficiarySchemeReport);
    setReportsBeneficiarySchemeMessage("Scheme report is up to date.", "success");
  } catch (error) {
    state.reportsBeneficiarySchemeReport = null;
    renderReportsBeneficiarySchemeReport();
    setReportsBeneficiarySchemeMessage(error.message, "error");
  } finally {
    if (elements.reportsBeneficiaryLoadButton) {
      elements.reportsBeneficiaryLoadButton.disabled = false;
    }
  }
}

async function exportReportsBeneficiaryScheme() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    setReportsBeneficiarySchemeMessage("Enter the API URL first to export the scheme workbook.", "error");
    return;
  }

  const academicYearLabel = elements.reportsBeneficiaryAcademicYear?.value || "";
  const schemeName = elements.reportsBeneficiarySchemeName?.value || "";
  if (!academicYearLabel || !schemeName) {
    setReportsBeneficiarySchemeMessage(
      "Choose both the academic year and support name before exporting the scheme workbook.",
      "warning"
    );
    return;
  }

  if (elements.reportsBeneficiaryExportButton) {
    elements.reportsBeneficiaryExportButton.disabled = true;
  }
  setReportsBeneficiarySchemeMessage("Preparing scheme Excel export...", "warning");

  try {
    const url = new URL(`${apiBaseUrl}/api/reports/beneficiaries/export`);
    url.searchParams.set("academicYearLabel", academicYearLabel);
    url.searchParams.set("schemeName", schemeName);
    const response = await fetch(url.toString(), {
      headers: {
        ...getAuthHeaders()
      }
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || "Unable to export the scheme workbook.");
    }

    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const disposition = response.headers.get("Content-Disposition") || "";
    const fileNameMatch = /filename="([^"]+)"/i.exec(disposition);
    anchor.href = downloadUrl;
    anchor.download = fileNameMatch?.[1] || "beneficiary-scheme-report.xlsx";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(downloadUrl);
    setReportsBeneficiarySchemeMessage("Scheme workbook exported successfully.", "success");
  } catch (error) {
    setReportsBeneficiarySchemeMessage(error.message, "error");
  } finally {
    if (elements.reportsBeneficiaryExportButton) {
      elements.reportsBeneficiaryExportButton.disabled = false;
    }
  }
}

async function exportReportsBeneficiarySummary() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    setReportsOverviewMessage("Enter the API URL first to export the beneficiary summary workbook.", "error");
    return;
  }

  if (elements.reportsBeneficiarySummaryExportButton) {
    elements.reportsBeneficiarySummaryExportButton.disabled = true;
  }
  setReportsOverviewMessage("Preparing the beneficiary summary workbook...", "warning");

  try {
    const response = await fetch(`${apiBaseUrl}/api/reports/beneficiaries/summary-export`, {
      headers: {
        ...getAuthHeaders()
      }
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || "Unable to export the beneficiary summary workbook.");
    }

    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const disposition = response.headers.get("Content-Disposition") || "";
    const matchedFileName = disposition.match(/filename=\"?([^\";]+)\"?/i);
    const fileName = matchedFileName?.[1] || "beneficiary-summary-report.xlsx";

    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(downloadUrl);

    setReportsOverviewMessage("Beneficiary summary workbook exported successfully.", "success");
  } catch (error) {
    setReportsOverviewMessage(error.message, "error");
  } finally {
    if (elements.reportsBeneficiarySummaryExportButton) {
      elements.reportsBeneficiarySummaryExportButton.disabled = false;
    }
  }
}

function formatAcademicYearLabel(value) {
  const base = String(value || "").trim();
  if (!base) {
    return "Academic year not set";
  }

  return /academic year/i.test(base) ? base : `${base} Academic Year`;
}

function renderTheme() {
  document.body.dataset.theme = state.theme;
  for (const button of elements.themeButtons) {
    button.classList.toggle("is-active", button.dataset.themeChoice === state.theme);
  }
}

function setTheme(theme) {
  state.theme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
  renderTheme();
}

function getStoredUnresolvedRejectedRowsCount() {
  return Number(safeLocalStorageGet(DASHBOARD_REJECTED_ROWS_KEY, "0")) || 0;
}

function setStoredUnresolvedRejectedRowsCount(count) {
  safeLocalStorageSet(DASHBOARD_REJECTED_ROWS_KEY, Math.max(0, Number(count || 0)));
}

function setDashboardMessage(message, tone = "warning") {
  if (!elements.dashboardMessage) return;
  elements.dashboardMessage.textContent = message;
  elements.dashboardMessage.className = `inline-note tone-${tone}`;
}

function getDashboardMetricCards(data) {
  const metrics = data?.metrics || {};
  return [
    {
      key: "total-applications",
      label: "Total applications",
      value: metrics.totalApplications ?? 0,
      description: "Across all active schemes",
      action: { section: "review" }
    },
    {
      key: "qualified",
      label: "Qualified",
      value: metrics.qualified ?? 0,
      description: "Ready after review",
      action: { section: "review", qualificationStatus: "qualified" }
    },
    {
      key: "pending",
      label: "Pending",
      value: metrics.pending ?? 0,
      description: "Need follow-up or verification",
      action: { section: "review", qualificationStatus: "pending" }
    },
    {
      key: "disqualified",
      label: "Disqualified",
      value: metrics.disqualified ?? 0,
      description: "Completed with negative outcome",
      action: { section: "review", qualificationStatus: "disqualified" }
    },
    {
      key: "not-reviewed",
      label: "Yet to review",
      value: metrics.notReviewed ?? 0,
      description: "Awaiting reviewer attention",
      action: { section: "review", qualificationStatus: "not_reviewed" }
    },
    {
      key: "schemes",
      label: "Active schemes",
      value: metrics.totalSchemes ?? 0,
      description: "Configured for the current dashboard",
      action: { section: "import" }
    },
    {
      key: "academic-years",
      label: "Active academic years",
      value: metrics.activeAcademicYears ?? 0,
      description: "Distinct years across active schemes",
      action: { section: "import" }
    },
    {
      key: "waitlist",
      label: "Recommended students",
      value: metrics.waitlistSize ?? 0,
      description: "Students recorded by SSFS for recommendation into support schemes",
      action: { module: "waitlist" }
    }
  ];
}

function renderDashboard(data = state.dashboard) {
  const dashboard = data || {
      metrics: {},
      schemeProgress: [],
      beneficiarySupport: EMPTY_BENEFICIARY_DASHBOARD,
      recentActivity: [],
    pendingActions: {
      applicationsAwaitingReview: 0,
      unresolvedRejectedRowCorrections: getStoredUnresolvedRejectedRowsCount(),
      nameMismatchFlags: 0,
      schemesWithoutCriteria: 0
    },
    reviewerLeaderboard: []
  };

  const unresolvedRejectedRowCorrections =
    Number(dashboard.pendingActions?.unresolvedRejectedRowCorrections || 0) ||
    getStoredUnresolvedRejectedRowsCount();

  const metricToneClassMap = {
    "total-applications": "dashboard-metric-card--neutral",
    qualified: "dashboard-metric-card--success",
    pending: "dashboard-metric-card--warning",
    disqualified: "dashboard-metric-card--error",
    "not-reviewed": "dashboard-metric-card--info",
    schemes: "dashboard-metric-card--accent",
    "academic-years": "dashboard-metric-card--accent",
    waitlist: "dashboard-metric-card--waitlist"
  };

  elements.dashboardMetricCards.innerHTML = getDashboardMetricCards(dashboard)
    .map((item) => {
      const disabled = !item.action;
      return `
        <button
          class="dashboard-metric-button metric-card fade-in ${metricToneClassMap[item.key] || "dashboard-metric-card--neutral"}"
          type="button"
          ${disabled ? "disabled" : ""}
          data-dashboard-action="${escapeHtml(JSON.stringify(item.action || {}))}"
        >
          <span class="metric-label">${escapeHtml(item.label)}</span>
          <strong class="metric-value">${escapeHtml(item.value ?? 0)}</strong>
          <span class="detail-subcopy">${escapeHtml(item.description)}</span>
        </button>
      `;
      })
      .join("");

  renderDashboardBeneficiarySection(dashboard);

  elements.dashboardDecisionChart.innerHTML = createDashboardDecisionChart(dashboard.metrics || {});
  elements.dashboardSchemeChart.innerHTML = createDashboardSchemeChart(
    Array.isArray(dashboard.schemeProgress) ? dashboard.schemeProgress : []
  );

  const schemeProgress = Array.isArray(dashboard.schemeProgress) ? dashboard.schemeProgress : [];
  elements.dashboardSchemeProgress.innerHTML = schemeProgress.length
    ? schemeProgress
        .map((item) => `
          <button
            class="dashboard-progress-card fade-in"
            type="button"
            data-dashboard-action="${escapeHtml(
              JSON.stringify({
                section: "review",
                schemeId: item.schemeId,
                cycleId: item.cycleId || "",
                qualificationStatus: ""
              })
            )}"
          >
            <div class="dashboard-card-top">
              <div class="dashboard-card-copy">
                <strong>${escapeHtml(item.schemeName || "Unknown scheme")}</strong>
                <p>${escapeHtml(item.academicYearLabel || "No academic year")}</p>
              </div>
              <span class="dashboard-card-value">${escapeHtml(item.reviewedCount ?? 0)}/${escapeHtml(
                item.totalCount ?? 0
              )}</span>
            </div>
            <div class="dashboard-progress-bar">
              <div class="dashboard-progress-fill" style="width:${clampPercentage(item.reviewPercentage)}%"></div>
            </div>
            <div class="dashboard-progress-meta">
              <span class="dashboard-mini-pill">${escapeHtml(clampPercentage(item.reviewPercentage))}% reviewed</span>
              <span class="dashboard-mini-pill">Qualified: ${escapeHtml(item.qualifiedCount ?? 0)}</span>
              <span class="dashboard-mini-pill">Pending: ${escapeHtml(item.pendingCount ?? 0)}</span>
              <span class="dashboard-mini-pill">Disqualified: ${escapeHtml(item.disqualifiedCount ?? 0)}</span>
              <span class="dashboard-mini-pill">Yet to review: ${escapeHtml(item.notReviewedCount ?? 0)}</span>
            </div>
          </button>
        `)
        .join("")
    : `<p class="empty-state">No active schemes have application review data yet.</p>`;

  const alerts = [
    {
      key: "applicationsAwaitingReview",
      label: "Applications awaiting review",
      count: dashboard.pendingActions?.applicationsAwaitingReview ?? 0,
      tone: "warning",
      description: "Open the review list and continue the qualification workflow.",
      action: { section: "review", qualificationStatus: "not_reviewed" }
    },
    {
      key: "unresolvedRejectedRowCorrections",
      label: "Unresolved rejected row corrections",
      count: unresolvedRejectedRowCorrections,
      tone: unresolvedRejectedRowCorrections > 0 ? "warning" : "success",
      description: "Based on the latest application import preview in this browser session.",
      action: { section: "import", focus: "application-issues" }
    },
    {
      key: "nameMismatchFlags",
      label: "Name or data mismatch flags",
      count: dashboard.pendingActions?.nameMismatchFlags ?? 0,
      tone: (dashboard.pendingActions?.nameMismatchFlags ?? 0) > 0 ? "warning" : "success",
      description: "Applicant data differs from the linked registry record and should be reviewed.",
      action: { section: "review", mismatchOnly: true }
    },
    {
      key: "schemesWithoutCriteria",
      label: "Schemes without criteria",
      count: dashboard.pendingActions?.schemesWithoutCriteria ?? 0,
      tone: (dashboard.pendingActions?.schemesWithoutCriteria ?? 0) > 0 ? "error" : "success",
      description: "Criteria should be defined before review decisions become consistent.",
      action: { section: "import", focus: "criteria" }
    }
  ];

  elements.dashboardAlertsList.innerHTML = alerts
    .map((item) => `
      <article class="dashboard-alert-card is-${escapeHtml(item.tone)} fade-in">
        <div class="dashboard-card-top">
          <div class="dashboard-card-copy">
            <strong>${escapeHtml(item.label)}</strong>
            <p>${escapeHtml(item.description)}</p>
          </div>
          <span class="dashboard-card-value">${escapeHtml(item.count)}</span>
        </div>
        <button
          class="dashboard-action-link"
          type="button"
          data-dashboard-action="${escapeHtml(JSON.stringify(item.action || {}))}"
        >
          Open
        </button>
      </article>
    `)
    .join("");

  const recentActivity = Array.isArray(dashboard.recentActivity) ? dashboard.recentActivity : [];
  elements.dashboardActivityFeed.innerHTML = recentActivity.length
    ? recentActivity
        .map((item) => `
          <article class="dashboard-activity-card fade-in">
            <div class="dashboard-card-top">
              <div class="dashboard-card-copy">
                <h4 class="dashboard-activity-title">${escapeHtml(item.title || "Activity")}</h4>
                <p>${escapeHtml(item.detail || "Operational update")}</p>
              </div>
              <span class="dashboard-timestamp">${escapeHtml(formatRelativeDateTime(item.timestamp))}</span>
            </div>
            <div class="dashboard-activity-meta">
              <span class="dashboard-mini-pill">Actor: ${escapeHtml(item.actorName || "System")}</span>
              ${
                item.qualificationStatus
                  ? `<span class="dashboard-mini-pill">Decision: ${escapeHtml(
                      formatDecisionLabel(item.qualificationStatus)
                    )}</span>`
                  : ""
              }
              ${
                item.studentReferenceId
                  ? `<span class="dashboard-mini-pill">Ref: ${escapeHtml(item.studentReferenceId)}</span>`
                  : ""
              }
            </div>
            <button
              class="dashboard-action-link"
              type="button"
              data-dashboard-action="${escapeHtml(
                JSON.stringify({
                  section: "review",
                  schemeId: item.schemeId || "",
                  cycleId: item.cycleId || "",
                  studentReferenceId: item.studentReferenceId || "",
                  qualificationStatus: item.qualificationStatus || ""
                })
              )}"
            >
              Drill down
            </button>
          </article>
        `)
        .join("")
    : `<p class="empty-state">No recent activity has been captured yet.</p>`;

  const reviewerLeaderboard = Array.isArray(dashboard.reviewerLeaderboard)
    ? dashboard.reviewerLeaderboard
    : [];
  elements.dashboardReviewerLeaderboard.innerHTML = reviewerLeaderboard.length
    ? reviewerLeaderboard
        .map(
          (item, index) => `
            <article class="dashboard-leaderboard-card fade-in">
              <div class="dashboard-card-top">
                <div class="dashboard-card-copy">
                  <h4 class="dashboard-leaderboard-name">${escapeHtml(item.reviewerName || "Unknown reviewer")}</h4>
                  <p>${escapeHtml(item.decisionCount ?? 0)} decisions recorded</p>
                </div>
                <span class="dashboard-rank-badge">${index + 1}</span>
              </div>
              <div class="dashboard-leaderboard-meta">
                <span class="dashboard-mini-pill">Qualified: ${escapeHtml(item.qualifiedCount ?? 0)}</span>
                <span class="dashboard-mini-pill">Pending: ${escapeHtml(item.pendingCount ?? 0)}</span>
                <span class="dashboard-mini-pill">Disqualified: ${escapeHtml(item.disqualifiedCount ?? 0)}</span>
                <span class="dashboard-mini-pill">Last activity: ${escapeHtml(
                  formatRelativeDateTime(item.lastDecisionAt)
                )}</span>
              </div>
            </article>
          `
        )
        .join("")
    : `<p class="empty-state">Reviewer workload will appear here after review decisions are saved.</p>`;

  for (const button of document.querySelectorAll("[data-dashboard-action]")) {
    button.addEventListener("click", () => {
      const raw = button.dataset.dashboardAction || "{}";
      try {
        void handleDashboardAction(JSON.parse(raw));
      } catch {
        setDashboardMessage("That dashboard link could not be opened.", "error");
      }
    });
  }
}

function renderModuleShell() {
  state.activeModule = resolveModuleForRole(getCurrentActorRole(), state.activeModule);
  const meta = MODULE_META[state.activeModule];
  elements.moduleTitle.textContent = meta.title;
  elements.moduleDescription.textContent = meta.description;
  persistWorkspaceState();

  const visibleModules = new Set(getVisibleModulesForRole(getCurrentActorRole()));
  for (const item of elements.navItems) {
    item.hidden = !visibleModules.has(item.dataset.module);
    item.classList.toggle("is-active", item.dataset.module === state.activeModule);
  }

  for (const label of document.querySelectorAll(".sidebar-nav .nav-section-label")) {
    let next = label.nextElementSibling;
    let hasVisibleItem = false;
    while (next && !next.classList.contains("nav-section-label")) {
      if (next.matches?.("[data-module]") && !next.hidden) {
        hasVisibleItem = true;
        break;
      }
      next = next.nextElementSibling;
    }
    label.hidden = !hasVisibleItem;
  }

  for (const view of elements.moduleViews) {
    view.classList.toggle("is-active", view.dataset.moduleView === state.activeModule);
  }

  const registryVisible = state.activeModule === "registry";
  for (const tab of elements.moduleTabs) {
    tab.hidden = !registryVisible;
    tab.classList.toggle("is-active", registryVisible && tab.dataset.section === state.activeSection);
  }

  for (const view of elements.sectionViews) {
    view.classList.toggle(
      "is-active",
      registryVisible && view.dataset.sectionView === state.activeSection
    );
  }

  const applicationsVisible = state.activeModule === "applications";
  for (const tab of elements.applicationTabButtons) {
    tab.hidden = !applicationsVisible;
    tab.classList.toggle(
      "is-active",
      applicationsVisible && tab.dataset.applicationSection === state.activeApplicationsSection
    );
  }

  for (const view of elements.applicationSectionViews) {
    view.classList.toggle(
      "is-active",
      applicationsVisible &&
        view.dataset.applicationSectionView === state.activeApplicationsSection
    );
  }

  const beneficiariesVisible = state.activeModule === "awards";
  for (const tab of elements.beneficiaryTabButtons) {
    tab.hidden = !beneficiariesVisible;
    tab.classList.toggle(
      "is-active",
      beneficiariesVisible && tab.dataset.beneficiarySection === state.activeBeneficiarySection
    );
  }

  for (const view of elements.beneficiarySectionViews) {
    view.classList.toggle(
      "is-active",
      beneficiariesVisible &&
        view.dataset.beneficiarySectionView === state.activeBeneficiarySection
    );
  }

  syncBeneficiaryControls();
  syncRecommendedControls();
}

async function handleClearBeneficiaryScope() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    setBeneficiaryListMessage("Enter the API URL first.", "error");
    return;
  }
  if (!canManageBeneficiaryImports()) {
    setBeneficiaryListMessage("Only admins can clear beneficiary records.", "error");
    return;
  }

  const { academicYearLabel, schemeName } = getScopedBeneficiaryClearSelection();
  if (!academicYearLabel) {
    setBeneficiaryListMessage("Choose the academic year filter before clearing beneficiary records.", "error");
    return;
  }
  if (!schemeName) {
    setBeneficiaryListMessage("Choose the support name filter before clearing beneficiary records.", "error");
    return;
  }

  const confirmation = window.prompt(
    `Type CLEAR BENEFICIARY DATA to remove beneficiary records for ${schemeName} in ${academicYearLabel}.`
  );
  if (confirmation === null) {
    setBeneficiaryListMessage("Scoped beneficiary clear cancelled.", "warning");
    return;
  }
  if (confirmation.trim().toUpperCase() !== "CLEAR BENEFICIARY DATA") {
    setBeneficiaryListMessage(
      "Scoped beneficiary clear cancelled because the confirmation text did not match.",
      "error"
    );
    return;
  }
  const reason =
    window.prompt(
      "Enter a short reason for clearing these beneficiary records.",
      `Clearing incorrect beneficiary rows for ${schemeName}`
    ) || "";

  if (elements.beneficiaryClearScopedButton) {
    elements.beneficiaryClearScopedButton.disabled = true;
  }
  setBeneficiaryListMessage(
    `Clearing beneficiary records for ${schemeName} in ${academicYearLabel}...`,
    "warning"
  );

  try {
    const response = await fetch(`${apiBaseUrl}/api/beneficiaries/clear`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        academicYearLabel,
        schemeName,
        confirmation: "CLEAR BENEFICIARY DATA",
        reason: reason.trim()
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "The scoped beneficiary clear request failed.");
    }

    await loadBeneficiaryRecords();
    await loadBeneficiaryImportHistory();
    await loadBeneficiaryAuditFeed();
    await loadDashboard();
    await loadReportsOverview();
    setBeneficiaryListMessage(payload.message || "Beneficiary records cleared.", "success");
  } catch (error) {
    setBeneficiaryListMessage(error.message, "error");
  } finally {
    syncBeneficiaryControls();
  }
}

async function loadDashboard() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    state.dashboard = null;
    renderDashboard();
    setDashboardMessage("Enter the API URL first to load the dashboard.", "error");
    return;
  }

  setDashboardMessage("Loading dashboard metrics and activity...", "warning");

  try {
    const response = await fetch(`${apiBaseUrl}/api/reports/dashboard`, {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to load the dashboard.");
    }

    state.dashboard = payload.dashboard || null;
    renderDashboard(state.dashboard);
    setDashboardMessage("Dashboard is up to date.", "success");
  } catch (error) {
    state.dashboard = null;
    renderDashboard();
    setDashboardMessage(error.message, "error");
  }
}

async function handleDashboardAction(action = {}) {
  if (action.module === "waitlist") {
    state.activeModule = "waitlist";
    renderModuleShell();
    return;
  }

  state.activeModule = "applications";
  state.activeApplicationsSection = action.section || "review";
  renderModuleShell();

  await loadApplicationOptions();

  if (action.schemeId && state.schemes.some((item) => item.id === action.schemeId)) {
    elements.applicationSchemeSelect.value = action.schemeId;
  }
  if (action.cycleId && state.cycles.some((item) => item.id === action.cycleId)) {
    elements.applicationCycleSelect.value = action.cycleId;
  }

  await loadApplicationCriteria();

  if (action.section === "import") {
    if (action.focus === "criteria") {
      state.criteriaPanelHidden = false;
      renderCriteriaPanelVisibility();
      setApplicationCriteriaMessage(
        "These schemes still need screening criteria before reviews can be fully guided.",
        "warning"
      );
    }

    if (action.focus === "application-issues") {
      setApplicationsMessage(
        "Open the latest application preview to continue correcting unresolved rejected rows.",
        "warning"
      );
      document.querySelector("#applicationIssueEditorList")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
    return;
  }

  const reviewFilters = {};
  const useGlobalScope = !action.schemeId && !action.cycleId;
  if (useGlobalScope) {
    reviewFilters.__skipContext = true;
  }
  if (action.studentReferenceId) {
    elements.applicationReviewSearchReference.value = action.studentReferenceId;
    reviewFilters.studentReferenceId = action.studentReferenceId;
  } else {
    elements.applicationReviewSearchReference.value = "";
  }
  if (action.qualificationStatus) {
    reviewFilters.qualificationStatus = action.qualificationStatus;
  }
  if (action.mismatchOnly) {
    reviewFilters.nameMismatchOnly = "true";
  }

  await loadApplicationsList(
    action.qualificationStatus
      ? { qualificationStatus: action.qualificationStatus, __skipContext: useGlobalScope }
      : useGlobalScope
        ? { __skipContext: true }
        : {}
  );
  await refreshApplicationReviewWorkspace(reviewFilters);

  const focusLabel = action.mismatchOnly
    ? "name mismatch flags"
    : action.qualificationStatus
      ? formatDecisionLabel(action.qualificationStatus)
      : "applications";
  setApplicationReviewMessage(`Showing ${focusLabel.toLowerCase()} from the dashboard.`, "success");
}

function setMessage(text, tone = "warning") {
  elements.formMessage.textContent = text;
  elements.formMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setSearchMessage(text, tone = "warning") {
  elements.searchMessage.textContent = text;
  elements.searchMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setAcademicHistoryMessage(text, tone = "warning") {
  elements.academicHistoryMessage.textContent = text;
  elements.academicHistoryMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setAcademicHistorySearchMessage(text, tone = "warning") {
  elements.academicHistorySearchMessage.textContent = text;
  elements.academicHistorySearchMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setFlagReviewMessage(text, tone = "warning") {
  elements.flagReviewMessage.textContent = text;
  elements.flagReviewMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setDuplicateResolutionMessage(text, tone = "warning") {
  elements.duplicateResolutionMessage.textContent = text;
  elements.duplicateResolutionMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setApplicationsMessage(text, tone = "warning") {
  elements.applicationsFormMessage.textContent = text;
  elements.applicationsFormMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setApplicationsListMessage(text, tone = "warning") {
  elements.applicationsListMessage.textContent = text;
  elements.applicationsListMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setApplicationReviewMessage(text, tone = "warning") {
  elements.applicationReviewMessage.textContent = text;
  elements.applicationReviewMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setApplicationAcademicEntryMessage(text, tone = "warning") {
  elements.applicationAcademicEntryMessage.textContent = text;
  elements.applicationAcademicEntryMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setApplicationBulkInterviewMessage(text, tone = "warning") {
  elements.applicationBulkInterviewMessage.textContent = text;
  elements.applicationBulkInterviewMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setApplicationReviewMetricsMessage(text, tone = "warning") {
  elements.applicationReviewMetricsMessage.textContent = text;
  elements.applicationReviewMetricsMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setApplicationCwaCoverageMessage(text, tone = "warning") {
  elements.applicationCwaCoverageMessage.textContent = text;
  elements.applicationCwaCoverageMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setApplicationExportMessage(text, tone = "warning") {
  elements.applicationExportMessage.textContent = text;
  elements.applicationExportMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setApplicationOutcomeMessage(text, tone = "warning") {
  elements.applicationOutcomeMessage.textContent = text;
  elements.applicationOutcomeMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setApplicationMessagingMessage(text, tone = "warning") {
  elements.applicationMessagingMessage.textContent = text;
  elements.applicationMessagingMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function formatMessagingChannelLabel(channel) {
  switch (String(channel || "").trim().toLowerCase()) {
    case "sms":
      return "SMS";
    case "whatsapp":
      return "WhatsApp";
    case "email":
    default:
      return "Email";
  }
}

function renderApplicationMessagingChannelOptions() {
  const options = [{ value: "email", label: "Email" }];
  if (state.applicationMessagingSmsEnabled) {
    options.push({ value: "sms", label: "SMS" });
  }
  if (state.applicationMessagingWhatsAppEnabled) {
    options.push({ value: "whatsapp", label: "WhatsApp" });
  }

  if (!options.some((option) => option.value === state.applicationMessagingChannel)) {
    state.applicationMessagingChannel = "email";
  }

  elements.applicationMessagingChannel.innerHTML = options
    .map(
      (option) =>
        `<option value="${escapeHtml(option.value)}"${option.value === state.applicationMessagingChannel ? " selected" : ""}>${escapeHtml(option.label)}</option>`
    )
    .join("");
}

function renderApplicationMessagingSender() {
  const channel = state.applicationMessagingChannel;
  elements.applicationMessagingSenderField.hidden = channel !== "email";
  elements.applicationMessagingSenderPhoneField.hidden = channel !== "sms";
  elements.applicationMessagingSenderWhatsAppField.hidden = channel !== "whatsapp";

  elements.applicationMessagingSender.value = state.applicationMessagingSenderEmail || "";
  elements.applicationMessagingSender.placeholder = state.applicationMessagingSenderEmail
    ? ""
    : "Load the messaging settings to view sender";

  elements.applicationMessagingSenderPhone.value = state.applicationMessagingSenderPhone || "";
  elements.applicationMessagingSenderPhone.placeholder = state.applicationMessagingSenderPhone
    ? ""
    : "Load the messaging settings to view SMS sender";

  elements.applicationMessagingSenderWhatsApp.value = state.applicationMessagingSenderWhatsApp || "";
  elements.applicationMessagingSenderWhatsApp.placeholder = state.applicationMessagingSenderWhatsApp
    ? ""
    : "Load the messaging settings to view WhatsApp sender";
}

function renderApplicationMessagingBodyCharCount() {
  const body = getEffectiveApplicationMessagingBody();
  const length = String(body || "").length;
  if (state.applicationMessagingChannel === "sms") {
    elements.applicationMessagingBodyCharCount.textContent = `${length} characters | standard SMS limit: 160`;
  } else {
    elements.applicationMessagingBodyCharCount.textContent = `${length} characters`;
  }
}

function getEffectiveApplicationMessagingSubject(preview = state.applicationMessagingPreview) {
  return state.applicationMessagingDraftSubject || preview?.subjectLine || "";
}

function getEffectiveApplicationMessagingBody(preview = state.applicationMessagingPreview) {
  return state.applicationMessagingDraftBody || preview?.bodyTemplate || "";
}

function getEffectiveApplicationMessagingRecipients(preview = state.applicationMessagingPreview) {
  const recipients = Array.isArray(preview?.recipients) ? preview.recipients : [];
  const channel = preview?.channel || state.applicationMessagingChannel;
  return recipients.map((item) => {
    const edit = state.applicationMessagingRecipientEdits[String(item.applicationId || "")] || null;
    const email = edit?.email ?? item.email ?? "";
    const phone = edit?.phone ?? item.phone ?? "";
    const trimmedEmail = String(email || "").trim();
    const trimmedPhone = String(phone || "").trim();
    return {
      ...item,
      email: trimmedEmail,
      phone: trimmedPhone,
      issue:
        channel === "email"
          ? trimmedEmail
            ? null
            : "Applicant email is missing from the registry."
          : trimmedPhone
            ? null
            : "Applicant phone number is missing from the registry."
    };
  });
}

function setApplicationInterviewImportMessage(text, tone = "warning") {
  elements.applicationInterviewImportMessage.textContent = text;
  elements.applicationInterviewImportMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setSingleApplicationMessage(text, tone = "warning") {
  elements.singleApplicationMessage.textContent = text;
  elements.singleApplicationMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setApplicationIssueEditorMessage(text, tone = "warning") {
  elements.applicationIssueEditorMessage.textContent = text;
  elements.applicationIssueEditorMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setSchemeMessage(text, tone = "warning") {
  elements.schemeMessage.textContent = text;
  elements.schemeMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setApplicationCriteriaMessage(text, tone = "warning") {
  elements.applicationCriteriaMessage.textContent = text;
  elements.applicationCriteriaMessage.className = `inline-note ${tone ? `tone-${tone}` : ""}`;
}

function setBadge(text, tone = "") {
  elements.apiHealthBadge.textContent = text;
  elements.apiHealthBadge.className = `status-dot ${tone ? `is-${tone}` : ""}`.trim();
}

function getCurrentActorRole() {
  return state.session?.actor?.roleCode || "";
}

function canReviewApplications() {
  return ["admin", "reviewer"].includes(getCurrentActorRole());
}

function canManageApplicationImportsExports() {
  return getCurrentActorRole() === "admin";
}

function canManageApplicationMessaging() {
  return getCurrentActorRole() === "admin";
}

function canManageBeneficiaryImports() {
  return getCurrentActorRole() === "admin";
}

function canManageRecommendedStudents() {
  return getCurrentActorRole() === "admin";
}

function canManageRecommendedImports() {
  return getCurrentActorRole() === "admin";
}

function canUpdateMessagingRecipients() {
  return canReviewApplications();
}

function isApplicationMessagingSendEnabledForChannel(channel) {
  switch (String(channel || "").trim().toLowerCase()) {
    case "sms":
      return state.applicationMessagingSmsEnabled;
    case "whatsapp":
      return state.applicationMessagingWhatsAppEnabled;
    case "email":
    default:
      return state.applicationMessagingSendingEnabled;
  }
}

function canExportApplications() {
  return canManageApplicationImportsExports();
}

function canManageApplicationOutcomes() {
  return canReviewApplications();
}

function getDecisionTone(decision) {
  switch (decision) {
    case "qualified":
      return "success";
    case "disqualified":
      return "error";
    case "pending":
    default:
      return "warning";
  }
}

function getOutcomeTone(outcome) {
  switch (String(outcome || "").trim().toLowerCase()) {
    case "awarded":
      return "success";
    case "waitlisted":
      return "warning";
    case "not_selected":
      return "error";
    default:
      return "warning";
  }
}

function formatDecisionLabel(decision) {
  const value = String(decision || "").trim();
  if (!value) {
    return "Yet to review";
  }

  if (value === "not_reviewed") {
    return "Yet to review";
  }

  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatOutcomeLabel(outcome) {
  switch (String(outcome || "").trim().toLowerCase()) {
    case "awarded":
      return "Awarded";
    case "waitlisted":
      return "Legacy waitlist";
    case "not_selected":
      return "Not selected";
    default:
      return "Not assigned";
  }
}

function formatInterviewStatusLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  switch (normalized) {
    case "pending":
      return "Pending";
    case "scheduled":
      return "Scheduled";
    case "completed":
      return "Completed";
    case "waived":
      return "Waived";
    default:
      return "Not started";
  }
}

function getScreeningDecisionTone(decision) {
  if (!decision) {
    return "warning";
  }

  return getDecisionTone(decision);
}

function formatScreeningDecisionLabel(decision) {
  if (!decision) {
    return "No rules configured";
  }

  return formatDecisionLabel(decision);
}

function buildScreeningAssessmentMarkup(assessment, options = {}) {
  if (!assessment) {
    return "";
  }

  const compact = Boolean(options.compact);
  const checks = Array.isArray(assessment.checks) ? assessment.checks : [];

  return `
    <div class="detail-flags">
      ${
        assessment.recommendedDecision
          ? createFlagPill(
              `Suggested decision: ${formatScreeningDecisionLabel(
                assessment.recommendedDecision
              )}`,
              getScreeningDecisionTone(assessment.recommendedDecision)
            )
          : createFlagPill("Suggested decision: Not configured", "warning")
      }
    </div>
    <p class="detail-subcopy">${escapeHtml(
      assessment.summary || "Automatic screening details will appear here."
    )}</p>
    ${
      compact || !checks.length
        ? ""
        : `
          <div class="detail-grid">
            ${checks
              .map(
                (check) => `
                  <div class="detail-item">
                    <span>${escapeHtml(check.label || "Check")}</span>
                    <strong>${escapeHtml(formatDecisionLabel(check.status || ""))}</strong>
                    <p class="detail-subcopy">${escapeHtml(check.message || "")}</p>
                  </div>
                `
              )
              .join("")}
          </div>
        `
    }
  `;
}

function syncRegistryAdminControls() {
  const actorRole = state.session?.actor?.roleCode || "";
  elements.clearRegistryButton.disabled = actorRole !== "admin";
}

function getApiBaseUrl() {
  return elements.apiUrl.value.trim().replace(/\/$/, "");
}

function getAuthHeaders() {
  const token = elements.authToken.value.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function recoverExpiredSession(error) {
  if (!isAuthenticationSessionErrorMessage(error?.message)) {
    return false;
  }

  elements.authToken.value = "";
  persistConnectionState();
  setLoginMessage(
    "Your previous sign-in session ended after the API restarted. Please sign in again.",
    "warning"
  );
  await requestSession();
  return true;
}

async function requestSession(options = {}) {
  const reloadData = Boolean(options.reloadData);
  const apiBaseUrl = getApiBaseUrl();
  persistConnectionState();
  syncTokenPresetButtons();
  if (!apiBaseUrl) {
    state.session = null;
    state.sessionRestorePending = false;
    state.accessUsers = [];
    renderAccessUsers();
    renderAccessShell();
    setBadge("Connection unavailable", "error");
    elements.sessionCard.innerHTML = `<p class="session-status">Refresh the page to reconnect to the platform.</p>`;
    return;
  }

  setBadge("Checking API", "warning");

  try {
    const response = await fetch(`${apiBaseUrl}/api/auth/session`, {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || "Unable to reach the API session endpoint.");
    }

    state.session = payload;
    state.sessionRestorePending = false;
    const actor = payload.actor;
    if (!payload.authenticated) {
      elements.authToken.value = "";
      persistConnectionState();
      state.accessUsers = [];
      renderAccessUsers();
      renderAccessShell();
      setBadge("Sign in required", "warning");
      elements.sessionCard.innerHTML = `
        <p class="session-status">Sign in with a valid staff account to use the platform.</p>
        <p class="session-status">Auth mode: <strong>${escapeHtml(payload.authMode)}</strong></p>
      `;
      return;
    }

    sanitizeWorkspaceState();
    syncRegistryAdminControls();
    syncApplicationCriteriaControls();
    syncSchemeControls();
    syncApplicationReviewControls();
    renderSchemeFormState();
    renderSelectedApplicationReview();
    renderApplicationExportCards();
    syncBeneficiaryControls();
    renderAccessShell();
    renderModuleShell();
    if (getCurrentActorRole() === "admin") {
      void loadAccessUsers();
    } else {
      state.accessUsers = [];
      renderAccessUsers();
    }
    setBadge("API connected", "success");
    elements.sessionCard.innerHTML = `
      <p class="session-status">
        Signed in as <strong>${escapeHtml(actor.fullName)}</strong> with the <strong>${escapeHtml(actor.roleCode)}</strong> role.
      </p>
      <p class="session-status">
        Auth mode: <strong>${escapeHtml(payload.authMode)}</strong>
      </p>
    `;
    if (reloadData) {
      await refreshRoleScopedWorkspace();
    }
  } catch (error) {
    const errorMessage = String(error?.message || "");
    const failurePolicy = resolveSessionFailurePolicy({
      session: state.session,
      errorMessage
    });

    if (failurePolicy.clearStoredSession) {
      elements.authToken.value = "";
      persistConnectionState();
    }
    state.sessionRestorePending = false;

    if (failurePolicy.clearSessionState) {
      state.session = null;
      state.accessUsers = [];
      renderAccessUsers();
      renderAccessShell();
      setBadge("API unavailable", "error");
      elements.sessionCard.innerHTML = `
        <p class="session-status">
          The frontend could not reach the API at <strong>${escapeHtml(apiBaseUrl)}</strong>.
        </p>
        <p class="session-status">${escapeHtml(error.message)}</p>
      `;
      return;
    }

    const actor = state.session?.actor || {};
    renderAccessShell();
    setBadge("Workspace issue", "warning");
    elements.sessionCard.innerHTML = `
      <p class="session-status">
        Signed in as <strong>${escapeHtml(actor.fullName || actor.username || "Staff")}</strong>.
      </p>
      <p class="session-status">
        The workspace hit an error after sign-in, but your session is still active.
      </p>
      <p class="session-status">${escapeHtml(error.message)}</p>
    `;
  }
}

async function loadRegistryStats() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    return;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/api/students/stats`, {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.message || "Unable to load registry stats.");
    }

    state.registryStats = {
      existingRegistryStudents: Number(payload.stats?.existingRegistryStudents || 0),
      existingAcademicHistoryRecords: Number(payload.stats?.existingAcademicHistoryRecords || 0)
    };

    if (!state.preview) {
      renderSummary({
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        existingRegistryStudents: state.registryStats.existingRegistryStudents
      });
    }

    if (!state.academicHistoryPreview && !state.lastAcademicHistoryImport) {
      renderAcademicHistorySummary({
        totalRows: 0,
        matchedRows: 0,
        validRows: 0,
        missingCwaRows: 0,
        nameMismatchRows: 0,
        existingAcademicHistoryRecords: state.registryStats.existingAcademicHistoryRecords
      });
    }
  } catch {
    // Keep the last known counts if stats cannot be loaded right now.
  }
}

function resetRegistryWorkspace() {
  state.preview = null;
  state.lastImport = null;
  state.duplicateResolutions = {};
  state.searchResults = [];
  state.selectedStudent = null;
  state.flaggedResults = [];
  state.selectedFlaggedStudent = null;
  elements.studentFile.value = "";
  elements.selectedFileName.textContent = "No file selected yet";
  renderSummary({
    totalRows: 0,
    validRows: 0,
    invalidRows: 0,
    existingRegistryStudents: state.registryStats.existingRegistryStudents
  });
  renderValidRows([]);
  renderIssues([]);
  renderDuplicateCases([]);
  renderImportResults(null);
  renderSearchResults([]);
  renderStudentDetail(null);
  renderFlaggedResults([]);
  renderFlaggedDetail(null);
}

function resetAcademicHistoryWorkspace() {
  state.academicHistoryPreview = null;
  state.lastAcademicHistoryImport = null;
  elements.academicHistoryFile.value = "";
  elements.selectedAcademicHistoryFileName.textContent = "No CWA workbook selected yet";
  elements.academicHistoryImportButton.disabled = true;
  renderAcademicHistorySummary({
    totalRows: 0,
    matchedRows: 0,
    validRows: 0,
    missingCwaRows: 0,
    nameMismatchRows: 0,
    existingAcademicHistoryRecords: state.registryStats.existingAcademicHistoryRecords
  });
  renderAcademicHistoryValidRows([]);
  renderAcademicHistoryIssues([]);
  renderAcademicHistoryImportResults(null);
}

function renderApplicationSelectors() {
  const schemeOptions = state.schemes.length
    ? state.schemes
        .map(
          (item) =>
            `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} • ${escapeHtml(formatAcademicYearLabel(item.academicYearLabel || item.label || item.code || ""))}</option>`
        )
        .join("")
    : `<option value="">No schemes loaded</option>`;
  const cycleOptions = state.cycles.length
    ? state.cycles
        .map(
          (item) =>
            `<option value="${escapeHtml(item.id)}">${escapeHtml(formatAcademicYearLabel(item.academicYearLabel || item.label || item.code || ""))}</option>`
        )
        .join("")
    : `<option value="">No academic years loaded</option>`;
  const schemeCycleOptions = `${cycleOptions}<option value="__manual__">Type academic year manually</option>`;

  elements.applicationSchemeSelect.innerHTML = schemeOptions;
  elements.applicationCycleSelect.innerHTML = cycleOptions;
  elements.schemeAcademicYearSelect.innerHTML = schemeCycleOptions;
}

function syncSchemeAcademicYearMode() {
  if (!elements.schemeAcademicYearSelect || !elements.schemeAcademicYearManualField || !elements.schemeAcademicYearManualInput) {
    return;
  }

  const isManual = elements.schemeAcademicYearSelect.value === "__manual__";
  elements.schemeAcademicYearManualField.hidden = !isManual;
  elements.schemeAcademicYearManualInput.disabled =
    elements.schemeAcademicYearSelect.disabled || !isManual;
}

function syncSchemeControls() {
  const isAdmin = state.session?.actor?.roleCode === "admin";
  const disabled = !isAdmin;
  elements.schemeNameInput.disabled = disabled;
  elements.schemeCategoryInput.disabled = disabled;
  elements.schemeAcademicYearSelect.disabled = disabled;
  if (elements.schemeAcademicYearManualInput) {
    elements.schemeAcademicYearManualInput.disabled = disabled;
  }
  elements.schemeSaveButton.disabled = disabled;
  elements.schemeCancelButton.disabled = disabled;
  syncSchemeAcademicYearMode();
}

function resetSchemeForm() {
  state.editingSchemeId = null;
  elements.schemeForm.reset();
  if (state.cycles.length) {
    elements.schemeAcademicYearSelect.value = state.cycles[0].id;
  }
  if (elements.schemeAcademicYearManualInput) {
    elements.schemeAcademicYearManualInput.value = "";
  }
  syncSchemeAcademicYearMode();
  renderSchemeFormState();
}

function renderSchemeFormState() {
  const isEditing = Boolean(state.editingSchemeId);
  elements.schemeSaveButton.textContent = isEditing ? "Save changes" : "Add scheme";
  elements.schemeCancelButton.hidden = !isEditing;
}

function renderSchemePanelVisibility() {
  elements.schemePanelBody.hidden = state.schemePanelHidden;
  elements.schemePanelToggleButton.textContent = state.schemePanelHidden
    ? "Show manager"
    : "Hide manager";
}

function renderCriteriaPanelVisibility() {
  elements.criteriaPanelBody.hidden = state.criteriaPanelHidden;
  elements.criteriaToggleButton.textContent = state.criteriaPanelHidden
    ? "Show criteria"
    : "Hide criteria";
}

function renderSchemesList(items) {
  if (!items.length) {
    elements.schemeList.innerHTML = `<p class="empty-state">No schemes loaded yet.</p>`;
    return;
  }

  const isAdmin = state.session?.actor?.roleCode === "admin";
  elements.schemeList.innerHTML = items
    .map(
      (item) => `
        <article class="search-result-card fade-in">
          <div class="search-result-top">
            <div>
              <strong>${escapeHtml(item.name)}</strong>
              <p class="detail-subcopy">${escapeHtml(formatAcademicYearLabel(item.academicYearLabel))} • ${escapeHtml(item.category || "scheme")}</p>
            </div>
            ${
              isAdmin
                ? `
                  <div class="scheme-card-actions">
                    <button class="action-button tertiary scheme-edit-button" type="button" data-scheme-id="${escapeHtml(item.id)}">Edit</button>
                    <button class="action-button tertiary scheme-remove-button" type="button" data-scheme-id="${escapeHtml(item.id)}">Remove</button>
                  </div>
                `
                : `<span class="meta-pill">${escapeHtml(item.status || "active")}</span>`
            }
          </div>
          <div class="search-meta">
            <span class="meta-pill">Academic year: ${escapeHtml(formatAcademicYearLabel(item.academicYearLabel))}</span>
            <span class="meta-pill">Status: ${escapeHtml(item.status || "active")}</span>
          </div>
        </article>
      `
    )
    .join("");

  if (isAdmin) {
    for (const button of elements.schemeList.querySelectorAll(".scheme-edit-button")) {
      button.addEventListener("click", () => {
        beginSchemeEdit(button.dataset.schemeId);
      });
    }
    for (const button of elements.schemeList.querySelectorAll(".scheme-remove-button")) {
      button.addEventListener("click", () => {
        void removeScheme(button.dataset.schemeId);
      });
    }
  }
}

function renderApplicationsRegistryVisibility() {
  elements.applicationsRegistryBody.hidden = state.applicationsRegistryHidden;
  elements.applicationsToggleButton.textContent = state.applicationsRegistryHidden
    ? "Show registry"
    : "Hide registry";
}

function renderApplicationReviewVisibility() {
  elements.applicationReviewBody.hidden = state.applicationReviewHidden;
  elements.applicationReviewToggleButton.textContent = state.applicationReviewHidden
    ? "Show review"
    : "Hide review";
}

function renderApplicationBulkInterviewVisibility() {
  elements.applicationBulkInterviewBody.hidden = state.applicationBulkInterviewHidden;
  elements.applicationBulkInterviewToggleButton.textContent = state.applicationBulkInterviewHidden
    ? "Show bulk update"
    : "Hide bulk update";
  persistPanelState();
}

function renderApplicationCwaCoverageVisibility() {
  elements.applicationCwaCoverageBody.hidden = state.applicationCwaCoverageHidden;
  elements.applicationCwaCoverageToggleButton.textContent = state.applicationCwaCoverageHidden
    ? "Show coverage"
    : "Hide coverage";
  persistPanelState();
}

function renderDashboardActivityVisibility() {
  elements.dashboardActivityBody.hidden = state.dashboardActivityHidden;
  elements.dashboardActivityToggleButton.textContent = state.dashboardActivityHidden
    ? "Show activity"
    : "Hide activity";
  persistPanelState();
}

function syncApplicationReviewResultsActions() {
  elements.applicationReviewResultsTopButton.hidden =
    state.applicationReviewResultsHidden || !state.applicationReviewResults.length;
}

function renderApplicationReviewResultsVisibility() {
  elements.applicationReviewResultsBody.hidden = state.applicationReviewResultsHidden;
  elements.applicationReviewResultsToggleButton.textContent = state.applicationReviewResultsHidden
    ? "Show applicants"
    : "Hide applicants";
  syncApplicationReviewResultsActions();
  persistPanelState();
}

function syncApplicationCriteriaControls() {
  const isAdmin = state.session?.actor?.roleCode === "admin";
  const disabled = !isAdmin;

  elements.applicationRequiredDocuments.disabled = disabled;
  elements.applicationCwaCutoff.disabled = disabled;
  elements.applicationWassceCutoff.disabled = disabled;
  elements.applicationInterviewRequired.disabled = disabled;
  elements.applicationCriteriaNotes.disabled = disabled;
  elements.applicationCriteriaSaveButton.disabled = disabled;
}

function syncApplicationReviewControls() {
  const canReview = canReviewApplications();
  const canManageImportsExports = canManageApplicationImportsExports();
  const canManageMessaging = canManageApplicationMessaging();
  const canUpdateMessaging = canUpdateMessagingRecipients();
  const canManageOutcomes = canManageApplicationOutcomes();
  const hasSelection = Boolean(state.selectedApplicationId);
  const hasActiveContext = Boolean(
    elements.applicationSchemeSelect.value && elements.applicationCycleSelect.value
  );
  const hasMessagingPreview = Boolean(state.applicationMessagingPreview);
  const messagingReadyRecipients = getEffectiveApplicationMessagingRecipients().filter(
    (item) => !item.issue
  ).length;
  const requiresReason = ["disqualified", "pending"].includes(
    elements.applicationReviewDecision.value
  );
  const usingRegistryData = Boolean(elements.applicationReviewUseRegistryData.checked);

  elements.applicationReviewDecision.disabled = !canReview || !hasSelection;
  elements.applicationReviewReason.disabled = !canReview || !hasSelection;
  elements.applicationReviewUseRegistryData.disabled = !canReview || !hasSelection;
  elements.applicationReviewUploadedName.disabled =
    !canReview || !hasSelection || usingRegistryData;
  elements.applicationReviewUploadedReferenceId.disabled =
      !canReview || !hasSelection || usingRegistryData;
  elements.applicationReviewInterviewStatus.disabled = !canReview || !hasSelection;
  elements.applicationReviewInterviewScore.disabled = !canReview || !hasSelection;
  elements.applicationReviewInterviewDate.disabled = !canReview || !hasSelection;
  elements.applicationReviewInterviewNotes.disabled = !canReview || !hasSelection;
  elements.applicationReviewComment.disabled = !canReview || !hasSelection;
  elements.applicationReviewSaveButton.disabled = !canReview || !hasSelection;
  elements.applicationAcademicEntryCwa.disabled = !canReview || !hasSelection;
  elements.applicationAcademicEntryWassce.disabled = !canReview || !hasSelection;
  elements.applicationAcademicEntrySaveButton.disabled = !canReview || !hasSelection;
  elements.applicationBulkInterviewStatus.disabled = !canReview || !hasActiveContext;
  elements.applicationBulkInterviewDate.disabled = !canReview || !hasActiveContext;
  elements.applicationBulkInterviewNotes.disabled = !canReview || !hasActiveContext;
  elements.applicationBulkInterviewApplyButton.disabled = !canReview || !hasActiveContext;
  elements.applicationFile.disabled = !canManageImportsExports;
  elements.applicationPreviewButton.disabled =
    !canManageImportsExports || !hasActiveContext;
  elements.applicationImportButton.disabled =
    !canManageImportsExports ||
    !state.applicationPreview ||
    Number(state.applicationPreview.summary?.validRows || 0) === 0;
  elements.applicationInterviewFile.disabled = !canManageImportsExports;
  elements.applicationInterviewPreviewButton.disabled = !canManageImportsExports;
  elements.applicationInterviewImportButton.disabled =
    !canManageImportsExports ||
    !state.applicationInterviewPreview ||
    Number(state.applicationInterviewPreview.summary?.validRows || 0) === 0;
  elements.applicationExportFont.disabled = !canManageImportsExports;
  elements.applicationMessagingChannel.disabled = !hasActiveContext;
  elements.applicationMessagingType.disabled = !canManageMessaging || !hasActiveContext;
  elements.applicationMessagingSubject.disabled =
    !canManageMessaging || !hasMessagingPreview || state.applicationMessagingChannel !== "email";
  elements.applicationMessagingBody.disabled = !canManageMessaging || !hasMessagingPreview;
  elements.applicationMessagingTemplateResetButton.disabled =
    !canManageMessaging || !hasMessagingPreview;
  elements.applicationMessagingRecipientList.dataset.canEdit = canUpdateMessaging ? "true" : "false";
  elements.applicationMessagingPreviewButton.disabled = !hasActiveContext;
  elements.applicationMessagingLogButton.disabled =
    !canManageMessaging ||
    !hasActiveContext ||
    !state.applicationMessagingPreview ||
    messagingReadyRecipients === 0;
  elements.applicationOutcomeSourceStatus.disabled = !canManageOutcomes || !hasActiveContext;
  elements.applicationOutcomeDecision.disabled = !canManageOutcomes || !hasActiveContext;
  elements.applicationOutcomeNotes.disabled = !canManageOutcomes || !hasActiveContext;
  elements.applicationOutcomeApplyButton.disabled = !canManageOutcomes || !hasActiveContext;
  elements.applicationReviewReason.required = requiresReason;
  for (const input of elements.applicationReviewDocumentChecklist.querySelectorAll("[data-document-check-item]")) {
    input.disabled = !canReview || !hasSelection;
  }
}

function syncBeneficiaryControls() {
  const canManageImports = canManageBeneficiaryImports();
  const validPreviewRows = Number(state.beneficiaryPreview?.summary?.validRows || 0);
  const { academicYearLabel, schemeName } = getScopedBeneficiaryClearSelection();
  const canClearScoped = canManageImports && Boolean(academicYearLabel) && Boolean(schemeName);
  const hasSelectedRecord = Boolean(
    state.beneficiaryEditingRecordId &&
      state.beneficiaryRecords.some(
        (item) => String(item.id) === String(state.beneficiaryEditingRecordId)
      )
  );

  if (elements.beneficiaryFile) {
    elements.beneficiaryFile.disabled = !canManageImports;
  }
  if (elements.beneficiaryImportMode) {
    elements.beneficiaryImportMode.disabled = !canManageImports;
  }
  if (elements.beneficiaryCohort) {
    elements.beneficiaryCohort.disabled = !canManageImports;
  }
  if (elements.beneficiaryImportCurrency) {
    elements.beneficiaryImportCurrency.disabled = !canManageImports;
  }
  if (elements.beneficiaryCategorizedByCollege) {
    elements.beneficiaryCategorizedByCollege.disabled = !canManageImports;
  }
  if (elements.beneficiaryDuplicateStrategy) {
    elements.beneficiaryDuplicateStrategy.disabled = !canManageImports;
  }
  if (elements.beneficiaryPreviewButton) {
    elements.beneficiaryPreviewButton.disabled = !canManageImports;
  }
  if (elements.beneficiaryImportButton) {
    elements.beneficiaryImportButton.disabled = !canManageImports || validPreviewRows === 0;
  }
  if (elements.beneficiaryClearScopedButton) {
    elements.beneficiaryClearScopedButton.disabled = !canClearScoped;
  }
  if (elements.beneficiaryEditorSaveButton) {
    elements.beneficiaryEditorSaveButton.disabled = !canManageImports || !hasSelectedRecord;
  }
  if (elements.beneficiaryEditorDeleteButton) {
    elements.beneficiaryEditorDeleteButton.disabled = !canManageImports || !hasSelectedRecord;
  }
  if (elements.beneficiaryEditorCancelButton) {
    elements.beneficiaryEditorCancelButton.disabled = !hasSelectedRecord;
  }
}

function renderApplicationCriteria(criteria) {
  state.applicationCriteria = criteria || null;
  elements.applicationRequiredDocuments.value = (criteria?.requiredDocuments || []).join("\n");
  elements.applicationCwaCutoff.value = criteria?.cwaCutoff ?? "";
  elements.applicationWassceCutoff.value = criteria?.wassceCutoff ?? "";
  elements.applicationInterviewRequired.checked = Boolean(criteria?.interviewRequired);
  elements.applicationCriteriaNotes.value = criteria?.notes || "";
  syncApplicationCriteriaControls();
}

function getActiveApplicationContext() {
  return {
    schemeId: elements.applicationSchemeSelect.value,
    cycleId: elements.applicationCycleSelect.value
  };
}

function buildApplicationFilterParams(extraFilters = {}) {
  const params = new URLSearchParams();
  const context = getActiveApplicationContext();
  const skipContext = Boolean(extraFilters.__skipContext);

  if (!skipContext && context.schemeId) {
    params.set("schemeId", context.schemeId);
  }
  if (!skipContext && context.cycleId) {
    params.set("cycleId", context.cycleId);
  }

  for (const [key, value] of Object.entries(extraFilters)) {
    if (key === "__skipContext") {
      continue;
    }
    const normalized = String(value || "").trim();
    if (normalized) {
      params.set(key, normalized);
    }
  }

  return params;
}

function renderApplicationExportCards(summary = state.applicationReviewSummary) {
  const context = getActiveApplicationContext();
  const canExport = canExportApplications();
  const exportStates = [
    {
      status: "qualified",
      label: "Qualified",
      count: Number(summary?.qualifiedCount || 0),
      description: "Qualified applications with registry-backed details, current CWA, and reviewer notes."
    },
    {
      status: "pending",
      label: "Pending",
      count: Number(summary?.pendingCount || 0),
      description: "Pending applications with review reasons and any follow-up notes still required."
    },
    {
      status: "disqualified",
      label: "Disqualified",
      count: Number(summary?.disqualifiedCount || 0),
      description: "Disqualified applications with the exact reviewer reason and retained registry context."
    },
    {
      status: "not_reviewed",
      label: "Yet to Review",
      count: Number(summary?.notReviewedCount || 0),
      description: "Applications still waiting for reviewer action under the active scheme and academic year."
    }
  ];

  elements.applicationExportCards.innerHTML = exportStates
    .map((item) => {
      const disabled = !canExport || !context.schemeId || !context.cycleId || item.count === 0;
      return `
        <article class="export-card fade-in">
          <span class="metric-label">${escapeHtml(item.label)}</span>
          <strong class="metric-value">${item.count}</strong>
          <p class="detail-subcopy">${escapeHtml(item.description)}</p>
          <div class="export-card-actions">
            <button
              class="action-button tertiary"
              type="button"
              data-application-export-status="${escapeHtml(item.status)}"
              ${disabled ? "disabled" : ""}
            >
              Export ${escapeHtml(item.label)}
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  for (const button of elements.applicationExportCards.querySelectorAll(
    "[data-application-export-status]"
  )) {
    button.addEventListener("click", () => {
      void handleApplicationExport(button.dataset.applicationExportStatus);
    });
  }
}

function renderApplicationReviewSummary(summary) {
  state.applicationReviewSummary = summary || {
    totalApplications: 0,
    reviewedCount: 0,
    qualifiedCount: 0,
    pendingCount: 0,
    disqualifiedCount: 0,
    notReviewedCount: 0
  };

  elements.applicationReviewSummaryCards.innerHTML = `
    <article class="metric-card fade-in">
      <span class="metric-label">Reviewed</span>
      <strong class="metric-value">${state.applicationReviewSummary.reviewedCount}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Qualified</span>
      <strong class="metric-value">${state.applicationReviewSummary.qualifiedCount}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Pending</span>
      <strong class="metric-value">${state.applicationReviewSummary.pendingCount}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Disqualified</span>
      <strong class="metric-value">${state.applicationReviewSummary.disqualifiedCount}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Yet to review</span>
      <strong class="metric-value">${state.applicationReviewSummary.notReviewedCount}</strong>
    </article>
  `;
  renderApplicationExportCards(state.applicationReviewSummary);
  renderApplicationOutcomeSummary(state.applicationReviewSummary);
}

function renderApplicationOutcomeSummary(summary = state.applicationReviewSummary) {
  const totals = {
    qualified: Number(summary?.qualifiedCount || 0),
    pending: Number(summary?.pendingCount || 0),
    disqualified: Number(summary?.disqualifiedCount || 0),
    notReviewed: Number(summary?.notReviewedCount || 0)
  };
  const appliedOutcomes = state.applicationsList.filter((item) => item.outcomeDecision).length;

  elements.applicationOutcomeSummaryCards.innerHTML = `
    <article class="metric-card fade-in">
      <span class="metric-label">Qualified</span>
      <strong class="metric-value">${totals.qualified}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Pending</span>
      <strong class="metric-value">${totals.pending}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Disqualified</span>
      <strong class="metric-value">${totals.disqualified}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Yet to review</span>
      <strong class="metric-value">${totals.notReviewed}</strong>
    </article>
  `;

  if (totals.qualified > 0) {
    setApplicationOutcomeMessage(
      `${totals.qualified} qualified application${totals.qualified === 1 ? " is" : "s are"} ready for the next award decision handoff.`,
      "success"
    );
    return;
  }

  if (appliedOutcomes > 0) {
    setApplicationOutcomeMessage(
      `${appliedOutcomes} application${appliedOutcomes === 1 ? "" : "s"} already have final outcomes recorded in the active handoff list.`,
      "success"
    );
    return;
  }

  setApplicationOutcomeMessage(
    "Outcome planning will use the current review totals for the selected scheme and academic year.",
    "warning"
  );
}

function renderApplicationOutcomeDistribution(items = state.applicationsList) {
  const awardedCount = items.filter((item) => item.outcomeDecision === "awarded").length;
  const notSelectedCount = items.filter((item) => item.outcomeDecision === "not_selected").length;
  const legacyWaitlistCount = items.filter((item) => item.outcomeDecision === "waitlisted").length;
  const qualifiedAwaitingCount = items.filter(
    (item) => item.qualificationStatus === "qualified" && !item.outcomeDecision
  ).length;

  elements.applicationOutcomeDistributionCards.innerHTML = `
    <article class="metric-card fade-in">
      <span class="metric-label">Awarded</span>
      <strong class="metric-value">${awardedCount}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Not selected</span>
      <strong class="metric-value">${notSelectedCount}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Qualified awaiting outcome</span>
      <strong class="metric-value">${qualifiedAwaitingCount}</strong>
    </article>
    ${
      legacyWaitlistCount
        ? `<article class="metric-card fade-in">
            <span class="metric-label">Legacy waitlist</span>
            <strong class="metric-value">${legacyWaitlistCount}</strong>
          </article>`
        : ""
    }
  `;
}

function renderApplicationOutcomeList(items = state.applicationsList) {
  const outcomeItems = (items || [])
    .filter((item) => item.outcomeDecision)
    .sort((left, right) => {
      const rightDate = new Date(right.outcomeUpdatedAt || 0).getTime();
      const leftDate = new Date(left.outcomeUpdatedAt || 0).getTime();
      return rightDate - leftDate;
    });

  if (!outcomeItems.length) {
    elements.applicationOutcomeList.innerHTML =
      `<p class="empty-state">No outcome decisions have been applied to the active application list yet.</p>`;
    return;
  }

  elements.applicationOutcomeList.innerHTML = outcomeItems
    .slice(0, 18)
    .map(
      (item) => `
        <article class="search-result-card fade-in outcome-card outcome-card-${escapeHtml(
          item.outcomeDecision
        )}">
          <div class="search-result-top">
            <div>
              <strong>${escapeHtml(item.studentName || "Unknown applicant")}</strong>
              <p class="detail-subcopy">${escapeHtml(item.schemeName || "No scheme")} | ${escapeHtml(
                item.cycleLabel || "No academic year"
              )}</p>
            </div>
            <div class="scheme-card-actions">
              <span class="flag-pill ${escapeHtml(
                getOutcomeTone(item.outcomeDecision)
              )}">${escapeHtml(formatOutcomeLabel(item.outcomeDecision))}</span>
              <button class="result-select-button" type="button" data-application-outcome-review-id="${escapeHtml(
                item.id
              )}">Open review</button>
            </div>
          </div>
          <div class="search-meta">
            <span class="meta-pill">Ref: ${escapeHtml(item.studentReferenceId || "N/A")}</span>
            <span class="meta-pill">Decision: ${escapeHtml(
              formatDecisionLabel(item.qualificationStatus)
            )}</span>
            <span class="meta-pill">Updated by: ${escapeHtml(item.outcomeUpdatedByName || "Not recorded")}</span>
          </div>
          ${
            item.outcomeNotes
              ? `<p class="detail-subcopy">Outcome notes: ${escapeHtml(item.outcomeNotes)}</p>`
              : ""
          }
        </article>
      `
    )
    .join("");

  for (const button of elements.applicationOutcomeList.querySelectorAll(
    "[data-application-outcome-review-id]"
  )) {
    button.addEventListener("click", () => {
      state.activeApplicationsSection = "review";
      renderModuleShell();
      void selectApplicationForReview(button.dataset.applicationOutcomeReviewId);
    });
  }
}

function formatApplicationMessageTypeLabel(messageType) {
  switch (String(messageType || "").trim().toLowerCase()) {
    case "interview_invite":
      return "Qualified for interview";
    case "award_notice":
      return "Awarded";
    case "waitlist_notice":
      return "Legacy waitlist notice";
    case "disqualified_notice":
      return "Disqualified";
    case "not_selected_notice":
      return "Not selected";
    default:
      return "Messaging batch";
  }
}

function formatApplicationDeliveryStatusLabel(status) {
  switch (String(status || "").trim().toLowerCase()) {
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    case "partial":
      return "Partial";
    case "logged":
      return "Logged";
    default:
      return "Pending";
  }
}

function summarizeApplicationMessageBatch(batch) {
  return (batch?.items || []).reduce(
    (summary, item) => {
      const status = String(item?.deliveryStatus || "logged").trim().toLowerCase();
      if (status === "sent") {
        summary.sentCount += 1;
      } else if (status === "failed") {
        summary.failedCount += 1;
      } else {
        summary.loggedCount += 1;
      }
      return summary;
    },
    {
      totalRecipients: Number(batch?.recipientCount || batch?.items?.length || 0),
      sentCount: 0,
      failedCount: 0,
      loggedCount: 0
    }
  );
}

function renderApplicationMessagingSummary(preview = state.applicationMessagingPreview) {
  const recipients = getEffectiveApplicationMessagingRecipients(preview);
  const channel = preview?.channel || state.applicationMessagingChannel;
  const summary = preview
    ? {
        totalRecipients: recipients.length,
        readyRecipients: recipients.filter((item) => !item.issue).length,
        missingContactRecipients: recipients.filter((item) => item.issue).length
      }
    : {
        totalRecipients: 0,
        readyRecipients: 0,
        missingContactRecipients: 0
      };

  elements.applicationMessagingSummaryCards.innerHTML = `
    <article class="metric-card fade-in">
      <span class="metric-label">Total recipients</span>
      <strong class="metric-value">${Number(summary.totalRecipients || 0)}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Ready</span>
      <strong class="metric-value">${Number(summary.readyRecipients || 0)}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">${escapeHtml(channel === "email" ? "Missing email" : "Missing phone")}</span>
      <strong class="metric-value">${Number(summary.missingContactRecipients || 0)}</strong>
    </article>
  `;
}

function renderApplicationMessagingTemplate(preview = state.applicationMessagingPreview) {
  if (!preview) {
    elements.applicationMessagingSubject.value = "";
    elements.applicationMessagingBody.value = "";
    elements.applicationMessagingSubjectField.hidden = state.applicationMessagingChannel !== "email";
    renderApplicationMessagingBodyCharCount();
    elements.applicationMessagingTemplatePreview.innerHTML =
      `<p class="empty-state">Message preview will appear here after you generate a batch.</p>`;
    return;
  }

  const channel = preview.channel || state.applicationMessagingChannel;
  elements.applicationMessagingSubjectField.hidden = channel !== "email";
  elements.applicationMessagingSubject.value = getEffectiveApplicationMessagingSubject(preview);
  elements.applicationMessagingBody.value = getEffectiveApplicationMessagingBody(preview);
  renderApplicationMessagingBodyCharCount();

  const senderValue =
    channel === "sms"
      ? preview.senderPhone || state.applicationMessagingSenderPhone || ""
      : channel === "whatsapp"
        ? preview.senderWhatsApp || state.applicationMessagingSenderWhatsApp || ""
        : preview.senderEmail || state.applicationMessagingSenderEmail || "";

  elements.applicationMessagingTemplatePreview.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item">
        <span>Sender</span>
        <strong>${escapeHtml(senderValue)}</strong>
      </div>
      <div class="detail-item">
        <span>Channel</span>
        <strong>${escapeHtml(formatMessagingChannelLabel(channel))}</strong>
      </div>
      <div class="detail-item">
        <span>Message type</span>
        <strong>${escapeHtml(formatApplicationMessageTypeLabel(preview.messageType))}</strong>
      </div>
      ${
        channel === "email"
          ? `
            <div class="detail-item field-span-2">
              <span>Current subject</span>
              <strong>${escapeHtml(getEffectiveApplicationMessagingSubject(preview))}</strong>
            </div>
          `
          : ""
      }
    </div>
    <div class="detail-item" style="margin-top:10px;">
      <span>${escapeHtml(channel === "email" ? "Current body" : `${formatMessagingChannelLabel(channel)} body`)}</span>
      <pre class="template-preview">${escapeHtml(getEffectiveApplicationMessagingBody(preview))}</pre>
    </div>
  `;
}

function renderApplicationMessagingRecipients(preview = state.applicationMessagingPreview) {
  const recipients = getEffectiveApplicationMessagingRecipients(preview);
  const canUpdateRecipients = canUpdateMessagingRecipients();
  const channel = preview?.channel || state.applicationMessagingChannel;
  if (!recipients.length) {
    elements.applicationMessagingRecipientList.innerHTML =
      `<p class="empty-state">Recipient preview cards will appear here.</p>`;
    return;
  }

  const sampleNote =
    preview?.recipientsTruncated
      ? `<p class="detail-subcopy">Showing ${preview.returnedRecipients} of ${preview.summary.totalRecipients} recipients for performance.</p>`
      : "";

  elements.applicationMessagingRecipientList.innerHTML =
    sampleNote +
    recipients
      .map(
        (item) => `
          <article class="search-result-card fade-in">
            <div class="search-result-top">
              <div>
                <strong>${escapeHtml(item.studentName || "Unknown applicant")}</strong>
                <p class="detail-subcopy">${escapeHtml(item.studentReferenceId || "No reference ID")}</p>
              </div>
              <span class="flag-pill ${item.issue ? "error" : "success"}">${escapeHtml(
                item.issue ? "Needs attention" : "Ready"
              )}</span>
            </div>
            <div class="search-meta">
              <span class="meta-pill">${escapeHtml(
                channel === "email" ? `Email: ${item.email || "Missing"}` : `Phone: ${item.phone || "Missing"}`
              )}</span>
              <span class="meta-pill">Review: ${escapeHtml(
                formatDecisionLabel(item.qualificationStatus)
              )}</span>
              ${
                item.outcomeDecision
                  ? `<span class="meta-pill">Outcome: ${escapeHtml(
                      formatOutcomeLabel(item.outcomeDecision)
                    )}</span>`
                  : ""
              }
            </div>
            <div class="field" style="margin-top:12px;">
              <span>${escapeHtml(channel === "email" ? "Recipient email" : "Recipient phone")}</span>
              <input
                type="${escapeHtml(channel === "email" ? "email" : "tel")}"
                data-application-messaging-contact-input="${escapeHtml(item.applicationId || "")}"
                value="${escapeHtml(channel === "email" ? item.email || "" : item.phone || "")}"
                placeholder="${escapeHtml(channel === "email" ? "Enter recipient email" : "Enter recipient phone")}"
                ${canUpdateRecipients ? "" : "disabled"}
              />
            </div>
            <div class="action-row">
              <button
                class="action-button ghost"
                type="button"
                data-application-messaging-save-contact="${escapeHtml(item.applicationId || "")}"
                ${canUpdateRecipients && item.studentId ? "" : "disabled"}
              >
                ${escapeHtml(channel === "email" ? "Save email to registry" : "Save phone to registry")}
              </button>
            </div>
            ${
              item.issue
                ? `<p class="detail-subcopy">${escapeHtml(item.issue)}</p>`
                : `<p class="detail-subcopy">${escapeHtml(item.previewBody.split("\n")[0] || "")}</p>`
            }
          </article>
        `
      )
      .join("");
}

function renderApplicationMessagingHistory(items = state.applicationMessagingHistory) {
  if (!items.length) {
    elements.applicationMessagingHistoryList.innerHTML =
      `<p class="empty-state">Logged message batches will appear here once created.</p>`;
    return;
  }

  elements.applicationMessagingHistoryList.innerHTML = items
    .map(
      (batch) => {
        const summary = summarizeApplicationMessageBatch(batch);
        const failedRecipients = (batch.items || []).filter(
          (item) => String(item.deliveryStatus || "").toLowerCase() === "failed"
        );
        const channelSendingEnabled = isApplicationMessagingSendEnabledForChannel(batch.channel || "email");
        const canSendBatch =
          canManageApplicationMessaging() &&
          channelSendingEnabled &&
          (summary.loggedCount > 0 || (!summary.sentCount && !summary.failedCount));
        const canResendFailed =
          canManageApplicationMessaging() &&
          channelSendingEnabled &&
          summary.failedCount > 0;

        return `
          <article class="search-result-card fade-in">
            <div class="search-result-top">
              <div>
                <strong>${escapeHtml(formatApplicationMessageTypeLabel(batch.messageType))}</strong>
                <p class="detail-subcopy">${escapeHtml(batch.schemeName || "No scheme")} | ${escapeHtml(
                  batch.cycleLabel || "No academic year"
                )}</p>
              </div>
              <span class="meta-pill">${escapeHtml(
                formatApplicationDeliveryStatusLabel(batch.status || "logged")
              )}</span>
            </div>
            <div class="search-meta">
              <span class="meta-pill">Channel: ${escapeHtml(formatMessagingChannelLabel(batch.channel || "email"))}</span>
              <span class="meta-pill">Sender: ${escapeHtml(batch.senderEmail || "")}</span>
              <span class="meta-pill">Recipients: ${escapeHtml(batch.recipientCount || 0)}</span>
              <span class="meta-pill">Created by: ${escapeHtml(batch.createdByName || "System")}</span>
              <span class="meta-pill">Sent: ${escapeHtml(summary.sentCount)}</span>
              <span class="meta-pill">Failed: ${escapeHtml(summary.failedCount)}</span>
              <span class="meta-pill">Pending: ${escapeHtml(summary.loggedCount)}</span>
            </div>
            <p class="detail-subcopy">${escapeHtml(
              batch.channel === "email" ? batch.subjectLine || "" : `${formatMessagingChannelLabel(batch.channel)} batch`
            )}</p>
            ${
              failedRecipients.length
                ? `
                  <div class="message-batch-errors">
                    ${failedRecipients
                      .slice(0, 5)
                      .map(
                        (item) => `
                          <div class="message-batch-error-item">
                            <strong>${escapeHtml(item.recipientName || item.recipientEmail || item.recipientPhone || "Recipient")}</strong>
                            <span>${escapeHtml(item.errorMessage || "Delivery failed.")}</span>
                          </div>
                        `
                      )
                      .join("")}
                    ${
                      failedRecipients.length > 5
                        ? `<p class="detail-subcopy">Showing 5 of ${escapeHtml(failedRecipients.length)} failed recipients.</p>`
                        : ""
                    }
                  </div>
                `
                : ""
            }
            <div class="action-row message-batch-actions">
              <button
                class="action-button primary"
                type="button"
                data-application-messaging-send="${escapeHtml(batch.id || "")}"
                ${canSendBatch ? "" : "disabled"}
              >
                ${summary.sentCount ? "Send pending recipients" : "Send batch"}
              </button>
              <button
                class="action-button tertiary"
                type="button"
                data-application-messaging-resend="${escapeHtml(batch.id || "")}"
                ${canResendFailed ? "" : "disabled"}
              >
                Resend failed
              </button>
            </div>
          </article>
        `;
      }
    )
    .join("");
}

function renderApplicationCwaCoverage(coverage) {
  state.applicationCwaCoverage = coverage || {
    summary: {
      totalApplications: 0,
      matchedCwaCount: 0,
      missingCwaCount: 0,
      coveragePercentage: 0
    },
    missingItems: [],
    totalMissingItems: 0,
    returnedMissingItems: 0,
    missingItemsTruncated: false
  };

  const summary = state.applicationCwaCoverage.summary || {
    totalApplications: 0,
    matchedCwaCount: 0,
    missingCwaCount: 0,
    coveragePercentage: 0
  };

  elements.applicationCwaCoverageCards.innerHTML = `
    <article class="metric-card fade-in">
      <span class="metric-label">Total applications</span>
      <strong class="metric-value">${Number(summary.totalApplications || 0)}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Matched imported CWA</span>
      <strong class="metric-value">${Number(summary.matchedCwaCount || 0)}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Missing imported CWA</span>
      <strong class="metric-value">${Number(summary.missingCwaCount || 0)}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Coverage</span>
      <strong class="metric-value">${escapeHtml(summary.coveragePercentage ?? 0)}%</strong>
    </article>
  `;

  const missingItems = Array.isArray(state.applicationCwaCoverage.missingItems)
    ? state.applicationCwaCoverage.missingItems
    : [];

  if (!missingItems.length) {
    elements.applicationCwaCoverageList.innerHTML =
      summary.totalApplications > 0
        ? `<p class="empty-state">All applications in the current scope already have imported CWA coverage.</p>`
        : `<p class="empty-state">Applicants missing imported CWA will appear here.</p>`;
    return;
  }

  elements.applicationCwaCoverageList.innerHTML = `
    ${missingItems
      .map(
        (item) => `
          <article class="search-result-card fade-in">
            <div class="search-result-top">
              <div>
                <strong>${escapeHtml(item.studentName || "Unknown student")}</strong>
                <p class="detail-subcopy">${escapeHtml(item.schemeName || "No scheme")} | ${escapeHtml(item.cycleLabel || "No academic year")}</p>
              </div>
              <button
                class="result-select-button"
                type="button"
                data-cwa-coverage-application-id="${escapeHtml(item.id)}"
              >
                Open review
              </button>
            </div>
            <div class="search-meta">
              <span class="meta-pill">Ref ID: ${escapeHtml(item.studentReferenceId || "N/A")}</span>
              <span class="meta-pill">Index: ${escapeHtml(item.indexNumber || "N/A")}</span>
              <span class="meta-pill">Programme: ${escapeHtml(item.program || "N/A")}</span>
              <span class="meta-pill">Year: ${escapeHtml(item.year || "N/A")}</span>
              <span class="meta-pill">Decision: ${escapeHtml(formatDecisionLabel(item.qualificationStatus))}</span>
              <span class="meta-pill">Final score: ${escapeHtml(item.finalScore ?? "N/A")}</span>
              <span class="flag-pill warning">Imported CWA still missing</span>
            </div>
          </article>
        `
      )
      .join("")}
    ${
      state.applicationCwaCoverage.missingItemsTruncated
        ? `<p class="detail-subcopy">Showing ${escapeHtml(
            state.applicationCwaCoverage.returnedMissingItems ?? missingItems.length
          )} of ${escapeHtml(
            state.applicationCwaCoverage.totalMissingItems ?? missingItems.length
          )} application(s) still missing imported CWA.</p>`
        : ""
    }
  `;

  for (const button of elements.applicationCwaCoverageList.querySelectorAll(
    "[data-cwa-coverage-application-id]"
  )) {
    button.addEventListener("click", () => {
      void selectApplicationForReview(button.dataset.cwaCoverageApplicationId);
    });
  }
}

function renderApplicationReviewResults(items) {
  state.applicationReviewResults = items || [];

  if (!state.applicationReviewResults.length) {
      elements.applicationReviewResultsList.innerHTML =
        `<p class="empty-state">Search results for review will appear here.</p>`;
      syncApplicationReviewResultsActions();
      return;
    }

  // Sort: undecided first, decided (qualified/pending/disqualified) to bottom
  const decisionOrder = { "": 0, "not_reviewed": 0, "qualified": 1, "pending": 2, "disqualified": 3 };
  const sorted = [...state.applicationReviewResults].sort((a, b) => {
    const aOrder = decisionOrder[a.qualificationStatus || ""] ?? 0;
    const bOrder = decisionOrder[b.qualificationStatus || ""] ?? 0;
    return aOrder - bOrder;
  });

  function getDecisionCardClass(status) {
    switch (status) {
      case "qualified":    return "decision-card-qualified";
      case "pending":      return "decision-card-pending";
      case "disqualified": return "decision-card-disqualified";
      default:             return "";
    }
  }

  elements.applicationReviewResultsList.innerHTML = sorted
    .map(
      (item) => `
        <article class="search-result-card fade-in ${getDecisionCardClass(item.qualificationStatus)}">
          <div class="search-result-top">
            <div>
              <strong>${escapeHtml(item.studentName || "Unknown student")}</strong>
              <p class="detail-subcopy">${escapeHtml(item.schemeName || "No scheme")} | ${escapeHtml(item.cycleLabel || "No academic year")}</p>
            </div>
            <button class="result-select-button" type="button" data-review-application-id="${escapeHtml(item.id)}">Open review</button>
          </div>
          <div class="search-meta">
            <span class="meta-pill">Ref ID: ${escapeHtml(item.studentReferenceId || "N/A")}</span>
            <span class="meta-pill">Uploaded Ref: ${escapeHtml(item.uploadedStudentReferenceId || item.studentReferenceId || "N/A")}</span>
            <span class="meta-pill decision-pill decision-pill--${escapeHtml(item.qualificationStatus || "not_reviewed")}">Decision: ${escapeHtml(formatDecisionLabel(item.qualificationStatus))}</span>
            ${
              item.screeningAssessment?.recommendedDecision
                ? `<span class="meta-pill">Screening: ${escapeHtml(
                    formatScreeningDecisionLabel(item.screeningAssessment.recommendedDecision)
                  )}</span>`
                : `<span class="meta-pill">Screening: Not configured</span>`
            }
            ${item.nameMismatchFlag ? `<span class="flag-pill warning">Applicant data mismatch</span>` : ""}
          </div>
        </article>
      `
    )
    .join("");

  for (const button of elements.applicationReviewResultsList.querySelectorAll(
    "[data-review-application-id]"
  )) {
    button.addEventListener("click", () => {
      void selectApplicationForReview(button.dataset.reviewApplicationId);
    });
  }

  syncApplicationReviewResultsActions();
}

function renderSingleApplicationLookupSummary(student) {
  if (!student) {
    elements.singleApplicationLookupSummary.innerHTML =
      `<p class="empty-state">Search for a registry student by reference ID before adding a single application.</p>`;
    return;
  }

  elements.singleApplicationLookupSummary.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item">
        <span>Student</span>
        <strong>${escapeHtml(student.fullName)}</strong>
      </div>
      <div class="detail-item">
        <span>Reference ID</span>
        <strong>${escapeHtml(student.studentReferenceId || "N/A")}</strong>
      </div>
      <div class="detail-item">
        <span>Programme</span>
        <strong>${escapeHtml(student.program || "N/A")}</strong>
      </div>
    </div>
  `;
}

function renderApplicationIssueLookupSummary(student) {
  if (!student) {
    elements.applicationIssueLookupSummary.innerHTML =
      `<p class="empty-state">Search the registry after correcting the reference ID.</p>`;
    return;
  }

  elements.applicationIssueLookupSummary.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item">
        <span>Registry Student</span>
        <strong>${escapeHtml(student.fullName)}</strong>
      </div>
      <div class="detail-item">
        <span>Reference ID</span>
        <strong>${escapeHtml(student.studentReferenceId || "N/A")}</strong>
      </div>
      <div class="detail-item">
        <span>College</span>
        <strong>${escapeHtml(student.college || "N/A")}</strong>
      </div>
    </div>
  `;
}

async function loadApplicationIssueQueue() {
  const apiBaseUrl = getApiBaseUrl();
  const { schemeId, cycleId } = getActiveApplicationContext();

  if (!apiBaseUrl || !schemeId || !cycleId) {
    state.applicationIssueQueue = [];
    renderApplicationIssueEditorList();
    setApplicationIssueEditorMessage(
      "Choose the active scheme and academic year to load the persistent application issue queue.",
      "warning"
    );
    return;
  }

  try {
    const url = new URL(`${apiBaseUrl}/api/applications/issues`);
    url.searchParams.set("schemeId", schemeId);
    url.searchParams.set("cycleId", cycleId);
    const response = await fetch(url, {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to load the application issue queue.");
    }

    state.applicationIssueQueue = payload.items || [];
    renderApplicationIssueEditorList();
    setApplicationIssueEditorMessage(
      payload.total
        ? `${payload.total} unresolved application import issue${payload.total === 1 ? "" : "s"} are queued for follow-up.`
        : "No unresolved application import issues are currently queued for this scheme and academic year.",
      payload.total ? "warning" : "success"
    );
  } catch (error) {
    state.applicationIssueQueue = [];
    renderApplicationIssueEditorList();
    setApplicationIssueEditorMessage(error.message, "error");
  }
}

function getUnresolvedApplicationIssueRows() {
  return state.applicationIssueQueue.filter((row) => String(row.status || "open") === "open");
}

function renderApplicationIssueEditorList() {
  const rows = getUnresolvedApplicationIssueRows();
  setStoredUnresolvedRejectedRowsCount(rows.length);

  if (!rows.length) {
      elements.applicationIssueEditorList.innerHTML =
        `<p class="empty-state">No unresolved application import issues are currently queued for this scheme and academic year.</p>`;
      if (state.activeModule === "dashboard") {
        renderDashboard(state.dashboard);
      }
      return;
  }

  elements.applicationIssueEditorList.innerHTML = rows
    .map(
      (row) => `
        <article class="issue-card warning fade-in">
          <strong>${escapeHtml(row.rowNumber ? `Row ${row.rowNumber}` : "Queued issue")}</strong>
          <p class="issue-context">${escapeHtml(
            [
              row.payload?.studentReferenceId ? `Ref: ${row.payload.studentReferenceId}` : "",
              row.payload?.fullName || "",
              row.payload?.program || ""
            ]
              .filter(Boolean)
              .join(" | ")
          )}</p>
          <ul>
            ${row.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}
          </ul>
          <div class="action-row">
            <button class="action-button tertiary application-issue-edit-button" type="button" data-issue-id="${row.id}">
              Edit row
            </button>
          </div>
        </article>
        `
      )
      .join("");

  if (state.activeModule === "dashboard") {
    renderDashboard(state.dashboard);
  }

  for (const button of elements.applicationIssueEditorList.querySelectorAll(
    ".application-issue-edit-button"
  )) {
    button.addEventListener("click", () => {
      const issueId = button.dataset.issueId || "";
      if (issueId) {
        selectApplicationIssueRow(issueId);
      }
    });
  }
}

function resetApplicationIssueForm() {
  state.selectedApplicationIssueRowNumber = null;
  state.issueApplicationMatch = null;
  elements.applicationIssueEditForm.reset();
  elements.applicationIssueQueueId.value = "";
  elements.applicationIssueRowNumber.value = "";
  renderApplicationIssueLookupSummary(null);
}

function buildCriteriaSummary(criteria) {
  if (!criteria) {
    return "No saved screening criteria were found for this scheme and academic year yet.";
  }

  const parts = [];

  if (criteria.requiredDocuments?.length) {
    parts.push(`Required documents: ${criteria.requiredDocuments.join(", ")}`);
  }
  if (criteria.cwaCutoff !== null && criteria.cwaCutoff !== undefined && criteria.cwaCutoff !== "") {
    parts.push(`CWA cut-off: ${criteria.cwaCutoff}`);
  }
  if (
    criteria.wassceCutoff !== null &&
    criteria.wassceCutoff !== undefined &&
    criteria.wassceCutoff !== ""
  ) {
    parts.push(`WASSCE cut-off: ${criteria.wassceCutoff}`);
  }

  parts.push(
    criteria.interviewRequired
      ? "Interview is required for this scheme and academic year."
      : "Interview is not required for this scheme and academic year."
  );

  if (criteria.notes) {
    parts.push(`Admin notes: ${criteria.notes}`);
  }

  return parts.join(" ");
}

function buildApplicationCriteriaMarkup(criteria, screeningAssessment) {
  return `
    <div class="detail-subcopy">${escapeHtml(buildCriteriaSummary(criteria))}</div>
    ${buildScreeningAssessmentMarkup(screeningAssessment)}
  `;
}

function populateApplicationReviewReasonOptions(decision, selectedReason = "") {
  const reasons = APPLICATION_REVIEW_REASONS[decision] || [];
  const placeholder =
    decision === "qualified"
      ? "Optional review reason"
      : decision
        ? "Select a review reason"
        : "Choose a reviewer decision first";

  elements.applicationReviewReason.innerHTML = [
    `<option value="">${escapeHtml(placeholder)}</option>`,
    ...reasons.map(
      (reason) =>
        `<option value="${escapeHtml(reason)}" ${
          reason === selectedReason ? "selected" : ""
        }>${escapeHtml(reason)}</option>`
    )
  ].join("");
}

function getSelectedApplication() {
  return (
    state.applicationsList.find((item) => item.id === state.selectedApplicationId) ||
    state.applicationReviewResults.find((item) => item.id === state.selectedApplicationId) ||
    null
  );
}

function formatAuditCategoryLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "Update";
  return text
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function setApplicationAuditHistoryMessage(message, tone = "warning") {
  if (!elements.applicationAuditHistoryMessage) return;
  elements.applicationAuditHistoryMessage.className = `inline-note ${tone}`.trim();
  elements.applicationAuditHistoryMessage.textContent = message;
}

function renderApplicationAuditHistory(events = []) {
  state.applicationAuditHistory = Array.isArray(events) ? events : [];

  if (!elements.applicationAuditHistoryList) return;

  if (!state.applicationAuditHistory.length) {
    elements.applicationAuditHistoryList.innerHTML =
      `<p class="empty-state">Audit history for the selected application will appear here.</p>`;
    return;
  }

  elements.applicationAuditHistoryList.innerHTML = state.applicationAuditHistory
    .map((event) => {
      const meta = Array.isArray(event.meta) ? event.meta.filter(Boolean) : [];
      return `
        <article class="audit-event-card audit-tone-${escapeHtml(event.tone || "neutral")} fade-in">
          <div class="audit-event-header">
            <div>
              <strong>${escapeHtml(event.title || "Application update")}</strong>
              <p class="detail-subcopy">${escapeHtml(formatRelativeDateTime(event.timestamp))}</p>
            </div>
            <span class="flag-pill tone-neutral">${escapeHtml(
              formatAuditCategoryLabel(event.category)
            )}</span>
          </div>
          <p class="detail-subcopy">${escapeHtml(event.description || "No additional detail captured.")}</p>
          ${
            event.actorName
              ? `<p class="detail-subcopy">By ${escapeHtml(event.actorName)}</p>`
              : ""
          }
          ${
            meta.length
              ? `<div class="audit-event-meta">${meta
                  .map((item) => `<span class="meta-pill">${escapeHtml(item)}</span>`)
                  .join("")}</div>`
              : ""
          }
        </article>
      `;
    })
    .join("");
}

async function loadApplicationAuditHistory(applicationId = state.selectedApplicationId) {
  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl || !applicationId) {
    renderApplicationAuditHistory([]);
    setApplicationAuditHistoryMessage(
      "Select an application to load its review, messaging, and academic-standing history.",
      "warning"
    );
    return;
  }

  setApplicationAuditHistoryMessage("Loading application audit history...", "warning");

  try {
    const response = await fetch(
      `${apiBaseUrl}/api/applications/${encodeURIComponent(applicationId)}/history`,
      {
        headers: {
          ...getAuthHeaders()
        }
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to load application audit history.");
    }

    renderApplicationAuditHistory(payload.events || []);
    setApplicationAuditHistoryMessage(
      payload.total
        ? `Loaded ${payload.total} audit event${payload.total === 1 ? "" : "s"} for the selected application.`
        : "No audit events are recorded for this application yet.",
      payload.total ? "success" : "warning"
    );
  } catch (error) {
    renderApplicationAuditHistory([]);
    setApplicationAuditHistoryMessage(error.message, "error");
  }
}

function renderSelectedApplicationReview() {
  const application = getSelectedApplication();
  const canReview = canReviewApplications();

  if (!application) {
    elements.applicationReviewSummary.innerHTML =
      `<p class="empty-state">No application selected for review yet.</p>`;
    elements.applicationReviewComparison.innerHTML = `
      <div class="detail-item">
        <span>Uploaded Name</span>
        <strong>N/A</strong>
      </div>
      <div class="detail-item">
        <span>Registry Name</span>
        <strong>N/A</strong>
      </div>
      <div class="detail-item">
        <span>Uploaded Ref ID</span>
        <strong>N/A</strong>
      </div>
      <div class="detail-item">
        <span>Registry Ref ID</span>
        <strong>N/A</strong>
      </div>
      <div class="detail-item">
        <span>Data Check</span>
        <strong>No application selected</strong>
      </div>
    `;
    elements.applicationReviewDecision.value = "";
    populateApplicationReviewReasonOptions("");
    elements.applicationReviewUseRegistryData.checked = true;
    elements.applicationReviewUploadedName.value = "";
    elements.applicationReviewUploadedReferenceId.value = "";
    elements.applicationReviewInterviewStatus.value = "";
    elements.applicationReviewInterviewScore.value = "";
    elements.applicationReviewInterviewDate.value = "";
    elements.applicationReviewInterviewNotes.value = "";
    elements.applicationAcademicEntryCwa.value = "";
    elements.applicationAcademicEntryWassce.value = "";
    elements.applicationReviewComment.value = "";
    renderApplicationDocumentChecklist(null, null, canReview);
    elements.applicationReviewCriteria.textContent =
      "Screening criteria for the selected scheme and academic year will appear here.";
    state.applicationReviewCriteria = null;
      setApplicationAcademicEntryMessage(
        canReview
          ? "Select an application first, then add academic standing values into academic history."
          : "Academic standing is read-only for the current role.",
        "warning"
      );
    setApplicationReviewMessage(
      canReview
        ? "Select an application from the registry to review qualification status, mismatch warnings, and reviewer notes."
        : "Application review is read-only for the current role.",
      "warning"
    );
    renderApplicationAuditHistory([]);
    setApplicationAuditHistoryMessage(
      "Select an application to load its review, messaging, and academic-standing history.",
      "warning"
    );
    syncApplicationReviewControls();
    return;
  }

  const uploadedName = application.uploadedFullName || application.studentName || "Not captured";
  const uploadedReferenceId =
    application.uploadedStudentReferenceId ||
    application.studentReferenceId ||
    "Not captured";
  const registryName = application.studentName || "Not captured";
  const registryReferenceId = application.studentReferenceId || "Not captured";
  const nameCheckLabel = application.nameMismatchFlag
    ? "Uploaded applicant details differ from the registry record"
    : "Uploaded applicant details align with the registry record";
  const decision = application.reviewDecision || application.qualificationStatus || "";

  elements.applicationReviewSummary.innerHTML = `
    <div class="detail-heading">
      <div>
        <strong>${escapeHtml(application.studentName || "Unknown student")}</strong>
        <p class="detail-subcopy">${escapeHtml(application.schemeName || "No scheme")} | ${escapeHtml(application.cycleLabel || "No academic year")}</p>
      </div>
      <div class="detail-flags review-status-flags">
        ${createFlagPill(`Decision: ${formatDecisionLabel(application.qualificationStatus)}`, getDecisionTone(application.qualificationStatus))}
        ${createFlagPill(`Eligibility: ${application.eligibilityStatus || "pending"}`, application.eligibilityStatus === "ineligible" ? "error" : application.eligibilityStatus === "eligible" ? "success" : "warning")}
        ${
          application.screeningAssessment?.recommendedDecision
            ? createFlagPill(
                `Screening: ${formatScreeningDecisionLabel(
                  application.screeningAssessment.recommendedDecision
                )}`,
                getScreeningDecisionTone(application.screeningAssessment.recommendedDecision)
              )
            : ""
        }
        ${
          application.outcomeDecision
            ? createFlagPill(
                `Outcome: ${formatOutcomeLabel(application.outcomeDecision)}`,
                getOutcomeTone(application.outcomeDecision)
              )
            : ""
        }
        ${application.nameMismatchFlag ? createFlagPill("Name mismatch warning", "warning") : ""}
      </div>
    </div>
    <div class="detail-grid">
      <div class="detail-item">
        <span>Student Reference ID</span>
        <strong>${escapeHtml(application.studentReferenceId || "N/A")}</strong>
      </div>
      <div class="detail-item">
        <span>Index Number</span>
        <strong>${escapeHtml(application.indexNumber || "N/A")}</strong>
      </div>
      <div class="detail-item">
        <span>College</span>
        <strong>${escapeHtml(application.college || "N/A")}</strong>
      </div>
      <div class="detail-item">
        <span>Program</span>
        <strong>${escapeHtml(application.program || "N/A")}</strong>
      </div>
      <div class="detail-item">
        <span>Year</span>
        <strong>${escapeHtml(application.year || "N/A")}</strong>
      </div>
      <div class="detail-item">
        <span>Academic Profile</span>
        <strong>CWA ${escapeHtml(application.cwa ?? "Not imported yet")} | WASSCE ${escapeHtml(application.wassceAggregate ?? "N/A")}</strong>
      </div>
      <div class="detail-item">
        <span>Interview</span>
        <strong>${escapeHtml(formatInterviewStatusLabel(application.interviewStatus))}${application.interviewScore !== null && application.interviewScore !== undefined ? ` | Score ${escapeHtml(application.interviewScore)}` : ""}</strong>
      </div>
      <div class="detail-item">
        <span>Outcome</span>
        <strong>${escapeHtml(formatOutcomeLabel(application.outcomeDecision))}</strong>
      </div>
    </div>
  `;

  elements.applicationReviewComparison.innerHTML = `
    <div class="detail-item">
      <span>Uploaded Name</span>
      <strong>${escapeHtml(uploadedName)}</strong>
    </div>
    <div class="detail-item">
      <span>Registry Name</span>
      <strong>${escapeHtml(registryName)}</strong>
    </div>
    <div class="detail-item">
      <span>Uploaded Ref ID</span>
      <strong>${escapeHtml(uploadedReferenceId)}</strong>
    </div>
    <div class="detail-item">
      <span>Registry Ref ID</span>
      <strong>${escapeHtml(registryReferenceId)}</strong>
    </div>
    <div class="detail-item">
      <span>Data Check</span>
      <strong>${escapeHtml(nameCheckLabel)}</strong>
    </div>
  `;

  elements.applicationReviewDecision.value = ["qualified", "disqualified", "pending"].includes(
    decision
  )
    ? decision
    : "";
  populateApplicationReviewReasonOptions(elements.applicationReviewDecision.value, application.reviewReason || "");
  elements.applicationReviewUseRegistryData.checked = true;
  elements.applicationReviewUploadedName.value = application.studentName || application.uploadedFullName || "";
  elements.applicationReviewUploadedReferenceId.value =
    application.studentReferenceId || application.uploadedStudentReferenceId || "";
  elements.applicationReviewInterviewStatus.value = application.interviewStatus || "";
  elements.applicationReviewInterviewScore.value = application.interviewScore ?? "";
  elements.applicationReviewInterviewDate.value = application.interviewDate || "";
  elements.applicationReviewInterviewNotes.value = application.interviewNotes || "";
  elements.applicationAcademicEntryCwa.value = application.cwa ?? "";
  elements.applicationAcademicEntryWassce.value = application.wassceAggregate ?? "";
  elements.applicationReviewComment.value = application.reviewComment || "";
  renderApplicationDocumentChecklist(state.applicationReviewCriteria, application, canReview);
  elements.applicationReviewCriteria.innerHTML = buildApplicationCriteriaMarkup(
    state.applicationReviewCriteria,
    application.screeningAssessment
  );
  setApplicationAcademicEntryMessage(
      `Save academic standing values into academic history for ${escapeHtml(
        application.cycleLabel || "the selected academic year"
      )}. This will refresh screening, exports, and CWA coverage.`,
      application.cwa !== null || application.wassceAggregate !== null ? "success" : "warning"
  );

  if (application.nameMismatchFlag) {
    setApplicationReviewMessage(
      "Possible name mismatch detected. Please compare the uploaded name with the registry record before saving your decision.",
      "warning"
    );
  } else if (application.screeningAssessment?.configured === false && canReview) {
    setApplicationReviewMessage(
      "No screening rules are saved for this scheme and academic year yet. Review can continue, but it will be fully manual.",
      "warning"
    );
  } else if (application.screeningAssessment?.recommendedDecision === "disqualified" && canReview) {
    setApplicationReviewMessage(
      "Automatic screening suggests disqualification. Please confirm the rule failure before saving your reviewer decision.",
      "warning"
    );
  } else if (application.screeningAssessment?.recommendedDecision === "pending" && canReview) {
    setApplicationReviewMessage(
      "Automatic screening still needs manual confirmation. Review the outstanding checks, then tag the application.",
      "warning"
    );
  } else if (canReview) {
    setApplicationReviewMessage(
      "Review the application against the saved criteria, then tag it as qualified, disqualified, or pending.",
      "success"
    );
  } else {
    setApplicationReviewMessage("Application review is read-only for the current role.", "warning");
  }

  syncApplicationReviewControls();
}

function renderApplicationsSummary(summary) {
  elements.applicationsSummaryCards.innerHTML = `
    <article class="metric-card fade-in">
      <span class="metric-label">Total rows</span>
      <strong class="metric-value">${summary.totalRows}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Matched rows</span>
      <strong class="metric-value">${summary.matchedRows}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Ready rows</span>
      <strong class="metric-value">${summary.validRows}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Name warnings</span>
      <strong class="metric-value">${summary.nameMismatchRows || 0}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Screening qualified</span>
      <strong class="metric-value">${summary.screeningQualifiedRows || 0}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Screening pending</span>
      <strong class="metric-value">${summary.screeningPendingRows || 0}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Screening disqualified</span>
      <strong class="metric-value">${summary.screeningDisqualifiedRows || 0}</strong>
    </article>
  `;
}

function renderApplicationsValidRows(rows) {
  const validRows = rows.filter((row) => row.status === "valid").slice(0, 12);
  if (!validRows.length) {
    elements.applicationsValidRowsTable.innerHTML =
      `<tr><td colspan="8" class="empty-cell">No valid application rows ready for import yet.</td></tr>`;
    return;
  }

  elements.applicationsValidRowsTable.innerHTML = validRows
    .map(
      (row) => `
        <tr class="fade-in">
          <td>${row.rowNumber}</td>
          <td>${escapeHtml(row.payload.fullName || "")}</td>
          <td>${escapeHtml(row.payload.studentReferenceId || "")}</td>
          <td>${escapeHtml(row.matchedStudent?.fullName || "Matched")}</td>
          <td>${escapeHtml(row.payload.program || row.matchedStudent?.program || "")}</td>
          <td>${escapeHtml(row.payload.finalScore ?? "")}</td>
          <td>
            ${escapeHtml(row.resolvedStatus || "")}
            ${
              row.screeningAssessment?.recommendedDecision
                ? `<br><span class="table-warning-text">Screening: ${escapeHtml(
                    formatScreeningDecisionLabel(row.screeningAssessment.recommendedDecision)
                  )}</span>`
                : ""
            }
            ${row.nameMismatchFlag ? "<br><span class=\"table-warning-text\">Name check</span>" : ""}
          </td>
        </tr>
      `
    )
    .join("");
}

function renderApplicationsIssues(rows) {
  const unresolvedRows = rows.filter((row) => !state.resolvedApplicationIssueRows[row.rowNumber]);
  const invalidRows = unresolvedRows.filter((row) => row.status === "invalid");
  const warningRows = unresolvedRows.filter((row) => row.status === "valid" && row.warnings?.length);

  if (!invalidRows.length && !warningRows.length) {
    elements.applicationsIssueList.innerHTML =
      `<p class="empty-state">No application import issues found in the latest preview.</p>`;
    return;
  }

  const renderCard = (row, tone = "error", titlePrefix = "Row", items = row.issues || []) => {
      const context = [
        row.payload?.studentReferenceId ? `Ref: ${row.payload.studentReferenceId}` : "",
        row.payload?.fullName || "",
        row.matchedStudent?.fullName ? `Matched: ${row.matchedStudent.fullName}` : "",
        row.matchedStudent?.college || row.payload?.program || ""
      ]
        .filter(Boolean)
        .join(" | ");

      return `
        <article class="issue-card ${tone} fade-in">
          <strong>${titlePrefix} ${row.rowNumber}</strong>
          ${context ? `<p class="issue-context">${escapeHtml(context)}</p>` : ""}
          <ul>
            ${items.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}
          </ul>
        </article>
      `;
    };

  elements.applicationsIssueList.innerHTML = [
    ...invalidRows.map((row) => renderCard(row, "error", "Row", row.issues || [])),
    ...warningRows.map((row) => renderCard(row, "warning", "Review", row.warnings || []))
  ].join("");
}

function renderApplicationsImportResults(result) {
  if (!result) {
    elements.applicationsImportedRowsList.innerHTML =
      `<p class="empty-state">Imported applications will appear here after a successful run.</p>`;
    elements.applicationsRejectedRowsList.innerHTML =
      `<p class="empty-state">Rejected application rows will appear here with their issues.</p>`;
    return;
  }

  elements.applicationsImportedRowsList.innerHTML = result.importedRows.length
    ? result.importedRows
        .map(
          (row) => `
            <article class="result-card success fade-in">
              <strong>Row ${row.rowNumber}</strong>
              <ul>
                <li>${escapeHtml(row.item.studentName || "Matched student")}</li>
                <li>${escapeHtml(row.item.schemeName || "")}</li>
                <li>${escapeHtml(row.item.recommendationStatus || row.item.status || "")}</li>
              </ul>
            </article>
          `
        )
        .join("")
    : `<p class="empty-state">No application rows were imported in the latest run.</p>`;

  elements.applicationsRejectedRowsList.innerHTML = result.rejectedRows.length
    ? result.rejectedRows
        .map(
          (row) => `
            <article class="issue-card error fade-in">
              <strong>Row ${row.rowNumber}</strong>
              <p class="issue-context">${escapeHtml(
                [row.studentReferenceId ? `Ref: ${row.studentReferenceId}` : "", row.fullName || ""]
                  .filter(Boolean)
                  .join(" | ")
              )}</p>
              <ul>
                ${row.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}
              </ul>
            </article>
          `
        )
      .join("")
  : `<p class="empty-state">No application rows were rejected in the latest run.</p>`;
}

function renderApplicationInterviewSummary(summary) {
  const safeSummary = {
    totalRows: Number(summary?.totalRows || 0),
    matchedRows: Number(summary?.matchedRows || 0),
    validRows: Number(summary?.validRows || 0),
    invalidRows: Number(summary?.invalidRows || 0)
  };

  elements.applicationInterviewSummaryCards.innerHTML = `
    <article class="metric-card fade-in">
      <span class="metric-label">Total rows</span>
      <strong class="metric-value">${safeSummary.totalRows}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Matched rows</span>
      <strong class="metric-value">${safeSummary.matchedRows}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Ready rows</span>
      <strong class="metric-value">${safeSummary.validRows}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Invalid rows</span>
      <strong class="metric-value">${safeSummary.invalidRows}</strong>
    </article>
  `;
}

function renderApplicationInterviewValidRows(rows) {
  const validRows = (rows || []).filter((row) => row.status === "valid").slice(0, 12);
  if (!validRows.length) {
    elements.applicationInterviewValidRowsTable.innerHTML =
      `<tr><td colspan="7" class="empty-cell">No interview rows are ready to import yet.</td></tr>`;
    return;
  }

  elements.applicationInterviewValidRowsTable.innerHTML = validRows
    .map(
      (row) => `
        <tr class="fade-in">
          <td>${row.rowNumber}</td>
          <td>${escapeHtml(row.payload.fullName || row.matchedApplication?.studentName || "")}</td>
          <td>${escapeHtml(row.payload.studentReferenceId || row.matchedApplication?.studentReferenceId || "")}</td>
          <td>${escapeHtml(row.payload.indexNumber || row.matchedApplication?.indexNumber || "")}</td>
          <td>${escapeHtml(formatInterviewStatusLabel(row.payload.interviewStatus || "completed"))}</td>
          <td>${escapeHtml(row.payload.interviewScore ?? "N/A")}</td>
          <td>${escapeHtml(row.matchedApplication?.studentName || "Matched application")}</td>
        </tr>
      `
    )
    .join("");
}

function renderApplicationInterviewIssues(rows) {
  const invalidRows = (rows || []).filter((row) => row.status === "invalid");
  if (!invalidRows.length) {
    elements.applicationInterviewIssueList.innerHTML =
      `<p class="empty-state">No interview import issues found in the latest preview.</p>`;
    return;
  }

  elements.applicationInterviewIssueList.innerHTML = invalidRows
    .map(
      (row) => `
        <article class="issue-card error fade-in">
          <strong>Row ${row.rowNumber}</strong>
          <p class="issue-context">${escapeHtml(
            [
              row.payload?.studentReferenceId ? `Ref: ${row.payload.studentReferenceId}` : "",
              row.payload?.indexNumber ? `Index: ${row.payload.indexNumber}` : "",
              row.payload?.fullName || ""
            ]
              .filter(Boolean)
              .join(" | ")
          )}</p>
          <ul>
            ${(row.issues || []).map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}
          </ul>
        </article>
      `
    )
    .join("");
}

function renderApplicationInterviewImportResults(result) {
  if (!result) {
    elements.applicationInterviewImportedRowsList.innerHTML =
      `<p class="empty-state">Imported interview updates will appear here after a successful import.</p>`;
    elements.applicationInterviewRejectedRowsList.innerHTML =
      `<p class="empty-state">Rejected interview rows will appear here after a preview or import.</p>`;
    return;
  }

  elements.applicationInterviewImportedRowsList.innerHTML = result.importedRows?.length
    ? result.importedRows
        .map(
          (row) => `
            <article class="result-card success fade-in">
              <strong>Row ${row.rowNumber}</strong>
              <ul>
                <li>${escapeHtml(row.item.studentName || "Matched application")}</li>
                <li>Interview status: ${escapeHtml(formatInterviewStatusLabel(row.item.interviewStatus || "completed"))}</li>
                <li>Interview score: ${escapeHtml(row.item.interviewScore ?? "N/A")}</li>
              </ul>
            </article>
          `
        )
        .join("")
    : `<p class="empty-state">No interview rows were imported in the latest run.</p>`;

  elements.applicationInterviewRejectedRowsList.innerHTML = result.rejectedRows?.length
    ? result.rejectedRows
        .map(
          (row) => `
            <article class="issue-card error fade-in">
              <strong>Row ${row.rowNumber}</strong>
              <p class="issue-context">${escapeHtml(
                [
                  row.studentReferenceId ? `Ref: ${row.studentReferenceId}` : "",
                  row.indexNumber ? `Index: ${row.indexNumber}` : "",
                  row.fullName || ""
                ]
                  .filter(Boolean)
                  .join(" | ")
              )}</p>
              <ul>
                ${(row.issues || []).map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}
              </ul>
            </article>
          `
        )
        .join("")
    : `<p class="empty-state">No interview rows were rejected in the latest run.</p>`;
}

function renderApplicationsList(items) {
  if (!items.length) {
    elements.applicationsList.innerHTML =
      `<p class="empty-state">No application records loaded yet.</p>`;
    return;
  }

  elements.applicationsList.innerHTML = items
    .map(
      (item) => `
        <article class="search-result-card fade-in">
          <div class="search-result-top">
            <div>
              <strong>${escapeHtml(item.studentName || "Unknown student")}</strong>
                <p class="detail-subcopy">${escapeHtml(item.schemeName || "No scheme")} | ${escapeHtml(item.cycleLabel || "No academic year")}</p>
            </div>
            <div class="scheme-card-actions">
              <span class="meta-pill">${escapeHtml(item.status || "submitted")}</span>
              <button class="result-select-button" type="button" data-application-id="${escapeHtml(item.id)}">Review</button>
            </div>
          </div>
          <div class="search-meta">
            <span class="meta-pill">Final score: ${escapeHtml(item.finalScore ?? "N/A")}</span>
            <span class="meta-pill">Recommendation: ${escapeHtml(item.recommendationStatus || "N/A")}</span>
            <span class="meta-pill">Eligibility: ${escapeHtml(item.eligibilityStatus || "N/A")}</span>
            <span class="meta-pill">Decision: ${escapeHtml(formatDecisionLabel(item.qualificationStatus))}</span>
            ${
              item.outcomeDecision
                ? `<span class="meta-pill">Outcome: ${escapeHtml(
                    formatOutcomeLabel(item.outcomeDecision)
                  )}</span>`
                : ""
            }
            ${
              item.screeningAssessment?.recommendedDecision
                ? `<span class="meta-pill">Screening: ${escapeHtml(
                    formatScreeningDecisionLabel(item.screeningAssessment.recommendedDecision)
                  )}</span>`
                : `<span class="meta-pill">Screening: Not configured</span>`
            }
            ${item.nameMismatchFlag ? `<span class="flag-pill warning">Name mismatch warning</span>` : ""}
          </div>
          ${item.reviewReason ? `<p class="detail-subcopy">Review reason: ${escapeHtml(item.reviewReason)}</p>` : ""}
        </article>
      `
    )
    .join("");

  for (const button of elements.applicationsList.querySelectorAll("[data-application-id]")) {
    button.addEventListener("click", () => {
      void selectApplicationForReview(button.dataset.applicationId);
    });
  }
}

function getResolutionPayload() {
  return Object.fromEntries(
    Object.entries(state.duplicateResolutions)
      .filter(([, rowNumber]) => Number(rowNumber) > 0)
      .map(([caseId, rowNumber]) => [caseId, Number(rowNumber)])
  );
}

function scoreDuplicateRow(row) {
  const filledFields = [
    row.fullName,
    row.studentReferenceId,
    row.indexNumber,
    row.college,
    row.program,
    row.year
  ].filter((value) => String(value || "").trim()).length;

  return filledFields * 1000 - Number(row.rowNumber || 0);
}

function choosePreferredDuplicateRow(duplicateCase) {
  const rows = Array.isArray(duplicateCase?.rows) ? duplicateCase.rows : [];
  if (!rows.length) {
    return null;
  }

  const sorted = [...rows].sort((left, right) => scoreDuplicateRow(right) - scoreDuplicateRow(left));
  return Number(sorted[0]?.rowNumber || 0) || null;
}

function createFlagPill(label, tone) {
  return `<span class="flag-pill ${tone}">${escapeHtml(label)}</span>`;
}

function renderSearchResults(items) {
  if (!items.length) {
    elements.searchResultsList.innerHTML =
      `<p class="empty-state">No student records match the current search.</p>`;
    return;
  }

  elements.searchResultsList.innerHTML = items
    .map(
      (item) => `
        <article class="search-result-card fade-in">
          <div class="search-result-top">
            <div>
              <strong>${escapeHtml(item.fullName)}</strong>
              <p class="detail-subcopy">${escapeHtml(item.program || "Program not captured")} | ${escapeHtml(item.college || "College not captured")}</p>
            </div>
            <button class="result-select-button" type="button" data-student-id="${escapeHtml(item.id)}">Open record</button>
          </div>
          <div class="search-meta">
            <span class="meta-pill">Ref ID: ${escapeHtml(item.studentReferenceId || "N/A")}</span>
            <span class="meta-pill">Index: ${escapeHtml(item.indexNumber || "N/A")}</span>
            <span class="meta-pill">Year: ${escapeHtml(item.year || "N/A")}</span>
            <span class="meta-pill">CWA: ${escapeHtml(item.cwa ?? "N/A")}</span>
          </div>
        </article>
      `
    )
    .join("");

  for (const button of elements.searchResultsList.querySelectorAll("[data-student-id]")) {
    button.addEventListener("click", () => {
      void selectStudent(button.dataset.studentId);
    });
  }
}

function renderStudentDetail(student) {
  if (!student) {
    elements.studentDetailCard.innerHTML =
      `<p class="empty-state">Select a student from the results list to inspect the full registry profile.</p>`;
    return;
  }

  const flags = [];
  if (student.duplicateFlag) flags.push(createFlagPill("Duplicate flag", "warning"));
  if (student.conflictFlag) flags.push(createFlagPill("Conflict flag", "error"));
  if (!student.duplicateFlag && !student.conflictFlag) {
    flags.push(createFlagPill("No active flags", "success"));
  }

  elements.studentDetailCard.innerHTML = `
    <div class="detail-heading fade-in">
      <div>
        <strong>${escapeHtml(student.fullName)}</strong>
        <p class="detail-subcopy">${escapeHtml(student.program || "Program not captured")} | ${escapeHtml(student.college || "College not captured")}</p>
      </div>
      <span class="meta-pill">${escapeHtml(student.year || "Year not captured")}</span>
    </div>
    <div class="detail-grid fade-in">
      <div class="detail-item">
        <span>Student reference ID</span>
        <strong>${escapeHtml(student.studentReferenceId || "N/A")}</strong>
      </div>
      <div class="detail-item">
        <span>Index number</span>
        <strong>${escapeHtml(student.indexNumber || "N/A")}</strong>
      </div>
      <div class="detail-item">
        <span>Email</span>
        <strong>${escapeHtml(student.email || "N/A")}</strong>
      </div>
      <div class="detail-item">
        <span>Phone number</span>
        <strong>${escapeHtml(student.phoneNumber || "N/A")}</strong>
      </div>
      <div class="detail-item">
        <span>Gender</span>
        <strong>${escapeHtml(student.gender || "N/A")}</strong>
      </div>
      <div class="detail-item">
        <span>Disability status</span>
        <strong>${escapeHtml(student.disabilityStatus || "N/A")}</strong>
      </div>
      <div class="detail-item">
        <span>CWA</span>
        <strong>${escapeHtml(student.cwa ?? "N/A")}</strong>
      </div>
      <div class="detail-item">
        <span>WASSCE Aggregate</span>
        <strong>${escapeHtml(student.wassceAggregate ?? "N/A")}</strong>
      </div>
      <div class="detail-item">
        <span>Active support count</span>
        <strong>${escapeHtml(student.activeSupportCount ?? 0)}</strong>
      </div>
    </div>
    <div class="detail-flags fade-in">
      ${flags.join("")}
    </div>
    <div class="action-row fade-in">
      <button class="action-button tertiary" type="button" data-open-academic-history="${escapeHtml(student.id)}">Open academic history</button>
    </div>
    ${
      student.notes
        ? `<div class="inline-note tone-warning fade-in">${escapeHtml(student.notes)}</div>`
        : ""
    }
  `;

  const historyButton = elements.studentDetailCard.querySelector("[data-open-academic-history]");
  historyButton?.addEventListener("click", () => {
    openAcademicHistoryForStudent(student);
  });
}

function openAcademicHistoryForStudent(student) {
  if (!student) {
    return;
  }

  state.activeModule = "registry";
  state.activeSection = "history";
  renderModuleShell();

  elements.academicHistorySearchQuery.value = student.fullName || "";
  elements.academicHistorySearchReferenceId.value = student.studentReferenceId || "";
  elements.academicHistorySearchIndexNumber.value = student.indexNumber || "";
  setAcademicHistorySearchMessage(
    `Prepared academic history search for ${student.fullName || "the selected student"}.`,
    "warning"
  );
  void loadAcademicHistory();
}

function renderFlaggedResults(items) {
  if (!items.length) {
    elements.flaggedResultsList.innerHTML =
      `<p class="empty-state">No flagged students match the current review filter.</p>`;
    return;
  }

  elements.flaggedResultsList.innerHTML = items
    .map(
      (item) => `
        <article class="search-result-card fade-in">
          <div class="search-result-top">
            <div>
              <strong>${escapeHtml(item.fullName)}</strong>
              <p class="detail-subcopy">${escapeHtml(item.program || "Program not captured")} | ${escapeHtml(item.college || "College not captured")}</p>
            </div>
            <button class="result-select-button" type="button" data-flagged-student-id="${escapeHtml(item.id)}">Review flags</button>
          </div>
          <div class="detail-flags">
            ${item.duplicateFlag ? createFlagPill("Duplicate flag", "warning") : ""}
            ${item.conflictFlag ? createFlagPill("Conflict flag", "error") : ""}
            ${!item.duplicateFlag && !item.conflictFlag ? createFlagPill("No active flags", "success") : ""}
          </div>
          <div class="search-meta">
            <span class="meta-pill">Ref ID: ${escapeHtml(item.studentReferenceId || "N/A")}</span>
            <span class="meta-pill">Index: ${escapeHtml(item.indexNumber || "N/A")}</span>
            <span class="meta-pill">Year: ${escapeHtml(item.year || "N/A")}</span>
            <span class="meta-pill">Support count: ${escapeHtml(item.activeSupportCount ?? 0)}</span>
          </div>
        </article>
      `
    )
    .join("");

  for (const button of elements.flaggedResultsList.querySelectorAll("[data-flagged-student-id]")) {
    button.addEventListener("click", () => {
      void selectFlaggedStudent(button.dataset.flaggedStudentId);
    });
  }
}

function renderFlaggedDetail(student) {
  if (!student) {
    elements.flaggedDetailCard.innerHTML =
      `<p class="empty-state">Select a flagged student to inspect duplicate and conflict indicators.</p>`;
    return;
  }

  const issueSummary = [];
  if (student.duplicateFlag) {
    issueSummary.push("This student is marked as a duplicate and should be checked for repeated identifiers.");
  }
  if (student.conflictFlag) {
    issueSummary.push("This student is marked as having a scholarship or support conflict requiring review.");
  }

  elements.flaggedDetailCard.innerHTML = `
    <div class="detail-heading fade-in">
      <div>
        <strong>${escapeHtml(student.fullName)}</strong>
        <p class="detail-subcopy">${escapeHtml(student.program || "Program not captured")} | ${escapeHtml(student.college || "College not captured")}</p>
      </div>
      <span class="meta-pill">${escapeHtml(student.studentReferenceId || "No reference ID")}</span>
    </div>
    <div class="detail-grid fade-in">
      <div class="detail-item">
        <span>Index number</span>
        <strong>${escapeHtml(student.indexNumber || "N/A")}</strong>
      </div>
      <div class="detail-item">
        <span>Year</span>
        <strong>${escapeHtml(student.year || "N/A")}</strong>
      </div>
      <div class="detail-item">
        <span>Program</span>
        <strong>${escapeHtml(student.program || "N/A")}</strong>
      </div>
      <div class="detail-item">
        <span>College</span>
        <strong>${escapeHtml(student.college || "N/A")}</strong>
      </div>
      <div class="detail-item">
        <span>CWA</span>
        <strong>${escapeHtml(student.cwa ?? "N/A")}</strong>
      </div>
      <div class="detail-item">
        <span>WASSCE Aggregate</span>
        <strong>${escapeHtml(student.wassceAggregate ?? "N/A")}</strong>
      </div>
    </div>
    <div class="detail-flags fade-in">
      ${student.duplicateFlag ? createFlagPill("Duplicate flag", "warning") : ""}
      ${student.conflictFlag ? createFlagPill("Conflict flag", "error") : ""}
      ${!student.duplicateFlag && !student.conflictFlag ? createFlagPill("No active flags", "success") : ""}
    </div>
    <div class="inline-note tone-warning fade-in">
      ${issueSummary.map((item) => escapeHtml(item)).join(" ")}
    </div>
    ${
      student.notes
        ? `<div class="inline-note fade-in">${escapeHtml(student.notes)}</div>`
        : ""
    }
  `;
}

function buildSearchUrl() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    throw new Error("Enter the API URL first.");
  }

  const url = new URL(`${apiBaseUrl}/api/students/search`);
  const q = elements.searchQuery.value.trim();
  const studentReferenceId = elements.searchReferenceId.value.trim();
  const indexNumber = elements.searchIndexNumber.value.trim();

  if (q) url.searchParams.set("q", q);
  if (studentReferenceId) url.searchParams.set("studentReferenceId", studentReferenceId);
  if (indexNumber) url.searchParams.set("indexNumber", indexNumber);

  return url;
}

async function runSearch(event) {
  event?.preventDefault();
  state.activeModule = "registry";
  state.activeSection = "search";
  renderModuleShell();

  elements.searchButton.disabled = true;
  setSearchMessage("Searching registry records...", "warning");

  try {
    const response = await fetch(buildSearchUrl(), {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || "Search request failed.");
    }

    state.searchResults = payload.items || [];
    renderSearchResults(state.searchResults);
    state.selectedStudent = null;
    renderStudentDetail(null);
    setSearchMessage(`Found ${payload.total} matching student record(s).`, payload.total ? "success" : "warning");
  } catch (error) {
    state.searchResults = [];
    renderSearchResults([]);
    renderStudentDetail(null);
    setSearchMessage(error.message, "error");
  } finally {
    elements.searchButton.disabled = false;
  }
}

async function selectStudent(studentId) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !studentId) {
    return;
  }

  setSearchMessage("Loading student profile...", "warning");

  try {
    const response = await fetch(`${apiBaseUrl}/api/students/${encodeURIComponent(studentId)}`, {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || "Unable to load the selected student record.");
    }

    state.selectedStudent = payload.item;
    renderStudentDetail(state.selectedStudent);
    setSearchMessage(`Loaded ${payload.item.fullName}'s record.`, "success");
  } catch (error) {
    renderStudentDetail(null);
    setSearchMessage(error.message, "error");
  }
}

function buildFlagReviewUrl() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    throw new Error("Enter the API URL first.");
  }

  const url = new URL(`${apiBaseUrl}/api/students/search`);
  const mode = elements.flagMode.value;
  const q = elements.flagQuery.value.trim();

  if (mode === "flagged") {
    url.searchParams.set("flaggedOnly", "true");
  } else if (mode === "duplicate") {
    url.searchParams.set("duplicateFlag", "true");
  } else if (mode === "conflict") {
    url.searchParams.set("conflictFlag", "true");
  } else if (mode === "both") {
    url.searchParams.set("duplicateFlag", "true");
    url.searchParams.set("conflictFlag", "true");
  }

  if (q) {
    url.searchParams.set("q", q);
  }

  return url;
}

async function runFlagReview(event) {
  event?.preventDefault();
  state.activeModule = "registry";
  state.activeSection = "duplicates";
  renderModuleShell();

  elements.flagReviewButton.disabled = true;
  setFlagReviewMessage("Loading flagged student records...", "warning");

  try {
    const response = await fetch(buildFlagReviewUrl(), {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || "Flag review request failed.");
    }

    state.flaggedResults = payload.items || [];
    state.selectedFlaggedStudent = null;
    renderFlaggedResults(state.flaggedResults);
    renderFlaggedDetail(null);
    setFlagReviewMessage(
      `Loaded ${payload.total} flagged student record(s) for review.`,
      payload.total ? "success" : "warning"
    );
  } catch (error) {
    state.flaggedResults = [];
    renderFlaggedResults([]);
    renderFlaggedDetail(null);
    setFlagReviewMessage(error.message, "error");
  } finally {
    elements.flagReviewButton.disabled = false;
  }
}

async function selectFlaggedStudent(studentId) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !studentId) {
    return;
  }

  setFlagReviewMessage("Loading flagged student detail...", "warning");

  try {
    const response = await fetch(`${apiBaseUrl}/api/students/${encodeURIComponent(studentId)}`, {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || "Unable to load the selected flagged student record.");
    }

    state.selectedFlaggedStudent = payload.item;
    renderFlaggedDetail(state.selectedFlaggedStudent);
    setFlagReviewMessage(`Loaded ${payload.item.fullName} for flag review.`, "success");
  } catch (error) {
    renderFlaggedDetail(null);
    setFlagReviewMessage(error.message, "error");
  }
}

function resetFlagReview() {
  elements.flagMode.value = "flagged";
  elements.flagQuery.value = "";
  state.flaggedResults = [];
  state.selectedFlaggedStudent = null;
  renderFlaggedResults([]);
  renderFlaggedDetail(null);
  setFlagReviewMessage("Flag review reset. Choose a filter to load duplicate and conflict cases.", "warning");
}

function resetSearch() {
  elements.searchQuery.value = "";
  elements.searchReferenceId.value = "";
  elements.searchIndexNumber.value = "";
  state.searchResults = [];
  state.selectedStudent = null;
  renderSearchResults([]);
  renderStudentDetail(null);
  setSearchMessage("Search reset. Enter a new query to search the registry.", "warning");
}

function renderSummary(summary) {
  elements.summaryCards.innerHTML = `
    <article class="metric-card fade-in">
      <span class="metric-label">Total rows</span>
      <strong class="metric-value">${summary.totalRows}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Valid rows</span>
      <strong class="metric-value">${summary.validRows ?? summary.importedRows ?? 0}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Invalid rows</span>
      <strong class="metric-value">${summary.invalidRows ?? summary.rejectedRows ?? 0}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Existing students in registry</span>
      <strong class="metric-value">${summary.existingRegistryStudents ?? state.registryStats.existingRegistryStudents ?? 0}</strong>
    </article>
  `;
}

function renderAcademicHistorySummary(summary = {}) {
  elements.academicHistorySummaryCards.innerHTML = `
    <article class="metric-card fade-in">
      <span class="metric-label">Total rows</span>
      <strong class="metric-value">${summary.totalRows ?? 0}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Matched rows</span>
      <strong class="metric-value">${summary.matchedRows ?? 0}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Ready rows</span>
      <strong class="metric-value">${summary.validRows ?? summary.importedRows ?? 0}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Missing CWA</span>
      <strong class="metric-value">${summary.missingCwaRows ?? 0}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Name mismatches</span>
      <strong class="metric-value">${summary.nameMismatchRows ?? 0}</strong>
    </article>
    <article class="metric-card fade-in">
      <span class="metric-label">Existing academic history records</span>
      <strong class="metric-value">${summary.existingAcademicHistoryRecords ?? state.registryStats.existingAcademicHistoryRecords ?? 0}</strong>
    </article>
  `;
}

function renderAcademicHistoryValidRows(rows) {
  const validRows = rows.filter((row) => row.status === "valid").slice(0, 12);
  if (!validRows.length) {
    elements.academicHistoryValidRowsTable.innerHTML =
      `<tr><td colspan="8" class="empty-cell">No matched CWA rows are ready for import yet.</td></tr>`;
    return;
  }

  elements.academicHistoryValidRowsTable.innerHTML = validRows
    .map((row) => {
      const payload = row.payload || {};
      return `
        <tr class="fade-in">
          <td>${row.rowNumber}</td>
          <td>${escapeHtml(payload.indexNumber || "")}</td>
          <td>${escapeHtml(payload.fullName || "")}</td>
          <td>${escapeHtml(row.matchedStudent?.fullName || "No registry match")}</td>
          <td>${escapeHtml(payload.program || row.matchedStudent?.program || "")}</td>
          <td>${escapeHtml(payload.academicYearLabel || "")}</td>
          <td>${escapeHtml(payload.semesterLabel || "")}</td>
          <td>${escapeHtml(payload.cwa ?? "")}</td>
        </tr>
      `;
    })
    .join("");
}

function renderAcademicHistoryIssues(rows) {
  const issueRows = rows
    .filter((row) => row.status !== "valid" || (Array.isArray(row.warnings) && row.warnings.length))
    .slice(0, 12);

  if (!issueRows.length) {
    elements.academicHistoryIssueList.innerHTML =
      `<p class="empty-state">No CWA import issues are waiting for review.</p>`;
    return;
  }

  elements.academicHistoryIssueList.innerHTML = issueRows
    .map((row) => {
      const payload = row.payload || {};
      const issues = [...(row.issues || []), ...(row.warnings || [])];
      const contextBits = [
        payload.indexNumber ? `Index: ${payload.indexNumber}` : "",
        payload.fullName ? `Name: ${payload.fullName}` : "",
        row.matchedStudent?.studentReferenceId ? `Ref ID: ${row.matchedStudent.studentReferenceId}` : "",
        payload.college ? `College: ${payload.college}` : ""
      ].filter(Boolean);

      return `
        <article class="issue-card fade-in">
          <strong>Row ${row.rowNumber}</strong>
          <p>${escapeHtml(contextBits.join(" | ") || "No row context captured.")}</p>
          <ul class="issue-points">
            ${issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}
          </ul>
        </article>
      `;
    })
    .join("");
}

function renderAcademicHistoryImportResults(result) {
  const importedRows = result?.importedRows || [];
  const rejectedRows = result?.rejectedRows || [];

  elements.academicHistoryImportedRowsList.innerHTML = importedRows.length
    ? importedRows
        .map(
          (entry) => `
            <article class="search-result-card fade-in">
              <strong>Row ${entry.rowNumber}</strong>
              <p class="detail-subcopy">${escapeHtml(entry.item?.studentName || "Matched student")} | ${escapeHtml(entry.item?.academicYearLabel || "Academic year not captured")} | ${escapeHtml(entry.item?.semesterLabel || "Semester not captured")}</p>
              <div class="search-meta">
                <span class="meta-pill">Ref ID: ${escapeHtml(entry.item?.studentReferenceId || "N/A")}</span>
                <span class="meta-pill">Index: ${escapeHtml(entry.item?.indexNumber || "N/A")}</span>
                <span class="meta-pill">CWA: ${escapeHtml(entry.item?.cwa ?? "N/A")}</span>
              </div>
            </article>
          `
        )
        .join("")
    : `<p class="empty-state">Imported CWA rows will appear here after a successful import.</p>`;

  elements.academicHistoryRejectedRowsList.innerHTML = rejectedRows.length
    ? rejectedRows
        .map(
          (entry) => `
            <article class="issue-card fade-in">
              <strong>Row ${entry.rowNumber}</strong>
              <p>${escapeHtml([entry.indexNumber ? `Index: ${entry.indexNumber}` : "", entry.fullName ? `Name: ${entry.fullName}` : ""].filter(Boolean).join(" | ") || "No row context captured.")}</p>
              <ul class="issue-points">
                ${(entry.issues || []).map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}
              </ul>
            </article>
          `
        )
        .join("")
    : `<p class="empty-state">Rejected CWA rows will appear here with their issues.</p>`;
}

function renderAcademicHistoryList(items) {
  if (!items.length) {
    elements.academicHistoryResultsList.innerHTML =
      `<p class="empty-state">No imported CWA history records match the current search. The student may still exist in the main registry without an imported CWA result yet.</p>`;
    return;
  }

  elements.academicHistoryResultsList.innerHTML = items
    .map(
      (item) => `
        <article class="search-result-card fade-in history-record-card">
          <div class="search-result-top">
            <div>
              <strong>${escapeHtml(item.studentName || "Student record")}</strong>
              <p class="detail-subcopy">${escapeHtml(item.program || "Program not captured")} | ${escapeHtml(item.college || "College not captured")}</p>
            </div>
            <button class="result-select-button" type="button" data-history-student-id="${escapeHtml(item.studentId || "")}">Open registry record</button>
          </div>
          <div class="search-meta">
            <span class="meta-pill">Ref ID: ${escapeHtml(item.studentReferenceId || "N/A")}</span>
            <span class="meta-pill">Index: ${escapeHtml(item.indexNumber || "N/A")}</span>
            <span class="meta-pill">${escapeHtml(item.academicYearLabel || "Academic year not captured")}</span>
            <span class="meta-pill">${escapeHtml(item.semesterLabel || "Semester not captured")}</span>
            <span class="meta-pill">CWA: ${escapeHtml(item.cwa ?? "N/A")}</span>
          </div>
        </article>
      `
    )
    .join("");

  for (const button of elements.academicHistoryResultsList.querySelectorAll("[data-history-student-id]")) {
    button.addEventListener("click", () => {
      const studentId = button.dataset.historyStudentId;
      if (!studentId) {
        return;
      }
      state.activeModule = "registry";
      state.activeSection = "search";
      renderModuleShell();
      void selectStudent(studentId);
    });
  }
}

function renderValidRows(rows) {
  const validRows = rows.filter((row) => row.status === "valid").slice(0, 12);
  if (validRows.length === 0) {
      elements.validRowsTable.innerHTML =
        `<tr><td colspan="8" class="empty-cell">No valid rows ready for import yet.</td></tr>`;
    return;
  }

  elements.validRowsTable.innerHTML = validRows
    .map((row) => {
      const payload = row.payload;
      const willSkipExisting = Array.isArray(row.existingMatches) && row.existingMatches.length > 0;
      const nameMeta = willSkipExisting
        ? `<p class="detail-subcopy">Already in registry - this row will be skipped in the selected import mode.</p>`
        : "";
      return `
        <tr class="fade-in">
          <td>${row.rowNumber}</td>
          <td>
            <div>${escapeHtml(payload.fullName || "")}</div>
            ${nameMeta}
          </td>
          <td>${escapeHtml(payload.studentReferenceId || "")}</td>
          <td>${escapeHtml(payload.indexNumber || "")}</td>
          <td>${escapeHtml(payload.program || "")}</td>
          <td>${escapeHtml(payload.year || "")}</td>
          <td>${escapeHtml(payload.cwa ?? "")}</td>
          <td>${escapeHtml(payload.wassceAggregate ?? "")}</td>
        </tr>
      `;
    })
    .join("");
}

function renderIssues(rows) {
  const invalidRows = rows.filter((row) => row.status === "invalid");
  if (invalidRows.length === 0) {
    elements.issueList.innerHTML =
      `<p class="empty-state">No validation issues found in the latest preview.</p>`;
    return;
  }

  elements.issueList.innerHTML = invalidRows
    .map((row) => {
      const isDuplicate = row.issues.some(
        (issue) =>
          issue.toLowerCase().includes("duplicate") ||
          issue.toLowerCase().includes("existing student") ||
          issue.toLowerCase().includes("resolved in favor")
      );
      const context = [
        row.payload?.studentReferenceId ? `Ref: ${row.payload.studentReferenceId}` : "",
        row.payload?.fullName ? row.payload.fullName : "",
        row.payload?.college ? row.payload.college : "",
        row.payload?.program ? row.payload.program : ""
      ]
        .filter(Boolean)
        .join(" | ");
      return `
        <article class="issue-card ${isDuplicate ? "warning" : "error"} fade-in">
          <strong>Row ${row.rowNumber}</strong>
          ${
            context
              ? `<p class="issue-context">${escapeHtml(context)}</p>`
              : ""
          }
          <ul>
            ${row.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}
          </ul>
        </article>
      `;
    })
    .join("");
}

function renderDuplicateCases(cases) {
  const duplicateCases = Array.isArray(cases) ? cases : [];
  elements.applyDuplicateResolutionButton.disabled = duplicateCases.length === 0;
  elements.autoResolveDuplicatesButton.disabled = duplicateCases.length === 0;

  if (!duplicateCases.length) {
    elements.duplicateResolutionList.innerHTML =
      `<p class="empty-state">No duplicate groups to review yet.</p>`;
    setDuplicateResolutionMessage(
      "Duplicate groups will appear here after preview when the import finds repeated student reference IDs or index numbers.",
      "warning"
    );
    return;
  }

  elements.duplicateResolutionList.innerHTML = duplicateCases
    .map((duplicateCase) => {
      const selectedRowNumber =
        Number(state.duplicateResolutions[duplicateCase.id] || duplicateCase.selectedRowNumber || 0) ||
        null;
      return `
        <article class="duplicate-case-card fade-in">
          <div class="duplicate-case-header">
            <div>
              <strong>${escapeHtml(duplicateCase.label)}</strong>
              <p class="issue-context">${escapeHtml(duplicateCase.value)}</p>
            </div>
            <span class="meta-pill">${duplicateCase.rows.length} row(s)</span>
          </div>
          <div class="duplicate-option-list">
            ${duplicateCase.rows
              .map((row) => {
                const context = [
                  row.studentReferenceId ? `Ref: ${row.studentReferenceId}` : "",
                  row.fullName || "",
                  row.college || "",
                  row.program || ""
                ]
                  .filter(Boolean)
                  .join(" | ");
                return `
                  <label class="duplicate-option">
                    <input
                      type="radio"
                      name="duplicate-${escapeHtml(duplicateCase.id)}"
                      value="${row.rowNumber}"
                      data-duplicate-case-id="${escapeHtml(duplicateCase.id)}"
                      ${selectedRowNumber === row.rowNumber ? "checked" : ""}
                    />
                    <div>
                      <strong>Keep row ${row.rowNumber}</strong>
                      <p class="issue-context">${escapeHtml(context)}</p>
                    </div>
                  </label>
                `;
              })
              .join("")}
          </div>
        </article>
      `;
    })
    .join("");

  for (const input of elements.duplicateResolutionList.querySelectorAll("[data-duplicate-case-id]")) {
    input.addEventListener("change", () => {
      state.duplicateResolutions[input.dataset.duplicateCaseId] = Number(input.value);
      setDuplicateResolutionMessage(
        "Selections updated. Click Apply duplicate decisions to refresh the preview counts and issue list.",
        "warning"
      );
    });
  }

  const resolvedCount = duplicateCases.filter(
    (item) => Number(state.duplicateResolutions[item.id] || item.selectedRowNumber || 0) > 0
  ).length;
  setDuplicateResolutionMessage(
    `${duplicateCases.length} duplicate group(s) detected. ${resolvedCount} group(s) currently have a selected keep row.`,
    resolvedCount === duplicateCases.length ? "success" : "warning"
  );
}

function renderImportResults(result) {
  if (!result) {
    elements.importedRowsList.innerHTML =
      `<p class="empty-state">Imported rows will appear here after a successful import.</p>`;
    elements.rejectedRowsList.innerHTML =
      `<p class="empty-state">Rejected rows will appear here with their issues.</p>`;
    return;
  }

  elements.importedRowsList.innerHTML = result.importedRows.length
    ? result.importedRows
        .map(
          (row) => `
            <article class="result-card success fade-in">
              <strong>Row ${row.rowNumber}</strong>
              <ul>
                <li>${escapeHtml(row.item.fullName)}</li>
                <li>${escapeHtml(row.item.studentReferenceId || "")}</li>
                <li>${escapeHtml(row.item.program || "")}</li>
              </ul>
            </article>
          `
        )
        .join("")
    : `<p class="empty-state">No rows were imported in the latest run.</p>`;

  elements.rejectedRowsList.innerHTML = result.rejectedRows.length
    ? result.rejectedRows
        .map(
          (row) => `
            <article class="issue-card error fade-in">
              <strong>Row ${row.rowNumber}</strong>
              <ul>
                ${row.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}
              </ul>
            </article>
          `
        )
        .join("")
    : `<p class="empty-state">No rows were rejected in the latest run.</p>`;
}

async function postImport(endpoint) {
  const apiBaseUrl = getApiBaseUrl();
  const files = Array.from(elements.studentFile.files || []);

  if (!apiBaseUrl) {
    throw new Error("Enter the API URL first.");
  }

  if (!files.length) {
    throw new Error("Choose one or more class-list workbooks before continuing.");
  }

  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }

  const resolutions = getResolutionPayload();
  if (Object.keys(resolutions).length > 0) {
    formData.append("resolutions", JSON.stringify(resolutions));
  }
  formData.append("importMode", elements.studentImportMode.value || "strict_new_only");

  const response = await fetch(`${apiBaseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      ...getAuthHeaders()
    },
    body: formData
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "The import request failed.");
  }

  return payload;
}

async function postAcademicHistoryImport(endpoint) {
  const apiBaseUrl = getApiBaseUrl();
  const files = Array.from(elements.academicHistoryFile.files || []);

  if (!apiBaseUrl) {
    throw new Error("Enter the API URL first.");
  }
  if (!files.length) {
    throw new Error("Choose one or more CWA workbooks before continuing.");
  }

  const formData = new FormData();
  const semesterLabel = elements.academicHistorySemesterLabel.value.trim();
  const academicYearLabel = elements.academicHistoryAcademicYearOverride.value.trim();

  for (const file of files) {
    formData.append("files", file);
  }

  if (semesterLabel) {
    formData.append("semesterLabel", semesterLabel);
  }
  if (academicYearLabel) {
    formData.append("academicYearLabel", academicYearLabel);
  }

  const response = await fetch(`${apiBaseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      ...getAuthHeaders()
    },
    body: formData
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "The academic history import request failed.");
  }

  return payload;
}

async function loadApplicationOptions() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    return;
  }

  const selectedSchemeId = elements.applicationSchemeSelect.value;
  const selectedCycleId = elements.applicationCycleSelect.value;
  const selectedSchemeAcademicYearId = elements.schemeAcademicYearSelect.value;

  try {
    const [schemesResponse, cyclesResponse] = await Promise.all([
      fetch(`${apiBaseUrl}/api/schemes`, {
        headers: {
          ...getAuthHeaders()
        }
      }),
      fetch(`${apiBaseUrl}/api/cycles`, {
        headers: {
          ...getAuthHeaders()
        }
      })
    ]);

    const schemesPayload = await schemesResponse.json().catch(() => ({}));
    const cyclesPayload = await cyclesResponse.json().catch(() => ({}));

    if (!schemesResponse.ok) {
      throw new Error(schemesPayload.message || "Unable to load schemes.");
    }
    if (!cyclesResponse.ok) {
      throw new Error(cyclesPayload.message || "Unable to load academic years.");
    }

    state.schemes = schemesPayload.items || [];
    state.cycles = cyclesPayload.items || [];
    renderApplicationSelectors();
    renderRecommendedSchemeOptions();
    renderSupportFoodBankAcademicYearOptions();

    if (selectedSchemeId && state.schemes.some((item) => item.id === selectedSchemeId)) {
      elements.applicationSchemeSelect.value = selectedSchemeId;
    }
    if (selectedCycleId && state.cycles.some((item) => item.id === selectedCycleId)) {
      elements.applicationCycleSelect.value = selectedCycleId;
    }
    if (
      state.editingSchemeId &&
      state.schemes.some((item) => item.id === state.editingSchemeId)
    ) {
      const editingScheme = state.schemes.find((item) => item.id === state.editingSchemeId);
      elements.schemeNameInput.value = editingScheme?.name || "";
      elements.schemeCategoryInput.value = editingScheme?.category || "scholarship";
      elements.schemeAcademicYearSelect.value = editingScheme?.cycleId || elements.schemeAcademicYearSelect.value;
      if (elements.schemeAcademicYearManualInput) {
        elements.schemeAcademicYearManualInput.value = "";
      }
    } else if (
      selectedSchemeAcademicYearId &&
      state.cycles.some((item) => item.id === selectedSchemeAcademicYearId)
    ) {
      elements.schemeAcademicYearSelect.value = selectedSchemeAcademicYearId;
    } else {
      resetSchemeForm();
    }

    renderSchemeFormState();
    syncSchemeControls();
    syncSchemeAcademicYearMode();
    renderSchemesList(state.schemes);
  } catch (error) {
    state.schemes = [];
    state.cycles = [];
    renderApplicationSelectors();
    renderRecommendedSchemeOptions();
    renderSupportFoodBankAcademicYearOptions();
    renderSchemesList([]);
    setApplicationsMessage(error.message, "error");
    setSchemeMessage(error.message, "error");
  }
}

function beginSchemeEdit(schemeId) {
  const scheme = state.schemes.find((item) => item.id === schemeId);
  if (!scheme) {
    setSchemeMessage("The selected scheme could not be found.", "error");
    return;
  }

  state.editingSchemeId = scheme.id;
  elements.schemeNameInput.value = scheme.name || "";
  elements.schemeCategoryInput.value = scheme.category || "scholarship";
  elements.schemeAcademicYearSelect.value = scheme.cycleId || "";
  if (elements.schemeAcademicYearManualInput) {
    elements.schemeAcademicYearManualInput.value = "";
  }
  state.schemePanelHidden = false;
  renderSchemePanelVisibility();
  renderSchemeFormState();
  syncSchemeAcademicYearMode();
  setSchemeMessage(`Editing ${scheme.name}. Update the details and save the changes.`, "warning");
  elements.schemeNameInput.focus();
}

async function saveScheme(event) {
  event?.preventDefault();
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    setSchemeMessage("Enter the API URL first.", "error");
    return;
  }

  const isEditing = Boolean(state.editingSchemeId);
  setSchemeMessage(isEditing ? "Saving scheme changes..." : "Creating scheme...", "warning");
  elements.schemeSaveButton.disabled = true;
  const selectedAcademicYearValue = elements.schemeAcademicYearSelect.value;
  const usingManualAcademicYear = selectedAcademicYearValue === "__manual__";
  const manualAcademicYearLabel = elements.schemeAcademicYearManualInput?.value.trim() || "";

  if (usingManualAcademicYear && !manualAcademicYearLabel) {
    setSchemeMessage("Enter the academic year manually before saving the scheme.", "error");
    elements.schemeSaveButton.disabled = false;
    return;
  }

  try {
    const endpoint = isEditing
      ? `${apiBaseUrl}/api/schemes/${encodeURIComponent(state.editingSchemeId)}`
      : `${apiBaseUrl}/api/schemes`;
    const response = await fetch(endpoint, {
      method: isEditing ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        name: elements.schemeNameInput.value,
        category: elements.schemeCategoryInput.value,
        cycleId: usingManualAcademicYear ? "" : selectedAcademicYearValue,
        academicYearLabel: usingManualAcademicYear ? manualAcademicYearLabel : ""
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || `Unable to ${isEditing ? "update" : "create"} scheme.`);
    }

    const savedName = payload.item?.name || elements.schemeNameInput.value.trim();
    resetSchemeForm();
      setSchemeMessage(
        isEditing
          ? `${savedName} was updated successfully.`
          : `Scheme ${savedName} created successfully.`,
        "success"
      );
      await loadApplicationOptions();
      await loadApplicationCriteria();
      await loadDashboard();
  } catch (error) {
    setSchemeMessage(error.message, "error");
  } finally {
    syncSchemeControls();
    renderSchemeFormState();
  }
}

async function removeScheme(schemeId) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !schemeId) {
    return;
  }

  const confirmed = window.confirm(
    "Remove this scheme? This will also remove linked scheme applications and related scheme records."
  );
  if (!confirmed) {
    return;
  }

  setSchemeMessage("Removing scheme...", "warning");

  try {
    const response = await fetch(`${apiBaseUrl}/api/schemes/${encodeURIComponent(schemeId)}`, {
      method: "DELETE",
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to remove scheme.");
    }

    if (state.editingSchemeId === schemeId) {
      resetSchemeForm();
    }
      setSchemeMessage(`${payload.name} was removed successfully.`, "success");
      await loadApplicationOptions();
      await loadApplicationsList();
      await loadApplicationCriteria();
      await loadDashboard();
  } catch (error) {
    setSchemeMessage(error.message, "error");
  }
}

async function loadApplicationsList(extraFilters = {}) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    return;
  }

  setApplicationsListMessage("Loading recent applications...", "warning");
  try {
    const query = buildApplicationFilterParams(extraFilters);
    const url = query.toString()
      ? `${apiBaseUrl}/api/applications?${query.toString()}`
      : `${apiBaseUrl}/api/applications`;
    const response = await fetch(url, {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to load application records.");
    }

    state.applicationsList = payload.items || [];
    renderApplicationsList(state.applicationsList);
    renderApplicationOutcomeDistribution(state.applicationsList);
    renderApplicationOutcomeList(state.applicationsList);
    if (
      state.selectedApplicationId &&
      !state.applicationsList.some((item) => item.id === state.selectedApplicationId)
    ) {
      state.selectedApplicationId = null;
      state.applicationReviewCriteria = null;
    }
    renderSelectedApplicationReview();
    setApplicationsListMessage(
      `Loaded ${payload.total} application record(s).`,
      payload.total ? "success" : "warning"
    );
  } catch (error) {
    state.applicationsList = [];
    state.selectedApplicationId = null;
    state.applicationReviewCriteria = null;
    renderApplicationsList([]);
    renderApplicationOutcomeDistribution([]);
    renderApplicationOutcomeList([]);
    renderSelectedApplicationReview();
    setApplicationsListMessage(error.message, "error");
  }
}

async function loadApplicationMessagingHistory() {
  const apiBaseUrl = getApiBaseUrl();
  const context = getActiveApplicationContext();
  if (!apiBaseUrl || !context.schemeId || !context.cycleId) {
    state.applicationMessagingHistory = [];
    renderApplicationMessagingHistory([]);
    return;
  }

  try {
    const url = new URL(`${apiBaseUrl}/api/applications/messages/history`);
    url.searchParams.set("schemeId", context.schemeId);
    url.searchParams.set("cycleId", context.cycleId);
    const response = await fetch(url, {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to load message history.");
    }

    state.applicationMessagingHistory = payload.items || [];
    renderApplicationMessagingHistory(state.applicationMessagingHistory);
  } catch (error) {
    state.applicationMessagingHistory = [];
    renderApplicationMessagingHistory([]);
    if (await recoverExpiredSession(error)) {
      return;
    }
    setApplicationMessagingMessage(error.message, "error");
  }
}

async function loadApplicationMessagingSettings() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    state.applicationMessagingSenderEmail = "";
    state.applicationMessagingSenderPhone = "";
    state.applicationMessagingSenderWhatsApp = "";
    state.applicationMessagingSmsEnabled = false;
    state.applicationMessagingWhatsAppEnabled = false;
    renderApplicationMessagingChannelOptions();
    renderApplicationMessagingSender();
    return;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/api/applications/messages/settings`, {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to load messaging settings.");
    }

    state.applicationMessagingSenderEmail = payload.senderEmail || "";
    state.applicationMessagingSenderPhone = payload.senderPhone || "";
    state.applicationMessagingSenderWhatsApp = payload.senderWhatsApp || "";
    state.applicationMessagingSendingEnabled = Boolean(payload.sendingEnabled);
    state.applicationMessagingSmsEnabled = Boolean(payload.smsEnabled);
    state.applicationMessagingWhatsAppEnabled = Boolean(payload.whatsAppEnabled);
    state.applicationMessagingProvider = payload.provider || "";
    renderApplicationMessagingChannelOptions();
    renderApplicationMessagingSender();
  } catch (error) {
    state.applicationMessagingSenderEmail = "";
    state.applicationMessagingSenderPhone = "";
    state.applicationMessagingSenderWhatsApp = "";
    state.applicationMessagingSendingEnabled = false;
    state.applicationMessagingSmsEnabled = false;
    state.applicationMessagingWhatsAppEnabled = false;
    state.applicationMessagingProvider = "";
    renderApplicationMessagingChannelOptions();
    renderApplicationMessagingSender();
    if (await recoverExpiredSession(error)) {
      return;
    }
    setApplicationMessagingMessage(error.message, "error");
  }
}

function resetApplicationMessagingDraft(preview = state.applicationMessagingPreview) {
  state.applicationMessagingDraftSubject = preview?.subjectLine || "";
  state.applicationMessagingDraftBody = preview?.bodyTemplate || "";
  state.applicationMessagingRecipientEdits = {};
  renderApplicationMessagingTemplate(preview);
  renderApplicationMessagingRecipients(preview);
  renderApplicationMessagingSummary(preview);
  syncApplicationReviewControls();
}

function updateApplicationMessagingDraftFromInputs() {
  state.applicationMessagingDraftSubject = elements.applicationMessagingSubject.value;
  state.applicationMessagingDraftBody = elements.applicationMessagingBody.value;
  renderApplicationMessagingTemplate();
}

async function saveApplicationMessagingRecipientContact(applicationId) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    setApplicationMessagingMessage("The app is not connected to the API right now.", "error");
    return;
  }
  if (!canUpdateMessagingRecipients()) {
    setApplicationMessagingMessage("Only reviewers or admins can update recipient contact details.", "error");
    return;
  }

  const previewRecipients = getEffectiveApplicationMessagingRecipients();
  const target = previewRecipients.find((item) => String(item.applicationId || "") === String(applicationId));
  if (!target?.studentId) {
    setApplicationMessagingMessage("This recipient is not linked to a registry student.", "error");
    return;
  }
  const isEmailChannel = state.applicationMessagingChannel === "email";
  if (!String(isEmailChannel ? target.email || "" : target.phone || "").trim()) {
    setApplicationMessagingMessage(
      isEmailChannel
        ? "Enter an email address before saving it to the registry."
        : "Enter a phone number before saving it to the registry.",
      "error"
    );
    return;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/api/students/${target.studentId}/contact`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        email: isEmailChannel ? target.email : undefined,
        phoneNumber: isEmailChannel ? undefined : target.phone
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to save the email correction.");
    }

    if (state.applicationMessagingPreview?.recipients) {
      state.applicationMessagingPreview.recipients = state.applicationMessagingPreview.recipients.map((item) =>
        String(item.applicationId || "") === String(applicationId)
          ? {
              ...item,
              email: isEmailChannel ? payload.item?.email || target.email : item.email,
              phone: isEmailChannel ? item.phone : payload.item?.phoneNumber || target.phone,
              issue: null
            }
          : item
      );
    }
    await loadApplicationsList();
    await refreshApplicationReviewWorkspace();
    renderApplicationMessagingRecipients();
    renderApplicationMessagingSummary();
    setApplicationMessagingMessage(
      `${isEmailChannel ? "Email" : "Phone number"} saved to the registry for ${
        target.studentName || "the selected applicant"
      }.`,
      "success"
    );
  } catch (error) {
    if (await recoverExpiredSession(error)) {
      return;
    }
    setApplicationMessagingMessage(error.message, "error");
  }
}

async function sendApplicationMessagingBatch(batchId, retryMode = "pending_only") {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    setApplicationMessagingMessage("The app is not connected to the API right now.", "error");
    return;
  }
  if (!canManageApplicationMessaging()) {
    setApplicationMessagingMessage("Only admins can send messaging batches.", "error");
    return;
  }

  try {
      setApplicationMessagingMessage(
        retryMode === "failed_only"
          ? "Resending failed recipients..."
          : "Sending the messaging batch...",
        "warning"
      );
      const response = await fetch(`${apiBaseUrl}/api/applications/messages/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          batchId,
          retryMode
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "Unable to send the messaging batch.");
      }

      await loadApplicationMessagingHistory();
      setApplicationMessagingMessage(
        `${
          retryMode === "failed_only" ? "Retry complete" : "Send complete"
        }. Attempted ${payload.summary?.attemptedCount || 0}, sent ${
          payload.summary?.sentCount || 0
        }, failed ${payload.summary?.failedCount || 0}.`,
        payload.summary?.failedCount ? "warning" : "success"
      );
  } catch (error) {
    if (await recoverExpiredSession(error)) {
      return;
    }
    setApplicationMessagingMessage(error.message, "error");
  }
}

async function previewApplicationMessaging(event) {
  event?.preventDefault();
  const apiBaseUrl = getApiBaseUrl();
  const context = getActiveApplicationContext();
  if (!apiBaseUrl) {
    setApplicationMessagingMessage("The app is not connected to the API right now.", "error");
    return;
  }
  if (!context.schemeId || !context.cycleId) {
    setApplicationMessagingMessage(
      "Choose the active scheme and academic year before generating a messaging preview.",
      "error"
    );
    return;
  }

  elements.applicationMessagingPreviewButton.disabled = true;
  setApplicationMessagingMessage("Generating messaging preview...", "warning");

  try {
    const url = new URL(`${apiBaseUrl}/api/applications/messages/preview`);
    url.searchParams.set("schemeId", context.schemeId);
    url.searchParams.set("cycleId", context.cycleId);
    url.searchParams.set("messageType", elements.applicationMessagingType.value);
    url.searchParams.set("channel", state.applicationMessagingChannel);
    const response = await fetch(url, {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to generate the messaging preview.");
    }

    state.applicationMessagingPreview = payload;
    state.applicationMessagingChannel = payload.channel || state.applicationMessagingChannel;
    state.applicationMessagingSenderEmail = payload.senderEmail || state.applicationMessagingSenderEmail;
    state.applicationMessagingSenderPhone = payload.senderPhone || state.applicationMessagingSenderPhone;
    state.applicationMessagingSenderWhatsApp =
      payload.senderWhatsApp || state.applicationMessagingSenderWhatsApp;
    renderApplicationMessagingChannelOptions();
    renderApplicationMessagingSender();
    resetApplicationMessagingDraft(payload);
    setApplicationMessagingMessage(
      `Preview ready for ${payload.summary?.totalRecipients || 0} recipient(s) from the active application list.`,
      payload.summary?.missingEmailRecipients || payload.summary?.missingPhoneRecipients
        ? "warning"
        : "success"
    );
  } catch (error) {
    state.applicationMessagingPreview = null;
    renderApplicationMessagingSummary();
    renderApplicationMessagingTemplate();
    renderApplicationMessagingRecipients();
    if (await recoverExpiredSession(error)) {
      return;
    }
    setApplicationMessagingMessage(error.message, "error");
  } finally {
    syncApplicationReviewControls();
  }
}

async function logApplicationMessagingBatch(event) {
  event?.preventDefault();
  const apiBaseUrl = getApiBaseUrl();
  const context = getActiveApplicationContext();
  if (!apiBaseUrl) {
    setApplicationMessagingMessage("The app is not connected to the API right now.", "error");
    return;
  }
  if (!canManageApplicationMessaging()) {
    setApplicationMessagingMessage("Only admins can log application messaging batches.", "error");
    return;
  }
  if (!context.schemeId || !context.cycleId) {
    setApplicationMessagingMessage(
      "Choose the active scheme and academic year before logging a messaging batch.",
      "error"
    );
    return;
  }

  elements.applicationMessagingLogButton.disabled = true;
  setApplicationMessagingMessage("Logging the messaging batch...", "warning");

  try {
    const response = await fetch(`${apiBaseUrl}/api/applications/messages/log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        schemeId: context.schemeId,
        cycleId: context.cycleId,
        channel: state.applicationMessagingChannel,
        messageType: elements.applicationMessagingType.value,
        subjectLine: getEffectiveApplicationMessagingSubject(),
        bodyTemplate: getEffectiveApplicationMessagingBody(),
        recipientEdits: state.applicationMessagingRecipientEdits
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to log the messaging batch.");
    }

    setApplicationMessagingMessage(
      `Messaging batch logged for ${payload.batch?.recipientCount || 0} recipient(s). Sender: ${
        state.applicationMessagingChannel === "sms"
          ? payload.senderPhone || state.applicationMessagingSenderPhone
          : state.applicationMessagingChannel === "whatsapp"
            ? payload.senderWhatsApp || state.applicationMessagingSenderWhatsApp
            : payload.senderEmail
      }.`,
      "success"
    );
    await loadApplicationMessagingHistory();
  } catch (error) {
    if (await recoverExpiredSession(error)) {
      return;
    }
    setApplicationMessagingMessage(error.message, "error");
  } finally {
    syncApplicationReviewControls();
  }
}

async function loadApplicationReviewSummary(extraFilters = {}) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    renderApplicationReviewSummary();
    return;
  }

  setApplicationReviewMetricsMessage(
    extraFilters.__skipContext
      ? "Loading reviewer progress across active schemes..."
      : "Loading reviewer progress for the selected scheme and academic year...",
    "warning"
  );

  try {
    const query = buildApplicationFilterParams(extraFilters);
    const url = query.toString()
      ? `${apiBaseUrl}/api/applications/summary?${query.toString()}`
      : `${apiBaseUrl}/api/applications/summary`;
    const response = await fetch(url, {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to load application review summary.");
    }

    renderApplicationReviewSummary(payload.summary);
    setApplicationReviewMetricsMessage(
      `Tracking ${payload.summary.totalApplications} application(s) in the current review scope.`,
      payload.summary.totalApplications ? "success" : "warning"
    );
  } catch (error) {
    renderApplicationReviewSummary();
    setApplicationReviewMetricsMessage(error.message, "error");
  }
}

async function loadApplicationCwaCoverage(extraFilters = {}) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    renderApplicationCwaCoverage();
    return;
  }

  setApplicationCwaCoverageMessage(
    extraFilters.__skipContext
      ? "Loading imported CWA coverage across active schemes..."
      : "Loading imported CWA coverage for the selected scheme and academic year...",
    "warning"
  );

  try {
    const query = buildApplicationFilterParams(extraFilters);
    const url = query.toString()
      ? `${apiBaseUrl}/api/applications/cwa-coverage?${query.toString()}`
      : `${apiBaseUrl}/api/applications/cwa-coverage`;
    const response = await fetch(url, {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to load application CWA coverage.");
    }

    renderApplicationCwaCoverage(payload);
    const summary = payload.summary || {};
    if (!Number(summary.totalApplications || 0)) {
      setApplicationCwaCoverageMessage(
        "No applications are in the current scope yet, so there is no CWA coverage to measure.",
        "warning"
      );
      return;
    }

    if (!Number(summary.missingCwaCount || 0)) {
      setApplicationCwaCoverageMessage(
        `Imported CWA is matched for all ${summary.totalApplications} application(s) in the current scope.`,
        "success"
      );
      return;
    }

    setApplicationCwaCoverageMessage(
      `Imported CWA is matched for ${summary.matchedCwaCount} of ${summary.totalApplications} application(s). ${summary.missingCwaCount} still need coverage.`,
      Number(summary.matchedCwaCount || 0) ? "warning" : "error"
    );
  } catch (error) {
    renderApplicationCwaCoverage();
    setApplicationCwaCoverageMessage(error.message, "error");
  }
}

async function refreshApplicationReviewWorkspace(extraFilters = {}) {
  await Promise.all([
    loadApplicationReviewSummary(extraFilters),
    loadApplicationCwaCoverage(extraFilters),
    loadApplicationReviewResults(extraFilters)
  ]);
}

async function loadApplicationReviewResults(extraFilters = {}) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    renderApplicationReviewResults([]);
    return { ok: false, total: 0, items: [] };
  }

  setApplicationReviewMessage("Loading applications for review...", "warning");

  try {
    const query = buildApplicationFilterParams(extraFilters);
    const url = query.toString()
      ? `${apiBaseUrl}/api/applications?${query.toString()}`
      : `${apiBaseUrl}/api/applications`;
    const response = await fetch(url, {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "Unable to load applications for review.");
      }

      renderApplicationReviewResults(payload.items || []);
    setApplicationReviewMessage(
        payload.total
          ? `Loaded ${payload.total} application(s) for review.`
          : "No applications matched the current review search.",
        payload.total ? "success" : "warning"
      );
      return payload;
    } catch (error) {
      renderApplicationReviewResults([]);
      setApplicationReviewMessage(error.message, "error");
      return {
        ok: false,
        total: 0,
        items: [],
        error: error.message
      };
    }
  }

async function handleApplicationExport(qualificationStatus) {
  const apiBaseUrl = getApiBaseUrl();
  const context = getActiveApplicationContext();

  if (!apiBaseUrl) {
    setApplicationExportMessage("Enter the API URL first.", "error");
    return;
  }
  if (!canExportApplications()) {
    setApplicationExportMessage(
      "Only admins can export application lists.",
      "error"
    );
    return;
  }
  if (!context.schemeId || !context.cycleId) {
    setApplicationExportMessage(
      "Choose the active scheme and academic year before downloading an application list.",
      "error"
    );
    return;
  }

  const decisionLabel = formatDecisionLabel(qualificationStatus);
  const exportButtons = Array.from(
    elements.applicationExportCards.querySelectorAll("[data-application-export-status]")
  );
  exportButtons.forEach((button) => {
    button.disabled = true;
  });
  setApplicationExportMessage(
    `Preparing the ${decisionLabel.toLowerCase()} export workbook...`,
    "warning"
  );

  try {
    const query = buildApplicationFilterParams({
      qualificationStatus,
      fontName: elements.applicationExportFont.value
    });
    const response = await fetch(`${apiBaseUrl}/api/applications/export?${query.toString()}`, {
      headers: {
        ...getAuthHeaders()
      }
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || `Unable to export the ${decisionLabel.toLowerCase()} list.`);
    }

    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const disposition = response.headers.get("Content-Disposition") || "";
    const matchedFileName = disposition.match(/filename=\"?([^\";]+)\"?/i);
    const fileName = matchedFileName?.[1] || `${qualificationStatus}-applications.xlsx`;

    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(downloadUrl);

    setApplicationExportMessage(
      `${decisionLabel} applications export is ready and has been downloaded.`,
      "success"
    );
  } catch (error) {
    setApplicationExportMessage(error.message, "error");
  } finally {
    renderApplicationExportCards();
  }
}

async function postApplicationInterviewImport(endpoint) {
  const apiBaseUrl = getApiBaseUrl();
  const files = Array.from(elements.applicationInterviewFile.files || []);

  if (!canManageApplicationImportsExports()) {
    throw new Error("Only admins can import interview score files.");
  }
  if (!apiBaseUrl) {
    throw new Error("Enter the API URL first.");
  }
  if (!elements.applicationSchemeSelect.value) {
    throw new Error("Choose a scheme first.");
  }
  if (!elements.applicationCycleSelect.value) {
    throw new Error("Choose an academic year first.");
  }
  if (!files.length) {
    throw new Error("Choose one or more interview score files before continuing.");
  }

  const formData = new FormData();
  formData.append("schemeId", elements.applicationSchemeSelect.value);
  formData.append("cycleId", elements.applicationCycleSelect.value);
  for (const file of files) {
    formData.append("files", file);
  }

  const response = await fetch(`${apiBaseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      ...getAuthHeaders()
    },
    body: formData
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || payload.message || "The interview import request failed.");
  }

  return payload;
}

async function handleApplicationInterviewPreview(event) {
  event?.preventDefault();
  state.activeModule = "applications";
  state.activeApplicationsSection = "exports";
  renderModuleShell();

  elements.applicationInterviewPreviewButton.disabled = true;
  elements.applicationInterviewImportButton.disabled = true;
  setApplicationInterviewImportMessage("Generating interview import preview...", "warning");

  try {
    const payload = await postApplicationInterviewImport("/api/applications/interview-import/preview");
    state.applicationInterviewPreview = payload;
    state.lastApplicationInterviewImport = null;
    renderApplicationInterviewSummary(payload.summary || {});
    renderApplicationInterviewValidRows(payload.rows || []);
    renderApplicationInterviewIssues(payload.rows || []);
    renderApplicationInterviewImportResults(null);
    elements.applicationInterviewImportButton.disabled = (payload.summary?.validRows || 0) === 0;
    const sampleNote = payload.truncated
      ? ` Showing ${payload.returnedRows || payload.rows?.length || 0} sample row(s) in the preview tables.`
      : "";
    setApplicationInterviewImportMessage(
      `Interview preview ready: ${payload.summary?.validRows || 0} matched row${(payload.summary?.validRows || 0) === 1 ? "" : "s"} can be imported.${sampleNote}`,
      payload.summary?.invalidRows ? "warning" : "success"
    );
  } catch (error) {
    setApplicationInterviewImportMessage(error.message, "error");
  } finally {
    elements.applicationInterviewPreviewButton.disabled = false;
  }
}

async function handleApplicationInterviewImport() {
  state.activeModule = "applications";
  state.activeApplicationsSection = "exports";
  renderModuleShell();

  elements.applicationInterviewPreviewButton.disabled = true;
  elements.applicationInterviewImportButton.disabled = true;
  setApplicationInterviewImportMessage("Importing matched interview rows...", "warning");

  try {
    const payload = await postApplicationInterviewImport("/api/applications/interview-import");
    state.lastApplicationInterviewImport = payload;
    state.applicationInterviewPreview = payload.preview || state.applicationInterviewPreview;
    renderApplicationInterviewSummary(payload.preview?.summary || payload.summary || {});
    renderApplicationInterviewValidRows(payload.preview?.rows || []);
    renderApplicationInterviewIssues(payload.preview?.rows || []);
    renderApplicationInterviewImportResults(payload);
    const sampleNote =
      payload.preview?.truncated || payload.importedRowsTruncated || payload.rejectedRowsTruncated
        ? ` Showing ${payload.preview?.returnedRows || payload.preview?.rows?.length || 0} sample preview row(s) and the first ${payload.importedRowsReturned || 0} imported row(s).`
        : "";
    setApplicationInterviewImportMessage(
      `Interview import completed: ${payload.summary?.importedRows || 0} row${(payload.summary?.importedRows || 0) === 1 ? "" : "s"} updated.${sampleNote}`,
      payload.summary?.rejectedRows ? "warning" : "success"
    );
    await loadApplicationsList();
    await refreshApplicationReviewWorkspace();
    if (state.selectedApplicationId) {
      await selectApplicationForReview(state.selectedApplicationId);
    }
    await loadDashboard();
  } catch (error) {
    setApplicationInterviewImportMessage(error.message, "error");
  } finally {
    elements.applicationInterviewPreviewButton.disabled = false;
    elements.applicationInterviewImportButton.disabled =
      !state.applicationInterviewPreview || (state.applicationInterviewPreview.summary?.validRows || 0) === 0;
  }
}

async function lookupStudentByReferenceId(referenceId) {
  const apiBaseUrl = getApiBaseUrl();
  const normalizedReferenceId = String(referenceId || "").trim();

  if (!apiBaseUrl) {
    throw new Error("Enter the API URL first.");
  }
  if (!normalizedReferenceId) {
    throw new Error("Enter a student reference ID first.");
  }

  const url = new URL(`${apiBaseUrl}/api/students/search`);
  url.searchParams.set("studentReferenceId", normalizedReferenceId);

  const response = await fetch(url, {
    headers: {
      ...getAuthHeaders()
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "Unable to search the registry.");
  }

  if (!payload.items?.length) {
    return null;
  }

  return payload.items[0];
}

async function handleApplicationReviewSearch(event) {
  event?.preventDefault();
  state.activeModule = "applications";
  state.activeApplicationsSection = "review";
  renderModuleShell();

  const referenceId = elements.applicationReviewSearchReference.value.trim();
  if (!referenceId) {
    await refreshApplicationReviewWorkspace();
    return;
  }

  setApplicationReviewMessage("Searching the selected reference ID...", "warning");
  await loadApplicationReviewResults({ studentReferenceId: referenceId });
}

function resetApplicationReviewSearch() {
  elements.applicationReviewSearchReference.value = "";
  void refreshApplicationReviewWorkspace();
}

async function handleSingleApplicationLookup() {
  setSingleApplicationMessage("Searching the registry for this reference ID...", "warning");
  elements.singleApplicationLookupButton.disabled = true;

  try {
    const student = await lookupStudentByReferenceId(elements.singleApplicationReferenceId.value);
    state.singleApplicationMatch = student;
    renderSingleApplicationLookupSummary(student);

    if (!student) {
      setSingleApplicationMessage(
        "No registry student matched that reference ID. Correct the reference or import the student into the registry first.",
        "error"
      );
      return;
    }

    if (!elements.singleApplicationUploadedName.value.trim()) {
      elements.singleApplicationUploadedName.value = student.fullName || "";
    }
    if (!elements.singleApplicationProgram.value.trim()) {
      elements.singleApplicationProgram.value = student.program || "";
    }
    if (!elements.singleApplicationYear.value.trim()) {
      elements.singleApplicationYear.value = student.year || "";
    }

    setSingleApplicationMessage("Registry student matched. You can add this applicant now.", "success");
  } catch (error) {
    state.singleApplicationMatch = null;
    renderSingleApplicationLookupSummary(null);
    setSingleApplicationMessage(error.message, "error");
  } finally {
    elements.singleApplicationLookupButton.disabled = false;
  }
}

async function saveSingleApplication(event) {
  event?.preventDefault();
  const apiBaseUrl = getApiBaseUrl();
  const { schemeId, cycleId } = getActiveApplicationContext();

  if (!apiBaseUrl) {
    setSingleApplicationMessage("Enter the API URL first.", "error");
    return;
  }
  if (!schemeId || !cycleId) {
    setSingleApplicationMessage(
      "Choose the active scheme and academic year before adding a single applicant.",
      "error"
    );
    return;
  }
  if (!state.singleApplicationMatch) {
    setSingleApplicationMessage("Find a matching registry student first.", "error");
    return;
  }

  elements.singleApplicationAddButton.disabled = true;
  setSingleApplicationMessage("Adding the single applicant to the application list...", "warning");

  try {
    const response = await fetch(`${apiBaseUrl}/api/applications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        studentId: state.singleApplicationMatch.id,
        schemeId,
        cycleId,
        uploadedFullName: elements.singleApplicationUploadedName.value,
        applicantEmail: elements.singleApplicationApplicantEmail.value,
        uploadedStudentReferenceId: elements.singleApplicationReferenceId.value,
        uploadedProgram: elements.singleApplicationProgram.value,
        finalScore: elements.singleApplicationScore.value,
        reviewerNotes: elements.singleApplicationNotes.value
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to add the single applicant.");
    }

    elements.singleApplicationForm.reset();
    state.singleApplicationMatch = null;
      renderSingleApplicationLookupSummary(null);
      setSingleApplicationMessage("Single applicant added successfully.", "success");
      await loadApplicationsList();
      await refreshApplicationReviewWorkspace();
      await loadDashboard();
      state.selectedApplicationId = payload.item?.id || null;
    if (state.selectedApplicationId) {
      await selectApplicationForReview(state.selectedApplicationId);
    }
  } catch (error) {
    setSingleApplicationMessage(error.message, "error");
  } finally {
    elements.singleApplicationAddButton.disabled = false;
  }
}

function selectApplicationIssueRow(issueId) {
  const row = getUnresolvedApplicationIssueRows().find((item) => String(item.id) === String(issueId));
  if (!row) {
    setApplicationIssueEditorMessage("That rejected row is no longer available for editing.", "error");
    return;
  }

  state.selectedApplicationIssueRowNumber = row.id;
  state.issueApplicationMatch = null;
  elements.applicationIssueQueueId.value = String(row.id || "");
  elements.applicationIssueRowNumber.value = row.rowNumber ? String(row.rowNumber) : "";
  elements.applicationIssueReferenceId.value = row.payload.studentReferenceId || "";
  elements.applicationIssueFullName.value = row.payload.fullName || "";
  elements.applicationIssueProgram.value = row.payload.program || "";
  elements.applicationIssueYear.value = row.payload.year || "";
  elements.applicationIssueScore.value = row.payload.finalScore ?? "";
  elements.applicationIssueNotes.value = row.payload.reviewerNotes || row.payload.notes || "";
  renderApplicationIssueLookupSummary(null);
  setApplicationIssueEditorMessage(
    `Editing ${row.rowNumber ? `row ${row.rowNumber}` : "the queued issue"}. Correct the reference ID or applicant details, then search the registry.`,
    "warning"
  );
}

async function handleApplicationIssueLookup() {
  setApplicationIssueEditorMessage("Searching the registry for the corrected reference ID...", "warning");
  elements.applicationIssueLookupButton.disabled = true;

  try {
    const student = await lookupStudentByReferenceId(elements.applicationIssueReferenceId.value);
    state.issueApplicationMatch = student;
    renderApplicationIssueLookupSummary(student);

    if (!student) {
      setApplicationIssueEditorMessage(
        "No registry student matched the corrected reference ID yet.",
        "error"
      );
      return;
    }

    if (!elements.applicationIssueFullName.value.trim()) {
      elements.applicationIssueFullName.value = student.fullName || "";
    }
    if (!elements.applicationIssueProgram.value.trim()) {
      elements.applicationIssueProgram.value = student.program || "";
    }
    if (!elements.applicationIssueYear.value.trim()) {
      elements.applicationIssueYear.value = student.year || "";
    }

    setApplicationIssueEditorMessage(
      "Registry match found. You can add the corrected row into the application list now.",
      "success"
    );
  } catch (error) {
    state.issueApplicationMatch = null;
    renderApplicationIssueLookupSummary(null);
    setApplicationIssueEditorMessage(error.message, "error");
  } finally {
    elements.applicationIssueLookupButton.disabled = false;
  }
}

async function saveApplicationIssueCorrection(event) {
  event?.preventDefault();
  const apiBaseUrl = getApiBaseUrl();
  const { schemeId, cycleId } = getActiveApplicationContext();
  const queueId = elements.applicationIssueQueueId.value.trim();
  const rowNumber = Number(elements.applicationIssueRowNumber.value || 0);

  if (!apiBaseUrl) {
    setApplicationIssueEditorMessage("Enter the API URL first.", "error");
    return;
  }
  if (!schemeId || !cycleId) {
    setApplicationIssueEditorMessage(
      "Choose the active scheme and academic year before correcting a rejected row.",
      "error"
    );
    return;
  }
  if (!rowNumber) {
    setApplicationIssueEditorMessage("Choose a rejected row to edit first.", "error");
    return;
  }
  if (!state.issueApplicationMatch) {
    setApplicationIssueEditorMessage("Search and confirm the registry student first.", "error");
    return;
  }

  elements.applicationIssueSaveButton.disabled = true;
  setApplicationIssueEditorMessage("Adding the corrected row to the application list...", "warning");

  try {
    const selectedRow =
      getUnresolvedApplicationIssueRows().find((item) => String(item.id) === String(queueId)) || null;
    const response = await fetch(`${apiBaseUrl}/api/applications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        studentId: state.issueApplicationMatch.id,
        schemeId,
        cycleId,
        uploadedFullName: elements.applicationIssueFullName.value,
        uploadedStudentReferenceId: elements.applicationIssueReferenceId.value,
        applicantEmail: selectedRow?.payload?.applicantEmail || "",
        uploadedProgram: elements.applicationIssueProgram.value,
        program: elements.applicationIssueProgram.value,
        year: elements.applicationIssueYear.value,
        finalScore: elements.applicationIssueScore.value,
        reviewerNotes: elements.applicationIssueNotes.value
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to add the corrected rejected row.");
    }

    if (queueId) {
      await fetch(`${apiBaseUrl}/api/applications/issues/${encodeURIComponent(queueId)}/resolve`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          linkedApplicationId: payload.item?.id || "",
          resolutionNotes: `Corrected and added to the application list${rowNumber ? ` from row ${rowNumber}` : ""}.`
        })
      });
    }

    state.resolvedApplicationIssueRows[rowNumber] = true;
    renderApplicationsIssues(state.applicationPreview?.rows || []);
    await loadApplicationIssueQueue();
    resetApplicationIssueForm();
    setApplicationIssueEditorMessage(
      `${rowNumber ? `Row ${rowNumber}` : "The queued issue"} was corrected and added successfully.`,
      "success"
      );
      await loadApplicationsList();
      await refreshApplicationReviewWorkspace();
      await loadDashboard();
      state.selectedApplicationId = payload.item?.id || null;
    if (state.selectedApplicationId) {
      await selectApplicationForReview(state.selectedApplicationId);
    }
  } catch (error) {
    setApplicationIssueEditorMessage(error.message, "error");
  } finally {
    elements.applicationIssueSaveButton.disabled = false;
  }
}

async function loadApplicationCriteriaForReview(application) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !application?.schemeId || !application?.cycleId) {
    state.applicationReviewCriteria = null;
    renderSelectedApplicationReview();
    return;
  }

  try {
    const url = new URL(`${apiBaseUrl}/api/application-criteria`);
    url.searchParams.set("schemeId", application.schemeId);
    url.searchParams.set("cycleId", application.cycleId);

    const response = await fetch(url, {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to load screening criteria for review.");
    }

    state.applicationReviewCriteria = payload.item || null;
  } catch (error) {
    state.applicationReviewCriteria = null;
    setApplicationReviewMessage(error.message, "error");
  } finally {
    renderSelectedApplicationReview();
  }
}

async function selectApplicationForReview(applicationId) {
  state.selectedApplicationId = applicationId;
  state.activeModule = "applications";
  state.activeApplicationsSection = "review";
  renderModuleShell();
  renderSelectedApplicationReview();
  const application = getSelectedApplication();
  if (!application) {
    return;
  }

  // Scroll the Application Review section into view smoothly
  requestAnimationFrame(() => {
    const reviewSection = document.getElementById("applicationReviewSection");
    if (reviewSection) {
      reviewSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  setApplicationReviewMessage("Loading application details for review...", "warning");
  await Promise.all([
    loadApplicationCriteriaForReview(application),
    loadApplicationAuditHistory(application.id)
  ]);
}

async function loadApplicationCriteria() {
  const apiBaseUrl = getApiBaseUrl();
  const schemeId = elements.applicationSchemeSelect.value;
  const cycleId = elements.applicationCycleSelect.value;

    if (!apiBaseUrl || !schemeId || !cycleId) {
      renderApplicationCriteria(null);
      setApplicationCriteriaMessage(
        "Choose a scheme and academic year to load or define screening criteria.",
        "warning"
      );
      return;
    }

  try {
    const url = new URL(`${apiBaseUrl}/api/application-criteria`);
    url.searchParams.set("schemeId", schemeId);
    url.searchParams.set("cycleId", cycleId);

    const response = await fetch(url, {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to load screening criteria.");
    }

    renderApplicationCriteria(payload.item);
    setApplicationCriteriaMessage(
      payload.item
        ? "Screening criteria loaded for the selected scheme and academic year."
        : "No criteria have been saved yet for this scheme and academic year.",
      payload.item ? "success" : "warning"
    );
  } catch (error) {
    renderApplicationCriteria(null);
    setApplicationCriteriaMessage(error.message, "error");
  }
}

async function saveApplicationCriteria(event) {
  event?.preventDefault();
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    setApplicationCriteriaMessage("Enter the API URL first.", "error");
    return;
  }

  setApplicationCriteriaMessage("Saving screening criteria...", "warning");
  elements.applicationCriteriaSaveButton.disabled = true;

  try {
    const response = await fetch(`${apiBaseUrl}/api/application-criteria`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        schemeId: elements.applicationSchemeSelect.value,
        cycleId: elements.applicationCycleSelect.value,
        requiredDocuments: elements.applicationRequiredDocuments.value,
        cwaCutoff: elements.applicationCwaCutoff.value,
        wassceCutoff: elements.applicationWassceCutoff.value,
        interviewRequired: elements.applicationInterviewRequired.checked,
        notes: elements.applicationCriteriaNotes.value
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to save screening criteria.");
    }

      renderApplicationCriteria(payload.item);
      setApplicationCriteriaMessage("Screening criteria saved successfully.", "success");
      await loadDashboard();
  } catch (error) {
    setApplicationCriteriaMessage(error.message, "error");
  } finally {
    syncApplicationCriteriaControls();
  }
}

async function saveApplicationReview(event) {
  event?.preventDefault();
  const apiBaseUrl = getApiBaseUrl();
  const application = getSelectedApplication();

  if (!apiBaseUrl) {
    setApplicationReviewMessage("Enter the API URL first.", "error");
    return;
  }
  if (!application) {
    setApplicationReviewMessage("Select an application first.", "error");
    return;
  }

  const reviewDecision = elements.applicationReviewDecision.value;
  const reviewReason = elements.applicationReviewReason.value;
  const reviewComment = elements.applicationReviewComment.value.trim();
  const useRegistryData = elements.applicationReviewUseRegistryData.checked;

  if (!reviewDecision && !useRegistryData) {
    setApplicationReviewMessage(
      "Choose a reviewer decision or use the registry-data option before saving.",
      "error"
    );
    return;
  }
  if (["disqualified", "pending"].includes(reviewDecision) && !reviewReason) {
    setApplicationReviewMessage(
      "Choose a reviewer reason for disqualified or pending decisions.",
      "error"
    );
    return;
  }

  setApplicationReviewMessage("Saving review decision...", "warning");
  elements.applicationReviewSaveButton.disabled = true;

  try {
    const response = await fetch(`${apiBaseUrl}/api/applications/${application.id}/review`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders()
      },
        body: JSON.stringify({
          reviewDecision,
          reviewReason,
          reviewComment,
          useRegistryData,
          uploadedFullName: elements.applicationReviewUploadedName.value,
          uploadedStudentReferenceId: elements.applicationReviewUploadedReferenceId.value,
          interviewStatus: elements.applicationReviewInterviewStatus.value,
          interviewScore: elements.applicationReviewInterviewScore.value,
          interviewDate: elements.applicationReviewInterviewDate.value,
          interviewNotes: elements.applicationReviewInterviewNotes.value,
          documentChecklist: collectApplicationDocumentChecklist()
        })
      });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to save the review decision.");
    }

    setApplicationReviewMessage("Review decision saved successfully.", "success");
    await loadApplicationsList();
    await refreshApplicationReviewWorkspace(
      elements.applicationReviewSearchReference.value.trim()
        ? { studentReferenceId: elements.applicationReviewSearchReference.value.trim() }
        : {}
    );
    await loadDashboard();
    state.selectedApplicationId = payload.item?.id || application.id;
    renderSelectedApplicationReview();
    requestAnimationFrame(() => {
      focusApplicationReviewSearch({
        searchForm: elements.applicationReviewSearchForm,
        searchInput: elements.applicationReviewSearchReference
      });
    });
  } catch (error) {
    setApplicationReviewMessage(error.message, "error");
  } finally {
    syncApplicationReviewControls();
  }
}

async function saveApplicationAcademicEntry(event) {
  event?.preventDefault();
  const apiBaseUrl = getApiBaseUrl();
  const application = getSelectedApplication();

  if (!apiBaseUrl) {
    setApplicationAcademicEntryMessage("Enter the API URL first.", "error");
    return;
  }
  if (!application) {
    setApplicationAcademicEntryMessage("Select an application first.", "error");
    return;
  }

  elements.applicationAcademicEntrySaveButton.disabled = true;
  setApplicationAcademicEntryMessage("Saving academic values into academic history...", "warning");

  try {
    const response = await fetch(
      `${apiBaseUrl}/api/applications/${encodeURIComponent(application.id)}/academic-history`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          cwa: elements.applicationAcademicEntryCwa.value,
          wassceAggregate: elements.applicationAcademicEntryWassce.value
        })
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to save academic history.");
    }

    setApplicationAcademicEntryMessage(
      "Academic history updated successfully. Screening and CWA coverage are refreshing now.",
      "success"
    );
    await loadApplicationsList();
    await refreshApplicationReviewWorkspace();
    await loadRegistryStats();
    if (state.selectedApplicationId) {
      await selectApplicationForReview(state.selectedApplicationId);
    }
    await loadDashboard();
  } catch (error) {
    setApplicationAcademicEntryMessage(error.message, "error");
  } finally {
    syncApplicationReviewControls();
  }
}

async function applyBulkInterviewUpdate(event) {
  event?.preventDefault();
  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl) {
    setApplicationBulkInterviewMessage("Enter the API URL first.", "error");
    return;
  }

  const schemeId = elements.applicationSchemeSelect.value;
  const cycleId = elements.applicationCycleSelect.value;
  if (!schemeId || !cycleId) {
    setApplicationBulkInterviewMessage(
      "Choose the active scheme and academic year before applying a shared interview update.",
      "error"
    );
    return;
  }

  if (!elements.applicationBulkInterviewStatus.value) {
    setApplicationBulkInterviewMessage(
      "Choose an interview status before applying the update to the active application list.",
      "error"
    );
    return;
  }

  elements.applicationBulkInterviewApplyButton.disabled = true;
  setApplicationBulkInterviewMessage(
    "Applying the shared interview update to the active application list...",
    "warning"
  );

  try {
    const response = await fetch(`${apiBaseUrl}/api/applications/interview-bulk`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        schemeId,
        cycleId,
        interviewStatus: elements.applicationBulkInterviewStatus.value,
        interviewDate: elements.applicationBulkInterviewDate.value,
        interviewNotes: elements.applicationBulkInterviewNotes.value
      })
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "Bulk interview update failed.");
    }

    const updatedApplications = payload.updatedApplications ?? payload.summary?.updatedApplications ?? 0;
      setApplicationBulkInterviewMessage(
        `${updatedApplications} application${updatedApplications === 1 ? "" : "s"} updated with the shared interview details.`,
        "success"
      );
      state.applicationBulkInterviewHidden = true;
      renderApplicationBulkInterviewVisibility();
      await loadApplicationsList();
    await refreshApplicationReviewWorkspace(
      elements.applicationReviewSearchReference.value.trim()
        ? { studentReferenceId: elements.applicationReviewSearchReference.value.trim() }
        : {}
    );
    if (state.selectedApplicationId) {
      await selectApplicationForReview(state.selectedApplicationId);
    }
    await loadDashboard();
  } catch (error) {
    setApplicationBulkInterviewMessage(error.message, "error");
  } finally {
    syncApplicationReviewControls();
  }
}

async function applyBulkOutcomeUpdate(event) {
  event?.preventDefault();
  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl) {
    setApplicationOutcomeMessage("Enter the API URL first.", "error");
    return;
  }

  if (!canManageApplicationOutcomes()) {
    setApplicationOutcomeMessage(
      "Only admins and reviewers can apply outcomes in the active application list.",
      "error"
    );
    return;
  }

  const schemeId = elements.applicationSchemeSelect.value;
  const cycleId = elements.applicationCycleSelect.value;
  if (!schemeId || !cycleId) {
    setApplicationOutcomeMessage(
      "Choose the active scheme and academic year before applying an outcome.",
      "error"
    );
    return;
  }

  if (!elements.applicationOutcomeDecision.value) {
    setApplicationOutcomeMessage("Choose the final outcome before applying it.", "error");
    return;
  }

  elements.applicationOutcomeApplyButton.disabled = true;
  setApplicationOutcomeMessage("Applying outcome handoff to the active application list...", "warning");

  try {
    const response = await fetch(`${apiBaseUrl}/api/applications/outcomes/bulk`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        schemeId,
        cycleId,
        sourceQualificationStatus: elements.applicationOutcomeSourceStatus.value,
        outcomeDecision: elements.applicationOutcomeDecision.value,
        outcomeNotes: elements.applicationOutcomeNotes.value
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to apply outcomes to the active application list.");
    }

    const updatedApplications = Number(payload.updatedApplications || payload.summary?.updatedApplications || 0);
    setApplicationOutcomeMessage(
      `${updatedApplications} application${updatedApplications === 1 ? "" : "s"} moved to ${formatOutcomeLabel(
        payload.outcomeDecision || elements.applicationOutcomeDecision.value
      ).toLowerCase()} from the ${formatDecisionLabel(
        payload.sourceQualificationStatus || elements.applicationOutcomeSourceStatus.value
      ).toLowerCase()} group.`,
      updatedApplications > 0 ? "success" : "warning"
    );
    await loadApplicationsList();
    await loadApplicationReviewSummary();
    await refreshApplicationReviewWorkspace(
      elements.applicationReviewSearchReference.value.trim()
        ? { studentReferenceId: elements.applicationReviewSearchReference.value.trim() }
        : {}
    );
    if (state.selectedApplicationId) {
      await selectApplicationForReview(state.selectedApplicationId);
    }
    await loadDashboard();
  } catch (error) {
    setApplicationOutcomeMessage(error.message, "error");
  } finally {
    syncApplicationReviewControls();
  }
}

async function postApplicationsImport(endpoint) {
  const apiBaseUrl = getApiBaseUrl();
  const files = Array.from(elements.applicationFile.files || []);

  if (!canManageApplicationImportsExports()) {
    throw new Error("Only admins can import application files.");
  }
  if (!apiBaseUrl) {
    throw new Error("Enter the API URL first.");
  }
  if (!elements.applicationSchemeSelect.value) {
    throw new Error("Choose a scheme first.");
  }
  if (!elements.applicationCycleSelect.value) {
    throw new Error("Choose an academic year first.");
  }
  if (!files.length) {
    throw new Error("Choose one or more application files before continuing.");
  }

  const formData = new FormData();
  formData.append("schemeId", elements.applicationSchemeSelect.value);
  formData.append("cycleId", elements.applicationCycleSelect.value);
  formData.append("importMode", elements.applicationImportMode.value);
  for (const file of files) {
    formData.append("files", file);
  }

  const response = await fetch(`${apiBaseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      ...getAuthHeaders()
    },
    body: formData
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "The applications import request failed.");
  }

  return payload;
}

function buildAcademicHistorySearchUrl() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    throw new Error("Enter the API URL first.");
  }

  const url = new URL(`${apiBaseUrl}/api/students/history`);
  const q = elements.academicHistorySearchQuery.value.trim();
  const studentReferenceId = elements.academicHistorySearchReferenceId.value.trim();
  const indexNumber = elements.academicHistorySearchIndexNumber.value.trim();

  if (q) {
    url.searchParams.set("q", q);
  }
  if (studentReferenceId) {
    url.searchParams.set("studentReferenceId", studentReferenceId);
  }
  if (indexNumber) {
    url.searchParams.set("indexNumber", indexNumber);
  }

  return url;
}

async function loadAcademicHistory(event) {
  event?.preventDefault();
  state.activeModule = "registry";
  state.activeSection = "history";
  renderModuleShell();

  elements.academicHistorySearchButton.disabled = true;
  setAcademicHistorySearchMessage("Loading academic history records...", "warning");

  try {
    const response = await fetch(buildAcademicHistorySearchUrl(), {
      headers: {
        ...getAuthHeaders()
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Unable to load academic history records.");
    }

    state.academicHistoryList = payload.items || [];
    renderAcademicHistoryList(state.academicHistoryList);
    setAcademicHistorySearchMessage(
      `Loaded ${payload.total} academic history record(s).`,
      payload.total ? "success" : "warning"
    );
  } catch (error) {
    state.academicHistoryList = [];
    renderAcademicHistoryList([]);
    setAcademicHistorySearchMessage(error.message, "error");
  } finally {
    elements.academicHistorySearchButton.disabled = false;
  }
}

function resetAcademicHistorySearch() {
  elements.academicHistorySearchForm.reset();
  state.academicHistoryList = [];
  renderAcademicHistoryList([]);
  setAcademicHistorySearchMessage(
    "Academic history search reset. Enter a student name, reference ID, or index number to search again.",
    "warning"
  );
}

async function handleAcademicHistoryPreview(event) {
  event?.preventDefault();
  state.activeModule = "registry";
  state.activeSection = "history";
  renderModuleShell();

  elements.academicHistoryPreviewButton.disabled = true;
  elements.academicHistoryImportButton.disabled = true;
  setAcademicHistoryMessage("Generating CWA import preview...", "warning");

  try {
    const payload = await postAcademicHistoryImport("/api/students/history/import/preview");
    state.academicHistoryPreview = payload;
    state.lastAcademicHistoryImport = null;
    renderAcademicHistorySummary(payload.summary || {});
    renderAcademicHistoryValidRows(payload.rows || []);
    renderAcademicHistoryIssues(payload.rows || []);
    renderAcademicHistoryImportResults(null);
    elements.academicHistoryImportButton.disabled = (payload.summary?.validRows || 0) === 0;

    const sampleNote = payload.truncated
      ? ` Showing ${payload.returnedRows} sample row(s) in the preview table and issue list.`
      : "";
    setAcademicHistoryMessage(
      `Preview ready. ${payload.summary?.validRows || 0} row(s) are ready to import, ${payload.summary?.unmatchedRows || 0} row(s) are unmatched, and ${payload.summary?.nameMismatchRows || 0} row(s) need name review.${sampleNote}`,
      (payload.summary?.invalidRows || 0) > 0 || (payload.summary?.nameMismatchRows || 0) > 0
        ? "warning"
        : "success"
    );
  } catch (error) {
    setAcademicHistoryMessage(error.message, "error");
  } finally {
    elements.academicHistoryPreviewButton.disabled = false;
  }
}

async function handleAcademicHistoryImport() {
  state.activeModule = "registry";
  state.activeSection = "history";
  renderModuleShell();

  elements.academicHistoryPreviewButton.disabled = true;
  elements.academicHistoryImportButton.disabled = true;
  setAcademicHistoryMessage("Importing matched CWA rows into academic history...", "warning");

  try {
    const payload = await postAcademicHistoryImport("/api/students/history/import");
    state.lastAcademicHistoryImport = payload;
    renderAcademicHistoryImportResults(payload);
    renderAcademicHistorySummary({
      totalRows: payload.summary?.totalRows || 0,
      matchedRows: payload.preview?.summary?.matchedRows || payload.summary?.importedRows || 0,
      validRows: payload.summary?.importedRows || 0,
      missingCwaRows: payload.preview?.summary?.missingCwaRows || 0,
      nameMismatchRows: payload.preview?.summary?.nameMismatchRows || 0,
      existingAcademicHistoryRecords:
        payload.preview?.summary?.existingAcademicHistoryRecords ??
        state.registryStats.existingAcademicHistoryRecords
    });

    const sampleNote =
      payload.importedRowsTruncated || payload.rejectedRowsTruncated
        ? ` Displaying the first ${payload.importedRowsReturned} imported row(s) and ${payload.rejectedRowsReturned} rejected row(s).`
        : "";
    setAcademicHistoryMessage(
      `Academic history import complete. ${payload.summary?.importedRows || 0} row(s) imported and ${payload.summary?.rejectedRows || 0} row(s) rejected.${sampleNote}`,
      (payload.summary?.rejectedRows || 0) > 0 ? "warning" : "success"
    );

    const currentStudentReferenceId = elements.academicHistorySearchReferenceId.value.trim();
    const currentIndexNumber = elements.academicHistorySearchIndexNumber.value.trim();
    const currentQuery = elements.academicHistorySearchQuery.value.trim();
    if (currentStudentReferenceId || currentIndexNumber || currentQuery) {
      await loadAcademicHistory();
    }
    await loadApplicationsList();
    await refreshApplicationReviewWorkspace();
    if (state.selectedApplicationId) {
      await selectApplicationForReview(state.selectedApplicationId);
    }
    await loadRegistryStats();
  } catch (error) {
    setAcademicHistoryMessage(error.message, "error");
  } finally {
    elements.academicHistoryPreviewButton.disabled = false;
    elements.academicHistoryImportButton.disabled =
      !state.academicHistoryPreview || (state.academicHistoryPreview.summary?.validRows || 0) === 0;
  }
}

async function handlePreview(event) {
  event.preventDefault();
  state.activeModule = "registry";
  state.activeSection = "import";
  renderModuleShell();

  elements.previewButton.disabled = true;
  elements.importButton.disabled = true;
  setMessage("Generating import preview...", "warning");

  try {
    const payload = await postImport("/api/students/import/preview");
    state.duplicateResolutions = Object.fromEntries(
      (payload.duplicateCases || [])
        .filter((item) => Number(item.selectedRowNumber) > 0)
        .map((item) => [item.id, Number(item.selectedRowNumber)])
    );
    state.preview = payload;
    renderSummary(payload.summary);
    renderValidRows(payload.rows);
    renderIssues(payload.rows);
    renderDuplicateCases(payload.duplicateCases || []);
    renderImportResults(state.lastImport);
    elements.importButton.disabled = payload.summary.validRows === 0;
    const sampleNote = payload.truncated
      ? ` Showing ${payload.returnedRows} sample row(s) in the preview table and issue list.`
      : "";
    setMessage(
      `Preview ready. ${payload.summary.validRows} valid row(s), ${payload.summary.invalidRows} invalid row(s), and ${payload.existingMatchCount || 0} row(s) already matched the registry.${sampleNote}`,
      payload.summary.invalidRows > 0 ? "warning" : "success"
    );
    await requestSession();
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    elements.previewButton.disabled = false;
  }
}

async function handleImport() {
  state.activeModule = "registry";
  state.activeSection = "import";
  renderModuleShell();

  elements.importButton.disabled = true;
  elements.previewButton.disabled = true;
  setMessage("Importing valid rows into the student registry...", "warning");

  try {
    const payload = await postImport("/api/students/import");
    state.lastImport = payload;
    renderImportResults(payload);
    renderSummary({
      totalRows: payload.summary.totalRows,
      validRows: payload.summary.importedRows,
      invalidRows: payload.summary.rejectedRows,
      existingRegistryStudents: payload.preview?.summary?.existingRegistryStudents ?? 0
    });
    const sampleNote =
      payload.importedRowsTruncated || payload.rejectedRowsTruncated
        ? ` Displaying the first ${payload.importedRowsReturned} imported row(s) and ${payload.rejectedRowsReturned} rejected row(s).`
        : "";
    const skippedNote = payload.summary.skippedExistingRows
      ? ` ${payload.summary.skippedExistingRows} existing row(s) were skipped in this import mode.`
      : "";
    setMessage(
      `Import complete. ${payload.summary.importedRows} row(s) imported and ${payload.summary.rejectedRows} row(s) rejected.${skippedNote}${sampleNote}`,
      payload.summary.rejectedRows > 0 ? "warning" : "success"
    );
    renderDuplicateCases(payload.preview?.duplicateCases || []);
    await requestSession();
    await loadRegistryStats();
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    elements.previewButton.disabled = false;
    elements.importButton.disabled = false;
  }
}

async function handleApplicationsPreview(event) {
  event?.preventDefault();
  state.activeModule = "applications";
  state.activeApplicationsSection = "import";
  renderModuleShell();

  elements.applicationPreviewButton.disabled = true;
  elements.applicationImportButton.disabled = true;
  setApplicationsMessage("Generating applications preview...", "warning");

  try {
    const payload = await postApplicationsImport("/api/applications/import/preview");
    state.resolvedApplicationIssueRows = {};
    resetApplicationIssueForm();
    state.applicationPreview = payload;
    renderApplicationsSummary(payload.summary);
    renderApplicationsValidRows(payload.rows || []);
    renderApplicationsIssues(payload.rows || []);
    renderApplicationIssueEditorList();
    renderApplicationsImportResults(state.lastApplicationsImport);
    elements.applicationImportButton.disabled = payload.summary.validRows === 0;
    await loadApplicationIssueQueue();
    const sampleNote = payload.truncated
      ? ` Showing ${payload.returnedRows} sample row(s) in the preview tables.`
      : "";
    setApplicationsMessage(
      `Preview ready. ${payload.summary.validRows} row(s) are ready to import and ${payload.summary.invalidRows} row(s) need attention.${sampleNote}`,
      payload.summary.invalidRows > 0 ? "warning" : "success"
    );
  } catch (error) {
    setApplicationsMessage(error.message, "error");
  } finally {
    elements.applicationPreviewButton.disabled = false;
  }
}

async function handleApplicationsImport() {
  state.activeModule = "applications";
  state.activeApplicationsSection = "import";
  renderModuleShell();

  elements.applicationPreviewButton.disabled = true;
  elements.applicationImportButton.disabled = true;
  setApplicationsMessage("Importing valid application rows...", "warning");

  try {
    const payload = await postApplicationsImport("/api/applications/import");
    state.lastApplicationsImport = payload;
    renderApplicationsImportResults(payload);
    renderApplicationsSummary({
      totalRows: payload.summary.totalRows,
      matchedRows: payload.summary.importedRows,
      validRows: payload.summary.importedRows,
      nameMismatchRows: payload.preview?.summary?.nameMismatchRows || 0,
      screeningQualifiedRows: payload.preview?.summary?.screeningQualifiedRows || 0,
      screeningPendingRows: payload.preview?.summary?.screeningPendingRows || 0,
      screeningDisqualifiedRows: payload.preview?.summary?.screeningDisqualifiedRows || 0
    });
    const sampleNote =
      payload.importedRowsTruncated || payload.rejectedRowsTruncated
        ? ` Displaying the first ${payload.importedRowsReturned} imported row(s) and ${payload.rejectedRowsReturned} rejected row(s).`
        : "";
      setApplicationsMessage(
        `Applications import complete. ${payload.summary.importedRows} row(s) imported and ${payload.summary.rejectedRows} row(s) rejected.${sampleNote}`,
        payload.summary.rejectedRows > 0 ? "warning" : "success"
      );
      await loadApplicationIssueQueue();
      await loadApplicationsList();
      await refreshApplicationReviewWorkspace();
      await loadDashboard();
  } catch (error) {
    setApplicationsMessage(error.message, "error");
  } finally {
    elements.applicationPreviewButton.disabled = false;
    elements.applicationImportButton.disabled =
      !state.applicationPreview || state.applicationPreview.summary.validRows === 0;
  }
}

async function applyDuplicateResolutions() {
  if (!state.preview) {
    setDuplicateResolutionMessage("Run a preview first before applying duplicate decisions.", "error");
    return;
  }

  elements.applyDuplicateResolutionButton.disabled = true;
  setDuplicateResolutionMessage("Refreshing preview with the selected duplicate decisions...", "warning");

  try {
    await handlePreview(new Event("submit"));
  } finally {
    elements.applyDuplicateResolutionButton.disabled = false;
  }
}

async function autoResolveDuplicates() {
  const duplicateCases = state.preview?.duplicateCases || [];
  if (!duplicateCases.length) {
    setDuplicateResolutionMessage("No duplicate groups are available for automatic resolution.", "warning");
    return;
  }

  const resolutions = {};
  for (const duplicateCase of duplicateCases) {
    const preferredRowNumber = choosePreferredDuplicateRow(duplicateCase);
    if (preferredRowNumber) {
      resolutions[duplicateCase.id] = preferredRowNumber;
    }
  }

  state.duplicateResolutions = {
    ...state.duplicateResolutions,
    ...resolutions
  };

  setDuplicateResolutionMessage(
    `Automatic duplicate resolution selected keep rows for ${Object.keys(resolutions).length} duplicate group(s). Refreshing the preview now.`,
    "warning"
  );

  await applyDuplicateResolutions();
}

async function handleClearRegistry() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    setMessage("Enter the API URL first.", "error");
    return;
  }

  const confirmation = window.prompt(
    "Type CLEAR REGISTRY to remove all student registry records and linked student workflows."
  );

  if (confirmation === null) {
    setMessage("Registry clear cancelled.", "warning");
    return;
  }

  if (confirmation.trim().toUpperCase() !== "CLEAR REGISTRY") {
    setMessage("Registry clear cancelled because the confirmation text did not match.", "error");
    return;
  }

  elements.clearRegistryButton.disabled = true;
  elements.previewButton.disabled = true;
  elements.importButton.disabled = true;
  setMessage("Clearing the registry and linked student records...", "warning");

  try {
    const response = await fetch(`${apiBaseUrl}/api/students/clear`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        confirmation: "CLEAR REGISTRY"
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "The clear registry request failed.");
    }

    resetRegistryWorkspace();
    resetAcademicHistoryWorkspace();
    state.academicHistoryList = [];
    renderAcademicHistoryList([]);
    setSearchMessage("Registry is now empty. Search results will appear here after new imports.", "warning");
    setAcademicHistorySearchMessage(
      "Registry is now empty. Academic history will appear here after new student and CWA imports.",
      "warning"
    );
    setFlagReviewMessage(
      "Registry is now empty. Load flagged records again after new student data is imported.",
      "warning"
    );
    setMessage(
      `${payload.message} Also removed ${payload.summary.applications} application record(s), ${payload.summary.awards} award record(s), and ${payload.summary.supportApplications} support application record(s).`,
      "success"
    );
    state.registryStats = {
      existingRegistryStudents: 0,
      existingAcademicHistoryRecords: 0
    };
    renderSummary({
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      existingRegistryStudents: state.registryStats.existingRegistryStudents
    });
    renderAcademicHistorySummary({
      totalRows: 0,
      matchedRows: 0,
      validRows: 0,
      missingCwaRows: 0,
      nameMismatchRows: 0,
      existingAcademicHistoryRecords: 0
    });
    await requestSession();
  } catch (error) {
    setMessage(error.message, "error");
    syncRegistryAdminControls();
  } finally {
    elements.previewButton.disabled = false;
    elements.importButton.disabled = !state.preview || state.preview.summary.validRows === 0;
    syncRegistryAdminControls();
  }
}

function bindEvents() {
  elements.loginForm?.addEventListener("submit", (event) => {
    void handleLoginSubmit(event);
  });
  elements.logoutButton?.addEventListener("click", () => {
    void handleLogout();
  });
  elements.loginApiUrl?.addEventListener("change", () => {
    elements.apiUrl.value = String(elements.loginApiUrl.value || "").trim();
    persistConnectionState();
  });
  elements.accessManagementForm?.addEventListener("submit", (event) => {
    void handleAccessManagementSubmit(event);
  });
  elements.accessManagementList?.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-access-action]");
    if (actionButton) {
      void handleAccessAction(actionButton);
    }
  });
  for (const button of elements.themeButtons) {
    button.addEventListener("click", () => setTheme(button.dataset.themeChoice));
  }

  for (const button of elements.tokenButtons) {
    button.addEventListener("click", () => {
      elements.authToken.value = button.dataset.token || "";
      persistConnectionState();
      syncTokenPresetButtons();
      void requestSession({ reloadData: true });
    });
  }

    for (const navItem of elements.navItems) {
      navItem.addEventListener("click", () => {
        state.activeModule = navItem.dataset.module;
        if (state.activeModule !== "registry") {
          state.activeSection = "import";
        }
        renderModuleShell();
          if (state.activeModule === "dashboard") {
            void loadDashboard();
          }
          if (state.activeModule === "applications") {
              void loadApplicationOptions();
              void loadApplicationsList();
              void refreshApplicationReviewWorkspace();
              void loadApplicationCriteria();
              void loadApplicationMessagingSettings();
              void loadApplicationMessagingHistory();
              renderSchemePanelVisibility();
              renderCriteriaPanelVisibility();
              renderApplicationsRegistryVisibility();
              renderApplicationReviewVisibility();
          }
        if (state.activeModule === "awards") {
          void loadBeneficiaryRecords();
        }
        if (state.activeModule === "waitlist") {
          void loadApplicationOptions();
          void loadRecommendedRecords();
        }
        if (state.activeModule === "support") {
          void loadSupportFoodBankRecords();
        }
        if (state.activeModule === "reports") {
          void loadReportsOverview();
        }
      });
    }

  for (const tab of elements.moduleTabs) {
    tab.addEventListener("click", () => {
      state.activeModule = "registry";
      state.activeSection = tab.dataset.section;
      renderModuleShell();
    });
  }

  for (const tab of elements.applicationTabButtons) {
    tab.addEventListener("click", () => {
      state.activeModule = "applications";
      state.activeApplicationsSection = tab.dataset.applicationSection;
      renderModuleShell();
    });
  }

  for (const tab of elements.beneficiaryTabButtons) {
    tab.addEventListener("click", () => {
      state.activeModule = "awards";
      state.activeBeneficiarySection = tab.dataset.beneficiarySection;
      renderModuleShell();
      if (state.activeBeneficiarySection === "beneficiaries") {
        void loadBeneficiaryRecords();
      }
    });
  }

  elements.dashboardBeneficiaryHistoricalToggleButton?.addEventListener("click", () => {
    state.dashboardBeneficiaryHistoricalHidden = !state.dashboardBeneficiaryHistoricalHidden;
    renderDashboardBeneficiaryHistoricalVisibility();
  });

  elements.studentFile.addEventListener("change", () => {
    const files = Array.from(elements.studentFile.files || []);
    elements.selectedFileName.textContent = files.length
      ? files.length === 1
        ? `${files[0].name} (${Math.max(1, Math.round(files[0].size / 1024))} KB)`
        : `${files.length} files selected for merged registry import`
      : "No file selected yet";
    state.preview = null;
    state.lastImport = null;
    state.duplicateResolutions = {};
    elements.importButton.disabled = true;
    renderSummary({
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      existingRegistryStudents: state.registryStats.existingRegistryStudents
    });
    renderValidRows([]);
    renderIssues([]);
    renderDuplicateCases([]);
    renderImportResults(null);
  });
  elements.studentImportMode.addEventListener("change", () => {
    state.preview = null;
    state.lastImport = null;
    state.duplicateResolutions = {};
    elements.importButton.disabled = true;
    renderSummary({
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      existingRegistryStudents: state.registryStats.existingRegistryStudents
    });
    renderValidRows([]);
    renderIssues([]);
    renderDuplicateCases([]);
    renderImportResults(null);
    setMessage(
      "Import mode updated. Run a new preview to refresh the registry counts and row handling.",
      "warning"
    );
  });

  elements.academicHistoryFile.addEventListener("change", () => {
    const files = Array.from(elements.academicHistoryFile.files || []);
    elements.selectedAcademicHistoryFileName.textContent = files.length
      ? files.length === 1
        ? `${files[0].name} (${Math.max(1, Math.round(files[0].size / 1024))} KB)`
        : `${files.length} CWA workbooks selected for history import`
      : "No CWA workbook selected yet";
    state.academicHistoryPreview = null;
    state.lastAcademicHistoryImport = null;
    elements.academicHistoryImportButton.disabled = true;
    renderAcademicHistorySummary({
      totalRows: 0,
      matchedRows: 0,
      validRows: 0,
      missingCwaRows: 0,
      nameMismatchRows: 0,
      existingAcademicHistoryRecords: state.registryStats.existingAcademicHistoryRecords
    });
    renderAcademicHistoryValidRows([]);
    renderAcademicHistoryIssues([]);
    renderAcademicHistoryImportResults(null);
  });

  elements.importForm.addEventListener("submit", handlePreview);
  elements.importButton.addEventListener("click", () => {
    void handleImport();
  });
  elements.academicHistoryImportForm.addEventListener("submit", (event) => {
    void handleAcademicHistoryPreview(event);
  });
  elements.academicHistoryImportButton.addEventListener("click", () => {
    void handleAcademicHistoryImport();
  });
  elements.applicationsImportForm.addEventListener("submit", (event) => {
    void handleApplicationsPreview(event);
  });
  elements.beneficiaryImportForm?.addEventListener("submit", (event) => {
    void handleBeneficiaryPreview(event);
  });
  elements.beneficiaryFilterForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void loadBeneficiaryRecords();
  });
  elements.beneficiaryClearScopedButton?.addEventListener("click", () => {
    void handleClearBeneficiaryScope();
  });
  elements.reportsBeneficiaryAcademicYear?.addEventListener("change", syncReportsBeneficiarySchemeControls);
  elements.reportsBeneficiarySchemeName?.addEventListener("change", syncReportsBeneficiarySchemeControls);
  elements.reportsBeneficiarySchemeForm?.addEventListener("submit", (event) => {
    void loadReportsBeneficiarySchemeReport(event);
  });
  elements.reportsBeneficiarySummaryExportButton?.addEventListener("click", () => {
    void exportReportsBeneficiarySummary();
  });
  elements.reportsBeneficiaryExportButton?.addEventListener("click", () => {
    void exportReportsBeneficiaryScheme();
  });
  elements.applicationInterviewImportForm.addEventListener("submit", (event) => {
    void handleApplicationInterviewPreview(event);
  });
  elements.schemeForm.addEventListener("submit", (event) => {
    void saveScheme(event);
  });
  elements.applicationImportButton.addEventListener("click", () => {
    void handleApplicationsImport();
  });
  elements.beneficiaryImportButton?.addEventListener("click", () => {
    void handleBeneficiaryImport();
  });
  elements.recommendedCreateForm?.addEventListener("submit", (event) => {
    void handleRecommendedCreate(event);
  });
  elements.recommendedStudentReferenceId?.addEventListener("input", () => {
    scheduleRecommendedStudentPreviewLookup();
  });
  elements.recommendedStudentReferenceId?.addEventListener("blur", () => {
    void lookupRecommendedStudentPreview(elements.recommendedStudentReferenceId?.value.trim() || "");
  });
  elements.supportFoodBankStudentReferenceId?.addEventListener("input", () => {
    scheduleSupportFoodBankPreviewLookup();
  });
  elements.supportFoodBankStudentReferenceId?.addEventListener("blur", () => {
    void lookupSupportFoodBankStudentPreview(
      elements.supportFoodBankStudentReferenceId?.value.trim() || ""
    );
  });
  elements.supportFoodBankForm?.addEventListener("submit", (event) => {
    void handleSupportFoodBankCreate(event);
  });
  elements.supportFoodBankCancelButton?.addEventListener("click", () => {
    resetSupportFoodBankForm();
  });
  elements.supportFoodBankImportForm?.addEventListener("submit", (event) => {
    void handleSupportFoodBankPreview(event);
  });
  elements.supportFoodBankImportButton?.addEventListener("click", () => {
    void handleSupportFoodBankImport();
  });
  elements.supportFoodBankFilterForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void loadSupportFoodBankRecords();
  });
  elements.supportFoodBankReloadButton?.addEventListener("click", () => {
    void loadSupportFoodBankRecords();
  });
  elements.supportFoodBankList?.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-food-bank-edit]");
    if (editButton) {
      beginSupportFoodBankEdit(editButton.getAttribute("data-food-bank-edit"));
      return;
    }

    const removeButton = event.target.closest("[data-food-bank-remove]");
    if (removeButton) {
      void handleSupportFoodBankRemove(removeButton.getAttribute("data-food-bank-remove"));
      return;
    }

    const servedButton = event.target.closest("[data-food-bank-served]");
    if (servedButton) {
      void handleSupportFoodBankMarkServed(
        servedButton.getAttribute("data-food-bank-served")
      );
    }
  });
  elements.recommendedCancelButton?.addEventListener("click", () => {
    resetRecommendedCreateForm();
  });
  elements.recommendedImportForm?.addEventListener("submit", (event) => {
    void handleRecommendedPreview(event);
  });
  elements.recommendedImportButton?.addEventListener("click", () => {
    void handleRecommendedImport();
  });
  elements.recommendedReloadButton?.addEventListener("click", () => {
    void loadRecommendedRecords();
  });
  elements.recommendedFilterForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void loadRecommendedRecords();
  });
  elements.recommendedSupportForm?.addEventListener("submit", (event) => {
    void handleRecommendedSupportHandoff(event);
  });
  elements.recommendedList?.addEventListener("click", (event) => {
    const applicationButton = event.target.closest("[data-recommended-application]");
    if (applicationButton) {
      void handleRecommendedApplicationHandoff(
        applicationButton.getAttribute("data-recommended-application")
      );
      return;
    }

    const beneficiaryButton = event.target.closest("[data-recommended-beneficiary]");
    if (beneficiaryButton) {
      const recordId = beneficiaryButton.getAttribute("data-recommended-beneficiary");
      selectRecommendedRecord(recordId);
      document.querySelector("#recommendedSupportForm")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
      return;
    }

    const selectButton = event.target.closest("[data-recommended-select]");
    if (selectButton) {
      selectRecommendedRecord(selectButton.getAttribute("data-recommended-select"));
      return;
    }

    const editButton = event.target.closest("[data-recommended-edit]");
    if (editButton) {
      beginRecommendedEdit(editButton.getAttribute("data-recommended-edit"));
      return;
    }

    const removeButton = event.target.closest("[data-recommended-remove]");
    if (removeButton) {
      void handleRecommendedRemove(removeButton.getAttribute("data-recommended-remove"));
    }
  });
  elements.recommendedFile?.addEventListener("change", () => {
    const files = Array.from(elements.recommendedFile.files || []);
    if (elements.selectedRecommendedFileName) {
      elements.selectedRecommendedFileName.textContent = files.length
        ? files.length === 1
          ? `${files[0].name} (${Math.max(1, Math.round(files[0].size / 1024))} KB)`
          : `${files.length} files selected for recommendation import`
        : "No file selected yet";
    }
    state.recommendedPreview = null;
    state.lastRecommendedImport = null;
    renderRecommendedPreviewSummary({});
    renderRecommendedPreview([]);
    syncRecommendedControls();
  });
  elements.supportFoodBankFile?.addEventListener("change", () => {
    const files = Array.from(elements.supportFoodBankFile.files || []);
    if (elements.selectedSupportFoodBankFileName) {
      elements.selectedSupportFoodBankFileName.textContent = files.length
        ? files.length === 1
          ? `${files[0].name} (${Math.max(1, Math.round(files[0].size / 1024))} KB)`
          : `${files.length} files selected for support import`
        : "No file selected yet";
    }
  });
  elements.schemeAcademicYearSelect?.addEventListener("change", () => {
    syncSchemeAcademicYearMode();
  });
  elements.applicationInterviewImportButton.addEventListener("click", () => {
    void handleApplicationInterviewImport();
  });
  elements.applicationCriteriaForm.addEventListener("submit", (event) => {
    void saveApplicationCriteria(event);
  });
  elements.applicationFile.addEventListener("change", () => {
    const files = Array.from(elements.applicationFile.files || []);
    elements.selectedApplicationFileName.textContent = files.length
      ? files.length === 1
        ? `${files[0].name} (${Math.max(1, Math.round(files[0].size / 1024))} KB)`
        : `${files.length} files selected for application import`
      : "No file selected yet";
    state.applicationPreview = null;
    state.lastApplicationsImport = null;
    state.resolvedApplicationIssueRows = {};
    elements.applicationImportButton.disabled = true;
    renderApplicationsSummary({
      totalRows: 0,
      matchedRows: 0,
      validRows: 0,
      nameMismatchRows: 0,
      screeningQualifiedRows: 0,
      screeningPendingRows: 0,
      screeningDisqualifiedRows: 0
    });
    renderApplicationsValidRows([]);
    renderApplicationsIssues([]);
      renderApplicationsImportResults(null);
      renderApplicationIssueEditorList();
      resetApplicationIssueForm();
    });
    elements.beneficiaryFile?.addEventListener("change", () => {
      const files = Array.from(elements.beneficiaryFile.files || []);
      elements.selectedBeneficiaryFileName.textContent = files.length
        ? files.length === 1
          ? `${files[0].name} (${Math.max(1, Math.round(files[0].size / 1024))} KB)`
          : `${files.length} files selected for beneficiary import`
        : "No file selected yet";
      state.beneficiaryPreview = null;
      state.lastBeneficiaryImport = null;
      state.beneficiaryDuplicateRowActions = {};
      renderBeneficiarySummary({});
      renderBeneficiaryValidRows([]);
      renderBeneficiaryIssues([]);
        renderBeneficiaryDuplicateReview([]);
        renderBeneficiaryImportResults(null);
        syncBeneficiaryControls();
      });
    elements.beneficiaryCohort?.addEventListener("change", () => {
      state.beneficiaryPreview = null;
      state.lastBeneficiaryImport = null;
      state.beneficiaryDuplicateRowActions = {};
      renderBeneficiarySummary({});
      renderBeneficiaryValidRows([]);
      renderBeneficiaryIssues([]);
      renderBeneficiaryDuplicateReview([]);
      renderBeneficiaryImportResults(null);
      syncBeneficiaryControls();
    });
    elements.beneficiaryImportCurrency?.addEventListener("change", () => {
      state.beneficiaryPreview = null;
      state.lastBeneficiaryImport = null;
      state.beneficiaryDuplicateRowActions = {};
      renderBeneficiarySummary({});
      renderBeneficiaryValidRows([]);
      renderBeneficiaryIssues([]);
      renderBeneficiaryDuplicateReview([]);
      renderBeneficiaryImportResults(null);
      setBeneficiaryImportMessage(
        elements.beneficiaryImportCurrency?.value
          ? `Rows without a currency column will now import as ${elements.beneficiaryImportCurrency.value}.`
          : "Currency will now come from the uploaded file, with GHS used only when a row leaves it blank.",
        "warning"
      );
      syncBeneficiaryControls();
    });
    elements.beneficiaryDuplicateStrategy?.addEventListener("change", () => {
      state.beneficiaryPreview = null;
      state.lastBeneficiaryImport = null;
      state.beneficiaryDuplicateStrategy = getBeneficiaryDuplicateStrategy();
      state.beneficiaryDuplicateRowActions = {};
      renderBeneficiarySummary({});
      renderBeneficiaryValidRows([]);
      renderBeneficiaryIssues([]);
      renderBeneficiaryDuplicateReview([]);
      renderBeneficiaryImportResults(null);
      setBeneficiaryImportMessage(
        `Duplicate beneficiary handling is now set to ${getBeneficiaryDuplicateStrategyLabel(
          state.beneficiaryDuplicateStrategy
        )}.`,
        "warning"
      );
      syncBeneficiaryControls();
    });
    elements.beneficiaryPreviewFilter?.addEventListener("change", () => {
        state.beneficiaryPreviewFilter = elements.beneficiaryPreviewFilter?.value || "all";
      renderBeneficiaryValidRows(state.beneficiaryPreview?.rows || []);
      renderBeneficiaryIssues(state.beneficiaryPreview?.rows || []);
    });
        elements.beneficiaryCategorizedByCollege?.addEventListener("change", () => {
        state.beneficiaryPreview = null;
        state.lastBeneficiaryImport = null;
        state.beneficiaryDuplicateRowActions = {};
      renderBeneficiarySummary({});
      renderBeneficiaryValidRows([]);
      renderBeneficiaryIssues([]);
      renderBeneficiaryDuplicateReview([]);
      renderBeneficiaryImportResults(null);
      setBeneficiaryImportMessage(
        elements.beneficiaryCategorizedByCollege.checked
          ? "College will now be required for every beneficiary row in this import."
          : "College is optional again for this beneficiary import.",
        "warning"
        );
        syncBeneficiaryControls();
      });
    elements.beneficiaryAcademicYearFilter?.addEventListener("change", () => {
      syncBeneficiaryControls();
      void loadBeneficiaryImportHistory();
      void loadBeneficiaryAuditFeed();
    });
    elements.beneficiarySchemeFilter?.addEventListener("change", () => {
      syncBeneficiaryControls();
      void loadBeneficiaryImportHistory();
      void loadBeneficiaryAuditFeed();
    });
    elements.beneficiaryAuditFilterForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      void loadBeneficiaryAuditFeed();
    });
    elements.beneficiaryList?.addEventListener("click", (event) => {
      const editButton = event.target.closest("[data-beneficiary-edit]");
      if (editButton) {
        void openBeneficiaryLifecycle(editButton.getAttribute("data-beneficiary-edit"));
        return;
      }

      const historyButton = event.target.closest("[data-beneficiary-history]");
      if (historyButton) {
        const recordId = historyButton.getAttribute("data-beneficiary-history");
        state.beneficiaryEditingRecordId = recordId;
        renderBeneficiaryEditor(recordId);
        setBeneficiaryRecordHistoryMessage("Loading beneficiary record history...", "warning");
        focusBeneficiaryLifecycleTarget("history");
        void loadBeneficiaryRecordHistory(recordId);
      }
    });
    elements.beneficiaryImportHistoryList?.addEventListener("click", (event) => {
      const rollbackButton = event.target.closest("[data-beneficiary-rollback]");
      if (!rollbackButton) return;
      void handleBeneficiaryBatchRollback(rollbackButton.getAttribute("data-beneficiary-rollback"));
    });
    elements.beneficiaryEditorForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      void handleBeneficiaryRowEdit(state.beneficiaryEditingRecordId);
    });
    elements.beneficiaryEditorDeleteButton?.addEventListener("click", () => {
      void handleBeneficiaryRowDelete(state.beneficiaryEditingRecordId);
    });
    elements.beneficiaryEditorCancelButton?.addEventListener("click", () => {
      state.beneficiaryEditingRecordId = null;
      state.beneficiaryRecordHistory = null;
      renderBeneficiaryEditor();
      renderBeneficiaryRecordHistory();
      setBeneficiaryEditorMessage("Beneficiary selection cleared.", "warning");
      setBeneficiaryRecordHistoryMessage(
        "Select a beneficiary row to load its import, update, replacement, and removal history.",
        "warning"
      );
    });
    elements.beneficiaryDuplicateReviewList?.addEventListener("change", (event) => {
      const select = event.target.closest("[data-beneficiary-duplicate-row]");
      if (!select) return;
      const rowNumber = Number(select.getAttribute("data-beneficiary-duplicate-row"));
      if (!rowNumber) return;
      state.beneficiaryDuplicateRowActions[rowNumber] = select.value;
      setBeneficiaryDuplicateReviewMessage(
        `Saved a row-level duplicate override for preview row ${rowNumber}.`,
        "success"
      );
    });
  elements.applicationInterviewFile.addEventListener("change", () => {
    const files = Array.from(elements.applicationInterviewFile.files || []);
    elements.selectedApplicationInterviewFileName.textContent = files.length
      ? files.length === 1
        ? `${files[0].name} (${Math.max(1, Math.round(files[0].size / 1024))} KB)`
        : `${files.length} files selected for interview import`
      : "No interview file selected yet";
    state.applicationInterviewPreview = null;
    state.lastApplicationInterviewImport = null;
    elements.applicationInterviewImportButton.disabled = true;
    renderApplicationInterviewSummary({
      totalRows: 0,
      matchedRows: 0,
      validRows: 0,
      invalidRows: 0
    });
    renderApplicationInterviewValidRows([]);
    renderApplicationInterviewIssues([]);
    renderApplicationInterviewImportResults(null);
  });
  elements.applicationsReloadButton.addEventListener("click", () => {
    void loadApplicationsList();
  });
  elements.applicationsToggleButton.addEventListener("click", () => {
    state.applicationsRegistryHidden = !state.applicationsRegistryHidden;
    renderApplicationsRegistryVisibility();
  });
  elements.applicationCwaCoverageToggleButton.addEventListener("click", () => {
    state.applicationCwaCoverageHidden = !state.applicationCwaCoverageHidden;
    renderApplicationCwaCoverageVisibility();
  });
    elements.applicationBulkInterviewToggleButton.addEventListener("click", () => {
      state.applicationBulkInterviewHidden = !state.applicationBulkInterviewHidden;
      renderApplicationBulkInterviewVisibility();
    });
    elements.applicationReviewToggleButton.addEventListener("click", () => {
      state.applicationReviewHidden = !state.applicationReviewHidden;
      renderApplicationReviewVisibility();
    });
  elements.applicationOutcomeForm.addEventListener("submit", (event) => {
      void applyBulkOutcomeUpdate(event);
    });
    elements.applicationMessagingPreviewButton.addEventListener("click", (event) => {
      void previewApplicationMessaging(event);
    });
    elements.applicationMessagingChannel.addEventListener("change", () => {
      state.applicationMessagingChannel = elements.applicationMessagingChannel.value || "email";
      state.applicationMessagingPreview = null;
      state.applicationMessagingDraftSubject = "";
      state.applicationMessagingDraftBody = "";
      state.applicationMessagingRecipientEdits = {};
      renderApplicationMessagingChannelOptions();
      renderApplicationMessagingSender();
      renderApplicationMessagingSummary(null);
      renderApplicationMessagingTemplate(null);
      renderApplicationMessagingRecipients(null);
      syncApplicationReviewControls();
      setApplicationMessagingMessage(
        `${formatMessagingChannelLabel(state.applicationMessagingChannel)} selected. Generate a fresh preview for this channel.`,
        "warning"
      );
    });
    elements.applicationMessagingLogButton.addEventListener("click", (event) => {
      void logApplicationMessagingBatch(event);
    });
    elements.applicationMessagingTemplateResetButton.addEventListener("click", () => {
      resetApplicationMessagingDraft();
      setApplicationMessagingMessage("Message draft reset to the default template.", "warning");
    });
    elements.applicationMessagingSubject.addEventListener("input", () => {
      updateApplicationMessagingDraftFromInputs();
    });
    elements.applicationMessagingBody.addEventListener("input", () => {
      updateApplicationMessagingDraftFromInputs();
    });
    elements.applicationMessagingRecipientList.addEventListener("input", (event) => {
      const input = event.target.closest("[data-application-messaging-contact-input]");
      if (!input) return;
      const applicationId = input.dataset.applicationMessagingContactInput;
      state.applicationMessagingRecipientEdits = {
        ...state.applicationMessagingRecipientEdits,
        [applicationId]: {
          ...(state.applicationMessagingRecipientEdits[applicationId] || {}),
          ...(state.applicationMessagingChannel === "email"
            ? { email: input.value }
            : { phone: input.value })
        }
      };
      renderApplicationMessagingSummary();
    });
    elements.applicationMessagingRecipientList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-application-messaging-save-contact]");
      if (!button) return;
      const applicationId = button.dataset.applicationMessagingSaveContact;
      void saveApplicationMessagingRecipientContact(applicationId);
    });
    elements.applicationMessagingHistoryList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-application-messaging-send]");
      if (button) {
        const batchId = button.dataset.applicationMessagingSend;
        void sendApplicationMessagingBatch(batchId);
        return;
      }
      const retryButton = event.target.closest("[data-application-messaging-resend]");
      if (!retryButton) return;
      const batchId = retryButton.dataset.applicationMessagingResend;
      void sendApplicationMessagingBatch(batchId, "failed_only");
    });
    elements.applicationReviewSaveButton.addEventListener("click", (event) => {
      void saveApplicationReview(event);
    });
  elements.applicationAcademicEntrySaveButton.addEventListener("click", (event) => {
    void saveApplicationAcademicEntry(event);
  });
  elements.applicationBulkInterviewApplyButton.addEventListener("click", (event) => {
    void applyBulkInterviewUpdate(event);
  });
  elements.applicationReviewDecision.addEventListener("change", () => {
    populateApplicationReviewReasonOptions(elements.applicationReviewDecision.value);
    syncApplicationReviewControls();
  });
  elements.applicationReviewUseRegistryData.addEventListener("change", () => {
    const application = getSelectedApplication();
    if (elements.applicationReviewUseRegistryData.checked && application) {
      elements.applicationReviewUploadedName.value = application.studentName || "";
      elements.applicationReviewUploadedReferenceId.value = application.studentReferenceId || "";
    } else if (application) {
      elements.applicationReviewUploadedName.value =
        application.uploadedFullName || application.studentName || "";
      elements.applicationReviewUploadedReferenceId.value =
        application.uploadedStudentReferenceId || application.studentReferenceId || "";
    }
    syncApplicationReviewControls();
  });
  elements.schemePanelToggleButton.addEventListener("click", () => {
    state.schemePanelHidden = !state.schemePanelHidden;
    renderSchemePanelVisibility();
  });
  elements.criteriaToggleButton.addEventListener("click", () => {
    state.criteriaPanelHidden = !state.criteriaPanelHidden;
    renderCriteriaPanelVisibility();
  });
  elements.schemeCancelButton.addEventListener("click", () => {
    resetSchemeForm();
    setSchemeMessage("Scheme edit cancelled.", "warning");
  });
  elements.applicationReviewSearchForm.addEventListener("submit", (event) => {
    void handleApplicationReviewSearch(event);
  });
  elements.applicationReviewSearchResetButton.addEventListener("click", resetApplicationReviewSearch);
  elements.applicationReviewResultsToggleButton.addEventListener("click", () => {
    state.applicationReviewResultsHidden = !state.applicationReviewResultsHidden;
    renderApplicationReviewResultsVisibility();
  });
  elements.applicationReviewResultsTopButton.addEventListener("click", () => {
    focusApplicationReviewSearch({
      searchForm: elements.applicationReviewSearchForm,
      searchInput: elements.applicationReviewSearchReference
    });
  });
  elements.singleApplicationLookupButton.addEventListener("click", () => {
    void handleSingleApplicationLookup();
  });
  elements.singleApplicationForm.addEventListener("submit", (event) => {
    void saveSingleApplication(event);
  });
  elements.applicationIssueLookupButton.addEventListener("click", () => {
    void handleApplicationIssueLookup();
  });
  elements.applicationIssueEditForm.addEventListener("submit", (event) => {
    void saveApplicationIssueCorrection(event);
  });
  elements.applicationSchemeSelect.addEventListener("change", () => {
    state.selectedApplicationId = null;
    renderSelectedApplicationReview();
    state.applicationMessagingPreview = null;
    state.applicationMessagingDraftSubject = "";
    state.applicationMessagingDraftBody = "";
    state.applicationMessagingRecipientEdits = {};
    renderApplicationMessagingSummary();
    renderApplicationMessagingTemplate();
    renderApplicationMessagingRecipients();
    state.applicationInterviewPreview = null;
    state.lastApplicationInterviewImport = null;
    elements.applicationInterviewImportButton.disabled = true;
    renderApplicationInterviewSummary({
      totalRows: 0,
      matchedRows: 0,
      validRows: 0,
      invalidRows: 0
    });
    renderApplicationInterviewValidRows([]);
    renderApplicationInterviewIssues([]);
    renderApplicationInterviewImportResults(null);
    syncApplicationReviewControls();
    void loadApplicationCriteria();
    void loadApplicationMessagingSettings();
    void loadApplicationIssueQueue();
    void loadApplicationsList();
    void refreshApplicationReviewWorkspace();
    void loadApplicationMessagingHistory();
  });
  elements.applicationCycleSelect.addEventListener("change", () => {
    state.selectedApplicationId = null;
    renderSelectedApplicationReview();
    state.applicationMessagingPreview = null;
    state.applicationMessagingDraftSubject = "";
    state.applicationMessagingDraftBody = "";
    state.applicationMessagingRecipientEdits = {};
    renderApplicationMessagingSummary();
    renderApplicationMessagingTemplate();
    renderApplicationMessagingRecipients();
    state.applicationInterviewPreview = null;
    state.lastApplicationInterviewImport = null;
    elements.applicationInterviewImportButton.disabled = true;
    renderApplicationInterviewSummary({
      totalRows: 0,
      matchedRows: 0,
      validRows: 0,
      invalidRows: 0
    });
    renderApplicationInterviewValidRows([]);
    renderApplicationInterviewIssues([]);
    renderApplicationInterviewImportResults(null);
    syncApplicationReviewControls();
    void loadApplicationCriteria();
    void loadApplicationMessagingSettings();
    void loadApplicationIssueQueue();
    void loadApplicationsList();
    void refreshApplicationReviewWorkspace();
    void loadApplicationMessagingHistory();
  });
  elements.applicationMessagingType.addEventListener("change", () => {
    state.applicationMessagingPreview = null;
    state.applicationMessagingDraftSubject = "";
    state.applicationMessagingDraftBody = "";
    state.applicationMessagingRecipientEdits = {};
    renderApplicationMessagingSummary();
    renderApplicationMessagingTemplate();
    renderApplicationMessagingRecipients();
    syncApplicationReviewControls();
    setApplicationMessagingMessage(
      "Message type updated. Generate a fresh preview for the current recipient group.",
      "warning"
    );
  });
  elements.applyDuplicateResolutionButton.addEventListener("click", () => {
    void applyDuplicateResolutions();
  });
  elements.autoResolveDuplicatesButton.addEventListener("click", () => {
    void autoResolveDuplicates();
  });
  elements.clearRegistryButton.addEventListener("click", () => {
    void handleClearRegistry();
  });
  elements.searchForm.addEventListener("submit", (event) => {
    void runSearch(event);
  });
  elements.searchResetButton.addEventListener("click", resetSearch);
  elements.academicHistorySearchForm.addEventListener("submit", (event) => {
    void loadAcademicHistory(event);
  });
  elements.academicHistorySearchResetButton.addEventListener("click", resetAcademicHistorySearch);
  elements.flagReviewForm.addEventListener("submit", (event) => {
    void runFlagReview(event);
  });
  elements.flagResetButton.addEventListener("click", resetFlagReview);
  elements.dashboardActivityToggleButton.addEventListener("click", () => {
    state.dashboardActivityHidden = !state.dashboardActivityHidden;
    renderDashboardActivityVisibility();
  });

    elements.apiUrl.addEventListener("change", () => {
      if (elements.loginApiUrl) {
        elements.loginApiUrl.value = elements.apiUrl.value;
      }
      persistConnectionState();
      void requestSession({ reloadData: true });
    });
    elements.authToken.addEventListener("change", () => {
      persistConnectionState();
      syncTokenPresetButtons();
      void requestSession({ reloadData: true });
    });
}

function init() {
  const sanitizedLoginUrl = getSanitizedLoginUrl(globalThis.location);
  if (sanitizedLoginUrl && globalThis.history?.replaceState) {
    globalThis.history.replaceState(null, "", sanitizedLoginUrl);
  }
  restoreConnectionState();
  sanitizeWorkspaceState();
  syncTokenPresetButtons();
  renderTheme();
  renderAccessShell();
  renderAccessUsers();
  renderModuleShell();
  renderDashboard();
  syncRegistryAdminControls();
  renderSummary({
    totalRows: 0,
    validRows: 0,
    invalidRows: 0,
    existingRegistryStudents: state.registryStats.existingRegistryStudents
  });
  renderSearchResults([]);
  renderStudentDetail(null);
  renderFlaggedResults([]);
  renderFlaggedDetail(null);
  renderAcademicHistorySummary({
    totalRows: 0,
    matchedRows: 0,
    validRows: 0,
    missingCwaRows: 0,
    nameMismatchRows: 0,
    existingAcademicHistoryRecords: state.registryStats.existingAcademicHistoryRecords
  });
  renderAcademicHistoryValidRows([]);
  renderAcademicHistoryIssues([]);
  renderAcademicHistoryList([]);
  renderAcademicHistoryImportResults(null);
  renderValidRows([]);
  renderIssues([]);
  renderDuplicateCases([]);
  renderImportResults(null);
  renderApplicationSelectors();
  renderApplicationsSummary({
    totalRows: 0,
    matchedRows: 0,
    validRows: 0,
    nameMismatchRows: 0,
    screeningQualifiedRows: 0,
    screeningPendingRows: 0,
    screeningDisqualifiedRows: 0
  });
  renderApplicationsValidRows([]);
  renderApplicationsIssues([]);
  renderApplicationsImportResults(null);
  renderApplicationsList([]);
  renderApplicationReviewResults([]);
  renderApplicationReviewSummary();
  renderApplicationOutcomeDistribution([]);
  renderApplicationOutcomeList([]);
  renderApplicationMessagingSummary();
  renderApplicationMessagingTemplate();
  renderApplicationMessagingRecipients();
  renderApplicationMessagingHistory([]);
  renderBeneficiarySummary({});
  renderBeneficiaryValidRows([]);
  renderBeneficiaryIssues([]);
  renderBeneficiaryDuplicateReview([]);
  if (elements.beneficiaryDuplicateStrategy) {
    elements.beneficiaryDuplicateStrategy.value = state.beneficiaryDuplicateStrategy || "skip";
  }
  if (elements.beneficiaryImportCurrency) {
    elements.beneficiaryImportCurrency.value = "";
  }
  if (elements.beneficiaryPreviewFilter) {
    elements.beneficiaryPreviewFilter.value = state.beneficiaryPreviewFilter || "all";
  }
  renderBeneficiaryImportResults(null);
  renderBeneficiaryFilterOptions();
  renderBeneficiaryRecords([]);
  renderBeneficiaryImportHistory([]);
  renderRecommendedSummary(state.recommendedSummary);
  renderRecommendedPreviewSummary({});
  renderRecommendedPreview([]);
  renderRecommendedRecords([]);
  renderRecommendedSelectedSummary();
  renderRecommendedManualPreview();
  renderRecommendedCreateFormState();
  renderSupportFoodBankAcademicYearOptions();
  renderSupportFoodBankManualPreview();
  renderSupportFoodBankCreateFormState();
  renderSupportFoodBankPreviewSummary();
  renderSupportFoodBankPreviewRows([]);
  renderSupportFoodBankFilterOptions();
  renderSupportFoodBankRecords([]);
  renderReportsOverview();
  renderReportsBeneficiarySchemeReport();
  syncReportsBeneficiarySchemeControls();
  renderApplicationMessagingSender();
  renderApplicationCwaCoverage();
  renderApplicationExportCards();
  renderApplicationAuditHistory([]);
  renderApplicationInterviewSummary({
    totalRows: 0,
    matchedRows: 0,
    validRows: 0,
    invalidRows: 0
  });
  renderApplicationInterviewValidRows([]);
  renderApplicationInterviewIssues([]);
  renderApplicationInterviewImportResults(null);
  renderApplicationCriteria(null);
  renderSelectedApplicationReview();
  renderSingleApplicationLookupSummary(null);
  renderApplicationIssueLookupSummary(null);
  renderApplicationIssueEditorList();
  populateApplicationReviewReasonOptions("");
  setApplicationReviewMetricsMessage(
    "Reviewer progress will appear here for the active scheme and academic year.",
    "warning"
  );
  setApplicationBulkInterviewMessage(
    "Apply shared interview details to every application in the selected scheme and academic year.",
    "warning"
  );
  setApplicationsMessage(
    "Choose the active scheme and academic year, then preview or import applications. Admin access is required for application imports.",
    "warning"
  );
  setApplicationCwaCoverageMessage(
    "Imported CWA coverage for the selected scheme and academic year will appear here.",
    "warning"
  );
  setApplicationExportMessage(
    "Only admins can export the qualified, pending, disqualified, or yet-to-review lists with registry-backed details and the latest CWA included.",
    "warning"
  );
  setApplicationOutcomeMessage(
    "Apply awarded or not-selected outcomes to the active review group from this workspace.",
    "warning"
  );
  setApplicationMessagingMessage(
      "Preview recipient groups from the active application list, then log controlled message batches from the configured sender.",
      "warning"
    );
  setBeneficiaryImportMessage(
      "Upload one or more beneficiary/support list files to preview and import them into Beneficiaries & Support. Support type should be included on every row; blank values will import as Unknown / other.",
      "warning"
    );
  setBeneficiaryDuplicateReviewMessage(
    "Duplicate rows and cross-scheme/year student ID warnings will appear here after preview.",
    "warning"
  );
    setBeneficiaryListMessage(
      "Load imported beneficiary records here and narrow them with search, year, support name, and support type filters.",
      "warning"
    );
  setBeneficiaryHistoryMessage(
    "Choose an academic year and support name to view beneficiary import history and roll back the latest batch if needed.",
    "warning"
  );
  setBeneficiaryEditorMessage(
    "Select a beneficiary row to edit its lifecycle details and review safe replacement or removal controls.",
    "warning"
  );
  setBeneficiaryRecordHistoryMessage(
    "Select a beneficiary row to load its import, update, replacement, and removal history.",
    "warning"
  );
  setBeneficiaryAuditMessage(
    "Choose an academic year and support name to review beneficiary lifecycle activity, including updates, replacements, clears, and rollback events.",
    "warning"
  );
  setReportsOverviewMessage(
    "Reporting overview will show beneficiary summary and college-aware support distribution once the API responds.",
    "warning"
  );
  setReportsBeneficiarySchemeMessage(
    "Choose a scheme and academic year to review per-college amounts and export the individual scheme workbook.",
    "warning"
  );
  setApplicationInterviewImportMessage(
    "Only admins can import interview scores by reference ID or index number, then match them into the active application list before exporting final outcomes.",
    "warning"
  );
  setApplicationAcademicEntryMessage(
    "Save or update academic standing values into academic history from the review workspace.",
    "warning"
  );
  setApplicationAuditHistoryMessage(
    "Select an application to load its review, messaging, and academic-standing history.",
    "warning"
  );
  setSingleApplicationMessage(
    "Search the registry by reference ID, confirm the student, then add the applicant into the active application list.",
    "warning"
  );
  setAcademicHistoryMessage(
    "Upload CWA workbooks to preview index-number matches, name mismatches, and the semester results that are ready to update academic history.",
    "warning"
  );
  setAcademicHistorySearchMessage(
    "Search academic history to review imported CWA records by student, reference ID, or index number.",
    "warning"
  );
  setApplicationIssueEditorMessage(
    "Correct unmatched rows here, confirm the registry student, and add them into the active application list.",
    "warning"
  );
  syncApplicationCriteriaControls();
  syncApplicationReviewControls();
  syncSchemeControls();
  renderSchemesList([]);
  renderSchemeFormState();
  renderSchemePanelVisibility();
  renderCriteriaPanelVisibility();
  renderApplicationsRegistryVisibility();
  renderApplicationReviewResultsVisibility();
  renderApplicationBulkInterviewVisibility();
  renderApplicationCwaCoverageVisibility();
  renderApplicationReviewVisibility();
  renderDashboardActivityVisibility();
  bindEvents();
  resetSchemeForm();
  void requestSession({ reloadData: true });
}

init();



/* ─────────────────────────────────────────────
   FIX 1 — Hamburger / mobile sidebar
   ───────────────────────────────────────────── */
(function initHamburger() {
  const toggleBtn = document.getElementById("sidebarToggle");
  const overlay   = document.getElementById("sidebarOverlay");
  const sidebar   = document.querySelector(".sidebar");
  if (!toggleBtn || !overlay || !sidebar) return;

  function openSidebar() {
    sidebar.classList.add("is-open");
    overlay.classList.add("is-visible");
    toggleBtn.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }

  function closeSidebar() {
    sidebar.classList.remove("is-open");
    overlay.classList.remove("is-visible");
    toggleBtn.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  toggleBtn.addEventListener("click", () => {
    sidebar.classList.contains("is-open") ? closeSidebar() : openSidebar();
  });

  overlay.addEventListener("click", closeSidebar);

  // Close when a nav item is chosen on mobile
  sidebar.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      if (window.innerWidth <= 960) closeSidebar();
    });
  });

  // Close on Escape key
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && sidebar.classList.contains("is-open")) closeSidebar();
  });
})();


/* ─────────────────────────────────────────────
   FIX 2 — Import flow stepper
   ───────────────────────────────────────────── */
(function initImportStepper() {
  const stepper = document.getElementById("applicationImportStepper");
  if (!stepper) return;

  const steps      = Array.from(stepper.querySelectorAll(".stepper-step"));
  const connectors = Array.from(stepper.querySelectorAll(".stepper-connector"));

  // Step mapping:
  // 1 = Set context (scheme + cycle selected)
  // 2 = Upload file
  // 3 = Preview rows (preview clicked successfully)
  // 4 = Resolve issues (issues exist and need attention) OR done
  // 5 = Import complete

  function setStepperStage(activeStep) {
    steps.forEach((step, i) => {
      const stepNum = i + 1;
      step.classList.remove("is-active", "is-done");
      if (stepNum < activeStep)       step.classList.add("is-done");
      else if (stepNum === activeStep) step.classList.add("is-active");
    });
    connectors.forEach((conn, i) => {
      conn.classList.toggle("is-done", i + 1 < activeStep);
    });
  }

  function computeStage() {
    // Step 5: import has been run
    if (state.lastApplicationsImport) return 5;

    // Step 4: preview done, now resolve or ready to import
    if (state.applicationPreview) return 4;

    // Step 3: file selected — user needs to hit Preview
    const appFile = document.getElementById("applicationFile");
    if (appFile && appFile.files && appFile.files.length > 0) return 3;

    // Step 2: context set (both scheme and cycle chosen)
    const schemeVal = document.getElementById("applicationSchemeSelect")?.value;
    const cycleVal  = document.getElementById("applicationCycleSelect")?.value;
    if (schemeVal && cycleVal) return 2;

    // Step 1: nothing chosen yet
    return 1;
  }

  function refreshStepper() {
    setStepperStage(computeStage());
  }

  // Initial render
  refreshStepper();

  // Hook into context selects
  ["applicationSchemeSelect", "applicationCycleSelect"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", refreshStepper);
  });

  // Hook into file input
  document.getElementById("applicationFile")?.addEventListener("change", refreshStepper);

  // Hook into Preview button success / Import button success
  // We poll state changes via a light MutationObserver on the message note
  const msgNote = document.getElementById("applicationsFormMessage");
  if (msgNote) {
    new MutationObserver(refreshStepper).observe(msgNote, { childList: true, characterData: true, subtree: true });
  }

  // Also expose globally so other handlers can trigger it
  window.refreshImportStepper = refreshStepper;
})();


/* ─────────────────────────────────────────────
   FIX 3 — Review metric colour accents
   Applied after renderApplicationReviewSummary runs.
   We patch the function to add semantic classes.
   ───────────────────────────────────────────── */
(function patchReviewSummaryRender() {
  const container = document.getElementById("applicationReviewSummaryCards");
  if (!container) return;

  new MutationObserver(() => {
    const cards = container.querySelectorAll(".metric-card");
    // Order rendered by renderApplicationReviewSummary:
    // 0=Reviewed, 1=Qualified, 2=Pending, 3=Disqualified, 4=Yet to review
    cards.forEach((card, i) => {
      card.classList.remove("is-success", "is-warning", "is-error");
      if (i === 1) card.classList.add("is-success");      // Qualified → green
      if (i === 2) card.classList.add("is-warning");      // Pending   → amber
      if (i === 3) card.classList.add("is-error");        // Disqualified → red
    });
  }).observe(container, { childList: true, subtree: true });
})();
