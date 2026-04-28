import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDirectory = path.resolve(__dirname, "..", "postgres", "migrations");

const requiredTables = [
  "application_message_batches",
  "application_message_batch_items",
  "application_review_rules",
  "application_import_issues",
  "scheme_academic_years",
  "recommended_students",
  "recommended_student_import_batches"
];

const files = fs
  .readdirSync(migrationsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
  .map((entry) => path.join(migrationsDirectory, entry.name))
  .sort();

const migrationSql = files
  .map((filePath) => fs.readFileSync(filePath, "utf8"))
  .join("\n")
  .toLowerCase();

const missingTables = requiredTables.filter((tableName) => {
  const escapedTableName = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`create\\s+table\\s+(if\\s+not\\s+exists\\s+)?${escapedTableName}\\b`, "i");
  return !pattern.test(migrationSql);
});

if (missingTables.length > 0) {
  console.error(
    `Missing migration coverage for runtime-created tables: ${missingTables.join(", ")}`
  );
  process.exit(1);
}
