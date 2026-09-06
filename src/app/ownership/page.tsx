export default function OwnershipPage() {
  return (
    <article className="prose prose-invert max-w-none">
      <div className="rounded-2xl border border-alchemy-border bg-alchemy-surface/90 p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-alchemy-text !mt-0">
          Ownership
        </h1>
        <p className="text-alchemy-muted text-sm leading-relaxed">
          Audio Alchemy is built around a simple product principle:{" "}
          <strong className="text-alchemy-text">you own your generations</strong>.
          Tracks you create in this app are yours to keep, download, and use
          according to the terms of the models and services you connect.
        </p>

        <h2 className="mt-8 text-lg font-semibold text-alchemy-text">
          What this means in the product
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-alchemy-muted">
          <li>
            Generations are stored under your local <code className="text-alchemy-accent">data/</code>{" "}
            directory (SQLite metadata + audio files). We do not claim ownership of
            your prompts, lyrics, or output audio.
          </li>
          <li>
            Download is first-class: every completed track can be played in-app and
            saved to your device.
          </li>
          <li>
            This MVP runs on your machine. You control the filesystem and any API
            keys you configure.
          </li>
        </ul>

        <h2 className="mt-8 text-lg font-semibold text-alchemy-text">
          ACE-Step framing
        </h2>
        <p className="text-sm text-alchemy-muted leading-relaxed">
          When <code className="text-alchemy-accent">GENERATION_MODE=ace-step</code>,
          Audio Alchemy talks to an{" "}
          <a
            href="https://github.com/ace-step/ACE-Step-1.5"
            className="text-alchemy-accentHover underline-offset-2 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            ACE-Step 1.5
          </a>{" "}
          compatible REST API. ACE-Step is distributed under an MIT-style /
          commercial-friendly open-source license from its upstream project —
          which is why it fits an ownership-first workflow better than closed,
          platform-locked generators. Always verify the current upstream license
          and any model card terms for the checkpoint you run.
        </p>

        <h2 className="mt-8 text-lg font-semibold text-alchemy-text">
          Not legal advice
        </h2>
        <p className="text-sm text-alchemy-muted leading-relaxed">
          This page describes product policy and technical design for the Audio
          Alchemy MVP. It is{" "}
          <strong className="text-alchemy-text">not legal advice</strong>.
          Copyright, licensing, and commercial use can depend on jurisdiction,
          the specific model weights you use, training data disclosures, and how
          you distribute outputs. If you need certainty for a commercial release,
          consult a qualified attorney and review upstream licenses yourself.
        </p>

        <p className="mt-8 text-xs text-alchemy-muted">
          Audio Alchemy is an independent project and is not affiliated with
          Suno or other proprietary music platforms.
        </p>
      </div>
    </article>
  );
}
