import "../../../scripts/load-env.js";

const defaultDevTokens = [
  {
    token: "admin-demo-token",
    userId: "user-admin",
    username: process.env.BOOTSTRAP_ADMIN_USERNAME || "admin",
    email: "admin@example.test",
    fullName: "Platform Admin",
    roleCode: "admin"
  },
  {
    token: "reviewer-demo-token",
    userId: "user-reviewer",
    username: "reviewer",
    email: "reviewer@example.test",
    fullName: "Application Reviewer",
    roleCode: "reviewer"
  },
  {
    token: "auditor-demo-token",
    userId: "user-auditor",
    username: "auditor",
    email: "auditor@example.test",
    fullName: "Audit Officer",
    roleCode: "auditor"
  }
];

function parseBoolean(value, fallback) {
  if (value === undefined) return fallback;
  return !["false", "0", "no"].includes(String(value).toLowerCase());
}

function parseJsonArray(value, fallback) {
  if (!value) return fallback;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseStringArray(value, fallback = []) {
  if (!value) return fallback;

  return String(value)
    .split(/[,\n;]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  host: process.env.API_HOST || "127.0.0.1",
  port: Number(process.env.API_PORT || process.env.PORT || 4300),
  appName: "Scholarship Operations Platform API",
  limits: {
    jsonBodyBytes: Number(process.env.JSON_BODY_LIMIT || 50 * 1024 * 1024)
  },
  network: {
    trustedNetworks: parseStringArray(
      process.env.API_TRUSTED_NETWORKS || process.env.TRUSTED_NETWORKS,
      []
    )
  },
  database: {
    url: process.env.DATABASE_URL || "",
    enabled: Boolean(process.env.DATABASE_URL),
    sslMode: process.env.PGSSLMODE || "disable"
  },
  auth: {
    mode: process.env.AUTH_MODE || "password",
    requiredForWrite: parseBoolean(process.env.AUTH_REQUIRED_FOR_WRITE, true),
    sessionSecret: process.env.AUTH_SESSION_SECRET || "",
    sessionTtlHours: Number(process.env.AUTH_SESSION_TTL_HOURS || 12),
    devTokens: parseJsonArray(
      process.env.AUTH_TOKENS_JSON,
      parseBoolean(process.env.AUTH_ENABLE_DEFAULT_DEV_TOKENS, false) ? defaultDevTokens : []
    ),
    bootstrapAdmin: {
      fullName: process.env.BOOTSTRAP_ADMIN_FULL_NAME || "",
      username: process.env.BOOTSTRAP_ADMIN_USERNAME || "",
      password: process.env.BOOTSTRAP_ADMIN_PASSWORD || ""
    }
  },
  cors: {
    allowedOrigins: parseStringArray(process.env.API_ALLOWED_ORIGINS, [])
  },
  messaging: {
    senderEmail: process.env.APPLICATION_MESSAGE_SENDER || "notifications@ssfscholarships.org",
    senderName:
      process.env.APPLICATION_MESSAGE_SENDER_NAME || "Student Support and Financial Services, DoSA",
    provider: process.env.APPLICATION_MESSAGE_PROVIDER || "brevo",
    brevoApiKey: process.env.BREVO_API_KEY || "",
    enabled: parseBoolean(process.env.APPLICATION_MESSAGE_ENABLED, true),
    smsProvider: process.env.SMS_PROVIDER || "twilio",
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
    twilioFromNumber: process.env.TWILIO_FROM_NUMBER || "",
    smsEnabled: parseBoolean(process.env.APPLICATION_SMS_ENABLED, false),
    twilioWhatsAppFromNumber: process.env.TWILIO_WHATSAPP_FROM_NUMBER || "",
    whatsAppEnabled: parseBoolean(process.env.APPLICATION_WHATSAPP_ENABLED, false)
  }
};
