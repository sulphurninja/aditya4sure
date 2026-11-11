import "server-only";
import { OWNER_ID, type AuditEntry } from "@/lib/domain";
import { collections, newId, nowIso } from "./db";

/** Audit entries store *what* changed (field names, ids), never plaintext secrets or raw sources. */
export async function audit(entry: Omit<AuditEntry, "_id" | "ownerId" | "at">) {
  const { audit } = await collections();
  await audit.insertOne({ _id: newId("aud"), ownerId: OWNER_ID, at: nowIso(), ...entry });
}
