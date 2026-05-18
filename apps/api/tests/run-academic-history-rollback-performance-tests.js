import assert from "node:assert/strict";
import fs from "node:fs";

const repositorySource = fs.readFileSync(
  new URL("../src/modules/students/repository.js", import.meta.url),
  "utf8"
);

function postgresRollbackUsesBulkDeletesAndRestores() {
  const postgresRepositoryStart = repositorySource.indexOf("function createPostgresRepository");
  assert.ok(postgresRepositoryStart > 0, "Expected to find the Postgres repository.");
  const postgresSource = repositorySource.slice(postgresRepositoryStart);
  const postgresRollbackMatch = postgresSource.match(
    /async rollbackAcademicHistoryImportBatch\(batchReference, rollback = \{\}\) \{[\s\S]*?\n    async clearAcademicHistoryScope/u
  );
  assert.ok(postgresRollbackMatch, "Expected to find the Postgres academic-history rollback method.");

  const postgresRollback = postgresRollbackMatch[0];
  assert.match(
    postgresRollback,
    /DELETE FROM academic_profiles\s+WHERE id = ANY\(\$1::BIGINT\[\]\)/u
  );
  assert.match(postgresRollback, /UPDATE academic_profiles AS profile/u);
  assert.match(postgresRollback, /WHERE profile\.id = NULLIF\(input\.id, ''\)::BIGINT/u);
  assert.doesNotMatch(postgresRollback, /this\.deleteAcademicHistoryRecord\(change\.nextRecord\.id\)/u);
  assert.doesNotMatch(postgresRollback, /this\.updateAcademicHistoryRecord\(change\.previousRecord\.id/u);
}

postgresRollbackUsesBulkDeletesAndRestores();

console.log("academic-history-rollback-performance-tests: ok");
