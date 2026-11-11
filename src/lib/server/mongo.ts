import "server-only";
import { MongoClient, type Db } from "mongodb";
import { env } from "./env";

declare global {
  var __adityaMongo: Promise<MongoClient> | undefined;
}

function clientPromise(): Promise<MongoClient> {
  const uri = env().MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");
  if (!globalThis.__adityaMongo) {
    const client = new MongoClient(uri, {
      appName: "aditya-brain",
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
      // Atlas free tier is bandwidth-bound from here; compression helps big chat reads.
      compressors: ["zlib"],
    });
    globalThis.__adityaMongo = client.connect().catch((err) => {
      globalThis.__adityaMongo = undefined;
      throw err;
    });
  }
  return globalThis.__adityaMongo;
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise();
  return client.db(env().MONGODB_DB);
}
