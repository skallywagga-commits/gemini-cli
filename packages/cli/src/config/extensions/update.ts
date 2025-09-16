/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GeminiCLIExtension } from '@google/gemini-cli-core';
import * as fs from 'node:fs';
import { simpleGit } from 'simple-git';
import { getErrorMessage } from '../../utils/errors.js';
import { ExtensionUpdateState } from '../../ui/state/extensions.js';
import { type Dispatch, type SetStateAction } from 'react';
import {
  copyExtension,
  installExtension,
  uninstallExtension,
  loadExtension,
  ExtensionStorage,
} from '../extension.js';

export interface ExtensionUpdateInfo {
  name: string;
  originalVersion: string;
  updatedVersion: string;
}

export async function updateExtension(
  extension: GeminiCLIExtension,
  cwd: string = process.cwd(),
  currentState: ExtensionUpdateState,
  setExtensionUpdateState: (updateState: ExtensionUpdateState) => void,
): Promise<ExtensionUpdateInfo | undefined> {
  if (currentState === ExtensionUpdateState.UPDATING) {
    return undefined;
  }
  setExtensionUpdateState(ExtensionUpdateState.UPDATING);
  if (!extension.type) {
    setExtensionUpdateState(ExtensionUpdateState.ERROR);
    throw new Error(
      `Extension ${extension.name} cannot be updated, type is unknown.`,
    );
  }
  if (extension.type === 'link') {
    setExtensionUpdateState(ExtensionUpdateState.UP_TO_DATE);
    throw new Error(`Extension is linked so does not need to be updated`);
  }
  const originalVersion = extension.version;

  const tempDir = await ExtensionStorage.createTmpDir();
  try {
    await copyExtension(extension.path, tempDir);
    await uninstallExtension(extension.name, cwd);
    await installExtension(
      {
        source: extension.source!,
        type: extension.type,
        ref: extension.ref,
      },
      cwd,
      true,
    );

    const updatedExtensionStorage = new ExtensionStorage(extension.name);
    const updatedExtension = loadExtension(
      updatedExtensionStorage.getExtensionDir(),
    );
    if (!updatedExtension) {
      setExtensionUpdateState(ExtensionUpdateState.ERROR);
      throw new Error('Updated extension not found after installation.');
    }
    const updatedVersion = updatedExtension.config.version;
    setExtensionUpdateState(ExtensionUpdateState.UPDATED_NEEDS_RESTART);
    return {
      name: extension.name,
      originalVersion,
      updatedVersion,
    };
  } catch (e) {
    console.error(
      `Error updating extension, rolling back. ${getErrorMessage(e)}`,
    );
    setExtensionUpdateState(ExtensionUpdateState.ERROR);
    await copyExtension(tempDir, extension.path);
    throw e;
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

export async function updateAllUpdatableExtensions(
  cwd: string = process.cwd(),
  extensions: GeminiCLIExtension[],
  extensionsState: Map<string, ExtensionUpdateState>,
  setExtensionsUpdateState: Dispatch<
    SetStateAction<Map<string, ExtensionUpdateState>>
  >,
): Promise<ExtensionUpdateInfo[]> {
  return (
    await Promise.all(
      extensions
        .filter(
          (extension) =>
            extensionsState.get(extension.name) ===
            ExtensionUpdateState.UPDATE_AVAILABLE,
        )
        .map((extension) =>
          updateExtension(
            extension,
            cwd,
            extensionsState.get(extension.name)!,
            (updateState) => {
              setExtensionsUpdateState((prev) => {
                const finalState = new Map(prev);
                finalState.set(extension.name, updateState);
                return finalState;
              });
            },
          ),
        ),
    )
  ).filter((updateInfo) => !!updateInfo);
}

export interface ExtensionUpdateCheckResult {
  state: ExtensionUpdateState;
  error?: string;
}

export async function checkForAllExtensionUpdates(
  extensions: GeminiCLIExtension[],
  extensionsUpdateState: Map<string, ExtensionUpdateState>,
  setExtensionsUpdateState: Dispatch<
    SetStateAction<Map<string, ExtensionUpdateState>>
  >,
): Promise<Map<string, ExtensionUpdateState>> {
  for (const extension of extensions) {
    const initialState = extensionsUpdateState.get(extension.name);
    if (initialState === undefined) {
      await checkForExtensionUpdate(extension, (updatedState) => {
        setExtensionsUpdateState((prev) => {
          extensionsUpdateState = new Map(prev);
          extensionsUpdateState.set(extension.name, updatedState);
          return extensionsUpdateState;
        });
      });
    }
  }
  return extensionsUpdateState;
}

export async function checkForExtensionUpdate(
  extension: GeminiCLIExtension,
  setExtensionUpdateState: (updateState: ExtensionUpdateState) => void,
): Promise<void> {
  setExtensionUpdateState(ExtensionUpdateState.CHECKING_FOR_UPDATES);

  if (extension.type !== 'git') {
    setExtensionUpdateState(ExtensionUpdateState.NOT_UPDATABLE);
    return;
  }

  try {
    const git = simpleGit(extension.path);
    const remotes = await git.getRemotes(true);
    if (remotes.length === 0) {
      console.error('No git remotes found.');
      setExtensionUpdateState(ExtensionUpdateState.ERROR);
      return;
    }
    const remoteUrl = remotes[0].refs.fetch;
    if (!remoteUrl) {
      console.error(`No fetch URL found for git remote ${remotes[0].name}.`);
      setExtensionUpdateState(ExtensionUpdateState.ERROR);
      return;
    }

    // Determine the ref to check on the remote.
    const refToCheck = extension.ref || 'HEAD';

    const lsRemoteOutput = await git.listRemote([remoteUrl, refToCheck]);

    if (typeof lsRemoteOutput !== 'string' || lsRemoteOutput.trim() === '') {
      console.error(`Git ref ${refToCheck} not found.`);
      setExtensionUpdateState(ExtensionUpdateState.ERROR);
      return;
    }

    const remoteHash = lsRemoteOutput.split('\t')[0];
    const localHash = await git.revparse(['HEAD']);

    if (!remoteHash) {
      console.error(
        `Unable to parse hash from git ls-remote output "${lsRemoteOutput}"`,
      );
      setExtensionUpdateState(ExtensionUpdateState.ERROR);
      return;
    } else if (remoteHash === localHash) {
      setExtensionUpdateState(ExtensionUpdateState.UP_TO_DATE);
      return;
    } else {
      setExtensionUpdateState(ExtensionUpdateState.UPDATE_AVAILABLE);
      return;
    }
  } catch (error) {
    console.error(
      `Failed to check for updates for extension "${
        extension.name
      }": ${getErrorMessage(error)}`,
    );
    setExtensionUpdateState(ExtensionUpdateState.ERROR);
    return;
  }
}
