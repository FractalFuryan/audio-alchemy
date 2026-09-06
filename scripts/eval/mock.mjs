/**
 * Cross-platform eval:mock entry — sets GENERATION_MODE=mock then runs start-and-eval.
 * Prefer this over shell wrappers (eval-mock.sh) on Windows/WSL/Node.
 */
process.env.GENERATION_MODE = "mock";

// start-and-eval.mjs uses top-level await and exits itself; dynamic import is safe.
await import("./start-and-eval.mjs");
