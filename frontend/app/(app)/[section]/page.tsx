import { notFound } from "next/navigation";
import { Bot, Plug, UsersRound, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

const sections: Record<
  string,
  { title: string; description: string; icon: LucideIcon }
> = {
  agent: {
    title: "AI agent",
    description: "Greeting, FAQs and behavior.",
    icon: Bot,
  },
  integrations: {
    title: "Integrations",
    description: "Connect your calendar and tools.",
    icon: Plug,
  },
  team: {
    title: "Team",
    description: "Who can access this business.",
    icon: UsersRound,
  },
};

export function generateStaticParams() {
  return Object.keys(sections).map((section) => ({ section }));
}

export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const meta = sections[section];
  if (!meta) notFound();

  return (
    <>
      <PageHeader title={meta.title} description={meta.description} />
      <EmptyState
        icon={meta.icon}
        title="Nothing here yet"
        description="This screen is coming soon."
      />
    </>
  );
}
