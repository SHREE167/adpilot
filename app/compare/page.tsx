import { Suspense } from "react";
import { CompareView } from "@/components/CompareView";

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="card p-8 text-sm text-fog">Loading compare…</div>}>
      <CompareView />
    </Suspense>
  );
}
