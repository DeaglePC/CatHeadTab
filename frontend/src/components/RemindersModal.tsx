import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DesktopItem, ReminderItem, RemindersWidgetConfig } from '../store/layoutStore';
import { useLayoutStore } from '../store/layoutStore';
import { useTranslation } from '../i18n/useTranslation';
import { formatReminderCountdown, formatReminderDue, formatReminderPercent, reminderState, reminderToneColor } from '../utils/reminders';

const toLocalInput = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const defaultLocalMidnight = (daysFromToday: number) => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  date.setHours(0, 0, 0, 0);
  return toLocalInput(date.toISOString());
};

const inputClass = 'w-full rounded-xl bg-white/[.06] border border-white/10 px-3 py-2.5 text-[13px] text-white placeholder:text-white/30 outline-none focus:border-[#72d565]/70';

const ReminderEditorDialog: React.FC<{
  entry: ReminderItem | null;
  isZh: boolean;
  onClose: () => void;
  onSave: (entry: ReminderItem) => void;
}> = ({ entry, isZh, onClose, onSave }) => {
  const [title, setTitle] = useState(entry?.title ?? '');
  const [startAt, setStartAt] = useState(entry ? toLocalInput(entry.startAt ?? entry.createdAt) : defaultLocalMidnight(0));
  const [dueAt, setDueAt] = useState(entry ? toLocalInput(entry.dueAt) : defaultLocalMidnight(1));
  const [note, setNote] = useState(entry?.note ?? '');
  const [showProgress, setShowProgress] = useState(entry?.showProgress ?? true);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !startAt || !dueAt || Number.isNaN(new Date(startAt).getTime()) || Number.isNaN(new Date(dueAt).getTime())) {
      setError(isZh ? '请填写标题和有效的开始、到期时间' : 'Enter a title and valid start and due times');
      return;
    }
    if (new Date(dueAt).getTime() <= new Date(startAt).getTime()) {
      setError(isZh ? '到期时间需要晚于开始时间' : 'Due time must be after start time');
      return;
    }
    onSave({
      id: entry?.id ?? crypto.randomUUID(),
      title: title.trim(),
      startAt: new Date(startAt).toISOString(),
      dueAt: new Date(dueAt).toISOString(),
      note: note.trim(),
      createdAt: entry?.createdAt ?? new Date().toISOString(),
      completedAt: entry?.completedAt,
      showProgress,
    });
  };

  return createPortal(<div className="fixed inset-0 z-[260] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label={entry ? (isZh ? '编辑提醒事项' : 'Edit reminder') : (isZh ? '新建提醒事项' : 'New reminder')} className="w-full max-w-[460px] max-h-[90vh] overflow-hidden flex flex-col rounded-[22px] border border-white/15 bg-[#202a2f] shadow-2xl text-white">
      <div className="shrink-0 px-5 py-4 border-b border-white/10 flex items-center justify-between">
        <h2 className="text-[17px] font-semibold">{entry ? (isZh ? '编辑提醒事项' : 'Edit reminder') : (isZh ? '新建提醒事项' : 'New reminder')}</h2>
        <button type="button" onClick={onClose} aria-label={isZh ? '关闭' : 'Close'} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/70">×</button>
      </div>
      <form onSubmit={save} className="overflow-y-auto p-5 space-y-4">
        <label className="block text-[11px] text-white/55">{isZh ? '标题' : 'Title'}<input ref={titleRef} className={`${inputClass} mt-1`} maxLength={100} required value={title} onChange={event => setTitle(event.target.value)} placeholder={isZh ? '要完成什么？' : 'What needs doing?'} /></label>
        <label className="block text-[11px] text-white/55">{isZh ? '开始日期与时间' : 'Start date and time'}<input type="datetime-local" className={`${inputClass} mt-1 [color-scheme:dark]`} required value={startAt} onChange={event => setStartAt(event.target.value)} /></label>
        <label className="block text-[11px] text-white/55">{isZh ? '到期日期与时间' : 'Due date and time'}<input type="datetime-local" className={`${inputClass} mt-1 [color-scheme:dark]`} required value={dueAt} onChange={event => setDueAt(event.target.value)} /></label>
        <label className="block text-[11px] text-white/55">{isZh ? '备注（仅展开时显示）' : 'Note (shown when expanded)'}<textarea className={`${inputClass} mt-1 min-h-24 resize-y`} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} placeholder={isZh ? '补充细节，可留空' : 'Details, optional'} /></label>
        <label className="flex items-center gap-2 text-[12px] text-white/75 cursor-pointer"><input type="checkbox" checked={showProgress} onChange={event => setShowProgress(event.target.checked)} className="accent-[#72d565]" />{isZh ? '显示剩余时间进度条' : 'Show remaining time bar'}</label>
        {error && <div role="alert" className="text-[12px] text-rose-300">{error}</div>}
        <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-[13px]">{isZh ? '取消' : 'Cancel'}</button><button type="submit" className="px-4 py-2 rounded-xl bg-[#72d565] hover:bg-[#86e077] text-[#162116] text-[13px] font-bold">{entry ? (isZh ? '保存修改' : 'Save changes') : (isZh ? '创建' : 'Create')}</button></div>
      </form>
    </div>
  </div>, document.body);
};

export const RemindersModal: React.FC<{ item: DesktopItem; onClose: () => void; quickCreate?: boolean }> = ({ item, onClose, quickCreate = false }) => {
  const { language } = useTranslation();
  const isZh = language === 'zh';
  const config = useLayoutStore(state => state.layout.pages.flat().find(candidate => candidate.id === item.id)?.widgetConfig) as RemindersWidgetConfig | undefined;
  const updateWidgetConfig = useLayoutStore(state => state.updateWidgetConfig);
  const items = config?.items ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedCompletedId, setExpandedCompletedId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedCompletedIds, setSelectedCompletedIds] = useState<string[]>([]);
  const [editor, setEditor] = useState<{ key: string; entry: ReminderItem | null } | null>(() => quickCreate ? { key: 'new', entry: null } : null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (editor) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, onClose]);

  const saveItems = (next: ReminderItem[]) => updateWidgetConfig(item.id, { widgetType: 'reminders', items: next });
  const saveEntry = (entry: ReminderItem) => {
    saveItems(items.some(value => value.id === entry.id) ? items.map(value => value.id === entry.id ? entry : value) : [...items, entry]);
    setExpandedId(entry.id);
    setEditor(null);
    if (quickCreate) onClose();
  };
  const closeEditor = () => { setEditor(null); if (quickCreate) onClose(); };
  const toggleComplete = (entry: ReminderItem) => {
    saveItems(items.map(value => value.id === entry.id ? { ...value, completedAt: value.completedAt ? undefined : new Date().toISOString() } : value));
    setSelectedCompletedIds(ids => ids.filter(id => id !== entry.id));
    setExpandedId(null);
  };
  const sorted = items.filter(entry => !entry.completedAt).sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const completed = items.filter(entry => !!entry.completedAt).sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());
  const toggleCompletedSelection = (id: string) => setSelectedCompletedIds(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]);
  const deleteSelectedCompleted = () => {
    if (selectedCompletedIds.length === 0) return;
    if (!window.confirm(isZh ? `删除选中的 ${selectedCompletedIds.length} 条已完成事项？` : `Delete ${selectedCompletedIds.length} selected completed reminders?`)) return;
    const selected = new Set(selectedCompletedIds);
    saveItems(items.filter(entry => !selected.has(entry.id)));
    setSelectedCompletedIds([]);
  };
  const deleteCompleted = (entry: ReminderItem) => {
    if (!window.confirm(isZh ? `删除“${entry.title}”？` : `Delete “${entry.title}”?`)) return;
    saveItems(items.filter(value => value.id !== entry.id));
    setSelectedCompletedIds(ids => ids.filter(id => id !== entry.id));
    setExpandedCompletedId(null);
  };

  return <>
    {!quickCreate && createPortal(<div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/65 backdrop-blur-md" onMouseDown={event => { if (event.target === event.currentTarget && !editor) onClose(); }}>
      <div role="dialog" aria-modal={!editor} aria-label={isZh ? '提醒事项管理' : 'Manage reminders'} className={`relative w-full ${showCompleted ? 'sm:max-w-[900px]' : 'max-w-[560px]'} h-[min(760px,90vh)] overflow-hidden flex flex-col rounded-[24px] border border-white/15 bg-[#202a2f] shadow-2xl text-white transition-[max-width] duration-200`}>
      <div className="flex flex-1 min-h-0">
      <div className="min-w-0 flex-1 flex flex-col">
        <div className="shrink-0 px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div><h2 className="text-[18px] font-semibold">{isZh ? '提醒事项' : 'Reminders'}</h2><p className="text-[11px] text-white/45 mt-0.5">{isZh ? `${sorted.length} 项待完成` : `${sorted.length} to do`}</p></div>
          <div className="flex items-center gap-2"><button type="button" onClick={() => setShowCompleted(value => !value)} aria-expanded={showCompleted} className={`px-2.5 h-9 rounded-xl text-[11px] font-medium whitespace-nowrap ${showCompleted ? 'bg-white/15 text-white' : 'bg-white/[.07] text-white/65 hover:bg-white/10'}`}>{isZh ? '已完成' : 'Done'} {completed.length} {showCompleted ? '‹' : '›'}</button><button type="button" onClick={() => setEditor({ key: 'new', entry: null })} aria-label={isZh ? '新建提醒事项' : 'New reminder'} title={isZh ? '新建提醒事项' : 'New reminder'} className="w-9 h-9 rounded-xl bg-[#72d565] hover:bg-[#86e077] text-[#162116] text-[23px] leading-none flex items-center justify-center">＋</button><button type="button" onClick={onClose} aria-label={isZh ? '关闭' : 'Close'} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/70">×</button></div>
        </div>
        <div className="overflow-y-auto min-h-0 p-5 space-y-2">
          {sorted.length === 0 && <div className="py-16 text-center"><div className="text-3xl mb-2">✦</div><div className="text-[13px] text-white/55">{completed.length ? (isZh ? '所有提醒都已完成' : 'All reminders completed') : (isZh ? '还没有提醒事项，点击右上角 ＋ 创建' : 'No reminders yet. Use + to create one.')}</div></div>}
          {sorted.map(entry => { const state = reminderState(entry, now); const color = reminderToneColor[state.tone]; const expanded = expandedId === entry.id; return <div key={entry.id} className="rounded-2xl border border-white/10 bg-white/[.045] overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <button type="button" onClick={() => toggleComplete(entry)} aria-label={isZh ? '标记完成' : 'Mark complete'} className="w-5 h-5 shrink-0 rounded-full border-2" style={{ borderColor: color }} />
              <button type="button" onClick={() => setExpandedId(expanded ? null : entry.id)} aria-expanded={expanded} className="flex-1 min-w-0 text-left"><div className="text-[13px] font-semibold truncate text-white/90">{entry.title}</div><div className="text-[11px] mt-0.5" style={{ color }}>{formatReminderDue(entry, isZh, now)}</div></button>
              <button type="button" onClick={() => setExpandedId(expanded ? null : entry.id)} aria-label={isZh ? '展开详情' : 'Expand details'} className="text-white/45 text-sm">{expanded ? '⌃' : '⌄'}</button>
            </div>
            {entry.showProgress && !entry.completedAt && <div className="mx-4 mb-3">
              <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums mb-1" style={{ color }}><span>{formatReminderCountdown(entry, isZh, now)}</span><span>{formatReminderPercent(state.fractionLeft)}%</span></div>
              <div role="progressbar" aria-label={isZh ? '剩余时间' : 'Time remaining'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(formatReminderPercent(state.fractionLeft))} className="h-1.5 rounded-full bg-white/15 overflow-hidden"><div className="h-full rounded-full transition-all duration-1000 ease-linear" style={{ width: `${state.fractionLeft * 100}%`, minWidth: state.remaining > 0 ? 6 : 0, background: color }} /></div>
            </div>}
            {expanded && <div className="border-t border-white/10 px-4 py-3 space-y-3"><p className="text-[12px] whitespace-pre-wrap break-words text-white/65">{entry.note || (isZh ? '无备注' : 'No note')}</p><div className="flex gap-3 text-[12px]"><button type="button" onClick={() => setEditor({ key: entry.id, entry })} className="text-[#a3d7ac] hover:text-[#72d565]">{isZh ? '编辑' : 'Edit'}</button><button type="button" onClick={() => { if (window.confirm(isZh ? '删除这条提醒事项？' : 'Delete this reminder?')) { saveItems(items.filter(value => value.id !== entry.id)); setExpandedId(null); } }} className="text-rose-300 hover:text-rose-200">{isZh ? '删除' : 'Delete'}</button></div></div>}
          </div>; })}
        </div>
      </div>
      {showCompleted && <aside className="absolute inset-y-0 right-0 w-[min(320px,100%)] sm:static sm:w-[320px] shrink-0 flex flex-col border-l border-white/10 bg-[#192328] shadow-[-12px_0_30px_rgba(0,0,0,0.18)]">
        <div className="shrink-0 px-4 py-4 border-b border-white/10 flex items-center justify-between gap-2"><div><h3 className="text-[15px] font-semibold">{isZh ? '已完成' : 'Completed'}</h3><p className="text-[11px] text-white/40">{completed.length} {isZh ? '项' : 'items'}</p></div><button type="button" onClick={() => setShowCompleted(false)} aria-label={isZh ? '收起已完成栏目' : 'Collapse completed panel'} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition-colors"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14.5 18-6-6 6-6" /></svg></button></div>
        <div className="shrink-0 px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2"><label className="flex items-center gap-2 text-[11px] text-white/60 cursor-pointer"><input type="checkbox" className="accent-[#72d565]" checked={completed.length > 0 && selectedCompletedIds.length === completed.length} onChange={event => setSelectedCompletedIds(event.target.checked ? completed.map(entry => entry.id) : [])} disabled={completed.length === 0} />{isZh ? '全选' : 'Select all'}</label><button type="button" onClick={deleteSelectedCompleted} disabled={selectedCompletedIds.length === 0} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-rose-200 bg-rose-500/15 hover:bg-rose-500/25 disabled:opacity-35 disabled:cursor-not-allowed">{isZh ? `删除所选 ${selectedCompletedIds.length}` : `Delete selected ${selectedCompletedIds.length}`}</button></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
          {completed.length === 0 && <div className="text-center text-[12px] text-white/40 py-12">{isZh ? '暂无已完成事项' : 'No completed reminders'}</div>}
          {completed.map(entry => <div key={entry.id} className="rounded-xl border border-white/[.08] bg-white/[.045] px-3 py-2.5 flex items-start gap-2.5">
            <input type="checkbox" aria-label={`${isZh ? '选择' : 'Select'} ${entry.title}`} checked={selectedCompletedIds.includes(entry.id)} onChange={() => toggleCompletedSelection(entry.id)} className="mt-0.5 accent-[#72d565] shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-1">
                <button type="button" onClick={() => setExpandedCompletedId(id => id === entry.id ? null : entry.id)} aria-expanded={expandedCompletedId === entry.id} className="min-w-0 flex-1 text-left text-[12px] text-white/65 line-through break-words">{entry.title}</button>
                <button type="button" onClick={() => toggleComplete(entry)} aria-label={isZh ? `恢复${entry.title}` : `Restore ${entry.title}`} title={isZh ? '恢复' : 'Restore'} className="w-7 h-7 shrink-0 -mt-1 rounded-lg flex items-center justify-center text-[#a3d7ac] hover:bg-white/10 hover:text-[#72d565]"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg></button>
                <button type="button" onClick={() => deleteCompleted(entry)} aria-label={isZh ? `删除${entry.title}` : `Delete ${entry.title}`} title={isZh ? '删除' : 'Delete'} className="w-7 h-7 shrink-0 -mt-1 rounded-lg flex items-center justify-center text-rose-300/70 hover:bg-rose-500/15 hover:text-rose-200"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m5 6 1 14h12l1-14"/><path d="M10 10v6M14 10v6"/></svg></button>
              </div>
              <div className="text-[10px] text-white/35 mt-1">{isZh ? '完成于' : 'Completed'} {new Date(entry.completedAt!).toLocaleString(isZh ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              {expandedCompletedId === entry.id && <p className="text-[11px] text-white/50 whitespace-pre-wrap break-words mt-2">{entry.note || (isZh ? '无备注' : 'No note')}</p>}
            </div>
          </div>)}
        </div>
      </aside>}
      </div>
      </div>
    </div>, document.body)}
    {editor && <ReminderEditorDialog key={editor.key} entry={editor.entry} isZh={isZh} onClose={closeEditor} onSave={saveEntry} />}
  </>;
};
