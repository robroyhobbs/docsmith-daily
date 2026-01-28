#!/usr/bin/env node

/**
 * DocSmith Automation - CLI Interface
 *
 * Usage:
 *   node src/cli.mjs                      # Show help
 *   node src/cli.mjs process <repo>       # Process a specific repo
 *   node src/cli.mjs status               # Show current status
 *   node src/cli.mjs history              # Show processing history
 *   node src/cli.mjs trending             # Show current trending repos
 */

import { loadState, getHistory } from './utils/state.mjs';
import { exclusionManager } from './components/exclusion-manager.mjs';
import { fetchTrendingRepos, selectRepos } from './components/trending-fetcher.mjs';
import { cloneRepo } from './components/repo-cloner.mjs';
import { runWorkflow } from './components/docsmith-runner.mjs';
import logger from './utils/logger.mjs';
import chalk from 'chalk';

const commands = {
  help: showHelp,
  process: processRepo,
  status: showStatus,
  history: showHistory,
  trending: showTrending,
  exclusions: showExclusions
};

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const commandArgs = args.slice(1);

  if (commands[command]) {
    await commands[command](commandArgs);
  } else {
    console.log(chalk.red(`Unknown command: ${command}`));
    showHelp();
  }
}

function showHelp() {
  console.log(`
${chalk.bold('DocSmith Automation CLI')}

${chalk.yellow('Usage:')}
  npm run manual -- <command> [options]

${chalk.yellow('Commands:')}
  ${chalk.green('process <owner/repo>')}  Process a specific GitHub repository
  ${chalk.green('status')}                Show current automation status
  ${chalk.green('history')}               Show recent processing history
  ${chalk.green('trending')}              Show current trending repos
  ${chalk.green('exclusions')}            Show excluded repositories
  ${chalk.green('help')}                  Show this help message

${chalk.yellow('Examples:')}
  npm run manual -- process facebook/react
  npm run manual -- status
  npm run manual -- trending
`);
}

async function processRepo(args) {
  const repoName = args[0];

  if (!repoName) {
    console.log(chalk.red('Error: Repository name required'));
    console.log('Usage: npm run manual -- process <owner/repo>');
    return;
  }

  if (!repoName.includes('/')) {
    console.log(chalk.red('Error: Invalid repository format'));
    console.log('Expected format: owner/repo (e.g., facebook/react)');
    return;
  }

  console.log(chalk.blue(`\nProcessing repository: ${repoName}\n`));

  try {
    // Clone
    console.log(chalk.yellow('Cloning repository...'));
    const repoPath = await cloneRepo(repoName);
    console.log(chalk.green(`Cloned to: ${repoPath}\n`));

    // Run workflow
    console.log(chalk.yellow('Running doc-smith workflow...\n'));

    const result = await runWorkflow(repoPath, repoName, {
      onStepStart: (step, description) => {
        console.log(chalk.cyan(`  > ${step}: ${description}`));
      },
      onStepComplete: (step, success) => {
        console.log(chalk.green(`    Done`));
      },
      onStepError: (step, error) => {
        console.log(chalk.red(`    Failed: ${error.message}`));
      }
    });

    console.log();

    if (result.success) {
      console.log(chalk.green.bold('Workflow completed successfully!'));
      console.log(`Duration: ${Math.round(result.durationMs / 1000)}s`);

      // Mark as processed
      await exclusionManager.load();
      await exclusionManager.markProcessed(repoName);
    } else {
      console.log(chalk.red.bold('Workflow failed'));
      const failedStep = result.steps.find(s => !s.success);
      if (failedStep) {
        console.log(`Failed at step: ${failedStep.name}`);
        console.log(`Error: ${failedStep.error}`);
      }
    }

  } catch (error) {
    console.log(chalk.red(`\nError: ${error.message}`));
  }
}

async function showStatus() {
  const state = loadState();

  console.log(`
${chalk.bold('DocSmith Automation Status')}
${chalk.gray('─'.repeat(40))}

${chalk.yellow('Today:')}
  Processed: ${state.todayProcessed}
  Date: ${state.todayDate || 'N/A'}

${chalk.yellow('All Time Statistics:')}
  Total Processed: ${state.statistics.totalProcessed}
  Success: ${chalk.green(state.statistics.successCount)}
  Failed: ${chalk.red(state.statistics.failureCount)}
  Avg Time: ${Math.round(state.statistics.averageProcessingTimeMs / 1000)}s

${chalk.yellow('Current Task:')}
  ${state.currentTask ? `${state.currentTask.repo} (${state.currentTask.step})` : 'None'}

${chalk.yellow('Pending Retries:')} ${state.pendingRetries.length}
${state.pendingRetries.map(r => `  - ${r.repoName} (attempts: ${r.retryCount})`).join('\n') || '  None'}

${chalk.yellow('Last Run:')}
  ${state.lastRun || 'Never'}
`);
}

async function showHistory() {
  const history = getHistory();
  const entries = history.entries.slice(-20).reverse();

  console.log(`
${chalk.bold('Recent Processing History')}
${chalk.gray('─'.repeat(60))}
`);

  if (entries.length === 0) {
    console.log('  No processing history yet.');
    return;
  }

  for (const entry of entries) {
    const status = entry.success ? chalk.green('OK') : chalk.red('FAIL');
    const time = new Date(entry.processedAt).toLocaleString();
    const duration = `${Math.round(entry.processingTimeMs / 1000)}s`;

    console.log(`  ${status} ${chalk.white(entry.repoName.padEnd(35))} ${chalk.gray(time)} (${duration})`);
  }

  console.log();
}

async function showTrending() {
  console.log(chalk.yellow('\nFetching trending repositories...\n'));

  try {
    const trending = await fetchTrendingRepos({ limit: 20 });

    // Load exclusions to mark which are excluded
    await exclusionManager.load();

    console.log(`${chalk.bold('Trending GitHub Repositories')}`);
    console.log(`${chalk.gray('─'.repeat(80))}`);
    console.log();

    for (const repo of trending) {
      const excluded = exclusionManager.isExcluded(repo.name);
      const status = excluded ? chalk.red('[EXCLUDED]') : chalk.green('[AVAILABLE]');

      console.log(`${status} ${chalk.white.bold(repo.name)}`);
      console.log(`   ${chalk.gray(repo.description?.slice(0, 70) || 'No description')}`);
      console.log(`   ${chalk.yellow(repo.language)} | ${chalk.cyan(`${repo.stars} stars`)} | Score: ${repo.score.toFixed(1)}`);
      console.log();
    }

  } catch (error) {
    console.log(chalk.red(`Error: ${error.message}`));
  }
}

async function showExclusions() {
  await exclusionManager.load();

  const showcase = exclusionManager.getShowcaseProjects();
  const processed = exclusionManager.getProcessedRepos();

  console.log(`
${chalk.bold('Exclusion Configuration')}
${chalk.gray('─'.repeat(50))}

${chalk.yellow('Showcase Projects (Patterns):')}
${showcase.map(p => `  - ${p.name}: ${chalk.gray(p.pattern)}`).join('\n') || '  None'}

${chalk.yellow('Processed Repositories:')} ${processed.length}
${processed.slice(-10).map(r => `  - ${r}`).join('\n') || '  None'}
${processed.length > 10 ? chalk.gray(`  ... and ${processed.length - 10} more`) : ''}
`);
}

main().catch(error => {
  console.error(chalk.red(`Fatal error: ${error.message}`));
  process.exit(1);
});
