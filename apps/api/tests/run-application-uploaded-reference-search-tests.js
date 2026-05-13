import assert from "node:assert/strict";

import { createApplicationRepository } from "../src/modules/applications/repository.js";

function createCapturingDatabase() {
  const queries = [];

  return {
    enabled: true,
    queries,
    async query(sql, params = []) {
      const text = String(sql);
      queries.push({ sql: text, params });

      if (text.includes("information_schema.columns")) {
        return {
          rows: [
            { column_name: "year_of_study" },
            { column_name: "academic_year_label" },
            { column_name: "semester_label" },
            { column_name: "cwa" },
            { column_name: "wassce_aggregate" }
          ]
        };
      }

      return { rows: [] };
    }
  };
}

async function postgresSearchesUploadedReferenceMetadata() {
  const database = createCapturingDatabase();
  const repository = createApplicationRepository({ database });

  await repository.list({ studentReferenceId: "UPLOADED-REF-123" });

  const listQuery = database.queries.find((entry) => entry.sql.includes("FROM applications a"));
  assert.ok(listQuery, "expected application list query to run");
  assert.ok(listQuery.params.includes("UPLOADED-REF-123"));
  assert.match(
    listQuery.sql,
    /reviewer_notes::jsonb\s*->>\s*'uploadedStudentReferenceId'/u
  );
}

await postgresSearchesUploadedReferenceMetadata();

console.log("application-uploaded-reference-search-tests: ok");
