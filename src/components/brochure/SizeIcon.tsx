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
    case "bullnose":
      return (
        <svg viewBox="0 0 60 10" className="h-1.5 w-10" aria-hidden>
          <rect x="0.5" y="0.5" width="59" height="9" fill="none" stroke={STROKE} strokeWidth="1" />
        </svg>
      );
  }
}
