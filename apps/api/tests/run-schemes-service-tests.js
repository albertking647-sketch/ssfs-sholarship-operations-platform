import assert from "node:assert/strict";

import { createSchemeService } from "../src/modules/schemes/service.js";

function createRepositories(overrides = {}) {
  const createdCycles = [];
  const cycles = [
    {
      id: "cycle-1",
      code: "2026-2027",
      label: "2026/2027 Academic Year",
      academicYearLabel: "2026/2027",
      status: "active"
    }
  ];
  const createdSchemes = [];

  const repositories = {
    cycles: {
      async list() {
        return [...cycles, ...createdCycles];
      },
      async getById(id) {
        return [...cycles, ...createdCycles].find((item) => item.id === id) || null;
      },
      async create(input) {
        const created = {
          id: `cycle-created-${createdCycles.length + 1}`,
          ...input
        };
        createdCycles.push(created);
        return created;
      }
    },
    schemes: {
      async list() {
        return [...createdSchemes];
      },
      async findByCode() {
        return null;
      },
      async create(input) {
        const created = {
          id: `scheme-${createdSchemes.length + 1}`,
          ...input
        };
        createdSchemes.push(created);
        return created;
      },
      async getById(id) {
        return createdSchemes.find((item) => item.id === id) || null;
      },
      async update(id, input) {
        const target = createdSchemes.find((item) => item.id === id);
        if (!target) return null;
        Object.assign(target, input);
        return target;
      }
    },
    ...overrides
  };

  return {
    repositories,
    createdCycles,
    createdSchemes
  };
}

async function manualAcademicYearCreatesCycleWhenMissing() {
  const { repositories, createdCycles, createdSchemes } = createRepositories();
  const service = createSchemeService({ repositories });

  await service.create({
    name: "Emergency Support Fund",
    category: "scholarship",
    academicYearLabel: "2029/2030"
  });

  assert.equal(createdCycles.length, 1);
  assert.equal(createdCycles[0].label, "2029/2030 Academic Year");
  assert.equal(createdCycles[0].academicYearLabel, "2029/2030");
  assert.equal(createdSchemes.length, 1);
  assert.equal(createdSchemes[0].cycleId, createdCycles[0].id);
}

async function manualAcademicYearReusesExistingCycle() {
  const { repositories, createdCycles, createdSchemes } = createRepositories();
  const service = createSchemeService({ repositories });

  await service.create({
    name: "SRC KBN",
    category: "scholarship",
    academicYearLabel: "2026/2027"
  });

  assert.equal(createdCycles.length, 0);
  assert.equal(createdSchemes.length, 1);
  assert.equal(createdSchemes[0].cycleId, "cycle-1");
}

async function main() {
  await manualAcademicYearCreatesCycleWhenMissing();
  await manualAcademicYearReusesExistingCycle();
  console.log("schemes-service-tests: ok");
}

main().catch((error) => {
  console.error("schemes-service-tests: failed");
  console.error(error);
  process.exit(1);
});
