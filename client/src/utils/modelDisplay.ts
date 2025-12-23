/**
 * Utilities for transforming model display names
 * Particularly useful for OpenRouter endpoints where model IDs include provider prefixes
 */

/**
 * Check if a model ID appears to be an OpenRouter-style ID
 * OpenRouter model IDs are in the format: provider/model-name
 * @param modelId - The model ID to check
 * @returns boolean
 */
export function isOpenRouterModelId(modelId: string): boolean {
  if (!modelId || typeof modelId !== 'string') {
    return false;
  }

  // OpenRouter model IDs contain exactly one slash (provider/model)
  const slashCount = (modelId.match(/\//g) || []).length;
  return slashCount === 1 && !modelId.startsWith('/') && !modelId.endsWith('/');
}

/**
 * Extract the display name from a model ID
 * For OpenRouter models (provider/model-name), returns just the model name
 * For other models, returns the original ID
 * @param modelId - The full model ID
 * @returns The display-friendly model name
 */
export function getModelDisplayName(modelId: string): string {
  if (!modelId || typeof modelId !== 'string') {
    return modelId || '';
  }

  // Check for OpenRouter-style model IDs (provider/model-name)
  if (isOpenRouterModelId(modelId)) {
    const parts = modelId.split('/');
    return parts[1] || modelId;
  }

  return modelId;
}

/**
 * Extract the provider from a model ID
 * For OpenRouter models (provider/model-name), returns the provider
 * For other models, returns null
 * @param modelId - The full model ID
 * @returns The provider name or null
 */
export function getModelProvider(modelId: string): string | null {
  if (!modelId || typeof modelId !== 'string') {
    return null;
  }

  if (isOpenRouterModelId(modelId)) {
    const parts = modelId.split('/');
    return parts[0] || null;
  }

  return null;
}

/**
 * Transform a model ID for display in the UI
 * This is the main function to use when displaying model names
 * @param modelId - The full model ID
 * @param endpointName - Optional endpoint name for context
 * @returns The display-friendly model name
 */
export function transformModelForDisplay(modelId: string, endpointName?: string): string {
  if (!modelId) {
    return '';
  }

  // For OpenRouter-prefixed endpoints, strip the provider prefix
  if (endpointName?.startsWith('openrouter-')) {
    return getModelDisplayName(modelId);
  }

  // For any model ID with provider prefix, strip it
  if (isOpenRouterModelId(modelId)) {
    return getModelDisplayName(modelId);
  }

  return modelId;
}

/**
 * Get the full model ID from a display name and endpoint
 * This is used when sending API requests
 * @param displayName - The display-friendly model name
 * @param endpointName - The endpoint name
 * @param provider - Optional provider to prepend
 * @returns The full model ID
 */
export function getFullModelId(displayName: string, endpointName?: string, provider?: string): string {
  if (!displayName) {
    return '';
  }

  // If it already has a provider prefix, return as-is
  if (isOpenRouterModelId(displayName)) {
    return displayName;
  }

  // If provider is specified, prepend it
  if (provider) {
    return `${provider}/${displayName}`;
  }

  // Extract provider from endpoint name if it's an openrouter endpoint
  if (endpointName?.startsWith('openrouter-')) {
    const extractedProvider = endpointName.replace('openrouter-', '');
    return `${extractedProvider}/${displayName}`;
  }

  return displayName;
}
