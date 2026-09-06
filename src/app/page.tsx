import { Suspense } from "react";
import Image from "next/image";
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
      <div className="mb-5 flex justify-center">
        <Image
          src="/brand/audio-alchemy-logo.png"
          alt="Audio Alchemy"
          width={920}
          height={627}
          priority
          className="h-auto w-48 drop-shadow-[0_10px_24px_rgba(0,0,0,0.35)] sm:w-56"
        />
      </div>
      <CreateForm />
    </Suspense>
  );
}
