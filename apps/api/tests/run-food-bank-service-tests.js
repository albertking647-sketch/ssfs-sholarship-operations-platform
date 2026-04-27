import assert from "node:assert/strict";

import { createFoodBankRepository } from "../src/modules/foodBank/repository.js";
import { createFoodBankService } from "../src/modules/foodBank/service.js";

function createStudentRecord(overrides = {}) {
  return {
    id: "student-1",
    fullName: "Sample Student",
    studentReferenceId: "20260001",
    indexNumber: "IDX-1",
    email: "sample@example.com",
    college: "Engineering",
    program: "BSc. Engineering",
    year: "Year 2",
    ...overrides
  };
}

function createRepositories(student = createStudentRecord()) {
  return {
    foodBank: createFoodBankRepository({
      database: {
        enabled: false
      }
    }),
    students: {
      async findByIdentifiers({ studentReferenceId, indexNumber }) {
        if (
          String(studentReferenceId || "").trim() === String(student.studentReferenceId) ||
          String(indexNumber || "").trim() === String(student.indexNumber)
        ) {
          return [student];
        }
        return [];
      },
      async getById(id) {
        return String(id) === String(student.id) ? student : null;
      }
    }
  };
}

async function createUpdateServeRemoveFlowWorks() {
  const repositories = createRepositories();
  const service = createFoodBankService({ repositories });

  const created = await service.create(
    {
      academicYearLabel: "2026/2027",
      semester: "First Semester",
      studentReferenceId: "20260001",
      referralSource: "Office visit",
      supportTypes: ["food_support"]
    },
    { userId: "user-admin", fullName: "Platform Admin" }
  );

  assert.equal(created.fullName, "Sample Student");
  assert.equal(created.status, "registered");
  assert.deepEqual(created.supportTypes, ["food_support"]);
  assert.equal(created.semester, "first_semester");

  const updated = await service.update(
    created.id,
    {
      academicYearLabel: "2026/2027 Academic Year",
      semester: "Second Semester",
      studentReferenceId: "20260001",
      referralSource: "Counselor",
      supportTypes: ["food_support", "clothing_support"]
    },
    { userId: "user-admin", fullName: "Platform Admin" }
  );

  assert.equal(updated.referralSource, "Counselor");
  assert.deepEqual(updated.supportTypes, ["food_support", "clothing_support"]);
  assert.equal(updated.semester, "second_semester");

  const served = await service.markServed(created.id, {
    userId: "user-reviewer",
    fullName: "Food Bank Reviewer"
  });

  assert.equal(served.status, "served");
  assert.equal(served.servedByName, "Food Bank Reviewer");

  const removed = await service.remove(created.id);
  assert.equal(removed.removed, true);

  const listed = await service.list({});
  assert.equal(listed.total, 0);
}

async function reportSummaryIncludesCollegeBreakdown() {
  const repositories = createRepositories();
  const service = createFoodBankService({ repositories });

  await service.create(
    {
      academicYearLabel: "2026/2027",
      semester: "First Semester",
      studentReferenceId: "20260001",
      referralSource: "Office visit",
      supportTypes: ["food_support", "clothing_support"]
    },
    { userId: "user-admin", fullName: "Platform Admin" }
  );

  const summary = await service.getReportSummary("2026/2027 Academic Year");
  assert.equal(summary.currentYear.totalRegistered, 1);
  assert.equal(summary.currentYear.collegeBreakdown[0].college, "Engineering");
  assert.equal(summary.currentYear.supportTypeCounts.foodSupport, 1);
  assert.equal(summary.currentYear.supportTypeCounts.clothingSupport, 1);
  assert.equal(summary.currentYear.supportTypeCounts.both, 1);
}

async function allowsSameAcademicYearAcrossDifferentSemesters() {
  const repositories = createRepositories();
  const service = createFoodBankService({ repositories });

  const firstSemester = await service.create(
    {
      academicYearLabel: "2026/2027",
      semester: "First Semester",
      studentReferenceId: "20260001",
      referralSource: "Office visit",
      supportTypes: ["food_support"]
    },
    { userId: "user-admin", fullName: "Platform Admin" }
  );

  const secondSemester = await service.create(
    {
      academicYearLabel: "2026/2027",
      semester: "Second Semester",
      studentReferenceId: "20260001",
      referralSource: "Counselor",
      supportTypes: ["clothing_support"]
    },
    { userId: "user-admin", fullName: "Platform Admin" }
  );

  assert.equal(firstSemester.semester, "first_semester");
  assert.equal(secondSemester.semester, "second_semester");
  const listed = await service.list({});
  assert.equal(listed.total, 2);
}

async function main() {
  await createUpdateServeRemoveFlowWorks();
  await reportSummaryIncludesCollegeBreakdown();
  await allowsSameAcademicYearAcrossDifferentSemesters();
  console.log("food-bank-service-tests: ok");
}

main().catch((error) => {
  console.error("food-bank-service-tests: failed");
  console.error(error);
  process.exit(1);
});
