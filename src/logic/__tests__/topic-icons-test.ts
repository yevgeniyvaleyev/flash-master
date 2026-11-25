import { POPULAR, searchIcons, validIcon } from '../topic-icons';

const ALL = [
  'book-open-variant',
  'cards',
  'guitar-acoustic',
  'guitar-electric',
  'music-guitar',
  'guitar-pick-outline',
  'guitar-pick',
  'translate',
  'headphones',
];

describe('searchIcons', () => {
  it('returns the popular icons for an empty query', () => {
    expect(searchIcons('  ', ALL)).toEqual(POPULAR.map((p) => p.name));
  });

  it('finds icons by Russian words', () => {
    expect(searchIcons('книга', ALL)[0]).toBe('book-open-variant');
    expect(searchIcons('Карточк', ALL)).toContain('cards');
  });

  it('ranks names starting with the query first and outline variants after filled ones', () => {
    const r = searchIcons('guitar', ALL).filter((n) => !POPULAR.some((p) => p.name === n));
    expect(r).toEqual(['guitar-pick', 'guitar-electric', 'guitar-pick-outline', 'music-guitar']);
  });

  it('puts the curated match before the rest and does not repeat it', () => {
    const r = searchIcons('guitar', ALL);
    expect(r[0]).toBe('guitar-acoustic');
    expect(r.filter((n) => n === 'guitar-acoustic')).toHaveLength(1);
  });

  it('treats spaces as dashes and respects the limit', () => {
    expect(searchIcons('guitar pick', ALL)).toEqual(['guitar-pick', 'guitar-pick-outline']);
    expect(searchIcons('guitar', ALL, 2)).toHaveLength(2);
  });

  it('returns nothing for an unknown query', () => {
    expect(searchIcons('zzzz', ALL)).toEqual([]);
  });
});

describe('validIcon', () => {
  it('keeps known names only', () => {
    const set = new Set(ALL);
    expect(validIcon('cards', set)).toBe('cards');
    expect(validIcon('nope', set)).toBeNull();
    expect(validIcon(null, set)).toBeNull();
  });
});
