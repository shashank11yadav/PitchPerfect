import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { connectDb, disconnectDb } from "../../src/db/connect.js";

let server: MongoMemoryServer | undefined;

/** Starts one in-memory MongoDB for this worker and connects mongoose to it. */
export async function startMemoryMongo(): Promise<void> {
  server = await MongoMemoryServer.create();
  await connectDb(server.getUri("pitchperfect-test"));
}

export async function stopMemoryMongo(): Promise<void> {
  await disconnectDb();
  await server?.stop();
  server = undefined;
}

/** Empties every collection but keeps indexes. */
export async function clearDb(): Promise<void> {
  const collections = await mongoose.connection.db?.collections();
  await Promise.all((collections ?? []).map((collection) => collection.deleteMany({})));
}
