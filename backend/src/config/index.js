import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT) || 5000,
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/cityflow',
  jwtSecret: process.env.JWT_SECRET,
  tickIntervalMinutes: parseInt(process.env.TICK_INTERVAL_MINUTES) || 60,
  adminEmail: process.env.ADMIN_EMAIL || 'admin@cityflow.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
};
