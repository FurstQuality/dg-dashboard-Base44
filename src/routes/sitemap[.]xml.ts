import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { publicPages } from "@/lib/smart-routes";

const BASE_URL = "https://dgdashboard.app";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        // Crawlable pages come from the smart-routing registry, so the sitemap
        // can never drift from what the app actually exposes publicly.
        const entries: SitemapEntry[] = publicPages().map((p) => ({
          path: p.href,
          changefreq: p.href === "/auth" ? "monthly" : "weekly",
          priority: p.href === "/" ? "1.0" : p.href === "/auth" ? "0.5" : "0.9",
        }));

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
