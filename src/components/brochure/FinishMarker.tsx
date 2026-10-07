// Maps a finish name (matte / polished / grip / textured) to the marker
// shape Trinity uses on the size availability chart and finish legend.
// Reference: Kendall/Lunett/Oberlin/Torrance brochures
// (Trinity Surfaces-selected-assets, 2024 set):
//   • matte    → filled circle
//   • polished → filled triangle (point-up)
//   • grip     → filled square
//   • textured → outlined circle
// Anything unrecognized falls back to the matte circle so the brochure
// never renders blank — the rep can correct via the finishLegend field.

type FinishShape = "circle" | "triangle" | "square" | "circle-outline" | "diamond";

const SHAPE_BY_FINISH: Record<string, FinishShape> = {
  matte: "circle",
  natural: "circle",
  naturale: "circle",
  polished: "triangle",
  polish: "triangle",
  lappato: "triangle",
  gloss: "triangle",
  glossy: "triangle",
  "3d plus": "triangle",
  silk: "diamond",
  grip: "square",
  structured: "square",
  "non-slip": "square",
  textured: "circle-outline",
  brushed: "circle-outline",
  "3d": "circle-outline",
};

function shapeFor(finish: string): FinishShape {
  return SHAPE_BY_FINISH[finish.toLowerCase().trim()] ?? "circle";
}

export function FinishMarker({
  finish,
  variant = "cell",
}: {
  finish: string;
  /** "cell" = chart cell (6px), "legend" = legend row (8px). */
  variant?: "cell" | "legend";
}) {
  const px = variant === "legend" ? 8 : 6;
  const shape = shapeFor(finish);
  // All shapes share the 12×12 viewBox so they optically center on the
  // same baseline when rendered side-by-side in a multi-finish cell.
  const common = {
    width: px,
    height: px,
    viewBox: "0 0 12 12",
    "aria-hidden": true as const,
    className: "shrink-0 text-brochure-gray",
  };
  switch (shape) {
    case "triangle":
      return (
        <svg {...common}>
          <polygon points="6,1 11,11 1,11" fill="currentColor" />
        </svg>
      );
    case "square":
      return (
        <svg {...common}>
          <rect x="1" y="1" width="10" height="10" fill="currentColor" />
        </svg>
      );
    case "diamond":
      return (
        <svg {...common}>
          <polygon points="6,1 11,6 6,11 1,6" fill="currentColor" />
        </svg>
      );
    case "circle-outline":
      return (
        <svg {...common}>
          <circle
            cx="6"
            cy="6"
            r="4.25"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      );
    case "circle":
    default:
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4.5" fill="currentColor" />
        </svg>
      );
  }
}
