import assert from "node:assert/strict";

import { ConflictError } from "../src/lib/errors.js";
import { createWaitlistRepository } from "../src/modules/waitlist/repository.js";
import { createWaitlistService } from "../src/modules/waitlist/service.js";

function createSampleWaitlistRepository() {
  return createWaitlistRepository({
    database: {
      enabled: false
    }
  });
}

function createStudent(id, overrides = {}) {
  return {
    id,
    fullName: overrides.fullName || `Student ${id}`,
    studentReferenceId: overrides.studentReferenceId || `${id}`,
    indexNumber: overrides.indexNumber || null,
    email: overrides.email || null,
    college: overrides.college || null,
    program: overrides.program || null,
    year: overrides.year || null
  };
}

function createRepositories(overrides = {}) {
  const students = [
    createStudent("student-1", {
      fullName: "Amina Osei",
      studentReferenceId: "20260001",
      indexNumber: "ENG/26/001",
      email: "amina@example.com",
      college: "Engineering",
      program: "Mechanical Engineering",
      year: "Level 300"
    }),
    createStudent("student-2", {
      fullName: "Kojo Mensah",
      studentReferenceId: "20260002",
      indexNumber: "BUS/26/004",
      email: "kojo@example.com",
      college: "Humanities and Social Sciences",
      program: "Business Administration",
      year: "Level 200"
    })
  ];

  return {
    waitlist: createSampleWaitlistRepository(),
    students: {
      async findByIdentifiers(identifiers = {}) {
        return students.filter(
          (item) =>
            (identifiers.studentReferenceId &&
              item.studentReferenceId === identifiers.studentReferenceId) ||
            (identifiers.indexNumber && item.indexNumber === identifiers.indexNumber)
        );
      },
      async getById(id) {
        return students.find((item) => item.id === id) || null;
      }
    },
    schemes: {
      async list() {
        return [
          {
            id: "scheme-1",
            name: "Emergency Support Fund",
            academicYearLabel: "2026/2027 Academic Year",
            status: "active"
          },
          {
            id: "scheme-2",
            name: "SRC KBN",
            academicYearLabel: "2026/2027 Academic Year",
            status: "active"
          }
        ];
      }
    },
    cycles: {
      async list() {
        return [
          {
            id: "cycle-1",
            label: "2026/2027 Academic Year",
            academicYearLabel: "2026/2027 Academic Year",
            status: "active"
          }
        ];
      }
    },
    applications: {
      async findExisting() {
        return null;
      }
    },
    beneficiaries: {
      async list(filters = {}) {
        void filters;
        return [];
      },
      async findExistingDuplicateKeys() {
        return new Set();
      },
      async importRows({ items }) {
        return {
          batchReference: "beneficiary-batch-1",
          items: items.map((item, index) => ({
            id: `beneficiary-${index + 1}`,
            ...item
          }))
        };
      }
    },
    ...overrides
  };
}

function createServices(repositories, overrides = {}) {
  const applicationCreates = [];

  const services = {
    applications: {
      async create(payload) {
        applicationCreates.push(payload);
        return {
          id: `application-${applicationCreates.length}`,
          ...payload
        };
      }
    },
    ...overrides
  };

  return {
    services,
    applicationCreates
  };
}

async function manualCreateStoresAwaitingSupportRecommendation() {
  const repositories = createRepositories();
  const { services } = createServices(repositories);
  const service = createWaitlistService({ repositories, services });

  const created = await service.create(
    {
      studentReferenceId: "20260001",
      schemeId: "scheme-1",
      cycleId: "cycle-1",
      recommendationReason: "High-need case"
    },
    { userId: "user-admin", fullName: "Admin User" }
  );

  assert.equal(created.status, "awaiting_support");
  assert.equal(created.studentId, "student-1");
  assert.equal(created.schemeName, "Emergency Support Fund");
  assert.equal(created.cycleLabel, "2026/2027 Academic Year");
  assert.equal(created.program, "Mechanical Engineering");
  assert.equal(created.year, "Level 300");
}

async function listFallsBackToRegistryProgramAndYear() {
  const repositories = createRepositories({
    waitlist: {
      async list() {
        return [
          {
            id: "recommended-1",
            studentId: "student-1",
            fullName: "Amina Osei",
            studentReferenceId: "20260001",
            indexNumber: "ENG/26/001",
            email: "amina@example.com",
            college: "Engineering",
            program: null,
            year: null,
            schemeId: "scheme-1",
            schemeName: "Emergency Support Fund",
            cycleId: "cycle-1",
            cycleLabel: "2026/2027 Academic Year",
            recommendationReason: "Registry fallback test",
            notes: null,
            status: "awaiting_support",
            sourceType: "manual_add",
            sourceFileName: null,
            importBatchReference: null,
            linkedApplicationId: null,
            linkedBeneficiaryId: null,
            createdAt: "2026-04-22T00:00:00.000Z",
            updatedAt: "2026-04-22T00:00:00.000Z"
          }
        ];
      },
      async listFilterOptions() {
        return {
          academicYears: ["2026/2027 Academic Year"],
          schemeNames: ["Emergency Support Fund"],
          statuses: ["awaiting_support"]
        };
      }
    }
  });
  const { services } = createServices(repositories);
  const service = createWaitlistService({ repositories, services });

  const result = await service.list({});

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].program, "Mechanical Engineering");
  assert.equal(result.items[0].year, "Level 300");
}

async function previewImportFlagsUnknownStudents() {
  const repositories = createRepositories();
  const { services } = createServices(repositories);
  const service = createWaitlistService({ repositories, services });

  const preview = await service.previewImport({
    rows: [
      {
        "Academic Year": "2026/2027",
        "Student ID / Reference Number": "20260001",
        "Scheme Name": "Emergency Support Fund"
      },
      {
        "Academic Year": "2026/2027",
        "Student ID / Reference Number": "20269999",
        "Scheme Name": "Emergency Support Fund"
      }
    ]
  });

  assert.equal(preview.summary.validRows, 1);
  assert.equal(preview.summary.invalidRows, 1);
  assert.match(preview.rows[1].issues.join(" "), /could not match/i);
}

async function applicationHandoffBlocksDuplicateSchemeYearApplication() {
  const repositories = createRepositories({
    applications: {
      async findExisting(studentId, schemeId, cycleId) {
        if (
          studentId === "student-1" &&
          schemeId === "scheme-1" &&
          cycleId === "cycle-1"
        ) {
          return { id: "application-existing" };
        }
        return null;
      }
    }
  });
  const { services, applicationCreates } = createServices(repositories);
  const service = createWaitlistService({ repositories, services });

  const created = await service.create(
    {
      studentReferenceId: "20260001",
      schemeId: "scheme-1",
      cycleId: "cycle-1",
      recommendationReason: "Duplicate-block test"
    },
    { userId: "user-admin" }
  );

  await assert.rejects(
    service.handoffToApplication(created.id, { userId: "user-admin" }),
    (error) => error instanceof ConflictError
  );
  assert.equal(applicationCreates.length, 0);
}

async function applicationHandoffCreatesQualifiedApplicationAndLinksRecord() {
  const repositories = createRepositories();
  const { services, applicationCreates } = createServices(repositories);
  const service = createWaitlistService({ repositories, services });

  const created = await service.create(
    {
      studentReferenceId: "20260002",
      schemeId: "scheme-2",
      cycleId: "cycle-1",
      recommendationReason: "Ready for support consideration"
    },
    { userId: "user-admin" }
  );

  const result = await service.handoffToApplication(created.id, { userId: "user-admin" });

  assert.equal(applicationCreates.length, 1);
  assert.equal(applicationCreates[0].studentId, "student-2");
  assert.equal(applicationCreates[0].schemeId, "scheme-2");
  assert.equal(applicationCreates[0].cycleId, "cycle-1");
  assert.equal(applicationCreates[0].reviewDecision, "qualified");
  assert.equal(applicationCreates[0].recommendationStatus, "recommended_student");
  assert.equal(result.record.linkedApplicationId, "application-1");
  assert.equal(result.record.status, "awaiting_support");
}

async function updateRecommendationCanChangeRegistryMatchedStudentAndScheme() {
  const repositories = createRepositories();
  const { services } = createServices(repositories);
  const service = createWaitlistService({ repositories, services });

  const created = await service.create(
    {
      studentReferenceId: "20260001",
      schemeId: "scheme-1",
      cycleId: "cycle-1",
      recommendationReason: "Initial recommendation"
    },
    { userId: "user-admin", fullName: "Admin User" }
  );

  const updated = await service.update(
    created.id,
    {
      studentReferenceId: "20260002",
      schemeId: "scheme-2",
      cycleId: "cycle-1",
      recommendationReason: "Updated recommendation",
      notes: "Updated notes"
    },
    { userId: "user-admin", fullName: "Admin User" }
  );

  assert.equal(updated.studentId, "student-2");
  assert.equal(updated.studentReferenceId, "20260002");
  assert.equal(updated.schemeId, "scheme-2");
  assert.equal(updated.schemeName, "SRC KBN");
  assert.equal(updated.program, "Business Administration");
  assert.equal(updated.year, "Level 200");
  assert.equal(updated.recommendationReason, "Updated recommendation");
  assert.equal(updated.notes, "Updated notes");
}

async function removeRecommendationDeletesUnlinkedRecord() {
  const repositories = createRepositories();
  const { services } = createServices(repositories);
  const service = createWaitlistService({ repositories, services });

  const created = await service.create(
    {
      studentReferenceId: "20260001",
      schemeId: "scheme-1",
      cycleId: "cycle-1",
      recommendationReason: "Removal test"
    },
    { userId: "user-admin", fullName: "Admin User" }
  );

  const result = await service.remove(created.id, { userId: "user-admin", fullName: "Admin User" });

  assert.equal(result.removedId, created.id);
  assert.equal(await repositories.waitlist.getById(created.id), null);
}

async function beneficiaryHandoffMarksRecommendationAsSupported() {
  const repositories = createRepositories();
  const { services } = createServices(repositories);
  const service = createWaitlistService({ repositories, services });

  const created = await service.create(
    {
      studentReferenceId: "20260001",
      schemeId: "scheme-1",
      cycleId: "cycle-1",
      recommendationReason: "Beneficiary handoff"
    },
    { userId: "user-admin" }
  );

  const result = await service.handoffToBeneficiary(
    created.id,
    {
      amountPaid: 1500,
      supportType: "internal",
      beneficiaryCohort: "new",
      remarks: "Paid through recommendation pathway"
    },
    { userId: "user-admin" }
  );

  assert.equal(result.record.status, "supported");
  assert.equal(result.record.linkedBeneficiaryId, "beneficiary-1");
  assert.equal(result.beneficiary.amountPaid, 1500);
}

async function postgresListUsesAvailableAcademicProfileYearColumn() {
  const seenSelectStatements = [];
  const repository = createWaitlistRepository({
    database: {
      enabled: true,
      async query(sql) {
        const statement = String(sql);
        if (statement.includes("information_schema.columns")) {
          return {
            rows: [
              { column_name: "student_id" },
              { column_name: "cycle_id" },
              { column_name: "college" },
              { column_name: "program_name" },
              { column_name: "year_of_study" }
            ]
          };
        }

        if (statement.includes("FROM recommended_students rs")) {
          seenSelectStatements.push(statement);
          if (statement.includes("profile.year_value")) {
            throw new Error("Repository still queried the removed academic_profiles.year_value column.");
          }
          return {
            rows: [
              {
                id: "recommended-1",
                student_id: "student-1",
                full_name: "Amina Osei",
                student_reference_id: "20260001",
                index_number: "ENG/26/001",
                email: "amina@example.com",
                college: "Engineering",
                program: "Mechanical Engineering",
                year_of_study: "Level 300",
                scheme_id: "scheme-1",
                scheme_name: "Emergency Support Fund",
                cycle_id: "cycle-1",
                cycle_label: "2026/2027 Academic Year",
                recommendation_reason: "High-need case",
                notes: null,
                status: "awaiting_support",
                source_type: "manual_add",
                source_file_name: null,
                import_batch_reference: null,
                linked_application_id: null,
                linked_beneficiary_id: null,
                created_at: "2026-04-22T00:00:00.000Z",
                updated_at: "2026-04-22T00:00:00.000Z"
              }
            ]
          };
        }

        return { rows: [] };
      }
    }
  });

  const items = await repository.list({});

  assert.equal(items.length, 1);
  assert.equal(items[0].year, "Level 300");
  assert.equal(seenSelectStatements.length, 1);
}

async function main() {
  await manualCreateStoresAwaitingSupportRecommendation();
  await listFallsBackToRegistryProgramAndYear();
  await previewImportFlagsUnknownStudents();
  await applicationHandoffBlocksDuplicateSchemeYearApplication();
  await applicationHandoffCreatesQualifiedApplicationAndLinksRecord();
  await updateRecommendationCanChangeRegistryMatchedStudentAndScheme();
  await removeRecommendationDeletesUnlinkedRecord();
  await beneficiaryHandoffMarksRecommendationAsSupported();
  await postgresListUsesAvailableAcademicProfileYearColumn();
  console.log("recommended-students-service-tests: ok");
}

main().catch((error) => {
  console.error("recommended-students-service-tests: failed");
  console.error(error);
  process.exit(1);
});
