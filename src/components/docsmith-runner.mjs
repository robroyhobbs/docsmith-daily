import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import logger from '../utils/logger.mjs';
import { deleteRepo } from './repo-cloner.mjs';

// SDK disabled for now - using CLI mode which leverages existing Claude CLI auth
let query;
let sdkAvailable = false;

// Force CLI mode - SDK requires separate API key authentication
// CLI mode uses the existing Claude CLI authentication
logger.info('Using CLI mode for automation (SDK disabled)');

/**
 * Generate a comprehensive automation prompt
 */
function generateAutomationPrompt(repoName, repoUrl) {
  return `You are running in FULLY AUTOMATED mode. Do NOT ask for user confirmation at any step.
Proceed with all default options and make reasonable decisions autonomously.

TASK: Generate comprehensive, high-quality "Getting Started" documentation for the repository.

Repository: ${repoName}
URL: ${repoUrl}

CRITICAL REQUIREMENTS:
1. Documentation must be HIGHLY DETAILED and COMPREHENSIVE - this is the primary documentation for developers
2. Each major document should be substantive with real depth (see word minimums below)
3. Include MANY practical code examples that users can copy and run immediately
4. Explain the WHY behind design decisions, not just the HOW
5. Generate documentation in Chinese (zh) as the source language
6. Translate to English (en) and Japanese (ja)
7. Publish to DocSmith Cloud (https://docsmith.aigne.io)

WORKFLOW - Execute ALL steps WITHOUT stopping for confirmation:

## PHASE 1: Initialize Workspace & Analyze Repository
Create .aigne/doc-smith/ directory with config.yaml.

THOROUGHLY analyze the repository:
- Read README.md completely
- Examine package.json/Cargo.toml/go.mod/requirements.txt for dependencies
- Browse source code structure and key files
- Look at examples/ directory if present
- Check tests for usage patterns
- Read any existing documentation

IMPORTANT - Find and use project images:
- Look for logo files: logo.png, logo.svg, icon.png, favicon.ico in root, assets/, images/, public/
- Check README for embedded images or badges
- Look for screenshots in docs/, images/, screenshots/, .github/
- These images should be referenced in the documentation using AFS image slots

## PHASE 2: Create User Intent (DO NOT ASK FOR CONFIRMATION)
Write intent/user-intent.md specifying:
- Target audience: Developers wanting to use this project effectively
- Documentation purpose: Complete Getting Started guide that serves as primary resource
- Scope: Comprehensive coverage - installation, configuration, ALL major features, advanced usage, troubleshooting
- Tone: Professional, clear, practical with abundant examples
- Quality bar: This should be good enough to be the official documentation

## PHASE 3: Plan Document Structure (DO NOT ASK FOR CONFIRMATION)
Create planning/document-structure.yaml with these documents (MINIMUM):

- /overview (1000+ words minimum)
  - What the project does and why it exists
  - Key features and capabilities (detailed, not just a list)
  - Architecture overview with explanation
  - Comparison with alternatives (if applicable)
  - Use cases and when to use this project
  - Include project logo if found

- /getting-started (1500+ words minimum)
  - Prerequisites with version requirements
  - Multiple installation methods (npm/yarn/pnpm, binary, docker, source)
  - First complete working example with full code
  - Step-by-step walkthrough of the example
  - Verification that installation worked
  - Common first-time setup issues

- /configuration (1200+ words minimum)
  - ALL configuration options documented
  - Configuration file formats and locations
  - Environment variables
  - Default values and what they mean
  - Examples for common configurations
  - Configuration for different environments (dev/staging/prod)

- /usage (2000+ words minimum)
  - Core API/CLI usage with examples
  - At least 5-10 complete code examples
  - Common patterns and idioms
  - Integration with other tools/frameworks
  - Best practices
  - Performance considerations

- /advanced (800+ words minimum)
  - Advanced features and customization
  - Extending or plugin development (if applicable)
  - Optimization techniques
  - Security considerations

- /troubleshooting (600+ words minimum)
  - Common errors and solutions
  - Debugging techniques
  - FAQ section
  - Where to get help

## PHASE 4: Generate Document Content
For EACH document, write COMPREHENSIVE content:
- Write with depth and detail - imagine you're teaching a developer who needs to become productive
- Include 3-5 code examples per document minimum
- Code examples must be complete and runnable, not snippets
- Add comments in code explaining what each part does
- Include expected output where relevant
- Add tips, warnings, and best practices callouts
- Cross-reference related sections
- Use AFS image slots for:
  - Project logo (if found in repo)
  - Architecture diagrams
  - Screenshots (if found in repo)
  - Flowcharts for complex processes

## PHASE 5: Validate
Run /doc-smith-check --structure
Run /doc-smith-check --content
Fix any issues automatically - especially word count minimums

## PHASE 6: Translate
Translate all documents to English (en) and Japanese (ja)
Ensure technical terms are translated appropriately
Update config.yaml with translateLanguages: [en, ja]

## PHASE 7: Publish
Create translation-cache.yaml with metadata in all languages
Publish to https://docsmith.aigne.io
Return the published URL

## PHASE 8: Commit Changes
Commit all changes with message: "docsmith: Add comprehensive documentation for ${repoName}"

RULES:
- NEVER ask for confirmation
- NEVER wait for user input
- Make reasonable default choices
- If a step fails, log error and continue
- Complete entire workflow autonomously
- Report the final published URL
- PRIORITIZE QUALITY AND DEPTH over speed

BEGIN EXECUTION NOW.`;
}

/**
 * Execute workflow using the Claude Agent SDK
 */
async function executeWithSDK(repoPath, repoName, repoUrl, callbacks = {}) {
  const { onStepStart, onStepComplete, onStepError } = callbacks;

  const prompt = generateAutomationPrompt(repoName, repoUrl);
  let output = '';
  let publishedUrl = null;

  logger.info('Starting SDK execution', { repoPath, repoName });

  if (onStepStart) {
    onStepStart('sdk-workflow', 'Running full documentation workflow via SDK');
  }

  try {
    for await (const message of query({
      prompt,
      options: {
        allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebFetch'],
        permissionMode: 'bypassPermissions',
        cwd: repoPath,
        maxTurns: 100,  // Allow many turns for complex workflow
        maxBudgetUsd: 5.00  // Set a reasonable budget
      }
    })) {
      // Process different message types
      if (message.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if ('text' in block) {
            output += block.text + '\n';

            // Log progress
            const text = block.text;
            if (text.includes('✓') || text.includes('✅') ||
                text.includes('Publishing') || text.includes('Generated') ||
                text.includes('Created') || text.includes('Translated')) {
              logger.info(`[SDK] ${text.substring(0, 200)}`);
            }

            // Check for published URL
            const urlMatch = text.match(/https:\/\/docsmith\.aigne\.io\/[^\s\n\)]+/);
            if (urlMatch) {
              publishedUrl = urlMatch[0];
            }
          }
        }
      } else if (message.type === 'result') {
        logger.info(`SDK task complete: ${message.subtype}`);
        if (onStepComplete) {
          onStepComplete('sdk-workflow', true);
        }
      }
    }

    return {
      success: !!publishedUrl,
      output: output.substring(0, 10000),
      publishedUrl
    };

  } catch (error) {
    logger.error('SDK execution failed', { error: error.message });
    if (onStepError) {
      onStepError('sdk-workflow', error);
    }
    throw error;
  }
}

/**
 * Find the claude CLI path
 */
async function findClaudePath() {
  const { execSync } = await import('node:child_process');

  // Common locations for claude CLI
  const possiblePaths = [
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    `${process.env.HOME}/.local/bin/claude`,
    `${process.env.HOME}/.npm-global/bin/claude`,
    `${process.env.HOME}/.claude/local/claude`
  ];

  // Try to find via which command
  try {
    const whichResult = execSync('which claude', { encoding: 'utf8' }).trim();
    if (whichResult) {
      logger.info('Found claude via which', { path: whichResult });
      return whichResult;
    }
  } catch (e) {
    // which failed, try known paths
  }

  // Check known paths
  const { existsSync } = await import('node:fs');
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      logger.info('Found claude at known path', { path: p });
      return p;
    }
  }

  // Fall back to just 'claude' and hope PATH is set
  logger.warn('Could not find claude path, using bare command');
  return 'claude';
}

/**
 * Execute using CLI with spawn for real-time output capture
 */
async function executeWithCLI(repoPath, repoName, repoUrl, callbacks = {}) {
  const { spawn } = await import('node:child_process');
  const { readFile, appendFile } = await import('node:fs/promises');
  const { createWriteStream } = await import('node:fs');
  const { onStepStart, onStepComplete, onStepError } = callbacks;

  const prompt = generateAutomationPrompt(repoName, repoUrl);

  logger.info('Starting CLI execution', { repoPath, repoName });

  if (onStepStart) {
    onStepStart('cli-workflow', 'Running full documentation workflow via CLI');
  }

  // Write prompt to a temp file
  const promptFile = join(repoPath, '.docsmith-prompt.txt');
  const outputFile = join(repoPath, '.docsmith-output.txt');
  await writeFile(promptFile, prompt, 'utf8');
  await writeFile(outputFile, '', 'utf8');  // Clear/create output file
  logger.info('Wrote prompt to file', { promptFile, promptLength: prompt.length });

  // Find claude CLI
  const claudePath = await findClaudePath();
  logger.info('Using claude path', { claudePath });

  // Use spawn with stream-json output for real-time progress
  const args = [
    '--dangerously-skip-permissions',
    '-p',
    '--verbose',  // Required for stream-json
    '--output-format', 'stream-json',  // Get incremental output
    prompt  // Pass prompt directly as argument
  ];

  logger.info('Spawning claude CLI', {
    claudePath,
    argsCount: args.length,
    cwd: repoPath,
    promptLength: prompt.length
  });

  return new Promise((resolve, reject) => {
    let fullOutput = '';
    let publishedUrl = null;
    const outputStream = createWriteStream(outputFile, { flags: 'a' });

    const childProcess = spawn(claudePath, args, {
      cwd: repoPath,
      env: {
        ...process.env,
        HOME: process.env.HOME,
        PATH: `${process.env.HOME}/.local/bin:/usr/local/bin:/opt/homebrew/bin:${process.env.PATH}`,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        CI: '1'  // Signal non-interactive mode
      },
      stdio: ['ignore', 'pipe', 'pipe']  // Ignore stdin, capture stdout/stderr
    });

    logger.info('Claude CLI process started', { pid: childProcess.pid });

    // Handle stdout in real-time (stream-json format)
    let lineBuffer = '';
    childProcess.stdout.on('data', (data) => {
      const text = data.toString();
      fullOutput += text;
      outputStream.write(text);
      lineBuffer += text;

      // Process complete JSON lines
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || '';  // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const msg = JSON.parse(trimmed);
          // Log different message types
          if (msg.type === 'assistant' && msg.message?.content) {
            for (const block of msg.message.content) {
              if (block.type === 'text' && block.text) {
                const textContent = block.text.substring(0, 200);
                logger.info(`[CLI] Assistant: ${textContent}`);
                // Check for published URL
                const urlMatch = block.text.match(/https:\/\/docsmith\.aigne\.io\/[^\s\n\)"]+/);
                if (urlMatch) {
                  publishedUrl = urlMatch[0];
                  logger.info('[CLI] Found published URL', { url: publishedUrl });
                }
              } else if (block.type === 'tool_use') {
                logger.info(`[CLI] Tool: ${block.name}`, { input: JSON.stringify(block.input).substring(0, 100) });
              }
            }
          } else if (msg.type === 'result') {
            logger.info(`[CLI] Result: ${msg.subtype}`);
          } else if (msg.type === 'system') {
            logger.info(`[CLI] System: ${JSON.stringify(msg).substring(0, 150)}`);
          }
        } catch (e) {
          // Not JSON, log as plain text if interesting
          if (trimmed.includes('✓') || trimmed.includes('Publishing') ||
              trimmed.includes('Generated') || trimmed.includes('Created') ||
              trimmed.includes('docsmith')) {
            logger.info(`[CLI] ${trimmed.substring(0, 150)}`);
          }
        }
      }
    });

    // Handle stderr
    childProcess.stderr.on('data', (data) => {
      const text = data.toString();
      fullOutput += text;
      outputStream.write(text);
      logger.warn(`[CLI stderr] ${text.substring(0, 500)}`);
    });

    // Progress logging every 30 seconds
    const progressInterval = setInterval(() => {
      logger.info('[CLI] Still running...', {
        outputLength: fullOutput.length,
        hasUrl: !!publishedUrl,
        pid: childProcess.pid
      });
    }, 30000);

    // Set timeout
    const timeout = setTimeout(() => {
      logger.error('[CLI] Timeout reached (45 min), killing process');
      childProcess.kill('SIGTERM');
      setTimeout(() => childProcess.kill('SIGKILL'), 5000);
    }, 45 * 60 * 1000);

    childProcess.on('close', (code, signal) => {
      clearInterval(progressInterval);
      clearTimeout(timeout);
      outputStream.end();

      logger.info('CLI process completed', {
        code,
        signal,
        outputLength: fullOutput.length,
        hasPublishedUrl: !!publishedUrl
      });

      if (code !== 0 && !publishedUrl) {
        const error = new Error(`CLI exited with code ${code}`);
        if (onStepError) {
          onStepError('cli-workflow', error);
        }
        reject(error);
      } else {
        if (onStepComplete) {
          onStepComplete('cli-workflow', true);
        }
        resolve({
          success: !!publishedUrl,
          output: fullOutput.substring(0, 10000),
          publishedUrl
        });
      }
    });

    childProcess.on('error', (error) => {
      clearInterval(progressInterval);
      clearTimeout(timeout);
      outputStream.end();

      logger.error('CLI process error', { error: error.message });
      if (onStepError) {
        onStepError('cli-workflow', error);
      }
      reject(error);
    });
  });
}

/**
 * Execute the full doc-smith workflow for a repository
 */
export async function runWorkflow(repoPath, repoName, options = {}) {
  const { onStepStart, onStepComplete, onStepError, repoUrl } = options;

  logger.info(`Starting doc-smith workflow for: ${repoName}`, { repoPath, sdkAvailable });

  const results = {
    repoName,
    repoPath,
    startedAt: new Date().toISOString(),
    steps: [],
    success: false,
    publishedUrl: null,
    method: sdkAvailable ? 'sdk' : 'cli'
  };

  try {
    const url = repoUrl || `https://github.com/${repoName}`;

    // Try SDK first, fall back to CLI
    let result;
    if (sdkAvailable) {
      result = await executeWithSDK(repoPath, repoName, url, { onStepStart, onStepComplete, onStepError });
    } else {
      result = await executeWithCLI(repoPath, repoName, url, { onStepStart, onStepComplete, onStepError });
    }

    results.success = result.success;
    results.publishedUrl = result.publishedUrl;
    results.steps.push({
      name: 'full-workflow',
      success: result.success,
      output: result.output?.substring(0, 5000),
      completedAt: new Date().toISOString()
    });

    // Quality review before final success determination
    if (result.success) {
      try {
        const { reviewQuality } = await import('./quality-reviewer.mjs');
        const docsPath = join(repoPath, '.aigne', 'doc-smith', 'docs');

        if (onStepStart) {
          onStepStart('quality-review', 'Reviewing documentation quality');
        }

        const review = await reviewQuality(docsPath, repoName, {
          minWordCount: 300,
          requireCodeExamples: true,
          enabled: true  // Enable AI sample review
        });

        results.steps.push({
          name: 'quality-review',
          success: review.passed,
          details: review.summary,
          score: review.aiReview?.score,
          completedAt: new Date().toISOString()
        });

        if (!review.passed) {
          logger.warn('Quality review failed', { summary: review.summary });
          results.success = false;
          results.qualityIssues = review.lightweight?.issues || [];
          if (onStepError) {
            onStepError('quality-review', new Error(review.summary));
          }
        } else {
          logger.info('Quality review passed', {
            score: review.aiReview?.score,
            docs: review.lightweight?.stats?.totalDocs
          });
          if (onStepComplete) {
            onStepComplete('quality-review', true);
          }
        }
      } catch (reviewError) {
        // Don't fail the whole workflow if review errors out
        logger.warn('Quality review error (continuing)', { error: reviewError.message });
      }
    }

    logger.info(`Workflow completed`, {
      success: results.success,
      publishedUrl: results.publishedUrl,
      method: results.method
    });

  } catch (error) {
    results.success = false;
    results.steps.push({
      name: 'full-workflow',
      success: false,
      error: error.message,
      completedAt: new Date().toISOString()
    });

    logger.error(`Workflow failed`, { error: error.message });
  }

  // Cleanup: Delete cloned repo after workflow
  logger.info(`Cleaning up cloned repository: ${repoName}`);
  try {
    deleteRepo(repoName);
  } catch (cleanupError) {
    logger.warn(`Failed to cleanup repo: ${cleanupError.message}`);
  }

  results.completedAt = new Date().toISOString();
  results.durationMs = new Date(results.completedAt) - new Date(results.startedAt);

  return results;
}

/**
 * Get list of workflow steps for dashboard display
 */
export function getWorkflowSteps() {
  return [
    { name: 'full-workflow', skill: 'automated', description: 'Complete documentation generation and publishing' }
  ];
}

export default {
  runWorkflow,
  getWorkflowSteps
};
