export const roles = [
  {
    id: "role-admin",
    code: "admin",
    name: "Admin"
  },
  {
    id: "role-reviewer",
    code: "reviewer",
    name: "Reviewer"
  },
  {
    id: "role-auditor",
    code: "auditor",
    name: "Auditor"
  }
];

export const users = [
  {
    id: "user-admin",
    roleCode: "admin",
    fullName: "Platform Admin",
    email: "admin@example.test"
  },
  {
    id: "user-reviewer",
    roleCode: "reviewer",
    fullName: "Application Reviewer",
    email: "reviewer@example.test"
  },
  {
    id: "user-auditor",
    roleCode: "auditor",
    fullName: "Audit Officer",
    email: "auditor@example.test"
  }
];

export const funders = [
  {
    id: "funder-university-support",
    code: "USF",
    name: "University Support Fund"
  },
  {
    id: "funder-alumni-association",
    code: "ALUMNI",
    name: "Alumni Association"
  }
];

export const cycles = [
  {
    id: "cycle-2025-2026",
    code: "2025-2026",
    label: "2025/2026 Academic Year",
    academicYearLabel: "2025/2026"
  },
  {
    id: "cycle-2026-2027",
    code: "2026-2027",
    label: "2026/2027 Academic Year",
    academicYearLabel: "2026/2027"
  },
  {
    id: "cycle-2027-2028",
    code: "2027-2028",
    label: "2027/2028 Academic Year",
    academicYearLabel: "2027/2028"
  },
  {
    id: "cycle-2028-2029",
    code: "2028-2029",
    label: "2028/2029 Academic Year",
    academicYearLabel: "2028/2029"
  }
];

export const schemes = [
  {
    id: "scheme-merit-needs-2026",
    code: "MNS-2026",
    name: "Merit and Needs Scholarship",
    funderId: "funder-university-support",
    funder: "University Support Fund",
    category: "scholarship",
    cycleId: "cycle-2026-2027",
    cycle: "2026/2027",
    availableSlots: 120,
    filledSlots: 108,
    status: "active"
  },
  {
    id: "scheme-alumni-bursary-2026",
    code: "ALB-2026",
    name: "Alumni Bursary",
    funderId: "funder-alumni-association",
    funder: "Alumni Association",
    category: "bursary",
    cycleId: "cycle-2026-2027",
    cycle: "2026/2027",
    availableSlots: 60,
    filledSlots: 60,
    status: "active"
  }
];

export const supportPrograms = [
  {
    id: "support-food-bank",
    code: "FOOD-BANK",
    name: "Food Bank",
    category: "in_kind",
    status: "active"
  },
  {
    id: "support-emergency-fund",
    code: "EMERGENCY-FUND",
    name: "Emergency Support Fund",
    category: "cash_assistance",
    status: "active"
  }
];

export const students = [
  {
    id: "student-001",
    fullName: "Akosua Mensah",
    studentReferenceId: "20261234",
    indexNumber: "ENG/24/001",
    college: "Engineering",
    program: "Computer Engineering",
    year: "Year 2",
    gender: "Female",
    disabilityStatus: "None",
    phoneNumber: "+233200000001",
    email: "akosua.mensah@example.test",
    cwa: 78.45,
    wassceAggregate: null,
    cycleId: "cycle-2026-2027",
    activeSupportCount: 0,
    duplicateFlag: false,
    conflictFlag: false
  },
  {
    id: "student-002",
    fullName: "Kwame Arthur",
    studentReferenceId: "20264321",
    indexNumber: "SCI/24/015",
    college: "Science",
    program: "Biochemistry",
    year: "Year 1",
    gender: "Male",
    disabilityStatus: "None",
    phoneNumber: "+233200000002",
    email: "kwame.arthur@example.test",
    cwa: null,
    wassceAggregate: 10,
    cycleId: "cycle-2026-2027",
    activeSupportCount: 1,
    duplicateFlag: false,
    conflictFlag: true
  },
  {
    id: "student-003",
    fullName: "Esi Boateng",
    studentReferenceId: "20269991",
    indexNumber: "BUS/24/111",
    college: "Business",
    program: "Accounting",
    year: "Year 3",
    gender: "Female",
    disabilityStatus: "Physical",
    phoneNumber: "+233200000003",
    email: "esi.boateng@example.test",
    cwa: 74.1,
    wassceAggregate: null,
    cycleId: "cycle-2026-2027",
    activeSupportCount: 0,
    duplicateFlag: true,
    conflictFlag: false
  }
];

export const applications = [
  {
    id: "application-001",
    studentId: "student-001",
    schemeId: "scheme-merit-needs-2026",
    cycleId: "cycle-2026-2027",
    cycle: "2026/2027",
    status: "recommended",
    eligibilityStatus: "eligible",
    needCategory: "high",
    needScore: 91.2,
    finalScore: 87.5,
    recommendationStatus: "recommended",
    submittedAt: "2026-03-22T08:30:00.000Z",
    createdBy: "user-reviewer"
  },
  {
    id: "application-002",
    studentId: "student-003",
    schemeId: "scheme-merit-needs-2026",
    cycleId: "cycle-2026-2027",
    cycle: "2026/2027",
    status: "waitlisted",
    eligibilityStatus: "eligible",
    needCategory: "critical",
    needScore: 95.4,
    finalScore: 84.25,
    recommendationStatus: "waitlisted",
    submittedAt: "2026-03-25T11:10:00.000Z",
    createdBy: "user-reviewer"
  }
];

export const recommendations = [
  {
    id: "recommendation-001",
    applicationId: "application-001",
    finalScore: 87.5,
    priorityRank: 1,
    status: "recommended",
    recommendedAmount: 5000
  },
  {
    id: "recommendation-002",
    applicationId: "application-002",
    finalScore: 84.25,
    priorityRank: 2,
    status: "waitlisted",
    recommendedAmount: 5000
  }
];

export const waitlistEntries = [
  {
    id: "waitlist-001",
    recommendationId: "recommendation-002",
    applicationId: "application-002",
    studentId: "student-003",
    schemeId: "scheme-merit-needs-2026",
    cycleId: "cycle-2026-2027",
    cycle: "2026/2027",
    priorityRank: 1,
    needSeverity: "high",
    reason: "Eligible and recommended, but all award slots were occupied.",
    status: "waitlisted",
    createdBy: "user-reviewer"
  }
];

export const awards = [
  {
    id: "award-001",
    studentId: "student-002",
    applicationId: null,
    schemeId: "scheme-alumni-bursary-2026",
    cycleId: "cycle-2026-2027",
    approvedAmount: 3500,
    status: "active"
  }
];

export const payments = [
  {
    id: "payment-001",
    awardId: "award-001",
    paymentReference: "PAY-2026-001",
    amount: 3500,
    status: "completed"
  },
  {
    id: "payment-002",
    awardId: "award-001",
    paymentReference: "PAY-2026-002",
    amount: 1750,
    status: "pending"
  }
];

export const applicationCriteria = [
  {
    id: "criteria-001",
    schemeId: "scheme-merit-needs-2026",
    cycleId: "cycle-2026-2027",
    requiredDocuments: [
      "Admission Letter",
      "Results Slip",
      "Application Form",
      "Statement of Need"
    ],
    cwaCutoff: 70,
    wassceCutoff: 12,
    interviewRequired: true,
    notes: "Continuing students should meet the CWA threshold. First-year applicants should meet the WASSCE cut-off."
  }
];
