// Unit tests for device detection: conservative, never throws, and
// weak signals always force the Low tier.

import { describe, expect, it } from 'vitest';
import { classifyGpu, detectDevice, recommendTier } from './device';

describe('classifyGpu', () => {
  it('flags software renderers', () => {
    expect(classifyGpu('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))')).toBe(true);
    expect(classifyGpu('llvmpipe (LLVM 15.0.7)')).toBe(true);
    expect(classifyGpu('WebKit WebGL')).toBe(false);
  });

  it('trusts real GPUs and treats unknown as OK (governor is the backstop)', () => {
    expect(classifyGpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002487))')).toBe(false);
    expect(classifyGpu('ANGLE (AMD, AMD Radeon RX 7600 (0x00007481))')).toBe(false);
    expect(classifyGpu(null)).toBe(false);
    expect(classifyGpu('webgl-no-debug-info')).toBe(false);
  });
});

describe('recommendTier', () => {
  const base = { isMobile: false, gpuRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)' };

  it('forces low for mobile, weak GPUs, few cores, or little RAM', () => {
    expect(recommendTier({ ...base, isMobile: true })).toBe('low');
    expect(recommendTier({ ...base, gpuRenderer: 'llvmpipe' })).toBe('low');
    expect(recommendTier({ ...base, hardwareConcurrency: 4, deviceMemoryGB: 16 })).toBe('low');
    expect(recommendTier({ ...base, hardwareConcurrency: 8, deviceMemoryGB: 4 })).toBe('low');
  });

  it('uses high for strong desktops, medium otherwise', () => {
    expect(recommendTier({ ...base, hardwareConcurrency: 8, deviceMemoryGB: 16 })).toBe('high');
    expect(recommendTier({ ...base, hardwareConcurrency: 6, deviceMemoryGB: 8 })).toBe('medium');
    expect(recommendTier({ ...base, hardwareConcurrency: undefined, deviceMemoryGB: undefined })).toBe('high');
  });
});

describe('detectDevice', () => {
  it('never throws and always returns a valid tier', () => {
    const d = detectDevice({});
    expect(['low', 'medium', 'high']).toContain(d.tier);
    expect(typeof d.isMobile).toBe('boolean');
  });

  it('flags mobile user agents', () => {
    const d = detectDevice({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    });
    expect(d.isMobile).toBe(true);
    expect(d.tier).toBe('low');
  });
});
