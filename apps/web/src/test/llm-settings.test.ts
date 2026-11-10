import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, PRESETS, saveSettings } from '../agent/llm';
import { setStorageScope } from '../lib/storage-scope';

describe('AI settings persistence', () => {
  let values: Map<string, string>;

  beforeEach(() => {
    values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    setStorageScope();
  });

  afterEach(() => {
    setStorageScope();
    vi.unstubAllGlobals();
  });

  it('restores every saved field, including empty values', () => {
    const settings = { baseURL: '', apiKey: 'secret', model: '' };
    saveSettings(settings);
    expect(loadSettings()).toEqual(settings);
  });

  it('keeps settings isolated by account', () => {
    setStorageScope('first');
    saveSettings({ baseURL: 'https://example.com/v1', apiKey: 'secret', model: 'custom' });
    setStorageScope('second');
    expect(loadSettings()).toEqual({ baseURL: PRESETS[0].baseURL, apiKey: '', model: PRESETS[0].model });
    setStorageScope('first');
    expect(loadSettings().model).toBe('custom');
  });

  it('recovers safely from malformed or incomplete stored values', () => {
    values.set('nc:llm', '{invalid');
    expect(loadSettings()).toEqual({ baseURL: PRESETS[0].baseURL, apiKey: '', model: PRESETS[0].model });
    values.set('nc:llm', JSON.stringify({ baseURL: 'https://example.com', apiKey: null }));
    expect(loadSettings()).toEqual({ baseURL: 'https://example.com', apiKey: '', model: PRESETS[0].model });
  });
});
