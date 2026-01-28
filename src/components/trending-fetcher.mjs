import logger from '../utils/logger.mjs';

const OSS_INSIGHT_API = 'https://api.ossinsight.io/v1/trends/repos';

/**
 * Fetch trending repositories from OSS Insight API
 */
export async function fetchTrendingRepos(options = {}) {
  const { limit = 50 } = options;

  logger.info('Fetching trending repositories from OSS Insight API', { limit });

  try {
    const url = `${OSS_INSIGHT_API}?limit=${limit}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    const json = await response.json();

    if (!json.data || !json.data.rows) {
      throw new Error('Invalid API response structure');
    }

    const repos = json.data.rows.map(row => ({
      id: row.repo_id,
      name: row.repo_name,           // Format: "owner/repo"
      language: row.primary_language || 'Unknown',
      description: row.description || '',
      stars: parseInt(row.stars) || 0,
      forks: parseInt(row.forks) || 0,
      score: parseFloat(row.total_score) || 0,
      pullRequests: parseInt(row.pull_requests) || 0,
      pushes: parseInt(row.pushes) || 0,
      contributors: row.contributor_logins ? row.contributor_logins.split(',') : [],
      collections: row.collection_names ? row.collection_names.split(',') : []
    }));

    logger.info(`Fetched ${repos.length} trending repositories`);
    return repos;

  } catch (error) {
    logger.error('Failed to fetch trending repos', { error: error.message });
    throw error;
  }
}

/**
 * Select top repos based on criteria
 */
export function selectRepos(repos, options = {}) {
  const {
    count = 3,
    minStars = 100,
    preferredLanguages = ['TypeScript', 'JavaScript', 'Python', 'Go', 'Rust']
  } = options;

  // Filter by minimum stars
  let filtered = repos.filter(repo => repo.stars >= minStars);

  // Sort by score (OSS Insight's calculated popularity metric)
  // Then by preferred language bonus
  filtered.sort((a, b) => {
    const aLangBonus = preferredLanguages.includes(a.language) ? 100 : 0;
    const bLangBonus = preferredLanguages.includes(b.language) ? 100 : 0;
    return (b.score + bLangBonus) - (a.score + aLangBonus);
  });

  const selected = filtered.slice(0, count);
  logger.info(`Selected ${selected.length} repos for processing`, {
    repos: selected.map(r => r.name)
  });

  return selected;
}

/**
 * Get GitHub clone URL from repo name
 */
export function getCloneUrl(repoName) {
  return `https://github.com/${repoName}.git`;
}

export default {
  fetchTrendingRepos,
  selectRepos,
  getCloneUrl
};
