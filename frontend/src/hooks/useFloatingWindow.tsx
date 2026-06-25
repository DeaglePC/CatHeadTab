import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface FloatingWindowSize {
  width: number;
  height: number;
}

export interface FloatingWindowPosition {
  left: number;
  top: number;
}

interface UseFloatingWindowOptions {
  defaultSize: FloatingWindowSize | (() => FloatingWindowSize);
  disabled?: boolean;
  isFullscreen?: boolean;
  minHeight?: number;
  minWidth?: number;
  resizable?: boolean;
  resizeHandleAriaLabel?: string;
  resizeHandleTitle?: string;
  viewportMargin?: number;
}

type FloatingWindowSizeInput = FloatingWindowSize | ((currentSize: FloatingWindowSize) => FloatingWindowSize);

const DEFAULT_MIN_WIDTH = 420;
const DEFAULT_MIN_HEIGHT = 360;
const DEFAULT_VIEWPORT_MARGIN = 48;

function getOptionNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function resolveDefaultSize(defaultSize: FloatingWindowSize | (() => FloatingWindowSize)): FloatingWindowSize {
  return typeof defaultSize === 'function' ? defaultSize() : defaultSize;
}

function clampSize(size: FloatingWindowSize, minWidth: number, minHeight: number, viewportMargin: number): FloatingWindowSize {
  if (typeof window === 'undefined') return size;
  const maxWidth = Math.max(minWidth, window.innerWidth - viewportMargin);
  const maxHeight = Math.max(minHeight, window.innerHeight - viewportMargin);
  return {
    width: Math.min(Math.max(size.width, minWidth), maxWidth),
    height: Math.min(Math.max(size.height, minHeight), maxHeight),
  };
}

function clampSizeForPosition(
  size: FloatingWindowSize,
  position: FloatingWindowPosition,
  minWidth: number,
  minHeight: number,
  viewportMargin: number,
): FloatingWindowSize {
  if (typeof window === 'undefined') return size;
  const edgeGap = viewportMargin / 2;
  const maxWidth = Math.max(minWidth, window.innerWidth - position.left - edgeGap);
  const maxHeight = Math.max(minHeight, window.innerHeight - position.top - edgeGap);
  return {
    width: Math.min(Math.max(size.width, minWidth), maxWidth),
    height: Math.min(Math.max(size.height, minHeight), maxHeight),
  };
}

function clampPosition(
  position: FloatingWindowPosition,
  size: FloatingWindowSize,
  viewportMargin: number,
): FloatingWindowPosition {
  if (typeof window === 'undefined') return position;
  const edgeGap = viewportMargin / 2;
  const maxLeft = Math.max(edgeGap, window.innerWidth - size.width - edgeGap);
  const maxTop = Math.max(edgeGap, window.innerHeight - size.height - edgeGap);
  return {
    left: Math.min(Math.max(position.left, edgeGap), maxLeft),
    top: Math.min(Math.max(position.top, edgeGap), maxTop),
  };
}

function getCenteredPosition(size: FloatingWindowSize, viewportMargin: number): FloatingWindowPosition {
  if (typeof window === 'undefined') return { left: 0, top: 0 };
  return clampPosition({
    left: Math.round((window.innerWidth - size.width) / 2),
    top: Math.round((window.innerHeight - size.height) / 2),
  }, size, viewportMargin);
}

function applyFrame(
  element: HTMLElement | null,
  position: FloatingWindowPosition,
  size: FloatingWindowSize,
): void {
  if (!element) return;
  element.style.setProperty('--floating-window-left', `${position.left}px`);
  element.style.setProperty('--floating-window-top', `${position.top}px`);
  element.style.setProperty('--floating-window-width', `${size.width}px`);
  element.style.setProperty('--floating-window-height', `${size.height}px`);
}

export function getDefaultFloatingWindowSize(width: number, heightRatio: number): FloatingWindowSize {
  if (typeof window === 'undefined') return { width, height: 560 };
  return {
    width,
    height: Math.round(window.innerHeight * heightRatio),
  };
}

export function useFloatingWindow(options: UseFloatingWindowOptions) {
  const minWidth = getOptionNumber(options.minWidth, DEFAULT_MIN_WIDTH);
  const minHeight = getOptionNumber(options.minHeight, DEFAULT_MIN_HEIGHT);
  const viewportMargin = getOptionNumber(options.viewportMargin, DEFAULT_VIEWPORT_MARGIN);
  const disabled = !!options.disabled;
  const isFullscreen = !!options.isFullscreen;
  const resizable = options.resizable ?? true;

  const initialSizeRef = useRef<FloatingWindowSize | null>(null);
  if (initialSizeRef.current === null) {
    initialSizeRef.current = clampSize(resolveDefaultSize(options.defaultSize), minWidth, minHeight, viewportMargin);
  }

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [size, setSize] = useState<FloatingWindowSize>(initialSizeRef.current);
  const [position, setPosition] = useState<FloatingWindowPosition>(() => getCenteredPosition(initialSizeRef.current!, viewportMargin));
  const shellRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef<FloatingWindowSize>(size);
  const positionRef = useRef<FloatingWindowPosition>(position);

  useEffect(() => {
    sizeRef.current = size;
    positionRef.current = position;
    applyFrame(shellRef.current, position, size);
  }, [position, size]);

  useEffect(() => {
    const clampOnResize = () => {
      const nextSize = clampSize(sizeRef.current, minWidth, minHeight, viewportMargin);
      const nextPosition = clampPosition(positionRef.current, nextSize, viewportMargin);
      sizeRef.current = nextSize;
      positionRef.current = nextPosition;
      applyFrame(shellRef.current, nextPosition, nextSize);
      setPosition(nextPosition);
      setSize(nextSize);
    };
    window.addEventListener('resize', clampOnResize);
    return () => window.removeEventListener('resize', clampOnResize);
  }, [minHeight, minWidth, viewportMargin]);

  useEffect(() => {
    return () => {
      document.body.classList.remove('floating-window-dragging', 'floating-window-resizing');
    };
  }, []);

  const setWindowSize = useCallback((nextSizeInput: FloatingWindowSizeInput) => {
    if (disabled || isFullscreen) return;

    const previousSize = sizeRef.current;
    const previousPosition = positionRef.current;
    const nextRawSize = typeof nextSizeInput === 'function'
      ? nextSizeInput(previousSize)
      : nextSizeInput;
    const nextSize = clampSize(nextRawSize, minWidth, minHeight, viewportMargin);
    // Programmatic resizes (auto-fit to content) grow/shrink around the window's
    // current center, so a window that was centered stays centered instead of
    // anchoring its top and drifting downward as the content gets taller. Pointer
    // resizing keeps its own top-left anchored path in handleResizePointerDown.
    const centerX = previousPosition.left + previousSize.width / 2;
    const centerY = previousPosition.top + previousSize.height / 2;
    const nextPosition = clampPosition({
      left: Math.round(centerX - nextSize.width / 2),
      top: Math.round(centerY - nextSize.height / 2),
    }, nextSize, viewportMargin);
    if (
      Math.round(nextSize.width) === Math.round(previousSize.width)
      && Math.round(nextSize.height) === Math.round(previousSize.height)
      && Math.round(nextPosition.left) === Math.round(previousPosition.left)
      && Math.round(nextPosition.top) === Math.round(previousPosition.top)
    ) {
      return;
    }

    sizeRef.current = nextSize;
    positionRef.current = nextPosition;
    applyFrame(shellRef.current, nextPosition, nextSize);
    setSize(nextSize);
    setPosition(nextPosition);
  }, [disabled, isFullscreen, minHeight, minWidth, viewportMargin]);

  const handleDragPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (disabled || isFullscreen || e.button !== 0 || window.innerWidth < 640) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, a, input, textarea, select, [role="button"], [data-floating-window-no-drag]')) return;

    e.preventDefault();
    e.stopPropagation();

    const shellElement = shellRef.current;
    const startRect = shellElement?.getBoundingClientRect();
    const startSize = startRect
      ? clampSize({ width: startRect.width, height: startRect.height }, minWidth, minHeight, viewportMargin)
      : sizeRef.current;
    const startPosition = startRect
      ? { left: startRect.left, top: startRect.top }
      : positionRef.current;
    const pointerOffsetX = e.clientX - startPosition.left;
    const pointerOffsetY = e.clientY - startPosition.top;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    const previousTransitionDuration = shellElement?.style.transitionDuration ?? '';
    let frameId: number | null = null;
    let nextPosition = startPosition;

    const applyScheduledFrame = () => {
      frameId = null;
      applyFrame(shellElement, positionRef.current, startSize);
    };

    const scheduleFrame = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(applyScheduledFrame);
    };

    const cancelScheduledFrame = () => {
      if (frameId === null) return;
      window.cancelAnimationFrame(frameId);
      frameId = null;
    };

    sizeRef.current = startSize;
    positionRef.current = startPosition;
    applyFrame(shellElement, startPosition, startSize);
    setIsDragging(true);
    document.body.classList.add('floating-window-dragging');
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'none';
    if (shellElement) shellElement.style.transitionDuration = '0ms';

    const handleMove = (event: PointerEvent) => {
      nextPosition = clampPosition({
        left: event.clientX - pointerOffsetX,
        top: event.clientY - pointerOffsetY,
      }, startSize, viewportMargin);
      positionRef.current = nextPosition;
      scheduleFrame();
    };

    // preventDefault() on pointerdown does not stop touch panning; without this
    // the browser claims the swipe as a scroll and fires pointercancel mid-drag.
    const preventTouchScroll = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
    };

    const stopDrag = (event?: PointerEvent) => {
      cancelScheduledFrame();
      // pointercancel carries zeroed coordinates, so only trust pointerup as a drop point.
      if (event && event.type === 'pointerup') {
        nextPosition = clampPosition({
          left: event.clientX - pointerOffsetX,
          top: event.clientY - pointerOffsetY,
        }, startSize, viewportMargin);
      }
      positionRef.current = nextPosition;
      sizeRef.current = startSize;
      applyFrame(shellElement, nextPosition, startSize);
      setPosition(nextPosition);
      setSize(startSize);
      setIsDragging(false);
      document.body.classList.remove('floating-window-dragging');
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      if (shellElement) shellElement.style.transitionDuration = previousTransitionDuration;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', stopDrag);
      window.removeEventListener('pointercancel', stopDrag);
      window.removeEventListener('touchmove', preventTouchScroll);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);
    window.addEventListener('touchmove', preventTouchScroll, { passive: false });
  }, [disabled, isFullscreen, minHeight, minWidth, viewportMargin]);

  const handleResizePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || isFullscreen || !resizable) return;
    e.preventDefault();
    e.stopPropagation();

    const shellElement = shellRef.current;
    const startRect = shellElement?.getBoundingClientRect();
    const startPosition = startRect
      ? { left: startRect.left, top: startRect.top }
      : positionRef.current;
    const startSize = startRect
      ? clampSize({ width: startRect.width, height: startRect.height }, minWidth, minHeight, viewportMargin)
      : sizeRef.current;
    const pointerOffsetX = startRect ? startRect.right - e.clientX : 0;
    const pointerOffsetY = startRect ? startRect.bottom - e.clientY : 0;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    const previousTransitionDuration = shellElement?.style.transitionDuration ?? '';
    let frameId: number | null = null;
    let nextSize = startSize;

    const applyScheduledFrame = () => {
      frameId = null;
      applyFrame(shellElement, startPosition, sizeRef.current);
    };

    const scheduleFrame = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(applyScheduledFrame);
    };

    const cancelScheduledFrame = () => {
      if (frameId === null) return;
      window.cancelAnimationFrame(frameId);
      frameId = null;
    };

    sizeRef.current = startSize;
    positionRef.current = startPosition;
    applyFrame(shellElement, startPosition, startSize);
    setIsResizing(true);
    document.body.classList.add('floating-window-resizing');
    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';
    if (shellElement) shellElement.style.transitionDuration = '0ms';

    const handleMove = (event: PointerEvent) => {
      nextSize = clampSizeForPosition({
        width: event.clientX + pointerOffsetX - startPosition.left,
        height: event.clientY + pointerOffsetY - startPosition.top,
      }, startPosition, minWidth, minHeight, viewportMargin);
      sizeRef.current = nextSize;
      scheduleFrame();
    };

    // Same touch-scroll guard as dragging: without it the browser cancels the
    // gesture and the pointercancel coordinates would collapse the window.
    const preventTouchScroll = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
    };

    const stopResize = (event?: PointerEvent) => {
      cancelScheduledFrame();
      // pointercancel carries zeroed coordinates, so only trust pointerup.
      if (event && event.type === 'pointerup') {
        nextSize = clampSizeForPosition({
          width: event.clientX + pointerOffsetX - startPosition.left,
          height: event.clientY + pointerOffsetY - startPosition.top,
        }, startPosition, minWidth, minHeight, viewportMargin);
      }
      sizeRef.current = nextSize;
      positionRef.current = startPosition;
      applyFrame(shellElement, startPosition, nextSize);
      setSize(nextSize);
      setPosition(startPosition);
      setIsResizing(false);
      document.body.classList.remove('floating-window-resizing');
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      if (shellElement) shellElement.style.transitionDuration = previousTransitionDuration;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      window.removeEventListener('touchmove', preventTouchScroll);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
    window.addEventListener('touchmove', preventTouchScroll, { passive: false });
  }, [disabled, isFullscreen, minHeight, minWidth, resizable, viewportMargin]);

  const style = !disabled && !isFullscreen ? ({
    '--floating-window-left': `${positionRef.current.left}px`,
    '--floating-window-top': `${positionRef.current.top}px`,
    '--floating-window-width': `${sizeRef.current.width}px`,
    '--floating-window-height': `${sizeRef.current.height}px`,
  } as React.CSSProperties) : undefined;

  const windowClassName = isFullscreen
    ? 'w-full h-full !rounded-none !border-0'
    : 'floating-window-frame w-full h-full';

  const resizeHandle = !disabled && !isFullscreen && resizable ? (
    <button
      type="button"
      onPointerDown={handleResizePointerDown}
      className="hidden sm:flex absolute bottom-0 right-0 z-30 h-10 w-10 cursor-nwse-resize items-end justify-end bg-transparent p-2 text-white/25 transition-colors hover:bg-transparent hover:text-white/60 focus:outline-none focus-visible:outline-none"
      style={{ cursor: 'nwse-resize', touchAction: 'none' }}
      title={options.resizeHandleTitle ?? 'Drag to resize'}
      aria-label={options.resizeHandleAriaLabel ?? options.resizeHandleTitle ?? 'Drag to resize'}
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M14 6 6 14" />
        <path d="M14 10 10 14" />
        <path d="M14 2 2 14" />
      </svg>
    </button>
  ) : null;

  return {
    handleDragPointerDown,
    isInteracting: isDragging || isResizing,
    resizeHandle,
    setWindowSize,
    shellRef,
    style,
    windowClassName,
  };
}
