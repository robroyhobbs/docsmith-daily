import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import logger from './logger.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..', '..');
const STATE_FILE = join(ROOT_DIR, 'data', 'state.json');
const HISTORY_FILE = join(ROOT_DIR, 'data', 'history.json');

const defaultState = {
  version: '1.0',
  lastRun: null,
  currentTask: null,
  todayProcessed: 0,
  todayDate: null,
  statistics: {
    totalProcessed: 0,
    successCount: 0,
    failureCount: 0,
    averageProcessingTimeMs: 0
  },
  pendingRetries: []
};

export function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      const data = readFileSync(STATE_FILE, 'utf8');
      const state = JSON.parse(data);

      // Reset daily counter if new day
      const today = new Date().toISOString().split('T')[0];
      if (state.todayDate !== today) {
        state.todayProcessed = 0;
        state.todayDate = today;
      }

      return state;
    }
  } catch (error) {
    logger.error('Failed to load state', { error: error.message });
  }
  return { ...defaultState, todayDate: new Date().toISOString().split('T')[0] };
}

export function saveState(state) {
  try {
    state.lastRun = new Date().toISOString();
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    logger.debug('State saved successfully');
  } catch (error) {
    logger.error('Failed to save state', { error: error.message });
    throw error;
  }
}

export function updateCurrentTask(state, task) {
  state.currentTask = task ? {
    repo: task.repo,
    step: task.step,
    stepDescription: task.stepDescription || task.step,
    status: task.status,
    startedAt: task.startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  } : null;
  state.lastUpdated = new Date().toISOString();
  saveState(state);
}

export function markTaskComplete(state, repoName, success, processingTimeMs) {
  state.currentTask = null;
  state.statistics.totalProcessed++;

  if (success) {
    state.statistics.successCount++;
    state.todayProcessed++;
  } else {
    state.statistics.failureCount++;
  }

  // Update average processing time
  const total = state.statistics.totalProcessed;
  const currentAvg = state.statistics.averageProcessingTimeMs;
  state.statistics.averageProcessingTimeMs = Math.round(
    (currentAvg * (total - 1) + processingTimeMs) / total
  );

  // Add to history
  addToHistory(repoName, success, processingTimeMs);

  saveState(state);
}

export function addPendingRetry(state, repoName, error) {
  const existing = state.pendingRetries.find(r => r.repoName === repoName);
  if (existing) {
    existing.retryCount++;
    existing.lastError = error;
    existing.failedAt = new Date().toISOString();
  } else {
    state.pendingRetries.push({
      repoName,
      failedAt: new Date().toISOString(),
      retryCount: 1,
      lastError: error
    });
  }
  saveState(state);
}

export function removePendingRetry(state, repoName) {
  state.pendingRetries = state.pendingRetries.filter(r => r.repoName !== repoName);
  saveState(state);
}

function addToHistory(repoName, success, processingTimeMs) {
  try {
    let history = { version: '1.0', entries: [] };
    if (existsSync(HISTORY_FILE)) {
      history = JSON.parse(readFileSync(HISTORY_FILE, 'utf8'));
    }

    history.entries.push({
      repoName,
      processedAt: new Date().toISOString(),
      success,
      processingTimeMs
    });

    // Keep last 1000 entries
    if (history.entries.length > 1000) {
      history.entries = history.entries.slice(-1000);
    }

    writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (error) {
    logger.error('Failed to update history', { error: error.message });
  }
}

export function getHistory() {
  try {
    if (existsSync(HISTORY_FILE)) {
      return JSON.parse(readFileSync(HISTORY_FILE, 'utf8'));
    }
  } catch (error) {
    logger.error('Failed to load history', { error: error.message });
  }
  return { version: '1.0', entries: [] };
}
