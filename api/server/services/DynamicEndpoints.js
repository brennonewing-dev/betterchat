const axios = require('axios');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/models';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || 'http://betterchat-litellm:4000/v1';

/**
 * Provider metadata mapping for known providers
 */
const PROVIDER_METADATA = {
  'openai': {
    name: 'OpenAI',
    iconURL: 'https://openai.com/favicon.ico',
  },
  'anthropic': {
    name: 'Anthropic',
    iconURL: 'https://anthropic.com/favicon.ico',
  },
  'google': {
    name: 'Google',
    iconURL: 'https://www.google.com/favicon.ico',
  },
  'x-ai': {
    name: 'xAI',
    iconURL: 'https://x.ai/favicon.ico',
  },
  'perplexity': {
    name: 'Perplexity',
    iconURL: 'https://www.perplexity.ai/favicon.ico',
  },
  'meta-llama': {
    name: 'Meta',
    iconURL: 'https://about.meta.com/favicon.ico',
  },
  'mistralai': {
    name: 'Mistral AI',
    iconURL: 'https://mistral.ai/favicon.ico',
  },
  'cohere': {
    name: 'Cohere',
    iconURL: 'https://cohere.com/favicon.ico',
  },
  'deepseek': {
    name: 'DeepSeek',
    iconURL: 'https://www.deepseek.com/favicon.ico',
  },
  'microsoft': {
    name: 'Microsoft',
    iconURL: 'https://www.microsoft.com/favicon.ico',
  },
  'amazon': {
    name: 'Amazon',
    iconURL: 'https://www.amazon.com/favicon.ico',
  },
  'nvidia': {
    name: 'NVIDIA',
    iconURL: 'https://www.nvidia.com/favicon.ico',
  },
  'qwen': {
    name: 'Qwen',
    iconURL: 'https://openrouter.ai/favicon.ico',
  },
  'databricks': {
    name: 'Databricks',
    iconURL: 'https://www.databricks.com/favicon.ico',
  },
  'ai21': {
    name: 'AI21 Labs',
    iconURL: 'https://www.ai21.com/favicon.ico',
  },
};

/**
 * Convert provider slug to display name
 * @param {string} provider - The provider slug (e.g., 'meta-llama')
 * @returns {string} The display name (e.g., 'Meta')
 */
function getProviderDisplayName(provider) {
  if (PROVIDER_METADATA[provider]) {
    return PROVIDER_METADATA[provider].name;
  }
  // Default: capitalize and replace hyphens with spaces
  return provider
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get provider icon URL
 * @param {string} provider - The provider slug
 * @returns {string} The icon URL
 */
function getProviderIconURL(provider) {
  if (PROVIDER_METADATA[provider]) {
    return PROVIDER_METADATA[provider].iconURL;
  }
  return 'https://openrouter.ai/favicon.ico';
}

/**
 * Extract provider from OpenRouter model ID
 * Model ID format: provider/model-name or openrouter/provider/model-name
 * @param {string} modelId - The full model ID
 * @returns {{provider: string, modelName: string, fullId: string}}
 */
function parseModelId(modelId) {
  const parts = modelId.split('/');

  if (parts.length === 2) {
    // Format: provider/model-name
    return {
      provider: parts[0],
      modelName: parts[1],
      fullId: modelId,
    };
  } else if (parts.length === 3 && parts[0] === 'openrouter') {
    // Format: openrouter/provider/model-name
    return {
      provider: parts[1],
      modelName: parts[2],
      fullId: modelId,
    };
  }

  // Fallback: treat entire ID as model name with 'unknown' provider
  return {
    provider: 'unknown',
    modelName: modelId,
    fullId: modelId,
  };
}

/**
 * Transform model ID for display (strip provider prefix)
 * @param {string} modelId - The full model ID
 * @returns {string} The display name
 */
function getModelDisplayName(modelId) {
  const { modelName } = parseModelId(modelId);
  return modelName;
}

/**
 * Fetch models from OpenRouter API
 * @returns {Promise<Array>} Array of model objects
 */
async function fetchOpenRouterModels() {
  try {
    const response = await axios.get(OPENROUTER_API_URL, {
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.data && Array.isArray(response.data.data)) {
      return response.data.data;
    }

    logger.warn('[DynamicEndpoints] Unexpected response format from OpenRouter API');
    return [];
  } catch (error) {
    logger.error('[DynamicEndpoints] Failed to fetch OpenRouter models:', error.message);
    return [];
  }
}

/**
 * Group models by provider
 * @param {Array} models - Array of model objects from OpenRouter
 * @returns {Map<string, Array>} Map of provider to models
 */
function groupModelsByProvider(models) {
  const providerModels = new Map();

  for (const model of models) {
    const { provider, fullId } = parseModelId(model.id);

    if (!providerModels.has(provider)) {
      providerModels.set(provider, []);
    }

    providerModels.get(provider).push({
      id: fullId,
      name: model.name || getModelDisplayName(fullId),
      contextLength: model.context_length,
      pricing: model.pricing,
    });
  }

  return providerModels;
}

/**
 * Generate endpoint configuration for a provider
 * @param {string} provider - The provider slug
 * @param {Array} models - Array of models for this provider
 * @returns {Object} Endpoint configuration object
 */
function generateEndpointConfig(provider, models) {
  const displayName = getProviderDisplayName(provider);
  const iconURL = getProviderIconURL(provider);

  // Sort models by name for consistent ordering
  const sortedModels = models.sort((a, b) => a.id.localeCompare(b.id));

  return {
    name: `openrouter-${provider}`,
    displayName: displayName,
    apiKey: 'user_provided',
    baseURL: LITELLM_BASE_URL,
    iconURL: iconURL,
    modelDisplayLabel: displayName,
    models: {
      default: sortedModels.map(m => m.id),
      fetch: false,
    },
    titleConvo: true,
    titleModel: sortedModels[0]?.id || null,
    // Store model metadata for display transformation
    modelMetadata: sortedModels.reduce((acc, m) => {
      acc[m.id] = {
        displayName: getModelDisplayName(m.id),
        contextLength: m.contextLength,
      };
      return acc;
    }, {}),
  };
}

/**
 * Cache structure for dynamic endpoints
 */
let dynamicEndpointsCache = {
  endpoints: [],
  providerModels: new Map(),
  modelMetadata: {},
  lastFetched: null,
  isLoading: false,
};

/**
 * Load or refresh dynamic endpoints from OpenRouter
 * @param {boolean} force - Force refresh even if cache is valid
 * @returns {Promise<Array>} Array of endpoint configurations
 */
async function loadDynamicEndpoints(force = false) {
  const now = Date.now();

  // Return cached data if still valid
  if (
    !force &&
    dynamicEndpointsCache.lastFetched &&
    (now - dynamicEndpointsCache.lastFetched) < CACHE_TTL_MS &&
    dynamicEndpointsCache.endpoints.length > 0
  ) {
    return dynamicEndpointsCache.endpoints;
  }

  // Prevent concurrent fetches
  if (dynamicEndpointsCache.isLoading) {
    // Wait for current fetch to complete
    while (dynamicEndpointsCache.isLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return dynamicEndpointsCache.endpoints;
  }

  dynamicEndpointsCache.isLoading = true;

  try {
    logger.info('[DynamicEndpoints] Fetching models from OpenRouter...');
    const models = await fetchOpenRouterModels();

    if (models.length === 0) {
      logger.warn('[DynamicEndpoints] No models fetched, using cached data if available');
      dynamicEndpointsCache.isLoading = false;
      return dynamicEndpointsCache.endpoints;
    }

    const providerModels = groupModelsByProvider(models);
    const endpoints = [];
    const allModelMetadata = {};

    for (const [provider, providerModelList] of providerModels) {
      const endpointConfig = generateEndpointConfig(provider, providerModelList);
      endpoints.push(endpointConfig);

      // Merge model metadata
      Object.assign(allModelMetadata, endpointConfig.modelMetadata);
    }

    // Sort endpoints alphabetically by display name
    endpoints.sort((a, b) => a.displayName.localeCompare(b.displayName));

    // Update cache
    dynamicEndpointsCache = {
      endpoints,
      providerModels,
      modelMetadata: allModelMetadata,
      lastFetched: now,
      isLoading: false,
    };

    logger.info(
      `[DynamicEndpoints] Loaded ${endpoints.length} providers with ${models.length} total models`
    );

    // Also cache in the persistent store
    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    await cache.set('dynamicEndpoints', {
      endpoints,
      modelMetadata: allModelMetadata,
      lastFetched: now,
    });

    return endpoints;
  } catch (error) {
    logger.error('[DynamicEndpoints] Error loading dynamic endpoints:', error);
    dynamicEndpointsCache.isLoading = false;

    // Try to load from persistent cache
    try {
      const cache = getLogStores(CacheKeys.CONFIG_STORE);
      const cached = await cache.get('dynamicEndpoints');
      if (cached && cached.endpoints) {
        logger.info('[DynamicEndpoints] Using cached dynamic endpoints');
        dynamicEndpointsCache.endpoints = cached.endpoints;
        dynamicEndpointsCache.modelMetadata = cached.modelMetadata;
        dynamicEndpointsCache.lastFetched = cached.lastFetched;
        return cached.endpoints;
      }
    } catch (cacheError) {
      logger.error('[DynamicEndpoints] Failed to load from cache:', cacheError);
    }

    return [];
  }
}

/**
 * Get the display name for a model ID
 * @param {string} modelId - The full model ID
 * @returns {string} The display name
 */
function getModelDisplayNameFromCache(modelId) {
  if (dynamicEndpointsCache.modelMetadata[modelId]) {
    return dynamicEndpointsCache.modelMetadata[modelId].displayName;
  }
  return getModelDisplayName(modelId);
}

/**
 * Get all dynamic endpoints (loads if not cached)
 * @returns {Promise<Array>} Array of endpoint configurations
 */
async function getDynamicEndpoints() {
  return loadDynamicEndpoints();
}

/**
 * Force refresh dynamic endpoints
 * @returns {Promise<Array>} Array of endpoint configurations
 */
async function refreshDynamicEndpoints() {
  return loadDynamicEndpoints(true);
}

/**
 * Get cached provider models map
 * @returns {Map<string, Array>} Map of provider to models
 */
function getProviderModels() {
  return dynamicEndpointsCache.providerModels;
}

/**
 * Initialize dynamic endpoints (call on server startup)
 * @returns {Promise<void>}
 */
async function initializeDynamicEndpoints() {
  try {
    await loadDynamicEndpoints();
    logger.info('[DynamicEndpoints] Dynamic endpoints initialized successfully');
  } catch (error) {
    logger.error('[DynamicEndpoints] Failed to initialize dynamic endpoints:', error);
  }
}

/**
 * Start the scheduled refresh job
 * @param {number} intervalMs - Refresh interval in milliseconds (default: 1 hour)
 */
function startRefreshScheduler(intervalMs = CACHE_TTL_MS) {
  setInterval(async () => {
    try {
      logger.info('[DynamicEndpoints] Running scheduled refresh...');
      await refreshDynamicEndpoints();
    } catch (error) {
      logger.error('[DynamicEndpoints] Scheduled refresh failed:', error);
    }
  }, intervalMs);

  logger.info(`[DynamicEndpoints] Refresh scheduler started (interval: ${intervalMs / 1000 / 60} minutes)`);
}

module.exports = {
  // Core functions
  loadDynamicEndpoints,
  getDynamicEndpoints,
  refreshDynamicEndpoints,
  initializeDynamicEndpoints,
  startRefreshScheduler,

  // Model utilities
  parseModelId,
  getModelDisplayName,
  getModelDisplayNameFromCache,
  getProviderDisplayName,
  getProviderIconURL,

  // Data access
  getProviderModels,

  // Constants
  PROVIDER_METADATA,
  CACHE_TTL_MS,
};
