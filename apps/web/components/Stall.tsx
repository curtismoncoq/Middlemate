import { stallView } from '../lib/stall.ts';
import type { ApiListing } from '../lib/types.ts';

type Props = { listing: ApiListing; auditing?: { probe: number; total: number }; number?: number };

const SHELVES = [150, 192, 234];
const SERVERS = [28, 54, 80, 106, 132, 158];

/** One listing drawn as a shop front: sign, window with its claimed model, door placard, price board. */
export function Stall({ listing, auditing, number }: Props) {
  const v = stallView(listing, auditing);
  return (
    <svg className={`stall stall--${v.state}`} viewBox="0 0 280 344" role="img" aria-label={v.label}>
      <rect className="st-facade" x="0" y="0" width="280" height="324" />
      <rect className="st-sign" x="12" y="12" width="256" height="48" />
      <text className="st-sign__name" x="26" y="46">{v.sign}</text>
      <text className="st-kind" x="14" y="82">{v.kind}</text>
      {number !== undefined && (
        <g>
          <rect className="st-plaque" x="236" y="68" width="30" height="18" />
          <text className="st-plaque__no" x="251" y="81" textAnchor="middle">{number}</text>
        </g>
      )}

      <rect className="st-window" x="14" y="92" width="170" height="180" />
      <text className="st-window__claim" x="99" y="120" textAnchor="middle">{v.window}</text>
      {SHELVES.map((y, row) => (
        <g key={y}>
          {SERVERS.slice(0, row === 2 ? 4 : 6).map((x, i) => (
            <g key={x}>
              <rect className="st-server" x={x - 2} y={y - 26} width="20" height="24" />
              <circle className={`st-led ${(i + row) % 3 === 0 ? 'st-led--blink' : ''}`} cx={x + 4} cy={y - 8} r="2.2" />
            </g>
          ))}
          <rect className="st-shelf" x="22" y={y} width="154" height="3" />
        </g>
      ))}

      <rect className="st-door" x="196" y="92" width="72" height="210" />
      <rect className="st-door__glass" x="206" y="104" width="52" height="58" />
      <rect className="st-handle" x="254" y="232" width="4" height="18" />
      {v.state === 'auditing' && <circle className="st-lamp" cx="232" cy="96" r="5" />}
      <g className="st-placard">
        <rect x="199" y="174" width="66" height="42" />
        <text className="st-placard__l1" x="232" y="190" textAnchor="middle">{v.placard[0]}</text>
        <text className="st-placard__l2" x="232" y="208" textAnchor="middle" {...(v.placard[1].length > 6 ? { textLength: 56, lengthAdjust: 'spacingAndGlyphs' } : {})}>{v.placard[1]}</text>
      </g>

      {v.state === 'slashed' && (
        <g className="st-shutter">
          <rect x="12" y="90" width="258" height="214" />
          {Array.from({ length: 20 }, (_, i) => <rect key={i} className="st-shutter__slat" x="12" y={98 + i * 10} width="258" height="2" />)}
          <g transform="rotate(-9 140 196)">
            <rect className="st-tape" x="-20" y="180" width="320" height="32" />
            <text className="st-tape__text" x="140" y="202" textAnchor="middle">{v.tape}</text>
          </g>
        </g>
      )}

      <g className="st-board">
        <rect x="40" y="270" width="104" height="56" />
        <text className="st-board__l1" x="92" y="288" textAnchor="middle">PER REQUEST</text>
        <text className="st-board__price" x="92" y="314" textAnchor="middle">{v.price}</text>
      </g>
      <rect className="st-kerb" x="0" y="324" width="280" height="20" />
    </svg>
  );
}
