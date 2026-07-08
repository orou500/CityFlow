import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer;

export async function setup() {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
  process.env.PORT = process.env.PORT || '0';
}

export async function teardown() {
  if (mongoServer) {
    await mongoServer.stop();
  }
}
