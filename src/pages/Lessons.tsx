import React, { useMemo, useState } from 'react';
import { useAppContext } from '../store/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select, Field, Badge, Modal, StatCard, PageHeader, EmptyRow, BadgeTone } from '../components/ui/Misc';
import { Lesson, Attendance, MakeupRequest, ParentMessage } from '../types';
import { ClipboardCheck, Plus, CalendarPlus, ChevronLeft, ChevronRight, ArrowLeft, CheckCircle2, XCircle, Lock, Unlock, Trash2, Ban, Send, Edit2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import Swal from 'sweetalert2';
import {
  parseRole, roleDisplayName, getClassStudents, getActiveReservation, computeProgress, absenceMessage,
  toVnWeekday, WEEKDAY_LABELS, nowStr,
} from '../lib/academic';

type AttStatus = Attendance['status'];
interface DraftRow { status?: AttStatus; note?: string }

const STATUS_BADGE: Record<Lesson['attendanceStatus'], { label: string; tone: BadgeTone }> = {
  open: { label: 'Chưa điểm danh', tone: 'amber' },
  submitted: { label: 'Chờ duyệt', tone: 'blue' },
  approved: { label: 'Đã chốt', tone: 'green' },
};

const addMinutes = (time: string, minutes: number) => {
  const [h, m] = time.split(':').map(Number);
  return dayjs().hour(h || 0).minute(m || 0).add(minutes, 'minute').format('HH:mm');
};

// "T3, CN - 18:00" → { days: [3, 8], time: '18:00' }
const parseSchedule = (schedule: string) => {
  const days: number[] = [];
  (schedule.toUpperCase().match(/T[2-7]|CN/g) || []).forEach(tok => {
    const d = tok === 'CN' ? 8 : Number(tok.slice(1));
    if (!days.includes(d)) days.push(d);
  });
  const t = schedule.match(/(\d{1,2})[:hH](\d{2})?/);
  const time = t ? `${t[1].padStart(2, '0')}:${t[2] || '00'}` : '18:00';
  return { days, time };
};

const Lessons: React.FC = () => {
  const { data, updateData, logActivity } = useAppContext();
  const role = parseRole(data.settings.activeRole);
  const isManager = role.kind === 'manager';
  const actor = roleDisplayName(data);
  const policies = data.settings.policies;

  const myClasses = useMemo(
    () => (role.kind === 'teacher' ? data.classes.filter(c => c.teacherId === role.id) : data.classes),
    [data.classes, role.kind, role.id]
  );

  const [filterClass, setFilterClass] = useState('all');
  const [weekStart, setWeekStart] = useState(() => {
    const d = dayjs();
    return d.subtract((d.day() + 6) % 7, 'day').format('YYYY-MM-DD');
  });
  const [showAll, setShowAll] = useState(false);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, DraftRow>>({});
  const [lessonMeta, setLessonMeta] = useState({ topic: '', teacherNote: '' });

  // Modal tạo lịch
  const [genOpen, setGenOpen] = useState(false);
  const [gen, setGen] = useState({ classId: '', fromDate: dayjs().format('YYYY-MM-DD'), count: 8, days: [] as number[], startTime: '18:00', endTime: '19:30', skipHolidays: true });
  // Modal thêm 1 buổi
  const [oneOpen, setOneOpen] = useState(false);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [one, setOne] = useState({ classId: '', date: dayjs().format('YYYY-MM-DD'), startTime: '18:00', endTime: '19:30', teacherId: '', topic: '', isMakeup: false });

  const today = dayjs().format('YYYY-MM-DD');
  const weekEnd = dayjs(weekStart).add(6, 'day').format('YYYY-MM-DD');
  const myClassIds = myClasses.map(c => c.id);

  const visibleLessons = useMemo(() => data.lessons
    .filter(l => myClassIds.includes(l.classId) || (role.kind === 'teacher' && l.teacherId === role.id))
    .filter(l => filterClass === 'all' || l.classId === filterClass)
    .filter(l => showAll || (l.date >= weekStart && l.date <= weekEnd))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)),
    [data.lessons, myClassIds.join(), filterClass, showAll, weekStart, weekEnd, role.kind, role.id]
  );

  const scopeLessons = data.lessons.filter(l => myClassIds.includes(l.classId));
  const todayCount = scopeLessons.filter(l => l.date === today && l.status !== 'cancelled').length;
  const overdue = scopeLessons.filter(l => l.date <= today && l.attendanceStatus === 'open' && l.status !== 'cancelled').length;
  const pendingApproval = scopeLessons.filter(l => l.attendanceStatus === 'submitted').length;

  const isHoliday = (date: string) => data.holidays.find(h => date >= h.startDate && date <= h.endDate);

  // ===== Tạo lịch tự động =====
  const openGenerate = (classId?: string) => {
    const cls = data.classes.find(c => c.id === (classId || myClasses[0]?.id));
    if (!cls) return Swal.fire('Chưa có lớp', 'Hãy tạo lớp học trước.', 'info');
    const slots = data.timetableSlots.filter(s => s.classId === cls.id);
    let days: number[]; let startTime: string; let endTime: string;
    if (slots.length > 0) {
      days = Array.from(new Set<number>(slots.map(s => s.dayOfWeek))).sort();
      const t = data.settings.slotTimes[slots[0].period]?.[String(slots[0].slotIndex)];
      startTime = t?.start.padStart(5, '0') || '18:00';
      endTime = t?.end.padStart(5, '0') || addMinutes(startTime, 90);
    } else {
      const parsed = parseSchedule(cls.schedule || '');
      days = parsed.days; startTime = parsed.time; endTime = addMinutes(parsed.time, 90);
    }
    const existing = data.lessons.filter(l => l.classId === cls.id && l.status !== 'cancelled').length;
    const lastLesson = data.lessons.filter(l => l.classId === cls.id).sort((a, b) => b.date.localeCompare(a.date))[0];
    const fromDate = lastLesson ? dayjs(lastLesson.date).add(1, 'day').format('YYYY-MM-DD') : (cls.startDate || today);
    const count = cls.totalSessions ? Math.max(cls.totalSessions - existing, 1) : 8;
    setGen({ classId: cls.id, fromDate, count, days, startTime, endTime, skipHolidays: true });
    setGenOpen(true);
  };

  const generateLessons = () => {
    const cls = data.classes.find(c => c.id === gen.classId);
    if (!cls) return;
    if (gen.days.length === 0) return Swal.fire('Lỗi', 'Chọn ít nhất 1 thứ trong tuần', 'error');
    const existingDates = new Set(data.lessons.filter(l => l.classId === cls.id && !l.makeupOnly).map(l => l.date));
    const created: Lesson[] = [];
    let skipped = 0;
    let d = dayjs(gen.fromDate);
    for (let guard = 0; created.length < gen.count && guard < 730; guard++, d = d.add(1, 'day')) {
      const ds = d.format('YYYY-MM-DD');
      if (!gen.days.includes(toVnWeekday(ds))) continue;
      if (existingDates.has(ds)) continue;
      if (gen.skipHolidays && isHoliday(ds)) { skipped++; continue; }
      created.push({
        id: uuidv4(), classId: cls.id, date: ds, startTime: gen.startTime, endTime: gen.endTime,
        teacherId: cls.teacherId, roomId: cls.roomId, status: 'scheduled', attendanceStatus: 'open',
      });
    }
    updateData(prev => ({ lessons: [...prev.lessons, ...created] }));
    logActivity('add', 'lesson', cls.name, `Tạo ${created.length} buổi học`);
    setGenOpen(false);
    Swal.fire('Đã tạo lịch', `Tạo ${created.length} buổi cho lớp ${cls.name}${skipped ? `, bỏ qua ${skipped} ngày nghỉ lễ` : ''}.`, 'success');
  };

  const openEditLesson = (l: Lesson) => {
    setEditingLessonId(l.id);
    setOne({ classId: l.classId, date: l.date, startTime: l.startTime, endTime: l.endTime, teacherId: l.teacherId, topic: l.topic || '', isMakeup: !!l.isMakeup });
    setOneOpen(true);
  };

  const addOneLesson = () => {
    const cls = data.classes.find(c => c.id === one.classId);
    if (!cls) return Swal.fire('Lỗi', 'Chọn lớp học', 'error');
    if (one.endTime <= one.startTime) return Swal.fire('Lỗi', 'Giờ kết thúc phải sau giờ bắt đầu', 'error');
    if (editingLessonId) {
      updateData(prev => ({
        lessons: prev.lessons.map(l => l.id === editingLessonId ? { ...l, classId: cls.id, date: one.date, startTime: one.startTime, endTime: one.endTime, teacherId: one.teacherId || cls.teacherId, topic: one.topic, isMakeup: one.isMakeup } : l),
        // Đổi ngày buổi học → cập nhật ngày của các bản ghi điểm danh / học bù liên quan
        attendances: prev.attendances.map(a => a.lessonId === editingLessonId ? { ...a, date: one.date, classId: cls.id } : a),
        makeups: prev.makeups.map(m => m.makeupLessonId === editingLessonId ? { ...m, makeupDate: one.date } : m),
      }));
      setOneOpen(false);
      setEditingLessonId(null);
      return Swal.fire({ title: 'Đã cập nhật buổi học', icon: 'success', timer: 1200, showConfirmButton: false });
    }
    const lesson: Lesson = {
      id: uuidv4(), classId: cls.id, date: one.date, startTime: one.startTime, endTime: one.endTime,
      teacherId: one.teacherId || cls.teacherId, roomId: cls.roomId, topic: one.topic,
      status: 'scheduled', attendanceStatus: 'open', isMakeup: one.isMakeup,
    };
    updateData(prev => ({ lessons: [...prev.lessons, lesson] }));
    setOneOpen(false);
    Swal.fire({ title: 'Đã thêm buổi học', icon: 'success', timer: 1200, showConfirmButton: false });
  };

  const cancelLesson = (l: Lesson) => {
    Swal.fire({
      title: 'Hủy buổi học?', input: 'text', inputPlaceholder: 'Lý do (sẽ gửi kèm thông báo)',
      text: 'Học viên/người giám hộ của lớp sẽ nhận thông báo thay đổi lịch học.',
      showCancelButton: true, confirmButtonText: 'Hủy buổi & thông báo', cancelButtonText: 'Đóng'
    }).then(r => {
      if (!r.isConfirmed) return;
      const cls = data.classes.find(c => c.id === l.classId);
      const msgs: ParentMessage[] = getClassStudents(data, l.classId).map(s => ({
        id: uuidv4(), studentId: s.id, type: 'schedule', classId: l.classId, channel: 'app', sender: actor,
        title: `Hủy buổi học ${dayjs(l.date).format('DD/MM')}`,
        content: `Trung tâm thông báo: buổi học lớp ${cls?.name || ''} ngày ${dayjs(l.date).format('DD/MM/YYYY')} (${l.startTime}) tạm nghỉ${r.value ? `. Lý do: ${r.value}` : ''}. Lịch học bù sẽ được thông báo sau.`,
        sentAt: nowStr(), status: 'sent',
      }));
      updateData(prev => ({
        lessons: prev.lessons.map(x => x.id === l.id ? { ...x, status: 'cancelled', teacherNote: r.value || x.teacherNote } : x),
        parentMessages: [...prev.parentMessages, ...msgs],
      }));
      logActivity('edit', 'lesson', cls?.name || '', `Hủy buổi ${l.date}`);
    });
  };

  const deleteLesson = (l: Lesson) => {
    Swal.fire({ title: 'Xóa buổi học?', text: 'Dữ liệu điểm danh của buổi này cũng bị xóa.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy' }).then(r => {
      if (!r.isConfirmed) return;
      updateData(prev => ({
        lessons: prev.lessons.filter(x => x.id !== l.id),
        attendances: prev.attendances.filter(a => a.lessonId !== l.id),
        makeups: prev.makeups.map(m => m.makeupLessonId === l.id ? { ...m, makeupLessonId: undefined, makeupDate: undefined, status: 'pending' } : m),
      }));
    });
  };

  // ===== Điểm danh =====
  const findRecord = (l: Lesson, studentId: string) =>
    data.attendances.find(a => a.studentId === studentId && (a.lessonId === l.id || (!a.lessonId && a.classId === l.classId && a.date === l.date)));

  const openAttendance = (l: Lesson) => {
    const init: Record<string, DraftRow> = {};
    getClassStudents(data, l.classId).forEach(s => {
      const rec = findRecord(l, s.id);
      if (rec) init[s.id] = { status: rec.status, note: rec.note };
    });
    data.makeups.filter(m => m.makeupLessonId === l.id).forEach(m => {
      if (m.status === 'done') init[`mk:${m.id}`] = { status: 'present' };
    });
    setDraft(init);
    setLessonMeta({ topic: l.topic || '', teacherNote: l.teacherNote || '' });
    setSelectedLessonId(l.id);
  };

  const selectedLesson = data.lessons.find(l => l.id === selectedLessonId);

  if (selectedLesson) {
    const l = selectedLesson;
    const cls = data.classes.find(c => c.id === l.classId);
    const teacher = data.teachers.find(t => t.id === l.teacherId);
    const students = l.makeupOnly ? [] : getClassStudents(data, l.classId);
    const activeStudents = students.filter(s => !getActiveReservation(data, s.id, l.classId) && s.applicationStatus !== 'inactive');
    const reservedStudents = students.filter(s => getActiveReservation(data, s.id, l.classId));
    const makeupStudents = data.makeups.filter(m => m.makeupLessonId === l.id);
    const locked = l.attendanceStatus !== 'open' && !isManager;
    const marked = activeStudents.filter(s => draft[s.id]?.status).length;

    const setRow = (key: string, patch: DraftRow) => setDraft(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    const markAll = () => setDraft(prev => {
      const next = { ...prev };
      activeStudents.forEach(s => { next[s.id] = { ...next[s.id], status: 'present' }; });
      return next;
    });

    const persist = (submit: boolean) => {
      if (submit && marked < activeStudents.length) {
        return Swal.fire('Chưa đủ', `Còn ${activeStudents.length - marked} học viên chưa điểm danh.`, 'warning');
      }
      updateData(prev => {
        const newMessages: ParentMessage[] = [];
        const newMakeups: MakeupRequest[] = [];
        const attendances = [...prev.attendances];
        activeStudents.forEach(s => {
          const row = draft[s.id];
          if (!row?.status) return;
          const idx = attendances.findIndex(a => a.studentId === s.id && (a.lessonId === l.id || (!a.lessonId && a.classId === l.classId && a.date === l.date)));
          const rec: Attendance = { id: idx > -1 ? attendances[idx].id : uuidv4(), classId: l.classId, studentId: s.id, date: l.date, status: row.status, lessonId: l.id, note: row.note };
          if (idx > -1) attendances[idx] = rec; else attendances.push(rec);

          if (submit && row.status !== 'present') {
            const excused = row.status === 'excused';
            const alreadyNotified = prev.parentMessages.some(m => m.studentId === s.id && m.type === 'absence' && m.classId === l.classId && m.title?.includes(dayjs(l.date).format('DD/MM')));
            if (policies.autoNotifyAbsence && !alreadyNotified) newMessages.push(absenceMessage(prev, s, l.classId, l.date, excused, actor));
            const eligible = excused || !policies.makeupForExcusedOnly;
            const hasMakeup = prev.makeups.some(m => m.studentId === s.id && m.absenceLessonId === l.id);
            if (eligible && !hasMakeup) {
              newMakeups.push({ id: uuidv4(), studentId: s.id, classId: l.classId, absentDate: l.date, absenceLessonId: l.id, status: 'pending', createdAt: today, note: row.note });
            }
          }
        });
        const makeups = prev.makeups.map(m => {
          if (m.makeupLessonId !== l.id) return m;
          const row = draft[`mk:${m.id}`];
          if (row?.status === 'present') return { ...m, status: 'done' as const };
          if (row?.status) return { ...m, status: 'scheduled' as const, note: `Vắng buổi học bù ${dayjs(l.date).format('DD/MM')}` };
          return m;
        });
        const lessons = prev.lessons.map(x => x.id !== l.id ? x : {
          ...x, topic: lessonMeta.topic, teacherNote: lessonMeta.teacherNote,
          ...(submit ? {
            status: 'done' as const,
            attendanceStatus: (policies.requireAttendanceApproval && !isManager ? 'submitted' : 'approved') as Lesson['attendanceStatus'],
            submittedAt: nowStr(), submittedBy: actor,
            approvedAt: policies.requireAttendanceApproval && !isManager ? undefined : nowStr(),
          } : {}),
        });
        return { attendances, lessons, makeups: [...makeups, ...newMakeups], parentMessages: [...prev.parentMessages, ...newMessages] };
      });
      if (submit) {
        logActivity('edit', 'attendance', cls?.name || '', `Chốt điểm danh buổi ${dayjs(l.date).format('DD/MM/YYYY')}`);
        const absentees = activeStudents.filter(s => draft[s.id]?.status && draft[s.id]?.status !== 'present');
        const makeupCount = absentees.filter(s => draft[s.id]?.status === 'excused' || !policies.makeupForExcusedOnly).length;
        Swal.fire('Đã chốt điểm danh', absentees.length > 0
          ? `${absentees.length} học viên vắng${policies.autoNotifyAbsence ? ' — đã gửi thông báo vắng mặt đến người nhận phù hợp' : ''}.${makeupCount ? ` Đã tạo ${makeupCount} yêu cầu học bù.` : ''}`
          : 'Tất cả học viên có mặt.', 'success');
        setSelectedLessonId(null);
      } else {
        Swal.fire({ title: 'Đã lưu tạm', icon: 'success', timer: 1000, showConfirmButton: false });
      }
    };

    const approve = () => {
      updateData(prev => ({ lessons: prev.lessons.map(x => x.id === l.id ? { ...x, attendanceStatus: 'approved', approvedAt: nowStr() } : x) }));
      Swal.fire({ title: 'Đã duyệt điểm danh', icon: 'success', timer: 1000, showConfirmButton: false });
    };
    const reopen = () => {
      updateData(prev => ({ lessons: prev.lessons.map(x => x.id === l.id ? { ...x, attendanceStatus: 'open' } : x) }));
    };

    const statusButtons = (key: string, current?: AttStatus, disabled?: boolean) => (
      <div className="flex gap-1.5 justify-center">
        {([['present', 'Có mặt', 'bg-emerald-500 hover:bg-emerald-600'], ['absent', 'Vắng', 'bg-red-500 hover:bg-red-600'], ['excused', 'Có phép', 'bg-amber-500 hover:bg-amber-600']] as const).map(([st, label, cls]) => (
          <Button key={st} size="sm" disabled={disabled}
            className={`gap-1 ${current === st ? `${cls} text-white` : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
            onClick={() => setRow(key, { status: st })}>
            {st === 'present' ? <CheckCircle2 className="w-4 h-4" /> : st === 'absent' ? <XCircle className="w-4 h-4" /> : null}{label}
          </Button>
        ))}
      </div>
    );

    return (
      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => setSelectedLessonId(null)} className="h-10 w-10 p-0 rounded-full bg-slate-100 hover:bg-slate-200"><ArrowLeft className="w-5 h-5" /></Button>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Điểm danh: {cls?.name} {l.isMakeup && <Badge tone="purple">Buổi bù</Badge>}</h2>
              <p className="text-sm text-slate-500">{WEEKDAY_LABELS[toVnWeekday(l.date)]}, {dayjs(l.date).format('DD/MM/YYYY')} • {l.startTime}–{l.endTime} • GV: {teacher?.name || '-'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone={STATUS_BADGE[l.attendanceStatus].tone}>{STATUS_BADGE[l.attendanceStatus].label}</Badge>
            {isManager && l.attendanceStatus === 'submitted' && <Button size="sm" onClick={approve} className="gap-1"><CheckCircle2 className="w-4 h-4" /> Duyệt</Button>}
            {isManager && l.attendanceStatus !== 'open' && <Button size="sm" variant="outline" onClick={reopen} className="gap-1"><Unlock className="w-4 h-4" /> Mở lại</Button>}
          </div>
        </div>

        {locked && (
          <div className="bg-slate-50 border border-slate-200 text-slate-600 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
            <Lock className="w-4 h-4" /> Buổi học đã chốt điểm danh{l.submittedAt ? ` lúc ${l.submittedAt}` : ''}. Liên hệ quản lý nếu cần chỉnh sửa.
          </div>
        )}

        <Card>
          <CardContent className="pt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nội dung buổi học"><Input disabled={locked} value={lessonMeta.topic} onChange={e => setLessonMeta({ ...lessonMeta, topic: e.target.value })} placeholder="Bài/chủ đề đã dạy" /></Field>
            <Field label="Ghi chú của giáo viên"><Input disabled={locked} value={lessonMeta.teacherNote} onChange={e => setLessonMeta({ ...lessonMeta, teacherNote: e.target.value })} placeholder="Tình hình lớp, BTVN..." /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Danh sách học viên ({marked}/{activeStudents.length} đã điểm danh)</CardTitle>
            {!locked && <Button size="sm" variant="outline" onClick={markAll}>✓ Tất cả có mặt</Button>}
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 border-b">
                <tr>
                  <th className="px-4 py-3 w-10">#</th>
                  <th className="px-4 py-3">Học viên</th>
                  <th className="px-4 py-3 text-center">Buổi còn lại</th>
                  <th className="px-4 py-3 text-center">Trạng thái</th>
                  <th className="px-4 py-3">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeStudents.map((s, idx) => {
                  const prog = computeProgress(data, s.id, l.classId);
                  const row = draft[s.id] || {};
                  return (
                    <tr key={s.id} className={!row.status ? 'bg-amber-50/30' : ''}>
                      <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{s.name}<div className="text-xs text-slate-400 font-normal">{s.phone}</div></td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold ${prog.remaining <= 0 ? 'text-red-500' : prog.remaining <= policies.lowSessionWarning ? 'text-amber-600' : 'text-emerald-600'}`}>{prog.remaining}</span>
                      </td>
                      <td className="px-4 py-3">{statusButtons(s.id, row.status, locked)}</td>
                      <td className="px-4 py-3"><Input disabled={locked} className="h-8 min-w-[140px]" value={row.note || ''} onChange={e => setRow(s.id, { note: e.target.value })} placeholder="Lý do vắng..." /></td>
                    </tr>
                  );
                })}
                {makeupStudents.map(m => {
                  const s = data.students.find(x => x.id === m.studentId);
                  const fromCls = data.classes.find(c => c.id === m.classId);
                  const row = draft[`mk:${m.id}`] || {};
                  return (
                    <tr key={m.id} className="bg-purple-50/40">
                      <td className="px-4 py-3 text-purple-400">↻</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{s?.name} <Badge tone="purple">Học bù</Badge><div className="text-xs text-slate-400 font-normal">Bù buổi {dayjs(m.absentDate).format('DD/MM')} lớp {fromCls?.name}</div></td>
                      <td className="px-4 py-3 text-center text-slate-400">-</td>
                      <td className="px-4 py-3">{statusButtons(`mk:${m.id}`, row.status, locked)}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">Có mặt → hoàn thành học bù</td>
                    </tr>
                  );
                })}
                {reservedStudents.map(s => (
                  <tr key={s.id} className="opacity-60">
                    <td className="px-4 py-3 text-slate-300">–</td>
                    <td className="px-4 py-3 text-slate-500">{s.name} <Badge tone="purple">Bảo lưu</Badge></td>
                    <td colSpan={3} className="px-4 py-3 text-xs text-slate-400">Đang bảo lưu, không điểm danh</td>
                  </tr>
                ))}
                {activeStudents.length === 0 && makeupStudents.length === 0 && <EmptyRow colSpan={5} text="Lớp chưa có học viên" />}
              </tbody>
            </table>
          </div>
        </Card>

        {!locked && (
          <div className="flex flex-col md:flex-row justify-end gap-3">
            <Button variant="outline" onClick={() => persist(false)}>Lưu tạm</Button>
            <Button onClick={() => persist(true)} className="gap-2"><Send className="w-4 h-4" /> Chốt điểm danh{policies.autoNotifyAbsence ? ' & báo vắng' : ''}</Button>
          </div>
        )}
      </div>
    );
  }

  // ===== Danh sách buổi học =====
  const grouped = visibleLessons.reduce<Record<string, Lesson[]>>((acc, l) => { (acc[l.date] = acc[l.date] || []).push(l); return acc; }, {});

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ClipboardCheck}
        title="Lịch học & Điểm danh"
        subtitle={role.kind === 'teacher' ? `Giáo viên ${actor}: điểm danh từng buổi các lớp được phân công.` : 'Lập lịch từng buổi cho các lớp, theo dõi điểm danh của giáo viên và duyệt.'}
        actions={<>
          {isManager && <Button variant="outline" onClick={() => { setEditingLessonId(null); setOne({ ...one, classId: myClasses[0]?.id || '', teacherId: '', topic: '', isMakeup: false }); setOneOpen(true); }} className="gap-2"><Plus className="w-4 h-4" /> Thêm buổi</Button>}
          {isManager && <Button onClick={() => openGenerate(filterClass !== 'all' ? filterClass : undefined)} className="gap-2"><CalendarPlus className="w-4 h-4" /> Tạo lịch tự động</Button>}
        </>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Buổi học hôm nay" value={todayCount} tone="text-blue-600" />
        <StatCard label="Chưa điểm danh" value={overdue} tone={overdue > 0 ? 'text-amber-600' : 'text-emerald-600'} hint="Buổi đã/đang diễn ra" />
        <StatCard label="Chờ duyệt" value={pendingApproval} tone="text-blue-600" hint={policies.requireAttendanceApproval ? 'Quản lý duyệt điểm danh' : 'Không yêu cầu duyệt'} />
        <StatCard label="Lớp phụ trách" value={myClasses.length} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select className="w-auto h-9" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
          <option value="all">Tất cả lớp</option>
          {myClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        {!showAll && (
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-1">
            <Button variant="ghost" size="sm" className="px-2" onClick={() => setWeekStart(dayjs(weekStart).subtract(7, 'day').format('YYYY-MM-DD'))}><ChevronLeft className="w-4 h-4" /></Button>
            <span className="text-sm font-medium text-slate-700 px-2">{dayjs(weekStart).format('DD/MM')} – {dayjs(weekEnd).format('DD/MM/YYYY')}</span>
            <Button variant="ghost" size="sm" className="px-2" onClick={() => setWeekStart(dayjs(weekStart).add(7, 'day').format('YYYY-MM-DD'))}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        )}
        <label className="text-sm text-slate-600 flex items-center gap-2"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Xem tất cả buổi</label>
      </div>

      {Object.keys(grouped).length === 0 && (
        <Card><div className="p-10 text-center text-slate-400">Không có buổi học nào trong khoảng thời gian này.{isManager && ' Nhấn "Tạo lịch tự động" để lập lịch cho lớp.'}</div></Card>
      )}

      {(Object.entries(grouped) as [string, Lesson[]][]).map(([date, lessons]) => {
        const holiday = isHoliday(date);
        return (
          <div key={date} className="space-y-2">
            <div className={`text-sm font-semibold flex items-center gap-2 ${date === today ? 'text-blue-600' : 'text-slate-600'}`}>
              {WEEKDAY_LABELS[toVnWeekday(date)]} • {dayjs(date).format('DD/MM/YYYY')} {date === today && <Badge tone="blue">Hôm nay</Badge>}
              {holiday && <Badge tone="red">Nghỉ: {holiday.name}</Badge>}
            </div>
            <Card>
              <div className="divide-y divide-slate-100">
                {lessons.map(l => {
                  const cls = data.classes.find(c => c.id === l.classId);
                  const teacher = data.teachers.find(t => t.id === l.teacherId);
                  const atts = data.attendances.filter(a => a.lessonId === l.id);
                  const absent = atts.filter(a => a.status !== 'present').length;
                  const canMark = l.status !== 'cancelled' && (isManager || l.date <= today);
                  return (
                    <div key={l.id} className={`p-4 flex flex-col md:flex-row md:items-center gap-3 ${l.status === 'cancelled' ? 'opacity-60' : ''}`}>
                      <div className="w-28 shrink-0 font-semibold text-slate-700">{l.startTime}–{l.endTime}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-800 flex items-center gap-2 flex-wrap">
                          {cls?.name || '?'} {l.isMakeup && <Badge tone="purple">Buổi bù</Badge>}
                          {l.status === 'cancelled' ? <Badge tone="red">Đã hủy</Badge> : <Badge tone={STATUS_BADGE[l.attendanceStatus].tone}>{STATUS_BADGE[l.attendanceStatus].label}</Badge>}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          GV: {teacher?.name || '-'} • {data.rooms.find(r => r.id === l.roomId)?.name || 'Chưa xếp phòng'}
                          {l.topic && ` • ${l.topic}`}
                          {atts.length > 0 && ` • ${atts.length - absent} có mặt, ${absent} vắng`}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {canMark && (
                          <Button size="sm" variant={l.attendanceStatus === 'open' ? 'primary' : 'outline'} onClick={() => openAttendance(l)} className="gap-1">
                            <ClipboardCheck className="w-4 h-4" /> {l.attendanceStatus === 'open' ? 'Điểm danh' : 'Xem'}
                          </Button>
                        )}
                        {isManager && <Button size="sm" variant="ghost" className="text-blue-500 px-2" title="Sửa buổi học" onClick={() => openEditLesson(l)}><Edit2 className="w-4 h-4" /></Button>}
                        {isManager && l.status === 'scheduled' && <Button size="sm" variant="ghost" className="text-amber-600 px-2" title="Hủy buổi" onClick={() => cancelLesson(l)}><Ban className="w-4 h-4" /></Button>}
                        {isManager && <Button size="sm" variant="ghost" className="text-red-400 px-2" title="Xóa" onClick={() => deleteLesson(l)}><Trash2 className="w-4 h-4" /></Button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        );
      })}

      <Modal open={genOpen} title="Tạo lịch học tự động" onClose={() => setGenOpen(false)}>
        <div className="space-y-4">
          <Field label="Lớp học">
            <Select value={gen.classId} onChange={e => { setGenOpen(false); openGenerate(e.target.value); }}>
              {myClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Bắt đầu từ ngày"><Input type="date" value={gen.fromDate} onChange={e => setGen({ ...gen, fromDate: e.target.value })} /></Field>
            <Field label="Số buổi cần tạo"><Input type="number" min={1} max={200} value={gen.count} onChange={e => setGen({ ...gen, count: Number(e.target.value) })} /></Field>
            <Field label="Giờ bắt đầu"><Input type="time" value={gen.startTime} onChange={e => setGen({ ...gen, startTime: e.target.value })} /></Field>
            <Field label="Giờ kết thúc"><Input type="time" value={gen.endTime} onChange={e => setGen({ ...gen, endTime: e.target.value })} /></Field>
          </div>
          <Field label="Học vào các thứ">
            <div className="flex flex-wrap gap-2">
              {[2, 3, 4, 5, 6, 7, 8].map(d => (
                <button key={d} type="button" onClick={() => setGen({ ...gen, days: gen.days.includes(d) ? gen.days.filter(x => x !== d) : [...gen.days, d] })}
                  className={`w-12 h-9 rounded-lg text-sm font-medium border ${gen.days.includes(d) ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                  {WEEKDAY_LABELS[d]}
                </button>
              ))}
            </div>
          </Field>
          <label className="text-sm text-slate-600 flex items-center gap-2"><input type="checkbox" checked={gen.skipHolidays} onChange={e => setGen({ ...gen, skipHolidays: e.target.checked })} /> Bỏ qua ngày nghỉ lễ (mục Lịch nghỉ)</label>
          <p className="text-xs text-slate-500">Ngày đã có buổi học của lớp sẽ được bỏ qua để tránh trùng.</p>
          <div className="flex justify-end gap-3"><Button variant="outline" onClick={() => setGenOpen(false)}>Hủy</Button><Button onClick={generateLessons}>Tạo lịch</Button></div>
        </div>
      </Modal>

      <Modal open={oneOpen} title={editingLessonId ? 'Sửa buổi học' : 'Thêm buổi học'} onClose={() => { setOneOpen(false); setEditingLessonId(null); }}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Lớp học" className="col-span-2">
              <Select value={one.classId} onChange={e => setOne({ ...one, classId: e.target.value })}>
                <option value="">-- Chọn lớp --</option>
                {myClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Ngày"><Input type="date" value={one.date} onChange={e => setOne({ ...one, date: e.target.value })} /></Field>
            <Field label="Giáo viên dạy">
              <Select value={one.teacherId} onChange={e => setOne({ ...one, teacherId: e.target.value })}>
                <option value="">GV phụ trách lớp</option>
                {data.teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Giờ bắt đầu"><Input type="time" value={one.startTime} onChange={e => setOne({ ...one, startTime: e.target.value })} /></Field>
            <Field label="Giờ kết thúc"><Input type="time" value={one.endTime} onChange={e => setOne({ ...one, endTime: e.target.value })} /></Field>
            <Field label="Nội dung" className="col-span-2"><Input value={one.topic} onChange={e => setOne({ ...one, topic: e.target.value })} /></Field>
          </div>
          <label className="text-sm text-slate-600 flex items-center gap-2"><input type="checkbox" checked={one.isMakeup} onChange={e => setOne({ ...one, isMakeup: e.target.checked })} /> Đây là buổi dạy bù / học bù</label>
          <div className="flex justify-end gap-3"><Button variant="outline" onClick={() => { setOneOpen(false); setEditingLessonId(null); }}>Hủy</Button><Button onClick={addOneLesson}>{editingLessonId ? 'Cập nhật' : 'Thêm'}</Button></div>
        </div>
      </Modal>
    </div>
  );
};

export default Lessons;
