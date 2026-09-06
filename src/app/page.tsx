import { Suspense } from "react";
import { CreateForm } from "@/components/CreateForm";

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="aa-card mx-auto max-w-2xl p-6 text-sm text-alchemy-muted">
          Loading create form…
        </div>
      }
    >
      <CreateForm />
    </Suspense>
  );
}
