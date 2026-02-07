interface SitemapOptions {
  sitemapUrl?: string;
  docsBaseUrl?: string;
}

const DEFAULT_SITEMAP_URL = "https://docsmith.aigne.io/sitemap.xml";
const DEFAULT_DOCS_BASE_URL = "https://docsmith.aigne.io/discuss/docs";
const DEFAULT_TITLE = "AIGNE DocSmith";

// Cache for URL check results within same session
const urlCheckCache = new Map<string, boolean>();

/**
 * Check if a repo has already been published on docsmith.aigne.io.
 * Uses two strategies:
 * 1. Check sitemap XML for repo path
 * 2. Fetch the docs page and check if title differs from default (SPA workaround)
 * Returns true if found, false otherwise.
 * Fails open (returns false) on network errors.
 */
export async function checkSitemap(
  repoName: string,
  opts?: SitemapOptions
): Promise<boolean> {
  if (!repoName || repoName.trim() === "") {
    return false;
  }

  const normalizedName = repoName.toLowerCase().trim();

  // Check cache first
  if (urlCheckCache.has(normalizedName)) {
    return urlCheckCache.get(normalizedName)!;
  }

  const sitemapUrl = opts?.sitemapUrl || DEFAULT_SITEMAP_URL;
  const docsBaseUrl = opts?.docsBaseUrl || DEFAULT_DOCS_BASE_URL;

  // Step 1: Check sitemap
  try {
    const res = await fetch(sitemapUrl, {
      headers: { "User-Agent": "docsmith-daily" },
    });

    if (res.ok) {
      const xml = await res.text();
      const locRegex = /<loc>(.*?)<\/loc>/gi;
      let match;
      while ((match = locRegex.exec(xml)) !== null) {
        const loc = match[1].toLowerCase();
        if (
          loc.includes(`/docs/${normalizedName}`) ||
          loc.includes(`/${normalizedName}/`)
        ) {
          urlCheckCache.set(normalizedName, true);
          return true;
        }
      }
    }
  } catch {
    // Sitemap fetch failed, continue to step 2
  }

  // Step 2: Fetch the actual page and check if title differs from default
  // DocSmith SPA returns 200 for all paths, so we check the <title> tag
  try {
    const docUrl = `${docsBaseUrl}/${normalizedName}`;
    const res = await fetch(docUrl, {
      headers: { "User-Agent": "docsmith-daily" },
      redirect: "follow",
    });

    if (!res.ok) {
      urlCheckCache.set(normalizedName, false);
      return false;
    }

    const html = await res.text();
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    const title = titleMatch?.[1]?.trim() || "";

    // If the title is the default "AIGNE DocSmith", the page doesn't exist
    const found = title !== "" && title !== DEFAULT_TITLE;
    urlCheckCache.set(normalizedName, found);
    return found;
  } catch {
    // Network error - fail open
    urlCheckCache.set(normalizedName, false);
    return false;
  }
}

// Reset cache (for testing)
export function resetSitemapCache(): void {
  urlCheckCache.clear();
}

// CLI test mode
if (import.meta.main && process.argv.includes("--test")) {
  console.log("Testing sitemap checker...");
  const published = await checkSitemap("dify");
  console.log(`dify published: ${published}`);
  const unpublished = await checkSitemap("some-random-repo-xyz");
  console.log(`random repo published: ${unpublished}`);
  console.log("PASS: Sitemap checker test complete");
}
