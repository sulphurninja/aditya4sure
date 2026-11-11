import { OWNER_ID, StyleSampleInput, type StyleSample } from "@/lib/domain";
import { audit } from "@/lib/server/audit";
import { handle, requireOwnerApi } from "@/lib/server/auth";
import { collections, newId, nowIso } from "@/lib/server/db";

export async function GET(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const { styleSamples } = await collections();
    return Response.json({ samples: await styleSamples.find({ ownerId: OWNER_ID }).sort({ createdAt: -1 }).limit(200).toArray() });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const input = StyleSampleInput.parse(await req.json());
    const { styleSamples } = await collections();
    const doc: StyleSample = {
      _id: newId("style"),
      ownerId: OWNER_ID,
      mode: input.mode,
      text: input.text,
      context: input.context ?? null,
      audience: input.audience ?? null,
      authoredBy: "aditya",
      createdAt: nowIso(),
    };
    await styleSamples.insertOne(doc);
    await audit({ actor: "owner", action: "style.add", targetType: "style_sample", targetId: doc._id });
    return Response.json({ sample: doc }, { status: 201 });
  });
}
