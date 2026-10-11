import React from 'react';
import type { DesktopItem, WidgetSize, WeatherWidgetConfig, CountdownWidgetConfig, RemindersWidgetConfig, ClockWidgetConfig, StickyNoteWidgetConfig, StockWidgetConfig, ExchangeRateWidgetConfig, GithubTrendingWidgetConfig } from '../../store/layoutStore';
import { WIDGET_SIZE_MAP } from '../../store/layoutStore';
import { CalendarWidget } from './CalendarWidget';
import { WeatherWidget } from './WeatherWidget';
import { CountdownWidget } from './CountdownWidget';
import { RemindersWidget } from './RemindersWidget';
import { SystemMonitorWidget } from './SystemMonitorWidget';
import { ClockWidget } from './ClockWidget';
import { StickyNoteWidget } from './StickyNoteWidget';
import { StockWidget } from './StockWidget';
import { ExchangeRateWidget } from './ExchangeRateWidget';
import { CalculatorWidget } from './CalculatorWidget';
import { AiAgentWidget } from './AiAgentWidget';
import { GithubTrendingWidget } from './GithubTrendingWidget';
import { BilibiliHotWidget } from './BilibiliHotWidget';
import { XiaohongshuHotWidget } from './XiaohongshuHotWidget';
import { WeiboHotWidget } from './WeiboHotWidget';
import { BBCNewsWidget } from './BBCNewsWidget';

interface DesktopWidgetProps {
  item: DesktopItem;
  isOverlay?: boolean;
  onQuickAddReminder?: () => void;
}

/** Returns the CSS grid-column and grid-row span values for a widget size. */
export function getWidgetGridStyle(size: WidgetSize): React.CSSProperties {
  const { cols, rows } = WIDGET_SIZE_MAP[size];
  return {
    gridColumn: `span ${cols}`,
    gridRow: `span ${rows}`,
  };
}

/** Renders the widget card with glass styling and appropriate content. */
export const DesktopWidget: React.FC<DesktopWidgetProps> = ({ item, isOverlay, onQuickAddReminder }) => {
  const renderWidget = () => {
    const size = item.widgetSize || 'small';
    switch (item.widgetType) {
      case 'calendar':
        return <CalendarWidget size={size} />;
      case 'weather':
        return <WeatherWidget size={size} config={item.widgetConfig as WeatherWidgetConfig} />;
      case 'countdown':
        return <CountdownWidget size={size} config={item.widgetConfig as CountdownWidgetConfig} />;
      case 'reminders':
        return <RemindersWidget size={size} config={item.widgetConfig as RemindersWidgetConfig} onQuickAdd={onQuickAddReminder} />;
      case 'systemMonitor':
        return <SystemMonitorWidget size={size} />;
      case 'clock':
        return <ClockWidget size={size} config={item.widgetConfig as ClockWidgetConfig} />;
      case 'itTools':
        return (
          <div className="w-full h-full flex items-center justify-center select-none overflow-hidden cursor-pointer gap-3 px-4">
            {/* Left: icon container */}
            <div
              className="shrink-0 flex items-center justify-center rounded-xl"
              style={{
                width: 44,
                height: 44,
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
                boxShadow: '0 2px 8px rgba(99,102,241,0.4)',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            </div>
            {/* Right: text */}
            <div className="flex flex-col justify-center min-w-0" style={{ gap: '3px' }}>
              <span className="text-[15px] font-semibold text-white/90 leading-none tracking-tight">
                IT Tools
              </span>
              <span className="text-[11px] text-white/45 leading-none">
                Developer Toolbox
              </span>
            </div>
          </div>
        );
      case 'stickyNote':
        return <StickyNoteWidget size={size} config={item.widgetConfig as StickyNoteWidgetConfig} />;
      case 'stock':
        return <StockWidget size={size} config={item.widgetConfig as StockWidgetConfig} itemId={item.id} />;
      case 'exchangeRate':
        return <ExchangeRateWidget size={size} config={item.widgetConfig as ExchangeRateWidgetConfig} itemId={item.id} />;
      case 'calculator':
        return <CalculatorWidget size={size} />;
      case 'aiAgent':
        return <AiAgentWidget size={size} />;
      case 'githubTrending':
        return <GithubTrendingWidget size={size} config={item.widgetConfig as GithubTrendingWidgetConfig} />;
      case 'bilibiliHot':
        return <BilibiliHotWidget size={size} />;
      case 'xiaohongshuHot':
        return <XiaohongshuHotWidget size={size} />;
      case 'weiboHot':
        return <WeiboHotWidget size={size} />;
      case 'bbcNews':
        return <BBCNewsWidget size={size} />;
      default:
        return (
          <div className="w-full h-full flex items-center justify-center text-white/40 text-xs">
            Unknown Widget
          </div>
        );
    }
  };

  return (
    <div
      className={`widget-container relative w-full h-full overflow-hidden rounded-[20px] border border-white/[0.15] shadow-[0_4px_24px_rgba(0,0,0,0.3)] bg-black/30 backdrop-blur-2xl ${
        isOverlay ? 'shadow-[0_16px_50px_rgba(0,0,0,0.5)]' : ''
      }`}
      style={{
        isolation: 'isolate',
        backfaceVisibility: 'hidden',
        transform: isOverlay ? 'scale(1.02) translateZ(0)' : 'translateZ(0)',
      }}
    >
      {/* Content layer */}
      <div className="widget-content-scale relative w-full h-full">
        {renderWidget()}
      </div>
    </div>
  );
};
