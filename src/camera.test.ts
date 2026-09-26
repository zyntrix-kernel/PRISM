// Unit tests for media-error formatting: rejections cross realms and
// libraries, so the formatter duck-types instead of using instanceof.

import { describe, expect, it } from 'vitest';
import { describeMediaError } from './camera';

describe('describeMediaError', () => {
  it('prefers real messages', () => {
    expect(describeMediaError(new Error('Permission denied'))).toBe('Permission denied');
    expect(describeMediaError('plain string')).toBe('plain string');
  });

  it('reads message-like objects (DOMException, cross-realm errors)', () => {
    expect(describeMediaError({ message: 'Permission dismissed' })).toBe('Permission dismissed');
  });

  it('names bare events instead of printing [object Event]', () => {
    const out = describeMediaError({ type: 'error' });
    expect(out).toContain('error');
    expect(out).not.toContain('[object');
  });

  it('never returns [object Object] or empty text', () => {
    for (const bad of [{}, { target: {} }, 42, null, undefined]) {
      const out = describeMediaError(bad);
      expect(out.length).toBeGreaterThan(0);
      expect(out).not.toBe('[object Object]');
    }
  });

  it('serializes informative payloads', () => {
    expect(describeMediaError({ code: 404 })).toContain('404');
  });
});
