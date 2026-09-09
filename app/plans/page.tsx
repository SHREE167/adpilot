import { loadPlans } from "@/app/actions";
import { PlansList } from "@/components/PlansList";

export default async function PlansPage() {
  const { plans, source } = await loadPlans();
  return <PlansList initial={plans} source={source} />;
}
