import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const localEnvPath = path.join(repoRoot, ".env.local");
const hostedEnvPath = path.join(repoRoot, ".env.vercel");

const TABLES = [
  "roles",
  "users",
  "funders",
  "application_cycles",
  "schemes",
  "scheme_academic_years",
  "students",
  "student_identifiers",
  "academic_profiles",
  "application_review_rules",
  "applications",
  "application_documents",
  "eligibility_checks",
  "scoring_templates",
  "scoring_criteria",
  "application_scores",
  "recommendations",
  "waitlist_entries",
  "awards",
  "beneficiaries",
  "food_bank_registrations",
  "beneficiary_import_batches",
  "beneficiary_audit_events",
  "award_renewals",
  "payments",
  "support_programs",
  "support_applications",
  "distribution_logs",
  "import_batches",
  "export_jobs",
  "audit_logs",
  "application_message_batches",
  "application_message_batch_items",
  "application_import_issues",
  "recommended_students",
  "recommended_student_import_batches"
];

const TABLES_WITH_ID = new Set([
  "roles",
  "users",
  "funders",
  "application_cycles",
  "schemes",
  "students",
  "student_identifiers",
  "academic_profiles",
  "application_review_rules",
  "applications",
  "application_documents",
  "eligibility_checks",
  "scoring_templates",
  "scoring_criteria",
  "application_scores",
  "recommendations",
  "waitlist_entries",
  "awards",
  "beneficiaries",
  "food_bank_registrations",
  "beneficiary_import_batches",
  "beneficiary_audit_events",
  "award_renewals",
  "payments",
  "support_programs",
  "support_applications",
  "distribution_logs",
  "import_batches",
  "export_jobs",
  "audit_logs",
  "application_message_batches",
  "application_message_batch_items",
  "application_import_issues",
  "recommended_students",
  "recommended_student_import_batches"
]);

const COLUMN_MAPPINGS = {
  academic_profiles: {
    year_of_study: "level_label",
    cwa: "cgpa"
  }
};

const IGNORED_SOURCE_COLUMNS = {
  academic_profiles: new Set(["faculty", "department"])
};

function parseEnvFile(filePath) {
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.split(/=(.*)/su).slice(0, 2))
  );
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/gu, "\"\"")}"`;
}

function getCanonicalSourceColumns(tableName, sourceColumns) {
  const columnMapping = COLUMN_MAPPINGS[tableName] || {};
  const ignoredColumns = IGNORED_SOURCE_COLUMNS[tableName] || new Set();

  return sourceColumns
    .filter((columnName) => !ignoredColumns.has(columnName))
    .map((columnName) => {
      const mappedEntry = Object.entries(columnMapping).find(([, sourceName]) => sourceName === columnName);
      return mappedEntry ? mappedEntry[0] : columnName;
    })
    .sort();
}

function getCanonicalTargetColumns(targetColumns) {
  return [...targetColumns].sort();
}

function buildSourceSelectList(tableName, targetColumns) {
  const columnMapping = COLUMN_MAPPINGS[tableName] || {};

  return targetColumns
    .map((targetColumn) => {
      const sourceColumn = columnMapping[targetColumn] || targetColumn;
      if (sourceColumn === targetColumn) {
        return quoteIdentifier(targetColumn);
      }

      return `${quoteIdentifier(sourceColumn)} AS ${quoteIdentifier(targetColumn)}`;
    })
    .join(", ");
}

async function getColumnDefinitions(pool, tableName) {
  const result = await pool.query(
    `
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position ASC
    `,
    [tableName]
  );

  return result.rows.map((row) => ({
    columnName: row.column_name,
    dataType: row.data_type,
    udtName: row.udt_name
  }));
}

function normalizeValueForColumn(value, definition) {
  if (value === undefined) {
    return null;
  }

  if (value === null || !definition) {
    return value;
  }

  if (definition.udtName === "json" || definition.udtName === "jsonb") {
    if (typeof value === "string") {
      try {
        JSON.parse(value);
        return value;
      } catch {
        return JSON.stringify(value);
      }
    }

    return JSON.stringify(value);
  }

  return value;
}

function buildInsertQuery(tableName, definitions, rows) {
  const columns = definitions.map((definition) => definition.columnName);
  const definitionMap = new Map(definitions.map((definition) => [definition.columnName, definition]));
  const quotedTable = quoteIdentifier(tableName);
  const quotedColumns = columns.map((column) => quoteIdentifier(column)).join(", ");
  const values = [];
  const params = [];
  let paramIndex = 1;

  for (const row of rows) {
    const placeholders = [];
    for (const column of columns) {
      placeholders.push(`$${paramIndex}`);
      params.push(normalizeValueForColumn(row[column], definitionMap.get(column)));
      paramIndex += 1;
    }
    values.push(`(${placeholders.join(", ")})`);
  }

  return {
    text: `INSERT INTO ${quotedTable} (${quotedColumns}) VALUES ${values.join(", ")}`,
    params
  };
}

async function getColumns(pool, tableName) {
  const definitions = await getColumnDefinitions(pool, tableName);
  return definitions.map((definition) => definition.columnName);
}

async function getRowCount(pool, tableName) {
  const result = await pool.query(`SELECT COUNT(*)::bigint AS count FROM ${quoteIdentifier(tableName)}`);
  return Number(result.rows[0]?.count || 0);
}

async function streamTableRows(pool, tableName, columns, handleRows) {
  const batchSize = Math.max(100, Math.min(1000, Math.floor(50000 / Math.max(columns.length, 1))));
  const quotedTable = quoteIdentifier(tableName);
  const orderedColumns = columns.map((column) => quoteIdentifier(column)).join(", ");
  const sourceSelectList = buildSourceSelectList(tableName, columns);

  if (TABLES_WITH_ID.has(tableName)) {
    let lastSeenId = 0;

    while (true) {
      const result = await pool.query(
        `SELECT ${sourceSelectList} FROM ${quotedTable} WHERE id > $1 ORDER BY id ASC LIMIT ${batchSize}`,
        [lastSeenId]
      );

      if (result.rows.length === 0) {
        return;
      }

      await handleRows(result.rows);
      lastSeenId = Number(result.rows[result.rows.length - 1].id);
    }
  }

  let offset = 0;
  while (true) {
    const result = await pool.query(
      `SELECT ${sourceSelectList} FROM ${quotedTable} ORDER BY ${orderedColumns} OFFSET ${offset} LIMIT ${batchSize}`
    );

    if (result.rows.length === 0) {
      return;
    }

    await handleRows(result.rows);
    offset += result.rows.length;
  }
}

async function resetSequence(pool, tableName) {
  if (!TABLES_WITH_ID.has(tableName)) {
    return;
  }

  const quotedTable = quoteIdentifier(tableName);
  await pool.query(`
    SELECT setval(
      pg_get_serial_sequence('public.${tableName}', 'id'),
      COALESCE((SELECT MAX(id) FROM ${quotedTable}), 1),
      true
    )
  `);
}

async function main() {
  const localEnv = parseEnvFile(localEnvPath);
  const hostedEnv = parseEnvFile(hostedEnvPath);

  const localDatabaseUrl = String(localEnv.DATABASE_URL || "").trim();
  const hostedDatabaseUrl = String(hostedEnv.DATABASE_URL || "").trim();

  if (!localDatabaseUrl) {
    throw new Error(`DATABASE_URL is missing from ${localEnvPath}`);
  }

  if (!hostedDatabaseUrl) {
    throw new Error(`DATABASE_URL is missing from ${hostedEnvPath}`);
  }

  const localPool = new Pool({
    connectionString: localDatabaseUrl
  });
  const hostedPool = new Pool({
    connectionString: hostedDatabaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log("Comparing local and hosted schemas...");
    for (const tableName of TABLES) {
      const [localColumns, hostedColumns] = await Promise.all([
        getColumns(localPool, tableName),
        getColumns(hostedPool, tableName)
      ]);

      if (
        getCanonicalSourceColumns(tableName, localColumns).join("|") !==
        getCanonicalTargetColumns(hostedColumns).join("|")
      ) {
        throw new Error(
          `Schema mismatch for ${tableName}.\nLocal: ${localColumns.join(", ")}\nHosted: ${hostedColumns.join(", ")}`
        );
      }
    }

    console.log("Truncating hosted tables...");
    const truncateList = TABLES.map((tableName) => quoteIdentifier(tableName)).join(", ");
    await hostedPool.query(`TRUNCATE TABLE ${truncateList} RESTART IDENTITY CASCADE`);

    for (const tableName of TABLES) {
      const definitions = await getColumnDefinitions(hostedPool, tableName);
      const columns = definitions.map((definition) => definition.columnName);
      const localCount = await getRowCount(localPool, tableName);

      if (localCount === 0) {
        console.log(`Skipping ${tableName}: no rows`);
        continue;
      }

      console.log(`Copying ${tableName}: ${localCount} row(s)`);
      let copied = 0;

      await streamTableRows(localPool, tableName, columns, async (rows) => {
        const insert = buildInsertQuery(tableName, definitions, rows);
        await hostedPool.query(insert.text, insert.params);
        copied += rows.length;
        if (copied === localCount || copied % 5000 === 0) {
          console.log(`  ${tableName}: ${copied}/${localCount}`);
        }
      });

      await resetSequence(hostedPool, tableName);
    }

    console.log("Verifying row counts...");
    for (const tableName of TABLES) {
      const [localCount, hostedCount] = await Promise.all([
        getRowCount(localPool, tableName),
        getRowCount(hostedPool, tableName)
      ]);

      if (localCount !== hostedCount) {
        throw new Error(
          `Count mismatch for ${tableName}: local=${localCount}, hosted=${hostedCount}`
        );
      }
    }

    console.log("Sync complete.");
  } finally {
    await Promise.allSettled([localPool.end(), hostedPool.end()]);
  }
}

await main();
