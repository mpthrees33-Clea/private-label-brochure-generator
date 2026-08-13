import type { SizeIcon as SizeIconKind } from "@/lib/brochure-types";

const STROKE = "#5a5a5a";

export function SizeIcon({ kind }: { kind: SizeIconKind }) {
  switch (kind) {
    case "rectangle":
      return (
        <svg viewBox="0 0 30 60" className="h-8 w-4" aria-hidden>
          <rect x="0.5" y="0.5" width="29" height="59" fill="none" stroke={STROKE} strokeWidth="1" />
        </svg>
      );
    case "square":
      return (
        <svg viewBox="0 0 40 40" className="h-6 w-6" aria-hidden>
          <rect x="0.5" y="0.5" width="39" height="39" fill="none" stroke={STROKE} strokeWidth="1" />
        </svg>
      );
    case "plank":
      return (
        <svg viewBox="0 0 18 60" className="h-8 w-[10px]" aria-hidden>
          <rect x="0.5" y="0.5" width="17" height="59" fill="none" stroke={STROKE} strokeWidth="1" />
        </svg>
      );
    case "mosaic":
      return (
        <svg viewBox="0 0 40 40" className="h-6 w-6" aria-hidden>
          {[0, 1, 2, 3].map((r) =>
            [0, 1, 2, 3].map((c) => (
              <rect key={`${r}-${c}`} x={c * 10 + 0.5} y={r * 10 + 0.5} width="9" height="9"
                fill="none" stroke={STROKE} strokeWidth="0.75" />
            )),
          )}
        </svg>
      );
    case "mosaic-penny":
      // Penny-round sheet: staggered rows of circles.
      return (
        <svg viewBox="0 0 40 40" className="h-6 w-6" aria-hidden>
          {[0, 1, 2, 3].map((r) =>
            [0, 1, 2, 3].map((c) => {
              const offset = r % 2 === 1 ? 5 : 0;
              const cx = c * 10 + 5 + offset;
              if (cx + 4.5 > 40) return null;
              return (
                <circle key={`${r}-${c}`} cx={cx} cy={r * 10 + 5} r="4.5"
                  fill="none" stroke={STROKE} strokeWidth="0.75" />
              );
            }),
          )}
        </svg>
      );
    case "mosaic-stacked":
      // Stacked / kit-kat sheet: two bands of tall thin sticks.
      return (
        <svg viewBox="0 0 40 40" className="h-6 w-6" aria-hidden>
          {[0, 1].map((band) =>
            [0, 1, 2, 3, 4, 5, 6].map((c) => (
              <rect key={`${band}-${c}`} x={c * 5.5 + 1} y={band * 20 + 1}
                width="4" height="18"
                fill="none" stroke={STROKE} strokeWidth="0.75" />
            )),
          )}
        </svg>
      );
    case "bullnose":
      return (
        <svg viewBox="0 0 60 10" className="h-1.5 w-10" aria-hidden>
          <rect x="0.5" y="0.5" width="59" height="9" fill="none" stroke={STROKE} strokeWidth="1" />
        </svg>
      );
  }
}
