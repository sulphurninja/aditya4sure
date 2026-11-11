import Link from "next/link";
import { Mic2 } from "lucide-react";
import { buttonVariants, Card } from "@/components/ui";
import { SectionPage } from "@/components/section-page";

export const metadata = { title: "Creative" };

export default function CreativePage() {
  return (
    <SectionPage
      eyebrow="creative"
      title="bars, captions, reels."
      intro="your taste in lyrics, how you write, and whatever you're cooking creatively."
      sections={["creativity"]}
      defaultSection="creativity"
      notice={
        <Card className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-muted">stuck on a beat? hop into creative mode. I&apos;ll co-write with rhyme maps and reference chains, built off your own samples.</p>
          <Link href="/?mode=creative&q=Help%20me%20write%2016%20bars%20-%20give%20me%203%20directions%20first" className={buttonVariants({ variant: "primary", size: "sm" })}>
            <Mic2 /> start a session
          </Link>
        </Card>
      }
    />
  );
}
