import { redirect } from "next/navigation";

/** Old /ask links → the chat now lives on the home screen. */
export default async function AskRedirect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
  redirect(qs ? `/?${qs}` : "/");
}
