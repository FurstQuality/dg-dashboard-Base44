import { describe, expect, it } from "vitest";
import {
  entityHref,
  pageFor,
  publicPages,
  relatedFor,
  searchPages,
  PAGE_REGISTRY,
} from "../smart-routes";
import { matchesPaths, sectionFor } from "../section-nav";

describe("section URLs", () => {
  it("keeps course creation and studio links in the courses section", () => {
    for (const href of ["/courses?add=1", "/courses?studio=abc", "/courses#map"]) {
      expect(sectionFor(href)).toBe("courses");
      expect(matchesPaths(href, ["/courses"])).toBe(true);
    }
    expect(sectionFor("/courses-other?add=1")).toBeNull();
    expect(matchesPaths("/courses-other", ["/courses"])).toBe(false);
  });
});

describe("entityHref", () => {
  it("builds canonical entity URLs", () => {
    expect(entityHref({ kind: "player", id: "acedout" })).toBe("/u/acedout");
    expect(entityHref({ kind: "course", id: "abc-123" })).toBe("/courses/abc-123");
    expect(entityHref({ kind: "club", id: "west-side" })).toBe("/clubs/west-side");
    expect(entityHref({ kind: "tournament", id: "fall-open" })).toBe("/tournaments/fall-open");
    expect(entityHref({ kind: "round", id: "r1" })).toBe("/play/r1");
    expect(entityHref({ kind: "post", id: "p1" })).toBe("/p/p1");
  });

  it("returns null when there is nothing to link to", () => {
    expect(entityHref(null)).toBeNull();
    expect(entityHref({ kind: "course" })).toBeNull();
    expect(entityHref({ kind: "course", id: "  " })).toBeNull();
  });

  it("encodes ids with unsafe characters", () => {
    expect(entityHref({ kind: "tag", id: "ace runs" })).toBe("/tag/ace%20runs");
  });
});

describe("page registry", () => {
  it("has no duplicate paths", () => {
    const seen = new Set<string>();
    for (const page of PAGE_REGISTRY) {
      expect(seen.has(page.href)).toBe(false);
      seen.add(page.href);
    }
  });

  it("gives every page a label and a one-line description", () => {
    for (const page of PAGE_REGISTRY) {
      expect(page.label.length).toBeGreaterThan(1);
      expect(page.description.length).toBeGreaterThan(10);
    }
  });

  it("exposes only crawlable pages to the sitemap", () => {
    expect(publicPages().map((p) => p.href).sort()).toEqual(["/", "/auth", "/preview"]);
  });

  it("looks pages up by path", () => {
    expect(pageFor("/rating-studio")?.label).toBe("Ratings Lab");
    expect(pageFor("/nope")).toBeNull();
  });
});

describe("searchPages", () => {
  it("ignores terms shorter than two characters", () => {
    expect(searchPages("a")).toEqual([]);
  });

  it("matches labels ahead of keywords", () => {
    const hits = searchPages("putting");
    expect(hits[0]?.href).toBe("/putting");
  });

  it("finds pages by the words people actually type", () => {
    expect(searchPages("messenger").map((p) => p.href)).toContain("/dgim");
    expect(searchPages("what if").map((p) => p.href)).toContain("/rating-studio");
    expect(searchPages("lost disc").map((p) => p.href)).toContain("/lost-found");
  });
});

describe("relatedFor", () => {
  it("uses the longest matching prefix", () => {
    const hrefs = relatedFor("/play/practice").map((l) => l.href);
    expect(hrefs).toContain("/putting");
    expect(hrefs).not.toContain("/play/rounds");
  });

  it("never links to the page you are on and honours the limit", () => {
    const links = relatedFor("/play", 3);
    expect(links.length).toBeLessThanOrEqual(3);
    expect(links.some((l) => l.href === "/play")).toBe(false);
  });

  it("returns nothing for unmapped pages", () => {
    expect(relatedFor("/some/unknown/page")).toEqual([]);
  });

  it("only points at registered pages", () => {
    for (const page of PAGE_REGISTRY) {
      for (const link of relatedFor(page.href)) {
        expect(pageFor(link.href)).not.toBeNull();
      }
    }
  });

  it("keeps registry paths inside a known section or standalone", () => {
    // Guards against typos: a registry path that matches no section and no
    // standalone page is almost always a bad path.
    const standalone = new Set([
      "/",
      "/preview",
      "/td-kit",
      "/series",
      "/auth",
      "/pricing",
      "/me",
      "/me/bag",
      "/achievements",
      "/challenges",
      "/ace",
      "/notifications",
      "/settings",
      "/settings/personalization",
      "/settings/notifications",
      "/settings/imports",
      "/billing",
    ]);
    for (const page of PAGE_REGISTRY) {
      if (standalone.has(page.href)) continue;
      expect(sectionFor(page.href), page.href).not.toBeNull();
    }
  });
});
