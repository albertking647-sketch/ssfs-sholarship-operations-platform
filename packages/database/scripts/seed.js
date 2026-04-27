import {
  applications,
  awards,
  cycles,
  funders,
  payments,
  recommendations,
  roles,
  schemes,
  supportPrograms,
  students,
  users,
  waitlistEntries
} from "../../../apps/api/src/data/sampleData.js";
import { createPool } from "./shared.js";

async function upsertRole(client, role) {
  const result = await client.query(
    `
      INSERT INTO roles (code, name, description)
      VALUES ($1, $2, $3)
      ON CONFLICT (code)
      DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description
      RETURNING id
    `,
    [role.code, role.name, `Seeded role for ${role.name}`]
  );

  return result.rows[0].id;
}

async function upsertUser(client, user, roleIds) {
  const result = await client.query(
    `
      INSERT INTO users (role_id, full_name, email, password_hash, is_active)
      VALUES ($1, $2, $3, $4, TRUE)
      ON CONFLICT (email)
      DO UPDATE SET
        role_id = EXCLUDED.role_id,
        full_name = EXCLUDED.full_name,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id
    `,
    [roleIds.get(user.roleCode), user.fullName, user.email, "seed-dev-token-placeholder"]
  );

  return result.rows[0].id;
}

async function upsertFunder(client, funder) {
  const result = await client.query(
    `
      INSERT INTO funders (code, name, status)
      VALUES ($1, $2, 'active')
      ON CONFLICT (code)
      DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING id
    `,
    [funder.code, funder.name]
  );

  return result.rows[0].id;
}

async function upsertCycle(client, cycle) {
  const result = await client.query(
    `
      INSERT INTO application_cycles (
        code,
        label,
        academic_year_label,
        status
      )
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (code)
      DO UPDATE SET
        label = EXCLUDED.label,
        academic_year_label = EXCLUDED.academic_year_label,
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING id
    `,
    [cycle.code, cycle.label, cycle.academicYearLabel]
  );

  return result.rows[0].id;
}

async function upsertScheme(client, scheme, funderIds) {
  const result = await client.query(
    `
      INSERT INTO schemes (
        funder_id,
        code,
        name,
        category,
        is_exclusive,
        renewal_allowed,
        requires_interview,
        default_award_amount,
        status
      )
      VALUES ($1, $2, $3, $4, TRUE, FALSE, FALSE, $5, $6)
      ON CONFLICT (code)
      DO UPDATE SET
        funder_id = EXCLUDED.funder_id,
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        default_award_amount = EXCLUDED.default_award_amount,
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING id
    `,
    [
      funderIds.get(scheme.funderId),
      scheme.code,
      scheme.name,
      scheme.category,
      scheme.defaultAwardAmount,
      scheme.status
    ]
  );

  return result.rows[0].id;
}

async function upsertSupportProgram(client, program) {
  const result = await client.query(
    `
      INSERT INTO support_programs (code, name, category, status)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (code)
      DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        status = EXCLUDED.status
      RETURNING id
    `,
    [program.code, program.name, program.category, program.status]
  );

  return result.rows[0].id;
}

async function findStudentId(client, student) {
  const result = await client.query(
    `
      SELECT student_id
      FROM student_identifiers
      WHERE identifier_type = 'student_reference_id'
        AND identifier_value = $1
      LIMIT 1
    `,
    [student.studentReferenceId]
  );

  return result.rows[0]?.student_id || null;
}

async function upsertStudentIdentifier(client, studentId, identifierType, identifierValue, isPrimary) {
  if (!identifierValue) {
    return;
  }

  await client.query(
    `
      INSERT INTO student_identifiers (
        student_id,
        identifier_type,
        identifier_value,
        is_primary
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (identifier_type, identifier_value)
      DO UPDATE SET
        student_id = EXCLUDED.student_id,
        is_primary = EXCLUDED.is_primary
    `,
    [studentId, identifierType, identifierValue, isPrimary]
  );
}

async function upsertAcademicProfile(client, studentId, student, cycleIds) {
  const cycleId = student.cycleId ? cycleIds.get(student.cycleId) : null;
  const existing = await client.query(
    `
      SELECT id
      FROM academic_profiles
      WHERE student_id = $1
        AND program_name = $2
        AND college = $3
        AND (
          (cycle_id IS NULL AND $4::BIGINT IS NULL)
          OR cycle_id = $4
        )
      LIMIT 1
    `,
    [studentId, student.program, student.college, cycleId]
  );

  if (existing.rows[0]) {
    await client.query(
      `
        UPDATE academic_profiles
        SET
          year_of_study = $2,
          academic_year_label = $3,
          cwa = $4,
          wassce_aggregate = $5,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        existing.rows[0].id,
        student.year || null,
        cycles.find((item) => item.id === student.cycleId)?.academicYearLabel || null,
        student.cwa ?? null,
        student.wassceAggregate ?? null
      ]
    );
    return;
  }

  await client.query(
    `
      INSERT INTO academic_profiles (
        student_id,
        cycle_id,
        college,
        program_name,
        year_of_study,
        academic_year_label,
        cwa,
        wassce_aggregate
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      studentId,
      cycleId,
      student.college,
      student.program,
      student.year || null,
      cycles.find((item) => item.id === student.cycleId)?.academicYearLabel || null,
      student.cwa ?? null,
      student.wassceAggregate ?? null
    ]
  );
}

async function upsertStudent(client, student, cycleIds) {
  const existingId = await findStudentId(client, student);

  if (existingId) {
    await client.query(
      `
        UPDATE students
        SET
          full_name = $2,
          gender = $3,
          disability_status = $4,
          phone_number = $5,
          email = $6,
          duplicate_flag = $7,
          conflict_flag = $8,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        existingId,
        student.fullName,
        student.gender || null,
        student.disabilityStatus || null,
        student.phoneNumber || null,
        student.email || null,
        Boolean(student.duplicateFlag),
        Boolean(student.conflictFlag)
      ]
    );

    await upsertStudentIdentifier(
      client,
      existingId,
      "student_reference_id",
      student.studentReferenceId,
      true
    );
    await upsertStudentIdentifier(client, existingId, "index_number", student.indexNumber, false);
    await upsertAcademicProfile(client, existingId, student, cycleIds);

    return existingId;
  }

  const insertResult = await client.query(
    `
      INSERT INTO students (
        full_name,
        gender,
        disability_status,
        phone_number,
        email,
        duplicate_flag,
        conflict_flag
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `,
    [
      student.fullName,
      student.gender || null,
      student.disabilityStatus || null,
      student.phoneNumber || null,
      student.email || null,
      Boolean(student.duplicateFlag),
      Boolean(student.conflictFlag)
    ]
  );

  const studentId = insertResult.rows[0].id;
  await upsertStudentIdentifier(client, studentId, "student_reference_id", student.studentReferenceId, true);
  await upsertStudentIdentifier(client, studentId, "index_number", student.indexNumber, false);
  await upsertAcademicProfile(client, studentId, student, cycleIds);

  return studentId;
}

async function upsertApplication(client, application, studentIds, schemeIds, cycleIds, userIds) {
  const result = await client.query(
    `
      INSERT INTO applications (
        student_id,
        scheme_id,
        cycle_id,
        submitted_at,
        status,
        eligibility_status,
        need_category,
        need_score,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (student_id, scheme_id, cycle_id)
      DO UPDATE SET
        submitted_at = EXCLUDED.submitted_at,
        status = EXCLUDED.status,
        eligibility_status = EXCLUDED.eligibility_status,
        need_category = EXCLUDED.need_category,
        need_score = EXCLUDED.need_score,
        created_by = EXCLUDED.created_by,
        updated_at = NOW()
      RETURNING id
    `,
    [
      studentIds.get(application.studentId),
      schemeIds.get(application.schemeId),
      cycleIds.get(application.cycleId),
      application.submittedAt || null,
      application.status,
      application.eligibilityStatus,
      application.needCategory || null,
      application.needScore ?? null,
      userIds.get(application.createdBy) || null
    ]
  );

  return result.rows[0].id;
}

async function upsertRecommendation(client, recommendation, applicationIds, userIds) {
  const result = await client.query(
    `
      INSERT INTO recommendations (
        application_id,
        final_score,
        priority_rank,
        status,
        committee_notes,
        recommended_amount,
        recommended_by,
        recommended_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (application_id)
      DO UPDATE SET
        final_score = EXCLUDED.final_score,
        priority_rank = EXCLUDED.priority_rank,
        status = EXCLUDED.status,
        committee_notes = EXCLUDED.committee_notes,
        recommended_amount = EXCLUDED.recommended_amount,
        recommended_by = EXCLUDED.recommended_by,
        recommended_at = EXCLUDED.recommended_at
      RETURNING id
    `,
    [
      applicationIds.get(recommendation.applicationId),
      recommendation.finalScore ?? null,
      recommendation.priorityRank ?? null,
      recommendation.status,
      recommendation.committeeNotes || null,
      recommendation.recommendedAmount ?? null,
      userIds.get(recommendation.recommendedBy) || null
    ]
  );

  return result.rows[0].id;
}

async function upsertWaitlistEntry(client, entry, recommendationIds, schemeIds, cycleIds, userIds) {
  const result = await client.query(
    `
      INSERT INTO waitlist_entries (
        recommendation_id,
        scheme_id,
        cycle_id,
        priority_rank,
        need_severity,
        reason,
        status,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (recommendation_id)
      DO UPDATE SET
        scheme_id = EXCLUDED.scheme_id,
        cycle_id = EXCLUDED.cycle_id,
        priority_rank = EXCLUDED.priority_rank,
        need_severity = EXCLUDED.need_severity,
        reason = EXCLUDED.reason,
        status = EXCLUDED.status,
        created_by = EXCLUDED.created_by,
        updated_at = NOW()
      RETURNING id
    `,
    [
      recommendationIds.get(entry.recommendationId),
      schemeIds.get(entry.schemeId),
      cycleIds.get(entry.cycleId),
      entry.priorityRank,
      entry.needSeverity || null,
      entry.reason,
      entry.status,
      userIds.get(entry.createdBy) || null
    ]
  );

  return result.rows[0].id;
}

async function upsertAward(client, award, mappings, userIds) {
  const { applicationIds, cycleIds, schemeIds, studentIds, waitlistIds } = mappings;
  const waitlistId = award.waitlistEntryId ? waitlistIds.get(award.waitlistEntryId) : null;
  const existing = await client.query(
    `
      SELECT id
      FROM awards
      WHERE student_id = $1
        AND scheme_id = $2
        AND cycle_id = $3
        AND (
          (application_id IS NULL AND $4::BIGINT IS NULL)
          OR application_id = $4
        )
      LIMIT 1
    `,
    [
      studentIds.get(award.studentId),
      schemeIds.get(award.schemeId),
      cycleIds.get(award.cycleId),
      award.applicationId ? applicationIds.get(award.applicationId) : null
    ]
  );

  if (existing.rows[0]) {
    await client.query(
      `
        UPDATE awards
        SET
          waitlist_entry_id = $2,
          approved_amount = $3,
          status = $4,
          approval_notes = $5,
          approved_by = $6,
          approved_at = COALESCE($7, approved_at),
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        existing.rows[0].id,
        waitlistId,
        award.approvedAmount,
        award.status,
        award.approvalNotes || null,
        userIds.get(award.approvedBy) || null,
        award.approvedAt || null
      ]
    );

    return existing.rows[0].id;
  }

  const result = await client.query(
    `
      INSERT INTO awards (
        student_id,
        application_id,
        scheme_id,
        cycle_id,
        waitlist_entry_id,
        approved_amount,
        status,
        approval_notes,
        approved_by,
        approved_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `,
    [
      studentIds.get(award.studentId),
      award.applicationId ? applicationIds.get(award.applicationId) : null,
      schemeIds.get(award.schemeId),
      cycleIds.get(award.cycleId),
      waitlistId,
      award.approvedAmount,
      award.status,
      award.approvalNotes || null,
      userIds.get(award.approvedBy) || null,
      award.approvedAt || null
    ]
  );

  return result.rows[0].id;
}

async function upsertPayment(client, payment, awardIds) {
  await client.query(
    `
      INSERT INTO payments (
        award_id,
        payment_reference,
        disbursement_period,
        amount,
        status
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (payment_reference)
      DO UPDATE SET
        award_id = EXCLUDED.award_id,
        disbursement_period = EXCLUDED.disbursement_period,
        amount = EXCLUDED.amount,
        status = EXCLUDED.status
    `,
    [
      awardIds.get(payment.awardId),
      payment.paymentReference,
      payment.disbursementPeriod || "2026 Semester 1",
      payment.amount,
      payment.status
    ]
  );
}

const pool = await createPool();

try {
  await pool.query("BEGIN");

  const roleIds = new Map();
  for (const role of roles) {
    roleIds.set(role.code, await upsertRole(pool, role));
  }

  const userIds = new Map();
  for (const user of users) {
    userIds.set(user.id, await upsertUser(pool, user, roleIds));
  }

  const funderIds = new Map();
  for (const funder of funders) {
    funderIds.set(funder.id, await upsertFunder(pool, funder));
  }

  const cycleIds = new Map();
  for (const cycle of cycles) {
    cycleIds.set(cycle.id, await upsertCycle(pool, cycle));
  }

  const schemeIds = new Map();
  for (const scheme of schemes) {
    schemeIds.set(scheme.id, await upsertScheme(pool, scheme, funderIds));
  }

  for (const supportProgram of supportPrograms) {
    await upsertSupportProgram(pool, supportProgram);
  }

  const studentIds = new Map();
  for (const student of students) {
    studentIds.set(student.id, await upsertStudent(pool, student, cycleIds));
  }

  const applicationIds = new Map();
  for (const application of applications) {
    applicationIds.set(
      application.id,
      await upsertApplication(pool, application, studentIds, schemeIds, cycleIds, userIds)
    );
  }

  const recommendationIds = new Map();
  for (const recommendation of recommendations) {
    recommendationIds.set(
      recommendation.id,
      await upsertRecommendation(pool, recommendation, applicationIds, userIds)
    );
  }

  const waitlistIds = new Map();
  for (const entry of waitlistEntries) {
    waitlistIds.set(
      entry.id,
      await upsertWaitlistEntry(pool, entry, recommendationIds, schemeIds, cycleIds, userIds)
    );
  }

  const awardIds = new Map();
  for (const award of awards) {
    awardIds.set(
      award.id,
      await upsertAward(
        pool,
        award,
        {
          applicationIds,
          cycleIds,
          schemeIds,
          studentIds,
          waitlistIds
        },
        userIds
      )
    );
  }

  for (const payment of payments) {
    await upsertPayment(pool, payment, awardIds);
  }

  await pool.query("COMMIT");

  console.log("Seeded core scholarship operations data.");
  console.log(`- roles: ${roles.length}`);
  console.log(`- users: ${users.length}`);
  console.log(`- funders: ${funders.length}`);
  console.log(`- cycles: ${cycles.length}`);
  console.log(`- schemes: ${schemes.length}`);
  console.log(`- support programs: ${supportPrograms.length}`);
  console.log(`- students: ${students.length}`);
  console.log(`- applications: ${applications.length}`);
  console.log(`- recommendations: ${recommendations.length}`);
  console.log(`- waitlist entries: ${waitlistEntries.length}`);
  console.log(`- awards: ${awards.length}`);
  console.log(`- payments: ${payments.length}`);
} catch (error) {
  await pool.query("ROLLBACK");
  throw error;
} finally {
  await pool.end();
}
