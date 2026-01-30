import simpleGit from 'simple-git';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import logger from '../utils/logger.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..', '..');
const WORKSPACE_DIR = join(ROOT_DIR, 'workspace');

// Limits to prevent processing repos that are too large
const MAX_FILE_COUNT = 200;  // Skip repos with more than 200 files
const MAX_REPO_SIZE_MB = 50; // Skip repos larger than 50MB

/**
 * Clone a GitHub repository to the workspace
 */
export async function cloneRepo(repoName, options = {}) {
  const { depth = 1 } = options;

  const repoDir = getRepoDir(repoName);
  const cloneUrl = `https://github.com/${repoName}.git`;

  logger.info(`Cloning repository: ${repoName}`, { cloneUrl, repoDir });

  // Clean up if directory already exists
  if (existsSync(repoDir)) {
    logger.warn(`Repository directory already exists, removing: ${repoDir}`);
    rmSync(repoDir, { recursive: true, force: true });
  }

  try {
    const git = simpleGit();

    await git.clone(cloneUrl, repoDir, [
      '--depth', String(depth),
      '--single-branch'
    ]);

    // Check repo size after cloning
    const stats = getRepoStats(repoDir);
    logger.info(`Repo stats: ${repoName}`, stats);

    if (stats.fileCount > MAX_FILE_COUNT) {
      logger.warn(`Repo too large (${stats.fileCount} files > ${MAX_FILE_COUNT}), skipping: ${repoName}`);
      rmSync(repoDir, { recursive: true, force: true });
      throw new Error(`Repository too large: ${stats.fileCount} files exceeds limit of ${MAX_FILE_COUNT}`);
    }

    if (stats.sizeMB > MAX_REPO_SIZE_MB) {
      logger.warn(`Repo too large (${stats.sizeMB}MB > ${MAX_REPO_SIZE_MB}MB), skipping: ${repoName}`);
      rmSync(repoDir, { recursive: true, force: true });
      throw new Error(`Repository too large: ${stats.sizeMB}MB exceeds limit of ${MAX_REPO_SIZE_MB}MB`);
    }

    logger.info(`Successfully cloned: ${repoName}`);
    return repoDir;

  } catch (error) {
    logger.error(`Failed to clone repository: ${repoName}`, { error: error.message });
    throw error;
  }
}

/**
 * Get statistics about a cloned repo
 */
function getRepoStats(repoDir) {
  let fileCount = 0;
  let totalSize = 0;

  function walkDir(dir) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else {
          fileCount++;
          try {
            const stat = statSync(fullPath);
            totalSize += stat.size;
          } catch (e) {
            // Ignore stat errors
          }
        }
      }
    } catch (e) {
      // Ignore directory read errors
    }
  }

  walkDir(repoDir);

  return {
    fileCount,
    sizeMB: Math.round(totalSize / 1024 / 1024 * 10) / 10
  };
}

/**
 * Delete a cloned repository from workspace
 */
export function deleteRepo(repoName) {
  const repoDir = getRepoDir(repoName);

  if (existsSync(repoDir)) {
    logger.info(`Deleting repository: ${repoName}`);
    try {
      rmSync(repoDir, { recursive: true, force: true });
      logger.info(`Successfully deleted: ${repoName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete repository: ${repoName}`, { error: error.message });
      return false;
    }
  }

  logger.debug(`Repository directory does not exist: ${repoDir}`);
  return true;
}

/**
 * Get the local directory path for a repo
 */
export function getRepoDir(repoName) {
  // Replace / with _ for directory name
  const dirName = repoName.replace('/', '_');
  return join(WORKSPACE_DIR, dirName);
}

/**
 * Check if a repo is already cloned
 */
export function isCloned(repoName) {
  const repoDir = getRepoDir(repoName);
  return existsSync(repoDir);
}

/**
 * Get workspace directory
 */
export function getWorkspaceDir() {
  return WORKSPACE_DIR;
}

/**
 * Clean up all repos in workspace
 */
export function cleanupWorkspace() {
  logger.info('Cleaning up entire workspace');
  try {
    if (existsSync(WORKSPACE_DIR)) {
      const entries = readdirSync(WORKSPACE_DIR);

      for (const entry of entries) {
        if (entry === '.gitkeep') continue;
        const entryPath = join(WORKSPACE_DIR, entry);
        rmSync(entryPath, { recursive: true, force: true });
        logger.debug(`Deleted: ${entry}`);
      }
    }
    logger.info('Workspace cleanup complete');
    return true;
  } catch (error) {
    logger.error('Failed to cleanup workspace', { error: error.message });
    return false;
  }
}

export default {
  cloneRepo,
  deleteRepo,
  getRepoDir,
  isCloned,
  getWorkspaceDir,
  cleanupWorkspace
};
