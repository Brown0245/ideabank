export function mealServiceUrl({ configuredUrl, platform, development, location }) {
  if (configuredUrl?.trim()) return configuredUrl.trim();
  if (platform !== 'web' || !location) return undefined;
  if (!development) return location.origin;
  // The local API binds IPv4; avoid browsers resolving localhost to IPv6 only.
  const host = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) ? '127.0.0.1' : location.hostname;
  return `${location.protocol}//${host}:3001`;
}

export function validateRecipe(value) {
  if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 160
    || !Array.isArray(value.ingredients) || value.ingredients.length < 1 || value.ingredients.length > 50
    || value.ingredients.some(item => typeof item !== 'string' || !item.trim() || item.length > 120)) {
    throw new Error('The meal suggestion was incomplete. Please try again.');
  }
  return {
    name: value.name.trim(),
    ingredients: [...new Set(value.ingredients.map(item => item.trim().toLowerCase()))],
  };
}

export function restoreGeneratedRecipes(value) {
  const entries = [];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [name, ingredients] of Object.entries(value)) {
      try {
        const recipe = validateRecipe({ name, ingredients });
        entries.push([recipe.name, recipe.ingredients]);
      } catch { /* Ignore damaged entries while keeping the rest of the planner. */ }
    }
  }
  return Object.fromEntries(entries);
}

export async function generateMeal(meal, { baseUrl, fetchImpl = fetch, timeoutMs = 45000 } = {}) {
  const query = meal.trim();
  if (query.length < 2 || query.length > 160) throw new Error('Enter a meal name between 2 and 160 characters.');
  if (!baseUrl) throw new Error('AI lookup is not connected on this device yet. You can still choose a saved meal.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/recipes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meal: query }),
      signal: controller.signal,
    });
    let data;
    try { data = await response.json(); } catch { throw new Error('The meal service returned an unreadable response. Please try again.'); }
    if (!response.ok) {
      const fallback = response.status === 503 ? 'AI lookup needs to be set up. You can still use saved meals.' : 'Could not generate this meal. Please try again.';
      throw new Error(typeof data?.error === 'string' ? data.error.slice(0, 300) : fallback);
    }
    return validateRecipe(data);
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The meal lookup took too long. Please try again.');
    if (error instanceof TypeError) {
      const connectionError = new Error('Could not connect to AI lookup. Check your connection and that the meal service is running.');
      connectionError.code = 'AI_CONNECTION_FAILED';
      throw connectionError;
    }
    throw error;
  } finally { clearTimeout(timer); }
}
