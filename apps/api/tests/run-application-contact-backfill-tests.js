import assert from "node:assert/strict";

import { createApplicationService } from "../src/modules/applications/service.js";

function createRepositories() {
  const student = {
    id: "student-1",
    fullName: "TETTEH Joy Dede",
    studentReferenceId: "22684353",
    email: null,
    phoneNumber: null,
    program: "Biochemistry",
    year: "2nd Year"
  };
  const application = {
    id: "application-1",
    studentId: "student-1",
    studentName: student.fullName,
    studentReferenceId: student.studentReferenceId,
    email: null,
    applicantEmail: null,
    phoneNumber: null,
    applicantPhone: null,
    studentPhoneNumber: null,
    schemeId: "scheme-1",
    cycleId: "cycle-1",
    status: "submitted",
    eligibilityStatus: "eligible",
    qualificationStatus: "qualified",
    reviewerNotes: null,
    uploadedFullName: student.fullName,
    uploadedStudentReferenceId: student.studentReferenceId,
    uploadedProgram: student.program,
    documentChecklist: [],
    nameMismatchFlag: false
  };
  const contactUpdates = [];
  const reviewUpdates = [];

  return {
    contactUpdates,
    reviewUpdates,
    repositories: {
      audit: {
        async record() {}
      },
      schemes: {
        async getById(id) {
          return String(id) === "scheme-1" ? { id, name: "SRC KBN Bursary" } : null;
        }
      },
      cycles: {
        async getById(id) {
          return String(id) === "cycle-1"
            ? { id, label: "2026/2027 Academic Year", academicYearLabel: "2026/2027" }
            : null;
        }
      },
      applicationCriteria: {
        async getBySchemeCycle() {
          return null;
        }
      },
      students: {
        async findExistingByIdentifierBatch() {
          return {
            byReferenceId: new Map([[student.studentReferenceId, [student]]])
          };
        },
        async updateContact(studentId, payload) {
          contactUpdates.push({ studentId, payload });
          Object.assign(student, payload);
          return { ...student };
        }
      },
      applications: {
        async findExistingForStudents() {
          return new Map([[student.id, application]]);
        },
        async replaceImportIssues() {
          return [];
        },
        async updateReview(id, input) {
          reviewUpdates.push({ id, input });
          application.status = input.status;
          application.eligibilityStatus = input.eligibilityStatus;
          application.applicantEmail = input.reviewerMetadata.applicantEmail;
          application.email = input.reviewerMetadata.applicantEmail;
          application.applicantPhone = input.reviewerMetadata.applicantPhone;
          application.phoneNumber = input.reviewerMetadata.applicantPhone;
          return { ...application };
        },
        async create() {
          throw new Error("existing application contact backfill should not create a duplicate");
        }
      }
    }
  };
}

async function existingApplicationCanBeBackfilledFromReimportedPhoneAndEmail() {
  const { repositories, contactUpdates, reviewUpdates } = createRepositories();
  const service = createApplicationService({ repositories });
  const payload = {
    schemeId: "scheme-1",
    cycleId: "cycle-1",
    importMode: "applications",
    rows: [
      {
        "REFERENCE NO.": "22684353",
        NAME: "TETTEH Joy Dede",
        EMAIL: "tettehjoy67@gmail.com",
        "Phone Number": "0241333439",
        PROGRAMME: "Biochemistry",
        YEAR: "2nd Year"
      }
    ]
  };

  const preview = await service.previewImport(payload);
  assert.equal(preview.summary.validRows, 1);
  assert.equal(preview.summary.invalidRows, 0);
  assert.match(preview.rows[0].warnings.join(" "), /contact/i);

  const result = await service.importRows(payload, {
    userId: "admin-1",
    fullName: "Admin User",
    roleCode: "admin"
  });

  assert.equal(result.summary.importedRows, 1);
  assert.equal(result.summary.rejectedRows, 0);
  assert.equal(reviewUpdates[0].input.reviewerMetadata.applicantPhone, "0241333439");
  assert.equal(reviewUpdates[0].input.reviewerMetadata.applicantEmail, "tettehjoy67@gmail.com");
  assert.deepEqual(contactUpdates, [
    {
      studentId: "student-1",
      payload: {
        email: "tettehjoy67@gmail.com",
        phoneNumber: "0241333439"
      }
    }
  ]);
}

await existingApplicationCanBeBackfilledFromReimportedPhoneAndEmail();

console.log("application-contact-backfill-tests: ok");
