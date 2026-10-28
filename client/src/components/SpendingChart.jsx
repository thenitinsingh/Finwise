// Smooth monthly area chart, drawn as plain SVG (no chart library needed).
// Monotone curve fitting keeps the line from overshooting between points.

import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { formatCurrency } from '../lib/dashboard.js';

const HEIGHT = 240;
const PAD = { top: 18, right: 18, bottom: 30, left: 54 };

function niceTicks(maxValue, count = 4) {
  if (maxValue <= 0) return [0, 25, 50, 75, 100];
  const rough = maxValue / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough);
  const top = Math.ceil(maxValue / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

// Fritsch–Carlson monotone cubic interpolation → SVG path commands.
function monotonePath(points) {
  const n = points.length;
  if (n < 2) return '';
  const dx = [];
  const slope = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx.push(points[i + 1].x - points[i].x);
    slope.push((points[i + 1].y - points[i].y) / dx[i]);
  }
  const tangent = [slope[0]];
  for (let i = 1; i < n - 1; i += 1) {
    tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  tangent.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i += 1) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      tangent[i] = t * a * slope[i];
      tangent[i + 1] = t * b * slope[i];
    }
  }
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < n - 1; i += 1) {
    const third = dx[i] / 3;
    d += ` C${points[i].x + third},${points[i].y + tangent[i] * third} ${points[i + 1].x - third},${
      points[i + 1].y - tangent[i + 1] * third
    } ${points[i + 1].x},${points[i + 1].y}`;
  }
  return d;
}

const shortMoney = (v) => (v >= 1000 ? `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `$${v}`);

export default function SpendingChart({ series }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(560);
  const [hover, setHover] = useState(null);
  const gradientId = `area-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return undefined;
    const update = () => setWidth(Math.max(260, element.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => {
    const ticks = niceTicks(Math.max(...series.map((p) => p.total)));
    const top = ticks.at(-1);
    const innerW = width - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const inset = series.length > 1 ? Math.min(28, innerW / (series.length * 2)) : 0;
    const x = (i) =>
      series.length === 1 ? PAD.left + innerW / 2 : PAD.left + inset + (i * (innerW - inset * 2)) / (series.length - 1);
    const y = (v) => PAD.top + innerH - (v / top) * innerH;
    const points = series.map((p, i) => ({ x: x(i), y: y(p.total), ...p }));
    const line = monotonePath(points);
    const baseline = PAD.top + innerH;
    const area = line ? `${line} L${points.at(-1).x},${baseline} L${points[0].x},${baseline} Z` : '';
    return { ticks, y, points, line, area, baseline };
  }, [series, width]);

  function handleMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    geometry.points.forEach((p, i) => {
      if (Math.abs(p.x - px) < Math.abs(geometry.points[nearest].x - px)) nearest = i;
    });
    setHover(nearest);
  }

  const active = hover === null ? null : geometry.points[hover];
  const summary = series.map((p) => `${p.label} ${formatCurrency(p.total)}`).join(', ');

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg
        className="chart"
        width="100%"
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={`Monthly spending: ${summary}`}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6d78e8" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#6d78e8" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {geometry.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={geometry.y(tick)}
              y2={geometry.y(tick)}
              className={tick === 0 ? 'grid-base' : 'grid-line'}
            />
            <text x={PAD.left - 10} y={geometry.y(tick)} className="axis-label" textAnchor="end" dominantBaseline="middle">
              {shortMoney(tick)}
            </text>
          </g>
        ))}

        {geometry.area ? <path d={geometry.area} fill={`url(#${gradientId})`} /> : null}
        {geometry.line ? <path d={geometry.line} className="chart-line" /> : null}

        {geometry.points.map((p, i) => (
          <g key={p.key}>
            <text x={p.x} y={HEIGHT - 8} className="axis-label" textAnchor="middle">
              {p.label}
            </text>
            <circle cx={p.x} cy={p.y} r={hover === i ? 5.5 : 3.5} className="chart-dot">
              <title>{`${p.label}: ${formatCurrency(p.total)}`}</title>
            </circle>
          </g>
        ))}

        {active ? (
          <line x1={active.x} x2={active.x} y1={PAD.top} y2={geometry.baseline} className="hover-line" />
        ) : null}
      </svg>

      {active ? (
        <div
          className="chart-tooltip"
          style={{
            left: `${(active.x / width) * 100}%`,
            top: `${active.y}px`,
          }}
        >
          <span>{active.label}</span>
          <strong>{formatCurrency(active.total)}</strong>
        </div>
      ) : null}
    </div>
  );
}
