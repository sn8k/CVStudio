"use client";

import { useCallback, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { flushSync } from "react-dom";

const AUTOPLAY_SPEED = 30;
const INTERACTION_PAUSE_MS = 4500;
const DRAG_THRESHOLD = 8;

export function useContentRibbon<Item>({ items, cardSelector }: { items: Item[]; cardSelector: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogTriggerRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; lastX: number; dragged: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const suppressClickTimerRef = useRef<number | null>(null);
  const interactionTimerRef = useRef<number | null>(null);
  const [orderedItems, setOrderedItems] = useState(items);
  const [activeItem, setActiveItem] = useState<Item | null>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [pointerActive, setPointerActive] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => () => {
    if (interactionTimerRef.current !== null) window.clearTimeout(interactionTimerRef.current);
    if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current);
  }, []);

  const cardDistance = useCallback(() => {
    const track = trackRef.current;
    const first = track?.querySelector<HTMLElement>(cardSelector);
    if (!track || !first) return 0;
    const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
    return first.offsetWidth + gap;
  }, [cardSelector]);

  const recycleForward = useCallback(() => {
    const track = trackRef.current;
    if (!track || orderedItems.length < 2) return;
    const distance = cardDistance();
    if (!distance || track.scrollLeft < distance) return;
    flushSync(() => setOrderedItems((current) => [...current.slice(1), current[0]]));
    track.scrollLeft -= distance;
  }, [cardDistance, orderedItems.length]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const onScroll = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(recycleForward);
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, [recycleForward]);

  const pauseAfterInteraction = useCallback(() => {
    setInteractionPaused(true);
    if (interactionTimerRef.current !== null) window.clearTimeout(interactionTimerRef.current);
    interactionTimerRef.current = window.setTimeout(() => {
      setInteractionPaused(false);
      interactionTimerRef.current = null;
    }, INTERACTION_PAUSE_MS);
  }, []);

  useEffect(() => {
    if (!activeItem || !dialogRef.current || dialogRef.current.open) return;
    const track = trackRef.current;
    if (track) track.scrollTo({ left: track.scrollLeft, behavior: "auto" });
    dialogRef.current.showModal();
  }, [activeItem]);

  const openItem = (item: Item, trigger: HTMLElement) => {
    dialogTriggerRef.current = trigger;
    setActiveItem(item);
  };

  const closeDialog = () => {
    dialogRef.current?.close();
  };

  const handleDialogClose = () => {
    setActiveItem(null);
    pauseAfterInteraction();
    const trigger = dialogTriggerRef.current;
    dialogTriggerRef.current = null;
    window.requestAnimationFrame(() => trigger?.focus());
  };

  const beginPointerInteraction = (event: PointerEvent<HTMLDivElement>) => {
    setPointerActive(true);
    pauseAfterInteraction();
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, lastX: event.clientX, dragged: false };
  };

  const movePointerInteraction = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || event.buttons !== 1) return;
    const movement = drag.dragged ? event.clientX - drag.lastX : event.clientX - drag.startX;
    if (!drag.dragged && Math.abs(movement) >= DRAG_THRESHOLD) {
      drag.dragged = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.dataset.dragging = "true";
    }
    if (!drag.dragged) return;
    event.preventDefault();
    event.currentTarget.scrollLeft -= movement;
    drag.lastX = event.clientX;
  };

  const endPointerInteraction = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (drag.dragged && !cancelled) {
        suppressClickRef.current = true;
        if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current);
        suppressClickTimerRef.current = window.setTimeout(() => {
          suppressClickRef.current = false;
          suppressClickTimerRef.current = null;
        }, 0);
      }
      dragRef.current = null;
      delete event.currentTarget.dataset.dragging;
    }
    setPointerActive(false);
    pauseAfterInteraction();
  };

  const autoplayPaused = userPaused
    || hovered
    || focusWithin
    || activeItem !== null
    || interactionPaused
    || pointerActive
    || reducedMotion
    || !pageVisible
    || items.length < 2;

  useEffect(() => {
    if (autoplayPaused) return;
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(now - previous, 80);
      previous = now;
      track.scrollLeft += (AUTOPLAY_SPEED * elapsed) / 1000;
      recycleForward();
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [autoplayPaused, recycleForward]);

  const scrollItems = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    pauseAfterInteraction();
    const distance = cardDistance();
    if (!distance) return;
    if (direction < 0 && track.scrollLeft < distance * 0.25 && orderedItems.length > 1) {
      flushSync(() => setOrderedItems((current) => [current.at(-1)!, ...current.slice(0, -1)]));
      track.scrollLeft += distance;
    }
    track.scrollBy({ left: direction * distance, behavior: reducedMotion ? "auto" : "smooth" });
    window.setTimeout(recycleForward, reducedMotion ? 0 : 450);
  };

  const trackProps = {
    ref: trackRef,
    tabIndex: 0,
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    onFocusCapture: () => setFocusWithin(true),
    onBlurCapture: (event: FocusEvent<HTMLDivElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false);
    },
    onPointerDown: beginPointerInteraction,
    onPointerMove: movePointerInteraction,
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => endPointerInteraction(event),
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) => endPointerInteraction(event, true),
    onClickCapture: (event: MouseEvent<HTMLDivElement>) => {
      if (!suppressClickRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = false;
    },
    onWheel: pauseAfterInteraction,
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        scrollItems(event.key === "ArrowLeft" ? -1 : 1);
      }
    },
    onDragStart: (event: MouseEvent<HTMLDivElement>) => event.preventDefault(),
  };

  return {
    activeItem,
    closeDialog,
    dialogRef,
    handleDialogClose,
    isMoving: !autoplayPaused,
    openItem,
    orderedItems,
    reducedMotion,
    scrollItems,
    setUserPaused,
    trackProps,
    userPaused,
  };
}