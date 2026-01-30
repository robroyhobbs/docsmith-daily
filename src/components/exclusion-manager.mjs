import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import logger from '../utils/logger.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..', '..');
const EXCLUSIONS_FILE = join(ROOT_DIR, 'config', 'exclusions.json');

/**
 * Manages exclusion list for repos that shouldn't be processed
 */
export class ExclusionManager {
  constructor() {
    this.exclusions = null;
  }

  /**
   * Load exclusions from config file
   */
  async load() {
    try {
      if (existsSync(EXCLUSIONS_FILE)) {
        const data = readFileSync(EXCLUSIONS_FILE, 'utf8');
        this.exclusions = JSON.parse(data);
        logger.debug('Loaded exclusions config', {
          showcaseProjects: this.exclusions.showcaseProjects?.length || 0,
          processedRepos: this.exclusions.processedRepos?.length || 0
        });
      } else {
        this.exclusions = {
          version: '1.0',
          lastUpdated: new Date().toISOString(),
          showcaseProjects: [],
          processedRepos: []
        };
      }
    } catch (error) {
      logger.error('Failed to load exclusions', { error: error.message });
      throw error;
    }
    return this.exclusions;
  }

  /**
   * Save exclusions to config file
   */
  async save() {
    try {
      this.exclusions.lastUpdated = new Date().toISOString();
      writeFileSync(EXCLUSIONS_FILE, JSON.stringify(this.exclusions, null, 2));
      logger.debug('Saved exclusions config');
    } catch (error) {
      logger.error('Failed to save exclusions', { error: error.message });
      throw error;
    }
  }

  /**
   * Check if a repo should be excluded
   */
  isExcluded(repoName) {
    if (!this.exclusions) {
      throw new Error('Exclusions not loaded. Call load() first.');
    }

    const repoLower = repoName.toLowerCase();

    // Check showcase project patterns
    for (const project of this.exclusions.showcaseProjects || []) {
      if (project.type === 'regex') {
        try {
          const regex = new RegExp(project.pattern, 'i');
          if (regex.test(repoLower)) {
            logger.debug(`Repo ${repoName} excluded by pattern: ${project.name}`);
            return true;
          }
        } catch (e) {
          logger.warn(`Invalid regex pattern for ${project.name}: ${project.pattern}`);
        }
      } else {
        // Exact match (case-insensitive)
        if (repoLower.includes(project.pattern.toLowerCase())) {
          logger.debug(`Repo ${repoName} excluded by exact match: ${project.name}`);
          return true;
        }
      }
    }

    // Check already processed repos
    if (this.exclusions.processedRepos?.includes(repoName)) {
      logger.debug(`Repo ${repoName} already processed, excluding`);
      return true;
    }

    // Check excluded repos (failed too many times)
    if (this.isInExcludedList(repoName)) {
      logger.debug(`Repo ${repoName} in excluded list, excluding`);
      return true;
    }

    return false;
  }

  /**
   * Filter a list of repos, removing excluded ones
   */
  filter(repos) {
    const filtered = repos.filter(repo => !this.isExcluded(repo.name));
    const excluded = repos.length - filtered.length;

    if (excluded > 0) {
      logger.info(`Filtered out ${excluded} excluded repos, ${filtered.length} remaining`);
    }

    return filtered;
  }

  /**
   * Mark a repo as processed (add to exclusion list)
   */
  async markProcessed(repoName) {
    if (!this.exclusions.processedRepos) {
      this.exclusions.processedRepos = [];
    }

    if (!this.exclusions.processedRepos.includes(repoName)) {
      this.exclusions.processedRepos.push(repoName);
      await this.save();
      logger.info(`Marked repo as processed: ${repoName}`);
    }
  }

  /**
   * Mark a repo as excluded due to repeated failures
   */
  async markExcluded(repoName, reason) {
    if (!this.exclusions.excludedRepos) {
      this.exclusions.excludedRepos = [];
    }

    // Check if already excluded
    const existing = this.exclusions.excludedRepos.find(r => r.name === repoName);
    if (!existing) {
      this.exclusions.excludedRepos.push({
        name: repoName,
        reason: reason || 'Exceeded max retry attempts',
        addedAt: new Date().toISOString().split('T')[0]
      });
      await this.save();
      logger.info(`Marked repo as excluded: ${repoName} (${reason})`);
    }
  }

  /**
   * Check if a repo is in the excluded list (failed repos)
   */
  isInExcludedList(repoName) {
    if (!this.exclusions?.excludedRepos) return false;
    return this.exclusions.excludedRepos.some(r => r.name === repoName);
  }

  /**
   * Add a new showcase project exclusion pattern
   */
  async addShowcaseProject(name, pattern, type = 'regex') {
    if (!this.exclusions.showcaseProjects) {
      this.exclusions.showcaseProjects = [];
    }

    // Check if already exists
    const existing = this.exclusions.showcaseProjects.find(
      p => p.name === name || p.pattern === pattern
    );

    if (!existing) {
      this.exclusions.showcaseProjects.push({ name, pattern, type });
      await this.save();
      logger.info(`Added showcase exclusion: ${name} (${pattern})`);
    }
  }

  /**
   * Get list of processed repos
   */
  getProcessedRepos() {
    return this.exclusions?.processedRepos || [];
  }

  /**
   * Get list of showcase project patterns
   */
  getShowcaseProjects() {
    return this.exclusions?.showcaseProjects || [];
  }
}

// Default instance
export const exclusionManager = new ExclusionManager();

export default exclusionManager;
