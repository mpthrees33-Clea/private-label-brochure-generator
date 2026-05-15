"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PAGE_W } from "@/lib/brochure-layout";

// Scale the brochure preview to fit narrow viewports.
//
// Why not CSS `zoom`: zoom is non-standard and notoriously inconsistent
// with absolutely-positioned descendants — exactly what our refactored
// brochure renders. Several Safari/Firefox versions either ignore zoom
// entirely or apply it inconsistently to nested abs-positioned children.
//
// We instead use `transform: scale()` driven by a ResizeObserver. The
// scaler measures its outer container's width on mount and on resize,
// computes scale = min(1, containerW / 816), and applies it to the inner
// wrapper. The outer container's height is then forced to
// (innerNaturalHeight * scale) so the scaled content doesn't leave a tall
// gap below it.
//
// The drag editor's coordinate math reads getBoundingClientRect on
// each .brochure-page — transform: scale folds into that rect, so its
// `pageRect.width / PAGE_W` scale factor stays correct.
export function MobileFit({ children }: { children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [outerHeight, setOuterHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const update = () => {
      const containerW = outer.clientWidth;
      const next = Math.min(1, containerW / PAGE_W);
      setScale(next);
      // Measure inner natural height once we know its layout has settled.
      const innerH = inner.scrollHeight;
      setOuterHeight(innerH * next);
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={outerRef}
      style={{
        width: "100%",
        overflow: "hidden",
        height: outerHeight ?? undefined,
      }}
    >
      <div
        ref={innerRef}
        style={{
          width: PAGE_W,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}
