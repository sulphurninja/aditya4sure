import Link from "next/link";
import { buttonVariants, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <EmptyState title="not in your brain, man" action={<Link href="/" className={buttonVariants()}>take me home</Link>}>
      that page or memory doesn&apos;t exist. maybe you deleted it?
    </EmptyState>
  );
}
