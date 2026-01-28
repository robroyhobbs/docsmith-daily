#!/usr/bin/env node

/**
 * DocSmith Automation - Terminal Dashboard
 *
 * A real-time dashboard for monitoring the automation process.
 *
 * Features:
 * - Current task status
 * - Statistics display
 * - Progress gauge
 * - Real-time log viewer
 * - Keyboard shortcuts
 */

import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { readFileSync, existsSync, watchFile, unwatchFile } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..', '..');
const DATA_DIR = join(ROOT_DIR, 'data');
const LOGS_DIR = join(ROOT_DIR, 'logs');
const CONFIG_DIR = join(ROOT_DIR, 'config');

class AutomationDashboard {
  constructor() {
    this.screen = null;
    this.grid = null;
    this.widgets = {};
    this.refreshInterval = null;
    this.logWatcher = null;
    this.lastLogPosition = 0;
  }

  init() {
    // Create screen
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'DocSmith Automation Dashboard',
      fullUnicode: true
    });

    // Create grid layout (12x12)
    this.grid = new contrib.grid({
      rows: 12,
      cols: 12,
      screen: this.screen
    });

    this.createWidgets();
    this.bindKeys();
    this.startRefresh();
    this.watchLogs();

    // Initial render
    this.refresh();
    this.screen.render();
  }

  createWidgets() {
    // Header/Title (row 0, full width)
    this.widgets.header = this.grid.set(0, 0, 1, 12, blessed.box, {
      content: '{center}{bold}DocSmith Automation Dashboard{/bold}{/center}',
      tags: true,
      style: {
        fg: 'white',
        bg: 'blue'
      }
    });

    // Statistics panel (row 1-3, left half)
    this.widgets.stats = this.grid.set(1, 0, 3, 6, contrib.table, {
      keys: true,
      fg: 'green',
      label: ' Statistics ',
      columnSpacing: 2,
      columnWidth: [20, 15]
    });

    // Current task panel (row 1-3, right half)
    this.widgets.currentTask = this.grid.set(1, 6, 3, 6, blessed.box, {
      label: ' Current Task ',
      tags: true,
      border: { type: 'line' },
      style: {
        fg: 'white',
        border: { fg: 'cyan' }
      }
    });

    // Progress gauge (row 4-5, left half)
    this.widgets.progress = this.grid.set(4, 0, 2, 6, contrib.gauge, {
      label: ' Daily Progress ',
      stroke: 'green',
      fill: 'white'
    });

    // Pending retries (row 4-5, right half)
    this.widgets.retries = this.grid.set(4, 6, 2, 6, contrib.table, {
      label: ' Pending Retries ',
      fg: 'yellow',
      columnSpacing: 2,
      columnWidth: [30, 8, 20]
    });

    // Recent history (row 6-8)
    this.widgets.history = this.grid.set(6, 0, 3, 12, contrib.table, {
      keys: true,
      fg: 'white',
      label: ' Recent Processing History ',
      columnSpacing: 2,
      columnWidth: [35, 8, 25, 10]
    });

    // Log viewer (row 9-11)
    this.widgets.logs = this.grid.set(9, 0, 3, 12, contrib.log, {
      fg: 'green',
      label: ' Automation Logs (Press L to scroll) ',
      scrollbar: {
        ch: ' ',
        inverse: true
      }
    });
  }

  bindKeys() {
    // Quit
    this.screen.key(['escape', 'q', 'C-c'], () => {
      this.cleanup();
      process.exit(0);
    });

    // Manual refresh
    this.screen.key(['r'], () => {
      this.refresh();
      this.screen.render();
    });

    // Focus log viewer for scrolling
    this.screen.key(['l'], () => {
      this.widgets.logs.focus();
    });

    // Help
    this.screen.key(['h', '?'], () => {
      this.showHelp();
    });
  }

  startRefresh() {
    // Refresh every 2 seconds for more responsive updates
    this.refreshInterval = setInterval(() => {
      this.refresh();
      this.screen.render();
    }, 2000);

    // Also watch state.json for instant updates
    const stateFile = join(DATA_DIR, 'state.json');
    if (existsSync(stateFile)) {
      watchFile(stateFile, { interval: 500 }, () => {
        this.refresh();
        this.screen.render();
      });
    }
  }

  watchLogs() {
    const logFile = join(LOGS_DIR, 'automation.log');

    if (existsSync(logFile)) {
      // Get initial file size
      const stats = readFileSync(logFile);
      this.lastLogPosition = stats.length;

      // Watch for changes
      watchFile(logFile, { interval: 1000 }, () => {
        this.updateLogs();
      });
    }
  }

  updateLogs() {
    const logFile = join(LOGS_DIR, 'automation.log');

    if (!existsSync(logFile)) return;

    try {
      const content = readFileSync(logFile, 'utf8');
      const lines = content.split('\n').filter(Boolean);

      // Get last 50 lines
      const recentLines = lines.slice(-50);

      // Parse JSON log lines and format them
      for (const line of recentLines.slice(-10)) {
        try {
          const entry = JSON.parse(line);
          const time = new Date(entry.timestamp).toLocaleTimeString();
          const level = entry.level.toUpperCase().padEnd(5);
          const msg = `${time} [${level}] ${entry.message}`;
          this.widgets.logs.log(msg);
        } catch {
          // Not JSON, log as-is
          this.widgets.logs.log(line);
        }
      }

      this.screen.render();
    } catch (error) {
      // Ignore read errors
    }
  }

  refresh() {
    const state = this.loadState();
    const settings = this.loadSettings();
    const history = this.loadHistory();

    // Update statistics
    this.widgets.stats.setData({
      headers: ['Metric', 'Value'],
      data: [
        ['Total Processed', String(state.statistics?.totalProcessed || 0)],
        ['Success Count', String(state.statistics?.successCount || 0)],
        ['Failure Count', String(state.statistics?.failureCount || 0)],
        ['Today Processed', String(state.todayProcessed || 0)],
        ['Avg Time (sec)', String(Math.round((state.statistics?.averageProcessingTimeMs || 0) / 1000))],
        ['Last Run', state.lastRun ? new Date(state.lastRun).toLocaleString() : 'Never']
      ]
    });

    // Update current task
    const lastUpdated = state.lastUpdated ? new Date(state.lastUpdated).toLocaleTimeString() : 'N/A';
    if (state.currentTask) {
      const stepDesc = state.currentTask.stepDescription || state.currentTask.step || 'N/A';
      this.widgets.currentTask.setContent(`
{bold}Repository:{/bold} ${state.currentTask.repo || 'N/A'}
{bold}Step:{/bold} ${state.currentTask.step || 'N/A'}
{bold}Description:{/bold} ${stepDesc}
{bold}Status:{/bold} {yellow-fg}${state.currentTask.status || 'unknown'}{/yellow-fg}
{bold}Started:{/bold} ${state.currentTask.startedAt ? new Date(state.currentTask.startedAt).toLocaleTimeString() : 'N/A'}
{gray-fg}Updated: ${state.currentTask.updatedAt ? new Date(state.currentTask.updatedAt).toLocaleTimeString() : 'N/A'}{/gray-fg}
`);
    } else {
      this.widgets.currentTask.setContent(`
{gray-fg}No active task{/gray-fg}

{bold}Daily Limit:{/bold} ${settings?.processing?.dailyLimit || 3}
{bold}Remaining:{/bold} ${(settings?.processing?.dailyLimit || 3) - (state.todayProcessed || 0)}

{gray-fg}Last updated: ${lastUpdated}{/gray-fg}
`);
    }

    // Update progress gauge
    const dailyLimit = settings?.processing?.dailyLimit || 3;
    const todayProcessed = state.todayProcessed || 0;
    const progressPercent = Math.min(100, Math.round((todayProcessed / dailyLimit) * 100));
    this.widgets.progress.setPercent(progressPercent);

    // Update pending retries
    const retries = state.pendingRetries || [];
    this.widgets.retries.setData({
      headers: ['Repository', 'Attempts', 'Last Error'],
      data: retries.length > 0
        ? retries.map(r => [
            r.repoName?.slice(0, 28) || 'Unknown',
            String(r.retryCount || 0),
            (r.lastError || 'Unknown').slice(0, 18)
          ])
        : [['No pending retries', '', '']]
    });

    // Update history
    const entries = (history.entries || []).slice(-10).reverse();
    this.widgets.history.setData({
      headers: ['Repository', 'Status', 'Processed At', 'Duration'],
      data: entries.length > 0
        ? entries.map(e => [
            e.repoName?.slice(0, 33) || 'Unknown',
            e.success ? 'OK' : 'FAIL',
            new Date(e.processedAt).toLocaleString(),
            `${Math.round((e.processingTimeMs || 0) / 1000)}s`
          ])
        : [['No history yet', '', '', '']]
    });
  }

  loadState() {
    const stateFile = join(DATA_DIR, 'state.json');
    try {
      if (existsSync(stateFile)) {
        return JSON.parse(readFileSync(stateFile, 'utf8'));
      }
    } catch (error) {
      // Ignore
    }
    return { statistics: {}, pendingRetries: [] };
  }

  loadSettings() {
    const settingsFile = join(CONFIG_DIR, 'settings.yaml');
    try {
      if (existsSync(settingsFile)) {
        return parseYaml(readFileSync(settingsFile, 'utf8'));
      }
    } catch (error) {
      // Ignore
    }
    return { processing: { dailyLimit: 3 } };
  }

  loadHistory() {
    const historyFile = join(DATA_DIR, 'history.json');
    try {
      if (existsSync(historyFile)) {
        return JSON.parse(readFileSync(historyFile, 'utf8'));
      }
    } catch (error) {
      // Ignore
    }
    return { entries: [] };
  }

  showHelp() {
    const helpBox = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 50,
      height: 15,
      border: { type: 'line' },
      label: ' Keyboard Shortcuts ',
      tags: true,
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' }
      },
      content: `
  {bold}Key{/bold}        {bold}Action{/bold}

  {yellow-fg}q, Esc{/yellow-fg}    Quit dashboard
  {yellow-fg}r{/yellow-fg}         Refresh data
  {yellow-fg}l{/yellow-fg}         Focus log viewer (scroll)
  {yellow-fg}h, ?{/yellow-fg}      Show this help

  {gray-fg}Press any key to close{/gray-fg}
`
    });

    this.screen.key(['space', 'enter', 'escape'], () => {
      helpBox.destroy();
      this.screen.render();
    });

    this.screen.render();
  }

  cleanup() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    const logFile = join(LOGS_DIR, 'automation.log');
    if (existsSync(logFile)) {
      unwatchFile(logFile);
    }
  }

  run() {
    this.init();
  }
}

// Run dashboard
const dashboard = new AutomationDashboard();
dashboard.run();
