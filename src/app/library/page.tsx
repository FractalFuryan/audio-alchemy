import { GenerationList } from "@/components/GenerationList";

export default function LibraryPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-alchemy-text">
          Library
        </h1>
        <p className="mt-1 text-sm text-alchemy-muted">
          Search, filter, and manage generations stored on this machine.
        </p>
      </div>
      <GenerationList />
    </div>
  );
}
