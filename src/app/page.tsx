import { Suspense } from "react";
import { CreateForm } from "@/components/CreateForm";

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-alchemy-border bg-alchemy-surface/90 p-6 text-sm text-alchemy-muted">
          Loading create form…
        </div>
      }
    >
      <CreateForm />
    </Suspense>
  );
}
