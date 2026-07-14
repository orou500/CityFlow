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
};
