import { execSync } from 'node:child_process';
import logger from './logger.mjs';

const SERVICE_NAME = 'io.docsmith.automation';

/**
 * Credentials store using macOS Keychain
 */
export class CredentialsStore {
  constructor(service = SERVICE_NAME) {
    this.service = service;
  }

  /**
   * Store a credential in macOS Keychain
   */
  async set(key, value) {
    try {
      // Delete existing first (ignore errors)
      try {
        execSync(
          `security delete-generic-password -a "${key}" -s "${this.service}"`,
          { stdio: 'ignore' }
        );
      } catch {
        // Key didn't exist, that's fine
      }

      // Add new password
      execSync(
        `security add-generic-password -a "${key}" -s "${this.service}" -w "${value}"`,
        { stdio: 'ignore' }
      );

      logger.debug(`Credential stored: ${key}`);
      return true;
    } catch (error) {
      logger.error(`Failed to store credential: ${key}`, { error: error.message });
      return false;
    }
  }

  /**
   * Retrieve a credential from macOS Keychain
   */
  async get(key) {
    try {
      const result = execSync(
        `security find-generic-password -a "${key}" -s "${this.service}" -w`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      );
      return result.trim();
    } catch {
      logger.debug(`Credential not found: ${key}`);
      return null;
    }
  }

  /**
   * Delete a credential from macOS Keychain
   */
  async delete(key) {
    try {
      execSync(
        `security delete-generic-password -a "${key}" -s "${this.service}"`,
        { stdio: 'ignore' }
      );
      logger.debug(`Credential deleted: ${key}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a credential exists
   */
  async has(key) {
    const value = await this.get(key);
    return value !== null;
  }

  /**
   * List all credential keys for this service
   */
  async list() {
    try {
      const result = execSync(
        `security dump-keychain | grep -A4 '"${this.service}"' | grep "acct" | sed 's/.*="\\(.*\\)"/\\1/'`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      );
      return result.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }
}

// Default instance
export const credentials = new CredentialsStore();

export default credentials;
