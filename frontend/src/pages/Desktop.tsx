import React, { useEffect, useState, useRef, useMemo, useCallback, useLayoutEffect, lazy, Suspense } from 'react';
import { useBookmarkStore } from '../store/bookmarkStore';
import { useLayoutStore, DesktopItem, getAllDesktopItems, MAX_DOCK_ITEMS, WIDGET_SIZE_MAP } from '../store/layoutStore';
import { useConfigStore } from '../store/configStore';
import { DesktopWidget } from '../components/widgets/DesktopWidget';
import { useTranslation } from '../i18n/useTranslation';
import { FaviconImg, IconFallback, getIconCrossOrigin, shouldUseLetterFallback } from '../components/FaviconImg';
import { openUrl } from '../utils/openUrl';
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  MouseSensor,
  TouchSensor,
  closestCenter,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  CollisionDetection,
  useDroppable,
} from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';

// Lazy-loaded modals stay split out of the initial desktop bundle.
const SettingsModal = lazy(() => import('../components/SettingsModal').then(m => ({ default: m.SettingsModal })));
const AuthModal = lazy(() => import('../components/AuthModal').then(m => ({ default: m.AuthModal })));
const ProfileModal = lazy(() => import('../components/ProfileModal').then(m => ({ default: m.ProfileModal })));
const BookmarkBrowser = lazy(() => import('../components/apps/BookmarkBrowser').then(m => ({ default: m.BookmarkBrowser })));
const HistoryBrowser = lazy(() => import('../components/apps/HistoryBrowser').then(m => ({ default: m.HistoryBrowser })));
const AddItemModal = lazy(() => import('../components/AddItemModal').then(m => ({ default: m.AddItemModal })));
const ExploreWorld = lazy(() => import('../components/ExploreWorld').then(m => ({ default: m.ExploreWorld })));
const AddWidgetModal = lazy(() => import('../components/AddWidgetModal').then(m => ({ default: m.AddWidgetModal })));
const ItToolsModal = lazy(() => import('../components/ItToolsModal').then(m => ({ default: m.ItToolsModal })));
const StickyNoteModal = lazy(() => import('../components/StickyNoteModal').then(m => ({ default: m.StickyNoteModal })));
const AiAgentModal = lazy(() => import('../components/AiAgentModal').then(m => ({ default: m.AiAgentModal })));
const TrendingModal = lazy(() => import('../components/TrendingModal').then(m => ({ default: m.TrendingModal })));
const CalendarDetailModal = lazy(() => import('../components/CalendarDetailModal').then(m => ({ default: m.CalendarDetailModal })));

// Disable all layout-change animations for desktop grid items.
// We use a FLIP animation manager instead, and dnd-kit's internal
// layout-shift detection can cause infinite update loops with mixed-size
// grid items (widgets spanning 2×2 etc.).
const noLayoutAnimation = () => false;

// === Icons ===
const SettingsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const GlobeIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/60"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>
);

// Search Mode Icons
const BookmarkIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-500">
    <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
  </svg>
);

const HistoryIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

const DesktopAppIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400">
    <rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>
  </svg>
);

const UserAvatarIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);

const LockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);


// Helper: extract mini-icon descriptors from a folder's children
// (stable, outside component). We capture the same fields that drive the
// full icon render (icon / url / title / iconColor) so the collapsed folder
// thumbnail resolves icons identically to how they look inside the folder —
// including custom icons and the colored-letter fallback.
interface MiniIconNode {
  type: DesktopItem['type'];
  icon?: string;
  url?: string;
  title: string;
  iconColor?: string;
}

function getMiniIconNodes(nodes: DesktopItem[]): MiniIconNode[] {
  const out: MiniIconNode[] = [];
  for (const n of nodes) {
    if (n.type === 'folder' && n.children) {
      out.push(...getMiniIconNodes(n.children));
    } else if (n.type === 'app' || n.icon || n.url) {
      out.push({ type: n.type, icon: n.icon, url: n.url, title: n.title, iconColor: n.iconColor });
    }
  }
  return out;
}

// Renders a single tile inside the collapsed folder thumbnail, mirroring the
// icon-resolution precedence of DesktopIconContent (custom emoji/text icon →
// custom http image → favicon-from-url) and falling back to the same colored
// letter so the preview always matches what's shown inside the folder.
const MiniPreviewIcon: React.FC<{ node: MiniIconNode }> = ({ node }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const fallbackText = node.title || node.url || 'Untitled';
  const fallbackSeed = node.url || node.title;

  // App tiles and non-http (emoji / text) custom icons render as a glyph.
  if (node.type === 'app' || (node.icon && !node.icon.startsWith('http'))) {
    return (
      <span className="flex items-center justify-center w-full h-full text-[13px] leading-none">
        {node.icon || '📦'}
      </span>
    );
  }

  // Custom http icon: plain image with a colored-letter fallback on error.
  if (node.icon && node.icon.startsWith('http')) {
    if (imgFailed) {
      return (
        <IconFallback
          className="w-full h-full text-[10px]"
          color={node.iconColor}
          seed={fallbackSeed}
          text={fallbackText}
        />
      );
    }
    return (
      <img
        src={node.icon}
        className="w-[88%] h-[88%] object-contain"
        alt=""
        decoding="async"
        loading="lazy"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onError={() => setImgFailed(true)}
      />
    );
  }

  // URL-only: favicon with the same colored-letter fallback used inside the folder.
  if (node.url) {
    return (
      <FaviconImg
        url={node.url}
        sz={64}
        className="w-[88%] h-[88%] object-contain text-[10px]"
        fallbackColor={node.iconColor}
        fallbackText={fallbackText}
        fallbackSeed={fallbackSeed}
        alt=""
        decoding="async"
        loading="lazy"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
      />
    );
  }

  return null;
};

// === DesktopIcon Component (static, used for DragOverlay and non-draggable contexts) ===
const DesktopIconContent: React.FC<{ 
  item: DesktopItem; 
  isDock?: boolean;
  isOverlay?: boolean;
  isDraggedOver?: boolean;
  /** Override Dock icon size in px (for adaptive scaling when Dock has many items) */
  dockIconSize?: number;
}> = React.memo(({ item, isDock, isOverlay, isDraggedOver, dockIconSize }) => {
  const isFolder = item.type === 'folder';
  
  // Memoize mini-icon URLs so that identical children arrays don't regenerate
  // new <img> elements and cause the folder preview to flicker.
  const miniIcons = useMemo(
    () => isFolder && item.children ? getMiniIconNodes(item.children).slice(0, 9) : [],
    [isFolder, item.children],
  );

  // Track whether the loaded favicon is visually non-square (long SVG logos,
  // wide banners, etc.). Non-square icons render poorly with object-cover
  // because their sides get cropped — we switch to a padded "card" layout
  // (background + object-contain) so the full icon is visible, matching the
  // style users see in AddItemModal's preview.
  const [isNonSquareIcon, setIsNonSquareIcon] = useState(false);
  const handleIconLoaded = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return;

    // SVGs without an intrinsic size report Chrome's default viewport
    // (300x150) — a ratio of 2 would falsely flip the tile into
    // "non-square" mode and attach the white card background. Skip the
    // ratio check for SVG sources (they render crisply at any size, so
    // object-cover always does the right thing).
    const src = img.currentSrc || img.src || '';
    const isSvg =
      /\.svg(\?|#|$)/i.test(src) || /^data:image\/svg/i.test(src);
    if (isSvg) {
      setIsNonSquareIcon(false);
      return;
    }

    // Blob URLs can wrap an SVG blob too — detect those via the image's
    // naturalWidth/Height matching Chrome's default SVG viewport
    // (300x150 or very close to 2:1). Treat such results as "unknown
    // aspect ratio" rather than non-square so we don't falsely draw
    // the white backdrop card for crisp vector logos.
    if (src.startsWith('blob:') && w === 300 && h === 150) {
      setIsNonSquareIcon(false);
      return;
    }

    const ratio = w / h;
    // Tolerate small perspective differences (~15%) before flipping modes
    setIsNonSquareIcon(ratio > 1.15 || ratio < 0.87);
  }, []);
  const [iconLoadFailed, setIconLoadFailed] = useState(false);

  // Reset the non-square flag whenever the underlying URL/icon changes, so
  // the next icon load is evaluated fresh.
  useEffect(() => {
    setIsNonSquareIcon(false);
    setIconLoadFailed(false);
  }, [item.url, item.icon]);

  // When a custom dockIconSize is provided, use inline styles; otherwise use Tailwind classes
  const iconSize = (isDock && dockIconSize)
    ? '' // will use inline style instead
    : isDock ? 'w-[56px] h-[56px] md:w-[60px] md:h-[60px]' : 'w-[56px] h-[56px] md:w-[60px] md:h-[60px]';
  const iconSizeStyle: React.CSSProperties = (isDock && dockIconSize)
    ? { width: dockIconSize, height: dockIconSize }
    : {};

  // Check if the icon should use a bare image style (iOS-like, no wrapper background)
  // Non-square icons also take this branch — they stay bare (no white card),
  // and rely on the <img>'s object-contain + 78% sizing below to render
  // intact without being cropped.
  const hasImageIcon = !isFolder && item.type !== 'app' && (
    (item.icon && item.icon.startsWith('http')) || (!item.icon && item.url)
  );
  
  return (
    <div className={`flex select-none flex-col items-center ${isDock ? 'w-auto' : 'w-[80px] md:w-[80px]'} ${isOverlay ? 'opacity-90 scale-110' : ''}`}>
      <div style={{ ...iconSizeStyle, borderRadius: dockIconSize ? Math.round(dockIconSize * 0.3) : undefined, isolation: 'isolate', willChange: 'transform' }} className={`${iconSize} ${!dockIconSize ? 'rounded-[18px]' : ''} overflow-hidden transition-[transform,box-shadow] duration-200 relative ${
        hasImageIcon
          ? `flex items-center justify-center shadow-lg ${isDraggedOver
              ? 'scale-125 shadow-[0_0_30px_rgba(255,255,255,0.3)]'
              : isOverlay
                ? 'shadow-[0_16px_50px_rgba(0,0,0,0.4)]'
                : ''
            }`
          : `${isFolder ? 'bg-white/[0.08] backdrop-blur-2xl' : 'bg-white/[0.08]'} border shadow-lg flex items-center justify-center ${
              isDraggedOver
                ? 'scale-125 bg-white/30 border-white/50 shadow-[0_0_30px_rgba(255,255,255,0.3)]'
                : isOverlay
                  ? 'border-white/30 shadow-[0_16px_50px_rgba(0,0,0,0.4)]'
                  : isFolder ? 'border-white/[0.15]' : 'border-white/15'
            }`
      }`}>
        {isFolder ? (
          <div className="grid grid-cols-3 grid-rows-3 gap-1 p-2.5 w-full h-full">
            {miniIcons.map((node, i) => (
              <div key={`${i}-${node.url || node.icon || node.title}`} className="rounded-[3px] overflow-hidden bg-white/[0.04] flex items-center justify-center">
                <MiniPreviewIcon node={node} />
              </div>
            ))}
            {miniIcons.length === 0 && (
               <div className="col-span-3 row-span-3 flex items-center justify-center opacity-30">
                 <GlobeIcon size={22} />
               </div>
            )}
          </div>
        ) : (
          <>
            {item.type === 'app' ? (
              <div className="flex items-center justify-center w-full h-full text-3xl md:text-4xl">
                {item.icon || '📦'}
              </div>
            ) : item.icon ? (
              item.icon.startsWith('http') ? (
                iconLoadFailed ? (
                  <IconFallback
                    className="w-full h-full text-2xl md:text-3xl"
                    color={item.iconColor}
                    seed={item.url || item.icon || item.title}
                    text={item.title || item.url || 'Untitled'}
                  />
                ) : (
                  <img
                    src={item.icon}
                    className={isNonSquareIcon ? 'w-[78%] h-[78%] object-contain' : 'w-full h-full object-cover'}
                    alt={item.title}
                    crossOrigin={getIconCrossOrigin(item.icon)}
                    decoding="async"
                    loading={isDock ? 'eager' : 'lazy'}
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                    onLoad={(e) => {
                      if (shouldUseLetterFallback(e.currentTarget)) {
                        setIconLoadFailed(true);
                        return;
                      }
                      handleIconLoaded(e);
                    }}
                    onError={() => setIconLoadFailed(true)}
                  />
                )
              ) : (
                <div className="flex items-center justify-center w-full h-full text-3xl md:text-4xl">{item.icon}</div>
              )
            ) : item.url ? (
              <FaviconImg
                url={item.url}
                sz={128}
                className={isNonSquareIcon ? 'w-[78%] h-[78%] object-contain text-2xl md:text-3xl' : 'w-full h-full object-cover text-2xl md:text-3xl'}
                fallbackColor={item.iconColor}
                fallbackText={item.title || item.url || 'Untitled'}
                fallbackSeed={item.url || item.title}
                alt={item.title}
                decoding="async"
                loading={isDock ? 'eager' : 'lazy'}
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                onLoad={handleIconLoaded}
              />
            ) : null}
            <div className="absolute inset-0 items-center justify-center hidden z-0">
               <GlobeIcon size={28} />
            </div>
          </>
        )}
      </div>
      {!isDock && (
        <span className="pointer-events-none mt-1 w-full truncate px-0.5 text-center text-[11px] font-medium tracking-wide text-white drop-shadow-md">
          {item.title || 'Untitled'}
        </span>
      )}
    </div>
  );
}, (prev, next) => {
  // Custom shallow comparison to prevent unnecessary re-renders.
  // Zustand's immutable updates create new item references even when the
  // underlying data hasn't changed, which causes folder preview images
  // to re-mount and flicker. We compare the fields that actually affect
  // the visual output.
  if (prev.isDock !== next.isDock) return false;
  if (prev.isOverlay !== next.isOverlay) return false;
  if (prev.isDraggedOver !== next.isDraggedOver) return false;
  if (prev.dockIconSize !== next.dockIconSize) return false;
  const a = prev.item;
  const b = next.item;
  if (a === b) return true;
  if (a.id !== b.id) return false;
  if (a.type !== b.type) return false;
  if (a.title !== b.title) return false;
  if (a.icon !== b.icon) return false;
  if (a.iconColor !== b.iconColor) return false;
  if (a.url !== b.url) return false;
  // For folders: compare children by length and ids
  if (a.type === 'folder') {
    const ac = a.children;
    const bc = b.children;
    if (ac === bc) return true;
    if (!ac || !bc) return false;
    if (ac.length !== bc.length) return false;
    for (let i = 0; i < ac.length; i++) {
      if (
        ac[i].id !== bc[i].id
        || ac[i].url !== bc[i].url
        || ac[i].icon !== bc[i].icon
        || ac[i].title !== bc[i].title
        || ac[i].iconColor !== bc[i].iconColor
      ) return false;
    }
  }
  return true;
});

// === Centralized FLIP animation manager for desktop grid ===
// Instead of per-element hooks (which suffer from race conditions with rAF),
// we use a single manager that snapshots ALL children at once before React
// commits, then animates them all at once after commit. This avoids timing
// issues between independent useLayoutEffect calls.
//
// Usage:
//   const flipManager = useGridFlipManager();
//   // pass flipManager.containerRef to the grid container
//   // call flipManager.snapshot() BEFORE triggering a state change that reorders
//   // useLayoutEffect will automatically PLAY the animation after re-render

interface FlipSnapshot {
  [id: string]: { left: number; top: number };
}

const useGridFlipManager = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const snapshotRef = useRef<FlipSnapshot | null>(null);
  const activeAnimationsRef = useRef<Map<Element, Animation>>(new Map());

  // Snapshot all grid children's positions BEFORE a reorder.
  // Call this synchronously right before setState/reorder.
  const snapshot = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const snap: FlipSnapshot = {};
    const children = container.querySelectorAll('[data-flip-id]');
    children.forEach((child) => {
      const id = (child as HTMLElement).dataset.flipId;
      if (!id) return;
      // Cancel any in-progress FLIP animation so getBoundingClientRect
      // returns the element's final (true CSS Grid) position.
      const existing = activeAnimationsRef.current.get(child);
      if (existing) {
        existing.cancel();
        activeAnimationsRef.current.delete(child);
      }
      const rect = child.getBoundingClientRect();
      snap[id] = { left: rect.left, top: rect.top };
    });
    snapshotRef.current = snap;
  }, []);

  // After React re-renders and the DOM is updated, compare old vs new positions
  // and animate the difference using Web Animations API (no rAF race conditions).
  useLayoutEffect(() => {
    const prevSnap = snapshotRef.current;
    if (!prevSnap) return;
    snapshotRef.current = null; // consume the snapshot

    const container = containerRef.current;
    if (!container) return;

    const children = container.querySelectorAll('[data-flip-id]');
    children.forEach((child) => {
      const el = child as HTMLElement;
      const id = el.dataset.flipId;
      if (!id || !prevSnap[id]) return;

      // If this element is the one being dragged (opacity < 1), skip animation
      if (el.style.opacity && parseFloat(el.style.opacity) < 0.5) return;

      const oldPos = prevSnap[id];
      const newRect = el.getBoundingClientRect();
      const dx = oldPos.left - newRect.left;
      const dy = oldPos.top - newRect.top;

      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

      // Cancel previous animation on this element if any
      const prev = activeAnimationsRef.current.get(el);
      if (prev) prev.cancel();

      // Use Web Animations API — immune to rAF timing issues
      const anim = el.animate(
        [
          { transform: `translate3d(${dx}px, ${dy}px, 0)` },
          { transform: 'translate3d(0, 0, 0)' },
        ],
        {
          duration: 250,
          easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
          fill: 'none',
        }
      );
      activeAnimationsRef.current.set(el, anim);
      anim.onfinish = () => activeAnimationsRef.current.delete(el);
      anim.oncancel = () => activeAnimationsRef.current.delete(el);
    });
  });

  // Callback ref so consumers attach the container without mutating the
  // ref object returned from this hook (react-hooks/immutability).
  const setContainer = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
  }, []);

  return { containerRef, snapshot, setContainer };
};

// === Sortable Desktop Icon (used in grids) ===
const SortableDesktopIcon: React.FC<{
  item: DesktopItem;
  onClick: (item: DesktopItem) => void;
  onContextMenu?: (e: React.MouseEvent, item: DesktopItem) => void;
  isDock?: boolean;
  isDraggedOver?: boolean;
  activeId?: string | null;
  isFolderDropPending?: boolean;
  /** Override Dock icon size in px (for adaptive scaling) */
  dockIconSize?: number;
  /** When true, skip dnd-kit transform; animation handled by parent FLIP manager */
  isDesktopGrid?: boolean;
}> = ({ item, onClick, onContextMenu, isDock, isDraggedOver, activeId, isFolderDropPending, dockIconSize, isDesktopGrid }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: item.id,
    data: { item, isDock, isFolder: item.type === 'folder' },
    // Desktop grid uses FLIP manager — disable dnd-kit layout animations
    // to prevent infinite update loops with mixed-size grid items.
    ...(isDesktopGrid ? { animateLayoutChanges: noLayoutAnimation, transition: null } : {}),
  });

  // When the folder hover timer has fired (folderDropTargetId is set),
  // freeze sortable transforms so the grid stays stable and the user can
  // clearly see which folder they're about to drop into.
  const shouldFreezeTransform = isFolderDropPending && !isDragging;

  let style: React.CSSProperties;
  if (isDesktopGrid) {
    // Desktop grid: parent FLIP manager handles movement animation.
    // We don't apply dnd-kit transform (inaccurate for mixed-size grids).
    style = {
      opacity: isDragging ? 0.3 : 1,
      zIndex: isDragging ? 0 : 1,
      isolation: 'isolate',
    };
  } else {
    // Dock / folder grid: use dnd-kit's transform (uniform item sizes → accurate)
    const translateOnly = transform
      ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
      : undefined;
    style = {
      transform: shouldFreezeTransform ? undefined : translateOnly,
      transition: shouldFreezeTransform ? 'none' : (transition || 'transform 250ms cubic-bezier(0.25, 1, 0.5, 1)'),
      opacity: isDragging ? 0.3 : 1,
      zIndex: isDragging ? 0 : 1,
    };
  }

  return (
    <div 
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`select-none ${activeId ? 'cursor-grabbing' : 'cursor-pointer'}`}
      data-desktop-icon="true"
      data-flip-id={isDesktopGrid ? item.id : undefined}
      onClick={(e) => {
        if (!isDragging) {
          e.preventDefault();
          onClick(item);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(e, item);
      }}
    >
      <div className={`group ${isDock ? '' : ''}`}>
        <div className={`transition-transform duration-200 ${isDraggedOver ? 'scale-110' : 'group-hover:scale-110 group-active:scale-95'}`}>
          <DesktopIconContent item={item} isDock={isDock} isDraggedOver={isDraggedOver} dockIconSize={dockIconSize} />
        </div>
      </div>
    </div>
  );
};

// === Sortable Widget (used in grids, supports drag & grid span) ===
const SortableWidget: React.FC<{
  item: DesktopItem;
  onClick: (item: DesktopItem) => void;
  onContextMenu?: (e: React.MouseEvent, item: DesktopItem) => void;
  activeId?: string | null;
}> = ({ item, onClick, onContextMenu, activeId }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useSortable({
    id: item.id,
    data: { item, isDock: false, isWidget: true },
    animateLayoutChanges: noLayoutAnimation,
    transition: null,
  });

  const validSize = (item.widgetSize && item.widgetSize in WIDGET_SIZE_MAP) ? item.widgetSize : 'small';
  const { cols, rows } = WIDGET_SIZE_MAP[validSize];

  // Parent FLIP manager handles movement animation — no dnd-kit transform
  const style: React.CSSProperties = {
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 0 : 1,
    gridColumn: `span ${cols}`,
    gridRow: `span ${rows}`,
    justifySelf: 'stretch',
    alignSelf: 'stretch',
    isolation: 'isolate',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`select-none ${activeId ? 'cursor-grabbing' : 'cursor-pointer'} group`}
      data-desktop-icon="true"
      data-flip-id={item.id}
      onClick={(e) => {
        if (!isDragging) {
          e.preventDefault();
          onClick(item);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(e, item);
      }}
    >
      <div className="w-full h-full transition-transform duration-200 group-hover:scale-[1.05] group-active:scale-[0.98]">
        <DesktopWidget item={item} />
      </div>
    </div>
  );
};

// === Droppable zone: folder overlay background (catch drops outside folder content) ===
const FOLDER_DROP_OUT_ID = '__folder-drop-out';
const FolderDropOutZone: React.FC<{ children: React.ReactNode; onClick: () => void }> = ({ children, onClick }) => {
  const { setNodeRef } = useDroppable({
    id: FOLDER_DROP_OUT_ID,
    data: { isFolderDropOut: true },
  });
  return (
    <div
      ref={setNodeRef}
      className="fixed inset-0 z-50 flex select-none items-center justify-center bg-black/40 backdrop-blur-lg animate-fadeIn p-4 sm:p-12"
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDragStart={(e) => e.preventDefault()}
      onSelectCapture={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
};

// === Droppable zone: page background (catch drops on blank areas) ===
const PAGE_DROP_PREFIX = '__page-drop-';
const PageDropZone: React.FC<{ pageIdx: number; totalPages: number; children: React.ReactNode }> = ({ pageIdx, totalPages, children }) => {
  const { setNodeRef } = useDroppable({
    id: `${PAGE_DROP_PREFIX}${pageIdx}`,
    data: { isPageDrop: true, pageIdx },
  });
  // Each page must be exactly 1/totalPages of the flex container (= 1 viewport width)
  const pageWidthPercent = 100 / totalPages;
  return (
    <div ref={setNodeRef} className="desktop-page flex-shrink-0 h-full pt-4 flex flex-col items-center" style={{ width: `${pageWidthPercent}%` }}>
      <div className="desktop-page-scroll w-full h-full overflow-y-auto no-scrollbar pt-4">
        {children}
        {/* Bottom padding to prevent last row being hidden behind Dock */}
        <div className="h-8 md:h-12 shrink-0" />
      </div>
    </div>
  );
};




// === Search Modes ===
type SearchMode = 'web' | 'bookmarks' | 'history' | 'desktop';

const SEARCH_MODES = [
  { id: 'web', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg> },
  { id: 'bookmarks', icon: <BookmarkIcon /> },
  { id: 'history', icon: <HistoryIcon /> },
  { id: 'desktop', icon: <DesktopAppIcon /> },
] as const;

function getDesktopGridMetrics(width: number, height: number) {
  const isCompactDesktop = width >= 768 && (width < 1280 || height <= 820);

  if (width >= 540 && width < 768) return { cellSize: 64, gap: 28 };
  if (width < 640) return { cellSize: Math.max(56, (width - 68) / 4), gap: 12 };
  if (width < 768) return { cellSize: 72, gap: 32 };
  if (isCompactDesktop) return { cellSize: width < 1024 ? 72 : 76, gap: width < 1024 ? 28 : 32 };
  return { cellSize: 80, gap: width >= 1280 ? 44 : width >= 1024 ? 40 : 36 };
}


// === Custom collision detection: debounce reordering so icons don't swap too eagerly ===
//
// Problem: closestCenter triggers a reorder the moment the dragged item's center is
// closer to a neighbour than its own slot. This is too sensitive — the user can't hover
// over a folder for 500ms because the icon gets swapped away almost immediately.
//
// Solution: we add TWO layers of protection:
// 1. Distance threshold: ignore collisions whose centre-distance exceeds a generous limit.
// 2. Time-based debounce: a new "over" target must persist for SORT_DEBOUNCE_MS before
//    we actually report it. While the debounce timer is running we keep reporting the
//    *previous* stable target, giving the user time to pause on a folder.
//
// The debounce state lives outside the function so it persists across calls.
// Debounce durations for collision target switching.
// Folder/link targets (potential merge/drop-into) need a longer debounce so the
// user has time to hover without the icon being swapped away. Regular icons only
// need a short debounce to keep the grid from jittering on fast pointer moves.
const SORT_DEBOUNCE_FOLDER_MS = 300;
const SORT_DEBOUNCE_ICON_MS = 60;
let _stableOverId: string | number | null = null;
let _pendingOverId: string | number | null = null;
let _pendingTimestamp = 0;

function createFolderAwareCollision(
  _draggedItem: DesktopItem | null,
  lookupItem?: (id: string) => DesktopItem | null,
): CollisionDetection {
  return (args) => {
    const collisions = closestCenter(args);
    if (!collisions || collisions.length === 0) {
      // Nothing nearby — reset debounce and report empty
      _stableOverId = null;
      _pendingOverId = null;
      return collisions;
    }

    // Always keep special droppable zones in the results —
    // they should not be subject to distance filtering or debounce.
    const isSpecialZone = (id: string | number) => {
      const idStr = String(id);
      return idStr.startsWith(PAGE_DROP_PREFIX) || idStr === FOLDER_DROP_OUT_ID;
    };
    const specialCollisions = collisions.filter((c) => isSpecialZone(c.id));

    // --- Distance filter ---
    const activeRect = args.active.rect.current.translated;
    if (!activeRect) return collisions;

    // Keep only collisions that are within a generous distance.
    // Use the LARGER dimension of the dragged item so that multi-cell widgets
    // (which have a much bigger rect) still get detected properly.
    // Coefficient 1.5 keeps the threshold generous without catching
    // items that are clearly in a different grid row/column.
    const iconSize = Math.max(activeRect.width, activeRect.height);
    const threshold = iconSize * 1.5;

    const close = collisions.filter((c) => {
      if (isSpecialZone(c.id)) return false; // handled separately
      const d = typeof c.data?.value === 'number' ? c.data.value : 0;
      return d <= threshold;
    });

    // Helper: append special zone collisions (page drop zones, folder drop-out)
    // to any result set, ensuring they are always reachable.
    // Special zones are appended at the END so regular icon collisions take
    // priority; page drop zones only kick in when no icon is close enough.
    const withSpecialZones = (result: typeof collisions) => {
      if (specialCollisions.length === 0) return result;
      const filtered = result.filter((c) => !isSpecialZone(c.id));
      // If no normal collisions, special zones become the fallback
      if (filtered.length === 0) return specialCollisions;
      return [...filtered, ...specialCollisions];
    };

    if (close.length === 0) {
      // No close collision — if we have special zones, return those as fallback
      if (specialCollisions.length > 0) {
        return specialCollisions;
      }
      // Otherwise keep the stable target so the grid doesn't jitter
      if (_stableOverId != null) {
        // Return the previous stable collision so SortableContext keeps its state
        const kept = collisions.find((c) => c.id === _stableOverId);
        return withSpecialZones(kept ? [kept] : []);
      }
      return withSpecialZones([]);
    }

    // --- Time-based debounce ---
    const topId = close[0].id;
    const now = Date.now();

    if (topId === _stableOverId) {
      // Same as the current stable target — no change needed
      _pendingOverId = null;
      return withSpecialZones(close);
    }

    if (topId !== _pendingOverId) {
      // New candidate — start the debounce timer
      _pendingOverId = topId;
      _pendingTimestamp = now;
      // Keep reporting the previous stable target in the meantime
      if (_stableOverId != null) {
        const kept = collisions.find((c) => c.id === _stableOverId);
        return withSpecialZones(kept ? [kept] : close);
      }
      return withSpecialZones(close);
    }

    // Same candidate as pending — pick debounce duration based on target type.
    // Folder/link targets get longer debounce for merge-hover, regular icons are fast.
    const isDraggingFolder = _draggedItem?.type === 'folder';
    const isDraggingWidget = _draggedItem?.type === 'widget';
    const topItem = lookupItem ? lookupItem(String(topId)) : null;
    const targetIsFolderOrLink = !isDraggingFolder && !isDraggingWidget
      && (topItem?.type === 'folder' || topItem?.type === 'link');
    const debounceMs = targetIsFolderOrLink ? SORT_DEBOUNCE_FOLDER_MS : SORT_DEBOUNCE_ICON_MS;

    if (now - _pendingTimestamp >= debounceMs) {
      // Debounce complete — accept the new target
      _stableOverId = topId;
      _pendingOverId = null;
      return withSpecialZones(close);
    }

    // Still waiting — keep reporting the old stable target
    if (_stableOverId != null) {
      const kept = collisions.find((c) => c.id === _stableOverId);
      return withSpecialZones(kept ? [kept] : close);
    }
    return withSpecialZones(close);
  };
}


// === Main Desktop Page ===

export const Desktop: React.FC = () => {
  const { fetchBookmarks } = useBookmarkStore();
  const { layout, removeDesktopItem, moveItemToDock, moveItemFromDock, reorderDesktopItem, moveItemToFolder, moveItemToPage, reorderInsideFolder, moveItemOutOfFolder, updateDesktopItem, mergeItemsToNewFolder } = useLayoutStore();
  const { jwtToken, setLocked, language, userProfile, linkOpenMode } = useConfigStore();
  const { t } = useTranslation();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('web');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'wallpaper' | 'system'>('wallpaper');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isBookmarkBrowserOpen, setIsBookmarkBrowserOpen] = useState(false);
  const [isHistoryBrowserOpen, setIsHistoryBrowserOpen] = useState(false);
  const [openedFolder, setOpenedFolder] = useState<DesktopItem | null>(null);
  const [searchResults, setSearchResults] = useState<DesktopItem[]>([]);
  
  // Add/Edit/Context menu state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DesktopItem | null>(null);
  const [addToFolderId, setAddToFolderId] = useState<string | undefined>(undefined);
  const [addToPageIndex, setAddToPageIndex] = useState<number | undefined>(undefined);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: DesktopItem; inDock?: boolean } | null>(null);
  const [blankContextMenu, setBlankContextMenu] = useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const blankContextMenuRef = useRef<HTMLDivElement>(null);

  // 动态调整右键菜单位置，防止超出屏幕边缘
  const adjustMenuPosition = useCallback((menuRef: React.RefObject<HTMLDivElement | null>, x: number, y: number) => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    const newLeft = Math.min(x, window.innerWidth - rect.width - pad);
    const newTop = Math.min(y, window.innerHeight - rect.height - pad);
    el.style.left = `${Math.max(pad, newLeft)}px`;
    el.style.top = `${Math.max(pad, newTop)}px`;
  }, []);

  useLayoutEffect(() => {
    if (contextMenu) {
      adjustMenuPosition(contextMenuRef, contextMenu.x, contextMenu.y);
    }
  }, [contextMenu, adjustMenuPosition]);

  useLayoutEffect(() => {
    if (blankContextMenu) {
      adjustMenuPosition(blankContextMenuRef, blankContextMenu.x, blankContextMenu.y);
    }
  }, [blankContextMenu, adjustMenuPosition]);

  // Explore World state
  const [isExploreOpen, setIsExploreOpen] = useState(false);
  // IT Tools state
  const [isItToolsOpen, setIsItToolsOpen] = useState(false);
  // Sticky Note state
  const [stickyNoteItem, setStickyNoteItem] = useState<DesktopItem | null>(null);
  // AI Agent chat modal state
  const [isAiAgentOpen, setIsAiAgentOpen] = useState(false);
  // Trending modal state
  const [trendingModalType, setTrendingModalType] = useState<'github' | 'bilibili' | 'weibo' | 'xiaohongshu' | 'bbc' | null>(null);
  const [trendingModalOptions, setTrendingModalOptions] = useState<any>(null);
  const [calendarDetailItem, setCalendarDetailItem] = useState<DesktopItem | null>(null);
  
  // Add Widget state
  const [isAddWidgetOpen, setIsAddWidgetOpen] = useState(false);
  // Edit Widget state
  const [editingWidget, setEditingWidget] = useState<DesktopItem | null>(null);

  // Folder rename state
  const [isEditingFolderName, setIsEditingFolderName] = useState(false);
  const [editingFolderName, setEditingFolderName] = useState('');
  const folderNameInputRef = useRef<HTMLInputElement>(null);

  // Pagination — iOS-style swipe gesture
  const [currentPage, setCurrentPage] = useState(0);
  const pagesContainerRef = useRef<HTMLDivElement>(null);
  const pagesTrackRef = useRef<HTMLDivElement>(null);
  const pageOffsetRef = useRef(0);
  const pageOffsetRAFRef = useRef<number | null>(null);
  // Container width (recalculated on resize)
  const [containerWidth, setContainerWidth] = useState(0);
  // Touch/mouse gesture tracking refs (not state, to avoid re-render on every move)
  const swipeRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    currentX: number;
    isDragging: boolean;
    isHorizontal: boolean | null; // null = undecided, true = horizontal swipe, false = vertical
  }>({ startX: 0, startY: 0, startTime: 0, currentX: 0, isDragging: false, isHorizontal: null });

  const searchInputRef = useRef<HTMLInputElement>(null);

  // FLIP animation manager for desktop grid reorder animations
  const flipManager = useGridFlipManager();
  const setPagesTrackNode = useCallback((node: HTMLDivElement | null) => {
    pagesTrackRef.current = node;
    flipManager.setContainer(node);
  }, [flipManager.setContainer]);

  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null);
  // Track whether the currently dragged item originally came from the dock.
  // This is needed because after a cross-container move during dragOver,
  // the item is already in pages but still needs manual reordering calls
  // (SortableContext can't auto-sort items that were added mid-drag).
  const dragStartedInDockRef = useRef(false);
  // Guard against infinite re-render loops: track recent reorder keys and timestamps
  // to prevent the same move AND rapid ping-pong cycles (especially with multi-cell widgets).
  const lastReorderRef = useRef<string | null>(null);
  const reorderHistoryRef = useRef<string[]>([]);
  const lastReorderTimeRef = useRef<number>(0);
  // Defer reorder calls via requestAnimationFrame so they execute OUTSIDE
  // dnd-kit's synchronous layout-effect measurement cycle.  Without this,
  // the chain is: items change → SortableContext layout-effect calls
  // measureDroppableContainers → droppableRects change → collision detection
  // re-runs → handleDragOver fires → reorderDesktopItem → items change → ∞
  // By scheduling the reorder in the NEXT animation frame, the layout effect
  // completes first and the loop is broken.
  const pendingReorderRAF = useRef<number | null>(null);
  const folderHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [folderDropTargetId, setFolderDropTargetId] = useState<string | null>(null);
  // Track the last folder we hovered over (survives brief flickers away)
  const lastFolderOverRef = useRef<string | null>(null);
  // When true, sortable transforms are frozen so the grid doesn't reorder while hovering a folder
  const [isFolderDropPending, setIsFolderDropPending] = useState(false);

  const allItems = useMemo(() => getAllDesktopItems(layout), [layout]);

  // Find item by id across all pages and dock
  const findItemById = useCallback((id: string): DesktopItem | null => {
    const searchIn = (items: DesktopItem[]): DesktopItem | null => {
      for (const item of items) {
        if (item.id === id) return item;
        if (item.children) {
          const found = searchIn(item.children);
          if (found) return found;
        }
      }
      return null;
    };
    for (const page of layout.pages) {
      const found = searchIn(page);
      if (found) return found;
    }
    return searchIn(layout.dock);
  }, [layout]);

  const activeItem = activeId ? findItemById(activeId) : null;

  // Collision detection: when dragging a folder, skip folder-priority so folders reorder normally
  const collisionDetection = useMemo(() => createFolderAwareCollision(activeItem, findItemById), [activeItem, findItemById]);

  // Sensors: MouseSensor for desktop (distance-based), TouchSensor for mobile (long-press).
  // Separating them avoids the need for touch-action:none on icons, allowing native
  // scroll/swipe for page navigation while still supporting long-press-to-drag.
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 500, tolerance: 10 },
    })
  );

  const getSearchModeLabel = (id: SearchMode) => {
    switch (id) {
      case 'web': return t('search.web');
      case 'bookmarks': return t('search.bookmarks');
      case 'history': return t('search.history');
      case 'desktop': return t('search.desktop');
    }
  };

  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks]);

  // Live search
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || searchMode === 'web') {
      setSearchResults([]);
      return;
    }

    if (searchMode === 'desktop') {
      const filtered = allItems.filter(item => 
        (item.title && item.title.toLowerCase().includes(q)) || 
        (item.url && item.url.toLowerCase().includes(q))
      );
      setSearchResults(filtered);
    } 
    else if (searchMode === 'bookmarks') {
      if (typeof chrome !== 'undefined' && chrome.bookmarks) {
        chrome.bookmarks.search(q, (results) => {
          const nodes: DesktopItem[] = results.map(r => ({
            id: r.id, type: 'link', title: r.title, url: r.url
          }));
          setSearchResults(nodes.slice(0, 50));
        });
      } else {
        setSearchResults(allItems.filter(item => item.title.toLowerCase().includes(q)));
      }
    } 
    else if (searchMode === 'history') {
      if (typeof chrome !== 'undefined' && chrome.history) {
        chrome.history.search({ text: q, maxResults: 50 }, (results) => {
          const historyNodes: DesktopItem[] = results.map(r => ({
            id: r.id,
            type: 'link',
            title: r.title || r.url || 'History Item',
            url: r.url
          }));
          setSearchResults(historyNodes);
        });
      } else {
        setSearchResults([]);
      }
    }
  }, [searchQuery, searchMode, allItems]);

  const handleItemClick = (item: DesktopItem) => {
    if (activeId) return;
    if (item.type === 'link' && item.url) {
      openUrl(item.url, linkOpenMode);
    } else if (item.type === 'folder') {
      setOpenedFolder(item);
    } else if (item.type === 'app') {
      if (item.id === 'app-bookmarks') {
        setIsBookmarkBrowserOpen(true);
      } else if (item.id === 'app-history') {
        setIsHistoryBrowserOpen(true);
      } else if (item.id === 'app-explore') {
        setIsExploreOpen(true);
      }
    } else if (item.type === 'widget') {
      if (item.widgetType === 'itTools') {
        setIsItToolsOpen(true);
      } else if (item.widgetType === 'calendar') {
        setCalendarDetailItem(item);
        return;
      } else if (item.widgetType === 'stickyNote') {
        setStickyNoteItem(item);
      } else if (item.widgetType === 'stock') {
        // Stock widget manages its own detail modal internally — do nothing here
        return;
      } else if (item.widgetType === 'exchangeRate') {
        // ExchangeRate widget manages its own detail modal internally — do nothing here
        return;
      } else if (item.widgetType === 'calculator') {
        // Calculator widget manages its own modal internally — do nothing here
        return;
      } else if (item.widgetType === 'aiAgent') {
        setIsAiAgentOpen(true);
        return;
      } else if (item.widgetType === 'githubTrending') {
        setTrendingModalType('github');
        setTrendingModalOptions(item.widgetConfig);
        return;
      } else if (item.widgetType === 'bilibiliHot') {
        setTrendingModalType('bilibili');
        return;
      } else if (item.widgetType === 'weiboHot') {
        setTrendingModalType('weibo');
        return;
      } else if (item.widgetType === 'xiaohongshuHot') {
        setTrendingModalType('xiaohongshu');
        return;
      } else if (item.widgetType === 'bbcNews') {
        setTrendingModalType('bbc');
        return;
      } else {
        setEditingWidget(item);
      }
    }
  };

  useEffect(() => {
    if (openedFolder) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [openedFolder]);

  // === DnD Handlers ===
  const handleDragStart = useCallback((event: DragStartEvent) => {
    // Reset collision debounce state for the new drag session
    _stableOverId = null;
    _pendingOverId = null;
    _pendingTimestamp = 0;
    const id = event.active.id as string;
    setActiveId(id);
    // Remember whether the item started in the dock so we can continue
    // manually reordering it after a cross-container move (see handleDragOver).
    dragStartedInDockRef.current = layout.dock.some(item => item.id === id);
    lastReorderRef.current = null;
    reorderHistoryRef.current = [];
    lastReorderTimeRef.current = 0;
    setContextMenu(null);
  }, [layout.dock]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    const newOverId = over?.id as string | null;

    // If the dragged item itself is a folder, skip folder-hover detection entirely
    // so that folders can be reordered freely via normal sortable logic.
    const activeItem_ = activeId ? findItemById(activeId) : null;
    const isDraggingFolder = activeItem_?.type === 'folder';
    const isDraggingWidget = activeItem_?.type === 'widget';

    // --- Helper: compute overlap ratio between the dragged icon and the over element ---
    // Returns a value between 0 and 1, representing how much of the smaller rect
    // is overlapping with the over rect. This is more reliable than pointer-based
    // detection because the dragged overlay has real size.
    const getOverlapRatio = (): number => {
      // active.rect.current.translated is the real-time rect of the dragged item
      const activeRect = active.rect.current.translated;
      const overRect = over?.rect;
      if (!activeRect || !overRect) return 0;

      const overlapLeft = Math.max(activeRect.left, overRect.left);
      const overlapRight = Math.min(activeRect.right, overRect.right);
      const overlapTop = Math.max(activeRect.top, overRect.top);
      const overlapBottom = Math.min(activeRect.bottom, overRect.bottom);

      if (overlapLeft >= overlapRight || overlapTop >= overlapBottom) return 0;

      const overlapArea = (overlapRight - overlapLeft) * (overlapBottom - overlapTop);
      // Use the smaller rect's area as denominator so ratio is meaningful
      const activeArea = activeRect.width * activeRect.height;
      const overArea = overRect.width * overRect.height;
      const smallerArea = Math.min(activeArea, overArea);

      return smallerArea > 0 ? overlapArea / smallerArea : 0;
    };

    // Overlap threshold: the dragged icon must overlap ≥50% of the folder to trigger
    const FOLDER_OVERLAP_THRESHOLD = 0.5;

    // --- Folder hover detection ---
    // When the dragged icon overlaps a folder enough AND stays there long enough (500ms),
    // we mark it as a drop target. While the overlap is sufficient, we PAUSE normal
    // reordering so the icon doesn't get pushed away before the timer fires.
    // NOTE: Dock items never participate in folder merging — only reorder.
    let isOverFolder = false;

    // Check if either side is in the Dock — skip folder merge for Dock items
    const sourceInDockForFolder = layout.dock.some(item => item.id === activeId);
    const overData_ = over?.data.current as { isDock?: boolean } | undefined;
    const targetInDockForFolder = !!overData_?.isDock;
    const eitherInDock = sourceInDockForFolder || targetInDockForFolder;

    if (!eitherInDock && !isDraggingFolder && !isDraggingWidget && newOverId && newOverId !== activeId) {
      const overItem = findItemById(newOverId);
      const overlapRatio = getOverlapRatio();

      // Allow merging into folders AND onto regular link items (not app/widget items)
      const isDroppableTarget = overItem?.type === 'folder' || (overItem?.type === 'link');

      if (isDroppableTarget && overlapRatio >= FOLDER_OVERLAP_THRESHOLD) {
        // Sufficient overlap with a folder or link — start/continue hover timer
        isOverFolder = true;
        if (lastFolderOverRef.current !== newOverId) {
          // Switched to a different target — restart timer
          lastFolderOverRef.current = newOverId;
          if (folderHoverTimerRef.current) clearTimeout(folderHoverTimerRef.current);
          setFolderDropTargetId(null);
          setIsFolderDropPending(true); // Freeze grid immediately to prevent reorder
          folderHoverTimerRef.current = setTimeout(() => {
            setFolderDropTargetId(newOverId);
          }, 500);
        }
        // Same target as before — keep the timer running, stay frozen
      } else {
        // Over a non-folder item, or not enough overlap — clear folder hover state
        if (lastFolderOverRef.current) {
          if (folderHoverTimerRef.current) clearTimeout(folderHoverTimerRef.current);
          lastFolderOverRef.current = null;
          setFolderDropTargetId(null);
          setIsFolderDropPending(false);
        }
      }
    } else if (!newOverId || newOverId === activeId) {
      // Not over anything meaningful — clear folder hover state
      if (lastFolderOverRef.current) {
        if (folderHoverTimerRef.current) clearTimeout(folderHoverTimerRef.current);
        lastFolderOverRef.current = null;
        setFolderDropTargetId(null);
        setIsFolderDropPending(false);
      }
    }

    // --- Normal reordering (skip when hovering a folder) ---
    // When the icon is sufficiently overlapping a folder, we pause reordering
    // so the icon stays in place and the user has time to trigger folder drop.
    if (isOverFolder) return;

    // --- Real-time reordering for FLIP animations ---
    // For the desktop grid, dnd-kit's rectSortingStrategy produces inaccurate
    // transforms with mixed-size items. So we skip dnd-kit transforms and
    // instead reorder state in real-time during dragOver, letting CSS Grid
    // place items correctly and FLIP animate the transition.
    //
    // For cross-container moves (Desktop ↔ Dock), this was already done.
    // Now we also do it for SAME-container desktop moves.
    if (newOverId && newOverId !== activeId && !openedFolder) {
      const overIdStr = String(newOverId);

      // If hovering over a page drop zone (blank area), move dock item to that page
      if (overIdStr.startsWith(PAGE_DROP_PREFIX)) {
        const sourceInDock = layout.dock.some(item => item.id === activeId);
        if (sourceInDock && activeId) {
          const pageIdx = parseInt(overIdStr.slice(PAGE_DROP_PREFIX.length), 10);
          moveItemToPage(activeId, pageIdx);
        }
        return;
      }

      // Determine where source currently lives by checking layout data (not stale active.data)
      const sourceInDock = layout.dock.some(item => item.id === activeId);
      const overData = over?.data.current as { isDock?: boolean } | undefined;
      const targetIsDock = !!overData?.isDock;

      const reorderKey = `${active.id}->${newOverId}`;

      // For cross-container: always reorder
      // For same-container desktop: also reorder in real-time for FLIP
      // For same-container dock: dnd-kit handles animation fine (uniform sizes)
      const isCrossContainer = sourceInDock !== targetIsDock;
      const isBackFromDock = !sourceInDock && !targetIsDock && dragStartedInDockRef.current;
      const isSameContainerDesktop = !sourceInDock && !targetIsDock && !dragStartedInDockRef.current;

      const shouldReorder = isCrossContainer || isBackFromDock || isSameContainerDesktop;

      if (shouldReorder && lastReorderRef.current !== reorderKey) {
        // Multi-cell widgets need extra protection against ping-pong cycles:
        // when a 2×2 widget is reordered the grid reshuffles dramatically,
        // causing dnd-kit to detect a NEW collision target almost immediately
        // (A→B→C→A loop). We apply:
        // 1) A 150ms minimum time interval between consecutive widget reorders
        // 2) Cycle detection: if this reorderKey appeared recently, skip it
        //
        // For regular icons, the collision-detection debounce (60ms) + rAF
        // deferral already provides enough protection — no extra throttle needed.
        const activeItem_ = activeId ? findItemById(activeId) : null;
        const isWidgetDrag = activeItem_?.type === 'widget';

        if (isWidgetDrag) {
          const now = Date.now();
          const elapsed = now - lastReorderTimeRef.current;
          if (elapsed < 150) return; // throttle: too soon since last widget reorder

          // Cycle detection: check if this exact key appeared in recent history
          if (reorderHistoryRef.current.includes(reorderKey)) return;

          // Keep history bounded (last 4 moves)
          reorderHistoryRef.current.push(reorderKey);
          if (reorderHistoryRef.current.length > 4) {
            reorderHistoryRef.current.shift();
          }
          lastReorderTimeRef.current = now;
        }

        lastReorderRef.current = reorderKey;

        // Cancel any pending reorder from a previous dragOver event
        if (pendingReorderRAF.current != null) {
          cancelAnimationFrame(pendingReorderRAF.current);
        }

        // CRITICAL: Defer the actual state mutation to the next animation frame.
        // dnd-kit's SortableContext fires a layout-effect that calls
        // measureDroppableContainers whenever items change. If we mutate state
        // synchronously inside handleDragOver, the chain becomes:
        //   reorderDesktopItem → items change → layout-effect measures →
        //   droppableRects change → collision re-runs → handleDragOver → ∞
        // By deferring to rAF, the layout-effect measurement completes first
        // and the state mutation happens in a separate frame, breaking the loop.
        const capturedActiveId = active.id as string;
        const capturedOverId = newOverId;
        const shouldSnap = !targetIsDock || isSameContainerDesktop;

        pendingReorderRAF.current = requestAnimationFrame(() => {
          pendingReorderRAF.current = null;
          // Snapshot before reorder for FLIP animation (desktop items)
          if (shouldSnap) {
            flipManager.snapshot();
          }
          reorderDesktopItem(capturedActiveId, capturedOverId);
        });
      }
    }
  }, [activeId, findItemById, openedFolder, reorderDesktopItem, moveItemToPage, layout, flipManager]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (folderHoverTimerRef.current) clearTimeout(folderHoverTimerRef.current);
    // Cancel any pending RAF reorder from dragOver
    if (pendingReorderRAF.current != null) {
      cancelAnimationFrame(pendingReorderRAF.current);
      pendingReorderRAF.current = null;
    }
    // Reset collision debounce state
    _stableOverId = null;
    _pendingOverId = null;
    _pendingTimestamp = 0;

    const sourceId = active.id as string;
    const targetId = over?.id as string | null;

    // --- Drop out of folder (onto the backdrop or into empty area) ---
    // When the folder overlay is open and the user drags an icon outside the
    // folder content area, the drop target will be either the FOLDER_DROP_OUT_ID
    // droppable zone (the backdrop) or null (dragged beyond any droppable).
    // In both cases we should move the item out of the folder.
    if (openedFolder) {
      const isSourceInFolder = openedFolder.children?.some(c => c.id === sourceId);
      const droppedOutOfFolder = !targetId || targetId === FOLDER_DROP_OUT_ID;

      if (isSourceInFolder && droppedOutOfFolder) {
        moveItemOutOfFolder(sourceId, openedFolder.id, currentPage);
        // The store collapses folders with fewer than two children.
        const remainingChildren = openedFolder.children?.filter(c => c.id !== sourceId) ?? [];
        if (remainingChildren.length <= 1) {
          setOpenedFolder(null);
        }
        setActiveId(null);
        setFolderDropTargetId(null);
        lastFolderOverRef.current = null;
        setIsFolderDropPending(false);
        return;
      }
    }

    // --- Drop onto a page blank area ---
    // If the item was dropped on the page droppable zone (not on a specific icon),
    // move it to that page. This handles Dock→Desktop drag to empty areas.
    if (targetId && typeof targetId === 'string' && targetId.startsWith(PAGE_DROP_PREFIX)) {
      // The item was already moved during dragOver, just clean up
      const sourceStillInDock = layout.dock.some(item => item.id === sourceId);
      if (sourceStillInDock) {
        const pageIdx = parseInt(targetId.slice(PAGE_DROP_PREFIX.length), 10);
        moveItemToPage(sourceId, pageIdx);
      }
      setActiveId(null);
      setFolderDropTargetId(null);
      lastFolderOverRef.current = null;
      setIsFolderDropPending(false);
      return;
    }

    if (targetId && sourceId !== targetId) {
      const targetItem = findItemById(targetId);
      const sourceItem_ = findItemById(sourceId);

      // Check if either source or target is in the Dock — Dock never does folder merge
      const sourceInDockEnd = layout.dock.some(item => item.id === sourceId);
      const targetInDockEnd = layout.dock.some(item => item.id === targetId);
      const eitherInDockEnd = sourceInDockEnd || targetInDockEnd;

      if (!eitherInDockEnd) {
        // --- Drop into existing folder ---
        // Only accept the drop into a folder when folderDropTargetId is set,
        // which means the user hovered over the folder long enough (≥500ms).
        // If the user just passed through quickly, treat it as a normal reorder.
        // Never drop a folder INTO another folder — folders should only reorder.
        const isDraggingFolder = sourceItem_?.type === 'folder';
        const isDraggingWidget = sourceItem_?.type === 'widget';
        const shouldDropIntoFolder = !isDraggingFolder
          && !isDraggingWidget
          && targetItem?.type === 'folder'
          && folderDropTargetId === targetId;

        if (shouldDropIntoFolder) {
          moveItemToFolder(sourceId, targetId);
          setActiveId(null);
          setFolderDropTargetId(null);
          lastFolderOverRef.current = null;
          setIsFolderDropPending(false);
          return;
        }

        // --- Merge two items into a new folder (iOS-style) ---
        // When dragging a non-folder item onto another non-folder item and
        // folderDropTargetId is set (hovered ≥500ms), create a new folder.
        // Widgets cannot be merged into folders.
        const shouldMergeToFolder = !isDraggingFolder
          && !isDraggingWidget
          && targetItem?.type === 'link'
          && sourceItem_?.type !== 'folder'
          && folderDropTargetId === targetId;

        if (shouldMergeToFolder) {
          mergeItemsToNewFolder(sourceId, targetId);
          setActiveId(null);
          setFolderDropTargetId(null);
          lastFolderOverRef.current = null;
          setIsFolderDropPending(false);
          return;
        }
      }

      // Check if we're inside a folder overlay
      if (openedFolder) {
        const isSourceInFolder = openedFolder.children?.some(c => c.id === sourceId);
        const isTargetInFolder = openedFolder.children?.some(c => c.id === targetId);
        
        if (isSourceInFolder && isTargetInFolder) {
          reorderInsideFolder(openedFolder.id, sourceId, targetId);
        } else if (isSourceInFolder && !isTargetInFolder) {
          moveItemOutOfFolder(sourceId, openedFolder.id, currentPage);
          // The store collapses folders with fewer than two children.
          const remainingChildren = openedFolder.children?.filter(c => c.id !== sourceId) ?? [];
          if (remainingChildren.length <= 1) {
            setOpenedFolder(null);
          }
        }
      } else {
        flipManager.snapshot(); // Capture positions before reorder for FLIP animation
        reorderDesktopItem(sourceId, targetId);
      }
    }

    setActiveId(null);
    dragStartedInDockRef.current = false;
    lastReorderRef.current = null;
    reorderHistoryRef.current = [];
    lastReorderTimeRef.current = 0;
    setFolderDropTargetId(null);
    lastFolderOverRef.current = null;
    setIsFolderDropPending(false);
  }, [folderDropTargetId, findItemById, moveItemToFolder, mergeItemsToNewFolder, moveItemToPage, openedFolder, reorderInsideFolder, moveItemOutOfFolder, reorderDesktopItem, currentPage, layout, flipManager]);

  const handleDragCancel = useCallback(() => {
    if (folderHoverTimerRef.current) clearTimeout(folderHoverTimerRef.current);
    // Cancel any pending RAF reorder from dragOver
    if (pendingReorderRAF.current != null) {
      cancelAnimationFrame(pendingReorderRAF.current);
      pendingReorderRAF.current = null;
    }
    _stableOverId = null;
    _pendingOverId = null;
    _pendingTimestamp = 0;
    setActiveId(null);
    dragStartedInDockRef.current = false;
    lastReorderRef.current = null;
    reorderHistoryRef.current = [];
    lastReorderTimeRef.current = 0;
    setFolderDropTargetId(null);
    lastFolderOverRef.current = null;
    setIsFolderDropPending(false);
  }, []);

  const handleAuthClick = () => {
    if (jwtToken) setIsProfileOpen(true);
    else setIsAuthOpen(true);
  };

  const handleContextMenu = (e: React.MouseEvent, item: DesktopItem, inDock?: boolean) => {
    e.preventDefault();
    // Skip if any modal/popup is open (folder overlay is NOT skipped —
    // users should be able to right-click icons inside an opened folder)
    if (
      isSettingsOpen || isAuthOpen || isProfileOpen ||
      isBookmarkBrowserOpen || isHistoryBrowserOpen ||
      isExploreOpen || isItToolsOpen || isAddWidgetOpen ||
      isAddModalOpen || !!stickyNoteItem || !!editingWidget
    ) return;
    setContextMenu({ x: e.clientX, y: e.clientY, item, inDock });
  };

  const handleEdit = (item: DesktopItem) => {
    setEditingItem(item);
    setIsAddModalOpen(true);
    setContextMenu(null);
  };

  const handleDelete = (item: DesktopItem) => {
    if (window.confirm(t('desktop.deleteConfirm', { title: item.title }))) {
      removeDesktopItem(item.id);
    }
    setContextMenu(null);
  };

  const openAddModal = (pageIdx?: number, folderId?: string) => {
    setEditingItem(null);
    setAddToFolderId(folderId);
    setAddToPageIndex(pageIdx);
    setIsAddModalOpen(true);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    if (searchMode === 'web') {
      if (typeof chrome !== 'undefined' && chrome.search && chrome.search.query) {
        chrome.search.query({ text: q, disposition: linkOpenMode === 'current' ? 'CURRENT_TAB' : 'NEW_TAB' });
      } else {
        openUrl(`https://www.google.com/search?q=${encodeURIComponent(q)}`, linkOpenMode);
      }
    } else {
      if (searchResults.length > 0 && searchResults[0].url) {
        openUrl(searchResults[0].url, linkOpenMode);
      }
    }
  };

  // === iOS-style page swipe logic ===
  // Auto-append an empty page when the last page has content (like iOS).
  // This gives the user a blank page to swipe to and add new items.
  const displayPages = useMemo(() => {
    const pages = layout.pages;
    const lastPage = pages[pages.length - 1];
    if (lastPage && lastPage.length > 0) {
      return [...pages, []]; // append virtual empty page
    }
    return pages;
  }, [layout.pages]);
  const totalPages = displayPages.length;

  const setPagesTrackTransition = useCallback((enabled: boolean) => {
    const el = pagesTrackRef.current;
    if (!el) return;
    el.style.transition = enabled ? 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)' : 'none';
  }, []);

  const writePageOffset = useCallback((offset: number) => {
    pageOffsetRef.current = offset;
    const el = pagesTrackRef.current;
    if (!el) return;
    el.style.setProperty('--desktop-page-offset', `${offset}px`);
  }, []);

  const schedulePageOffset = useCallback((offset: number) => {
    pageOffsetRef.current = offset;
    if (pageOffsetRAFRef.current != null) return;

    pageOffsetRAFRef.current = requestAnimationFrame(() => {
      pageOffsetRAFRef.current = null;
      const el = pagesTrackRef.current;
      if (!el) return;
      el.style.setProperty('--desktop-page-offset', `${pageOffsetRef.current}px`);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (pageOffsetRAFRef.current != null) {
        cancelAnimationFrame(pageOffsetRAFRef.current);
        pageOffsetRAFRef.current = null;
      }
      document.body.classList.remove('desktop-page-swiping');
    };
  }, []);

  // Measure container width on mount and resize
  useLayoutEffect(() => {
    const measure = () => {
      if (pagesContainerRef.current) {
        setContainerWidth(pagesContainerRef.current.clientWidth);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Animate to a specific page index
  const scrollToPage = useCallback((pageIdx: number) => {
    const clamped = Math.max(0, Math.min(pageIdx, totalPages - 1));
    document.body.classList.remove('desktop-page-swiping');
    setPagesTrackTransition(true);
    writePageOffset(-clamped * containerWidth);
    setCurrentPage(clamped);
  }, [containerWidth, totalPages, setPagesTrackTransition, writePageOffset]);

  const getDirectPageIndex = useCallback((itemId: string) => {
    return layout.pages.findIndex(page => page.some(item => item.id === itemId));
  }, [layout.pages]);

  const handleMoveToPage = useCallback((item: DesktopItem, pageIdx: number) => {
    const isSourceInOpenedFolder = openedFolder?.children?.some(child => child.id === item.id);

    moveItemToPage(item.id, pageIdx);

    if (isSourceInOpenedFolder) {
      const remainingChildren = openedFolder?.children?.filter(child => child.id !== item.id) ?? [];
      if (remainingChildren.length <= 1) {
        setOpenedFolder(null);
      }
    }

    setContextMenu(null);
    scrollToPage(pageIdx);
  }, [moveItemToPage, openedFolder, scrollToPage]);

  // --- Touch event handlers ---
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Don't interfere with drag-and-drop
    if (activeId) return;
    // Don't start swipe if touching the add-button, let its click fire normally
    const target = e.target as HTMLElement;
    if (target.closest('[data-add-button]')) return;
    const touch = e.touches[0];
    swipeRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      currentX: touch.clientX,
      isDragging: true,
      isHorizontal: null,
    };
    document.body.classList.add('desktop-page-swiping');
    setPagesTrackTransition(false);
  }, [activeId, setPagesTrackTransition]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const s = swipeRef.current;
    if (!s.isDragging || activeId) return;

    const touch = e.touches[0];
    const diffX = touch.clientX - s.startX;
    const diffY = touch.clientY - s.startY;

    // Decide direction lock after 10px movement
    if (s.isHorizontal === null) {
      if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
        s.isHorizontal = Math.abs(diffX) > Math.abs(diffY);
      }
      if (!s.isHorizontal) return;
    }
    if (!s.isHorizontal) return;

    s.currentX = touch.clientX;
    const baseOffset = -currentPage * containerWidth;
    let delta = diffX;

    // Rubber-band effect at edges (iOS style damping)
    if (
      (currentPage === 0 && delta > 0) ||
      (currentPage === totalPages - 1 && delta < 0)
    ) {
      delta = delta * 0.3; // damping factor
    }

    schedulePageOffset(baseOffset + delta);
  }, [activeId, currentPage, containerWidth, totalPages, schedulePageOffset]);

  const handleTouchEnd = useCallback(() => {
    const s = swipeRef.current;
    if (!s.isDragging || activeId) return;
    s.isDragging = false;

    // If no horizontal swipe was detected (tap or vertical scroll),
    // just snap back and let the browser fire the native click event.
    if (!s.isHorizontal) {
      document.body.classList.remove('desktop-page-swiping');
      setPagesTrackTransition(true);
      writePageOffset(-currentPage * containerWidth);
      return;
    }

    const diffX = s.currentX - s.startX;
    const elapsed = Date.now() - s.startTime;
    const velocity = Math.abs(diffX) / Math.max(elapsed, 1); // px/ms

    // Thresholds for page change
    const DISTANCE_THRESHOLD = containerWidth * 0.2; // 20% of page width
    const VELOCITY_THRESHOLD = 0.3; // px/ms (fast flick)

    let targetPage = currentPage;
    if (Math.abs(diffX) > DISTANCE_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
      if (diffX < 0) {
        targetPage = Math.min(currentPage + 1, totalPages - 1);
      } else {
        targetPage = Math.max(currentPage - 1, 0);
      }
    }

    scrollToPage(targetPage);
  }, [activeId, currentPage, containerWidth, totalPages, scrollToPage, setPagesTrackTransition, writePageOffset]);

  // --- Mouse event handlers (for desktop trackpad / mouse drag) ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (activeId) return;
    // Only left mouse button
    if (e.button !== 0) return;
    // Don't start swipe if clicking on an interactive element
    const target = e.target as HTMLElement;
    if (target.closest('[data-desktop-icon]') || target.closest('[data-add-button]') || target.closest('button') || target.closest('a')) return;

    // Prevent browser native text/element selection (blue highlight) during drag
    e.preventDefault();

    swipeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startTime: Date.now(),
      currentX: e.clientX,
      isDragging: true,
      isHorizontal: null,
    };
    document.body.classList.add('desktop-page-swiping');
    setPagesTrackTransition(false);
  }, [activeId, setPagesTrackTransition]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const s = swipeRef.current;
    if (!s.isDragging || activeId) return;

    const diffX = e.clientX - s.startX;
    const diffY = e.clientY - s.startY;

    if (s.isHorizontal === null) {
      if (Math.abs(diffX) > 5 || Math.abs(diffY) > 5) {
        s.isHorizontal = Math.abs(diffX) > Math.abs(diffY);
      }
      if (!s.isHorizontal) return;
    }
    if (!s.isHorizontal) return;

    // Prevent selection during horizontal swipe
    e.preventDefault();

    s.currentX = e.clientX;
    const baseOffset = -currentPage * containerWidth;
    let delta = diffX;

    if (
      (currentPage === 0 && delta > 0) ||
      (currentPage === totalPages - 1 && delta < 0)
    ) {
      delta = delta * 0.3;
    }

    schedulePageOffset(baseOffset + delta);
  }, [activeId, currentPage, containerWidth, totalPages, schedulePageOffset]);

  const handleMouseUp = useCallback(() => {
    const s = swipeRef.current;
    if (!s.isDragging || activeId) return;
    s.isDragging = false;

    if (!s.isHorizontal) {
      document.body.classList.remove('desktop-page-swiping');
      setPagesTrackTransition(true);
      writePageOffset(-currentPage * containerWidth);
      return;
    }

    const diffX = s.currentX - s.startX;
    const elapsed = Date.now() - s.startTime;
    const velocity = Math.abs(diffX) / Math.max(elapsed, 1);

    const DISTANCE_THRESHOLD = containerWidth * 0.2;
    const VELOCITY_THRESHOLD = 0.3;

    let targetPage = currentPage;
    if (Math.abs(diffX) > DISTANCE_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
      if (diffX < 0) {
        targetPage = Math.min(currentPage + 1, totalPages - 1);
      } else {
        targetPage = Math.max(currentPage - 1, 0);
      }
    }

    scrollToPage(targetPage);
  }, [activeId, currentPage, containerWidth, totalPages, scrollToPage, setPagesTrackTransition, writePageOffset]);

  // Sync offset when currentPage or containerWidth changes (e.g. on resize)
  useEffect(() => {
    setPagesTrackTransition(true);
    writePageOffset(-currentPage * containerWidth);
  }, [containerWidth, currentPage, setPagesTrackTransition, writePageOffset]);

  // Clamp currentPage when total pages shrink
  useEffect(() => {
    if (currentPage >= totalPages && totalPages > 0) {
      scrollToPage(totalPages - 1);
    }
  }, [totalPages, currentPage, scrollToPage]);

  const isLocalSearchActive = (searchMode !== 'web' && searchQuery.trim() !== '');

  // IDs for sortable contexts
  const pageItemIds = useMemo(() => displayPages.map(page => page.map(item => item.id)), [displayPages]);
  const dockItemIds = useMemo(() => layout.dock.map(item => item.id), [layout.dock]);
  const folderItemIds = useMemo(() => openedFolder?.children?.map(item => item.id) ?? [], [openedFolder]);

  // --- Adaptive Dock sizing ---
  // On mobile (< 768px): icons keep original size; Dock is horizontally scrollable.
  // On desktop (≥ 768px): scale down icon size + gap to fit (existing behaviour).
  const dockAdaptive = useMemo(() => {
    const count = layout.dock.length;
    const isMobile = containerWidth > 0 && containerWidth < 768;

    // Base values
    const baseIconSize = isMobile ? 56 : 60;
    const baseGap = isMobile ? 20 : 24;
    const basePx = isMobile ? 20 : 28; // horizontal padding
    const basePy = isMobile ? 10 : 12; // vertical padding

    if (count <= 4) {
      return { iconSize: 0, gap: 0, px: 0, py: 0, useAdaptive: false, scrollable: false };
    }

    const availableWidth = (containerWidth || window.innerWidth) - 32;
    const neededWidth = count * baseIconSize + (count - 1) * baseGap + 2 * basePx;

    if (neededWidth <= availableWidth) {
      return { iconSize: 0, gap: 0, px: 0, py: 0, useAdaptive: false, scrollable: false };
    }

    // --- Mobile: allow horizontal scroll instead of shrinking ---
    if (isMobile) {
      return { iconSize: 0, gap: 0, px: 0, py: 0, useAdaptive: false, scrollable: true };
    }

    // --- Desktop: scale down (existing logic) ---
    const ratio = availableWidth / neededWidth;
    const minIconSize = 42;
    const minGap = 10;
    const minPx = 14;

    const minNeededWidth = count * minIconSize + (count - 1) * minGap + 2 * minPx;
    if (minNeededWidth > availableWidth) {
      return {
        iconSize: minIconSize,
        gap: minGap,
        px: minPx,
        py: 8,
        useAdaptive: true,
        scrollable: true,
      };
    }

    const scaledIconSize = Math.max(minIconSize, Math.round(baseIconSize * ratio));
    const scaledGap = Math.max(minGap, Math.round(baseGap * ratio));
    const scaledPx = Math.max(minPx, Math.round(basePx * ratio));
    const scaledPy = Math.max(8, Math.round(basePy * ratio));

    return {
      iconSize: scaledIconSize,
      gap: scaledGap,
      px: scaledPx,
      py: scaledPy,
      useAdaptive: true,
      scrollable: false,
    };
  }, [layout.dock.length, containerWidth]);

  // For the Add (+) icon
  const AddButton: React.FC<{ pageIdx?: number; folderId?: string }> = ({ pageIdx, folderId }) => (
    <div
      className="flex flex-col items-center w-[80px] group"
      data-add-button="true"
      onClick={() => openAddModal(pageIdx, folderId)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!folderId) {
          setContextMenu(null);
          setBlankContextMenu({ x: e.clientX, y: e.clientY });
        }
      }}
    >
      <div className="w-[56px] h-[56px] md:w-[60px] md:h-[60px] rounded-[18px] bg-white/[0.06] border-2 border-dashed border-white/15 flex items-center justify-center transition-[transform,background-color,border-color] duration-300 transform group-hover:scale-110 group-active:scale-95 group-hover:bg-white/10 group-hover:border-white/30 cursor-pointer">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/30 group-hover:text-white/70 transition-colors">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
      <span className="mt-1 text-[11px] font-medium text-white/30 group-hover:text-white/70 tracking-wide transition-colors">
        {t('desktop.addLink')}
      </span>
    </div>
  );

  // Keep openedFolder in sync with layout changes
  useEffect(() => {
    if (openedFolder) {
      const updated = findItemById(openedFolder.id);
      if (updated && updated.type === 'folder') {
        setOpenedFolder(updated);
      } else {
        setOpenedFolder(null);
      }
    }
  }, [layout, openedFolder?.id, findItemById]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
    <div
      className="w-full h-full flex flex-col overflow-hidden relative"
      onContextMenu={(e) => {
        // Right-click on blank area — show desktop context menu
        // Skip if any modal/popup is open — prevent context menu from appearing on top of modals
        if (
          isSettingsOpen || isAuthOpen || isProfileOpen ||
          isBookmarkBrowserOpen || isHistoryBrowserOpen ||
          isExploreOpen || isItToolsOpen || isAddWidgetOpen ||
          isAddModalOpen || !!stickyNoteItem || !!editingWidget || !!calendarDetailItem
        ) {
          e.preventDefault();
          return;
        }
        // Skip if the click landed on an icon, button, input, or interactive element
        const target = e.target as HTMLElement;
        if (
          target.closest('[data-desktop-icon]') ||
          target.closest('[data-add-button]') ||
          target.closest('button') ||
          target.closest('input') ||
          target.closest('a')
        ) return;
        e.preventDefault();
        setBlankContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      
      {/* 1. Search Bar */}
      <div className="desktop-search-layer absolute top-0 left-0 right-0 z-30 flex justify-center pt-16 md:pt-20 px-6 pointer-events-none">
        <div className="w-full max-w-[580px] pointer-events-auto">
          <form onSubmit={handleSearchSubmit} className="relative group flex items-center">
            {isDropdownOpen && (
              <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)}></div>
            )}
            <div className="absolute inset-y-0 left-2 z-50 flex items-center">
              <button 
                type="button" 
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="p-2 ml-0.5 hover:bg-white/10 rounded-full transition-colors flex items-center justify-center cursor-pointer opacity-80 hover:opacity-100"
              >
                {SEARCH_MODES.find(m => m.id === searchMode)?.icon}
              </button>
              {isDropdownOpen && (
                <div className="absolute top-12 left-0 w-[200px] bg-[#1a1c1a]/80 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-2 z-50 flex flex-col gap-1 fade-in">
                  {SEARCH_MODES.map(mode => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        setSearchMode(mode.id as SearchMode);
                        setIsDropdownOpen(false);
                        if (searchInputRef.current) searchInputRef.current.focus();
                      }}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${searchMode === mode.id ? 'bg-white/15 shadow-md shadow-black/20 text-white' : 'hover:bg-white/5 text-white/80'}`}
                    >
                      <div className="shrink-0">{mode.icon}</div>
                      <span className="text-[13px] font-medium tracking-wide">{getSearchModeLabel(mode.id as SearchMode)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder={
                searchMode === 'web' ? t('desktop.searchWeb') :
                searchMode === 'bookmarks' ? t('desktop.searchBookmarks') :
                searchMode === 'history' ? t('desktop.searchHistory') :
                t('desktop.searchDesktop')
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/30 backdrop-blur-xl border border-white/10 hover:border-white/20 hover:bg-black/40 focus:bg-black/50 focus:border-white/30 rounded-full py-3 md:py-3.5 pl-14 pr-10 text-[14px] font-medium text-white shadow-2xl outline-none placeholder-white/40 transition-colors duration-300"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                className="absolute right-3 inset-y-0 flex items-center justify-center text-white/40 hover:text-white/80 transition-colors cursor-pointer"
                aria-label="Clear search"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </form>
        </div>
      </div>

      {/* 2. Pages Area */}
      <div 
        className="desktop-pages-area flex-1 overflow-hidden pt-36 md:pt-56 pb-28 md:pb-32"
        onDoubleClick={(e) => {
          // Only trigger on blank area (the container itself or the page wrapper)
          const target = e.target as HTMLElement;
          if (target.closest('[data-desktop-icon]') || target.closest('[data-add-button]') || target.closest('.widget-container')) return;
          setIsExploreOpen(true);
        }}
      >
        {isLocalSearchActive ? (
          <div className="h-full overflow-y-auto no-scrollbar pt-4 flex justify-center">
            {(searchMode === 'bookmarks' || searchMode === 'history') ? (
              /* 书签/历史记录搜索结果 - 列表展示 */
              <div className="w-full max-w-2xl px-4 md:px-6">
                {searchResults.length > 0 ? (
                  <div className="flex flex-col gap-1 w-full backdrop-blur-xl bg-black/20 rounded-2xl p-2 border border-white/10 shadow-lg">
                    {searchResults.map(item => (
                      <div
                        key={item.id}
                        className="bookmark-row flex items-center px-3 md:px-4 py-2 md:py-2.5 rounded-xl hover:bg-white/[0.08] transition-all cursor-pointer border border-transparent hover:border-white/5 active:scale-[0.99]"
                        onClick={() => handleItemClick(item)}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0 shadow-sm relative overflow-hidden">
                            {item.url ? (
                              <FaviconImg
                                url={item.url}
                                sz={64}
                                preferChromeFavicon
                                alt=""
                                className="w-4.5 h-4.5 object-contain"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                  e.currentTarget.parentElement!.innerHTML = '<span class="text-[10px]">🌐</span>';
                                }}
                              />
                            ) : (
                              <span className="text-[10px]">🌐</span>
                            )}
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[13px] font-semibold text-white/90 truncate bookmark-title transition-colors">
                              {item.title || (item.url ? new URL(item.url).hostname : t(searchMode === 'bookmarks' ? 'bookmark.untitled' : 'history.untitled'))}
                            </span>
                            {item.url && (
                              <span className="text-[11px] text-white/30 truncate mt-0.5">
                                {item.url}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 复制链接按钮 */}
                        <div className="bookmark-actions flex items-center gap-1.5 shrink-0 ml-2">
                          {item.url && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(item.url!);
                              }}
                              className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/20 text-white/50 hover:text-white flex items-center justify-center transition-colors"
                              title={t(searchMode === 'bookmarks' ? 'bookmark.copyUrl' : 'history.copyUrl')}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="opacity-60 text-center mt-20 fade-in">
                    <p className="text-4xl mb-4">📭</p>
                    <p>{t('desktop.noResults')} "{searchQuery}"</p>
                  </div>
                )}
              </div>
            ) : (
              /* 桌面搜索结果 - 图标网格展示 */
              <div
                className="desktop-icon-grid grid content-start w-full md:px-4"
                style={{ justifyContent: 'center', justifyItems: 'center' }}
              >
                {searchResults.length > 0 ? (
                  searchResults.map(item => (
                    <div key={item.id} className="cursor-pointer group" onClick={() => handleItemClick(item)}>
                      <div className="group-hover:scale-110 group-active:scale-95 transition-transform duration-200">
                        <DesktopIconContent item={item} />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full opacity-60 text-center mt-20 fade-in">
                    <p className="text-4xl mb-4">📭</p>
                    <p>{t('desktop.noResults')} "{searchQuery}"</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div 
            ref={pagesContainerRef}
            className="h-full overflow-hidden relative select-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div
              ref={setPagesTrackNode}
              className="desktop-pages-track h-full flex"
              style={{
                width: `${totalPages * 100}%`,
                '--desktop-page-offset': `${-currentPage * containerWidth}px`,
              } as React.CSSProperties}
            >
            {displayPages.map((page, pageIdx) => (
              <PageDropZone key={pageIdx} pageIdx={pageIdx} totalPages={totalPages}>
                <SortableContext items={pageItemIds[pageIdx] || []} strategy={rectSortingStrategy}>
                  <div
                    className="desktop-icon-grid grid content-start w-full md:px-4"
                    style={{ justifyContent: 'center', justifyItems: 'center' }}
                  >
                    {page.map(item => (
                      item.type === 'widget' ? (
                        <SortableWidget
                          key={item.id}
                          item={item}
                          onClick={handleItemClick}
                          onContextMenu={(e, i) => handleContextMenu(e, i, false)}
                          activeId={activeId}
                        />
                      ) : (
                        <SortableDesktopIcon 
                          key={item.id} 
                          item={item} 
                          onClick={handleItemClick} 
                          onContextMenu={(e, i) => handleContextMenu(e, i, false)}
                          isDraggedOver={folderDropTargetId === item.id}
                          activeId={activeId}
                          isFolderDropPending={isFolderDropPending}
                          isDesktopGrid
                        />
                      )
                    ))}
                    <AddButton pageIdx={pageIdx} />
                  </div>
                </SortableContext>
              </PageDropZone>
            ))}
            </div>

            {/* Edge arrow buttons for PC — hover on left/right edge to reveal */}
            {totalPages > 1 && (
              <>
                {/* Left arrow */}
                {currentPage > 0 && (
                  <div
                    className="hidden md:flex absolute left-0 top-0 bottom-0 w-[48px] items-center justify-center z-10 group/arrow"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => scrollToPage(currentPage - 1)}
                  >
                    <div className="w-10 h-10 rounded-full bg-black/20 backdrop-blur-md border border-white/10 flex items-center justify-center opacity-0 group-hover/arrow:opacity-100 transition-opacity duration-300 cursor-pointer hover:bg-white/15 hover:scale-110 active:scale-95">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/70">
                        <path d="m15 18-6-6 6-6" />
                      </svg>
                    </div>
                  </div>
                )}
                {/* Right arrow */}
                {currentPage < totalPages - 1 && (
                  <div
                    className="hidden md:flex absolute right-0 top-0 bottom-0 w-[48px] items-center justify-center z-10 group/arrow"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => scrollToPage(currentPage + 1)}
                  >
                    <div className="w-10 h-10 rounded-full bg-black/20 backdrop-blur-md border border-white/10 flex items-center justify-center opacity-0 group-hover/arrow:opacity-100 transition-opacity duration-300 cursor-pointer hover:bg-white/15 hover:scale-110 active:scale-95">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/70">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* 3. Page Indicator Dots */}
      {!isLocalSearchActive && displayPages.length > 1 && (
        <div className="desktop-page-dots absolute bottom-[108px] md:bottom-[118px] left-0 right-0 z-20 flex justify-center gap-2">
          {displayPages.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollToPage(i)}
              className={`w-2 h-2 rounded-full transition-[background-color,transform] duration-300 ${currentPage === i ? 'bg-white scale-125' : 'bg-white/30 hover:bg-white/50'}`}
            />
          ))}
        </div>
      )}

      {/* 4. Dock Bar */}
      <div className="desktop-dock-bar absolute bottom-3 md:bottom-5 left-1/2 -translate-x-1/2 z-30" style={{ maxWidth: 'calc(100vw - 32px)' }}>
        <div
          className="bg-[#f5f5f5]/[0.12] backdrop-blur-xl border border-white/[0.15] rounded-[22px] md:rounded-[26px] shadow-[0_2px_30px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] transition-[padding,gap] duration-300"
        >
          <div
            className={`flex items-center ${dockAdaptive.scrollable ? 'overflow-x-auto no-scrollbar gap-5 px-5 py-2.5' : !dockAdaptive.useAdaptive ? 'gap-5 md:gap-6 px-5 md:px-7 py-2.5 md:py-3' : ''}`}
            onWheel={(e) => {
              if (dockAdaptive.scrollable && e.deltaY !== 0) {
                e.currentTarget.scrollLeft += e.deltaY;
              }
            }}
            style={dockAdaptive.useAdaptive ? {
              gap: dockAdaptive.gap,
              paddingLeft: dockAdaptive.px,
              paddingRight: dockAdaptive.px,
              paddingTop: dockAdaptive.py,
              paddingBottom: dockAdaptive.py,
            } : undefined}
          >
            <SortableContext items={dockItemIds} strategy={rectSortingStrategy}>
              {layout.dock.map(item => (
                <SortableDesktopIcon
                  key={item.id}
                  item={item}
                  onClick={handleItemClick}
                  onContextMenu={(e, i) => handleContextMenu(e, i, true)}
                  isDock
                  isDraggedOver={folderDropTargetId === item.id}
                  activeId={activeId}
                  isFolderDropPending={isFolderDropPending}
                  dockIconSize={dockAdaptive.useAdaptive ? dockAdaptive.iconSize : undefined}
                />
              ))}
            </SortableContext>
          </div>
        </div>
      </div>

      {/* 5. Settings & Lock Buttons */}
      <div className="fixed top-4 left-4 md:top-6 md:left-6 z-30 flex items-center gap-2">
        <a
          href="https://github.com/DeaglePC/CatHeadTab"
          target="_blank"
          rel="noopener noreferrer"
          className="w-10 h-10 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/15 hover:text-white transition-[background-color,color,transform] duration-300 shadow-xl hover:scale-110 active:scale-95 cursor-pointer"
          title="GitHub"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
        </a>
        <button 
          className="w-10 h-10 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/15 hover:text-white transition-[background-color,color,transform] duration-300 shadow-xl hover:scale-110 active:scale-95 cursor-pointer"
          onClick={() => setIsSettingsOpen(true)}
        >
          <SettingsIcon />
        </button>
        <button
          className="w-10 h-10 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/15 hover:text-white transition-[background-color,color,transform] duration-300 shadow-xl hover:scale-110 active:scale-95 cursor-pointer"
          onClick={() => setLocked(true)}
          title={language === 'zh' ? '锁屏' : 'Lock Screen'}
        >
          <LockIcon />
        </button>
      </div>

      {/* 6. User/Auth Button */}
      <div className="fixed top-4 right-4 md:top-6 md:right-6 z-30">
        <button 
          className={`w-10 h-10 rounded-full border flex items-center justify-center transition-[background-color,color,transform] duration-300 shadow-xl hover:scale-110 active:scale-95 cursor-pointer overflow-hidden ${jwtToken ? 'bg-[#72d565]/80 text-black border-[#72d565]' : 'bg-black/40 text-white/60 border-white/10 hover:bg-white/15 hover:text-white'}`}
          onClick={handleAuthClick}
        >
          {userProfile?.avatar_url ? (
            <img src={userProfile.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <UserAvatarIcon />
          )}
        </button>
      </div>

      {/* 7. Folder Overlay */}
      {openedFolder && (
        <FolderDropOutZone onClick={() => { setOpenedFolder(null); setIsEditingFolderName(false); }}>
          <div
            className="w-auto max-w-[90vw] flex flex-col items-start pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            {/* Folder name - outside the rounded container, at top-left */}
            <div className="pl-6 sm:pl-10 pb-5 shrink-0">
              {isEditingFolderName ? (
                <input
                  ref={folderNameInputRef}
                  type="text"
                  value={editingFolderName}
                  onChange={(e) => setEditingFolderName(e.target.value)}
                  onBlur={() => {
                    const trimmed = editingFolderName.trim();
                    if (trimmed && trimmed !== openedFolder.title) {
                      updateDesktopItem(openedFolder.id, { title: trimmed });
                    }
                    setIsEditingFolderName(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      (e.target as HTMLInputElement).blur();
                    } else if (e.key === 'Escape') {
                      setIsEditingFolderName(false);
                    }
                  }}
                  className="text-2xl sm:text-3xl font-bold text-white tracking-wide bg-transparent border-b-2 border-white/40 outline-none max-w-[400px] pb-1 placeholder-white/30"
                  placeholder={t('desktop.folderNamePlaceholder')}
                  autoFocus
                />
              ) : (
                <button
                  className="group flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => {
                    setEditingFolderName(openedFolder.title);
                    setIsEditingFolderName(true);
                    setTimeout(() => folderNameInputRef.current?.select(), 50);
                  }}
                  title={t('desktop.folderRenameHint')}
                >
                  <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-wide drop-shadow-lg">
                    {openedFolder.title}
                  </h2>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/30 group-hover:text-white/60 transition-colors shrink-0">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                  </svg>
                </button>
              )}
            </div>
            {/* Rounded container for folder content */}
            <div 
              className="w-full max-h-[75vh] bg-white/[0.12] backdrop-blur-3xl border border-white/20 rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden transform animate-scaleIn"
            >
            <div className="flex-1 overflow-y-auto w-full px-1 sm:px-6 md:px-10 lg:px-14 py-6 sm:py-10 no-scrollbar">
              <SortableContext items={folderItemIds} strategy={rectSortingStrategy}>
                <div 
                  className="folder-icon-grid grid select-none content-start"
                  style={{ maxWidth: '900px', margin: '0 auto', justifyContent: 'center', justifyItems: 'center' }}
                >
                  {openedFolder.children?.map(item => (
                    <SortableDesktopIcon
                      key={item.id} 
                      item={item} 
                      onClick={(node) => {
                        if (node.type === 'link' && node.url) openUrl(node.url, linkOpenMode);
                        else if (node.type === 'folder') setOpenedFolder(node);
                      }}
                      onContextMenu={(e, i) => handleContextMenu(e, i, false)}
                      activeId={activeId}
                      isFolderDropPending={isFolderDropPending}
                    />
                  ))}
                  <AddButton folderId={openedFolder.id} />
                  {(!openedFolder.children || openedFolder.children.length === 0) && (
                    <div className="col-span-full w-full text-center text-white/50 py-12">
                      {t('desktop.emptyFolder')}
                    </div>
                  )}
                </div>
              </SortableContext>
            </div>
            </div>

          </div>
        </FolderDropOutZone>
      )}

      {/* DragOverlay - the floating icon that follows cursor */}
      <DragOverlay dropAnimation={{
        duration: 250,
        easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
      }}>
        {activeItem ? (
          activeItem.type === 'widget' ? (
            (() => {
              const overlaySize = (activeItem.widgetSize && activeItem.widgetSize in WIDGET_SIZE_MAP)
                ? activeItem.widgetSize : 'small';
              const { cols: oCols, rows: oRows } = WIDGET_SIZE_MAP[overlaySize];
              // Match the CSS grid metrics for the current viewport, including compact mode.
              const { cellSize, gap } = getDesktopGridMetrics(window.innerWidth, window.innerHeight);
              return (
                <div style={{
                  width: oCols * cellSize + (oCols - 1) * gap,
                  height: oRows * cellSize + (oRows - 1) * gap,
                }}>
                  <DesktopWidget item={activeItem} isOverlay />
                </div>
              );
            })()
          ) : (
            <DesktopIconContent item={activeItem} isOverlay isDock={false} />
          )
        ) : null}
      </DragOverlay>

      {/* Modals (lazy-loaded) */}
      <Suspense fallback={null}>
      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} initialTab={settingsInitialTab} />}
      {isAuthOpen && <AuthModal onClose={() => setIsAuthOpen(false)} />}
      {isProfileOpen && <ProfileModal onClose={() => setIsProfileOpen(false)} />}
      {isBookmarkBrowserOpen && <BookmarkBrowser onClose={() => setIsBookmarkBrowserOpen(false)} />}
      {isHistoryBrowserOpen && <HistoryBrowser onClose={() => setIsHistoryBrowserOpen(false)} />}
      {isExploreOpen && <ExploreWorld onClose={() => setIsExploreOpen(false)} />}
      {isItToolsOpen && <ItToolsModal onClose={() => setIsItToolsOpen(false)} />}
      {stickyNoteItem && <StickyNoteModal onClose={() => setStickyNoteItem(null)} item={stickyNoteItem} />}
      {isAiAgentOpen && <AiAgentModal onClose={() => setIsAiAgentOpen(false)} />}
      {trendingModalType && <TrendingModal type={trendingModalType} options={trendingModalOptions} onClose={() => { setTrendingModalType(null); setTrendingModalOptions(null); }} />}
      {calendarDetailItem && (
        <CalendarDetailModal
          onClose={() => setCalendarDetailItem(null)}
          onEdit={() => {
            if (calendarDetailItem) setEditingWidget(calendarDetailItem);
            setCalendarDetailItem(null);
          }}
        />
      )}
      {isAddWidgetOpen && <AddWidgetModal onClose={() => setIsAddWidgetOpen(false)} pageIndex={currentPage} />}
      {editingWidget && <AddWidgetModal onClose={() => setEditingWidget(null)} editItem={editingWidget} />}
      {isAddModalOpen && <AddItemModal 
        onClose={() => { setIsAddModalOpen(false); setEditingItem(null); setAddToFolderId(undefined); setAddToPageIndex(undefined); }}
        editItem={editingItem}
        parentFolderId={addToFolderId}
        pageIndex={addToPageIndex}
        onSwitchToWidget={() => {
          setIsAddModalOpen(false);
          setEditingItem(null);
          setAddToFolderId(undefined);
          setAddToPageIndex(undefined);
          setIsAddWidgetOpen(true);
        }}
      />}
      </Suspense>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div 
            ref={contextMenuRef}
            className="fixed z-[210] context-menu-glass rounded-[14px] py-1.5 min-w-[190px] max-h-[70vh] overflow-y-auto no-scrollbar animate-scaleIn"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            {/* Edit button — not for app types */}
            {contextMenu.item.type !== 'app' && (
              contextMenu.item.type === 'widget' ? (
                <button 
                  className="w-full text-left px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.12] flex items-center gap-3 transition-colors rounded-lg mx-0"
                  onClick={() => { setEditingWidget(contextMenu.item); setContextMenu(null); }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                  {t('widget.editWidget')}
                </button>
              ) : (
                <>
                  <button 
                    className="w-full text-left px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.12] flex items-center gap-3 transition-colors rounded-lg mx-0"
                    onClick={() => handleEdit(contextMenu.item)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                    {t('desktop.editItem')}
                  </button>
                </>
              )
            )}
            
            {/* Move to page */}
            {displayPages.length > 1 && (
              <>
                <div className="h-[1px] bg-white/[0.08] mx-2.5 my-1" />
                <div className="px-4 pt-1.5 pb-1 text-[11px] uppercase tracking-wide text-white/35">
                  {t('desktop.moveToPage')}
                </div>
                {displayPages.map((_, pageIdx) => {
                  if (getDirectPageIndex(contextMenu.item.id) === pageIdx) return null;
                  return (
                    <button
                      key={pageIdx}
                      className="w-full text-left px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.12] flex items-center gap-3 transition-colors rounded-lg mx-0"
                      onClick={() => handleMoveToPage(contextMenu.item, pageIdx)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="16" rx="2" />
                        <path d="M8 4v16" />
                      </svg>
                      <span>{t('desktop.moveToPageNumber', { page: String(pageIdx + 1) })}</span>
                    </button>
                  );
                })}
              </>
            )}

            {/* Move to/from Dock — not for widget types */}
            {contextMenu.item.type !== 'widget' && (
              contextMenu.inDock ? (
                <button 
                  className="w-full text-left px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.12] flex items-center gap-3 transition-colors rounded-lg mx-0"
                  onClick={() => { moveItemFromDock(contextMenu.item.id, currentPage); setContextMenu(null); }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
                  {t('desktop.removeFromDock')}
                </button>
              ) : (
                <button 
                  className={`w-full text-left px-4 py-2.5 text-[13px] flex items-center gap-3 transition-colors rounded-lg mx-0 ${layout.dock.length >= MAX_DOCK_ITEMS ? 'text-white/30 cursor-not-allowed' : 'text-white/90 hover:bg-white/[0.12]'}`}
                  onClick={() => { if (layout.dock.length < MAX_DOCK_ITEMS) { moveItemToDock(contextMenu.item.id); setContextMenu(null); } }}
                  disabled={layout.dock.length >= MAX_DOCK_ITEMS}
                  title={layout.dock.length >= MAX_DOCK_ITEMS ? `Dock is full (max ${MAX_DOCK_ITEMS})` : undefined}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>
                  {t('desktop.moveToDock')}{layout.dock.length >= MAX_DOCK_ITEMS ? ` (${MAX_DOCK_ITEMS}/${MAX_DOCK_ITEMS})` : ''}
                </button>
              )
            )}

            {/* Delete — for non-app types (includes widget) */}
            {contextMenu.item.type !== 'app' && (
              <>
                {/* Only show divider when there are items above (edit or move-to-dock buttons) */}
                <div className="h-[1px] bg-white/[0.08] mx-2.5 my-1" />
                <button 
                  className="w-full text-left px-4 py-2.5 text-[13px] text-red-400 hover:bg-red-500/[0.12] flex items-center gap-3 transition-colors rounded-lg mx-0"
                  onClick={() => handleDelete(contextMenu.item)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  {contextMenu.item.type === 'widget' ? t('widget.deleteWidget') : t('desktop.deleteItem')}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Blank Area Context Menu */}
      {blankContextMenu && (
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => setBlankContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setBlankContextMenu(null); }} />
          <div 
            ref={blankContextMenuRef}
            className="fixed z-[210] context-menu-glass rounded-[14px] py-1.5 min-w-[200px] animate-scaleIn"
            style={{ left: blankContextMenu.x, top: blankContextMenu.y }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <button 
              className="w-full text-left px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.12] flex items-center gap-3 transition-colors rounded-lg mx-0"
              onClick={() => { setBlankContextMenu(null); openAddModal(currentPage, undefined); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
              {t('desktop.addLink')}
            </button>
            <button 
              className="w-full text-left px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.12] flex items-center gap-3 transition-colors rounded-lg mx-0"
              onClick={() => { setBlankContextMenu(null); setIsAddModalOpen(true); setAddToPageIndex(currentPage); setEditingItem({ id: '', type: 'folder', title: '' }); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              {t('desktop.addFolder')}
            </button>
            <button 
              className="w-full text-left px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.12] flex items-center gap-3 transition-colors rounded-lg mx-0"
              onClick={() => { setBlankContextMenu(null); setIsAddWidgetOpen(true); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
              {t('desktop.addWidget')}
            </button>
            <div className="h-[1px] bg-white/[0.08] mx-2.5 my-1" />
            <button 
              className="w-full text-left px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.12] flex items-center gap-3 transition-colors rounded-lg mx-0"
              onClick={() => { setBlankContextMenu(null); setIsBookmarkBrowserOpen(true); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
              {t('desktop.openBookmarks')}
            </button>
            <button 
              className="w-full text-left px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.12] flex items-center gap-3 transition-colors rounded-lg mx-0"
              onClick={() => { setBlankContextMenu(null); setIsHistoryBrowserOpen(true); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              {t('desktop.openHistory')}
            </button>
            <button 
              className="w-full text-left px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.12] flex items-center gap-3 transition-colors rounded-lg mx-0"
              onClick={() => { setBlankContextMenu(null); setIsExploreOpen(true); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>
              {t('explore.title')}
            </button>
            <div className="h-[1px] bg-white/[0.08] mx-2.5 my-1" />
            <button 
              className="w-full text-left px-4 py-2.5 text-[13px] text-white/90 hover:bg-white/[0.12] flex items-center gap-3 transition-colors rounded-lg mx-0"
              onClick={() => { setBlankContextMenu(null); setSettingsInitialTab('wallpaper'); setIsSettingsOpen(true); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M2 10h20"/><path d="M10 2v8"/></svg>
              {t('desktop.wallpaperSettings')}
            </button>
          </div>
        </>
      )}

      {/* Animations */}
      <style dangerouslySetInnerHTML={{__html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .animate-fadeIn { animation: fadeIn 0.25s ease-out forwards; }
        .animate-scaleIn { animation: scaleIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .fade-in { animation: fadeIn 0.15s ease-out forwards; }
      `}} />
    </div>
    </DndContext>
  );
};
