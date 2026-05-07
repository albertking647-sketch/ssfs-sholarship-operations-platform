import assert from "node:assert/strict";

import { config } from "../src/config.js";
import { createApplicationService } from "../src/modules/applications/service.js";

const originalMessagingConfig = { ...config.messaging };
const originalFetch = globalThis.fetch;

function applyMessagingConfig(overrides = {}) {
  config.messaging = {
    ...originalMessagingConfig,
    enabled: true,
    brevoApiKey: "brevo-test-key",
    smsEnabled: true,
    whatsAppEnabled: false,
    ...overrides
  };
}

function restoreGlobals() {
  config.messaging = { ...originalMessagingConfig };
  globalThis.fetch = originalFetch;
}

function createApplication(id, overrides = {}) {
  return {
    id: String(id),
    studentId: `student-${id}`,
    studentName: `Student ${id}`,
    studentReferenceId: `REF-${id}`,
    email: `student${id}@example.com`,
    phoneNumber: `+233200000${String(id).padStart(3, "0")}`,
    studentPhoneNumber: null,
    schemeId: "scheme-1",
    cycleId: "cycle-1",
    qualificationStatus: "qualified",
    outcomeDecision: null,
    reviewReason: "Meets criteria",
    outcomeAmount: null,
    recommendedAmount: 1000,
    ...overrides
  };
}

function createRepositories({ applications = [], batches = [] } = {}) {
  const createdBatches = [];
  const deliveryUpdates = [];

  const repositories = {
    schemes: {
      async getById(id) {
        return String(id) === "scheme-1"
          ? { id: "scheme-1", name: "Scholarship Fund" }
          : null;
      }
    },
    cycles: {
      async getById(id) {
        return String(id) === "cycle-1"
          ? { id: "cycle-1", label: "2026/2027", academicYearLabel: "2026/2027" }
          : null;
      }
    },
    applicationCriteria: {
      async getBySchemeCycle() {
        return null;
      }
    },
    applications: {
      async list(filters = {}) {
        return applications.filter((item) => {
          if (filters.schemeId && String(item.schemeId) !== String(filters.schemeId)) return false;
          if (filters.cycleId && String(item.cycleId) !== String(filters.cycleId)) return false;
          if (
            filters.qualificationStatus &&
            String(item.qualificationStatus) !== String(filters.qualificationStatus)
          ) {
            return false;
          }
          return true;
        });
      },
      async createMessageBatch(input) {
        const batch = {
          id: `batch-${createdBatches.length + 1}`,
          schemeId: input.schemeId,
          cycleId: input.cycleId,
          channel: input.channel,
          messageType: input.messageType,
          senderEmail: input.senderEmail,
          subjectLine: input.subjectLine,
          bodyTemplate: input.bodyTemplate,
          recipientCount: Array.isArray(input.items) ? input.items.length : 0,
          status: input.status,
          items: (input.items || []).map((item, index) => ({
            id: `item-${index + 1}`,
            ...item
          }))
        };
        createdBatches.push(batch);
        return batch;
      },
      async listMessageBatches() {
        return batches;
      },
      async updateMessageBatchDelivery(batchId, payload) {
        deliveryUpdates.push({ batchId, payload });
        const batch = batches.find((item) => String(item.id) === String(batchId));
        if (!batch) return null;
        const updatesById = new Map((payload.items || []).map((item) => [String(item.id), item]));
        return {
          ...batch,
          status: payload.status,
          items: batch.items.map((item) => ({
            ...item,
            ...(updatesById.get(String(item.id)) || {})
          }))
        };
      }
    }
  };

  return {
    repositories,
    createdBatches,
    deliveryUpdates
  };
}

async function mnotifySettingsAndBatchUseSenderId() {
  applyMessagingConfig({
    smsProvider: "mnotify",
    mnotifyApiKey: "mnotify-key",
    mnotifySenderId: "DoSA SSFS",
    twilioFromNumber: "+12295550123"
  });

  const { repositories, createdBatches } = createRepositories({
    applications: [createApplication(1)]
  });
  const service = createApplicationService({ repositories });

  const settings = await service.getMessagingSettings();
  assert.equal(settings.senderPhone, "DoSA SSFS");

  const logged = await service.recordMessageBatch(
    {
      schemeId: "scheme-1",
      cycleId: "cycle-1",
      channel: "sms",
      messageType: "interview_invite"
    },
    { userId: "admin-1", fullName: "Admin User", roleCode: "admin" }
  );

  assert.equal(logged.senderPhone, "DoSA SSFS");
  assert.equal(createdBatches[0].senderEmail, "DoSA SSFS");
}

async function recordMessageBatchLogsAllRecipientsBeyondPreviewLimit() {
  applyMessagingConfig({
    smsProvider: "mnotify",
    mnotifyApiKey: "mnotify-key",
    mnotifySenderId: "DoSA SSFS"
  });

  const applications = Array.from({ length: 525 }, (_, index) => createApplication(index + 1));
  const { repositories, createdBatches } = createRepositories({ applications });
  const service = createApplicationService({ repositories });

  const preview = await service.messagingPreview({
    schemeId: "scheme-1",
    cycleId: "cycle-1",
    channel: "sms",
    messageType: "interview_invite"
  });

  assert.equal(preview.summary.totalRecipients, 525);
  assert.equal(preview.recipients.length, 500);
  assert.equal(preview.recipientsTruncated, true);
  assert.equal(preview.recipients[0].studentReferenceId, "REF-1");
  assert.equal(preview.recipients[0].reviewReason, "Meets criteria");

  const logged = await service.recordMessageBatch(
    {
      schemeId: "scheme-1",
      cycleId: "cycle-1",
      channel: "sms",
      messageType: "interview_invite"
    },
    { userId: "admin-1", fullName: "Admin User", roleCode: "admin" }
  );

  assert.equal(logged.batch.recipientCount, 525);
  assert.equal(createdBatches[0].items.length, 525);
}

async function sendMessageBatchUsesMNotifyWhenConfigured() {
  applyMessagingConfig({
    smsProvider: "mnotify",
    mnotifyApiKey: "mnotify-key",
    mnotifySenderId: "DoSA SSFS"
  });

  const fetchCalls = [];
  globalThis.fetch = async (url, options = {}) => {
    fetchCalls.push({ url, options });
    return {
      ok: true,
      async text() {
        return JSON.stringify({
          status: "success",
          code: "2000",
          message: "messages sent successfully",
          summary: {
            _id: "mnotify-campaign-1"
          }
        });
      }
    };
  };

  const { repositories, deliveryUpdates } = createRepositories({
    batches: [
      {
        id: "batch-1",
        channel: "sms",
        subjectLine: "",
        bodyTemplate: "Dear {{applicantName}}, interview notice.",
        items: [
          {
            id: "item-1",
            recipientPhone: "+233200000001",
            recipientName: "Amina Osei",
            deliveryStatus: "logged"
          }
        ]
      }
    ]
  });
  const service = createApplicationService({ repositories });

  const result = await service.sendMessageBatch(
    { batchId: "batch-1" },
    { userId: "admin-1", fullName: "Admin User", roleCode: "admin" }
  );

  assert.equal(fetchCalls.length, 1);
  const mnotifyUrl = new URL(fetchCalls[0].url);
  assert.equal(mnotifyUrl.origin + mnotifyUrl.pathname, "https://api.mnotify.com/api/sms/quick");
  assert.equal(mnotifyUrl.searchParams.get("key"), "mnotify-key");
  assert.equal(fetchCalls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(fetchCalls[0].options.body), {
    recipient: ["+233200000001"],
    sender: "DoSA SSFS",
    message: "Dear Amina Osei, interview notice.",
    is_schedule: false,
    schedule_date: ""
  });
  assert.equal(result.summary.sentCount, 1);
  assert.equal(deliveryUpdates[0].payload.items[0].deliveryStatus, "sent");
  assert.equal(deliveryUpdates[0].payload.items[0].providerMessageId, "mnotify-campaign-1");
}

async function missingMNotifyCredentialsLeaveBatchLogged() {
  applyMessagingConfig({
    smsProvider: "mnotify",
    mnotifyApiKey: "",
    mnotifySenderId: "DoSA SSFS"
  });

  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    throw new Error("fetch should not be called");
  };

  const { repositories, deliveryUpdates } = createRepositories({
    batches: [
      {
        id: "batch-1",
        channel: "sms",
        subjectLine: "",
        bodyTemplate: "Dear {{applicantName}}, interview notice.",
        items: [
          {
            id: "item-1",
            recipientPhone: "+233200000001",
            recipientName: "Amina Osei",
            deliveryStatus: "logged"
          }
        ]
      }
    ]
  });
  const service = createApplicationService({ repositories });

  const result = await service.sendMessageBatch(
    { batchId: "batch-1" },
    { userId: "admin-1", fullName: "Admin User", roleCode: "admin" }
  );

  assert.equal(fetchCount, 0);
  assert.equal(result.summary.loggedCount, 1);
  assert.equal(result.summary.sentCount, 0);
  assert.equal(deliveryUpdates[0].payload.items[0].deliveryStatus, "logged");
}

async function run() {
  try {
    await mnotifySettingsAndBatchUseSenderId();
    await recordMessageBatchLogsAllRecipientsBeyondPreviewLimit();
    await sendMessageBatchUsesMNotifyWhenConfigured();
    await missingMNotifyCredentialsLeaveBatchLogged();
    console.log("applications-messaging-tests: ok");
  } finally {
    restoreGlobals();
  }
}

run().catch((error) => {
  restoreGlobals();
  console.error("applications-messaging-tests: failed");
  console.error(error);
  process.exit(1);
});
