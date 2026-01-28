#!/usr/bin/env node

/**
 * DocSmith Automation - Main Orchestrator
 *
 * Runs the daily automation workflow:
 * 1. Fetch trending GitHub repos
 * 2. Filter out excluded/processed repos
 * 3. Clone selected repos
 * 4. Run doc-smith workflow (create, images, localize, check, publish)
 * 5. Cleanup cloned repos
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

import logger from './utils/logger.mjs';
import { loadState, saveState, updateCurrentTask, markTaskComplete, addPendingRetry, removePendingRetry } from './utils/state.mjs';
import { fetchTrendingRepos, selectRepos } from './components/trending-fetcher.mjs';
import { exclusionManager } from './components/exclusion-manager.mjs';
import { cloneRepo } from './components/repo-cloner.mjs';
import { runWorkflow } from './components/docsmith-runner.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const CONFIG_FILE = join(ROOT_DIR, 'config', 'settings.yaml');

/**
 * Load settings from YAML config
 */
function loadSettings() {
  try {
    const content = readFileSync(CONFIG_FILE, 'utf8');
    return parseYaml(content);
  } catch (error) {
    logger.error('Failed to load settings', { error: error.message });
    throw error;
  }
}

/**
 * Process a single repository through the doc-smith workflow
 */
async function processRepository(repo, state) {
  const startTime = Date.now();

  logger.info(`Processing repository: ${repo.name}`, {
    stars: repo.stars,
    language: repo.language
  });

  // Update current task in state
  updateCurrentTask(state, {
    repo: repo.name,
    step: 'cloning',
    status: 'in_progress'
  });

  try {
    // Clone the repository
    const repoPath = await cloneRepo(repo.name);

    // Update step
    updateCurrentTask(state, {
      repo: repo.name,
      step: 'doc-smith',
      status: 'in_progress'
    });

    // Run the doc-smith workflow with state updates on each step
    const result = await runWorkflow(repoPath, repo.name, {
      repoUrl: `https://github.com/${repo.name}`,
      onStepStart: (stepName, description) => {
        updateCurrentTask(state, {
          repo: repo.name,
          step: stepName,
          stepDescription: description,
          status: 'in_progress'
        });
        // Save state immediately so dashboard can see updates
        saveState(state);
        logger.info(`Step started: ${stepName}`, { repo: repo.name, description });
      },
      onStepComplete: (stepName, success) => {
        logger.info(`Step completed: ${stepName}`, { repo: repo.name, success });
        // Save state after each step
        saveState(state);
      },
      onStepError: (stepName, error) => {
        logger.error(`Step failed: ${stepName}`, { repo: repo.name, error: error.message });
        saveState(state);
      }
    });

    const processingTime = Date.now() - startTime;

    if (result.success) {
      // Mark as processed in exclusions
      await exclusionManager.markProcessed(repo.name);

      // Update statistics
      markTaskComplete(state, repo.name, true, processingTime);
      removePendingRetry(state, repo.name);

      logger.info(`Successfully processed: ${repo.name}`, {
        durationMs: processingTime
      });

      return true;
    } else {
      markTaskComplete(state, repo.name, false, processingTime);
      addPendingRetry(state, repo.name, 'Workflow failed');

      logger.error(`Failed to process: ${repo.name}`);
      return false;
    }

  } catch (error) {
    const processingTime = Date.now() - startTime;

    markTaskComplete(state, repo.name, false, processingTime);
    addPendingRetry(state, repo.name, error.message);

    logger.error(`Error processing repository: ${repo.name}`, {
      error: error.message
    });

    return false;
  }
}

/**
 * Main automation entry point
 */
async function main() {
  logger.info('='.repeat(60));
  logger.info('DocSmith Daily Automation Starting');
  logger.info('='.repeat(60));

  try {
    // Load configuration
    const settings = loadSettings();
    logger.info('Loaded settings', {
      dailyLimit: settings.processing.dailyLimit,
      minStars: settings.processing.minStars
    });

    // Load state
    const state = loadState();
    logger.info('Loaded state', {
      todayProcessed: state.todayProcessed,
      totalProcessed: state.statistics.totalProcessed
    });

    // Check if daily limit reached
    if (state.todayProcessed >= settings.processing.dailyLimit) {
      logger.info('Daily processing limit reached', {
        processed: state.todayProcessed,
        limit: settings.processing.dailyLimit
      });
      return;
    }

    // Load exclusions
    await exclusionManager.load();

    // Fetch trending repos
    const trending = await fetchTrendingRepos({ limit: 50 });

    // Filter excluded repos
    const candidates = exclusionManager.filter(trending);

    if (candidates.length === 0) {
      logger.warn('No candidate repositories found after filtering');
      return;
    }

    // Select repos to process (up to remaining daily limit)
    const remaining = settings.processing.dailyLimit - state.todayProcessed;
    const selected = selectRepos(candidates, {
      count: remaining,
      minStars: settings.processing.minStars,
      preferredLanguages: settings.processing.preferredLanguages
    });

    logger.info(`Selected ${selected.length} repos for processing`);

    // Process each selected repo
    let successCount = 0;
    let failureCount = 0;

    for (const repo of selected) {
      const success = await processRepository(repo, state);

      if (success) {
        successCount++;
      } else {
        failureCount++;
      }

      // Small delay between repos
      if (selected.indexOf(repo) < selected.length - 1) {
        logger.debug('Waiting before next repo...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // Final state save
    saveState(state);

    logger.info('='.repeat(60));
    logger.info('DocSmith Daily Automation Complete', {
      success: successCount,
      failed: failureCount,
      todayTotal: state.todayProcessed
    });
    logger.info('='.repeat(60));

  } catch (error) {
    logger.error('Automation failed with error', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Run if executed directly
main().catch(error => {
  logger.error('Unhandled error in main', { error: error.message });
  process.exit(1);
});
