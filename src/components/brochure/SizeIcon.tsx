import type { SizeIcon as SizeIconKind } from "@/lib/brochure-types";

const STROKE = "#5a5a5a";

export function SizeIcon({ kind }: { kind: SizeIconKind }) {
  switch (kind) {
    case "rectangle":
      // 24"x48" feel — 1:2 portrait
      return (
        <svg viewBox="0 0 30 60" className="h-10 w-5" aria-hidden>
          <rect
            x="0.5"
            y="0.5"
            width="29"
            height="59"
            fill="none"
            stroke={STROKE}
            strokeWidth="1"
          />
        </svg>
      );
    case "square":
      return (
        <svg viewBox="0 0 40 40" className="h-7 w-7" aria-hidden>
          <rect
            x="0.5"
            y="0.5"
            width="39"
            height="39"
            fill="none"
            stroke={STROKE}
            strokeWidth="1"
          />
        </svg>
      );
    case "plank":
      // 6"x24" — narrower tall rectangle
      return (
        <svg viewBox="0 0 18 60" className="h-10 w-3" aria-hidden>
          <rect
            x="0.5"
            y="0.5"
            width="17"
            height="59"
            fill="none"
            stroke={STROKE}
            strokeWidth="1"
          />
        </svg>
      );
    case "mosaic":
      // grid of small squares
      return (
        <svg viewBox="0 0 40 40" className="h-7 w-7" aria-hidden>
          {[0, 1, 2, 3].map((r) =>
            [0, 1, 2, 3].map((c) => (
              <rect
                key={`${r}-${c}`}
                x={c * 10 + 0.5}
                y={r * 10 + 0.5}
                width="9"
                height="9"
                fill="none"
                stroke={STROKE}
                strokeWidth="0.75"
              />
            )),
          )}
        </svg>
      );
    case "bullnose":
      // long skinny strip
      return (
        <svg viewBox="0 0 60 12" className="h-2 w-12" aria-hidden>
          <rect
            x="0.5"
            y="0.5"
            width="59"
            height="11"
            rx="5"
            fill="none"
            stroke={STROKE}
            strokeWidth="1"
          />
        </svg>
      );
  }
}
