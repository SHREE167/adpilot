import { loadPlan } from "@/app/actions";
import { PlanLoader } from "@/components/PlanLoader";

/** The deferred checkPageSpeed action runs from this page and can take 10-45s. */
export const maxDuration = 60;

export default async function PlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { plan } = await loadPlan(id);
  return <PlanLoader id={id} initial={plan} />;
}
