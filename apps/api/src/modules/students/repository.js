import {
  applications,
  awards,
  cycles,
  payments,
  recommendations,
  students,
  waitlistEntries
} from "../../data/sampleData.js";

function mapStudent(student) {
  return {
    id: student.id,
    fullName: student.fullName,
    firstName: student.firstName || null,
    middleName: student.middleName || null,
    lastName: student.lastName || null,
    studentReferenceId: student.studentReferenceId || null,
    indexNumber: student.indexNumber || null,
    college: student.college || null,
    program: student.program || null,
    year: student.year || null,
    cycleId: student.cycleId || null,
    gender: student.gender || null,
    disabilityStatus: student.disabilityStatus || null,
    phoneNumber: student.phoneNumber || null,
    email: student.email || null,
    cwa: student.cwa ?? null,
    wassceAggregate: student.wassceAggregate ?? null,
    duplicateFlag: Boolean(student.duplicateFlag),
    conflictFlag: Boolean(student.conflictFlag),
    notes: student.notes || null,
    activeSupportCount: Number(student.activeSupportCount || 0)
  };
}

function includesText(value, query) {
  return String(value || "").toLowerCase().includes(query);
}

function academicYearRank(label) {
  const match = String(label || "").match(/\b(20\d{2})\/20\d{2}\b/);
  return match ? Number(match[1]) : 0;
}

function semesterRank(label) {
  const value = String(label || "").trim().toLowerCase();
  switch (value) {
    case "first semester":
    case "semester 1":
      return 1;
    case "second semester":
    case "semester 2":
      return 2;
    case "third semester":
    case "semester 3":
      return 3;
    case "final results":
    case "full year":
    case "annual":
      return 4;
    default:
      return 0;
  }
}

function sortAcademicHistoryEntries(entries) {
  return [...entries].sort((left, right) => {
    const yearDelta = academicYearRank(right.academicYearLabel) - academicYearRank(left.academicYearLabel);
    if (yearDelta !== 0) return yearDelta;
    const semesterDelta = semesterRank(right.semesterLabel) - semesterRank(left.semesterLabel);
    if (semesterDelta !== 0) return semesterDelta;
    return String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
  });
}

function mapAcademicHistoryRecord(entry, student) {
  return {
    id: entry.id,
    studentId: entry.studentId,
    studentName: student?.fullName || null,
    studentReferenceId: student?.studentReferenceId || null,
    indexNumber: student?.indexNumber || null,
    college: entry.college || student?.college || null,
    program: entry.program || student?.program || null,
    year: entry.year || student?.year || null,
    academicYearLabel: entry.academicYearLabel || null,
    semesterLabel: entry.semesterLabel || null,
    cwa: entry.cwa ?? null,
    wassceAggregate: entry.wassceAggregate ?? student?.wassceAggregate ?? null,
    importBatchReference: entry.importBatchReference || null,
    sourceFileName: entry.sourceFileName || null,
    createdAt: entry.createdAt || null,
    updatedAt: entry.updatedAt || null
  };
}

function cloneAcademicHistoryRecord(entry) {
  if (!entry) {
    return null;
  }

  return {
    id: entry.id,
    studentId: entry.studentId,
    college: entry.college || null,
    program: entry.program || null,
    year: entry.year || null,
    academicYearLabel: entry.academicYearLabel || null,
    semesterLabel: entry.semesterLabel || null,
    cwa: entry.cwa ?? null,
    wassceAggregate: entry.wassceAggregate ?? null,
    importBatchReference: entry.importBatchReference || null,
    sourceFileName: entry.sourceFileName || null,
    createdAt: entry.createdAt || null,
    updatedAt: entry.updatedAt || null
  };
}

function mapAcademicHistoryImportBatch(batch) {
  return {
    batchReference: batch.batchReference,
    academicYearLabel: batch.academicYearLabel || null,
    semesterLabel: batch.semesterLabel || null,
    fileName: batch.fileName || null,
    importedRows: Number(batch.importedRows || 0),
    updatedRows: Number(batch.updatedRows || 0),
    status: batch.status || "completed",
    createdByName: batch.createdByName || null,
    createdAt: batch.createdAt || null,
    rollbackDeletedRows: Number(batch.rollbackDeletedRows || 0),
    rollbackRestoredRows: Number(batch.rollbackRestoredRows || 0),
    rollbackReason: batch.rollbackReason || null,
    rolledBackByName: batch.rolledBackByName || null,
    rolledBackAt: batch.rolledBackAt || null
  };
}

function createSampleRepository() {
  const academicHistory = students
    .map((student, index) => ({
      id: `academic-profile-${index + 1}`,
      studentId: student.id,
      college: student.college || null,
      program: student.program || null,
      year: student.year || null,
      academicYearLabel:
        cycles.find((item) => item.id === student.cycleId)?.academicYearLabel ||
        cycles.find((item) => item.id === student.cycleId)?.label ||
        null,
      semesterLabel: null,
      cwa: student.cwa ?? null,
      wassceAggregate: student.wassceAggregate ?? null,
      createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      updatedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString()
    }))
    .filter((item) => item.cwa !== null || item.wassceAggregate !== null);
  const academicHistoryImportBatches = [];
  let academicHistoryRecordSequence = academicHistory.length + 1;

  function findAcademicHistoryEntryById(id) {
    return academicHistory.find((entry) => entry.id === id) || null;
  }

  function findAcademicHistoryEntryForScope(input = {}) {
    return (
      academicHistory.find(
        (entry) =>
          entry.studentId === input.studentId &&
          String(entry.academicYearLabel || "") === String(input.academicYearLabel || "") &&
          String(entry.semesterLabel || "") === String(input.semesterLabel || "") &&
          String(entry.program || "") === String(input.program || "")
      ) || null
    );
  }

  function syncStudentSnapshot(student, input = {}) {
    student.cwa = input.cwa ?? student.cwa ?? null;
    if (input.wassceAggregate !== undefined && input.wassceAggregate !== null) {
      student.wassceAggregate = input.wassceAggregate;
    }
    if (input.college) student.college = input.college;
    if (input.program) student.program = input.program;
    if (input.year) student.year = input.year;
  }

  function buildAcademicHistoryEntry(input = {}, existing = null) {
    const timestamp = new Date().toISOString();
    return {
      id: existing?.id || `academic-profile-${academicHistoryRecordSequence++}`,
      studentId: input.studentId,
      college: input.college || existing?.college || null,
      program: input.program || existing?.program || null,
      year: input.year || existing?.year || null,
      academicYearLabel: input.academicYearLabel || existing?.academicYearLabel || null,
      semesterLabel: input.semesterLabel || existing?.semesterLabel || null,
      cwa: input.cwa ?? existing?.cwa ?? null,
      wassceAggregate: input.wassceAggregate ?? existing?.wassceAggregate ?? null,
      importBatchReference:
        input.importBatchReference !== undefined
          ? input.importBatchReference || null
          : existing?.importBatchReference || null,
      sourceFileName:
        input.sourceFileName !== undefined
          ? input.sourceFileName || null
          : existing?.sourceFileName || null,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp
    };
  }

  return {
    async search(filters) {
      const query = (filters.q || "").trim().toLowerCase();
      const studentReferenceId = (filters.studentReferenceId || "").trim();
      const indexNumber = (filters.indexNumber || "").trim().toLowerCase();

      const matches = students.filter((student) => {
        if (filters.id && student.id === filters.id) return true;
        if (filters.flaggedOnly === "true" && !student.duplicateFlag && !student.conflictFlag) return false;
        if (filters.duplicateFlag === "true" && !student.duplicateFlag) return false;
        if (filters.duplicateFlag === "false" && student.duplicateFlag) return false;
        if (filters.conflictFlag === "true" && !student.conflictFlag) return false;
        if (filters.conflictFlag === "false" && student.conflictFlag) return false;
        if (studentReferenceId && student.studentReferenceId === studentReferenceId) return true;
        if (indexNumber && student.indexNumber?.toLowerCase() === indexNumber) return true;
        if (query) {
          return [
            student.fullName,
            student.studentReferenceId,
            student.indexNumber,
            student.program,
            student.college,
            student.email
          ].some((value) => includesText(value, query));
        }

        return !filters.id && !studentReferenceId && !indexNumber;
      });

      return matches.map(mapStudent);
    },
    async getById(id) {
      const student = students.find((item) => item.id === id);
      return student ? mapStudent(student) : null;
    },
    async updateContact(studentId, payload) {
      const student = students.find((item) => item.id === studentId);
      if (!student) {
        return null;
      }

      if (Object.prototype.hasOwnProperty.call(payload, "email")) {
        student.email = payload.email || null;
      }
      if (Object.prototype.hasOwnProperty.call(payload, "phoneNumber")) {
        student.phoneNumber = payload.phoneNumber || null;
      }
      return mapStudent(student);
    },
    async findByIdentifiers(identifiers) {
      return students
        .filter((student) => {
          return (
            (identifiers.studentReferenceId &&
              student.studentReferenceId === identifiers.studentReferenceId) ||
            (identifiers.indexNumber && student.indexNumber === identifiers.indexNumber)
          );
        })
        .map(mapStudent);
    },
    async create(input) {
      const cycle = cycles.find((item) => item.id === input.cycleId);
      const record = {
        ...input,
        cycleId: input.cycleId || cycle?.id || null,
        activeSupportCount: 0,
        duplicateFlag: false,
        conflictFlag: false
      };

      students.unshift(record);
      return mapStudent(record);
    },
    async createMany(inputs = []) {
      const created = [];
      for (const input of inputs) {
        created.push(await this.create(input));
      }
      return created;
    },
    async clearRegistry() {
      const summary = {
        students: students.length,
        applications: applications.length,
        recommendations: recommendations.length,
        waitlistEntries: waitlistEntries.length,
        awards: awards.length,
        payments: payments.length
      };

      students.splice(0, students.length);
      applications.splice(0, applications.length);
      recommendations.splice(0, recommendations.length);
      waitlistEntries.splice(0, waitlistEntries.length);
      awards.splice(0, awards.length);
      payments.splice(0, payments.length);

      return summary;
    },
    async countAll() {
      return students.length;
    },
    async countAcademicHistory() {
      return academicHistory.length;
    },
    async listAcademicHistory(filters = {}) {
      const query = String(filters.q || "").trim().toLowerCase();
      const studentReferenceId = String(filters.studentReferenceId || "").trim();
      const indexNumber = String(filters.indexNumber || "").trim();
      const studentId = String(filters.studentId || "").trim();

      const matchedStudents = students.filter((student) => {
        if (studentId && student.id === studentId) return true;
        if (studentReferenceId && student.studentReferenceId === studentReferenceId) return true;
        if (indexNumber && student.indexNumber === indexNumber) return true;
        if (query) {
          return [
            student.fullName,
            student.studentReferenceId,
            student.indexNumber,
            student.program,
            student.college
          ].some((value) => includesText(value, query));
        }
        return !studentId && !studentReferenceId && !indexNumber && !query;
      });

      const ids = new Set(matchedStudents.map((item) => item.id));
      return sortAcademicHistoryEntries(
        academicHistory
          .filter((entry) => ids.has(entry.studentId))
          .map((entry) =>
            mapAcademicHistoryRecord(
              entry,
              students.find((student) => student.id === entry.studentId) || null
            )
          )
      );
    },
    async getAcademicHistoryRecordById(id) {
      const entry = findAcademicHistoryEntryById(String(id));
      if (!entry) {
        return null;
      }

      return mapAcademicHistoryRecord(
        entry,
        students.find((student) => student.id === entry.studentId) || null
      );
    },
    async findAcademicHistoryRecord(input = {}) {
      const entry = findAcademicHistoryEntryForScope(input);
      if (!entry) {
        return null;
      }

      return mapAcademicHistoryRecord(
        entry,
        students.find((student) => student.id === entry.studentId) || null
      );
    },
    async upsertAcademicHistoryEntry(input) {
      const student = students.find((item) => item.id === input.studentId);
      if (!student) {
        return null;
      }

      const existing = findAcademicHistoryEntryForScope(input);
      const nextEntry = buildAcademicHistoryEntry(input, existing);

      if (existing) {
        Object.assign(existing, nextEntry);
      } else {
        academicHistory.push(nextEntry);
      }

      syncStudentSnapshot(student, input);

      const current = existing || academicHistory[academicHistory.length - 1];
      return mapAcademicHistoryRecord(current, student);
    },
    async updateAcademicHistoryRecord(id, input = {}) {
      const entry = findAcademicHistoryEntryById(String(id));
      if (!entry) {
        return null;
      }

      const student = students.find((item) => item.id === entry.studentId);
      if (!student) {
        return null;
      }

      const nextEntry = buildAcademicHistoryEntry(
        {
          ...entry,
          ...input,
          studentId: entry.studentId
        },
        entry
      );
      Object.assign(entry, nextEntry);
      syncStudentSnapshot(student, nextEntry);

      return mapAcademicHistoryRecord(entry, student);
    },
    async deleteAcademicHistoryRecord(id) {
      const index = academicHistory.findIndex((entry) => entry.id === String(id));
      if (index < 0) {
        return null;
      }

      const [removed] = academicHistory.splice(index, 1);
      const student = students.find((item) => item.id === removed.studentId) || null;
      return mapAcademicHistoryRecord(removed, student);
    },
    async saveAcademicHistoryImportBatch(batch = {}) {
      const existingIndex = academicHistoryImportBatches.findIndex(
        (item) => item.batchReference === batch.batchReference
      );
      const nextBatch = {
        batchReference: batch.batchReference,
        academicYearLabel: batch.academicYearLabel || null,
        semesterLabel: batch.semesterLabel || null,
        fileName: batch.fileName || null,
        importedRows: Number(batch.importedRows || 0),
        updatedRows: Number(batch.updatedRows || 0),
        status: batch.status || "completed",
        createdByName: batch.createdByName || null,
        createdAt: batch.createdAt || new Date().toISOString(),
        rollbackDeletedRows: Number(batch.rollbackDeletedRows || 0),
        rollbackRestoredRows: Number(batch.rollbackRestoredRows || 0),
        rollbackReason: batch.rollbackReason || null,
        rolledBackByName: batch.rolledBackByName || null,
        rolledBackAt: batch.rolledBackAt || null,
        changes: Array.isArray(batch.changes)
          ? batch.changes.map((item) => ({
              profileId: item.profileId || null,
              actionType: item.actionType || "created",
              previousRecord: cloneAcademicHistoryRecord(item.previousRecord),
              nextRecord: cloneAcademicHistoryRecord(item.nextRecord)
            }))
          : []
      };

      if (existingIndex >= 0) {
        academicHistoryImportBatches.splice(existingIndex, 1, nextBatch);
      } else {
        academicHistoryImportBatches.unshift(nextBatch);
      }

      return mapAcademicHistoryImportBatch(nextBatch);
    },
    async listAcademicHistoryImportHistory(filters = {}) {
      const academicYearLabel = String(filters.academicYearLabel || "").trim();
      const semesterLabel = String(filters.semesterLabel || "").trim();

      const items = academicHistoryImportBatches.filter((batch) => {
        if (academicYearLabel && batch.academicYearLabel !== academicYearLabel) {
          return false;
        }
        if (semesterLabel && batch.semesterLabel !== semesterLabel) {
          return false;
        }
        return true;
      });

      return {
        total: items.length,
        items: items.map(mapAcademicHistoryImportBatch)
      };
    },
    async getAcademicHistoryImportBatch(batchReference) {
      const batch = academicHistoryImportBatches.find(
        (item) => item.batchReference === String(batchReference)
      );
      if (!batch) {
        return null;
      }

      return {
        ...mapAcademicHistoryImportBatch(batch),
        changes: (batch.changes || []).map((item) => ({
          profileId: item.profileId || null,
          actionType: item.actionType || "created",
          previousRecord: cloneAcademicHistoryRecord(item.previousRecord),
          nextRecord: cloneAcademicHistoryRecord(item.nextRecord)
        }))
      };
    },
    async rollbackAcademicHistoryImportBatch(batchReference, rollback = {}) {
      const batch = academicHistoryImportBatches.find(
        (item) => item.batchReference === String(batchReference)
      );
      if (!batch || batch.status === "rolled_back") {
        return null;
      }

      let deletedRows = 0;
      let restoredRows = 0;
      for (const change of [...(batch.changes || [])].reverse()) {
        if (change.actionType === "created" && change.nextRecord?.id) {
          const deleted = await this.deleteAcademicHistoryRecord(change.nextRecord.id);
          if (deleted) {
            deletedRows += 1;
          }
          continue;
        }

        if (change.actionType === "updated" && change.previousRecord) {
          const restored = await this.updateAcademicHistoryRecord(change.previousRecord.id, {
            college: change.previousRecord.college,
            program: change.previousRecord.program,
            year: change.previousRecord.year,
            academicYearLabel: change.previousRecord.academicYearLabel,
            semesterLabel: change.previousRecord.semesterLabel,
            cwa: change.previousRecord.cwa,
            wassceAggregate: change.previousRecord.wassceAggregate,
            importBatchReference: change.previousRecord.importBatchReference,
            sourceFileName: change.previousRecord.sourceFileName
          });
          if (restored) {
            restoredRows += 1;
          }
        }
      }

      batch.status = "rolled_back";
      batch.rollbackDeletedRows = deletedRows;
      batch.rollbackRestoredRows = restoredRows;
      batch.rollbackReason = rollback.reason || null;
      batch.rolledBackByName = rollback.actorName || null;
      batch.rolledBackAt = new Date().toISOString();

      return {
        batch: mapAcademicHistoryImportBatch(batch),
        deletedRows,
        restoredRows
      };
    },
    async clearAcademicHistoryScope(filters = {}) {
      const academicYearLabel = String(filters.academicYearLabel || "").trim();
      const semesterLabel = String(filters.semesterLabel || "").trim();
      const removable = academicHistory.filter(
        (entry) =>
          entry.importBatchReference &&
          (!academicYearLabel || String(entry.academicYearLabel || "") === academicYearLabel) &&
          (!semesterLabel || String(entry.semesterLabel || "") === semesterLabel)
      );

      let deletedRows = 0;
      for (const entry of removable) {
        const deleted = await this.deleteAcademicHistoryRecord(entry.id);
        if (deleted) {
          deletedRows += 1;
        }
      }

      return {
        deletedRows
      };
    }
  };
}

function mapStudentRow(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    studentReferenceId: row.student_reference_id,
    indexNumber: row.index_number,
    college: row.college,
    program: row.program_name,
    year: row.year_of_study,
    cycleId: row.cycle_id,
    gender: row.gender,
    disabilityStatus: row.disability_status,
    phoneNumber: row.phone_number,
    email: row.email,
    cwa: row.cwa === null ? null : Number(row.cwa),
    wassceAggregate: row.wassce_aggregate === null ? null : Number(row.wassce_aggregate),
    duplicateFlag: row.duplicate_flag,
    conflictFlag: row.conflict_flag,
    notes: row.notes,
    activeSupportCount: 0
  };
}

function mapAcademicHistoryRow(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    studentName: row.student_name,
    studentReferenceId: row.student_reference_id,
    indexNumber: row.index_number,
    college: row.college,
    program: row.program_name,
    year: row.year_of_study,
    academicYearLabel: row.academic_year_label,
    semesterLabel: row.semester_label,
    cwa: row.cwa === null ? null : Number(row.cwa),
    wassceAggregate: row.wassce_aggregate === null ? null : Number(row.wassce_aggregate),
    importBatchReference: row.import_batch_reference || null,
    sourceFileName: row.source_file_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeNumeric(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function mapCreatedStudentFromInput(id, input) {
  return {
    id: String(id),
    fullName: input.fullName,
    firstName: input.firstName || null,
    middleName: input.middleName || null,
    lastName: input.lastName || null,
    studentReferenceId: input.studentReferenceId || null,
    indexNumber: input.indexNumber || null,
    college: input.college || null,
    program: input.program || null,
    year: input.year || null,
    cycleId: input.cycleId || null,
    gender: input.gender || null,
    disabilityStatus: input.disabilityStatus || null,
    phoneNumber: input.phoneNumber || null,
    email: input.email || null,
    cwa: normalizeNumeric(input.cwa),
    wassceAggregate: normalizeNumeric(input.wassceAggregate),
    duplicateFlag: false,
    conflictFlag: false,
    notes: input.notes || null,
    activeSupportCount: 0
  };
}

function createPostgresRepository(database) {
  let academicProfileSchemaPromise;
  let ensuredAcademicProfileColumns = false;
  let ensuredAcademicHistoryLifecycleSchema = false;

  async function ensureAcademicHistoryLifecycleSchema() {
    if (ensuredAcademicHistoryLifecycleSchema) {
      return;
    }

    await database.query(`
      ALTER TABLE academic_profiles
      ADD COLUMN IF NOT EXISTS import_batch_reference TEXT
    `);
    await database.query(`
      ALTER TABLE academic_profiles
      ADD COLUMN IF NOT EXISTS source_file_name TEXT
    `);
    await database.query(`
      CREATE TABLE IF NOT EXISTS academic_history_import_batches (
        id BIGSERIAL PRIMARY KEY,
        batch_reference TEXT NOT NULL UNIQUE,
        academic_year_label TEXT,
        semester_label TEXT,
        source_file_name TEXT,
        imported_rows INTEGER NOT NULL DEFAULT 0,
        updated_rows INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'completed',
        created_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        rollback_deleted_rows INTEGER NOT NULL DEFAULT 0,
        rollback_restored_rows INTEGER NOT NULL DEFAULT 0,
        rollback_reason TEXT,
        rolled_back_by_name TEXT,
        rolled_back_at TIMESTAMPTZ,
        change_set JSONB NOT NULL DEFAULT '[]'::jsonb
      )
    `);
    await database.query(`
      CREATE INDEX IF NOT EXISTS idx_academic_history_import_batches_scope
      ON academic_history_import_batches(academic_year_label, semester_label, created_at DESC)
    `);

    ensuredAcademicHistoryLifecycleSchema = true;
  }

  async function ensureAcademicProfileColumns() {
    if (ensuredAcademicProfileColumns) {
      return;
    }

    await database.query(`
      ALTER TABLE academic_profiles
      ADD COLUMN IF NOT EXISTS semester_label TEXT
    `);
    await database.query(`
      ALTER TABLE academic_profiles
      ADD COLUMN IF NOT EXISTS wassce_aggregate NUMERIC
    `);
    await ensureAcademicHistoryLifecycleSchema();

    ensuredAcademicProfileColumns = true;
    academicProfileSchemaPromise = null;
  }

  async function getAcademicProfileSchema() {
    await ensureAcademicProfileColumns();
    if (!academicProfileSchemaPromise) {
      academicProfileSchemaPromise = database
        .query(
          `
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'academic_profiles'
          `
        )
        .then((result) => new Set(result.rows.map((row) => row.column_name)));
    }

    return academicProfileSchemaPromise;
  }

  async function getAcademicProfileMapping() {
    const columns = await getAcademicProfileSchema();

    return {
      yearColumn: columns.has("year_of_study")
        ? "year_of_study"
        : columns.has("level_label")
          ? "level_label"
          : null,
      academicYearLabelColumn: columns.has("academic_year_label") ? "academic_year_label" : null,
      semesterColumn: columns.has("semester_label") ? "semester_label" : null,
      cwaColumn: columns.has("cwa") ? "cwa" : columns.has("cgpa") ? "cgpa" : null,
      wassceAggregateColumn: columns.has("wassce_aggregate") ? "wassce_aggregate" : null
    };
  }

  function buildAcademicResultPresenceClause(alias, profileMapping) {
    const parts = [];

    if (profileMapping.cwaColumn) {
      parts.push(`${alias}.${profileMapping.cwaColumn} IS NOT NULL`);
    }
    if (profileMapping.wassceAggregateColumn) {
      parts.push(`${alias}.${profileMapping.wassceAggregateColumn} IS NOT NULL`);
    }

    return parts.length ? `(${parts.join(" OR ")})` : "FALSE";
  }

  function buildAcademicProfileOrderClause(alias, profileMapping) {
    const parts = [];

    if (profileMapping.academicYearLabelColumn) {
      parts.push(`
        CASE
          WHEN ${alias}.${profileMapping.academicYearLabelColumn} ~ '^[0-9]{4}/[0-9]{4}$'
            THEN split_part(${alias}.${profileMapping.academicYearLabelColumn}, '/', 1)::int
          ELSE 0
        END DESC
      `);
    }

    if (profileMapping.semesterColumn) {
      parts.push(`
        CASE LOWER(COALESCE(${alias}.${profileMapping.semesterColumn}, ''))
          WHEN 'first semester' THEN 1
          WHEN 'semester 1' THEN 1
          WHEN 'second semester' THEN 2
          WHEN 'semester 2' THEN 2
          WHEN 'third semester' THEN 3
          WHEN 'semester 3' THEN 3
          WHEN 'final results' THEN 4
          WHEN 'full year' THEN 4
          WHEN 'annual' THEN 4
          ELSE 0
        END DESC
      `);
    }

    parts.push(`${alias}.created_at DESC`);
    return parts.join(", ");
  }

  async function search(filters) {
    const profileMapping = await getAcademicProfileMapping();
    const conditions = [];
    const params = [];

    if (filters.id) {
      params.push(filters.id);
      conditions.push(`s.id::text = $${params.length}`);
    }

    if (filters.studentReferenceId) {
      params.push(filters.studentReferenceId);
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM student_identifiers student_reference_identifier
          WHERE student_reference_identifier.student_id = s.id
            AND student_reference_identifier.identifier_type = 'student_reference_id'
            AND student_reference_identifier.identifier_value = $${params.length}
        )
      `);
    }

    if (filters.indexNumber) {
      params.push(filters.indexNumber);
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM student_identifiers index_identifier
          WHERE index_identifier.student_id = s.id
            AND index_identifier.identifier_type = 'index_number'
            AND index_identifier.identifier_value = $${params.length}
        )
      `);
    }

    if (filters.flaggedOnly === "true") {
      conditions.push(`(s.duplicate_flag = TRUE OR s.conflict_flag = TRUE)`);
    }

    if (filters.duplicateFlag === "true") {
      conditions.push(`s.duplicate_flag = TRUE`);
    }

    if (filters.duplicateFlag === "false") {
      conditions.push(`s.duplicate_flag = FALSE`);
    }

    if (filters.conflictFlag === "true") {
      conditions.push(`s.conflict_flag = TRUE`);
    }

    if (filters.conflictFlag === "false") {
      conditions.push(`s.conflict_flag = FALSE`);
    }

    if (filters.q) {
      params.push(`%${filters.q}%`);
      conditions.push(`
        (
          s.full_name ILIKE $${params.length}
          OR s.email ILIKE $${params.length}
          OR EXISTS (
            SELECT 1
            FROM student_identifiers any_identifier
            WHERE any_identifier.student_id = s.id
              AND any_identifier.identifier_value ILIKE $${params.length}
          )
          OR EXISTS (
            SELECT 1
            FROM academic_profiles any_profile
            WHERE any_profile.student_id = s.id
              AND (
                any_profile.program_name ILIKE $${params.length}
                OR any_profile.college ILIKE $${params.length}
              )
          )
        )
      `);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await database.query(
      `
        SELECT
          s.id::text AS id,
          s.full_name,
          s.first_name,
          s.middle_name,
          s.last_name,
          s.gender,
          s.disability_status,
          s.phone_number,
          s.email,
          s.duplicate_flag,
          s.conflict_flag,
          s.notes,
          MAX(CASE WHEN identifier.identifier_type = 'student_reference_id' THEN identifier.identifier_value END) AS student_reference_id,
          MAX(CASE WHEN identifier.identifier_type = 'index_number' THEN identifier.identifier_value END) AS index_number,
          profile.cycle_id::text AS cycle_id,
          profile.college,
          profile.program_name,
          profile.year_value AS year_of_study,
          profile.cwa_value AS cwa,
          profile.wassce_aggregate_value AS wassce_aggregate
        FROM students s
        LEFT JOIN student_identifiers identifier ON identifier.student_id = s.id
        LEFT JOIN LATERAL (
          SELECT
            cycle_id,
            college,
            program_name,
            ${
              profileMapping.yearColumn
                ? `${profileMapping.yearColumn} AS year_value,`
                : "NULL::text AS year_value,"
            }
            ${
              profileMapping.cwaColumn
                ? `${profileMapping.cwaColumn} AS cwa_value,`
                : "NULL::numeric AS cwa_value,"
            }
            ${
              profileMapping.wassceAggregateColumn
                ? `${profileMapping.wassceAggregateColumn} AS wassce_aggregate_value`
                : "NULL::numeric AS wassce_aggregate_value"
            }
          FROM academic_profiles
          WHERE student_id = s.id
          ORDER BY ${buildAcademicProfileOrderClause("academic_profiles", profileMapping)}
          LIMIT 1
        ) profile ON TRUE
        ${whereClause}
        GROUP BY
          s.id,
          profile.cycle_id,
          profile.college,
          profile.program_name,
          profile.year_value,
          profile.cwa_value,
          profile.wassce_aggregate_value
        ORDER BY s.created_at DESC
        LIMIT 50
      `,
      params
    );

    return result.rows.map(mapStudentRow);
  }

  return {
    search,
    async getById(id) {
      const rows = await search({ id });
      return rows[0] || null;
    },
    async updateContact(studentId, payload) {
      const assignments = [];
      const params = [studentId];

      if (Object.prototype.hasOwnProperty.call(payload, "email")) {
        params.push(payload.email || null);
        assignments.push(`email = $${params.length}`);
      }

      if (Object.prototype.hasOwnProperty.call(payload, "phoneNumber")) {
        params.push(payload.phoneNumber || null);
        assignments.push(`phone_number = $${params.length}`);
      }

      if (!assignments.length) {
        return this.getById(studentId);
      }

      await database.query(
        `
          UPDATE students
          SET ${assignments.join(", ")}
          WHERE id = NULLIF($1, '')::BIGINT
        `,
        params
      );

      return this.getById(studentId);
    },
    async findByIdentifiers(identifiers) {
      return search(identifiers);
    },
    async findExistingByIdentifierBatch(identifiers) {
      const studentReferenceIds = Array.from(new Set((identifiers.studentReferenceIds || []).filter(Boolean)));
      const indexNumbers = Array.from(new Set((identifiers.indexNumbers || []).filter(Boolean)));

      if (!studentReferenceIds.length && !indexNumbers.length) {
        return {
          byReferenceId: new Map(),
          byIndexNumber: new Map()
        };
      }

      const result = await database.query(
        `
          WITH requested_identifiers AS (
            SELECT UNNEST($1::text[]) AS identifier_value, 'student_reference_id'::text AS identifier_type
            UNION ALL
            SELECT UNNEST($2::text[]) AS identifier_value, 'index_number'::text AS identifier_type
          )
          SELECT DISTINCT s.id::text AS id
          FROM requested_identifiers requested
          INNER JOIN student_identifiers identifier
            ON identifier.identifier_type = requested.identifier_type
           AND identifier.identifier_value = requested.identifier_value
          INNER JOIN students s ON s.id = identifier.student_id
        `,
        [studentReferenceIds, indexNumbers]
      );

      if (!result.rows.length) {
        return {
          byReferenceId: new Map(),
          byIndexNumber: new Map()
        };
      }

      const studentIds = result.rows.map((row) => row.id);
      const studentsResult = await database.query(
        `
          SELECT
            s.id::text AS id,
            s.full_name,
            s.first_name,
            s.middle_name,
            s.last_name,
            s.gender,
            s.disability_status,
            s.phone_number,
            s.email,
            s.duplicate_flag,
            s.conflict_flag,
            s.notes,
            MAX(CASE WHEN identifier.identifier_type = 'student_reference_id' THEN identifier.identifier_value END) AS student_reference_id,
            MAX(CASE WHEN identifier.identifier_type = 'index_number' THEN identifier.identifier_value END) AS index_number
          FROM students s
          LEFT JOIN student_identifiers identifier ON identifier.student_id = s.id
          WHERE s.id::text = ANY($1::text[])
          GROUP BY s.id
        `,
        [studentIds]
      );

      const items = studentsResult.rows.map(mapStudentRow);
      const byReferenceId = new Map();
      const byIndexNumber = new Map();

      for (const item of items) {
        if (item.studentReferenceId) {
          const existing = byReferenceId.get(item.studentReferenceId) || [];
          existing.push(item);
          byReferenceId.set(item.studentReferenceId, existing);
        }

        if (item.indexNumber) {
          const existing = byIndexNumber.get(item.indexNumber) || [];
          existing.push(item);
          byIndexNumber.set(item.indexNumber, existing);
        }
      }

      return {
        byReferenceId,
        byIndexNumber
      };
    },
    async create(input) {
      const profileMapping = await getAcademicProfileMapping();
      const createdId = await database.withTransaction(async (transaction) => {
        const studentResult = await transaction.query(
          `
            INSERT INTO students (
              full_name,
              first_name,
              middle_name,
              last_name,
              gender,
              disability_status,
              phone_number,
              email,
              notes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id::text AS id
          `,
          [
            input.fullName,
            input.firstName || null,
            input.middleName || null,
            input.lastName || null,
            input.gender || null,
            input.disabilityStatus || null,
            input.phoneNumber || null,
            input.email || null,
            input.notes || null
          ]
        );

        const studentId = studentResult.rows[0].id;
        const identifiers = [
          ["student_reference_id", input.studentReferenceId, true],
          ["index_number", input.indexNumber, false]
        ].filter((item) => item[1]);

        for (const [type, value, isPrimary] of identifiers) {
          await transaction.query(
            `
              INSERT INTO student_identifiers (
                student_id,
                identifier_type,
                identifier_value,
                is_primary
              )
              VALUES ($1, $2, $3, $4)
            `,
            [studentId, type, value, isPrimary]
          );
        }

        const profileColumns = ["student_id", "cycle_id", "college", "program_name"];
        const profileValues = ["$1", "NULLIF($2, '')::BIGINT", "$3", "$4"];
        const params = [studentId, input.cycleId || "", input.college, input.program];
        let paramIndex = params.length;

        if (profileMapping.yearColumn) {
          paramIndex += 1;
          profileColumns.push(profileMapping.yearColumn);
          profileValues.push(`$${paramIndex}`);
          params.push(input.year || null);
        }

        if (profileMapping.academicYearLabelColumn) {
          paramIndex += 1;
          profileColumns.push(profileMapping.academicYearLabelColumn);
          profileValues.push(`$${paramIndex}`);
          params.push(input.academicYearLabel || null);
        }

        if (profileMapping.semesterColumn) {
          paramIndex += 1;
          profileColumns.push(profileMapping.semesterColumn);
          profileValues.push(`$${paramIndex}`);
          params.push(input.semesterLabel || null);
        }

        if (profileMapping.cwaColumn) {
          paramIndex += 1;
          profileColumns.push(profileMapping.cwaColumn);
          profileValues.push(`$${paramIndex}`);
          params.push(normalizeNumeric(input.cwa));
        }

        if (profileMapping.wassceAggregateColumn) {
          paramIndex += 1;
          profileColumns.push(profileMapping.wassceAggregateColumn);
          profileValues.push(`$${paramIndex}`);
          params.push(normalizeNumeric(input.wassceAggregate));
        }

        await transaction.query(
          `
            INSERT INTO academic_profiles (
              ${profileColumns.join(",\n              ")}
            )
            VALUES (${profileValues.join(", ")})
          `,
          params
        );

        return studentId;
      });

      const created = await search({ id: createdId });
      return created[0];
    },
    async createMany(inputs = []) {
      if (!inputs.length) {
        return [];
      }

      const profileMapping = await getAcademicProfileMapping();

      return database.withTransaction(async (transaction) => {
        const createdItems = [];

        for (const input of inputs) {
          const studentResult = await transaction.query(
            `
              INSERT INTO students (
                full_name,
                first_name,
                middle_name,
                last_name,
                gender,
                disability_status,
                phone_number,
                email,
                notes
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              RETURNING id::text AS id
            `,
            [
              input.fullName,
              input.firstName || null,
              input.middleName || null,
              input.lastName || null,
              input.gender || null,
              input.disabilityStatus || null,
              input.phoneNumber || null,
              input.email || null,
              input.notes || null
            ]
          );

          const studentId = studentResult.rows[0].id;
          const identifiers = [
            ["student_reference_id", input.studentReferenceId, true],
            ["index_number", input.indexNumber, false]
          ].filter((item) => item[1]);

          for (const [type, value, isPrimary] of identifiers) {
            await transaction.query(
              `
                INSERT INTO student_identifiers (
                  student_id,
                  identifier_type,
                  identifier_value,
                  is_primary
                )
                VALUES ($1, $2, $3, $4)
              `,
              [studentId, type, value, isPrimary]
            );
          }

          const profileColumns = ["student_id", "cycle_id", "college", "program_name"];
          const profileValues = ["$1", "NULLIF($2, '')::BIGINT", "$3", "$4"];
          const params = [studentId, input.cycleId || "", input.college, input.program];
          let paramIndex = params.length;

          if (profileMapping.yearColumn) {
            paramIndex += 1;
            profileColumns.push(profileMapping.yearColumn);
            profileValues.push(`$${paramIndex}`);
            params.push(input.year || null);
          }

          if (profileMapping.academicYearLabelColumn) {
            paramIndex += 1;
            profileColumns.push(profileMapping.academicYearLabelColumn);
            profileValues.push(`$${paramIndex}`);
            params.push(input.academicYearLabel || null);
          }

          if (profileMapping.semesterColumn) {
            paramIndex += 1;
            profileColumns.push(profileMapping.semesterColumn);
            profileValues.push(`$${paramIndex}`);
            params.push(input.semesterLabel || null);
          }

          if (profileMapping.cwaColumn) {
            paramIndex += 1;
            profileColumns.push(profileMapping.cwaColumn);
            profileValues.push(`$${paramIndex}`);
            params.push(normalizeNumeric(input.cwa));
          }

          if (profileMapping.wassceAggregateColumn) {
            paramIndex += 1;
            profileColumns.push(profileMapping.wassceAggregateColumn);
            profileValues.push(`$${paramIndex}`);
            params.push(normalizeNumeric(input.wassceAggregate));
          }

          await transaction.query(
            `
              INSERT INTO academic_profiles (
                ${profileColumns.join(",\n                ")}
              )
              VALUES (${profileValues.join(", ")})
            `,
            params
          );

          createdItems.push(mapCreatedStudentFromInput(studentId, input));
        }

        return createdItems;
      });
    },
    async countAll() {
      const result = await database.query(`SELECT COUNT(*)::int AS count FROM students`);
      return Number(result.rows[0]?.count || 0);
    },
    async countAcademicHistory() {
      const profileMapping = await getAcademicProfileMapping();
      const result = await database.query(
        `
          SELECT COUNT(*)::int AS count
          FROM academic_profiles
          WHERE ${buildAcademicResultPresenceClause("academic_profiles", profileMapping)}
        `
      );
      return Number(result.rows[0]?.count || 0);
    },
    async listAcademicHistory(filters = {}) {
      const profileMapping = await getAcademicProfileMapping();
      const params = [];
      const conditions = [];

      if (filters.studentId) {
        params.push(filters.studentId);
        conditions.push(`s.id::text = $${params.length}`);
      }
      if (filters.studentReferenceId) {
        params.push(filters.studentReferenceId);
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM student_identifiers student_reference_identifier
            WHERE student_reference_identifier.student_id = s.id
              AND student_reference_identifier.identifier_type = 'student_reference_id'
              AND student_reference_identifier.identifier_value = $${params.length}
          )
        `);
      }
      if (filters.indexNumber) {
        params.push(filters.indexNumber);
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM student_identifiers index_identifier
            WHERE index_identifier.student_id = s.id
              AND index_identifier.identifier_type = 'index_number'
              AND index_identifier.identifier_value = $${params.length}
          )
        `);
      }
      if (filters.q) {
        params.push(`%${filters.q}%`);
        conditions.push(`
          (
            s.full_name ILIKE $${params.length}
            OR EXISTS (
              SELECT 1
              FROM student_identifiers any_identifier
              WHERE any_identifier.student_id = s.id
                AND any_identifier.identifier_value ILIKE $${params.length}
            )
            OR profile.program_name ILIKE $${params.length}
            OR profile.college ILIKE $${params.length}
          )
        `);
      }
      if (filters.assessmentOnly) {
        conditions.push(buildAcademicResultPresenceClause("profile", profileMapping));
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const result = await database.query(
        `
          SELECT
            profile.id::text AS id,
            s.id::text AS student_id,
            s.full_name AS student_name,
            reference_identifier.identifier_value AS student_reference_id,
            index_identifier.identifier_value AS index_number,
            profile.college,
            profile.program_name,
            ${
              profileMapping.yearColumn
                ? `profile.${profileMapping.yearColumn} AS year_of_study,`
                : "NULL::text AS year_of_study,"
            }
            ${
              profileMapping.academicYearLabelColumn
                ? `profile.${profileMapping.academicYearLabelColumn} AS academic_year_label,`
                : "NULL::text AS academic_year_label,"
            }
            ${
              profileMapping.semesterColumn
                ? `profile.${profileMapping.semesterColumn} AS semester_label,`
                : "NULL::text AS semester_label,"
            }
            ${
              profileMapping.cwaColumn
                ? `profile.${profileMapping.cwaColumn} AS cwa,`
                : "NULL::numeric AS cwa,"
            }
            ${
              profileMapping.wassceAggregateColumn
                ? `profile.${profileMapping.wassceAggregateColumn} AS wassce_aggregate,`
                : "NULL::numeric AS wassce_aggregate,"
            }
            profile.import_batch_reference,
            profile.source_file_name,
            profile.created_at,
            profile.updated_at
          FROM academic_profiles profile
          INNER JOIN students s ON s.id = profile.student_id
          LEFT JOIN student_identifiers reference_identifier
            ON reference_identifier.student_id = s.id
            AND reference_identifier.identifier_type = 'student_reference_id'
            AND reference_identifier.is_primary = TRUE
          LEFT JOIN student_identifiers index_identifier
            ON index_identifier.student_id = s.id
            AND index_identifier.identifier_type = 'index_number'
          ${whereClause}
          ORDER BY ${buildAcademicProfileOrderClause("profile", profileMapping)}
          LIMIT 200
        `,
        params
      );

      return result.rows.map(mapAcademicHistoryRow);
    },
    async getAcademicHistoryRecordById(id) {
      const rows = await this.listAcademicHistory({ includeProfiles: "true" });
      return rows.find((item) => item.id === String(id)) || null;
    },
    async findAcademicHistoryRecord(input = {}) {
      const profileMapping = await getAcademicProfileMapping();
      const result = await database.query(
        `
          SELECT
            profile.id::text AS id,
            s.id::text AS student_id,
            s.full_name AS student_name,
            reference_identifier.identifier_value AS student_reference_id,
            index_identifier.identifier_value AS index_number,
            profile.college,
            profile.program_name,
            ${
              profileMapping.yearColumn
                ? `profile.${profileMapping.yearColumn} AS year_of_study,`
                : "NULL::text AS year_of_study,"
            }
            ${
              profileMapping.academicYearLabelColumn
                ? `profile.${profileMapping.academicYearLabelColumn} AS academic_year_label,`
                : "NULL::text AS academic_year_label,"
            }
            ${
              profileMapping.semesterColumn
                ? `profile.${profileMapping.semesterColumn} AS semester_label,`
                : "NULL::text AS semester_label,"
            }
            ${
              profileMapping.cwaColumn
                ? `profile.${profileMapping.cwaColumn} AS cwa,`
                : "NULL::numeric AS cwa,"
            }
            ${
              profileMapping.wassceAggregateColumn
                ? `profile.${profileMapping.wassceAggregateColumn} AS wassce_aggregate,`
                : "NULL::numeric AS wassce_aggregate,"
            }
            profile.import_batch_reference,
            profile.source_file_name,
            profile.created_at,
            profile.updated_at
          FROM academic_profiles profile
          INNER JOIN students s ON s.id = profile.student_id
          LEFT JOIN student_identifiers reference_identifier
            ON reference_identifier.student_id = s.id
            AND reference_identifier.identifier_type = 'student_reference_id'
            AND reference_identifier.is_primary = TRUE
          LEFT JOIN student_identifiers index_identifier
            ON index_identifier.student_id = s.id
            AND index_identifier.identifier_type = 'index_number'
          WHERE profile.student_id::text = $1
            AND COALESCE(profile.academic_year_label, '') = COALESCE($2, '')
            AND COALESCE(profile.semester_label, '') = COALESCE($3, '')
            AND COALESCE(profile.program_name, '') = COALESCE($4, '')
          ORDER BY profile.updated_at DESC
          LIMIT 1
        `,
        [
          input.studentId,
          input.academicYearLabel || "",
          input.semesterLabel || "",
          input.program || ""
        ]
      );

      return result.rows[0] ? mapAcademicHistoryRow(result.rows[0]) : null;
    },
    async upsertAcademicHistoryEntry(input) {
      const profileMapping = await getAcademicProfileMapping();
      const result = await database.withTransaction(async (transaction) => {
        const existing = await transaction.query(
          `
            SELECT id::text AS id
            FROM academic_profiles
            WHERE student_id::text = $1
              AND COALESCE(academic_year_label, '') = COALESCE($2, '')
              AND COALESCE(semester_label, '') = COALESCE($3, '')
              AND COALESCE(program_name, '') = COALESCE($4, '')
            ORDER BY updated_at DESC
            LIMIT 1
          `,
          [
            input.studentId,
            input.academicYearLabel || "",
            input.semesterLabel || "",
            input.program || ""
          ]
        );

        if (existing.rows[0]?.id) {
          const params = [
            input.cycleId || "",
            input.college || null,
            input.program || null
          ];
          const updates = [
            `cycle_id = NULLIF($1, '')::BIGINT`,
            `college = $2`,
            `program_name = $3`
          ];
          let paramIndex = params.length;

          if (profileMapping.yearColumn) {
            paramIndex += 1;
            params.push(input.year || null);
            updates.push(`${profileMapping.yearColumn} = $${paramIndex}`);
          }
          if (profileMapping.academicYearLabelColumn) {
            paramIndex += 1;
            params.push(input.academicYearLabel || null);
            updates.push(`${profileMapping.academicYearLabelColumn} = $${paramIndex}`);
          }
          if (profileMapping.semesterColumn) {
            paramIndex += 1;
            params.push(input.semesterLabel || null);
            updates.push(`${profileMapping.semesterColumn} = $${paramIndex}`);
          }
          if (profileMapping.cwaColumn) {
            paramIndex += 1;
            params.push(normalizeNumeric(input.cwa));
            updates.push(`${profileMapping.cwaColumn} = $${paramIndex}`);
          }
          if (profileMapping.wassceAggregateColumn) {
            paramIndex += 1;
            params.push(normalizeNumeric(input.wassceAggregate));
            updates.push(`${profileMapping.wassceAggregateColumn} = $${paramIndex}`);
          }
          if (input.importBatchReference !== undefined) {
            paramIndex += 1;
            params.push(input.importBatchReference || null);
            updates.push(`import_batch_reference = $${paramIndex}`);
          }
          if (input.sourceFileName !== undefined) {
            paramIndex += 1;
            params.push(input.sourceFileName || null);
            updates.push(`source_file_name = $${paramIndex}`);
          }

          params.push(existing.rows[0].id);
          await transaction.query(
            `
              UPDATE academic_profiles
              SET
                ${updates.join(",\n                ")},
                updated_at = NOW()
              WHERE id::text = $${params.length}
            `,
            params
          );

          return existing.rows[0].id;
        }

        const profileColumns = ["student_id", "cycle_id", "college", "program_name"];
        const profileValues = ["NULLIF($1, '')::BIGINT", "NULLIF($2, '')::BIGINT", "$3", "$4"];
        const params = [input.studentId, input.cycleId || "", input.college || null, input.program || null];
        let paramIndex = params.length;

        if (profileMapping.yearColumn) {
          paramIndex += 1;
          profileColumns.push(profileMapping.yearColumn);
          profileValues.push(`$${paramIndex}`);
          params.push(input.year || null);
        }
        if (profileMapping.academicYearLabelColumn) {
          paramIndex += 1;
          profileColumns.push(profileMapping.academicYearLabelColumn);
          profileValues.push(`$${paramIndex}`);
          params.push(input.academicYearLabel || null);
        }
        if (profileMapping.semesterColumn) {
          paramIndex += 1;
          profileColumns.push(profileMapping.semesterColumn);
          profileValues.push(`$${paramIndex}`);
          params.push(input.semesterLabel || null);
        }
        if (profileMapping.cwaColumn) {
          paramIndex += 1;
          profileColumns.push(profileMapping.cwaColumn);
          profileValues.push(`$${paramIndex}`);
          params.push(normalizeNumeric(input.cwa));
        }
        if (profileMapping.wassceAggregateColumn) {
          paramIndex += 1;
          profileColumns.push(profileMapping.wassceAggregateColumn);
          profileValues.push(`$${paramIndex}`);
          params.push(normalizeNumeric(input.wassceAggregate));
        }
        if (input.importBatchReference !== undefined) {
          paramIndex += 1;
          profileColumns.push("import_batch_reference");
          profileValues.push(`$${paramIndex}`);
          params.push(input.importBatchReference || null);
        }
        if (input.sourceFileName !== undefined) {
          paramIndex += 1;
          profileColumns.push("source_file_name");
          profileValues.push(`$${paramIndex}`);
          params.push(input.sourceFileName || null);
        }

        const created = await transaction.query(
          `
            INSERT INTO academic_profiles (
              ${profileColumns.join(",\n              ")}
            )
            VALUES (${profileValues.join(", ")})
            RETURNING id::text AS id
          `,
          params
        );

        return created.rows[0].id;
      });

      const rows = await this.listAcademicHistory({ studentId: input.studentId });
      return rows.find((item) => item.id === result) || null;
    },
    async updateAcademicHistoryRecord(id, input = {}) {
      const profileMapping = await getAcademicProfileMapping();
      const existing = await this.getAcademicHistoryRecordById(id);
      if (!existing) {
        return null;
      }

      const params = [
        input.cycleId !== undefined ? input.cycleId || "" : "",
        input.college !== undefined ? input.college || null : existing.college,
        input.program !== undefined ? input.program || null : existing.program
      ];
      const updates = [
        `cycle_id = CASE WHEN $1 = '' THEN cycle_id ELSE NULLIF($1, '')::BIGINT END`,
        `college = $2`,
        `program_name = $3`
      ];
      let paramIndex = params.length;

      if (profileMapping.yearColumn) {
        paramIndex += 1;
        params.push(input.year !== undefined ? input.year || null : existing.year);
        updates.push(`${profileMapping.yearColumn} = $${paramIndex}`);
      }
      if (profileMapping.academicYearLabelColumn) {
        paramIndex += 1;
        params.push(
          input.academicYearLabel !== undefined
            ? input.academicYearLabel || null
            : existing.academicYearLabel
        );
        updates.push(`${profileMapping.academicYearLabelColumn} = $${paramIndex}`);
      }
      if (profileMapping.semesterColumn) {
        paramIndex += 1;
        params.push(
          input.semesterLabel !== undefined ? input.semesterLabel || null : existing.semesterLabel
        );
        updates.push(`${profileMapping.semesterColumn} = $${paramIndex}`);
      }
      if (profileMapping.cwaColumn) {
        paramIndex += 1;
        params.push(input.cwa !== undefined ? normalizeNumeric(input.cwa) : existing.cwa);
        updates.push(`${profileMapping.cwaColumn} = $${paramIndex}`);
      }
      if (profileMapping.wassceAggregateColumn) {
        paramIndex += 1;
        params.push(
          input.wassceAggregate !== undefined
            ? normalizeNumeric(input.wassceAggregate)
            : existing.wassceAggregate
        );
        updates.push(`${profileMapping.wassceAggregateColumn} = $${paramIndex}`);
      }
      if (input.importBatchReference !== undefined) {
        paramIndex += 1;
        params.push(input.importBatchReference || null);
        updates.push(`import_batch_reference = $${paramIndex}`);
      }
      if (input.sourceFileName !== undefined) {
        paramIndex += 1;
        params.push(input.sourceFileName || null);
        updates.push(`source_file_name = $${paramIndex}`);
      }

      params.push(String(id));
      await database.query(
        `
          UPDATE academic_profiles
          SET
            ${updates.join(",\n            ")},
            updated_at = NOW()
          WHERE id::text = $${params.length}
        `,
        params
      );

      return this.getAcademicHistoryRecordById(id);
    },
    async deleteAcademicHistoryRecord(id) {
      const existing = await this.getAcademicHistoryRecordById(id);
      if (!existing) {
        return null;
      }

      await database.query(`DELETE FROM academic_profiles WHERE id::text = $1`, [String(id)]);
      return existing;
    },
    async saveAcademicHistoryImportBatch(batch = {}) {
      await ensureAcademicHistoryLifecycleSchema();
      await database.query(
        `
          INSERT INTO academic_history_import_batches (
            batch_reference,
            academic_year_label,
            semester_label,
            source_file_name,
            imported_rows,
            updated_rows,
            status,
            created_by_name,
            rollback_deleted_rows,
            rollback_restored_rows,
            rollback_reason,
            rolled_back_by_name,
            rolled_back_at,
            change_set
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
          ON CONFLICT (batch_reference)
          DO UPDATE SET
            academic_year_label = EXCLUDED.academic_year_label,
            semester_label = EXCLUDED.semester_label,
            source_file_name = EXCLUDED.source_file_name,
            imported_rows = EXCLUDED.imported_rows,
            updated_rows = EXCLUDED.updated_rows,
            status = EXCLUDED.status,
            created_by_name = EXCLUDED.created_by_name,
            rollback_deleted_rows = EXCLUDED.rollback_deleted_rows,
            rollback_restored_rows = EXCLUDED.rollback_restored_rows,
            rollback_reason = EXCLUDED.rollback_reason,
            rolled_back_by_name = EXCLUDED.rolled_back_by_name,
            rolled_back_at = EXCLUDED.rolled_back_at,
            change_set = EXCLUDED.change_set
        `,
        [
          batch.batchReference,
          batch.academicYearLabel || null,
          batch.semesterLabel || null,
          batch.fileName || null,
          Number(batch.importedRows || 0),
          Number(batch.updatedRows || 0),
          batch.status || "completed",
          batch.createdByName || null,
          Number(batch.rollbackDeletedRows || 0),
          Number(batch.rollbackRestoredRows || 0),
          batch.rollbackReason || null,
          batch.rolledBackByName || null,
          batch.rolledBackAt || null,
          JSON.stringify(batch.changes || [])
        ]
      );

      return this.getAcademicHistoryImportBatch(batch.batchReference);
    },
    async listAcademicHistoryImportHistory(filters = {}) {
      await ensureAcademicHistoryLifecycleSchema();
      const conditions = [];
      const params = [];

      if (filters.academicYearLabel) {
        params.push(String(filters.academicYearLabel || "").trim());
        conditions.push(`academic_year_label = $${params.length}`);
      }
      if (filters.semesterLabel) {
        params.push(String(filters.semesterLabel || "").trim());
        conditions.push(`semester_label = $${params.length}`);
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const result = await database.query(
        `
          SELECT
            batch_reference,
            academic_year_label,
            semester_label,
            source_file_name,
            imported_rows,
            updated_rows,
            status,
            created_by_name,
            created_at,
            rollback_deleted_rows,
            rollback_restored_rows,
            rollback_reason,
            rolled_back_by_name,
            rolled_back_at
          FROM academic_history_import_batches
          ${whereClause}
          ORDER BY created_at DESC, id DESC
        `,
        params
      );

      return {
        total: result.rows.length,
        items: result.rows.map((row) =>
          mapAcademicHistoryImportBatch({
            batchReference: row.batch_reference,
            academicYearLabel: row.academic_year_label,
            semesterLabel: row.semester_label,
            fileName: row.source_file_name,
            importedRows: row.imported_rows,
            updatedRows: row.updated_rows,
            status: row.status,
            createdByName: row.created_by_name,
            createdAt: row.created_at,
            rollbackDeletedRows: row.rollback_deleted_rows,
            rollbackRestoredRows: row.rollback_restored_rows,
            rollbackReason: row.rollback_reason,
            rolledBackByName: row.rolled_back_by_name,
            rolledBackAt: row.rolled_back_at
          })
        )
      };
    },
    async getAcademicHistoryImportBatch(batchReference) {
      await ensureAcademicHistoryLifecycleSchema();
      const result = await database.query(
        `
          SELECT *
          FROM academic_history_import_batches
          WHERE batch_reference = $1
        `,
        [String(batchReference)]
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }

      return {
        ...mapAcademicHistoryImportBatch({
          batchReference: row.batch_reference,
          academicYearLabel: row.academic_year_label,
          semesterLabel: row.semester_label,
          fileName: row.source_file_name,
          importedRows: row.imported_rows,
          updatedRows: row.updated_rows,
          status: row.status,
          createdByName: row.created_by_name,
          createdAt: row.created_at,
          rollbackDeletedRows: row.rollback_deleted_rows,
          rollbackRestoredRows: row.rollback_restored_rows,
          rollbackReason: row.rollback_reason,
          rolledBackByName: row.rolled_back_by_name,
          rolledBackAt: row.rolled_back_at
        }),
        changes: Array.isArray(row.change_set) ? row.change_set : []
      };
    },
    async rollbackAcademicHistoryImportBatch(batchReference, rollback = {}) {
      const batch = await this.getAcademicHistoryImportBatch(batchReference);
      if (!batch || batch.status === "rolled_back") {
        return null;
      }

      let deletedRows = 0;
      let restoredRows = 0;
      for (const change of [...(batch.changes || [])].reverse()) {
        if (change.actionType === "created" && change.nextRecord?.id) {
          const deleted = await this.deleteAcademicHistoryRecord(change.nextRecord.id);
          if (deleted) {
            deletedRows += 1;
          }
          continue;
        }

        if (change.actionType === "updated" && change.previousRecord?.id) {
          const restored = await this.updateAcademicHistoryRecord(change.previousRecord.id, {
            cycleId: change.previousRecord.cycleId,
            college: change.previousRecord.college,
            program: change.previousRecord.program,
            year: change.previousRecord.year,
            academicYearLabel: change.previousRecord.academicYearLabel,
            semesterLabel: change.previousRecord.semesterLabel,
            cwa: change.previousRecord.cwa,
            wassceAggregate: change.previousRecord.wassceAggregate,
            importBatchReference: change.previousRecord.importBatchReference,
            sourceFileName: change.previousRecord.sourceFileName
          });
          if (restored) {
            restoredRows += 1;
          }
        }
      }

      await this.saveAcademicHistoryImportBatch({
        ...batch,
        status: "rolled_back",
        rollbackDeletedRows: deletedRows,
        rollbackRestoredRows: restoredRows,
        rollbackReason: rollback.reason || null,
        rolledBackByName: rollback.actorName || null,
        rolledBackAt: new Date().toISOString()
      });

      return {
        batch: await this.getAcademicHistoryImportBatch(batchReference),
        deletedRows,
        restoredRows
      };
    },
    async clearAcademicHistoryScope(filters = {}) {
      const params = [];
      const conditions = [`import_batch_reference IS NOT NULL`];

      if (filters.academicYearLabel) {
        params.push(String(filters.academicYearLabel || "").trim());
        conditions.push(`COALESCE(academic_year_label, '') = COALESCE($${params.length}, '')`);
      }
      if (filters.semesterLabel) {
        params.push(String(filters.semesterLabel || "").trim());
        conditions.push(`COALESCE(semester_label, '') = COALESCE($${params.length}, '')`);
      }

      const result = await database.query(
        `
          DELETE FROM academic_profiles
          WHERE ${conditions.join(" AND ")}
        `,
        params
      );

      return {
        deletedRows: Number(result.rowCount || 0)
      };
    },
    async clearRegistry() {
      return database.withTransaction(async (transaction) => {
        const countsResult = await transaction.query(
          `
            SELECT
              (SELECT COUNT(*)::int FROM students) AS students,
              (SELECT COUNT(*)::int FROM academic_profiles) AS academic_profiles,
              (SELECT COUNT(*)::int FROM student_identifiers) AS student_identifiers,
              (SELECT COUNT(*)::int FROM applications) AS applications,
              (SELECT COUNT(*)::int FROM recommendations) AS recommendations,
              (SELECT COUNT(*)::int FROM waitlist_entries) AS waitlist_entries,
              (SELECT COUNT(*)::int FROM awards) AS awards,
              (SELECT COUNT(*)::int FROM payments) AS payments,
              (SELECT COUNT(*)::int FROM support_applications) AS support_applications
          `
        );
        const summary = countsResult.rows[0];

        await transaction.query(
          `UPDATE awards SET waitlist_entry_id = NULL WHERE waitlist_entry_id IS NOT NULL`
        );
        await transaction.query(
          `UPDATE waitlist_entries SET promoted_award_id = NULL WHERE promoted_award_id IS NOT NULL`
        );
        await transaction.query(`DELETE FROM payments`);
        await transaction.query(`DELETE FROM award_renewals`);
        await transaction.query(`DELETE FROM awards`);
        await transaction.query(`DELETE FROM waitlist_entries`);
        await transaction.query(`DELETE FROM recommendations`);
        await transaction.query(`DELETE FROM application_scores`);
        await transaction.query(`DELETE FROM eligibility_checks`);
        await transaction.query(`DELETE FROM application_documents`);
        await transaction.query(`DELETE FROM applications`);
        await transaction.query(`DELETE FROM distribution_logs`);
        await transaction.query(`DELETE FROM support_applications`);
        await transaction.query(`DELETE FROM academic_profiles`);
        await transaction.query(`DELETE FROM student_identifiers`);
        await transaction.query(`DELETE FROM students`);
        await transaction.query(
          `
            INSERT INTO audit_logs (
              actor_user_id,
              action_code,
              entity_type,
              entity_id,
              summary,
              metadata
            )
            VALUES (NULL, 'registry.cleared', 'student_registry', 'all', $1, $2::jsonb)
          `,
          [
            `Registry cleared. Removed ${summary.students} student record(s).`,
            JSON.stringify({
              removed: summary
            })
          ]
        );

        return {
          students: summary.students,
          academicProfiles: summary.academic_profiles,
          studentIdentifiers: summary.student_identifiers,
          applications: summary.applications,
          recommendations: summary.recommendations,
          waitlistEntries: summary.waitlist_entries,
          awards: summary.awards,
          payments: summary.payments,
          supportApplications: summary.support_applications
        };
      });
    }
  };
}

export function createStudentRepository({ database }) {
  if (database.enabled) {
    return createPostgresRepository(database);
  }

  const sampleRepository = createSampleRepository();
  return {
    ...sampleRepository,
    async findExistingByIdentifierBatch(identifiers) {
      const byReferenceId = new Map();
      const byIndexNumber = new Map();

      for (const item of students.map(mapStudent)) {
        if (
          item.studentReferenceId &&
          (identifiers.studentReferenceIds || []).includes(item.studentReferenceId)
        ) {
          const existing = byReferenceId.get(item.studentReferenceId) || [];
          existing.push(item);
          byReferenceId.set(item.studentReferenceId, existing);
        }

        if (item.indexNumber && (identifiers.indexNumbers || []).includes(item.indexNumber)) {
          const existing = byIndexNumber.get(item.indexNumber) || [];
          existing.push(item);
          byIndexNumber.set(item.indexNumber, existing);
        }
      }

      return {
        byReferenceId,
        byIndexNumber
      };
    },
    async clearRegistry() {
      return sampleRepository.clearRegistry();
    },
    async countAll() {
      return sampleRepository.countAll();
    },
    async countAcademicHistory() {
      return sampleRepository.countAcademicHistory();
    },
    async createMany(inputs = []) {
      return sampleRepository.createMany(inputs);
    }
  };
}
