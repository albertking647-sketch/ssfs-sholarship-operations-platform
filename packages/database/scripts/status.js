import {
  createPool,
  ensureMigrationsTable,
  getAppliedMigrations,
  getMigrationFiles
} from "./shared.js";

const files = await getMigrationFiles();

if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL is not set. Known migrations:");
  for (const file of files) {
    console.log(`- ${file.name}`);
  }
  process.exit(0);
}

const pool = await createPool();

try {
  await ensureMigrationsTable(pool);
  const applied = await getAppliedMigrations(pool);
  const appliedNames = new Set(applied.map((entry) => entry.filename));

  console.log("Migration status:");
  for (const file of files) {
    const status = appliedNames.has(file.name) ? "applied" : "pending";
    console.log(`- ${file.name}: ${status}`);
  }
} finally {
  await pool.end();
}
