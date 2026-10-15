import { useState } from "react";
import type { DeskMetricsResponse } from "../../../lib/api";

type Day = DeskMetricsResponse["volumeByDay"][number];

const W = 800;
const H = 240;
const PAD = { top: 12, right: 8, bottom: 28, left: 36 };

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function dayLabel(date: string): string {
  const [, m, d] = date.slice(0, 10).split("-");
  return `${d}/${m}`;
}

/** Volume diário: barras agrupadas, entrada (cor de destaque) x saída (neutro). */
export function VolumeChart({ data }: { data: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...data.flatMap((d) => [d.inbound, d.outbound])));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / Math.max(1, data.length);
  const barW = Math.max(2, Math.min(14, band / 2 - 2));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const labelEvery = Math.ceil(data.length / 8);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
  const active = hover !== null ? data[hover] : null;

  return (
    <figure className="m-0">
      <div className="mb-2 flex items-center gap-4 text-xs text-fg-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-accent-600" /> Entrada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-line-strong" /> Saída
        </span>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Volume de mensagens por dia, entrada e saída"
          className="h-auto w-full"
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                className="stroke-line"
                strokeWidth={1}
              />
              <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" className="fill-fg-faint text-[10px]">
                {t}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = PAD.left + band * i + band / 2;
            return (
              <g key={d.date}>
                {hover === i && (
                  <rect x={cx - band / 2} y={PAD.top} width={band} height={plotH} className="fill-subtle" />
                )}
                <rect
                  x={cx - barW - 1}
                  y={y(d.inbound)}
                  width={barW}
                  height={plotH - (y(d.inbound) - PAD.top)}
                  rx={2}
                  className="fill-accent-600"
                />
                <rect
                  x={cx + 1}
                  y={y(d.outbound)}
                  width={barW}
                  height={plotH - (y(d.outbound) - PAD.top)}
                  rx={2}
                  className="fill-line-strong"
                />
                {i % labelEvery === 0 && (
                  <text x={cx} y={H - 8} textAnchor="middle" className="fill-fg-muted text-[10px]">
                    {dayLabel(d.date)}
                  </text>
                )}
                <rect
                  x={cx - band / 2}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
              </g>
            );
          })}
        </svg>
        {active && hover !== null && (
          <div
            className="pointer-events-none absolute top-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs shadow-md"
            style={{
              left: `${((PAD.left + band * hover + band / 2) / W) * 100}%`,
              transform: hover > data.length / 2 ? "translateX(-110%)" : "translateX(10%)",
            }}
          >
            <p className="font-medium text-fg">{dayLabel(active.date)}</p>
            <p className="text-fg-muted">Entrada: {active.inbound}</p>
            <p className="text-fg-muted">Saída: {active.outbound}</p>
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>Volume por dia</caption>
        <thead>
          <tr>
            <th>Dia</th>
            <th>Entrada</th>
            <th>Saída</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{dayLabel(d.date)}</td>
              <td>{d.inbound}</td>
              <td>{d.outbound}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
