export type SecurityScheme =
  | { type: 'http'; scheme: 'basic' | 'bearer' }
  | { type: 'apiKey'; in: 'header' | 'query' | 'cookie'; name: string };
