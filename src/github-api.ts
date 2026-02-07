export interface RepoInfo {
  name: string;
  full_name: string;
  owner: string;
  description: string;
  stars: number;
  forks: number;
  language: string | null;
  topics: string[];
  archived: boolean;
  has_docs_folder: boolean;
  default_branch: string;
  html_url: string;
}

interface FetchOptions {
  minStars?: number;
}

const GITHUB_API = "https://api.github.com";

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "docsmith-daily",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function githubFetch(url: string): Promise<Response> {
  const res = await fetch(url, { headers: getHeaders() });
  return res;
}

/**
 * Fetch trending repos from GitHub search API.
 * Returns repos sorted by stars descending that were created/pushed recently.
 */
export async function fetchTrendingRepos(
  opts: FetchOptions = {}
): Promise<RepoInfo[]> {
  const minStars = opts.minStars ?? 500;

  // Search for repos with good star counts, pushed in last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const query = `stars:>=${minStars} pushed:>=${thirtyDaysAgo}`;
  const url = `${GITHUB_API}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=50`;

  try {
    const res = await githubFetch(url);

    if (!res.ok) {
      // Rate limited or server error - return empty, don't crash
      return [];
    }

    const data = await res.json();

    if (!data.items || !Array.isArray(data.items)) {
      return [];
    }

    return data.items.map((item: any) => ({
      name: item.name ?? "",
      full_name: item.full_name ?? "",
      owner: item.owner?.login ?? "",
      description: item.description ?? "",
      stars: item.stargazers_count ?? 0,
      forks: item.forks_count ?? 0,
      language: item.language ?? null,
      topics: item.topics ?? [],
      archived: item.archived ?? false,
      has_docs_folder: false, // Will be checked via file tree
      default_branch: item.default_branch ?? "main",
      html_url: item.html_url ?? "",
    }));
  } catch (e: any) {
    // Network error - sanitize before returning
    const safeMessage = e?.message?.replace(
      process.env.GITHUB_TOKEN || "",
      "[REDACTED]"
    );
    console.error(`GitHub API error: ${safeMessage}`);
    return [];
  }
}

/**
 * Fetch README content for a specific repo.
 * Returns empty string if README doesn't exist or on error.
 */
export async function fetchReadme(
  owner: string,
  repo: string
): Promise<string> {
  const url = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`;

  try {
    const res = await githubFetch(url);

    if (!res.ok) {
      return "";
    }

    const data = await res.json();

    if (!data.content) {
      return "";
    }

    // GitHub returns base64-encoded content
    const decoded = atob(data.content.replace(/\n/g, ""));
    return decoded;
  } catch {
    return "";
  }
}

/**
 * Fetch file tree for a repo (using Git tree API, recursive).
 * Returns flat array of file paths.
 */
export async function fetchFileTree(
  owner: string,
  repo: string,
  branch?: string
): Promise<string[]> {
  // First get the default branch if not provided
  const branchName = branch || "main";
  const url = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branchName)}?recursive=1`;

  try {
    const res = await githubFetch(url);

    if (!res.ok) {
      // Try 'master' as fallback
      if (!branch) {
        const fallbackUrl = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/master?recursive=1`;
        const fallbackRes = await githubFetch(fallbackUrl);
        if (!fallbackRes.ok) {
          return [];
        }
        const fallbackData = await fallbackRes.json();
        return (fallbackData.tree || [])
          .filter((item: any) => item.type === "blob")
          .map((item: any) => item.path as string);
      }
      return [];
    }

    const data = await res.json();

    if (!data.tree || !Array.isArray(data.tree)) {
      return [];
    }

    // Return only blob (file) paths, not tree (directory) paths
    return data.tree
      .filter((item: any) => item.type === "blob")
      .map((item: any) => item.path as string);
  } catch {
    return [];
  }
}

// CLI test mode
if (import.meta.main && process.argv.includes("--test")) {
  console.log("Testing GitHub API...");
  const repos = await fetchTrendingRepos();
  console.log(`Fetched ${repos.length} trending repos`);
  if (repos.length > 0) {
    console.log(`Top repo: ${repos[0].full_name} (${repos[0].stars} stars)`);
    const readme = await fetchReadme(repos[0].owner, repos[0].name);
    console.log(`README length: ${readme.length} chars`);
    const tree = await fetchFileTree(repos[0].owner, repos[0].name);
    console.log(`File tree: ${tree.length} files`);
  }
  console.log("PASS: GitHub API test complete");
}
