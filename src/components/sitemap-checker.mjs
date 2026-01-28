/**
 * Sitemap Checker - Verifies repos aren't already documented on DocSmith
 */

import logger from '../utils/logger.mjs';

const DOCSMITH_SITEMAP_URL = 'https://docsmith.aigne.io/sitemap.xml';
const DOCSMITH_BASE_URL = 'https://docsmith.aigne.io';

// Cache the sitemap for 1 hour to avoid hammering the server
let sitemapCache = {
  urls: new Set(),
  fetchedAt: null,
  ttlMs: 60 * 60 * 1000  // 1 hour
};

/**
 * Fetch and parse the DocSmith sitemap
 */
export async function fetchSitemap(forceRefresh = false) {
  const now = Date.now();

  // Return cache if still valid
  if (!forceRefresh && sitemapCache.fetchedAt &&
      (now - sitemapCache.fetchedAt) < sitemapCache.ttlMs) {
    logger.info('Using cached sitemap', {
      urlCount: sitemapCache.urls.size,
      ageMinutes: Math.round((now - sitemapCache.fetchedAt) / 60000)
    });
    return sitemapCache.urls;
  }

  logger.info('Fetching DocSmith sitemap', { url: DOCSMITH_SITEMAP_URL });

  try {
    const response = await fetch(DOCSMITH_SITEMAP_URL, {
      headers: {
        'User-Agent': 'DocSmith-Automation/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Sitemap fetch failed: ${response.status}`);
    }

    const xml = await response.text();

    // Parse URLs from sitemap XML
    // Looking for patterns like: <loc>https://docsmith.aigne.io/...</loc>
    const urlMatches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
    const urls = new Set();

    for (const match of urlMatches) {
      urls.add(match[1]);
    }

    // Update cache
    sitemapCache = {
      urls,
      fetchedAt: now,
      ttlMs: sitemapCache.ttlMs
    };

    logger.info('Sitemap fetched successfully', { urlCount: urls.size });
    return urls;

  } catch (error) {
    logger.error('Failed to fetch sitemap', { error: error.message });
    // Return empty set on error - don't block processing
    return new Set();
  }
}

/**
 * Extract repo identifier from a DocSmith URL
 * URLs might be like: https://docsmith.aigne.io/owner/repo/...
 */
function extractRepoFromUrl(url) {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/').filter(Boolean);

    // Most DocSmith URLs have format: /owner/repo/... or /docs/owner/repo/...
    if (pathParts.length >= 2) {
      // Skip common prefixes
      const skipPrefixes = ['docs', 'api', 'assets', 'static'];
      let startIndex = 0;

      if (skipPrefixes.includes(pathParts[0])) {
        startIndex = 1;
      }

      if (pathParts.length > startIndex + 1) {
        return `${pathParts[startIndex]}/${pathParts[startIndex + 1]}`.toLowerCase();
      }
    }
  } catch (e) {
    // Invalid URL
  }
  return null;
}

/**
 * Check if a repository is already documented on DocSmith
 */
export async function isRepoAlreadyDocumented(repoName) {
  const normalizedName = repoName.toLowerCase();

  try {
    const sitemapUrls = await fetchSitemap();

    // Check if any URL contains this repo name
    for (const url of sitemapUrls) {
      const urlLower = url.toLowerCase();

      // Direct match in URL path
      if (urlLower.includes(`/${normalizedName}/`) ||
          urlLower.includes(`/${normalizedName.replace('/', '-')}/`)) {
        logger.info('Repo already documented on DocSmith', {
          repoName,
          matchedUrl: url
        });
        return { exists: true, url };
      }

      // Extract and compare repo identifier
      const extractedRepo = extractRepoFromUrl(url);
      if (extractedRepo === normalizedName) {
        logger.info('Repo already documented on DocSmith', {
          repoName,
          matchedUrl: url
        });
        return { exists: true, url };
      }
    }

    logger.info('Repo not found in DocSmith sitemap', { repoName });
    return { exists: false, url: null };

  } catch (error) {
    logger.warn('Sitemap check failed, allowing processing', {
      repoName,
      error: error.message
    });
    // On error, allow processing to continue
    return { exists: false, url: null, error: error.message };
  }
}

/**
 * Filter out repos that are already documented
 */
export async function filterAlreadyDocumented(repos) {
  logger.info('Checking repos against DocSmith sitemap', { count: repos.length });

  const results = await Promise.all(
    repos.map(async (repo) => {
      const check = await isRepoAlreadyDocumented(repo.name);
      return { repo, ...check };
    })
  );

  const newRepos = results.filter(r => !r.exists).map(r => r.repo);
  const existingRepos = results.filter(r => r.exists).map(r => ({
    name: r.repo.name,
    existingUrl: r.url
  }));

  if (existingRepos.length > 0) {
    logger.info('Filtered out already-documented repos', {
      filtered: existingRepos.map(r => r.name),
      remaining: newRepos.length
    });
  }

  return {
    newRepos,
    existingRepos,
    totalChecked: repos.length
  };
}

/**
 * Get list of all documented repos from sitemap
 */
export async function getDocumentedRepos() {
  const sitemapUrls = await fetchSitemap();
  const repos = new Set();

  for (const url of sitemapUrls) {
    const repo = extractRepoFromUrl(url);
    if (repo) {
      repos.add(repo);
    }
  }

  return Array.from(repos);
}

export default {
  fetchSitemap,
  isRepoAlreadyDocumented,
  filterAlreadyDocumented,
  getDocumentedRepos
};
