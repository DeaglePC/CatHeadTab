import React, { useEffect, useState } from 'react';
import type { RemindersWidgetConfig, WidgetSize } from '../../store/layoutStore';
import { useTranslation } from '../../i18n/useTranslation';
import { formatReminderCountdown, formatReminderDue, formatReminderPercent, reminderState, reminderToneColor } from '../../utils/reminders';

export const RemindersWidget: React.FC<{ size: WidgetSize; config?: RemindersWidgetConfig; onQuickAdd?: () => void }> = ({ size, config, onQuickAdd }) => {
  const { language } = useTranslation();
  const isZh = language === 'zh';
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const items = (config?.items ?? []).filter(item => !item.completedAt)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const active = items.length;
  const isLarge = size === 'xlarge';

  return (
    <div className="w-full h-full flex flex-col overflow-hidden text-white select-none">
      <div className="shrink-0 flex items-center justify-between px-3 pt-2.5 pb-1.5 border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[15px]">✅</span>
          <span className="text-[13px] font-semibold text-white/90 truncate">{isZh ? '提醒事项' : 'Reminders'}</span>
          <span className="text-[10px] text-white/40">{active}</span>
        </div>
        {onQuickAdd && <button
          type="button"
          aria-label={isZh ? '快速创建提醒事项' : 'Quick add reminder'}
          title={isZh ? '快速创建' : 'Quick add'}
          onPointerDown={event => event.stopPropagation()}
          onMouseDown={event => event.stopPropagation()}
          onTouchStart={event => event.stopPropagation()}
          onClick={event => { event.stopPropagation(); onQuickAdd(); }}
          className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 text-[19px] leading-none flex items-center justify-center"
        >＋</button>}
      </div>
      <div
        className={`reminders-widget-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2 ${isLarge ? 'grid grid-cols-2 content-start gap-2' : 'space-y-1.5'}`}
        style={{ touchAction: 'pan-y' }}
        onPointerDown={event => event.stopPropagation()}
        onMouseDown={event => event.stopPropagation()}
        onTouchStart={event => event.stopPropagation()}
        onTouchMove={event => event.stopPropagation()}
        onWheel={event => event.stopPropagation()}
      >
        {items.length === 0 ? (
          <div className={`${isLarge ? 'col-span-2' : ''} h-full flex flex-col items-center justify-center text-center px-3`}>
            <div className="text-3xl mb-2">✦</div>
            <div className="text-sm font-semibold text-white/80">{isZh ? '从一件小事开始' : 'Start with one thing'}</div>
            <div className="text-[11px] text-white/45 mt-1">{isZh ? '点击添加提醒事项' : 'Click to add a reminder'}</div>
          </div>
        ) : items.map(item => {
          const state = reminderState(item, now);
          const color = reminderToneColor[state.tone];
          return <div key={item.id} className="rounded-xl bg-white/[.055] border border-white/[.07] px-2.5 py-2">
            <div className="flex items-start gap-2">
              <div className="mt-0.5 w-3.5 h-3.5 rounded-full shrink-0 border-2" style={{ borderColor: color }} />
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold truncate leading-4 text-white/90">{item.title}</div>
                <div className="text-[10px] mt-0.5 truncate" style={{ color }}>{formatReminderDue(item, isZh, now)}</div>
              </div>
            </div>
            {item.showProgress && <div className="mt-2">
              <div className="flex items-center justify-between gap-1 text-[9px] tabular-nums mb-1" style={{ color }}>
                <span className="truncate">{formatReminderCountdown(item, isZh, now)}</span>
                <span className="shrink-0">{formatReminderPercent(state.fractionLeft)}%</span>
              </div>
              <div role="progressbar" aria-label={isZh ? '剩余时间' : 'Time remaining'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(formatReminderPercent(state.fractionLeft))} className="h-1.5 rounded-full bg-white/15 overflow-hidden"><div className="h-full rounded-full transition-all duration-1000 ease-linear" style={{ width: `${state.fractionLeft * 100}%`, minWidth: state.remaining > 0 ? 6 : 0, background: color }} /></div>
            </div>}
          </div>;
        })}
      </div>
    </div>
  );
};
