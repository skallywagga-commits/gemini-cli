/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceAccountImpersonationProvider } from './service-account-impersonation-provider.js';
import type { MCPServerConfig } from '../config/config.js';

const mockRequest = vi.fn();
const mockGetClient = vi.fn(() => ({
  request: mockRequest,
}));

// Mock the google-auth-library to use a shared mock function
vi.mock('google-auth-library', async (importOriginal) => {
  const actual = await importOriginal<typeof import('google-auth-library')>();
  return {
    ...actual,
    GoogleAuth: vi.fn().mockImplementation(() => ({
      getClient: mockGetClient,
    })),
  };
});

describe('ServiceAccountImpersonationProvider', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  it('should throw an error if no URL is provided', () => {
    const config: MCPServerConfig = {};
    expect(() => new ServiceAccountImpersonationProvider(config)).toThrow(
      'A url or httpUrl must be provided for the Google ID Token provider',
    );
  });

  it('should correctly get tokens for a valid config', async () => {
    const validConfig: MCPServerConfig = {
      url: 'https://my-iap-service.run.app',
    };

    const mockToken = 'mock-id-token-123';
    mockRequest.mockResolvedValue({ data: { token: mockToken } });

    const provider = new ServiceAccountImpersonationProvider(validConfig);
    const tokens = await provider.tokens();

    expect(tokens).toBeDefined();
    expect(tokens?.access_token).toBe(mockToken);
    expect(tokens?.token_type).toBe('Bearer');
  });

  it('should return undefined if token acquisition fails', async () => {
    const validConfig: MCPServerConfig = {
      url: 'https://my-iap-service.run.app',
    };

    mockRequest.mockResolvedValue({ data: { token: null } });

    const provider = new ServiceAccountImpersonationProvider(validConfig);
    const tokens = await provider.tokens();

    expect(tokens).toBeUndefined();
  });

  it('should make a request with the correct parameters', async () => {
    const config: MCPServerConfig = {
      url: 'https://my-iap-service.run.app',
    };

    mockRequest.mockResolvedValue({ data: { token: 'test-token' } });

    const provider = new ServiceAccountImpersonationProvider(config);
    await provider.tokens();

    expect(mockRequest).toHaveBeenCalledWith({
      url: 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/TARGET_SA:generateIdToken',
      method: 'POST',
      data: {
        audience: '...',
        includeEmail: true,
      },
    });
  });
});
