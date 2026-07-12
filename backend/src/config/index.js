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
};
