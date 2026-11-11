import { TaskBoard } from "@/components/task-board";
import { PageHeader } from "@/components/ui";
import { entityMap } from "@/lib/server/queries";
import { listTasks } from "@/lib/server/tasks";

export const metadata = { title: "Todos" };

export default async function TodosPage() {
  const [tasks, entities] = await Promise.all([listTasks({ status: "all", limit: 500 }).catch(() => []), entityMap().catch(() => ({}))]);
  const names = Object.fromEntries(Object.entries(entities).map(([id, e]) => [id, e.name]));
  return (
    <>
      <PageHeader eyebrow="todos" title="what you owe the world.">
        todos, promises you made, people to chase. claude adds to this too when you tell it stuff or it reads your mail, those get a little bot tag.
      </PageHeader>
      <TaskBoard initial={tasks} names={names} />
    </>
  );
}
