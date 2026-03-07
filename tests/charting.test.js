import { describe, test, expect } from 'bun:test';
import { Table } from '../src/runtime/table.js';
import { bar_chart, line_chart, scatter_chart, histogram, pie_chart, heatmap } from '../src/runtime/charts.js';

const salesData = new Table([
  { region: 'North', revenue: 500, cost: 300 },
  { region: 'South', revenue: 300, cost: 200 },
  { region: 'East', revenue: 700, cost: 400 },
  { region: 'West', revenue: 450, cost: 250 },
]);

const timeData = new Table([
  { date: '2024-01', price: 100 },
  { date: '2024-02', price: 120 },
  { date: '2024-03', price: 110 },
  { date: '2024-04', price: 140 },
]);

const scatterData = new Table([
  { age: 25, income: 40000 },
  { age: 35, income: 60000 },
  { age: 45, income: 80000 },
  { age: 55, income: 70000 },
]);

const histData = new Table(
  Array.from({ length: 50 }, (_, i) => ({ value: Math.floor(i / 5) * 10 + (i % 5) }))
);

describe('bar_chart', () => {
  test('returns valid SVG string', () => {
    const svg = bar_chart(salesData, { x: r => r.region, y: r => r.revenue });
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('viewBox');
  });

  test('contains all data labels', () => {
    const svg = bar_chart(salesData, { x: r => r.region, y: r => r.revenue });
    expect(svg).toContain('North');
    expect(svg).toContain('South');
    expect(svg).toContain('East');
    expect(svg).toContain('West');
  });

  test('respects title option', () => {
    const svg = bar_chart(salesData, { x: r => r.region, y: r => r.revenue, title: 'Revenue Report' });
    expect(svg).toContain('Revenue Report');
  });

  test('respects width and height', () => {
    const svg = bar_chart(salesData, { x: r => r.region, y: r => r.revenue, width: 800, height: 500 });
    expect(svg).toContain('800');
    expect(svg).toContain('500');
  });

  test('works with array input', () => {
    const arr = [{ x: 'A', y: 10 }, { x: 'B', y: 20 }];
    const svg = bar_chart(arr, { x: r => r.x, y: r => r.y });
    expect(svg).toContain('<svg');
  });

  test('contains rect elements for bars', () => {
    const svg = bar_chart(salesData, { x: r => r.region, y: r => r.revenue });
    expect(svg).toContain('<rect');
  });
});

describe('line_chart', () => {
  test('returns valid SVG', () => {
    const svg = line_chart(timeData, { x: r => r.date, y: r => r.price });
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  test('contains polyline or path', () => {
    const svg = line_chart(timeData, { x: r => r.date, y: r => r.price });
    const hasLine = svg.includes('<polyline') || svg.includes('<path');
    expect(hasLine).toBe(true);
  });

  test('title option', () => {
    const svg = line_chart(timeData, { x: r => r.date, y: r => r.price, title: 'Prices' });
    expect(svg).toContain('Prices');
  });
});

describe('scatter_chart', () => {
  test('returns valid SVG with circles', () => {
    const svg = scatter_chart(scatterData, { x: r => r.age, y: r => r.income });
    expect(svg).toContain('<svg');
    expect(svg).toContain('<circle');
  });
});

describe('histogram', () => {
  test('returns valid SVG', () => {
    const svg = histogram(histData, { col: r => r.value });
    expect(svg).toContain('<svg');
    expect(svg).toContain('<rect');
  });

  test('bins option', () => {
    const svg = histogram(histData, { col: r => r.value, bins: 5 });
    expect(svg).toContain('<svg');
  });
});

describe('pie_chart', () => {
  test('returns valid SVG with paths', () => {
    const svg = pie_chart(salesData, { label: r => r.region, value: r => r.revenue });
    expect(svg).toContain('<svg');
    expect(svg).toContain('<path');
  });

  test('contains labels', () => {
    const svg = pie_chart(salesData, { label: r => r.region, value: r => r.revenue });
    expect(svg).toContain('North');
  });
});

describe('heatmap', () => {
  test('returns valid SVG', () => {
    const hmData = new Table([
      { month: 'Jan', product: 'A', sales: 100 },
      { month: 'Jan', product: 'B', sales: 200 },
      { month: 'Feb', product: 'A', sales: 150 },
      { month: 'Feb', product: 'B', sales: 180 },
    ]);
    const svg = heatmap(hmData, { x: r => r.month, y: r => r.product, value: r => r.sales });
    expect(svg).toContain('<svg');
    expect(svg).toContain('<rect');
  });
});

describe('edge cases', () => {
  test('empty data returns SVG with message', () => {
    const svg = bar_chart(new Table([]), { x: r => r.x, y: r => r.y });
    expect(svg).toContain('<svg');
    expect(svg).toContain('No data');
  });

  test('single row', () => {
    const svg = bar_chart(new Table([{ x: 'A', y: 10 }]), { x: r => r.x, y: r => r.y });
    expect(svg).toContain('<svg');
    expect(svg).toContain('<rect');
  });
});
