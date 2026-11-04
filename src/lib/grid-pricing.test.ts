import { describe, expect, it } from 'vitest';
import { estimateGridCost, estimateGridCostPerPoint, parseGridDepth } from './grid-pricing';

describe('estimateGridCostPerPoint', () => {
  it('bills the queues per page of 10 results, matching saved depth-20 runs', () => {
    expect(estimateGridCostPerPoint('standard', 10)).toBeCloseTo(0.0006);
    expect(estimateGridCostPerPoint('standard', 20)).toBeCloseTo(0.0012);
    expect(estimateGridCostPerPoint('priority', 10)).toBeCloseTo(0.0012);
    expect(estimateGridCostPerPoint('priority', 20)).toBeCloseTo(0.0024);
  });

  it('keeps Live at the flat per-point price it was billed at depth 20', () => {
    expect(estimateGridCostPerPoint('live', 10)).toBeCloseTo(0.002);
    expect(estimateGridCostPerPoint('live', 20)).toBeCloseTo(0.002);
  });

  it('defaults to depth 20 for monitors created before the choice existed', () => {
    expect(estimateGridCost(25, 'priority')).toBeCloseTo(0.06);
  });
});

describe('parseGridDepth', () => {
  it('accepts only 10 and 20', () => {
    expect(parseGridDepth('20')).toBe(20);
    expect(parseGridDepth(10)).toBe(10);
    expect(parseGridDepth('40')).toBe(10);
    expect(parseGridDepth(null, 20)).toBe(20);
  });
});
