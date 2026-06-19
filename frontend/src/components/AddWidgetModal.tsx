import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../i18n/useTranslation';
import type { TranslationKeys } from '../i18n/useTranslation';
import type { WidgetType, WidgetSize, WidgetConfig } from '../store/layoutStore';
import { useLayoutStore, WIDGET_SIZE_MAP } from '../store/layoutStore';
import { useConfigStore } from '../store/configStore';
import { CatHeadIcon } from './CatHeadIcon';
import { DatePicker } from './DatePicker';
import { useFloatingWindow } from '../hooks/useFloatingWindow';

interface AddWidgetModalProps {
  onClose: () => void;
  pageIndex?: number;
  /** When provided, the modal enters "edit" mode for this existing widget. */
  editItem?: import('../store/layoutStore').DesktopItem | null;
}

interface WidgetOption {
  type: WidgetType;
  icon: string;
  labelKey: TranslationKeys;
  descKey: TranslationKeys;
  sizes: WidgetSize[];
}

interface WidgetCategory {
  labelKey: TranslationKeys;
  icon: string;
  widgets: WidgetOption[];
}

const WIDGET_CATEGORIES: WidgetCategory[] = [
  {
    labelKey: 'widget.categoryTimeDate',
    icon: '🕐',
    widgets: [
      {
        type: 'calendar',
        icon: '📅',
        labelKey: 'widget.calendar',
        descKey: 'widget.calendarDesc',
        sizes: ['small', 'medium'],
      },
      {
        type: 'clock',
        icon: '🕐',
        labelKey: 'widget.clock',
        descKey: 'widget.clockDesc',
        sizes: ['small', 'medium'],
      },
      {
        type: 'countdown',
        icon: '⏱️',
        labelKey: 'widget.countdown',
        descKey: 'widget.countdownDesc',
        sizes: ['small', 'medium'],
      },
    ],
  },
  {
    labelKey: 'widget.categoryLifeTools',
    icon: '🌤️',
    widgets: [
      {
        type: 'weather',
        icon: '🌤️',
        labelKey: 'widget.weather',
        descKey: 'widget.weatherDesc',
        sizes: ['small', 'medium'],
      },
      {
        type: 'stock',
        icon: '📈',
        labelKey: 'widget.stock',
        descKey: 'widget.stockDesc',
        sizes: ['small', 'medium'],
      },
      {
        type: 'exchangeRate',
        icon: '💱',
        labelKey: 'widget.exchangeRate',
        descKey: 'widget.exchangeRateDesc',
        sizes: ['small', 'medium'],
      },
    ],
  },
  {
    labelKey: 'widget.categoryProductivity',
    icon: '🛠️',
    widgets: [
      {
        type: 'systemMonitor',
        icon: '🖥️',
        labelKey: 'widget.systemMonitor',
        descKey: 'widget.systemMonitorDesc',
        sizes: ['small', 'medium'],
      },
      {
        type: 'itTools',
        icon: '🛠️',
        labelKey: 'widget.itTools',
        descKey: 'widget.itToolsDesc',
        sizes: ['small'],
      },
      {
        type: 'stickyNote',
        icon: '📝',
        labelKey: 'widget.stickyNote',
        descKey: 'widget.stickyNoteDesc',
        sizes: ['small', 'medium'],
      },
      {
        type: 'calculator',
        icon: '🧮',
        labelKey: 'widget.calculator',
        descKey: 'widget.calculatorDesc',
        sizes: ['small'],
      },
      {
        type: 'aiAgent',
        icon: '',
        labelKey: 'widget.aiAgent',
        descKey: 'widget.aiAgentDesc',
        sizes: ['small'],
      },
    ],
  },
  {
    labelKey: 'widget.categoryInfo',
    icon: '📰',
    widgets: [
      {
        type: 'githubTrending',
        icon: '🐙',
        labelKey: 'widget.githubTrending',
        descKey: 'widget.githubTrendingDesc',
        sizes: ['medium', 'large', 'tall', 'xlarge'],
      },
      {
        type: 'bilibiliHot',
        icon: '📺',
        labelKey: 'widget.bilibiliHot',
        descKey: 'widget.bilibiliHotDesc',
        sizes: ['medium', 'large', 'tall', 'xlarge'],
      },
      {
        type: 'xiaohongshuHot',
        icon: '📕',
        labelKey: 'widget.xiaohongshuHot',
        descKey: 'widget.xiaohongshuHotDesc',
        sizes: ['medium', 'large', 'tall', 'xlarge'],
      },
      {
        type: 'weiboHot',
        icon: '🔥',
        labelKey: 'widget.weiboHot',
        descKey: 'widget.weiboHotDesc',
        sizes: ['medium', 'large', 'tall', 'xlarge'],
      },
      {
        type: 'bbcNews',
        icon: '📰',
        labelKey: 'widget.bbcNews',
        descKey: 'widget.bbcNewsDesc',
        sizes: ['medium', 'large', 'tall', 'xlarge'],
      },
    ],
  },
];

/** Flattened list of all widget options (used for lookups). */
const WIDGET_OPTIONS: WidgetOption[] = WIDGET_CATEGORIES.flatMap(c => c.widgets);

/** Curated list of common world timezones for the clock widget picker. */
const TIMEZONE_LIST: { id: string; label: string }[] = [
  // UTC
  { id: 'UTC', label: 'UTC (协调世界时 / Coordinated Universal Time)' },
  // Asia
  { id: 'Asia/Shanghai', label: 'UTC+8  中国 (北京/上海)' },
  { id: 'Asia/Hong_Kong', label: 'UTC+8  中国香港' },
  { id: 'Asia/Taipei', label: 'UTC+8  中国台北' },
  { id: 'Asia/Tokyo', label: 'UTC+9  日本 (东京)' },
  { id: 'Asia/Seoul', label: 'UTC+9  韩国 (首尔)' },
  { id: 'Asia/Singapore', label: 'UTC+8  新加坡' },
  { id: 'Asia/Kolkata', label: 'UTC+5:30  印度 (新德里)' },
  { id: 'Asia/Dubai', label: 'UTC+4  阿联酋 (迪拜)' },
  { id: 'Asia/Bangkok', label: 'UTC+7  泰国 (曼谷)' },
  { id: 'Asia/Jakarta', label: 'UTC+7  印尼 (雅加达)' },
  { id: 'Asia/Kuala_Lumpur', label: 'UTC+8  马来西亚 (吉隆坡)' },
  { id: 'Asia/Manila', label: 'UTC+8  菲律宾 (马尼拉)' },
  { id: 'Asia/Riyadh', label: 'UTC+3  沙特 (利雅得)' },
  { id: 'Asia/Ho_Chi_Minh', label: 'UTC+7  越南 (胡志明市)' },
  // Europe
  { id: 'Europe/London', label: 'UTC+0/+1  英国 (伦敦)' },
  { id: 'Europe/Paris', label: 'UTC+1/+2  法国 (巴黎)' },
  { id: 'Europe/Berlin', label: 'UTC+1/+2  德国 (柏林)' },
  { id: 'Europe/Moscow', label: 'UTC+3  俄罗斯 (莫斯科)' },
  { id: 'Europe/Rome', label: 'UTC+1/+2  意大利 (罗马)' },
  { id: 'Europe/Madrid', label: 'UTC+1/+2  西班牙 (马德里)' },
  { id: 'Europe/Amsterdam', label: 'UTC+1/+2  荷兰 (阿姆斯特丹)' },
  { id: 'Europe/Zurich', label: 'UTC+1/+2  瑞士 (苏黎世)' },
  { id: 'Europe/Istanbul', label: 'UTC+3  土耳其 (伊斯坦布尔)' },
  // Americas
  { id: 'America/New_York', label: 'UTC-5/-4  美国东部 (纽约)' },
  { id: 'America/Chicago', label: 'UTC-6/-5  美国中部 (芝加哥)' },
  { id: 'America/Denver', label: 'UTC-7/-6  美国山区 (丹佛)' },
  { id: 'America/Los_Angeles', label: 'UTC-8/-7  美国西部 (洛杉矶)' },
  { id: 'America/Anchorage', label: 'UTC-9/-8  美国阿拉斯加' },
  { id: 'Pacific/Honolulu', label: 'UTC-10  美国夏威夷' },
  { id: 'America/Toronto', label: 'UTC-5/-4  加拿大 (多伦多)' },
  { id: 'America/Vancouver', label: 'UTC-8/-7  加拿大 (温哥华)' },
  { id: 'America/Mexico_City', label: 'UTC-6  墨西哥 (墨西哥城)' },
  { id: 'America/Sao_Paulo', label: 'UTC-3  巴西 (圣保罗)' },
  { id: 'America/Argentina/Buenos_Aires', label: 'UTC-3  阿根廷 (布宜诺斯艾利斯)' },
  // Oceania
  { id: 'Australia/Sydney', label: 'UTC+10/+11  澳大利亚 (悉尼)' },
  { id: 'Australia/Melbourne', label: 'UTC+10/+11  澳大利亚 (墨尔本)' },
  { id: 'Australia/Perth', label: 'UTC+8  澳大利亚 (珀斯)' },
  { id: 'Pacific/Auckland', label: 'UTC+12/+13  新西兰 (奥克兰)' },
  // Africa
  { id: 'Africa/Cairo', label: 'UTC+2  埃及 (开罗)' },
  { id: 'Africa/Johannesburg', label: 'UTC+2  南非 (约翰内斯堡)' },
  { id: 'Africa/Lagos', label: 'UTC+1  尼日利亚 (拉各斯)' },
];

/** Timezone dropdown that renders via portal so it's not clipped by the modal's overflow. */
const TimezoneDropdown: React.FC<{
  clockTimezone: string;
  setClockTimezone: (tz: string) => void;
  tzSearch: string;
  setTzSearch: (s: string) => void;
  tzDropdownOpen: boolean;
  setTzDropdownOpen: (open: boolean) => void;
  isZh: boolean;
  label: string;
}> = ({ clockTimezone, setClockTimezone, tzSearch, setTzSearch, tzDropdownOpen, setTzDropdownOpen, isZh, label }) => {
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Calculate position when dropdown opens
  useEffect(() => {
    if (tzDropdownOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, [tzDropdownOpen]);

  // Close on outside click
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (
      dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
      triggerRef.current && !triggerRef.current.contains(e.target as Node)
    ) {
      setTzDropdownOpen(false);
    }
  }, [setTzDropdownOpen]);

  useEffect(() => {
    if (tzDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [tzDropdownOpen, handleClickOutside]);

  const selectTimezone = (tz: string) => {
    setClockTimezone(tz);
    setTzDropdownOpen(false);
    setTzSearch('');
  };

  const selectedLabel = clockTimezone
    ? TIMEZONE_LIST.find(tz => tz.id === clockTimezone)?.label ?? clockTimezone
    : (isZh ? '当前时区（默认）' : 'Local Timezone (default)');

  return (
    <div>
      <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">{label}</label>
      <div>
        <div
          ref={triggerRef}
          className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3.5 text-[14px] text-white cursor-pointer flex items-center justify-between transition-all"
          onClick={() => setTzDropdownOpen(!tzDropdownOpen)}
        >
          <span className={clockTimezone ? 'text-white' : 'text-white/40'}>
            {selectedLabel}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-white/40 transition-transform ${tzDropdownOpen ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6"/></svg>
        </div>

        {tzDropdownOpen && pos && createPortal(
          <div
            ref={dropdownRef}
            className="bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: Math.max(pos.width, 380),
              zIndex: 10000,
            }}
          >
            {/* Search input */}
            <div className="p-2 border-b border-white/5">
              <input
                type="text"
                value={tzSearch}
                onChange={(e) => setTzSearch(e.target.value)}
                placeholder={isZh ? '搜索时区...' : 'Search timezone...'}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white placeholder-white/30 focus:outline-none focus:border-[#72d565]/50"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            {/* Timezone list */}
            <div className="max-h-[min(360px,50vh)] overflow-y-auto desktop-scrollbar">
              {/* Local timezone option */}
              <button
                className={`w-full px-4 py-3 text-[13px] text-left flex justify-between transition-colors hover:bg-white/5 ${!clockTimezone ? 'bg-white/5 text-white' : 'text-white/60'}`}
                onClick={() => selectTimezone('')}
              >
                {isZh ? '当前时区（默认）' : 'Local Timezone (default)'}
                {!clockTimezone && <span className="text-[#72d565]">✓</span>}
              </button>
              {TIMEZONE_LIST
                .filter(tz => {
                  if (!tzSearch) return true;
                  const q = tzSearch.toLowerCase();
                  return tz.id.toLowerCase().includes(q) || tz.label.toLowerCase().includes(q);
                })
                .map(tz => (
                  <button
                    key={tz.id}
                    className={`w-full px-4 py-3 text-[13px] text-left flex justify-between transition-colors hover:bg-white/5 border-t border-white/[0.03] ${clockTimezone === tz.id ? 'bg-white/5 text-white' : 'text-white/60'}`}
                    onClick={() => selectTimezone(tz.id)}
                  >
                    <span className="truncate mr-2">{tz.label}</span>
                    {clockTimezone === tz.id && <span className="text-[#72d565] shrink-0">✓</span>}
                  </button>
                ))}
            </div>
          </div>,
          document.body,
        )}
      </div>
    </div>
  );
};

const GITHUB_LANGUAGES = [
  { id: '', label: 'All Languages' },
  { id: 'c', label: 'C' },
  { id: 'c++', label: 'C++' },
  { id: 'c#', label: 'C#' },
  { id: 'css', label: 'CSS' },
  { id: 'dart', label: 'Dart' },
  { id: 'go', label: 'Go' },
  { id: 'html', label: 'HTML' },
  { id: 'java', label: 'Java' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'lua', label: 'Lua' },
  { id: 'php', label: 'PHP' },
  { id: 'python', label: 'Python' },
  { id: 'r', label: 'R' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'rust', label: 'Rust' },
  { id: 'scala', label: 'Scala' },
  { id: 'shell', label: 'Shell' },
  { id: 'swift', label: 'Swift' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'vue', label: 'Vue' },
  { id: 'jupyter-notebook', label: 'Jupyter Notebook' },
];

const LanguageDropdown: React.FC<{
  languageValue: string;
  setLanguageValue: (lang: string) => void;
  langSearch: string;
  setLangSearch: (s: string) => void;
  langDropdownOpen: boolean;
  setLangDropdownOpen: (open: boolean) => void;
  isZh: boolean;
  label: string;
}> = ({ languageValue, setLanguageValue, langSearch, setLangSearch, langDropdownOpen, setLangDropdownOpen, isZh, label }) => {
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (langDropdownOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, [langDropdownOpen]);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (
      dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
      triggerRef.current && !triggerRef.current.contains(e.target as Node)
    ) {
      setLangDropdownOpen(false);
    }
  }, [setLangDropdownOpen]);

  useEffect(() => {
    if (langDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [langDropdownOpen, handleClickOutside]);

  const selectLanguage = (tz: string) => {
    setLanguageValue(tz);
    setLangDropdownOpen(false);
    setLangSearch('');
  };

  const selectedLabel = languageValue
    ? GITHUB_LANGUAGES.find(tz => tz.id === languageValue)?.label ?? languageValue
    : (isZh ? '所有语言（默认）' : 'All Languages (default)');

  return (
    <div>
      <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">{label}</label>
      <div>
        <div
          ref={triggerRef}
          className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3.5 text-[14px] text-white cursor-pointer flex items-center justify-between transition-all"
          onClick={() => setLangDropdownOpen(!langDropdownOpen)}
        >
          <span className={languageValue ? 'text-white' : 'text-white/40'}>
            {selectedLabel}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-white/40 transition-transform ${langDropdownOpen ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6"/></svg>
        </div>

        {langDropdownOpen && pos && createPortal(
          <div
            ref={dropdownRef}
            className="bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: Math.max(pos.width, 380),
              zIndex: 10000,
            }}
          >
            {/* Search input */}
            <div className="p-2 border-b border-white/5">
              <input
                type="text"
                value={langSearch}
                onChange={(e) => setLangSearch(e.target.value)}
                placeholder={isZh ? '搜索编程语言...' : 'Search language...'}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white placeholder-white/30 focus:outline-none focus:border-[#72d565]/50"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            {/* list */}
            <div className="max-h-[min(360px,50vh)] overflow-y-auto desktop-scrollbar">
              <button
                className={`w-full px-4 py-3 text-[13px] text-left flex justify-between transition-colors hover:bg-white/5 ${!languageValue ? 'bg-white/5 text-white' : 'text-white/60'}`}
                onClick={() => selectLanguage('')}
              >
                {isZh ? '所有语言（默认）' : 'All Languages (default)'}
                {!languageValue && <span className="text-[#72d565]">✓</span>}
              </button>
              {GITHUB_LANGUAGES.slice(1) // skip the empty one handled above
                .filter(tz => {
                  if (!langSearch) return true;
                  const q = langSearch.toLowerCase();
                  return tz.id.toLowerCase().includes(q) || tz.label.toLowerCase().includes(q);
                })
                .map(tz => (
                  <button
                    key={tz.id}
                    className={`w-full px-4 py-3 text-[13px] text-left flex justify-between transition-colors hover:bg-white/5 border-t border-white/[0.03] ${languageValue === tz.id ? 'bg-white/5 text-white' : 'text-white/60'}`}
                    onClick={() => selectLanguage(tz.id)}
                  >
                    <span className="truncate mr-2">{tz.label}</span>
                    {languageValue === tz.id && <span className="text-[#72d565] shrink-0">✓</span>}
                  </button>
                ))}
            </div>
          </div>,
          document.body,
        )}
      </div>
    </div>
  );
};

export const AddWidgetModal: React.FC<AddWidgetModalProps> = ({ onClose, pageIndex, editItem }) => {
  const { t, language } = useTranslation();
  const isZh = language === 'zh';
  const addWidget = useLayoutStore(s => s.addWidget);
  const updateWidgetConfig = useLayoutStore(s => s.updateWidgetConfig);
  const updateDesktopItem = useLayoutStore(s => s.updateDesktopItem);
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const floatingWindow = useFloatingWindow({
    defaultSize: () => ({
      width: 640,
      height: typeof window === 'undefined' ? 560 : Math.min(560, window.innerHeight - 96),
    }),
    minHeight: 360,
    minWidth: 520,
    resizable: false,
  });

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const isEditMode = !!editItem && editItem.type === 'widget';

  // Active category tab index
  const [activeTab, setActiveTab] = useState(0);

  // Pre-populate from editItem when in edit mode
  const [selectedType, setSelectedType] = useState<WidgetType | null>(
    isEditMode ? (editItem.widgetType ?? null) : null
  );
  const [selectedSize, setSelectedSize] = useState<WidgetSize>(
    isEditMode ? (editItem.widgetSize ?? 'medium') : 'medium'
  );

  // Auto-correct selectedSize when switching widget type if current size is not available
  React.useEffect(() => {
    if (!selectedType) return;
    const option = WIDGET_OPTIONS.find(w => w.type === selectedType);
    if (option && !option.sizes.includes(selectedSize)) {
      setSelectedSize(option.sizes[0]);
    }
  }, [selectedType, selectedSize]);

  // Countdown config
  const editCountdown = isEditMode && editItem.widgetConfig?.widgetType === 'countdown' ? editItem.widgetConfig : null;
  const [eventName, setEventName] = useState(editCountdown?.eventName ?? '');
  const [targetDate, setTargetDate] = useState(editCountdown?.targetDate ?? '');
  // Weather config
  const editWeather = isEditMode && editItem.widgetConfig?.widgetType === 'weather' ? editItem.widgetConfig : null;
  const [weatherCity, setWeatherCity] = useState(editWeather?.city ?? '');
  const [weatherUnit, setWeatherUnit] = useState<'C' | 'F'>(editWeather?.unit ?? 'C');
  // Clock config
  const editClock = isEditMode && editItem.widgetConfig?.widgetType === 'clock' ? editItem.widgetConfig : null;
  const [clockTimezone, setClockTimezone] = useState(editClock?.timezone ?? '');
  const [tzSearch, setTzSearch] = useState('');
  const [tzDropdownOpen, setTzDropdownOpen] = useState(false);
  // Github Trending config
  const editGithub = isEditMode && editItem.widgetConfig?.widgetType === 'githubTrending' ? editItem.widgetConfig : null;
  const [githubLanguage, setGithubLanguage] = useState(editGithub?.language ?? '');
  const [githubSince, setGithubSince] = useState(editGithub?.since ?? 'daily');
  const [langSearch, setLangSearch] = useState('');
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);

  const selectedOption = WIDGET_OPTIONS.find(w => w.type === selectedType);

  const handleAdd = () => {
    if (!selectedType) return;

    let config: WidgetConfig;
    switch (selectedType) {
      case 'calendar':
        config = { widgetType: 'calendar' };
        break;
      case 'weather':
        config = {
          widgetType: 'weather',
          city: weatherCity || undefined,
          unit: weatherUnit,
        };
        break;
      case 'countdown':
        if (!targetDate) return;
        config = {
          widgetType: 'countdown',
          targetDate,
          eventName: eventName || (isZh ? '未命名事件' : 'Unnamed Event'),
        };
        break;
      case 'systemMonitor':
        config = { widgetType: 'systemMonitor' };
        break;
      case 'clock':
        config = { widgetType: 'clock', timezone: clockTimezone || undefined };
        break;
      case 'itTools':
        config = { widgetType: 'itTools' };
        break;
      case 'stickyNote': {
        const editStickyNote = isEditMode && editItem.widgetConfig?.widgetType === 'stickyNote' ? editItem.widgetConfig : null;
        config = {
          widgetType: 'stickyNote',
          content: editStickyNote?.content ?? '',
          color: editStickyNote?.color ?? 'yellow',
        };
        break;
      }
      case 'stock': {
        const editStock = isEditMode && editItem.widgetConfig?.widgetType === 'stock' ? editItem.widgetConfig : null;
        config = {
          widgetType: 'stock',
          watchlist: editStock?.watchlist ?? undefined,
        };
        break;
      }
      case 'exchangeRate': {
        const editER = isEditMode && editItem.widgetConfig?.widgetType === 'exchangeRate' ? editItem.widgetConfig : null;
        config = {
          widgetType: 'exchangeRate',
          pairs: editER?.pairs ?? undefined,
        };
        break;
      }
      case 'calculator':
        config = { widgetType: 'calculator' };
        break;
      case 'aiAgent':
        config = { widgetType: 'aiAgent' };
        break;
      case 'githubTrending':
        config = {
          widgetType: 'githubTrending',
          language: githubLanguage || undefined,
          since: githubSince || undefined,
        };
        break;
      case 'bilibiliHot':
        config = { widgetType: 'bilibiliHot' };
        break;
      case 'xiaohongshuHot':
        config = { widgetType: 'xiaohongshuHot' };
        break;
      case 'weiboHot':
        config = { widgetType: 'weiboHot' };
        break;
      case 'bbcNews':
        config = { widgetType: 'bbcNews' };
        break;
      default:
        return;
    }

    if (isEditMode) {
      // Update existing widget
      updateWidgetConfig(editItem.id, config);
      updateDesktopItem(editItem.id, { widgetSize: selectedSize });
    } else {
      // Add new widget
      addWidget(selectedType, selectedSize, config, pageIndex);
    }
    onClose();
  };

  const sizeLabel = (s: WidgetSize) => {
    const { cols, rows } = WIDGET_SIZE_MAP[s];
    const nameMap: Record<WidgetSize, { en: string; zh: string }> = {
      small: { en: 'Small', zh: '小' },
      medium: { en: 'Medium', zh: '中' },
      large: { en: 'Wide', zh: '宽' },
      tall: { en: 'Tall', zh: '高' },
      xlarge: { en: 'Extra Large', zh: '超大' },
    };
    const name = isZh ? nameMap[s].zh : nameMap[s].en;
    return `${name} (${rows}×${cols})`;
  };




  useLayoutEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth < 640) return;
    const headerElement = headerRef.current;
    const contentElement = contentRef.current;
    if (!headerElement || !contentElement) return;

    const contentStyle = window.getComputedStyle(contentElement);
    const paddingBottom = parseFloat(contentStyle.paddingBottom) || 0;
    const bottomMostChild = Array.from(contentElement.children).reduce((maxBottom, child) => {
      const childElement = child as HTMLElement;
      return Math.max(
        maxBottom,
        childElement.offsetTop - contentElement.offsetTop + childElement.offsetHeight,
      );
    }, 0);
    const measuredContentHeight = Math.max(bottomMostChild + paddingBottom, 0);

    // offsetHeight (layout box), not getBoundingClientRect (visual box): the
    // window plays a scaleIn transform on open, and a transformed bounding rect
    // would report the header a few px shorter than its laid-out height, fitting
    // the window too small and leaving a stray scrollbar until the next resize.
    const nextHeight = Math.ceil(
      headerElement.offsetHeight
      + measuredContentHeight
      + 2,
    );

    floatingWindow.setWindowSize((currentSize) => ({
      width: currentSize.width,
      height: nextHeight,
    }));
  }, [
    activeTab,
    clockTimezone,
    eventName,
    floatingWindow.setWindowSize,
    githubLanguage,
    githubSince,
    isEditMode,
    isZh,
    selectedSize,
    selectedType,
    targetDate,
    weatherCity,
    weatherUnit,
  ]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none p-0 sm:p-6 md:p-12" onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      {/* Dimmed Background Overlay */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px] pointer-events-auto transition-opacity animate-fadeIn"
        onClick={onClose}
      />

      {/* macOS-style Window */}
      <div
        ref={floatingWindow.shellRef}
        className={`relative bg-black/30 backdrop-blur-xl border-0 sm:border border-white/10 rounded-none sm:rounded-[1.5rem] md:rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.55)] flex flex-col pointer-events-auto transform animate-scaleIn overflow-hidden transition-all ${floatingWindow.isInteracting ? 'duration-0' : 'duration-300'} select-none w-full h-full sm:fixed sm:left-[var(--floating-window-left)] sm:top-[var(--floating-window-top)] sm:w-[var(--floating-window-width)] sm:h-[var(--floating-window-height)] sm:max-w-[calc(100vw-3rem)] sm:max-h-[calc(100vh-3rem)]`}
        style={floatingWindow.style}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Window Header — macOS traffic lights */}
        <div
          ref={headerRef}
          onPointerDown={floatingWindow.handleDragPointerDown}
          className="h-12 md:h-14 border-b border-white/10 flex items-center px-3 md:px-5 shrink-0 bg-white/[0.02] select-none sm:cursor-default"
        >
          {/* Left: Mac traffic lights on desktop */}
          <div className="flex items-center gap-2 w-auto md:w-20">
            <div className="hidden md:flex gap-2.5">
              <button onClick={onClose} className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
                <svg className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
              <div className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] border border-black/20" />
              <div className="w-3.5 h-3.5 rounded-full bg-[#27c93f] border border-black/20" />
            </div>
          </div>

          {/* Center title */}
          <div className="flex-1 flex justify-center">
            <span className="text-[13px] font-semibold text-white/70">
              {isEditMode ? t('widget.editWidget') : (selectedType ? t(selectedOption!.labelKey) : t('widget.addWidget'))}
            </span>
          </div>

          {/* Right spacer / mobile close */}
          <div className="flex items-center w-auto md:w-20 justify-end">
            <button onClick={onClose} className="md:hidden w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            <div className="hidden md:block w-20" />
          </div>
        </div>

        {/* Content Area */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-5 sm:p-6 md:p-8 bg-gradient-to-br from-white/[0.02] to-transparent no-scrollbar">
          {!selectedType ? (
            /* Step 1: Choose widget type — Side-tab category layout */
            <div className="space-y-4 fade-in">
              <div>
                <h3 className="text-xl font-bold text-white mb-1">{t('widget.addWidget')}</h3>
                <p className="text-[13px] text-white/50">{t('widget.chooseType')}</p>
              </div>

              {/* Side-tab layout: left categories + right widget list */}
              <div className="flex gap-3 min-h-[340px]">
                {/* Left: Category tabs (vertical) */}
                <div className="flex flex-col gap-1 shrink-0">
                  {WIDGET_CATEGORIES.map((cat, idx) => (
                    <button
                      key={cat.labelKey}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-[12px] font-medium transition-all text-left whitespace-nowrap ${
                        activeTab === idx
                          ? 'bg-white/10 text-white shadow-sm'
                          : 'text-white/40 hover:text-white/60 hover:bg-white/5'
                      }`}
                      onClick={() => setActiveTab(idx)}
                    >
                      <span className="text-[14px] shrink-0">{cat.icon}</span>
                      <span>{t(cat.labelKey)}</span>
                    </button>
                  ))}
                </div>

                {/* Right: Active category widget list */}
                <div className="flex-1 bg-black/40 border border-white/10 rounded-xl overflow-hidden min-w-0">
                {WIDGET_CATEGORIES[activeTab].widgets.map((opt, idx) => {
                  const userProfile = useConfigStore.getState().userProfile;
                  const proGateEnabled = userProfile?.pro_gate_enabled ?? false;
                  const userRole = userProfile?.role;
                  const isProLocked = opt.type === 'aiAgent' && proGateEnabled && userRole !== 'pro' && userRole !== 'admin';
                  return (
                  <button
                    key={opt.type}
                    className={`w-full flex items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-white/5 group ${
                      idx < WIDGET_CATEGORIES[activeTab].widgets.length - 1 ? 'border-b border-white/5' : ''
                    } ${isProLocked ? 'opacity-50' : ''}`}
                    onClick={() => { if (!isProLocked) setSelectedType(opt.type); }}
                  >
                    {opt.type === 'aiAgent' ? (
                      <CatHeadIcon alt="" className="w-8 h-8 shrink-0 rounded-lg bg-black/25" />
                    ) : (
                      <span className="text-2xl shrink-0">{opt.icon}</span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-medium text-white/90 flex items-center gap-2">
                        {t(opt.labelKey)}
                        {isProLocked && (
                          <span className="text-[10px] text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded-full border border-purple-400/20 font-semibold">Pro</span>
                        )}
                      </div>
                      <div className="text-[12px] text-white/40 mt-0.5">{t(opt.descKey)}</div>
                    </div>
                    {isProLocked ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400/50 shrink-0"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20 group-hover:text-white/50 transition-colors shrink-0"><path d="m9 18 6-6-6-6"/></svg>
                    )}
                  </button>
                  );
                })}
              </div>
              </div>
            </div>
          ) : (
            /* Step 2: Configure widget — macOS settings style */
            <div className="space-y-5 fade-in">
              {/* Back button */}
              {!isEditMode && (
                <button
                  onClick={() => setSelectedType(null)}
                  className="flex items-center gap-1.5 text-[13px] text-[#72d565] hover:text-[#5bb84f] transition-colors font-medium"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
                  {t('widget.backToList')}
                </button>
              )}

              {/* Size selector — grouped list with checkmarks */}
              <div>
                <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">{t('widget.size')}</label>
                <div className="bg-black/40 border border-white/10 rounded-xl overflow-hidden">
                  {(selectedOption?.sizes || []).map((s, idx, arr) => (
                    <button
                      key={s}
                      className={`w-full px-5 py-4 text-[14px] font-medium flex justify-between transition-colors ${
                        idx < arr.length - 1 ? 'border-b border-white/5' : ''
                      } ${selectedSize === s ? 'bg-white/5 text-white/90' : 'text-white/50 hover:bg-white/5 hover:text-white/90'}`}
                      onClick={() => setSelectedSize(s)}
                    >
                      {sizeLabel(s)}
                      {selectedSize === s && <span className="text-[#72d565]">✓</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Type-specific config */}
              {selectedType === 'clock' && (
                <TimezoneDropdown
                  clockTimezone={clockTimezone}
                  setClockTimezone={setClockTimezone}
                  tzSearch={tzSearch}
                  setTzSearch={setTzSearch}
                  tzDropdownOpen={tzDropdownOpen}
                  setTzDropdownOpen={setTzDropdownOpen}
                  isZh={isZh}
                  label={t('widget.timezone')}
                />
              )}

              {selectedType === 'countdown' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">{t('widget.eventName')}</label>
                    <input
                      type="text"
                      value={eventName}
                      onChange={(e) => setEventName(e.target.value)}
                      placeholder={isZh ? '例如：生日' : 'e.g. Birthday'}
                      className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3.5 text-[14px] text-white focus:outline-none focus:border-[#72d565]/50 focus:bg-black/60 transition-all shadow-inner"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">{t('widget.targetDate')}</label>
                    <DatePicker
                      value={targetDate}
                      onChange={setTargetDate}
                      isZh={isZh}
                    />
                  </div>
                </div>
              )}

              {selectedType === 'weather' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">{t('widget.city')}</label>
                    <input
                      type="text"
                      value={weatherCity}
                      onChange={(e) => setWeatherCity(e.target.value)}
                      placeholder={isZh ? '留空则自动定位' : 'Leave empty for auto-detect'}
                      className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3.5 text-[14px] text-white focus:outline-none focus:border-[#72d565]/50 focus:bg-black/60 transition-all shadow-inner"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">{t('widget.unit')}</label>
                    <div className="bg-black/40 border border-white/10 rounded-xl overflow-hidden">
                      {(['C', 'F'] as const).map((u, idx) => (
                        <button
                          key={u}
                          className={`w-full px-5 py-4 text-[14px] font-medium flex justify-between transition-colors ${
                            idx === 0 ? 'border-b border-white/5' : ''
                          } ${weatherUnit === u ? 'bg-white/5 text-white/90' : 'text-white/50 hover:bg-white/5 hover:text-white/90'}`}
                          onClick={() => setWeatherUnit(u)}
                        >
                          °{u} {u === 'C' ? (isZh ? '摄氏度' : 'Celsius') : (isZh ? '华氏度' : 'Fahrenheit')}
                          {weatherUnit === u && <span className="text-[#72d565]">✓</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {selectedType === 'githubTrending' && (
                <div className="space-y-4">
                  <LanguageDropdown
                    languageValue={githubLanguage}
                    setLanguageValue={setGithubLanguage}
                    langSearch={langSearch}
                    setLangSearch={setLangSearch}
                    langDropdownOpen={langDropdownOpen}
                    setLangDropdownOpen={setLangDropdownOpen}
                    isZh={isZh}
                    label={isZh ? '编程语言' : 'Language'}
                  />
                  <div>
                    <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">{isZh ? '时间范围' : 'Time Range'}</label>
                    <div className="bg-black/40 border border-white/10 rounded-xl overflow-hidden flex divide-x divide-white/5">
                      {(['daily', 'weekly', 'monthly'] as const).map((s) => (
                        <button
                          key={s}
                          className={`flex-1 py-3 text-[13px] font-medium transition-colors ${
                            githubSince === s ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/5 hover:text-white/80'
                          }`}
                          onClick={() => setGithubSince(s)}
                        >
                          {s === 'daily' ? (isZh ? '今日' : 'Daily') : s === 'weekly' ? (isZh ? '本周' : 'Weekly') : (isZh ? '本月' : 'Monthly')}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Widget description hint */}
              <div className="rounded-xl bg-black/20 border border-white/[0.06] p-4">
                <p className="text-[13px] text-white/50 leading-relaxed">
                  {selectedType === 'calendar' && (isZh
                    ? '📅 日历小组件会自动显示当前月份，支持翻页浏览和高亮今天。小尺寸显示精简日期，中尺寸显示完整月历。'
                    : '📅 The calendar widget automatically shows the current month with page navigation and today highlight. Small size shows a compact date, medium shows the full month grid.')}
                  {selectedType === 'weather' && (isZh
                    ? '🌤️ 天气小组件会根据你的城市实时显示天气信息。小尺寸显示温度和天气图标，中尺寸额外显示湿度、风速等详情。'
                    : '🌤️ The weather widget shows real-time weather for your city. Small size displays temperature and icon, medium size adds humidity, wind speed and more details.')}
                  {selectedType === 'countdown' && (isZh
                    ? '⏱️ 倒计时小组件会显示距离目标日期的剩余天数。小尺寸显示天数和事件名，中尺寸额外显示时分秒倒计时。'
                    : '⏱️ The countdown widget shows days remaining until your target date. Small size shows days and event name, medium size adds hours, minutes and seconds.')}
                  {selectedType === 'systemMonitor' && (isZh
                    ? '🖥️ 系统监控小组件实时显示 CPU 和内存使用率。小尺寸显示双环形图概览，中尺寸额外显示处理器型号、核心数等详细信息。'
                    : '🖥️ The system monitor widget shows real-time CPU and memory usage. Small size displays dual ring gauges, medium size adds processor model, core count and more details.')}
                  {selectedType === 'clock' && (isZh
                    ? '🕐 时钟小组件实时显示当前时间，支持选择世界各地时区。小尺寸显示简洁数字时钟，中尺寸显示更丰富的时间信息和日期。'
                    : '🕐 The clock widget displays the current time in real-time with world timezone support. Small size shows a clean digital clock, medium size shows richer time info and date.')}
                  {selectedType === 'itTools' && (isZh
                    ? '🛠️ IT 工具箱集合了开发者常用的在线工具（JSON 格式化、Base64 编解码、UUID 生成、哈希计算等）。点击小组件后会弹出工具窗口，所有工具均可在弹窗内直接使用。'
                    : '🛠️ IT Tools provides a collection of handy online tools for developers (JSON formatter, Base64 encoder/decoder, UUID generator, hash calculator, etc). Click the widget to open a tool window where you can use all tools directly.')}
                  {selectedType === 'stickyNote' && (isZh
                    ? '📝 便签小组件可以在桌面上快速记录备忘内容。小尺寸显示便签预览，中尺寸显示更多文字。点击后可以打开完整编辑器进行编辑，支持多种颜色主题。'
                    : '📝 Sticky Notes lets you quickly jot down memos on your desktop. Small size shows a note preview, medium size shows more text. Click to open a full editor with multiple color themes.')}
                  {selectedType === 'stock' && (isZh
                    ? '📈 股票小助手可以实时跟踪自选股行情。支持美股、港股、A股三大市场。小尺寸显示 3 只股票概览，中尺寸显示更多详情。点击可展开完整自选股列表，支持添加和删除股票。数据来源：Yahoo Finance。'
                    : '📈 Stock Tracker monitors your watchlist in real-time. Supports US, Hong Kong and China A-share markets. Small size shows 3 stocks at a glance, medium shows more details. Click to open the full watchlist with add/remove capabilities. Data from Yahoo Finance.')}
                  {selectedType === 'exchangeRate' && (isZh
                    ? '💱 汇率助手实时显示主要货币汇率。支持美元、欧元、人民币、日元、英镑、港币等多种货币。小尺寸显示精简汇率列表，中尺寸显示更多详情。点击可打开管理面板添加或移除货币对。数据来源：Frankfurter API（欧洲央行）。'
                    : '💱 Exchange Rate widget shows live currency exchange rates. Supports USD, EUR, CNY, JPY, GBP, HKD and more. Small size shows a compact list, medium shows more details. Click to open the management panel to add or remove currency pairs. Data from Frankfurter API (ECB).')}
                  {selectedType === 'calculator' && (isZh
                    ? '🧮 科学计算器支持基本四则运算、三角函数、对数、幂运算、百分比等。小尺寸显示精简计算器，中尺寸显示完整键盘并可展开科学计算功能。使用 math.js 引擎，支持复杂数学表达式。'
                    : '🧮 Scientific calculator supports basic arithmetic, trigonometric functions, logarithms, power, percentage and more. Small size shows a compact calculator, medium shows a full keypad with expandable scientific functions. Powered by math.js engine.')}
                  {selectedType === 'aiAgent' && (isZh
                    ? 'AI 助手是你的智能桌面管家。它可以帮你整理桌面图标、添加新图标、创建文件夹并自动分类、更换壁纸等；在本地 AI 模式下，也可以按你的明确请求搜索浏览器书签和历史记录。点击小组件后打开聊天窗口，用自然语言告诉它你想做什么。'
                    : 'AI Agent is your smart desktop assistant. It can organize desktop icons, add shortcuts, create categorized folders, change wallpaper, and more; in local AI mode, it can also search bookmarks and history when you explicitly ask. Click to open the chat window and tell it what you want in natural language.')}
                  {selectedType === 'githubTrending' && (isZh
                    ? '🐙 GitHub Trending 实时展示当日最热门的开源项目。自动每 30 分钟刷新一次，显示项目名称、描述、编程语言、星标数和当日增量。点击任意项目可直接在新标签页打开 GitHub 仓库。'
                    : '🐙 GitHub Trending shows today\'s hottest open-source projects in real-time. Auto-refreshes every 30 minutes, displaying repo name, description, language, stars, and daily growth. Click any repo to open it in a new tab.')}
                  {selectedType === 'bilibiliHot' && (isZh
                    ? '📺 哔哩哔哩热门榜展示当前 B 站最热门的视频。自动每 30 分钟刷新一次，显示视频标题、UP主、播放量和时长。点击任意视频可直接在新标签页打开 B 站观看。前 3 名带有高亮排名标识。'
                    : '📺 Bilibili Hot shows the most popular videos on Bilibili right now. Auto-refreshes every 30 minutes, displaying title, uploader, views, and duration. Click any video to watch in a new tab. Top 3 are highlighted.')}
                  {selectedType === 'xiaohongshuHot' && (isZh
                    ? '📕 小红书热搜展示当前小红书平台最热门的搜索话题。自动每 30 分钟刷新一次，显示话题标题和热度值。点击任意话题可直接在新标签页打开小红书搜索结果。前 3 名带有红色高亮排名。'
                    : '📕 Xiaohongshu Hot shows the most trending search topics on Xiaohongshu (RED). Auto-refreshes every 30 minutes, displaying topic title and heat score. Click any topic to search on Xiaohongshu in a new tab. Top 3 are highlighted in red.')}
                  {selectedType === 'weiboHot' && (isZh
                    ? '🔥 微博热搜展示当前新浪微博实时热搜榜。自动每 30 分钟刷新一次，显示话题标题、热度值和标签（热/沸/爆/新等）。点击任意话题可直接在新标签页打开微博搜索结果。'
                    : '🔥 Weibo Hot shows real-time trending topics on Sina Weibo. Auto-refreshes every 30 minutes, displaying topic title, heat number, and tags (Hot/Boiling/Explosive/New). Click any topic to search on Weibo in a new tab.')}
                  {selectedType === 'bbcNews' && (isZh
                    ? '📰 BBC News 展示 BBC 最新的新闻头条。自动每 30 分钟刷新一次，显示新闻标题和摘要。点击任意新闻可直接在新标签页打开 BBC 原文阅读。适合关注国际时事的用户。'
                    : '📰 BBC News shows the latest headlines from BBC. Auto-refreshes every 30 minutes, displaying news title and summary. Click any article to read the full story on BBC in a new tab. Great for staying updated on world events.')}
                </p>
              </div>

              {/* Action button — green accent like SettingsModal */}
              <button
                onClick={handleAdd}
                disabled={selectedType === 'countdown' && !targetDate}
                className={`w-full py-3.5 rounded-xl text-[14px] font-bold transition-colors active:scale-[0.98] ${
                  selectedType === 'countdown' && !targetDate
                    ? 'bg-white/10 text-white/30 cursor-not-allowed'
                    : 'bg-[#72d565] hover:bg-[#5bb84f] text-black shadow-lg shadow-[#72d565]/20'
                }`}
              >
                {isEditMode ? t('widget.save') : t('widget.add')}
              </button>
            </div>
          )}
        </div>
        {floatingWindow.resizeHandle}
      </div>
    </div>
  );
};
