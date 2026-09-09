import { loadPlan } from "@/app/actions";
import { PlanLoader } from "@/components/PlanLoader";

export default async function PlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { plan } = await loadPlan(id);
  return <PlanLoader id={id} initial={plan} />;
}
