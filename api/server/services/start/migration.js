const mongoose = require('mongoose');
const { logger, encrypt } = require('@librechat/data-schemas');
const {
  logAgentMigrationWarning,
  logPromptMigrationWarning,
  checkAgentPermissionsMigration,
  checkPromptPermissionsMigration,
} = require('@librechat/api');
const { getProjectByName } = require('~/models/Project');
const { Agent, PromptGroup } = require('~/db/models');
const { findRoleByIdentifier } = require('~/models');

const LITELLM_PROXY_URL = process.env.LITELLM_PROXY_URL || 'http://betterchat-litellm:4000';
const LITELLM_BUDGET_DURATION_DAYS = 30;
const LITELLM_MAX_BUDGET = 10.0;

/**
 * Calculate the budget expiration date
 * @returns {string} ISO date string for when the budget expires
 */
const calculateBudgetExpiration = () => {
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + LITELLM_BUDGET_DURATION_DAYS);
  return expirationDate.toISOString();
};

/**
 * Create a LiteLLM virtual key for a user
 * @param {string} userId - The user's ID
 * @param {string} userEmail - The user's email address
 * @returns {Promise<string|null>} The created key or null on failure
 */
async function createLiteLLMKeyForUser(userId, userEmail) {
  const masterKey = process.env.LITELLM_MASTER_KEY;
  if (!masterKey) {
    return null;
  }

  try {
    const response = await fetch(`${LITELLM_PROXY_URL}/key/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${masterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        key_alias: userEmail,
        max_budget: LITELLM_MAX_BUDGET,
        budget_duration: `${LITELLM_BUDGET_DURATION_DAYS}d`,
      }),
    });

    if (!response.ok) {
      logger.error(`[LiteLLM Migration] Failed to create key for ${userEmail}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.key || null;
  } catch (error) {
    logger.error(`[LiteLLM Migration] Error creating key for ${userEmail}:`, error.message);
    return null;
  }
}

/**
 * Migrate existing users to have LiteLLM virtual keys
 * This runs at startup and creates keys for users who don't have one
 */
async function migrateLiteLLMKeys() {
  const masterKey = process.env.LITELLM_MASTER_KEY;
  if (!masterKey) {
    logger.info('[LiteLLM Migration] LITELLM_MASTER_KEY not configured, skipping migration');
    return { migrated: 0, skipped: 0, failed: 0 };
  }

  const User = mongoose.models.User;
  const Key = mongoose.models.Key;

  if (!User || !Key) {
    logger.warn('[LiteLLM Migration] User or Key model not available, skipping migration');
    return { migrated: 0, skipped: 0, failed: 0 };
  }

  try {
    // Find all users
    const users = await User.find({}, '_id email').lean();

    // Find all existing litellm keys
    const existingKeys = await Key.find({ name: 'litellm' }, 'userId').lean();
    const usersWithKeys = new Set(existingKeys.map(k => k.userId.toString()));

    let migrated = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of users) {
      const userId = user._id.toString();

      // Skip users who already have a key
      if (usersWithKeys.has(userId)) {
        skipped++;
        continue;
      }

      // Skip users without email (shouldn't happen but just in case)
      if (!user.email) {
        logger.warn(`[LiteLLM Migration] User ${userId} has no email, skipping`);
        skipped++;
        continue;
      }

      // Create LiteLLM key
      const litellmKey = await createLiteLLMKeyForUser(userId, user.email);

      if (!litellmKey) {
        failed++;
        continue;
      }

      // Store the key with budget expiration
      try {
        const keyData = {
          apiKey: litellmKey,
          budgetExpiresAt: calculateBudgetExpiration(),
        };
        const encryptedValue = await encrypt(JSON.stringify(keyData));
        await Key.findOneAndUpdate(
          { userId: user._id, name: 'litellm' },
          { $set: { userId: user._id, name: 'litellm', value: encryptedValue } },
          { upsert: true, new: true }
        );
        migrated++;
        logger.debug(`[LiteLLM Migration] Created key for user ${user.email}`);
      } catch (error) {
        logger.error(`[LiteLLM Migration] Failed to store key for ${user.email}:`, error.message);
        failed++;
      }
    }

    if (migrated > 0 || failed > 0) {
      logger.info(`[LiteLLM Migration] Complete: ${migrated} migrated, ${skipped} skipped, ${failed} failed`);
    }

    return { migrated, skipped, failed };
  } catch (error) {
    logger.error('[LiteLLM Migration] Migration failed:', error);
    return { migrated: 0, skipped: 0, failed: 0 };
  }
}

/**
 * Check if permissions migrations are needed for shared resources
 * This runs at the end to ensure all systems are initialized
 */
async function checkMigrations() {
  try {
    const agentMigrationResult = await checkAgentPermissionsMigration({
      mongoose,
      methods: {
        findRoleByIdentifier,
        getProjectByName,
      },
      AgentModel: Agent,
    });
    logAgentMigrationWarning(agentMigrationResult);
  } catch (error) {
    logger.error('Failed to check agent permissions migration:', error);
  }
  try {
    const promptMigrationResult = await checkPromptPermissionsMigration({
      mongoose,
      methods: {
        findRoleByIdentifier,
        getProjectByName,
      },
      PromptGroupModel: PromptGroup,
    });
    logPromptMigrationWarning(promptMigrationResult);
  } catch (error) {
    logger.error('Failed to check prompt permissions migration:', error);
  }

  // Run LiteLLM key migration for existing users
  try {
    await migrateLiteLLMKeys();
  } catch (error) {
    logger.error('Failed to run LiteLLM key migration:', error);
  }
}

module.exports = {
  checkMigrations,
  migrateLiteLLMKeys,
};
