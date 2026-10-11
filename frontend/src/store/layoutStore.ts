import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import client from '../api/client';
import { useConfigStore, customStorage } from './configStore';
import { getRawBlob, compressImageToWebP, saveImageBlob } from '../utils/imageStore';

const triggerAutoSync = () => {
  const { jwtToken, markLocalModified } = useConfigStore.getState();
  markLocalModified();
  if (jwtToken) {
    useLayoutStore.getState().syncLayoutOnly().catch(err => {
      console.error('Failed to auto-sync layout to cloud', err);
    });
  }
};

export type DesktopItemType = 'app' | 'link' | 'folder' | 'widget';

/** Widget types supported by the system. */
export type WidgetType = 'calendar' | 'weather' | 'countdown' | 'reminders' | 'systemMonitor' | 'clock' | 'itTools' | 'stickyNote' | 'stock' | 'exchangeRate' | 'calculator' | 'aiAgent' | 'githubTrending' | 'bilibiliHot' | 'xiaohongshuHot' | 'weiboHot' | 'bbcNews';

/** Widget size presets (columns × rows in the desktop grid). */
export type WidgetSize = 'small' | 'medium' | 'large' | 'tall' | 'xlarge';

/** Maps widget size to grid span dimensions. */
export const WIDGET_SIZE_MAP: Record<WidgetSize, { cols: number; rows: number }> = {
  small: { cols: 2, rows: 1 },
  medium: { cols: 2, rows: 2 },
  large: { cols: 4, rows: 2 },
  tall: { cols: 2, rows: 4 },
  xlarge: { cols: 4, rows: 4 },
};

/** Configuration specific to each widget type. */
export interface CalendarWidgetConfig {
  widgetType: 'calendar';
}

export interface WeatherWidgetConfig {
  widgetType: 'weather';
  /** City name for weather lookup; empty = auto-detect via IP geolocation. */
  city?: string;
  /** Temperature unit: 'C' for Celsius, 'F' for Fahrenheit. */
  unit?: 'C' | 'F';
}

export interface CountdownWidgetConfig {
  widgetType: 'countdown';
  /** ISO 8601 date string for the target date. */
  targetDate: string;
  /** Display label for the countdown event. */
  eventName: string;
}

export interface ReminderItem {
  id: string;
  title: string;
  /** Start of the countdown; older reminders fall back to createdAt. */
  startAt?: string;
  dueAt: string;
  note: string;
  createdAt: string;
  completedAt?: string;
  showProgress: boolean;
}

export interface RemindersWidgetConfig {
  widgetType: 'reminders';
  items: ReminderItem[];
}

export interface SystemMonitorWidgetConfig {
  widgetType: 'systemMonitor';
}

export interface ClockWidgetConfig {
  widgetType: 'clock';
  /** IANA timezone identifier (e.g. "America/New_York"). Empty/undefined = local timezone. */
  timezone?: string;
}

export interface ItToolsWidgetConfig {
  widgetType: 'itTools';
}

export interface StickyNoteWidgetConfig {
  widgetType: 'stickyNote';
  /** The note content (plain text). */
  content?: string;
  /** Background color preset key. */
  color?: 'yellow' | 'pink' | 'green' | 'blue' | 'purple' | 'orange';
}

export const STICKY_NOTE_CONTENT_MAX_LENGTH = 1000;

export function countTextCharacters(value: string): number {
  return Array.from(value).length;
}

export function clampStickyNoteContent(value: string): string {
  const chars = Array.from(value);
  if (chars.length <= STICKY_NOTE_CONTENT_MAX_LENGTH) return value;
  return chars.slice(0, STICKY_NOTE_CONTENT_MAX_LENGTH).join('');
}

/** Stock market type. */
export type StockMarket = 'US' | 'HK' | 'CN';

export interface StockItem {
  /** Yahoo Finance symbol (e.g. "AAPL", "0700.HK", "600519.SS"). */
  symbol: string;
  /** Display name (e.g. "Apple", "腾讯", "贵州茅台"). */
  name: string;
  /** Market type for display grouping. */
  market: StockMarket;
}

export interface StockWidgetConfig {
  widgetType: 'stock';
  /** User's watchlist of stock symbols. */
  watchlist?: StockItem[];
}

/** Exchange rate currency pair. */
export interface ExchangeRatePair {
  /** Base currency code (e.g. "USD"). */
  from: string;
  /** Target currency code (e.g. "CNY"). */
  to: string;
}

export interface ExchangeRateWidgetConfig {
  widgetType: 'exchangeRate';
  /** User's selected currency pairs. */
  pairs?: ExchangeRatePair[];
}

export interface CalculatorWidgetConfig {
  widgetType: 'calculator';
}

export interface AiAgentWidgetConfig {
  widgetType: 'aiAgent';
}

export interface GithubTrendingWidgetConfig {
  widgetType: 'githubTrending';
  language?: string;
  since?: string;
}

export interface BilibiliHotWidgetConfig {
  widgetType: 'bilibiliHot';
}

export interface XiaohongshuHotWidgetConfig {
  widgetType: 'xiaohongshuHot';
}

export interface WeiboHotWidgetConfig {
  widgetType: 'weiboHot';
}

export interface BBCNewsWidgetConfig {
  widgetType: 'bbcNews';
}

export type WidgetConfig = CalendarWidgetConfig | WeatherWidgetConfig | CountdownWidgetConfig | RemindersWidgetConfig | SystemMonitorWidgetConfig | ClockWidgetConfig | ItToolsWidgetConfig | StickyNoteWidgetConfig | StockWidgetConfig | ExchangeRateWidgetConfig | CalculatorWidgetConfig | AiAgentWidgetConfig | GithubTrendingWidgetConfig | BilibiliHotWidgetConfig | XiaohongshuHotWidgetConfig | WeiboHotWidgetConfig | BBCNewsWidgetConfig;

export interface DesktopItem {
  id: string;
  type: DesktopItemType;
  title: string;
  url?: string;
  icon?: string;
  iconColor?: string;
  children?: DesktopItem[];
  /** Widget-specific fields (only present when type === 'widget'). */
  widgetType?: WidgetType;
  widgetSize?: WidgetSize;
  widgetConfig?: WidgetConfig;
  /** Widget opacity (0–100, default 100 = fully opaque). */
  widgetOpacity?: number;
}

export interface DesktopLayout {
  pages: DesktopItem[][];
  dock: DesktopItem[];
}

interface LayoutState {
  layout: DesktopLayout;
  loading: boolean;
  error: string | null;
  /** 布局快照历史，用于回滚操作。最多保留 10 个快照。 */
  layoutSnapshots: DesktopLayout[];

  // Convenience getters
  get pages(): DesktopItem[][];
  get dock(): DesktopItem[];

  // Local mutations
  setLayout: (layout: DesktopLayout) => void;
  /**
   * Add a desktop item. Returns the existing duplicate item if one is found,
   * or null if the item was added successfully.
   */
  addDesktopItem: (item: DesktopItem, pageIndex?: number, parentFolderId?: string) => DesktopItem | null;
  /** Check if a URL already exists on the desktop or inside a specific folder. */
  checkDuplicate: (url: string, parentFolderId?: string) => DesktopItem | null;
  removeDesktopItem: (id: string) => void;
  updateDesktopItem: (id: string, updates: Partial<DesktopItem>) => void;
  moveItemToDock: (id: string) => void;
  moveItemFromDock: (id: string, pageIndex?: number) => void;
  reorderDesktopItem: (sourceId: string, targetId: string) => void;
  moveItemToFolder: (sourceId: string, folderId: string) => void;
  moveItemToPage: (sourceId: string, pageIndex: number, insertIndex?: number) => void;
  reorderInsideFolder: (folderId: string, sourceId: string, targetId: string) => void;
  moveItemOutOfFolder: (sourceId: string, folderId: string, pageIndex?: number) => void;
  /** Merge two items into a new folder at the target's position. */
  mergeItemsToNewFolder: (sourceId: string, targetId: string) => void;

  /** 保存当前布局快照（在批量操作前调用） */
  saveSnapshot: () => void;
  /** 回滚到上一个布局快照 */
  rollbackLayout: () => boolean;
  /** 是否有可回滚的快照 */
  get canRollback(): boolean;
  /** 恢复为默认布局（保存快照后重置） */
  resetToDefault: () => void;

  // Widget Actions
  /** Add a widget to a specific page. */
  addWidget: (widgetType: WidgetType, widgetSize: WidgetSize, config: WidgetConfig, pageIndex?: number) => void;
  /** Update a widget's configuration (e.g. countdown target date). */
  updateWidgetConfig: (id: string, config: Partial<WidgetConfig>) => void;
  
  // Cloud Sync Actions
  /** Sync only layout (pages + dock) to cloud. Called on every layout change. */
  syncLayoutOnly: () => Promise<void>;
  /** Sync only wallpaper/preferences to cloud. Called when background changes. */
  syncPreferencesToCloud: () => Promise<void>;
  /** Sync both layout and preferences to cloud (full sync). */
  uploadLayoutToCloud: () => Promise<void>;
  pullLayoutFromCloud: () => Promise<void>;
  mergeLayoutWithCloud: () => Promise<void>;
}

export const MAX_DOCK_ITEMS = 15;

const defaultDock: DesktopItem[] = [
  { id: 'app-bookmarks', type: 'app', title: 'Bookmarks', icon: '🔖' },
  { id: 'app-history', type: 'app', title: 'History', icon: '🕐' },
  { id: 'app-explore', type: 'app', title: 'Explore', icon: '🌍' },
];

// --- Default desktop items for first-time users ---
// Includes popular sites and three 2×2 widgets (clock, calendar, weather).
// These only apply when there is no persisted layout data.
const defaultDesktopItems: DesktopItem[] = [
  // Row 1: Widgets (each occupies 2 cols × 2 rows)
  {
    id: 'widget-weather-default',
    type: 'widget',
    title: 'Weather',
    widgetType: 'weather',
    widgetSize: 'medium',
    widgetConfig: { widgetType: 'weather' },
  },
  {
    id: 'widget-calendar-default',
    type: 'widget',
    title: 'Calendar',
    widgetType: 'calendar',
    widgetSize: 'medium',
    widgetConfig: { widgetType: 'calendar' },
  },
  {
    id: 'widget-clock-default',
    type: 'widget',
    title: 'Clock',
    widgetType: 'clock',
    widgetSize: 'medium',
    widgetConfig: { widgetType: 'clock' },
  },
  {
    id: 'widget-stickyNote-default',
    type: 'widget',
    title: 'StickyNote',
    widgetType: 'stickyNote',
    widgetSize: 'medium',
    widgetConfig: { widgetType: 'stickyNote', content: '', color: 'blue' },
  },
  {
    id: 'widget-weibo-hot-default',
    type: 'widget',
    title: 'Weibo Hot',
    widgetType: 'weiboHot',
    widgetSize: 'medium',
    widgetConfig: { widgetType: 'weiboHot' },
  },
  {
    id: 'widget-github-trending-default',
    type: 'widget',
    title: 'GitHub Trending',
    widgetType: 'githubTrending',
    widgetSize: 'tall',
    widgetConfig: { widgetType: 'githubTrending' },
  },
  {
    id: 'widget-ai-agent-default',
    type: 'widget',
    title: 'AI Assistant',
    widgetType: 'aiAgent',
    widgetSize: 'small',
    widgetConfig: { widgetType: 'aiAgent' },
  },
  // Popular sites — a curated selection of widely-used websites
  { id: 'default-google', type: 'link', title: 'Google', url: 'https://www.google.com', icon: '' },
  { id: 'default-youtube', type: 'link', title: 'YouTube', url: 'https://www.youtube.com', icon: '' },
  { id: 'default-github', type: 'link', title: 'GitHub', url: 'https://github.com', icon: '' },
  { id: 'default-bilibili', type: 'link', title: 'Bilibili', url: 'https://www.bilibili.com', icon: '' },
  { id: 'default-chatgpt', type: 'link', title: 'ChatGPT', url: 'https://chat.openai.com', icon: '' },
  { id: 'default-deepseek', type: 'link', title: 'DeepSeek', url: 'https://chat.deepseek.com', icon: '' },
  { id: 'default-claude', type: 'link', title: 'Claude', url: 'https://claude.ai', icon: '' },
  { id: 'default-gemini', type: 'link', title: 'Gemini', url: 'https://gemini.google.com', icon: '' },
  { id: 'default-zhihu', type: 'link', title: '知乎', url: 'https://www.zhihu.com', icon: '' },
  { id: 'default-baidu', type: 'link', title: '百度', url: 'https://www.baidu.com', icon: '' },
  { id: 'default-douyin', type: 'link', title: '抖音', url: 'https://www.douyin.com', icon: '' },
  { id: 'default-gmail', type: 'link', title: 'Gmail', url: 'https://mail.google.com', icon: '' },
  { id: 'default-notion', type: 'link', title: 'Notion', url: 'https://www.notion.so', icon: '' },
  { id: 'default-twitter', type: 'link', title: 'X', url: 'https://x.com', icon: '' },
  { id: 'default-reddit', type: 'link', title: 'Reddit', url: 'https://www.reddit.com', icon: '' },
  { id: 'default-wikipedia', type: 'link', title: 'Wikipedia', url: 'https://www.wikipedia.org', icon: '' },
];

const defaultLayout: DesktopLayout = {
  pages: [defaultDesktopItems],
  dock: defaultDock,
};

function sanitizeWidgetConfig<T extends Partial<WidgetConfig>>(
  config: T,
  fallbackWidgetType?: WidgetType,
): T {
  const maybeConfig = config as T & { widgetType?: WidgetType; content?: unknown };
  const widgetType = maybeConfig.widgetType || fallbackWidgetType;
  if (widgetType === 'stickyNote' && typeof maybeConfig.content === 'string') {
    return {
      ...config,
      content: clampStickyNoteContent(maybeConfig.content),
    } as T;
  }
  return config;
}

function sanitizeDesktopItem(item: DesktopItem): DesktopItem {
  const widgetConfig = item.widgetConfig
    ? sanitizeWidgetConfig(item.widgetConfig, item.widgetType) as WidgetConfig
    : item.widgetConfig;
  const children = item.children?.map(sanitizeDesktopItem);

  return {
    ...item,
    ...(widgetConfig ? { widgetConfig } : {}),
    ...(children ? { children } : {}),
  };
}

function sanitizeDesktopLayout(layout: DesktopLayout): DesktopLayout {
  return {
    pages: layout.pages.map(page => page.map(sanitizeDesktopItem)),
    dock: layout.dock.map(sanitizeDesktopItem),
  };
}

// --- Helper: ensure all system apps exist in the Dock ---
function ensureSystemAppsInDock(dock: DesktopItem[]): DesktopItem[] {
  const result = [...dock];
  for (const app of defaultDock) {
    if (!result.some(i => i.id === app.id)) {
      result.push({ ...app });
    }
  }
  return result;
}

// --- Helper: migrate old flat format to new pages+dock format ---
function migrateLayout(raw: any): DesktopLayout {
  // Already new format
  if (raw && raw.pages && Array.isArray(raw.pages)) {
    const dock = Array.isArray(raw.dock) ? raw.dock : [...defaultDock];
    return sanitizeDesktopLayout({
      pages: raw.pages.length > 0 ? raw.pages : [[]],
      dock: ensureSystemAppsInDock(dock),
    });
  }
  // Old format: { desktopItems: DesktopItem[] }
  if (raw && Array.isArray(raw.desktopItems)) {
    const items: DesktopItem[] = raw.desktopItems;
    const systemApps = items.filter(i => i.id.startsWith('app-'));
    const desktopOnly = items.filter(i => !i.id.startsWith('app-'));
    return sanitizeDesktopLayout({
      pages: desktopOnly.length > 0 ? [desktopOnly] : [[]],
      dock: ensureSystemAppsInDock(systemApps),
    });
  }
  // Cloud format: { items: DesktopItem[] }
  if (raw && Array.isArray(raw.items)) {
    const items: DesktopItem[] = raw.items;
    const systemApps = items.filter(i => i.id.startsWith('app-'));
    const desktopOnly = items.filter(i => !i.id.startsWith('app-'));
    return sanitizeDesktopLayout({
      pages: desktopOnly.length > 0 ? [desktopOnly] : [[]],
      dock: ensureSystemAppsInDock(systemApps),
    });
  }
  return sanitizeDesktopLayout({ ...defaultLayout });
}

// --- Helper: recursively find & remove item ---
function removeItemFromList(list: DesktopItem[], id: string): { result: DesktopItem[]; removed: DesktopItem | null } {
  let removed: DesktopItem | null = null;
  const result: DesktopItem[] = [];

  for (const item of list) {
    if (item.id === id) {
      removed = item;
      continue;
    }

    if (item.children && !removed) {
      const sub = removeItemFromList(item.children, id);
      if (sub.removed) {
        removed = sub.removed;

        if (item.type === 'folder') {
          if (sub.result.length === 0) continue;
          if (sub.result.length === 1) {
            result.push(sub.result[0]);
            continue;
          }
        }

        result.push({ ...item, children: sub.result });
        continue;
      }
    }

    result.push(item);
  }

  return { result, removed };
}

function removeFromPages(pages: DesktopItem[][], id: string): { pages: DesktopItem[][]; removed: DesktopItem | null } {
  let removed: DesktopItem | null = null;
  const newPages = pages.map(page => {
    if (removed) return page;
    const r = removeItemFromList(page, id);
    if (r.removed) { removed = r.removed; return r.result; }
    return page;
  });
  return { pages: newPages, removed };
}

/** 清理所有空页面（任意位置），至少保留 1 页 */
function cleanEmptyPages(pages: DesktopItem[][]): DesktopItem[][] {
  const nonEmpty = pages.filter(page => page.length > 0);
  return nonEmpty.length > 0 ? nonEmpty : [[]];
}

function updateItemInList(list: DesktopItem[], id: string, updates: Partial<DesktopItem>): DesktopItem[] {
  return list.map(i => {
    if (i.id === id) return sanitizeDesktopItem({ ...i, ...updates });
    if (i.children) return { ...i, children: updateItemInList(i.children, id, updates) };
    return i;
  });
}

// --- Helper: normalise URL for deduplication ---

/** Check whether a host is an IP address (IPv4 or IPv6). */
function isIPAddress(host: string): boolean {
  // IPv4
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  // IPv6 (contains colons; valid domains never contain colons)
  if (host.includes(':')) return true;
  return false;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    // Strip trailing slash, lowercase host, ignore protocol differences
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const path = u.pathname.replace(/\/+$/, '') || '';
    // For IP addresses, different ports represent distinct services,
    // so preserve the port in the normalised key.
    const port = isIPAddress(u.hostname) && u.port ? `:${u.port}` : '';
    return `${host}${port}${path}${u.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

// --- Helper: find an existing item by URL in the whole layout ---
function findItemByUrl(layout: DesktopLayout, url: string): DesktopItem | null {
  const norm = normalizeUrl(url);
  const searchList = (items: DesktopItem[]): DesktopItem | null => {
    for (const item of items) {
      if (item.url && normalizeUrl(item.url) === norm) return item;
      if (item.children) {
        const found = searchList(item.children);
        if (found) return found;
      }
    }
    return null;
  };
  for (const page of layout.pages) {
    const found = searchList(page);
    if (found) return found;
  }
  return searchList(layout.dock);
}

// --- Helper: find an existing item by URL inside a folder ---
function findItemByUrlInFolder(layout: DesktopLayout, folderId: string, url: string): DesktopItem | null {
  const norm = normalizeUrl(url);
  const searchFolder = (items: DesktopItem[]): DesktopItem | null => {
    for (const item of items) {
      if (item.id === folderId && item.type === 'folder' && item.children) {
        for (const child of item.children) {
          if (child.url && normalizeUrl(child.url) === norm) return child;
        }
        return null;
      }
      if (item.children) {
        const found = searchFolder(item.children);
        if (found) return found;
      }
    }
    return null;
  };
  for (const page of layout.pages) {
    const found = searchFolder(page);
    if (found) return found;
  }
  return searchFolder(layout.dock);
}

function addToFolder(list: DesktopItem[], folderId: string, item: DesktopItem): DesktopItem[] {
  return list.map(i => {
    if (i.id === folderId && i.type === 'folder') {
      return { ...i, children: [...(i.children || []), item] };
    }
    if (i.children) return { ...i, children: addToFolder(i.children, folderId, item) };
    return i;
  });
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      layout: defaultLayout,
      loading: false,
      error: null,
      layoutSnapshots: [],

      get pages() { return get().layout.pages; },
      get dock() { return get().layout.dock; },
      get canRollback() { return get().layoutSnapshots.length > 0; },

      setLayout: (layout) => set({ layout: sanitizeDesktopLayout(layout) }),

      saveSnapshot: () => {
        const current = get().layout;
        // 深拷贝当前布局，保留最多 10 个快照
        const snapshot = JSON.parse(JSON.stringify(current)) as DesktopLayout;
        const snapshots = [...get().layoutSnapshots, snapshot].slice(-10);
        set({ layoutSnapshots: snapshots });
      },

      rollbackLayout: () => {
        const snapshots = [...get().layoutSnapshots];
        if (snapshots.length === 0) return false;
        const previous = snapshots.pop()!;
        set({ layout: previous, layoutSnapshots: snapshots });
        triggerAutoSync();
        return true;
      },

      resetToDefault: () => {
        // 先保存快照，允许后悔
        get().saveSnapshot();
        const fresh = JSON.parse(JSON.stringify(defaultLayout)) as DesktopLayout;
        set({ layout: fresh });
        triggerAutoSync();
      },

      addDesktopItem: (item, pageIndex, parentFolderId) => {
        const currentLayout = get().layout;

        // Deduplication: skip folders, only check links with URLs
        if (item.type !== 'folder' && item.url) {
          if (parentFolderId) {
            // Adding into a folder — check inside that folder
            const dup = findItemByUrlInFolder(currentLayout, parentFolderId, item.url);
            if (dup) return dup;
          } else {
            // Adding to desktop page — check entire layout
            const dup = findItemByUrl(currentLayout, item.url);
            if (dup) return dup;
          }
        }

        const safeItem = sanitizeDesktopItem(item);
        const layout = { ...currentLayout, pages: currentLayout.pages.map(p => [...p]), dock: [...currentLayout.dock] };
        if (parentFolderId) {
          // Add into a folder (search all pages + dock)
          layout.pages = layout.pages.map(page => addToFolder(page, parentFolderId, safeItem));
          layout.dock = addToFolder(layout.dock, parentFolderId, safeItem);
        } else {
          const pi = pageIndex ?? layout.pages.length - 1;
          while (layout.pages.length <= pi) layout.pages.push([]);
          layout.pages[pi] = [...layout.pages[pi], safeItem];
        }
        set({ layout });
        triggerAutoSync();
        return null;
      },

      checkDuplicate: (url, parentFolderId) => {
        const layout = get().layout;
        if (parentFolderId) {
          return findItemByUrlInFolder(layout, parentFolderId, url);
        }
        return findItemByUrl(layout, url);
      },

      removeDesktopItem: (id) => {
        const layout = { ...get().layout };
        // Remove from pages
        const pr = removeFromPages(layout.pages, id);
        layout.pages = pr.pages;
        // Also try dock
        if (!pr.removed) {
          const dr = removeItemFromList(layout.dock, id);
          layout.dock = dr.result;
        }
        // Clean empty pages (any position, keep at least 1)
        layout.pages = cleanEmptyPages(layout.pages);
        set({ layout });
        triggerAutoSync();
      },

      updateDesktopItem: (id, updates) => {
        const layout = { ...get().layout };
        layout.pages = layout.pages.map(page => updateItemInList(page, id, updates));
        layout.dock = updateItemInList(layout.dock, id, updates);
        set({ layout });
        triggerAutoSync();
      },

      moveItemToDock: (id) => {
        const layout = { ...get().layout };
        // Limit Dock to MAX_DOCK_ITEMS icons to prevent overflow on mobile
        if (layout.dock.length >= MAX_DOCK_ITEMS) return;
        const pr = removeFromPages(layout.pages, id);
        if (pr.removed) {
          layout.pages = pr.pages;
          layout.dock = [...layout.dock, pr.removed];
        }
        // Clean empty trailing pages
        layout.pages = cleanEmptyPages(layout.pages);
        set({ layout });
        triggerAutoSync();
      },

      reorderDesktopItem: (sourceId, targetId) => {
        if (sourceId === targetId) return;
        const layout = { ...get().layout };

        // 1. Find original indices of source BEFORE removal
        let sourceLocation: 'page' | 'dock' | null = null;
        let sourcePageIdx = -1;
        let sourceIdx = -1;

        for (let p = 0; p < layout.pages.length; p++) {
          const i = layout.pages[p].findIndex(item => item.id === sourceId);
          if (i >= 0) { sourceLocation = 'page'; sourcePageIdx = p; sourceIdx = i; break; }
        }
        if (!sourceLocation) {
          const i = layout.dock.findIndex(item => item.id === sourceId);
          if (i >= 0) { sourceLocation = 'dock'; sourceIdx = i; }
        }

        // Find target index BEFORE removal
        let targetLocation: 'page' | 'dock' | null = null;
        let targetPageIdx = -1;
        let targetIdx = -1;

        for (let p = 0; p < layout.pages.length; p++) {
          const i = layout.pages[p].findIndex(item => item.id === targetId);
          if (i >= 0) { targetLocation = 'page'; targetPageIdx = p; targetIdx = i; break; }
        }
        if (!targetLocation) {
          const i = layout.dock.findIndex(item => item.id === targetId);
          if (i >= 0) { targetLocation = 'dock'; targetIdx = i; }
        }

        if (!sourceLocation || !targetLocation) return;

        // 2. Remove source from its original location
        let sourceItem: DesktopItem | null = null;
        const pr = removeFromPages(layout.pages, sourceId);
        if (pr.removed) {
          layout.pages = pr.pages;
          sourceItem = pr.removed;
        } else {
          const dr = removeItemFromList(layout.dock, sourceId);
          if (dr.removed) {
            layout.dock = dr.result;
            sourceItem = dr.removed;
          }
        }
        if (!sourceItem) return;

        // 3. Recalculate target index after removal
        //    When source and target are in the same container and source was
        //    before target, removing source shifts target index left by 1.
        let insertIdx = targetIdx;
        const sameContainer =
          (sourceLocation === 'dock' && targetLocation === 'dock') ||
          (sourceLocation === 'page' && targetLocation === 'page' && sourcePageIdx === targetPageIdx);

        if (sameContainer && sourceIdx < targetIdx) {
          // Source was before target, so after removal target shifted left.
          // We don't need to subtract because we want to insert AFTER the
          // target's new position (which is targetIdx - 1), i.e. at targetIdx.
          insertIdx = targetIdx;
        }

        // Early exit: if source would end up exactly where it was, skip the
        // state update to prevent infinite re-render loops during drag.
        // In same-container moves the insertIdx already accounts for removal,
        // so we can compare directly; in cross-container moves, sourceIdx is
        // in a different list so there's no overlap to check.
        if (sameContainer && insertIdx === sourceIdx) return;

        // 4. Insert source at the calculated position
        if (targetLocation === 'page') {
          layout.pages[targetPageIdx] = [
            ...layout.pages[targetPageIdx].slice(0, insertIdx),
            sourceItem,
            ...layout.pages[targetPageIdx].slice(insertIdx)
          ];
        } else if (targetLocation === 'dock') {
          // If crossing from page → dock, check Dock capacity
          if (sourceLocation === 'page' && layout.dock.length >= MAX_DOCK_ITEMS) {
            // Dock full — put item back on source page instead of into dock
            const fallbackPage = sourcePageIdx >= 0 ? sourcePageIdx : layout.pages.length - 1;
            layout.pages[fallbackPage] = [
              ...layout.pages[fallbackPage].slice(0, sourceIdx),
              sourceItem,
              ...layout.pages[fallbackPage].slice(sourceIdx)
            ];
          } else {
            layout.dock = [
              ...layout.dock.slice(0, insertIdx),
              sourceItem,
              ...layout.dock.slice(insertIdx)
            ];
          }
        }

        set({ layout });
        triggerAutoSync();
      },

      moveItemToFolder: (sourceId, folderId) => {
        if (sourceId === folderId) return;
        const layout = { ...get().layout };

        // 查找源 item，widget 和 folder 不允许放入文件夹
        const allItems = [...layout.pages.flat(), ...layout.dock];
        const sourceCheck = allItems.find(i => i.id === sourceId);
        if (sourceCheck && (sourceCheck.type === 'widget' || sourceCheck.type === 'folder')) return;

        let sourceItem: DesktopItem | null = null;

        const pr = removeFromPages(layout.pages, sourceId);
        if (pr.removed) {
          layout.pages = pr.pages;
          sourceItem = pr.removed;
        } else {
          const dr = removeItemFromList(layout.dock, sourceId);
          if (dr.removed) {
            layout.dock = dr.result;
            sourceItem = dr.removed;
          }
        }
        if (!sourceItem) return;

        layout.pages = layout.pages.map(page => addToFolder(page, folderId, sourceItem!));
        layout.dock = addToFolder(layout.dock, folderId, sourceItem);

        layout.pages = cleanEmptyPages(layout.pages);
        set({ layout });
        triggerAutoSync();
      },

      moveItemToPage: (sourceId, pageIndex, insertIndex) => {
        const layout = { ...get().layout };
        let sourceItem: DesktopItem | null = null;

        const pr = removeFromPages(layout.pages, sourceId);
        if (pr.removed) {
          layout.pages = pr.pages;
          sourceItem = pr.removed;
        } else {
          const dr = removeItemFromList(layout.dock, sourceId);
          if (dr.removed) {
            layout.dock = dr.result;
            sourceItem = dr.removed;
          }
        }
        if (!sourceItem) return;

        while (layout.pages.length <= pageIndex) layout.pages.push([]);
        if (insertIndex !== undefined) {
          layout.pages[pageIndex].splice(insertIndex, 0, sourceItem);
        } else {
          layout.pages[pageIndex].push(sourceItem);
        }

        layout.pages = cleanEmptyPages(layout.pages);
        set({ layout });
        triggerAutoSync();
      },

      reorderInsideFolder: (folderId, sourceId, targetId) => {
        if (sourceId === targetId) return;
        const layout = { ...get().layout };

        const reorderInList = (list: DesktopItem[]): DesktopItem[] => {
          return list.map(item => {
            if (item.id === folderId && item.type === 'folder' && item.children) {
              const children = [...item.children];
              const srcIdx = children.findIndex(c => c.id === sourceId);
              const tgtIdx = children.findIndex(c => c.id === targetId);
              if (srcIdx >= 0 && tgtIdx >= 0) {
                const [moved] = children.splice(srcIdx, 1);
                children.splice(tgtIdx, 0, moved);
              }
              return { ...item, children };
            }
            if (item.children) {
              return { ...item, children: reorderInList(item.children) };
            }
            return item;
          });
        };

        layout.pages = layout.pages.map(page => reorderInList(page));
        layout.dock = reorderInList(layout.dock);
        set({ layout });
        triggerAutoSync();
      },

      moveItemOutOfFolder: (sourceId, _folderId, pageIndex) => {
        const layout = { ...get().layout };
        let sourceItem: DesktopItem | null = null;

        const pr = removeFromPages(layout.pages, sourceId);
        if (pr.removed) {
          layout.pages = pr.pages;
          sourceItem = pr.removed;
        } else {
          const dr = removeItemFromList(layout.dock, sourceId);
          if (dr.removed) {
            layout.dock = dr.result;
            sourceItem = dr.removed;
          }
        }
        if (!sourceItem) return;

        const pi = pageIndex ?? layout.pages.length - 1;
        while (layout.pages.length <= pi) layout.pages.push([]);
        layout.pages[pi].push(sourceItem);

        set({ layout });
        triggerAutoSync();
      },

      mergeItemsToNewFolder: (sourceId, targetId) => {
        if (sourceId === targetId) return;
        const layout = { ...get().layout };

        // 1. Find where the target lives (so we can place the folder there)
        let targetLocation: 'page' | 'dock' | null = null;
        let targetPageIdx = -1;
        let targetIdx = -1;

        for (let p = 0; p < layout.pages.length; p++) {
          const i = layout.pages[p].findIndex(item => item.id === targetId);
          if (i >= 0) { targetLocation = 'page'; targetPageIdx = p; targetIdx = i; break; }
        }
        if (!targetLocation) {
          const i = layout.dock.findIndex(item => item.id === targetId);
          if (i >= 0) { targetLocation = 'dock'; targetIdx = i; }
        }
        if (!targetLocation) return;

        // 2. Remove both items from all locations
        let sourceItem: DesktopItem | null = null;
        let targetItem: DesktopItem | null = null;

        const pr1 = removeFromPages(layout.pages, sourceId);
        if (pr1.removed) { layout.pages = pr1.pages; sourceItem = pr1.removed; }
        else {
          const dr1 = removeItemFromList(layout.dock, sourceId);
          if (dr1.removed) { layout.dock = dr1.result; sourceItem = dr1.removed; }
        }
        if (!sourceItem) return;

        const pr2 = removeFromPages(layout.pages, targetId);
        if (pr2.removed) { layout.pages = pr2.pages; targetItem = pr2.removed; }
        else {
          const dr2 = removeItemFromList(layout.dock, targetId);
          if (dr2.removed) { layout.dock = dr2.result; targetItem = dr2.removed; }
        }
        if (!targetItem) return;

        // 3. Create the new folder with both items as children
        const newFolder: DesktopItem = {
          id: `folder-${Date.now()}`,
          type: 'folder',
          title: targetItem.title || sourceItem.title || 'New Folder',
          children: [targetItem, sourceItem],
        };

        // 4. Insert the folder at the target's original position
        // Recalculate index — after removal it may have shifted
        if (targetLocation === 'page') {
          const page = layout.pages[targetPageIdx];
          const insertAt = Math.min(targetIdx, page.length);
          layout.pages[targetPageIdx] = [
            ...page.slice(0, insertAt),
            newFolder,
            ...page.slice(insertAt),
          ];
        } else {
          const insertAt = Math.min(targetIdx, layout.dock.length);
          layout.dock = [
            ...layout.dock.slice(0, insertAt),
            newFolder,
            ...layout.dock.slice(insertAt),
          ];
        }

        // 5. Clean empty trailing pages
        layout.pages = cleanEmptyPages(layout.pages);

        set({ layout });
        triggerAutoSync();
      },

      moveItemFromDock: (id, pageIndex) => {
        const layout = { ...get().layout, pages: get().layout.pages.map(page => [...page]) };
        const dr = removeItemFromList(layout.dock, id);
        if (dr.removed) {
          layout.dock = dr.result;
          const targetPage = Math.max(0, pageIndex ?? layout.pages.length - 1);
          while (layout.pages.length <= targetPage) layout.pages.push([]);
          layout.pages[targetPage] = [...layout.pages[targetPage], dr.removed];
        }
        set({ layout });
        triggerAutoSync();
      },

      addWidget: (widgetType, widgetSize, config, pageIndex) => {
        const layout = { ...get().layout, pages: get().layout.pages.map(p => [...p]), dock: [...get().layout.dock] };
        const widgetItem: DesktopItem = {
          id: `widget-${widgetType}-${Date.now()}`,
          type: 'widget',
          title: widgetType.charAt(0).toUpperCase() + widgetType.slice(1),
          widgetType,
          widgetSize,
          widgetConfig: sanitizeWidgetConfig(config, widgetType) as WidgetConfig,
        };
        const pi = pageIndex ?? layout.pages.length - 1;
        while (layout.pages.length <= pi) layout.pages.push([]);
        layout.pages[pi] = [...layout.pages[pi], widgetItem];
        set({ layout });
        triggerAutoSync();
      },

      updateWidgetConfig: (id, config) => {
        const layout = { ...get().layout };
        layout.pages = layout.pages.map(page =>
          page.map(item => {
            if (item.id === id && item.type === 'widget') {
              const widgetConfig = sanitizeWidgetConfig(
                { ...item.widgetConfig, ...config } as WidgetConfig,
                item.widgetType,
              ) as WidgetConfig;
              return { ...item, widgetConfig };
            }
            return item;
          })
        );
        set({ layout });
        triggerAutoSync();
      },

      syncLayoutOnly: async () => {
        set({ loading: true, error: null });
        try {
          const layout = sanitizeDesktopLayout(get().layout);
          const res = await client.put('/api/v1/layout', { pages: layout.pages, dock: layout.dock });
          // 使用服务器返回的 updated_at 更新本地时间戳，保持两端一致
          if (res.data?.updated_at) {
            const serverTs = new Date(res.data.updated_at).getTime();
            useConfigStore.getState().setLastLocalModifiedAt(serverTs);
          }
          set({ loading: false });
        } catch (err: any) {
          set({ error: err.message || 'Layout sync failed', loading: false });
          throw err;
        }
      },

      syncPreferencesToCloud: async () => {
        set({ loading: true, error: null });
        useConfigStore.getState().markLocalModified();
        try {
          const { backgroundImage, lockIdleTimeout, linkOpenMode } = useConfigStore.getState();

          if (backgroundImage.startsWith('idb://')) {
            const rawBlob = await getRawBlob('bg-custom');
            if (rawBlob) {
              const webpBlob = await compressImageToWebP(rawBlob);
              const formData = new FormData();
              formData.append('image', webpBlob, 'background.webp');
              await client.post('/api/v1/user/background', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
              });
            }
            await client.put('/api/v1/user/preferences', { backgroundImage: 'cloud://background', lockIdleTimeout, linkOpenMode });
          } else {
            await client.put('/api/v1/user/preferences', { backgroundImage, lockIdleTimeout, linkOpenMode });
          }

          set({ loading: false });
        } catch (err: any) {
          set({ error: err.message || 'Preferences sync failed', loading: false });
          throw err;
        }
      },

      uploadLayoutToCloud: async () => {
        set({ loading: true, error: null });
        try {
          const layout = sanitizeDesktopLayout(get().layout);
          const layoutRes = await client.put('/api/v1/layout', { pages: layout.pages, dock: layout.dock });
          
          // 使用服务器返回的 updated_at 更新本地时间戳
          if (layoutRes.data?.updated_at) {
            const serverTs = new Date(layoutRes.data.updated_at).getTime();
            useConfigStore.getState().setLastLocalModifiedAt(serverTs);
          }

          const { backgroundImage, lockIdleTimeout, linkOpenMode } = useConfigStore.getState();

          if (backgroundImage.startsWith('idb://')) {
            // Upload local image binary to cloud
            const rawBlob = await getRawBlob('bg-custom');
            if (rawBlob) {
              const webpBlob = await compressImageToWebP(rawBlob);
              const formData = new FormData();
              formData.append('image', webpBlob, 'background.webp');
              await client.post('/api/v1/user/background', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
              });
            }
            // Save preferences with marker indicating cloud-stored image
            await client.put('/api/v1/user/preferences', { backgroundImage: 'cloud://background', lockIdleTimeout, linkOpenMode });
          } else {
            // URL-based wallpaper — just sync the URL string
            await client.put('/api/v1/user/preferences', { backgroundImage, lockIdleTimeout, linkOpenMode });
          }
          
          set({ loading: false });
        } catch (err: any) {
          set({ error: err.message || 'Upload failed', loading: false });
          throw err;
        }
      },

      pullLayoutFromCloud: async () => {
        set({ loading: true, error: null });
        try {
          const res = await client.get('/api/v1/layout');
          const cloudData = res.data.layout;
          const migrated = migrateLayout(cloudData);
          set({ layout: migrated });

          // 使用云端布局的 updated_at 更新本地时间戳
          if (res.data.updated_at) {
            const serverTs = new Date(res.data.updated_at).getTime();
            useConfigStore.getState().setLastLocalModifiedAt(serverTs);
          }

          const prefsRes = await client.get('/api/v1/user/preferences');
          const bg = prefsRes.data.preferences?.backgroundImage;
          const cloudLockIdleTimeout = prefsRes.data.preferences?.lockIdleTimeout;
          const cloudLinkOpenMode = prefsRes.data.preferences?.linkOpenMode;

          // Apply lock idle timeout from cloud (if present)
          if (typeof cloudLockIdleTimeout === 'number') {
            useConfigStore.getState().setLockIdleTimeout(cloudLockIdleTimeout);
          }

          if (cloudLinkOpenMode === 'current' || cloudLinkOpenMode === 'newTab') {
            useConfigStore.getState().setLinkOpenMode(cloudLinkOpenMode);
          }

          if (bg) {
            if (bg === 'cloud://background') {
              // Download the cloud-stored image binary and save to local IndexedDB
              try {
                const imgRes = await client.get('/api/v1/user/background', {
                  responseType: 'blob',
                });
                const blob = imgRes.data as Blob;
                await saveImageBlob('bg-custom', blob);
                useConfigStore.getState().setBackgroundImage(`idb://bg-custom?t=${Date.now()}`);
              } catch {
                // No cloud background image — ignore silently
                console.warn('No cloud background image found, skipping');
              }
            } else {
              // URL-based wallpaper
              useConfigStore.getState().setBackgroundImage(bg);
            }
          }

          set({ loading: false });
        } catch (err: any) {
          set({ error: err.message || 'Pull failed', loading: false });
          throw err;
        }
      },

      mergeLayoutWithCloud: async () => {
        set({ loading: true, error: null });
        try {
          const res = await client.get('/api/v1/layout');
          const cloudLayout = migrateLayout(res.data.layout);
          const localLayout = sanitizeDesktopLayout(get().layout);
          
          // Gather all cloud item IDs
          const allCloudIds = new Set<string>();
          const collectIds = (items: DesktopItem[]) => {
            for (const i of items) {
              allCloudIds.add(i.id);
              if (i.children) collectIds(i.children);
            }
          };
          cloudLayout.pages.forEach(p => collectIds(p));
          collectIds(cloudLayout.dock);

          // Append local-only items to cloud's last page
          const localOnlyItems: DesktopItem[] = [];
          const findLocalOnly = (items: DesktopItem[]) => {
            for (const i of items) {
              if (!allCloudIds.has(i.id)) localOnlyItems.push(i);
            }
          };
          localLayout.pages.forEach(p => findLocalOnly(p));
          findLocalOnly(localLayout.dock);

          const merged: DesktopLayout = {
            pages: [...cloudLayout.pages],
            dock: [...cloudLayout.dock],
          };
          if (localOnlyItems.length > 0) {
            const lastIdx = merged.pages.length - 1;
            merged.pages[lastIdx] = [...merged.pages[lastIdx], ...localOnlyItems];
          }

          const safeMerged = sanitizeDesktopLayout(merged);
          set({ layout: safeMerged });
          await client.put('/api/v1/layout', { pages: safeMerged.pages, dock: safeMerged.dock });
          
          set({ loading: false });
        } catch (err: any) {
          set({ error: err.message || 'Merge failed', loading: false });
          throw err;
        }
      }
    }),
    {
      name: 'catheadtab-layout-storage',
      storage: createJSONStorage(() => customStorage),
      // layoutSnapshots 是运行时数据，不需要持久化
      partialize: (state) => {
        const { layoutSnapshots, ...rest } = state;
        return rest;
      },
      // Migrate persisted state on load
      migrate: (persisted: any) => {
        if (persisted && persisted.layout && persisted.layout.pages) {
          // Already new format — but ensure system apps (bookmarks, history) exist in dock
          const dock = Array.isArray(persisted.layout.dock) ? persisted.layout.dock : [...defaultDock];
          return {
            ...persisted,
            layout: sanitizeDesktopLayout({
              ...persisted.layout,
              dock: ensureSystemAppsInDock(dock),
            }),
          };
        }
        // Old format had desktopItems at top level
        if (persisted && persisted.desktopItems) {
          return {
            ...persisted,
            layout: migrateLayout(persisted),
          };
        }
        return persisted;
      },
      version: 3,
    }
  )
);

// Backwards-compatible convenience: desktopItems = all pages flattened
// This is used in search and elsewhere
export function getAllDesktopItems(layout: DesktopLayout): DesktopItem[] {
  return [...layout.pages.flat(), ...layout.dock];
}
