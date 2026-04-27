import { createDatabaseClient } from "../infra/database/client.js";
import { users } from "../data/sampleData.js";
import { createAuthRepository } from "../modules/auth/repository.js";
import { createAuthService } from "../modules/auth/service.js";
import { createApplicationRepository } from "../modules/applications/repository.js";
import { createApplicationService } from "../modules/applications/service.js";
import { createApplicationCriteriaRepository } from "../modules/applicationCriteria/repository.js";
import { createApplicationCriteriaService } from "../modules/applicationCriteria/service.js";
import { createBeneficiaryRepository } from "../modules/beneficiaries/repository.js";
import { createBeneficiaryService } from "../modules/beneficiaries/service.js";
import { createCycleRepository } from "../modules/cycles/repository.js";
import { createCycleService } from "../modules/cycles/service.js";
import { createFoodBankRepository } from "../modules/foodBank/repository.js";
import { createFoodBankService } from "../modules/foodBank/service.js";
import { createReportService } from "../modules/reports/service.js";
import { createSchemeRepository } from "../modules/schemes/repository.js";
import { createSchemeService } from "../modules/schemes/service.js";
import { createStudentRepository } from "../modules/students/repository.js";
import { createStudentService } from "../modules/students/service.js";
import { createWaitlistRepository } from "../modules/waitlist/repository.js";
import { createWaitlistService } from "../modules/waitlist/service.js";

export async function createRuntime(config, dependencies = {}) {
  const database = dependencies.database || await createDatabaseClient(config.database);
  const runtimeUsers = dependencies.users ?? users;
  const authRepository = createAuthRepository({ database });
  const authService = createAuthService({
    config,
    users: runtimeUsers,
    repository: authRepository
  });

  const repositories = {
    auth: authRepository,
    cycles: createCycleRepository({ database }),
    schemes: createSchemeRepository({ database }),
    students: createStudentRepository({ database }),
    applicationCriteria: createApplicationCriteriaRepository({ database }),
    applications: createApplicationRepository({ database }),
    beneficiaries: createBeneficiaryRepository({ database }),
    foodBank: createFoodBankRepository({ database }),
    waitlist: createWaitlistRepository({ database })
  };

  await authService.ensureBootstrapAdmin();
  await authService.ensureDevTokenUsers();
  await authService.hydrateDevTokenActors();

  const cyclesService = createCycleService({ repositories });
  const schemesService = createSchemeService({ repositories });
  const studentsService = createStudentService({ repositories });
  const applicationCriteriaService = createApplicationCriteriaService({ repositories });
  const applicationsService = createApplicationService({ repositories });
  const beneficiariesService = createBeneficiaryService({ repositories });
  const foodBankService = createFoodBankService({ repositories });
  const waitlistService = createWaitlistService({
    repositories,
    services: {
      applications: applicationsService,
      beneficiaries: beneficiariesService
    }
  });
  const reportsService = createReportService({ repositories, database, config });

  const services = {
    cycles: cyclesService,
    schemes: schemesService,
    students: studentsService,
    applicationCriteria: applicationCriteriaService,
    applications: applicationsService,
    beneficiaries: beneficiariesService,
    foodBank: foodBankService,
    waitlist: waitlistService,
    reports: reportsService
  };

  return {
    config,
    authService,
    database,
    repositories,
    services,
    dataSource: database.enabled ? "postgres" : "sample"
  };
}
