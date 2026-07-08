import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { connectDB } from './config/db.js';
import { startScheduler } from './engine/scheduler.js';
import authRoutes from './routes/auth.js';
import cityRoutes from './routes/cities.js';
import propertyRoutes from './routes/properties.js';
import userRoutes from './routes/users.js';
import transactionRoutes from './routes/transactions.js';
import bankRoutes from './routes/bank.js';
import adminRoutes from './routes/admin.js';
import offerRoutes from './routes/offers.js';
import notificationRoutes from './routes/notifications.js';
import developmentRoutes from './routes/development.js';
import statsRoutes from './routes/stats.js';
import friendsRoutes from './routes/friends.js';
import eventRoutes from './routes/events.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/auth', authRoutes);
app.use('/cities', cityRoutes);
app.use('/properties', propertyRoutes);
app.use('/users', userRoutes);
app.use('/transactions', transactionRoutes);
app.use('/bank', bankRoutes);
app.use('/admin', adminRoutes);
app.use('/offers', offerRoutes);
app.use('/notifications', notificationRoutes);
app.use('/development', developmentRoutes);
app.use('/stats', statsRoutes);
app.use('/friends', friendsRoutes);
app.use('/events', eventRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  console.warn(`404 API Route: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ success: false, error: 'Route not found' });
});

async function start() {
  await connectDB();
  app.listen(config.port, () => {
    console.log(`CityFlow API running on port ${config.port}`);
    startScheduler();
  });
}

start();
