import "../../../scripts/load-env.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const migrationsDirectory = path.resolve(packageRoot, "postgres", "migrations");

export function getDatabaseUrl() {
  const value = process.env.DATABASE_URL || "";
  if (!value) {
    throw new Error("DATABASE_URL is not set. Copy .env.example values into your environment before running database commands.");
  }

  return value;
}

export async function loadPg() {
  try {
    const module = await import("pg");
    return module.default?.Pool ? module.default : module;
  } catch (error) {
    throw new Error("The `pg` package is not installed yet. Run `npm install` from the project root before using PostgreSQL commands.");
  }
}

export async function createPool() {
  const { Pool } = await loadPg();
  return new Pool({
    connectionString: getDatabaseUrl(),
    ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined
  });
}

export async function getMigrationFiles() {
  const entries = await fs.readdir(migrationsDirectory, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => ({
      name: entry.name,
      path: path.join(migrationsDirectory, entry.name)
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function getAppliedMigrations(pool) {
  const result = await pool.query(
    "SELECT filename, applied_at FROM schema_migrations ORDER BY filename ASC"
  );

  return result.rows;
}

export async function readMigrationFile(filePath) {
  return fs.readFile(filePath, "utf8");
}
