import type { ReminderItem } from '../store/layoutStore';

export function reminderState(item: ReminderItem, now = Date.now()) {
  const due = new Date(item.dueAt).getTime();
  const start = new Date(item.startAt || item.createdAt).getTime();
  const remaining = due - now;
  const duration = Math.max(due - start, 1);
  const elapsed = Math.max(0, Math.min(1, (now - start) / duration));
  const fractionLeft = 1 - elapsed;
  const tone = item.completedAt ? 'done' : remaining <= 0 ? 'overdue' : fractionLeft <= 0.2 ? 'urgent' : fractionLeft <= 0.5 ? 'soon' : 'normal';
  return { remaining, fractionLeft, tone };
}

export function formatReminderPercent(fractionLeft: number) {
  const clamped = Math.max(0, Math.min(1, fractionLeft));
  return String(clamped > 0 ? Math.max(1, Math.floor(clamped * 100)) : 0);
}

export function formatReminderCountdown(item: ReminderItem, isZh: boolean, now = Date.now()) {
  const start = new Date(item.startAt || item.createdAt).getTime();
  const due = new Date(item.dueAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(due)) return isZh ? '时间无效' : 'Invalid time';
  const untilStart = Math.max(0, start - now);
  const overdue = now >= due;
  const totalSeconds = Math.ceil((untilStart || Math.abs(due - now)) / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const clock = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const time = days ? `${days}${isZh ? '天' : 'd'} ${clock}` : clock;
  return `${untilStart ? (isZh ? '即将开始' : 'Starts in') : overdue ? (isZh ? '已逾期' : 'Overdue') : (isZh ? '剩余' : 'Left')} ${time}`;
}

export function formatReminderDue(item: ReminderItem, isZh: boolean, now = Date.now()) {
  const due = new Date(item.dueAt);
  if (Number.isNaN(due.getTime())) return isZh ? '日期无效' : 'Invalid date';
  const day = new Intl.DateTimeFormat(isZh ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' }).format(due);
  const time = new Intl.DateTimeFormat(isZh ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' }).format(due);
  const remaining = due.getTime() - now;
  if (item.completedAt) return `${day} ${time}`;
  if (remaining <= 0) return `${isZh ? '已逾期' : 'Overdue'} · ${day} ${time}`;
  if (remaining < 60 * 60 * 1000) return `${isZh ? '剩余' : 'In'} ${Math.max(1, Math.ceil(remaining / 60000))} ${isZh ? '分钟' : 'min'}`;
  if (remaining < 24 * 60 * 60 * 1000) return `${isZh ? '剩余' : 'In'} ${Math.ceil(remaining / 3600000)} ${isZh ? '小时' : 'h'}`;
  return `${day} ${time}`;
}

export const reminderToneColor: Record<ReturnType<typeof reminderState>['tone'], string> = {
  normal: '#72d565', soon: '#fbbf24', urgent: '#fb923c', overdue: '#fb7185', done: '#94a3b8',
};
