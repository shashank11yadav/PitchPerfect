import { afterAll, afterEach, beforeAll } from "vitest";
import { clearDb, startMemoryMongo, stopMemoryMongo } from "./helpers/db.js";

beforeAll(startMemoryMongo);
afterEach(clearDb);
afterAll(stopMemoryMongo);
