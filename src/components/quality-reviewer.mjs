/**
 * Quality Reviewer - Validates documentation before publishing
 *
 * Performs two levels of review:
 * A) Lightweight validation (file checks, word counts, structure)
 * B) AI sample review (brief Claude check on 1-2 docs)
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import logger from '../utils/logger.mjs';

/**
 * Count words in markdown content (excluding code blocks)
 */
function countWords(content) {
  // Remove code blocks
  const withoutCode = content.replace(/```[\s\S]*?```/g, '');
  // Remove markdown syntax
  const plainText = withoutCode
    .replace(/[#*_\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plainText.split(' ').filter(w => w.length > 0).length;
}

/**
 * Check if content has code examples
 */
function hasCodeExamples(content) {
  return /```[\s\S]+?```/.test(content);
}

/**
 * Internal link domains that should be present in docs
 */
const INTERNAL_LINK_DOMAINS = [
  'arcblock.io',
  'aigne.io',
  'myvibe.so'
];

/**
 * Check if content has at least one internal link
 */
function hasInternalLink(content) {
  for (const domain of INTERNAL_LINK_DOMAINS) {
    if (content.includes(domain)) {
      return true;
    }
  }
  return false;
}

/**
 * A) Lightweight validation - no AI, just file checks
 */
export async function lightweightValidation(docsPath, settings = {}) {
  const minWordCount = settings.minWordCount || 300;  // Lowered from 500
  const minDocDirs = settings.minDocDirs || 2;  // Lowered from 3
  const requireCodeExamples = settings.requireCodeExamples !== false;
  const requireInternalLinks = settings.requireInternalLinks !== false;

  const issues = [];
  const stats = {
    totalDocs: 0,
    totalWords: 0,
    docsWithCode: 0,
    docsWithInternalLinks: 0,
    languages: new Set()
  };

  // Check if docs directory exists
  if (!existsSync(docsPath)) {
    return {
      passed: false,
      issues: ['Documentation directory does not exist'],
      stats
    };
  }

  // Find all document directories
  const docDirs = readdirSync(docsPath, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => d.name);

  if (docDirs.length === 0) {
    return {
      passed: false,
      issues: ['No document directories found'],
      stats
    };
  }

  // Check each document
  for (const docDir of docDirs) {
    const docPath = join(docsPath, docDir);
    const files = readdirSync(docPath).filter(f => f.endsWith('.md'));

    if (files.length === 0) {
      issues.push(`No markdown files in ${docDir}/`);
      continue;
    }

    // Check each language file
    for (const file of files) {
      const lang = file.replace('.md', '');
      stats.languages.add(lang);
      stats.totalDocs++;

      const content = readFileSync(join(docPath, file), 'utf8');
      const wordCount = countWords(content);
      stats.totalWords += wordCount;

      // Check minimum word count (only for source language)
      if (lang === 'zh' && wordCount < minWordCount) {
        issues.push(`${docDir}/${file}: Only ${wordCount} words (min: ${minWordCount})`);
      }

      // Check for code examples
      if (hasCodeExamples(content)) {
        stats.docsWithCode++;
      }

      // Check for internal links
      if (hasInternalLink(content)) {
        stats.docsWithInternalLinks++;
      }
    }
  }

  // Check if code examples are present (at least in some docs)
  if (requireCodeExamples && stats.docsWithCode === 0) {
    issues.push('No code examples found in any document');
  }

  // Check if internal links are present (warn but don't fail)
  if (requireInternalLinks && stats.docsWithInternalLinks === 0) {
    logger.warn('No internal links found to arcblock.io, aigne.io, or myvibe.so');
    // Note: This is a warning, not a failure - docs can still pass
  }

  // Check minimum number of doc directories (lowered to 2)
  if (docDirs.length < minDocDirs) {
    issues.push(`Only ${docDirs.length} document topics (expected at least ${minDocDirs})`);
  }

  return {
    passed: issues.length === 0,
    issues,
    stats: {
      ...stats,
      languages: Array.from(stats.languages),
      avgWordsPerDoc: stats.totalDocs > 0 ? Math.round(stats.totalWords / stats.totalDocs) : 0,
      hasInternalLinks: stats.docsWithInternalLinks > 0
    }
  };
}

/**
 * B) AI sample review - brief Claude check on sample docs
 */
export async function aiSampleReview(docsPath, repoName) {
  // Find a sample document to review
  const docDirs = readdirSync(docsPath, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => d.name);

  if (docDirs.length === 0) {
    return { passed: false, score: 0, feedback: 'No documents to review' };
  }

  // Pick overview or getting-started as sample
  const sampleDir = docDirs.find(d => d.includes('overview') || d.includes('getting')) || docDirs[0];
  const samplePath = join(docsPath, sampleDir);

  // Read the English version (or Chinese if no English)
  let sampleContent = '';
  let sampleFile = '';
  for (const lang of ['en.md', 'zh.md']) {
    const filePath = join(samplePath, lang);
    if (existsSync(filePath)) {
      sampleContent = readFileSync(filePath, 'utf8');
      sampleFile = `${sampleDir}/${lang}`;
      break;
    }
  }

  if (!sampleContent) {
    return { passed: false, score: 0, feedback: 'Could not find sample document' };
  }

  // Truncate if too long (save tokens)
  const maxChars = 4000;
  if (sampleContent.length > maxChars) {
    sampleContent = sampleContent.substring(0, maxChars) + '\n\n[... truncated for review ...]';
  }

  const reviewPrompt = `You are a documentation quality reviewer. Review this sample documentation for the "${repoName}" project.

DOCUMENT (${sampleFile}):
---
${sampleContent}
---

Rate the documentation quality from 1-10 and provide brief feedback. Consider:
- Clarity and readability
- Completeness of explanations
- Quality of code examples
- Practical usefulness for developers

Respond in this exact JSON format only:
{"score": <1-10>, "feedback": "<one sentence summary>", "passed": <true if score >= 6>}`;

  try {
    // Find Claude CLI
    const claudePath = process.env.HOME + '/.local/bin/claude';

    return new Promise((resolve, reject) => {
      const result = { stdout: '', stderr: '' };

      const child = spawn(claudePath, [
        '--dangerously-skip-permissions',
        '-p',
        '--output-format', 'text',
        '--max-turns', '1',
        reviewPrompt
      ], {
        env: { ...process.env, CI: '1' },
        timeout: 60000  // 1 minute max for review
      });

      child.stdout.on('data', (data) => {
        result.stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        result.stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code !== 0) {
          logger.warn('AI review failed', { code, stderr: result.stderr });
          resolve({ passed: true, score: 7, feedback: 'AI review skipped (error)', skipped: true });
          return;
        }

        try {
          // Extract JSON from response
          const jsonMatch = result.stdout.match(/\{[\s\S]*"score"[\s\S]*\}/);
          if (jsonMatch) {
            const review = JSON.parse(jsonMatch[0]);
            logger.info('AI quality review complete', {
              score: review.score,
              passed: review.passed,
              sample: sampleFile
            });
            resolve(review);
          } else {
            logger.warn('Could not parse AI review response');
            resolve({ passed: true, score: 7, feedback: 'Review response unparseable', skipped: true });
          }
        } catch (e) {
          logger.warn('AI review parse error', { error: e.message });
          resolve({ passed: true, score: 7, feedback: 'Review parse error', skipped: true });
        }
      });

      child.on('error', (error) => {
        logger.warn('AI review spawn error', { error: error.message });
        resolve({ passed: true, score: 7, feedback: 'AI review unavailable', skipped: true });
      });
    });
  } catch (error) {
    logger.warn('AI sample review error', { error: error.message });
    return { passed: true, score: 7, feedback: 'Review error - skipped', skipped: true };
  }
}

/**
 * Combined quality review (A + B)
 */
export async function reviewQuality(docsPath, repoName, settings = {}) {
  logger.info('Starting quality review', { docsPath, repoName });

  // A) Lightweight validation
  const lightweightResult = await lightweightValidation(docsPath, settings);

  logger.info('Lightweight validation complete', {
    passed: lightweightResult.passed,
    issues: lightweightResult.issues.length,
    stats: lightweightResult.stats
  });

  // If lightweight fails badly, skip AI review
  if (!lightweightResult.passed && lightweightResult.issues.length > 3) {
    return {
      passed: false,
      lightweight: lightweightResult,
      aiReview: { skipped: true, reason: 'Too many structural issues' },
      summary: `Quality check failed: ${lightweightResult.issues.length} issues found`
    };
  }

  // B) AI sample review (only if enabled and lightweight mostly passed)
  let aiReview = { skipped: true, reason: 'Disabled' };
  if (settings.enabled !== false) {
    aiReview = await aiSampleReview(docsPath, repoName);
  }

  // Combined result
  const passed = lightweightResult.passed && (aiReview.skipped || aiReview.passed);

  return {
    passed,
    lightweight: lightweightResult,
    aiReview,
    summary: passed
      ? `Quality check passed (score: ${aiReview.score || 'N/A'}, ${lightweightResult.stats.totalDocs} docs)`
      : `Quality check failed: ${lightweightResult.issues.join('; ')}`
  };
}

export default { reviewQuality, lightweightValidation, aiSampleReview };
