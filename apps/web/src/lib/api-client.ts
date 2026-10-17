import { createApiClient } from '@yehabibi/api-client';

/** Webbläsaren använder samma origin. Serverrenderingen läser direkt via lib/data. */
export const api = createApiClient();
