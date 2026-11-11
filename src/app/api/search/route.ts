import { OWNER_ID } from "@/lib/domain";
import { handle, requireOwnerApi } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";

/** Global search for the command palette: entities + memories. */
export async function GET(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
    if (q.length < 2) return Response.json({ entities: [], memories: [] });
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const c = await collections();
    const [entities, memories] = await Promise.all([
      c.entities.find({ ownerId: OWNER_ID, $or: [{ name: rx }, { aliases: rx }] }).limit(6).toArray(),
      c.memories
        .find({ ownerId: OWNER_ID, status: "active", reviewStatus: { $ne: "rejected" }, statement: rx })
        .project({ _id: 1, statement: 1, section: 1 })
        .limit(8)
        .toArray(),
    ]);
    return Response.json({
      entities: entities.map((e) => ({ id: e._id, name: e.name, kind: e.kind, slug: e.slug })),
      memories,
    });
  });
}
