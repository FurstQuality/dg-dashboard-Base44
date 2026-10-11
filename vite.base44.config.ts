import { defineConfig } from "vite";
import { resolve } from "node:path";
import base44 from "@base44/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { assertBrowserSupabaseKey } from "./src/lib/public-supabase-key";
import publicConfig from "./deployment/base44/public-config.json";
import previewRuntimePlugin from "./src/lib/preview-runtime-plugin";

assertBrowserSupabaseKey(publicConfig.publishableKey);
if (publicConfig.url !== "https://aosklgewcakrhuxdynik.supabase.co") {
  throw new Error("The Base44 build must use DG Dashboard's dedicated Supabase project.");
}

export default defineConfig(({ command }) => ({
  // Importing this app never reads the original development database or vault.
  envDir: false,
  cacheDir: "node_modules/.vite-base44",
  resolve: {
    alias: [
      { find: "@/components/platform-scripts", replacement: resolve("deployment/base44/document.tsx") },
      { find: "@", replacement: resolve("src") },
    ],
    dedupe: ["react", "react-dom", "@tanstack/react-router"],
  },
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(publicConfig.url),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(publicConfig.publishableKey),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify("aosklgewcakrhuxdynik"),
  },
  environments: {
    ssr: { build: { rollupOptions: { external: ["cloudflare:workers"] } } },
  },
  plugins: [
    previewRuntimePlugin(),
    base44({ hmrNotifier: true, navigationNotifier: true, visualEditAgent: true }),
    tanstackStart({ server: { entry: "server.base44" } }),
    ...(command === "build" ? [nitro({ preset: "cloudflare-module" })] : []),
    react(),
    tailwindcss(),
  ],
  server: {
    fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.admin-connections.local/**", "**/.migration-data.local/**", "**/.migration-check.local/**", "**/.sandbox/**", "**/.dgd-import/**", "**/.dgd-template.local/**"] },
  },
}));