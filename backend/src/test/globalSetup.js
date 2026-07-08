import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer;

export async function setup() {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
}

export async function teardown() {
  if (mongoServer) {
    await mongoServer.stop();
  }
}
