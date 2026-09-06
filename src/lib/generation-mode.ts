import type { GenerationMode } from "./types";

export function getGenerationMode(): GenerationMode {
  const mode = (process.env.GENERATION_MODE || "mock").toLowerCase();
  return mode === "ace-step" ? "ace-step" : "mock";
}
