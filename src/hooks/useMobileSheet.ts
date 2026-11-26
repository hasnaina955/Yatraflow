import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { motionTiming } from "../lib/motion";

const reduced = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Drag the grab handle down to close. A fast fling closes too. Otherwise the sheet returns. */
export function useSheetDrag(onDismiss: () => void, threshold = 96) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const s = useRef({ on: false, y0: 0, dy: 0, lastY: 0, lastT: 0, v: 0 });

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const st = s.current;
    st.on = true; st.y0 = e.clientY; st.dy = 0; st.v = 0;
    st.lastY = e.clientY; st.lastT = performance.now();
    if (sheetRef.current) sheetRef.current.style.transition = "none";
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture is best effort */ }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const st = s.current;
    if (!st.on || !sheetRef.current) return;
    const now = performance.now();
    st.dy = Math.max(0, e.clientY - st.y0);
    st.v = (e.clientY - st.lastY) / Math.max(1, now - st.lastT);
    st.lastY = e.clientY; st.lastT = now;
    sheetRef.current.style.transform = `translateY(${st.dy}px)`;
  };

  const finish = () => {
    const st = s.current;
    if (!st.on) return;
    st.on = false;
    const el = sheetRef.current;
    if (el) { el.style.transition = ""; el.style.transform = ""; }
    if (st.dy > threshold || st.v > 0.6) {
      if (el && !reduced()) {
        el.style.transform = "translateY(105%)";
        setTimeout(onDismiss, motionTiming("--motion-slow").duration);
      } else {
        onDismiss();
      }
    }
  };

  return {
    sheetRef,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      style: { touchAction: "none" as const },
    },
  };
}

/** Hold body scroll while a sheet is open. Put the previous value back on close. */
export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [locked]);
}

/** Fold state for the cover header. Two thresholds stop flicker at the edge. */
export function useHeaderFold(ref: RefObject<HTMLElement | null>, foldAt = 120, unfoldAt = 80) {
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const y = el.scrollTop;
        setFolded((f) => (f ? y > unfoldAt : y > foldAt));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref, foldAt, unfoldAt]);
  return folded;
}
