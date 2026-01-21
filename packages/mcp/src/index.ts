/**
 * @ahoybuoy/mcp
 *
 * MCP server for Buoy design system context.
 * Provides AI agents with design tokens, components, patterns, and tools.
 */

export { createServer, startServer } from './server.js';
export { loadDesignSystemContext, getTokensByCategory, findComponent, searchComponents } from './context-loader.js';
export type {
  DesignSystemContext,
  TokenWithIntent,
  ComponentSummary,
  Pattern,
  AntiPattern,
  FindComponentRequest,
  FindComponentResponse,
  ValidateCodeRequest,
  ValidateCodeResponse,
  ResolveTokenRequest,
  ResolveTokenResponse,
  SuggestFixRequest,
  SuggestFixResponse,
} from './types.js';
