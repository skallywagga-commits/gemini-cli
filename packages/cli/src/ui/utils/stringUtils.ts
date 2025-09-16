/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ToolCallConfirmationDetails
} from '@google/gemini-cli-core';
import ansiRegex from 'ansi-regex';

const regex = ansiRegex();

/**
 * Replaces ANSI escape codes in a string with a visible, non-functional
 * representation.
 * @param s The string to sanitize.
 * @returns The sanitized string.
 */
export function sanitizeAnsiCtrl(s: string): string {
  return s.replace(regex, (match) => JSON.stringify(match).slice(1, -1));
}

/**
 * Sanitizes command properties within a ToolCallConfirmationDetails object.
 * @param details The details object.
 * @returns The sanitized details object.
 */
export function sanitizeConfirmationDetails(
  details: ToolCallConfirmationDetails | undefined,
): ToolCallConfirmationDetails | undefined {
  if (!details) {
    return undefined;
  }

  if (details.type === 'exec') {
    const newDetails = {...details};
    if (newDetails.command) {
      newDetails.command = sanitizeAnsiCtrl(newDetails.command);
    }
    if (newDetails.rootCommand) {
      newDetails.rootCommand = sanitizeAnsiCtrl(newDetails.rootCommand);
    }
    return newDetails;
  }

  return details;
}
