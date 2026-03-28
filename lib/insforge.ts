/**
 * InsForge client - PostgreSQL persistent storage layer
 *
 * Used alongside Redis (hot cache) for the two-tier data architecture:
 * Redis = fast cache (TTL, may expire)
 * InsForge PostgreSQL = permanent storage (never expires)
 */

import { createClient } from '@insforge/sdk';

export const insforge = createClient({
  baseUrl: process.env.INSFORGE_BASE_URL || 'https://m63i3j2q.ap-southeast.insforge.app',
  anonKey: process.env.INSFORGE_ANON_KEY || '',
});
