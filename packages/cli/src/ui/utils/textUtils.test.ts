/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { ToolCallConfirmationDetails } from '@google/gemini-cli-core';
import {
  getAsciiArtWidth,
  toCodePoints,
  cpLen,
  cpSlice,
  stripUnsafeCharacters,
  getCachedStringWidth,
  clearStringWidthCache,
  sanitizeAnsiCtrl,
  sanitizeConfirmationDetails,
} from './textUtils.js';

describe('textUtils', () => {
  describe('getAsciiArtWidth', () => {
    it('should return 0 for an empty string', () => {
      expect(getAsciiArtWidth('')).toBe(0);
    });

    it('should return the length of a single-line string', () => {
      expect(getAsciiArtWidth('hello')).toBe(5);
    });

    it('should return the length of the longest line in a multi-line string', () => {
      const art = 'hello\nworld!\nfoo';
      expect(getAsciiArtWidth(art)).toBe(6);
    });
  });

  describe('Unicode code point functions', () => {
    const strWithEmoji = 'a\ud83d\ude00b'; // "a😀b"

    it('toCodePoints should correctly split a string into code points', () => {
      expect(toCodePoints(strWithEmoji)).toEqual(['a', '\ud83d\ude00', 'b']);
    });

    it('cpLen should return the correct code point length', () => {
      expect(cpLen(strWithEmoji)).toBe(3);
      expect(cpLen('abc')).toBe(3);
    });

    it('cpSlice should correctly slice a string by code points', () => {
      expect(cpSlice(strWithEmoji, 1, 2)).toBe('\ud83d\ude00');
      expect(cpSlice(strWithEmoji, 0, 1)).toBe('a');
    });
  });

  describe('stripUnsafeCharacters', () => {
    it('should remove ANSI escape codes', () => {
      const text = '\u001b[31mHello\u001b[0m';
      expect(stripUnsafeCharacters(text)).toBe('Hello');
    });

    it('should remove C0 control characters but preserve CR/LF', () => {
      const text = 'a\x07b\x08c\nd\re'; // Contains BELL, Backspace, LF, CR
      expect(stripUnsafeCharacters(text)).toBe('abc\nd\re');
    });

    it('should remove C1 control characters', () => {
      const text = 'a\x85b'; // Contains NEXT LINE
      expect(stripUnsafeCharacters(text)).toBe('ab');
    });

    it('should preserve printable ASCII and Unicode characters', () => {
      const text = 'Hello, world! \ud83c\udf0f'; //  🌏
      expect(stripUnsafeCharacters(text)).toBe(text);
    });

    it('should preserve the DEL character', () => {
      const text = 'a\x7fb';
      expect(stripUnsafeCharacters(text)).toBe(text);
    });

    it('should handle an empty string', () => {
      expect(stripUnsafeCharacters('')).toBe('');
    });
  });

  describe('getCachedStringWidth', () => {
    beforeEach(() => {
      clearStringWidthCache();
    });

    it('should return the correct width for ASCII strings', () => {
      expect(getCachedStringWidth('hello')).toBe(5);
    });

    it('should return the correct width for strings with wide characters', () => {
      expect(getCachedStringWidth('\u4f60\u597d')).toBe(4); // "你好"
    });
  });

  describe('sanitizeAnsiCtrl', () => {
    it('should replace ANSI escape codes with a visible representation', () => {
      const text = '\u001b[31mHello\u001b[0m';
      const expected = '\\u001b[31mHello\\u001b[0m';
      expect(sanitizeAnsiCtrl(text)).toBe(expected);

      const text2 = "sh -e 'good && bad# [9D[K && good"
      const expected2 = "sh -e 'good && bad# \\u001b[9D\\u001b[K && good"
      expect(sanitizeAnsiCtrl(text2)).toBe(expected2);
    });

    it('should not change a string with no ANSI codes', () => {
      const text = 'Hello, world!';
      expect(sanitizeAnsiCtrl(text)).toBe(text);
    });

    it('should handle an empty string', () => {
      expect(sanitizeAnsiCtrl('')).toBe('');
    });
  });

  describe('sanitizeConfirmationDetails', () => {
    it('should sanitize command and rootCommand for exec type', () => {
      const details: ToolCallConfirmationDetails = {
        title: 'fake-title',
        type: 'exec',
        command: '\u001b[31 rootCommand mls -l\u001b[0m',
        rootCommand: '\u001b[31 rootCommand',
        onConfirm: async () => {},
      };

      const sanitized = sanitizeConfirmationDetails(details);

      // Type guard to satisfy TypeScript
      if (sanitized.type === 'exec') {
        expect(sanitized.command).toBe('\\u001b[31 rootCommand mls -l\\u001b[0m');
        expect(sanitized.rootCommand).toBe(
          '\\u001b[31 rootCommand',
        );
      }
    });
  });
});
