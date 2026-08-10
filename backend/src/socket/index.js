import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { isRedisConnected } from '../config/redis.js';
import { config } from '../config/index.js';
import { SOCKET_EVENTS, companyRoom, userRoom } from './events.js';
import { setOnline, setOffline, heartbeat } from '../utils/presence.js';
import User from '../models/User.js';

let io = null;
let pubClient = null;
let subClient = null;

export function getIO() {
  return io;
}

export async function initSocketIO(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: config.socketio.corsOrigin,
      methods: ['GET', 'POST'],
    },
    pingInterval: config.socketio.pingInterval,
    pingTimeout: config.socketio.pingTimeout,
    transports: ['websocket', 'polling'],
  });

  if (isRedisConnected()) {
    try {
      const { default: Redis } = await import('ioredis');
      const opts = {
        maxRetriesPerRequest: null,
        lazyConnect: true,
        retryStrategy(times) {
          if (times > 5) return null;
          return Math.min(times * 200, 2000);
        },
      };
      pubClient = config.redis.url
        ? new Redis(config.redis.url, opts)
        : new Redis({
            ...opts,
            host: config.redis.host,
            port: config.redis.port,
            password: config.redis.password || undefined,
          });
      subClient = config.redis.url
        ? new Redis(config.redis.url, opts)
        : new Redis({
            ...opts,
            host: config.redis.host,
            port: config.redis.port,
            password: config.redis.password || undefined,
          });
      pubClient.on('error', (err) => console.warn('[SOCKET.IO] pubClient error:', err.message));
      subClient.on('error', (err) => console.warn('[SOCKET.IO] subClient error:', err.message));

      await Promise.race([
        Promise.all([pubClient.connect(), subClient.connect()]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]);

      io.adapter(createAdapter(pubClient, subClient));
      console.log('[SOCKET.IO] Redis adapter connected');
    } catch (err) {
      console.warn('[SOCKET.IO] Redis adapter failed, using default adapter:', err.message);
      pubClient = null;
      subClient = null;
    }
  } else {
    console.log('[SOCKET.IO] Redis not available, using in-memory adapter');
  }

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Authentication required'));

      const jwt = await import('jsonwebtoken');
      const { config } = await import('../config/index.js');
      const decoded = jwt.default.verify(token, config.jwtSecret);
      const user = await User.findById(decoded.userId).select('_id username companyId');
      if (!user || user.deletedAt) return next(new Error('User not found'));

      socket.userId = user._id.toString();
      socket.username = user.username;
      socket.companyId = user.companyId?.toString() || null;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on(SOCKET_EVENTS.CONNECTION, async (socket) => {
    const userId = socket.userId;
    console.log(`[SOCKET.IO] User connected: ${socket.username} (${userId})`);

    await setOnline(userId, socket.id);

    import('../engine/missionProcessing.js')
      .then(({ markDailyLoginForUser }) => markDailyLoginForUser(userId))
      .catch((err) => console.warn('[SOCKET.IO] daily login marking failed:', err.message));

    if (socket.companyId) {
      socket.join(companyRoom(socket.companyId));
    }
    socket.join(userRoom(userId));

    socket.on(SOCKET_EVENTS.HEARTBEAT, async () => {
      await heartbeat(userId, socket.id);
    });

    socket.on(SOCKET_EVENTS.COMPANY_JOIN, (companyId) => {
      socket.join(companyRoom(companyId));
      socket.companyId = companyId;
    });

    socket.on(SOCKET_EVENTS.COMPANY_LEAVE, (companyId) => {
      socket.leave(companyRoom(companyId));
      if (socket.companyId === companyId) socket.companyId = null;
    });

    socket.on(SOCKET_EVENTS.DISCONNECT, async () => {
      console.log(`[SOCKET.IO] User disconnected: ${socket.username} (${userId})`);
      await setOffline(userId);
    });

    socket.emit(SOCKET_EVENTS.AUTHENTICATE, {
      userId,
      username: socket.username,
      companyId: socket.companyId,
    });
  });

  console.log('[SOCKET.IO] Server initialized');
  return io;
}

export function emitToCompany(companyId, event, data) {
  if (!io) return;
  io.to(companyRoom(companyId)).emit(event, data);
}

export function emitToUser(userId, event, data) {
  if (!io) return;
  io.to(userRoom(userId)).emit(event, data);
}

export function emitToAll(event, data) {
  if (!io) return;
  io.emit(event, data);
}

export function getConnectedCount() {
  if (!io) return 0;
  return io.engine.clientsCount;
}

export function getAdapterStatus() {
  return {
    connected: !!io,
    redisAdapter: !!pubClient && !!subClient,
    connectedClients: getConnectedCount(),
  };
}

export async function shutdownSocketIO() {
  if (io) {
    io.close();
    io = null;
  }
  if (pubClient) {
    pubClient.quit();
    pubClient = null;
  }
  if (subClient) {
    subClient.quit();
    subClient = null;
  }
}
