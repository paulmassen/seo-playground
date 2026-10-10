import { describe, expect, it } from 'vitest';
import { formatBusinessTarget, matchesGridTarget, parseTargetCid, reconcileGridPoints } from './grid-target';

const listing = { title: 'Elevation Athletics Physical Therapy', domain: 'www.elevationathleticspt.com', url: 'https://www.elevationathleticspt.com/', cid: '1234567890' };
const other = { title: 'Elevate Rehab', domain: 'elevaterehab.com', url: 'https://elevaterehab.com/', cid: '999' };

describe('matchesGridTarget', () => {
  it('matches a domain target against a listing that only has a title', () => {
    expect(matchesGridTarget('saint-esteve.com', { title: "Chateau Saint Esteve d'Uchaux" })).toBe(true);
    expect(matchesGridTarget('https://www.saint-esteve.com/vins', { title: "Château Saint-Estève d'Uchaux" })).toBe(true);
  });

  it('keeps plain substring matching and avoids unrelated listings', () => {
    expect(matchesGridTarget("Chateau Saint Esteve d'Uchaux", { title: "Chateau Saint Esteve d'Uchaux" })).toBe(true);
    expect(matchesGridTarget('saint-esteve.com', { title: 'Vin Chez Moi' })).toBe(false);
    expect(matchesGridTarget('a.fr', { title: 'Cave a vin' })).toBe(false);
  });

  it('matches a domain with or without protocol and www', () => {
    for (const target of ['https://elevationathleticspt.com', 'https://www.elevationathleticspt.com', 'elevationathleticspt.com', 'www.elevationathleticspt.com/']) {
      expect(matchesGridTarget(target, listing)).toBe(true);
      expect(matchesGridTarget(target, other)).toBe(false);
    }
  });

  it('requires the path when one is given and the listing has a URL', () => {
    const brand = { title: 'Brand PT Keller', domain: 'brandpt.com', url: 'https://brandpt.com/locations/keller' };
    expect(matchesGridTarget('brandpt.com/locations/keller', brand)).toBe(true);
    expect(matchesGridTarget('brandpt.com/locations/denton', brand)).toBe(false);
  });

  it('matches a picked Google listing by CID only', () => {
    const target = formatBusinessTarget('Elevation Athletics Physical Therapy', '1234567890');
    expect(parseTargetCid(target)).toBe('1234567890');
    expect(matchesGridTarget(target, listing)).toBe(true);
    expect(matchesGridTarget(target, { ...listing, cid: '1' })).toBe(false);
    expect(matchesGridTarget(target, { title: 'Elevation Athletics Physical Therapy' })).toBe(false);
  });

  it('falls back to a partial business-name match', () => {
    expect(matchesGridTarget('elevation athletics', listing)).toBe(true);
    expect(matchesGridTarget('elevation athletics', other)).toBe(false);
  });
});

describe('reconcileGridPoints', () => {
  it('recomputes rank from stored items', () => {
    const [point] = reconcileGridPoints([{
      rank: null,
      items: [
        { rank_group: 1, title: 'Ovins', is_target: false },
        { rank_group: 3, title: "Chateau Saint Esteve d'Uchaux", is_target: false },
      ],
    }], 'saint-esteve.com');
    expect(point.rank).toBe(3);
    expect(point.items?.[1].is_target).toBe(true);
  });

  it('recomputes rank from a CID target', () => {
    const [point] = reconcileGridPoints([{
      rank: null,
      items: [
        { rank_group: 1, title: 'Elevate Rehab', cid: '999', is_target: false },
        { rank_group: 2, title: 'Elevation Athletics Physical Therapy', cid: '1234567890', is_target: false },
      ],
    }], formatBusinessTarget('Elevation Athletics Physical Therapy', '1234567890'));
    expect(point.rank).toBe(2);
  });
});
