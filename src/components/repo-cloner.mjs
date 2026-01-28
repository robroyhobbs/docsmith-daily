import simpleGit from 'simple-git';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, readdirSync } from 'node:fs';
import logger from '../utils/logger.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..', '..');
const WORKSPACE_DIR = join(ROOT_DIR, 'workspace');

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

    logger.info(`Successfully cloned: ${repoName}`);
    return repoDir;

  } catch (error) {
    logger.error(`Failed to clone repository: ${repoName}`, { error: error.message });
    throw error;
  }
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
