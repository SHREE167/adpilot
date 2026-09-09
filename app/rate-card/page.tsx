import { loadRateCard } from "@/app/actions";
import { RateCardEditor } from "@/components/RateCardEditor";

export default async function RateCardPage() {
  const { rateCard, storage } = await loadRateCard();
  return <RateCardEditor initial={rateCard} storage={storage} />;
}
