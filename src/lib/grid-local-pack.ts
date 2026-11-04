/**
 * Keeps the organic Local Finder listings and renumbers them 1..n.
 *
 * DataForSEO returns sponsored listings (`is_paid: true`) in the same `rank_group` sequence as organic
 * ones. Counting them would credit an ad as an earned position and push every organic listing down by
 * one. Only the paid entry is dropped: a business that also has an organic listing keeps it.
 */
export function organicLocalPack<T extends { type: string; rank_group: number; is_paid?: boolean }>(items: T[]): T[] {
  return items
    .filter((item) => item.type === 'local_pack' && !item.is_paid)
    .sort((a, b) => a.rank_group - b.rank_group)
    .map((item, index) => ({ ...item, rank_group: index + 1 }));
}
