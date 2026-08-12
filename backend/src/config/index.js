import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const config = {
  port: parseInt(process.env.PORT) || 5000,
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/cityflow',
  jwtSecret: process.env.JWT_SECRET,
  tickIntervalMinutes: parseInt(process.env.TICK_INTERVAL_MINUTES) || 60,
  adminEmail: process.env.ADMIN_EMAIL || 'admin@cityflow.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  backupDir: process.env.BACKUP_DIR || path.join(__dirname, '../../backups'),
  backupRetentionCount: parseInt(process.env.BACKUP_RETENTION_COUNT) || 10,
  backupSchedule: process.env.BACKUP_SCHEDULE || null,
  smtp: {
    host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || process.env.SMTP_LOGIN || '',
    pass: process.env.SMTP_PASS || '',
  },
  emailFrom: process.env.EMAIL_FROM || 'noreply@sizops.co.il',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  socketio: {
    corsOrigin: process.env.SOCKETIO_CORS_ORIGIN || '*',
    pingInterval: parseInt(process.env.SOCKETIO_PING_INTERVAL) || 25000,
    pingTimeout: parseInt(process.env.SOCKETIO_PING_TIMEOUT) || 20000,
  },
  discordBotApiUrl: process.env.DISCORD_BOT_API_URL || 'http://cityflow-discord-bot:5001',
  discordBotApiKey: process.env.DISCORD_BOT_API_KEY || '',
  redis: {
    url: process.env.REDIS_URL || '',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || '',
  },
  oauth: {
    google: {
      clientId: process.env.OAUTH_GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.OAUTH_GOOGLE_CLIENT_SECRET || '',
      redirectUri: process.env.OAUTH_GOOGLE_REDIRECT_URI || '',
      get enabled() {
        return !!(this.clientId && this.clientSecret);
      },
    },
    discord: {
      clientId: process.env.OAUTH_DISCORD_CLIENT_ID || '',
      clientSecret: process.env.OAUTH_DISCORD_CLIENT_SECRET || '',
      redirectUri: process.env.OAUTH_DISCORD_REDIRECT_URI || '',
      get enabled() {
        return !!(this.clientId && this.clientSecret);
      },
    },
  },
  sizops: {
    oidc: {
      enabled: process.env.SIZOPS_OIDC_ENABLED === 'true',
      issuer: process.env.SIZOPS_OIDC_ISSUER || '',
      clientId: process.env.SIZOPS_OIDC_CLIENT_ID || '',
      clientSecret: process.env.SIZOPS_OIDC_CLIENT_SECRET || '',
      redirectUri: process.env.SIZOPS_OIDC_REDIRECT_URI || '',
      scope: process.env.SIZOPS_OIDC_SCOPE || 'openid profile email',
      // Optional endpoint overrides (used by tests; discovery is fetched from
      // the issuer otherwise).
      authorizationEndpoint: process.env.SIZOPS_OIDC_AUTHORIZATION_ENDPOINT || '',
      tokenEndpoint: process.env.SIZOPS_OIDC_TOKEN_ENDPOINT || '',
      userinfoEndpoint: process.env.SIZOPS_OIDC_USERINFO_ENDPOINT || '',
      jwksUri: process.env.SIZOPS_OIDC_JWKS_URI || '',
      /**
       * Credential-type guards: OIDC SSO requires a dedicated SizOps OAuth
       * client. The Game API credentials (SIZOPS_CLIENT_ID `szp_...` and
       * SIZOPS_API_KEY `szak_...`) are for server-to-server calls only and
       * must NEVER be accepted as OIDC credentials. A client id not starting
       * with `szoc_` (or a secret not starting with `szcs_`) makes OIDC
       * unusable so misconfiguration fails loudly instead of failing late.
       */
      get clientIdValid() {
        return typeof this.clientId === 'string' && this.clientId.startsWith('szoc_');
      },
      get clientSecretValid() {
        return typeof this.clientSecret === 'string' && this.clientSecret.startsWith('szcs_');
      },
      get ready() {
        return this.enabled && !!this.issuer && this.clientIdValid && this.clientSecretValid && !!this.redirectUri;
      },
    },
    api: {
      // Server-to-server SizOps game API (API-key auth). Used to register the
      // GamePlayer on the SizOps side after OIDC login/link — identity only,
      // never game data. Optional: when unset, registration is skipped.
      baseUrl: process.env.SIZOPS_API_BASE_URL || '',
      clientId: process.env.SIZOPS_CLIENT_ID || '',
      apiKey: process.env.SIZOPS_API_KEY || '',
      get enabled() {
        return !!(this.apiKey && (this.baseUrl || process.env.SIZOPS_OIDC_ISSUER));
      },
    },
  },
};

/**
 * Explains WHY the SizOps OIDC config is not `ready`, for startup logs and
 * 503 diagnostics. Describes the cause without ever logging the client id,
 * secret, or any other credential value.
 */
export function describeOidcMisconfig(oidc) {
  if (!oidc.enabled) return 'SIZOPS_OIDC_ENABLED is not "true"';
  if (!oidc.issuer) return 'SIZOPS_OIDC_ISSUER is missing';
  if (!oidc.redirectUri) return 'SIZOPS_OIDC_REDIRECT_URI is missing';
  if (!oidc.clientId) return 'SIZOPS_OIDC_CLIENT_ID is missing';
  if (!oidc.clientSecret) return 'SIZOPS_OIDC_CLIENT_SECRET is missing';
  if (!oidc.clientIdValid) {
    return 'SIZOPS_OIDC_CLIENT_ID must start with "szoc_" — Game API credentials (szp_...) are not valid OIDC credentials';
  }
  if (!oidc.clientSecretValid) {
    return 'SIZOPS_OIDC_CLIENT_SECRET must start with "szcs_" — Game API keys (szak_...) are not valid OIDC credentials';
  }
  return 'unknown misconfiguration';
}
