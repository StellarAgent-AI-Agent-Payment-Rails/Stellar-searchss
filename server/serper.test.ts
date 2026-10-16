import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, vi } from 'vitest';

import {
  mapOrganicResults,
  mapImageResults,
  mapNewsResults,
  validateSerperResponse,
} from './serper';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'tests', 'fixtures', 'serper');

function loadFixture(name: string): any {
  const p = join(FIXTURES_DIR, name);
  return JSON.parse(readFileSync(p, 'utf-8'));
}

let organicFixture: any;
let imagesFixture: any;
let newsFixture: any;

beforeAll(() => {
  organicFixture = loadFixture('organic.json');
  imagesFixture = loadFixture('images.json');
  newsFixture = loadFixture('news.json');
});

describe('Serper response schema contract', () => {
  it('organic fixture matches the expected shape', () => {
    expect(organicFixture.organic).toBeInstanceOf(Array);
    expect(organicFixture.organic.length).toBeGreaterThan(0);
    for (const r of organicFixture.organic) {
      expect(r).toHaveProperty('title');
      expect(r).toHaveProperty('link');
      expect(r).toHaveProperty('snippet');
      expect(typeof r.title).toBe('string');
      expect(typeof r.link).toBe('string');
      expect(typeof r.snippet).toBe('string');
    }
  });

  it('images fixture matches the expected shape', () => {
    expect(imagesFixture.images).toBeInstanceOf(Array);
    expect(imagesFixture.images.length).toBeGreaterThan(0);
    for (const r of imagesFixture.images) {
      expect(r).toHaveProperty('title');
      expect(r).toHaveProperty('imageUrl');
      expect(r).toHaveProperty('imageWidth');
      expect(r).toHaveProperty('imageHeight');
      expect(typeof r.imageUrl).toBe('string');
      expect(typeof r.imageWidth).toBe('number');
      expect(typeof r.imageHeight).toBe('number');
    }
  });

  it('news fixture matches the expected shape', () => {
    expect(newsFixture.news).toBeInstanceOf(Array);
    expect(newsFixture.news.length).toBeGreaterThan(0);
    for (const r of newsFixture.news) {
      expect(r).toHaveProperty('title');
      expect(r).toHaveProperty('link');
      expect(r).toHaveProperty('snippet');
      expect(typeof r.title).toBe('string');
      expect(typeof r.link).toBe('string');
      expect(typeof r.snippet).toBe('string');
    }
  });
});

describe('mapping functions against fixtures', () => {
  it('mapOrganicResults maps all fields correctly', () => {
    const mapped = mapOrganicResults(organicFixture.organic);
    expect(mapped.length).toBe(organicFixture.organic.length);
    mapped.forEach((m, i) => {
      expect(m.title).toBe(organicFixture.organic[i].title);
      expect(m.link).toBe(organicFixture.organic[i].link);
      expect(m.snippet).toBe(organicFixture.organic[i].snippet);
    });
  });

  it('mapImageResults maps all fields correctly', () => {
    const mapped = mapImageResults(imagesFixture.images);
    expect(mapped.length).toBe(imagesFixture.images.length);
    mapped.forEach((m, i) => {
      expect(m.title).toBe(imagesFixture.images[i].title);
      expect(m.imageUrl).toBe(imagesFixture.images[i].imageUrl);
      expect(m.imageWidth).toBe(imagesFixture.images[i].imageWidth);
      expect(m.imageHeight).toBe(imagesFixture.images[i].imageHeight);
    });
  });

  it('mapNewsResults maps all fields correctly', () => {
    const mapped = mapNewsResults(newsFixture.news);
    expect(mapped.length).toBe(newsFixture.news.length);
    mapped.forEach((m, i) => {
      expect(m.title).toBe(newsFixture.news[i].title);
      expect(m.link).toBe(newsFixture.news[i].link);
      expect(m.snippet).toBe(newsFixture.news[i].snippet);
    });
  });
});

describe('field rename detection', () => {
  it('fails when organic.snippet is renamed', () => {
    const warnSpy = vi.spyOn(console, 'warn');
    const renamed = JSON.parse(JSON.stringify(organicFixture));
    for (const r of renamed.organic) {
      r.description = r.snippet;
      delete r.snippet;
    }
    const mapped = mapOrganicResults(renamed.organic);
    expect(mapped[0].snippet).toBe('');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('fails when images.imageWidth is renamed', () => {
    const warnSpy = vi.spyOn(console, 'warn');
    const renamed = JSON.parse(JSON.stringify(imagesFixture));
    for (const r of renamed.images) {
      r.width = r.imageWidth;
      delete r.imageWidth;
    }
    const mapped = mapImageResults(renamed.images);
    expect(mapped[0].imageWidth).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('fails when news.snippet is renamed', () => {
    const warnSpy = vi.spyOn(console, 'warn');
    const renamed = JSON.parse(JSON.stringify(newsFixture));
    for (const r of renamed.news) {
      r.description = r.snippet;
      delete r.snippet;
    }
    const mapped = mapNewsResults(renamed.news);
    expect(mapped[0].snippet).toBe('');
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe('validateSerperResponse', () => {
  it('returns no warnings for valid fixtures', () => {
    expect(validateSerperResponse(organicFixture, 'organic')).toEqual([]);
    expect(validateSerperResponse(imagesFixture, 'images')).toEqual([]);
    expect(validateSerperResponse(newsFixture, 'news')).toEqual([]);
  });

  it('reports a missing organic field', () => {
    const renamed = JSON.parse(JSON.stringify(organicFixture));
    delete renamed.organic[0].snippet;
    const warnings = validateSerperResponse(renamed, 'organic');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.join(' ')).toContain('snippet');
  });

  it('reports a missing image field', () => {
    const renamed = JSON.parse(JSON.stringify(imagesFixture));
    delete renamed.images[0].imageWidth;
    const warnings = validateSerperResponse(renamed, 'images');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.join(' ')).toContain('imageWidth');
  });
});
