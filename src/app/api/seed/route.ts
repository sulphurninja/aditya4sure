import { SeedImportInput } from "@/lib/domain";
import { handle, requireOwnerApi } from "@/lib/server/auth";
import { planSeedImport, runSeedImport } from "@/lib/server/seed";

/** Dry-run preview (default) or idempotent import of the candidate seed file. */
export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const input = SeedImportInput.parse(await req.json());
    const opts = { excludeSensitive: input.excludeSensitive, excludeIds: input.excludeIds };
    if (input.dryRun) {
      const { plan } = await planSeedImport(opts);
      return Response.json({ dryRun: true, plan });
    }
    return Response.json({ dryRun: false, plan: await runSeedImport(opts) });
  });
}
