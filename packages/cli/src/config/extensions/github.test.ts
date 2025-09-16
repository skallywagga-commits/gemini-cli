/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkForExtensionUpdate,
  cloneFromGit,
} from './github.js';
import { simpleGit, type SimpleGit } from 'simple-git';
import { ExtensionUpdateState } from '../../ui/state/extensions.js';
import type { ExtensionInstallMetadata } from '../extension.js';

vi.mock('simple-git');

describe('git extension helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('cloneFromGit', () => {
    const mockGit = {
      clone: vi.fn(),
      getRemotes: vi.fn(),
      fetch: vi.fn(),
      checkout: vi.fn(),
    };

    beforeEach(() => {
      vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as SimpleGit);
    });

    it('should clone, fetch and checkout a repo', async () => {
      const installMetadata = {
        source: 'http://my-repo.com',
        ref: 'my-ref',
        type: 'git' as const,
      };
      const destination = '/dest';
      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'http://my-repo.com' } },
      ]);

      await cloneFromGit(installMetadata, destination);

      expect(mockGit.clone).toHaveBeenCalledWith('http://my-repo.com', './', [
        '--depth',
        '1',
      ]);
      expect(mockGit.getRemotes).toHaveBeenCalledWith(true);
      expect(mockGit.fetch).toHaveBeenCalledWith('origin', 'my-ref');
      expect(mockGit.checkout).toHaveBeenCalledWith('FETCH_HEAD');
    });

    it('should use HEAD if ref is not provided', async () => {
      const installMetadata = {
        source: 'http://my-repo.com',
        type: 'git' as const,
      };
      const destination = '/dest';
      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'http://my-repo.com' } },
      ]);

      await cloneFromGit(installMetadata, destination);

      expect(mockGit.fetch).toHaveBeenCalledWith('origin', 'HEAD');
    });

    it('should throw if no remotes are found', async () => {
      const installMetadata = {
        source: 'http://my-repo.com',
        type: 'git' as const,
      };
      const destination = '/dest';
      mockGit.getRemotes.mockResolvedValue([]);

      await expect(cloneFromGit(installMetadata, destination)).rejects.toThrow(
        'Failed to clone Git repository from http://my-repo.com',
      );
    });

    it('should throw on clone error', async () => {
      const installMetadata = {
        source: 'http://my-repo.com',
        type: 'git' as const,
      };
      const destination = '/dest';
      mockGit.clone.mockRejectedValue(new Error('clone failed'));

      await expect(cloneFromGit(installMetadata, destination)).rejects.toThrow(
        'Failed to clone Git repository from http://my-repo.com',
      );
    });
  });

  describe('checkForExtensionUpdate', () => {
    const mockGit = {
      getRemotes: vi.fn(),
      listRemote: vi.fn(),
      revparse: vi.fn(),
    };

    beforeEach(() => {
      vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as SimpleGit);
    });

    it('should return NOT_UPDATABLE for non-git extensions', async () => {
      const installMetadata: ExtensionInstallMetadata = {
        type: 'local',
        source: '',
      };
      const result = await checkForExtensionUpdate(installMetadata);
      expect(result).toBe(ExtensionUpdateState.NOT_UPDATABLE);
    });

    it('should return ERROR if no remotes found', async () => {
      const installMetadata: ExtensionInstallMetadata = {
        type: 'git',
        source: '',
      };
      mockGit.getRemotes.mockResolvedValue([]);
      const result = await checkForExtensionUpdate(installMetadata);
      expect(result).toBe(ExtensionUpdateState.ERROR);
    });

    it('should return UPDATE_AVAILABLE when remote hash is different', async () => {
      const installMetadata: ExtensionInstallMetadata = {
        type: 'git',
        source: '/ext',
      };
      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'http://my-repo.com' } },
      ]);
      mockGit.listRemote.mockResolvedValue('remote-hash\tHEAD');
      mockGit.revparse.mockResolvedValue('local-hash');

      const result = await checkForExtensionUpdate(installMetadata);
      expect(result).toBe(ExtensionUpdateState.UPDATE_AVAILABLE);
    });

    it('should return UP_TO_DATE when remote and local hashes are the same', async () => {
      const installMetadata: ExtensionInstallMetadata = {
        type: 'git',
        source: '/ext',
      };
      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'http://my-repo.com' } },
      ]);
      mockGit.listRemote.mockResolvedValue('same-hash\tHEAD');
      mockGit.revparse.mockResolvedValue('same-hash');

      const result = await checkForExtensionUpdate(installMetadata);
      expect(result).toBe(ExtensionUpdateState.UP_TO_DATE);
    });

    it('should return ERROR on git error', async () => {
      const installMetadata: ExtensionInstallMetadata = {
        type: 'git',
        source: '/ext',
      };
      mockGit.getRemotes.mockRejectedValue(new Error('git error'));
      const result = await checkForExtensionUpdate(installMetadata);
      expect(result).toBe(ExtensionUpdateState.ERROR);
    });
  });
});
