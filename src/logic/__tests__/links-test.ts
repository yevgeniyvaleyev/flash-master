import { normalizeUrl, urlLabel } from '../links';

describe('normalizeUrl', () => {
  it('adds https:// to a bare address and keeps http(s) ones', () => {
    expect(normalizeUrl(' coursera.org/learn/x ')).toBe('https://coursera.org/learn/x');
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeUrl('https://www.youtube.com/watch?v=1')).toBe('https://www.youtube.com/watch?v=1');
    expect(normalizeUrl('localhost:3000/x')).toBe('https://localhost:3000/x');
  });

  it('rejects other schemes and non-addresses', () => {
    for (const bad of [
      'javascript:alert(1)',
      'ftp://x.org',
      'mailto:a@b.c',
      'hello',
      '',
      '   ',
      'a b.com',
      'https://',
    ]) {
      expect(normalizeUrl(bad)).toBeNull();
    }
    expect(normalizeUrl(null)).toBeNull();
  });
});

describe('urlLabel', () => {
  it('is the host without www', () => {
    expect(urlLabel('https://www.youtube.com/watch?v=1')).toBe('youtube.com');
    expect(urlLabel('https://Coursera.org')).toBe('coursera.org');
  });
});
