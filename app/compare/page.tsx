import { Suspense } from "react";
import { CompareView } from "@/components/CompareView";

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="page py-16"><div className="card mx-auto max-w-xl p-8 text-center text-sm text-fog">Loading compare…</div></div>}>
      <CompareView />
    </Suspense>
  );
}
