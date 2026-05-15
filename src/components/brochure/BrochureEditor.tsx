"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BlockId,
  BlockPosition,
  BrochureData,
  LayoutOverrides,
} from "@/lib/brochure-types";
import {
  BOTTOM_BLOCK_H,
  HEADER_H,
  PAGE_H,
  PAGE_PADDING_X,
  PAGE_W,
} from "@/lib/brochure-layout";
import { Brochure } from "./Brochure";

const SNAP_PX = 8;
const DRAG_THRESHOLD_PX = 3;
const SELECTABLE_BLOCKS: BlockId[] = [
  "description",
  "swatches",
  "sizeMatrix",
  "techSpecs",
  "contact",
];

interface DragState {
  id: BlockId;
  pageEl: HTMLElement;
  startBlockX: number;
  startBlockY: number;
  startPointerX: number;
  startPointerY: number;
  blockWidth: number;
  blockHeight: number;
  scale: number;
  active: boolean;
}

interface Guide {
  axis: "x" | "y";
  /** Page-local position of the guide line. */
  pos: number;
  /** Page that hosts the guide. */
  page: HTMLElement;
}

interface SelectionRect {
  /** Viewport-pixel rect of the selected block, used to draw the outline. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Whether a layout override exists for this block (controls reset btn). */
  overridden: boolean;
}

export function BrochureEditor({
  productId,
  data,
  factoryName,
}: {
  productId: string;
  data: BrochureData;
  factoryName?: string;
}) {
  const [liveOverrides, setLiveOverrides] = useState<LayoutOverrides>(
    data.layoutOverrides ?? {},
  );
  const [selectedId, setSelectedId] = useState<BlockId | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [saving, setSaving] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const measureSelection = useCallback(() => {
    if (!selectedId || !rootRef.current) {
      setSelectionRect(null);
      return;
    }
    const blockEl = rootRef.current.querySelector(
      `[data-block-id="${selectedId}"]`,
    ) as HTMLElement | null;
    if (!blockEl) {
      setSelectionRect(null);
      return;
    }
    const rect = blockEl.getBoundingClientRect();
    const rootRect = rootRef.current.getBoundingClientRect();
    setSelectionRect({
      left: rect.left - rootRect.left,
      top: rect.top - rootRect.top,
      width: rect.width,
      height: rect.height,
      overridden: !!liveOverrides[selectedId],
    });
  }, [selectedId, liveOverrides]);

  useEffect(() => {
    measureSelection();
  }, [measureSelection]);

  useEffect(() => {
    const onResizeOrScroll = () => measureSelection();
    window.addEventListener("resize", onResizeOrScroll);
    window.addEventListener("scroll", onResizeOrScroll, true);
    return () => {
      window.removeEventListener("resize", onResizeOrScroll);
      window.removeEventListener("scroll", onResizeOrScroll, true);
    };
  }, [measureSelection]);

  // Deselect when the rep taps outside the editor entirely — e.g. on the
  // page header, the edit-chat sidebar, or the dashboard breadcrumb.
  // Necessary so a rep on a phone can clear the selection (and re-enable
  // page scrolling) without having to find an empty corner of the
  // brochure itself.
  useEffect(() => {
    if (!selectedId) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const t = e.target as Node | null;
      if (t && root.contains(t)) return;
      setSelectedId(null);
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [selectedId]);

  const persistOverride = useCallback(
    async (id: BlockId, override: BlockPosition | null) => {
      setSaving(true);
      try {
        await fetch(`/api/products/${productId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mergeLayoutOverrides: true,
            layoutOverrides: { [id]: override },
          }),
        });
      } finally {
        setSaving(false);
      }
    },
    [productId],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Ignore drags initiated on the floating toolbar / outline overlay.
    if (target.closest("[data-editor-overlay]")) return;
    const blockEl = target.closest("[data-block-id]") as HTMLElement | null;
    if (!blockEl) {
      setSelectedId(null);
      return;
    }
    const id = blockEl.dataset.blockId as BlockId;
    if (!SELECTABLE_BLOCKS.includes(id)) return;
    const pageEl = blockEl.closest(".brochure-page") as HTMLElement | null;
    if (!pageEl) return;

    // Two-tap drag on touch: the first tap only selects. A second tap
    // on the SAME block starts the drag. This prevents the page from
    // scrolling out from under the rep while they try to reposition a
    // block on a phone. Mouse / pen drag in one motion as before.
    const isTouch = e.pointerType === "touch";
    const wasSelected = id === selectedId;
    if (isTouch && !wasSelected) {
      setSelectedId(id);
      return;
    }
    setSelectedId(id);

    const pageRect = pageEl.getBoundingClientRect();
    const blockRect = blockEl.getBoundingClientRect();
    const scale = pageRect.width / PAGE_W;
    dragRef.current = {
      id,
      pageEl,
      startBlockX: (blockRect.left - pageRect.left) / scale,
      startBlockY: (blockRect.top - pageRect.top) / scale,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      blockWidth: blockRect.width / scale,
      blockHeight: blockRect.height / scale,
      scale,
      active: false,
    };
    blockEl.setPointerCapture?.(e.pointerId);
    // Once we've committed to a drag (second tap on touch, or any
    // tap on desktop), preventDefault keeps the browser from scrolling.
    if (e.cancelable) e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startPointerX) / drag.scale;
    const dy = (e.clientY - drag.startPointerY) / drag.scale;
    if (
      !drag.active &&
      Math.abs(dx) < DRAG_THRESHOLD_PX &&
      Math.abs(dy) < DRAG_THRESHOLD_PX
    ) {
      return;
    }
    drag.active = true;

    const rawX = drag.startBlockX + dx;
    const rawY = drag.startBlockY + dy;
    const { x, y, guides: newGuides } = snap(rawX, rawY, drag.blockWidth);
    setGuides(newGuides.map((g) => ({ ...g, page: drag.pageEl })));
    setLiveOverrides((prev) => ({
      ...prev,
      [drag.id]: { x, y },
    }));
    // selection rect re-measures via effect (depends on liveOverrides).
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    setGuides([]);
    if (!drag || !drag.active) return;
    const final = liveOverrides[drag.id];
    if (final) {
      void persistOverride(drag.id, final);
    }
  };

  const resetBlock = (id: BlockId) => {
    setLiveOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    void persistOverride(id, null);
  };

  const mergedData: BrochureData = { ...data, layoutOverrides: liveOverrides };

  return (
    <div
      ref={rootRef}
      className="relative select-none"
      // While no block is selected, leave touch-action at pan-y so the
      // rep can freely scroll the page on a phone. Once a block IS
      // selected, switch to touch-action: none — the next tap is meant
      // to drag, and we don't want the browser hijacking the gesture as
      // a scroll. Tap-outside-the-editor deselects and restores scroll.
      style={{ touchAction: selectedId ? "none" : "pan-y" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <Brochure data={mergedData} factoryName={factoryName} />

      {/* Snap guide lines, rendered relative to each page they originate
          from. Pointer-events disabled so they don't block dragging. */}
      {guides.map((g, idx) => (
        <GuideLine key={`${g.axis}-${idx}`} guide={g} rootEl={rootRef.current} />
      ))}

      {/* Selection outline + per-block reset button. */}
      {selectionRect && selectedId && (
        <SelectionOverlay
          rect={selectionRect}
          onReset={
            selectionRect.overridden ? () => resetBlock(selectedId) : null
          }
        />
      )}

      {saving && (
        <div className="absolute right-2 top-2 rounded bg-accent/90 px-2 py-1 text-xs text-white shadow">
          saving…
        </div>
      )}
    </div>
  );
}

function SelectionOverlay({
  rect,
  onReset,
}: {
  rect: SelectionRect;
  onReset: (() => void) | null;
}) {
  return (
    <>
      <div
        data-editor-overlay
        className="pointer-events-none absolute z-10"
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          boxShadow:
            "0 0 0 2px #177AA9, 0 0 0 4px rgba(23,122,169,0.25)",
        }}
      />
      <div
        data-editor-overlay
        className="absolute z-20 flex items-center gap-2"
        style={{
          left: rect.left,
          top: Math.max(0, rect.top - 28),
        }}
      >
        {onReset && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onReset}
            className="rounded-md bg-white px-2 py-1 text-[11px] font-medium text-accent shadow ring-1 ring-accent/40 transition hover:bg-accent hover:text-white"
          >
            reset position
          </button>
        )}
        {/* Mobile-only hint. md+ users dragged this in one motion, no
            need to tell them how it works. */}
        <span className="rounded-md bg-accent/90 px-2 py-1 text-[11px] font-medium text-white shadow md:hidden">
          tap again to drag · tap outside to scroll
        </span>
      </div>
    </>
  );
}

function GuideLine({
  guide,
  rootEl,
}: {
  guide: Guide;
  rootEl: HTMLElement | null;
}) {
  if (!rootEl) return null;
  const pageRect = guide.page.getBoundingClientRect();
  const rootRect = rootEl.getBoundingClientRect();
  const scale = pageRect.width / PAGE_W;
  if (guide.axis === "x") {
    const left = pageRect.left - rootRect.left + guide.pos * scale;
    return (
      <div
        className="pointer-events-none absolute z-30"
        style={{
          left: left - 0.5,
          top: pageRect.top - rootRect.top,
          width: 1,
          height: pageRect.height,
          background: "#177AA9",
        }}
      />
    );
  }
  const top = pageRect.top - rootRect.top + guide.pos * scale;
  return (
    <div
      className="pointer-events-none absolute z-30"
      style={{
        left: pageRect.left - rootRect.left,
        top: top - 0.5,
        width: pageRect.width,
        height: 1,
        background: "#177AA9",
      }}
    />
  );
}

// Snap rawX/rawY (page-local pixels at PAGE_W=816, PAGE_H=1056) to the
// nearest snap line within SNAP_PX. Returns the snapped coords and the
// guide(s) that fired.
function snap(
  rawX: number,
  rawY: number,
  width: number,
): { x: number; y: number; guides: Omit<Guide, "page">[] } {
  const guides: Omit<Guide, "page">[] = [];

  // X targets — vertical guide lines. We check three candidate edges of
  // the block (left, center, right) against each target line and pick the
  // single closest match across all combinations.
  type XHit = { dist: number; newX: number; guidePos: number };
  const xTargets = [PAGE_PADDING_X, PAGE_W / 2, PAGE_W - PAGE_PADDING_X];
  const xCandidates: { edge: number; apply: (t: number) => number }[] = [
    { edge: rawX, apply: (t) => t },
    { edge: rawX + width / 2, apply: (t) => t - width / 2 },
    { edge: rawX + width, apply: (t) => t - width },
  ];
  let bestX: XHit | null = null;
  for (const t of xTargets) {
    for (const c of xCandidates) {
      const dist = Math.abs(c.edge - t);
      if (dist <= SNAP_PX && (bestX == null || dist < bestX.dist)) {
        bestX = { dist, newX: c.apply(t), guidePos: t };
      }
    }
  }
  const snappedX = bestX ? bestX.newX : rawX;
  if (bestX) guides.push({ axis: "x", pos: bestX.guidePos });

  // Y targets — horizontal guide lines.
  const yTargets = [
    HEADER_H,                           // top of body / under header
    HEADER_H + 12,                      // standard body top with mt-3
    PAGE_H / 2,                         // page vertical center
    PAGE_H - BOTTOM_BLOCK_H,            // top of pinned bottom row
    PAGE_H - 28,                        // page bottom safe area
  ];
  let bestY: { dist: number; newY: number; target: number } | null = null;
  for (const t of yTargets) {
    const distTop = Math.abs(rawY - t);
    if (distTop <= SNAP_PX && (!bestY || distTop < bestY.dist)) {
      bestY = { dist: distTop, newY: t, target: t };
    }
  }
  const snappedY = bestY ? bestY.newY : rawY;
  if (bestY) guides.push({ axis: "y", pos: bestY.target });

  return { x: snappedX, y: snappedY, guides };
}
