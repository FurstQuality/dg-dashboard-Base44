import type { Plugin } from "vite";

/** Preview runs in Node; published builds retain Base44's Worker bindings. */
export default function previewRuntimePlugin(): Plugin {
  const id = "\0dgd-preview-runtime";
  return {
    name: "dgd-preview-runtime",
    apply: "serve",
    enforce: "pre",
    resolveId(source) {
      if (source !== "base44:runtime") return;
      if (this.environment?.name === "client") {
        this.error("base44:runtime is server-only.");
      }
      return id;
    },
    load(source) {
      if (source !== id) return;
      return `export const secrets = { get(name) { return process.env[name]; } };`;
    },
  };
}