export default function OwnershipPage() {
  return (
    <article className="mx-auto w-full max-w-2xl">
      <div className="aa-card p-6 sm:p-8">
        <h1 className="mt-0 text-2xl font-semibold tracking-tight text-alchemy-text">
          Ownership
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-alchemy-muted">
          Audio Alchemy is built around a simple product principle:{" "}
          <strong className="text-alchemy-text">you own your generations</strong>.
          Tracks you create in this app are yours to keep, download, and use
          according to the terms of the models and services you connect.
        </p>

        <h2 className="mt-8 text-lg font-semibold text-alchemy-gold">
          What this means in the product
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-alchemy-muted">
          <li>
            Generations are stored under your local{" "}
            <code className="rounded bg-alchemy-bg px-1 text-alchemy-goldSoft">data/</code>{" "}
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

        <h2 className="mt-8 text-lg font-semibold text-alchemy-gold">
          ACE-Step framing
        </h2>
        <p className="text-sm leading-relaxed text-alchemy-muted">
          When <code className="rounded bg-alchemy-bg px-1 text-alchemy-goldSoft">GENERATION_MODE=ace-step</code>,
          Audio Alchemy talks to an{" "}
          <a
            href="https://github.com/ace-step/ACE-Step-1.5"
            className="text-alchemy-accentHover underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-alchemy-accent/50"
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

        <h2 className="mt-8 text-lg font-semibold text-alchemy-gold">
          Not legal advice
        </h2>
        <p className="text-sm leading-relaxed text-alchemy-muted">
          This page describes product policy and technical design for the Audio
          Alchemy MVP. It is{" "}
          <strong className="text-alchemy-text">not legal advice</strong>.
          Copyright, licensing, and commercial use can depend on jurisdiction,
          the specific model weights you use, training data disclosures, and how
          you distribute outputs. If you need certainty for a commercial release,
          consult a qualified attorney and review upstream licenses yourself.
        </p>

        <h2 className="mt-8 text-lg font-semibold text-alchemy-gold">
          Local mode
        </h2>
        <p className="text-sm leading-relaxed text-alchemy-muted">
          Generations run on the owner&apos;s configured local engine (this machine).
          Audio Alchemy does not imply a public hosted rendering service. The
          owner&apos;s home GPU must never be exposed as a public render endpoint.
        </p>

        <p className="mt-8 border-t border-alchemy-border pt-4 text-xs text-alchemy-muted">
          Audio Alchemy is an independent project and is not affiliated with
          Suno or other proprietary music platforms.
        </p>
      </div>
    </article>
  );
}
