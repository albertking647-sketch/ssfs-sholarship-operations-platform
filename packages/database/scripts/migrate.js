import {
  createPool,
  ensureMigrationsTable,
  getAppliedMigrations,
  getMigrationFiles,
  readMigrationFile
} from "./shared.js";

const pool = await createPool();

try {
  await ensureMigrationsTable(pool);

  const files = await getMigrationFiles();
  const applied = new Set((await getAppliedMigrations(pool)).map((entry) => entry.filename));
  const pending = files.filter((file) => !applied.has(file.name));

  if (pending.length === 0) {
    console.log("No pending migrations.");
  }

  for (const migration of pending) {
    const sql = await readMigrationFile(migration.path);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        [migration.name]
      );
      await client.query("COMMIT");
      console.log(`Applied migration: ${migration.name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
