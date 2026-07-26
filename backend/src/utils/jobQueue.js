import { Queue, Worker } from 'bullmq';
import { getRedis } from '../config/redis.js';
import { isRedisConnected } from '../config/redis.js';

const queues = {};
const workers = {};

function getQueueConnection() {
  if (!isRedisConnected()) return null;
  const redis = getRedis();
  return redis.duplicate({ maxRetriesPerRequest: null });
}

export function getQueue(name) {
  if (queues[name]) return queues[name];

  const connection = getQueueConnection();
  if (!connection) return null;

  queues[name] = new Queue(name, { connection });
  return queues[name];
}

export function createWorker(name, processor, opts = {}) {
  const connection = getQueueConnection();
  if (!connection) return null;

  const worker = new Worker(name, processor, {
    connection,
    concurrency: opts.concurrency || 1,
    limiter: opts.limiter,
  });

  worker.on('failed', (job, err) => {
    console.error(`[QUEUE:${name}] Job ${job.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    if (opts.onComplete) opts.onComplete(job);
  });

  workers[name] = worker;
  return worker;
}

export async function addJob(queueName, jobName, data, opts = {}) {
  const queue = getQueue(queueName);
  if (!queue) return null;

  try {
    return await queue.add(jobName, data, {
      removeOnComplete: opts.removeOnComplete ?? 100,
      removeOnFail: opts.removeOnFail ?? 50,
      ...opts,
    });
  } catch (err) {
    console.error(`[QUEUE:${queueName}] Add job error:`, err.message);
    return null;
  }
}

export async function getQueueStats(queueName) {
  const queue = getQueue(queueName);
  if (!queue) return null;

  try {
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);
    return { waiting, active, completed, failed };
  } catch {
    return null;
  }
}

export async function shutdownQueues() {
  for (const [name, worker] of Object.entries(workers)) {
    try {
      await worker.close();
    } catch (err) {
      console.error(`[QUEUE:${name}] Shutdown error:`, err.message);
    }
  }
  for (const [name, queue] of Object.entries(queues)) {
    try {
      await queue.close();
    } catch (err) {
      console.error(`[QUEUE:${name}] Queue close error:`, err.message);
    }
  }
}

export const QUEUE_NAMES = {
  TICK: 'tick',
  EMAIL: 'email',
  BACKUP: 'backup',
  DISCORD: 'discord',
  NOTIFICATIONS: 'notifications',
  ANALYTICS: 'analytics',
};
