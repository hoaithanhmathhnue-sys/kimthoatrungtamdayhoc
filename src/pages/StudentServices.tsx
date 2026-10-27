import React, { useMemo, useState } from 'react';
import { useAppContext } from '../store/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select, Field, Badge, Modal, StatCard, PageHeader, Tabs, EmptyRow, BadgeTone } from '../components/ui/Misc';
import { CenterPolicies, ClassTransfer, Lesson, MakeupRequest, ParentMessage, Reservation, Transaction, TuitionMode } from '../types';
import { Wallet, Plus, Bell, CalendarClock, ArrowRightLeft, PauseCircle, PlayCircle, Settings2, CheckCircle2, XCircle, Edit2, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import Swal from 'sweetalert2';
import { formatCurrency } from '../lib/utils';
import {
  getClassStudents, getStudentClassIds, computeProgress, getSessionFee, getTuitionMode, buildMessage, greetingFor,
  resolveRecipient, formatShortDate, TUITION_MODE_LABELS, CENTER_SHORT_NAME, roleDisplayName,
} from '../lib/academic';

type TabId = 'fees' | 'makeups' | 'transfers' | 'reservations' | 'policies';

const MAKEUP_STATUS: Record<MakeupRequest['status'], { label: string; tone: BadgeTone }> = {
  pending: { label: 'Chờ xếp lịch', tone: 'amber' },
  scheduled: { label: 'Đã xếp lịch', tone: 'blue' },
  done: { label: 'Đã học bù', tone: 'green' },
  cancelled: { label: 'Đã hủy', tone: 'slate' },
};

const StudentServices: React.FC = () => {
  const { data, updateData, logActivity } = useAppContext();
  const policies = data.settings.policies;
  const actor = roleDisplayName(data);
  const today = dayjs().format('YYYY-MM-DD');
  const [tab, setTab] = useState<TabId>('fees');

  const className = (id?: string) => data.classes.find(c => c.id === id)?.name || '?';
  const studentName = (id: string) => data.students.find(s => s.id === id)?.name || '?';
  const notify = (studentId: string, type: ParentMessage['type'], title: string, text: (who: string) => string, classId?: string): ParentMessage | null => {
    const s = data.students.find(x => x.id === studentId);
    if (!s) return null;
    const rcp = resolveRecipient(s);
    return buildMessage(s, type, `${greetingFor(s, rcp)},\n${text(rcp === 'student' ? 'em' : `em ${s.name}`)}\n${CENTER_SHORT_NAME}`, { classId, title, sender: actor, recipient: rcp });
  };

  // Hộp thoại sửa nhanh nhiều trường (ngày / số / chữ)
  const editForm = async (title: string, fields: { key: string; label: string; type: 'date' | 'number' | 'text'; value: string | number }[]) => {
    const esc = (v: string | number) => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const html = fields.map(f => `<label style="display:block;text-align:left;font-size:13px;margin:10px 0 4px;color:#475569">${f.label}</label><input id="ef-${f.key}" type="${f.type}" value="${esc(f.value)}" class="swal2-input" style="margin:0;width:100%;box-sizing:border-box">`).join('');
    const r = await Swal.fire({
      title, html, showCancelButton: true, confirmButtonText: 'Cập nhật', cancelButtonText: 'Hủy', focusConfirm: false,
      preConfirm: () => Object.fromEntries(fields.map(f => [f.key, (document.getElementById(`ef-${f.key}`) as HTMLInputElement).value])),
    });
    return r.isConfirmed ? (r.value as Record<string, string>) : null;
  };
  const confirmDelete = async (title: string, text?: string) =>
    (await Swal.fire({ title, text, icon: 'warning', showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy' })).isConfirmed;

  // ================= HỌC PHÍ =================
  const [feeClass, setFeeClass] = useState('all');
  const [feeState, setFeeState] = useState<'all' | 'debt' | 'low'>('all');
  const feeRows = useMemo(() => data.classes
    .filter(c => feeClass === 'all' || c.id === feeClass)
    .flatMap(cls => getClassStudents(data, cls.id).map(s => ({ s, cls, p: computeProgress(data, s.id, cls.id), mode: getTuitionMode(data, cls.id) }))),
    [data, feeClass]);
  const feeFiltered = feeRows.filter(r => feeState === 'all' || (feeState === 'debt' ? r.p.remaining <= 0 && !r.p.reserved : r.p.remaining > 0 && r.p.remaining <= policies.lowSessionWarning));
  const totalDebt = feeRows.reduce((s, r) => s + r.p.debtAmount, 0);
  const monthIncome = data.transactions.filter(t => t.type === 'income' && t.category === 'Học phí' && t.date.slice(0, 7) === today.slice(0, 7)).reduce((s, t) => s + t.amount, 0);

  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ studentId: '', classId: '', units: 8, discount: 0, method: 'cash' as Transaction['paymentMethod'], date: today, note: '' });
  const payMode: TuitionMode = pay.classId ? getTuitionMode(data, pay.classId) : policies.tuitionMode;
  const payCourse = data.courses.find(c => c.id === data.classes.find(cl => cl.id === pay.classId)?.courseId);
  const payCalc = (() => {
    const sessionFee = pay.classId ? getSessionFee(data, pay.classId) : 0;
    if (payMode === 'per_course' && payCourse) return { sessions: payCourse.totalSessions * Math.max(1, pay.units), gross: payCourse.fee * Math.max(1, pay.units), unitLabel: 'Số khóa', unitPrice: payCourse.fee };
    if (payMode === 'per_month' && payCourse) return { sessions: (payCourse.sessionsPerMonth || 8) * pay.units, gross: payCourse.fee * pay.units, unitLabel: 'Số tháng', unitPrice: payCourse.fee };
    return { sessions: pay.units, gross: sessionFee * pay.units, unitLabel: 'Số buổi', unitPrice: sessionFee };
  })();

  const openPay = (studentId = '', classId = '') => {
    const cid = classId || (studentId ? getStudentClassIds(data, studentId)[0] : '') || '';
    const mode = cid ? getTuitionMode(data, cid) : policies.tuitionMode;
    setPay({ studentId, classId: cid, units: mode === 'per_session' ? 8 : 1, discount: 0, method: 'cash', date: today, note: '' });
    setPayOpen(true);
  };

  const savePayment = () => {
    const s = data.students.find(x => x.id === pay.studentId);
    const cls = data.classes.find(c => c.id === pay.classId);
    if (!s || !cls) return Swal.fire('Lỗi', 'Chọn học viên và lớp', 'error');
    const amount = Math.max(0, payCalc.gross - pay.discount);
    const tx: Transaction = {
      id: uuidv4(), type: 'income', amount, category: 'Học phí', date: pay.date,
      description: `Thu học phí: ${s.name} - Lớp ${cls.name} (${TUITION_MODE_LABELS[payMode]}) - ${payCalc.sessions} buổi${pay.discount ? `, giảm ${formatCurrency(pay.discount)}` : ''}. ${pay.note}`.trim(),
      relatedStudentId: s.id, relatedClassId: cls.id, relatedSubject: cls.subject, paymentMethod: pay.method,
      sessionCount: payCalc.sessions, feePerSession: payCalc.sessions ? Math.round(amount / payCalc.sessions) : 0, parentName: s.parentName, note: pay.note,
    };
    const msg = notify(s.id, 'fee_reminder', 'Xác nhận đóng học phí', who => `Trung tâm xác nhận đã nhận ${formatCurrency(amount)} học phí lớp ${cls.name} của ${who} (${payCalc.sessions} buổi) ngày ${formatShortDate(pay.date)}. Xin cảm ơn!`, cls.id);
    updateData(prev => ({ transactions: [tx, ...prev.transactions], parentMessages: msg ? [...prev.parentMessages, msg] : prev.parentMessages }));
    logActivity('add', 'transaction', s.name, `Thu học phí ${formatCurrency(amount)}`);
    setPayOpen(false);
    Swal.fire('Đã thu học phí', `${formatCurrency(amount)} • cộng ${payCalc.sessions} buổi cho ${s.name}`, 'success');
  };

  const payments = data.transactions
    .filter(t => t.type === 'income' && t.category === 'Học phí' && (feeClass === 'all' || t.relatedClassId === feeClass))
    .slice().sort((a, b) => b.date.localeCompare(a.date));
  const editPayment = async (t: Transaction) => {
    const v = await editForm('Sửa phiếu thu học phí', [
      { key: 'amount', label: 'Số tiền (VNĐ)', type: 'number', value: t.amount },
      { key: 'sessions', label: 'Số buổi được cộng', type: 'number', value: t.sessionCount || 0 },
      { key: 'date', label: 'Ngày thu', type: 'date', value: t.date },
      { key: 'note', label: 'Ghi chú', type: 'text', value: t.note || '' },
    ]);
    if (!v) return;
    const amount = Math.max(0, Number(v.amount) || 0);
    const sessions = Math.max(0, Number(v.sessions) || 0);
    updateData(prev => ({ transactions: prev.transactions.map(x => x.id === t.id ? { ...x, amount, sessionCount: sessions, feePerSession: sessions ? Math.round(amount / sessions) : 0, date: v.date || x.date, note: v.note } : x) }));
    logActivity('edit', 'transaction', studentName(t.relatedStudentId || ''), `Sửa phiếu thu ${formatCurrency(amount)}`);
  };
  const deletePayment = async (t: Transaction) => {
    if (!(await confirmDelete('Xóa phiếu thu học phí?', 'Số buổi đã cộng từ phiếu này sẽ bị trừ lại.'))) return;
    updateData(prev => ({ transactions: prev.transactions.filter(x => x.id !== t.id) }));
    logActivity('delete', 'transaction', studentName(t.relatedStudentId || ''), `Xóa phiếu thu ${formatCurrency(t.amount)}`);
  };

  const remindFees = (rows: typeof feeRows) => {
    const msgs = rows.map(r => notify(r.s.id, 'fee_reminder', 'Nhắc gia hạn học phí', who => `Lớp ${r.cls.name}: ${who} ${r.p.remaining > 0 ? `còn ${r.p.remaining} buổi đã đóng phí` : r.p.remaining === 0 ? 'đã học hết số buổi đã đóng phí' : `đã học vượt ${-r.p.remaining} buổi (${formatCurrency(r.p.debtAmount)})`}. Kính mong gia đình hoàn tất học phí kỳ tiếp theo.`, r.cls.id)).filter(Boolean) as ParentMessage[];
    if (msgs.length === 0) return Swal.fire('Không có học viên cần nhắc', '', 'info');
    updateData(prev => ({ parentMessages: [...prev.parentMessages, ...msgs] }));
    Swal.fire('Đã gửi nhắc học phí', `${msgs.length} thông báo`, 'success');
  };

  // ================= HỌC BÙ =================
  const [mkFilter, setMkFilter] = useState<'open' | 'all' | MakeupRequest['status']>('open');
  const deadlineOf = (m: MakeupRequest) => dayjs(m.absentDate).add(policies.makeupDeadlineDays, 'day').format('YYYY-MM-DD');
  const makeups = data.makeups
    .filter(m => mkFilter === 'all' || (mkFilter === 'open' ? m.status === 'pending' || m.status === 'scheduled' : m.status === mkFilter))
    .slice().sort((a, b) => a.absentDate.localeCompare(b.absentDate));
  const [scheduling, setScheduling] = useState<MakeupRequest | null>(null);
  const [mkChoice, setMkChoice] = useState({ lessonId: '', newDate: today, startTime: '18:00', endTime: '19:30' });
  const [mkNewOpen, setMkNewOpen] = useState(false);
  const [mkNew, setMkNew] = useState({ studentId: '', classId: '', absentDate: today, note: '' });
  const [editMkId, setEditMkId] = useState<string | null>(null);
  const openEditMakeup = (m: MakeupRequest) => { setEditMkId(m.id); setMkNew({ studentId: m.studentId, classId: m.classId, absentDate: m.absentDate, note: m.note || '' }); setMkNewOpen(true); };
  const deleteMakeup = async (m: MakeupRequest) => {
    if (!(await confirmDelete('Xóa yêu cầu học bù?'))) return;
    updateData(prev => ({ makeups: prev.makeups.filter(x => x.id !== m.id) }));
  };

  const candidateLessons = (m: MakeupRequest): Lesson[] => {
    const subject = data.classes.find(c => c.id === m.classId)?.subject;
    return data.lessons
      .filter(l => l.status === 'scheduled' && l.date >= today && (l.classId === m.classId || data.classes.find(c => c.id === l.classId)?.subject === subject))
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
      .slice(0, 30);
  };

  const usedThisMonth = (studentId: string, month: string, excludeId?: string) =>
    data.makeups.filter(m => m.id !== excludeId && m.studentId === studentId && (m.status === 'scheduled' || m.status === 'done') && (m.makeupDate || '').slice(0, 7) === month).length;

  const saveSchedule = () => {
    if (!scheduling) return;
    let lesson = data.lessons.find(l => l.id === mkChoice.lessonId);
    let newLesson: Lesson | null = null;
    if (!lesson) {
      const cls = data.classes.find(c => c.id === scheduling.classId);
      if (!cls) return;
      newLesson = { id: uuidv4(), classId: cls.id, date: mkChoice.newDate, startTime: mkChoice.startTime, endTime: mkChoice.endTime, teacherId: cls.teacherId, roomId: cls.roomId, status: 'scheduled', attendanceStatus: 'open', isMakeup: true, makeupOnly: true, topic: 'Buổi học bù' };
      lesson = newLesson;
    }
    const l = lesson;
    const proceed = () => {
      const msg = notify(scheduling.studentId, 'schedule', 'Lịch học bù', who => `Trung tâm đã xếp lịch học bù cho ${who} (buổi vắng ${formatShortDate(scheduling.absentDate)}): ${formatShortDate(l.date)}, ${l.startTime}–${l.endTime}, lớp ${className(l.classId)}.`, scheduling.classId);
      updateData(prev => ({
        lessons: newLesson ? [...prev.lessons, newLesson] : prev.lessons,
        makeups: prev.makeups.map(m => m.id === scheduling.id ? { ...m, status: 'scheduled', makeupLessonId: l.id, makeupDate: l.date } : m),
        parentMessages: msg ? [...prev.parentMessages, msg] : prev.parentMessages,
      }));
      setScheduling(null);
      Swal.fire({ title: 'Đã xếp lịch học bù & thông báo', icon: 'success', timer: 1300, showConfirmButton: false });
    };
    const used = usedThisMonth(scheduling.studentId, l.date.slice(0, 7), scheduling.id);
    if (policies.maxMakeupPerMonth > 0 && used >= policies.maxMakeupPerMonth) {
      Swal.fire({ title: 'Vượt số buổi học bù/tháng', text: `Học viên đã có ${used} buổi học bù trong tháng (quy định tối đa ${policies.maxMakeupPerMonth}). Vẫn xếp lịch?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Vẫn xếp', cancelButtonText: 'Hủy' })
        .then(r => { if (r.isConfirmed) proceed(); });
    } else proceed();
  };

  const setMakeupStatus = (m: MakeupRequest, status: MakeupRequest['status']) => {
    updateData(prev => ({ makeups: prev.makeups.map(x => x.id === m.id ? { ...x, status } : x) }));
  };

  const saveNewMakeup = () => {
    if (!mkNew.studentId || !mkNew.classId) return Swal.fire('Lỗi', 'Chọn học viên và lớp', 'error');
    if (editMkId) {
      updateData(prev => ({ makeups: prev.makeups.map(m => m.id === editMkId ? { ...m, ...mkNew } : m) }));
      setMkNewOpen(false);
      setEditMkId(null);
      return;
    }
    updateData(prev => ({ makeups: [...prev.makeups, { id: uuidv4(), studentId: mkNew.studentId, classId: mkNew.classId, absentDate: mkNew.absentDate, note: mkNew.note, status: 'pending', createdAt: today }] }));
    setMkNewOpen(false);
  };

  // ================= CHUYỂN LỚP =================
  const [tr, setTr] = useState({ studentId: '', fromClassId: '', toClassId: '', date: today, note: '' });
  const trFromClasses = tr.studentId ? getStudentClassIds(data, tr.studentId) : [];
  const trCalc = (() => {
    if (!tr.studentId || !tr.fromClassId || !tr.toClassId) return null;
    const remaining = Math.max(0, computeProgress(data, tr.studentId, tr.fromClassId).remaining);
    const fromFee = getSessionFee(data, tr.fromClassId);
    const toFee = getSessionFee(data, tr.toClassId);
    if (policies.transferMode === 'keep_sessions' || !toFee) {
      return { remaining, converted: remaining, feeDifference: remaining * (toFee - fromFee), fromFee, toFee };
    }
    const value = remaining * fromFee;
    const converted = Math.floor(value / toFee);
    return { remaining, converted, feeDifference: -(value - converted * toFee), fromFee, toFee };
  })();

  const doTransfer = () => {
    if (!trCalc) return Swal.fire('Lỗi', 'Chọn đủ học viên, lớp hiện tại và lớp mới', 'error');
    if (tr.fromClassId === tr.toClassId) return Swal.fire('Lỗi', 'Lớp mới phải khác lớp hiện tại', 'error');
    const s = data.students.find(x => x.id === tr.studentId)!;
    const toCls = data.classes.find(c => c.id === tr.toClassId)!;
    Swal.fire({
      title: 'Xác nhận chuyển lớp?',
      html: `${s.name}: <b>${className(tr.fromClassId)}</b> → <b>${toCls.name}</b><br/>Còn ${trCalc.remaining} buổi → ghi nhận ${trCalc.converted} buổi ở lớp mới${trCalc.feeDifference ? `<br/>Chênh lệch: ${trCalc.feeDifference > 0 ? 'HV đóng thêm' : 'Dư'} ${formatCurrency(Math.abs(trCalc.feeDifference))}` : ''}`,
      icon: 'question', showCancelButton: true, confirmButtonText: 'Chuyển lớp', cancelButtonText: 'Hủy',
    }).then(r => {
      if (!r.isConfirmed) return;
      const transfer: ClassTransfer = { id: uuidv4(), studentId: s.id, fromClassId: tr.fromClassId, toClassId: tr.toClassId, date: tr.date, remainingSessions: trCalc.remaining, convertedSessions: trCalc.converted, feeDifference: trCalc.feeDifference, note: tr.note };
      const msg = notify(s.id, 'schedule', 'Thông báo chuyển lớp', who => `Từ ngày ${formatShortDate(tr.date)}, ${who} chuyển từ lớp ${className(tr.fromClassId)} sang lớp ${toCls.name} (${toCls.schedule || 'lịch sẽ thông báo'}). Số buổi còn lại được ghi nhận: ${trCalc.converted} buổi.${trCalc.feeDifference > 0 ? ` Học phí chênh lệch cần đóng thêm: ${formatCurrency(trCalc.feeDifference)}.` : ''}`, toCls.id);
      updateData(prev => ({
        transfers: [...prev.transfers, transfer],
        enrollments: [...prev.enrollments.filter(e => !(e.studentId === s.id && (e.classId === tr.fromClassId || e.classId === tr.toClassId))), { id: uuidv4(), studentId: s.id, classId: tr.toClassId, enrolledAt: tr.date }],
        students: prev.students.map(x => x.id === s.id && (x.classId === tr.fromClassId || !x.classId) ? { ...x, classId: tr.toClassId } : x),
        parentMessages: msg ? [...prev.parentMessages, msg] : prev.parentMessages,
      }));
      logActivity('edit', 'student', s.name, `Chuyển lớp ${className(tr.fromClassId)} → ${toCls.name}`);
      setTr({ studentId: '', fromClassId: '', toClassId: '', date: today, note: '' });
      Swal.fire('Đã chuyển lớp', '', 'success');
    });
  };

  const editTransfer = async (t: ClassTransfer) => {
    const v = await editForm('Sửa thông tin chuyển lớp', [
      { key: 'date', label: 'Ngày chuyển', type: 'date', value: t.date },
      { key: 'converted', label: 'Số buổi ghi nhận ở lớp mới', type: 'number', value: t.convertedSessions },
      { key: 'diff', label: 'Chênh lệch học phí (VNĐ, âm = dư)', type: 'number', value: t.feeDifference },
      { key: 'note', label: 'Ghi chú', type: 'text', value: t.note || '' },
    ]);
    if (!v) return;
    updateData(prev => ({ transfers: prev.transfers.map(x => x.id === t.id ? { ...x, date: v.date || x.date, convertedSessions: Math.max(0, Number(v.converted) || 0), feeDifference: Number(v.diff) || 0, note: v.note } : x) }));
  };
  // Xóa = hoàn tác chuyển lớp: đưa học viên về lớp cũ
  const deleteTransfer = async (t: ClassTransfer) => {
    if (!(await confirmDelete('Xóa (hoàn tác) chuyển lớp?', `Học viên sẽ được đưa về lớp ${className(t.fromClassId)} và số buổi trả về như trước khi chuyển.`))) return;
    updateData(prev => ({
      transfers: prev.transfers.filter(x => x.id !== t.id),
      enrollments: [...prev.enrollments.filter(e => !(e.studentId === t.studentId && (e.classId === t.toClassId || e.classId === t.fromClassId))), { id: uuidv4(), studentId: t.studentId, classId: t.fromClassId, enrolledAt: t.date }],
      students: prev.students.map(x => x.id === t.studentId && x.classId === t.toClassId ? { ...x, classId: t.fromClassId } : x),
    }));
    logActivity('delete', 'student', studentName(t.studentId), `Hoàn tác chuyển lớp ${className(t.fromClassId)} → ${className(t.toClassId)}`);
  };

  // ================= BẢO LƯU =================
  const [rs, setRs] = useState({ studentId: '', classId: '', startDate: today, endDate: dayjs().add(30, 'day').format('YYYY-MM-DD'), reason: '' });
  const rsRemaining = rs.studentId && rs.classId ? computeProgress(data, rs.studentId, rs.classId).remaining : 0;

  const doReserve = () => {
    if (!rs.studentId || !rs.classId) return Swal.fire('Lỗi', 'Chọn học viên và lớp', 'error');
    const days = dayjs(rs.endDate).diff(dayjs(rs.startDate), 'day');
    if (days <= 0) return Swal.fire('Lỗi', 'Ngày kết thúc phải sau ngày bắt đầu', 'error');
    if (days > policies.reservationMaxDays) return Swal.fire('Vượt quy định', `Thời gian bảo lưu tối đa ${policies.reservationMaxDays} ngày.`, 'error');
    if (rsRemaining < policies.reservationMinRemaining) return Swal.fire('Không đủ điều kiện', `Cần còn ít nhất ${policies.reservationMinRemaining} buổi để bảo lưu (hiện còn ${rsRemaining}).`, 'error');
    if (data.reservations.some(r => r.studentId === rs.studentId && r.classId === rs.classId && r.status === 'active')) return Swal.fire('Đang bảo lưu', 'Học viên đang có bảo lưu ở lớp này.', 'info');
    const res: Reservation = { id: uuidv4(), studentId: rs.studentId, classId: rs.classId, startDate: rs.startDate, endDate: rs.endDate, sessionsReserved: rsRemaining, reason: rs.reason, status: 'active' };
    const msg = notify(rs.studentId, 'general', 'Xác nhận bảo lưu', who => `Trung tâm xác nhận bảo lưu cho ${who} lớp ${className(rs.classId)} từ ${formatShortDate(rs.startDate)} đến ${formatShortDate(rs.endDate)}. Số buổi được bảo lưu: ${rsRemaining} buổi.`, rs.classId);
    updateData(prev => ({ reservations: [...prev.reservations, res], parentMessages: msg ? [...prev.parentMessages, msg] : prev.parentMessages }));
    logActivity('add', 'reservation', studentName(rs.studentId), `Bảo lưu ${className(rs.classId)}`);
    setRs({ ...rs, studentId: '', classId: '', reason: '' });
    Swal.fire('Đã bảo lưu', `${rsRemaining} buổi được giữ lại.`, 'success');
  };

  const editReservation = async (r: Reservation) => {
    const v = await editForm('Sửa thông tin bảo lưu', [
      { key: 'start', label: 'Từ ngày', type: 'date', value: r.startDate },
      { key: 'end', label: 'Đến ngày', type: 'date', value: r.endDate },
      { key: 'sessions', label: 'Số buổi bảo lưu', type: 'number', value: r.sessionsReserved },
      { key: 'reason', label: 'Lý do', type: 'text', value: r.reason || '' },
    ]);
    if (!v) return;
    if (v.end <= v.start) return Swal.fire('Lỗi', 'Ngày kết thúc phải sau ngày bắt đầu', 'error');
    updateData(prev => ({ reservations: prev.reservations.map(x => x.id === r.id ? { ...x, startDate: v.start, endDate: v.end, sessionsReserved: Math.max(0, Number(v.sessions) || 0), reason: v.reason } : x) }));
  };
  const deleteReservation = async (r: Reservation) => {
    if (!(await confirmDelete('Xóa bản ghi bảo lưu?'))) return;
    updateData(prev => ({ reservations: prev.reservations.filter(x => x.id !== r.id) }));
  };

  const resume = (r: Reservation) => {
    const options = data.classes.filter(c => c.subject === data.classes.find(x => x.id === r.classId)?.subject).reduce<Record<string, string>>((acc, c) => { acc[c.id] = c.id === r.classId ? `${c.name} (lớp cũ)` : c.name; return acc; }, {});
    Swal.fire({ title: 'Học lại', text: 'Chọn lớp học tiếp', input: 'select', inputOptions: options, inputValue: r.classId, showCancelButton: true, confirmButtonText: 'Xác nhận', cancelButtonText: 'Hủy' }).then(res => {
      if (!res.isConfirmed) return;
      const toId = res.value as string;
      const moving = toId && toId !== r.classId;
      const fromFee = getSessionFee(data, r.classId);
      const toFee = getSessionFee(data, toId);
      const remaining = Math.max(0, computeProgress(data, r.studentId, r.classId).remaining);
      const converted = moving ? (policies.transferMode === 'keep_sessions' || !toFee ? remaining : Math.floor(remaining * fromFee / toFee)) : remaining;
      const transfer: ClassTransfer | null = moving ? { id: uuidv4(), studentId: r.studentId, fromClassId: r.classId, toClassId: toId, date: today, remainingSessions: remaining, convertedSessions: converted, feeDifference: policies.transferMode === 'keep_sessions' ? remaining * (toFee - fromFee) : -(remaining * fromFee - converted * toFee), note: 'Học lại sau bảo lưu' } : null;
      const msg = notify(r.studentId, 'schedule', 'Học lại sau bảo lưu', who => `${who[0].toUpperCase() + who.slice(1)} sẽ học lại từ ngày ${formatShortDate(today)} tại lớp ${className(toId || r.classId)}. Số buổi còn lại: ${converted} buổi.`, toId || r.classId);
      updateData(prev => ({
        reservations: prev.reservations.map(x => x.id === r.id ? { ...x, status: 'resumed', resumedDate: today, resumedClassId: toId || r.classId } : x),
        transfers: transfer ? [...prev.transfers, transfer] : prev.transfers,
        enrollments: moving ? [...prev.enrollments.filter(e => !(e.studentId === r.studentId && (e.classId === r.classId || e.classId === toId))), { id: uuidv4(), studentId: r.studentId, classId: toId, enrolledAt: today }] : prev.enrollments,
        students: moving ? prev.students.map(x => x.id === r.studentId && x.classId === r.classId ? { ...x, classId: toId } : x) : prev.students,
        parentMessages: msg ? [...prev.parentMessages, msg] : prev.parentMessages,
      }));
      Swal.fire({ title: 'Đã kích hoạt học lại', icon: 'success', timer: 1200, showConfirmButton: false });
    });
  };

  // ================= QUY ĐỊNH =================
  const [pol, setPol] = useState<CenterPolicies>(policies);
  const savePolicies = () => {
    updateData(prev => ({ settings: { ...prev.settings, policies: pol } }));
    logActivity('edit', 'settings', 'Quy định học vụ');
    Swal.fire({ title: 'Đã lưu quy định', icon: 'success', timer: 1200, showConfirmButton: false });
  };
  const Toggle: React.FC<{ k: keyof CenterPolicies; label: string; hint?: string }> = ({ k, label, hint }) => (
    <label className="flex items-start gap-3 p-3 border border-slate-100 rounded-lg cursor-pointer hover:bg-slate-50">
      <input type="checkbox" className="mt-1" checked={!!pol[k]} onChange={e => setPol({ ...pol, [k]: e.target.checked })} />
      <span><span className="text-sm font-medium text-slate-800">{label}</span>{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span>
    </label>
  );

  const pendingMk = data.makeups.filter(m => m.status === 'pending').length;
  const activeRs = data.reservations.filter(r => r.status === 'active');

  return (
    <div className="space-y-5">
      <PageHeader icon={Wallet} title="Học phí & Học vụ" subtitle="Quản lý học phí, học bù, chuyển lớp và bảo lưu theo quy định trung tâm đang áp dụng." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Thu học phí tháng này" value={formatCurrency(monthIncome)} tone="text-emerald-600" />
        <StatCard label="Công nợ (học vượt buổi)" value={formatCurrency(totalDebt)} tone={totalDebt > 0 ? 'text-red-500' : 'text-emerald-600'} />
        <StatCard label="Chờ xếp học bù" value={pendingMk} tone={pendingMk > 0 ? 'text-amber-600' : 'text-slate-800'} />
        <StatCard label="Đang bảo lưu" value={activeRs.length} tone="text-purple-600" hint={`${activeRs.filter(r => r.endDate < today).length} đến hạn học lại`} />
      </div>

      <Tabs active={tab} onChange={id => setTab(id as TabId)} tabs={[
        { id: 'fees', label: <><Wallet className="w-4 h-4" /> Học phí</> },
        { id: 'makeups', label: <><CalendarClock className="w-4 h-4" /> Học bù</>, count: pendingMk },
        { id: 'transfers', label: <><ArrowRightLeft className="w-4 h-4" /> Chuyển lớp</> },
        { id: 'reservations', label: <><PauseCircle className="w-4 h-4" /> Bảo lưu</> },
        { id: 'policies', label: <><Settings2 className="w-4 h-4" /> Quy định áp dụng</> },
      ]} />

      {tab === 'fees' && (
        <>
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex gap-3">
              <Select className="w-auto h-9" value={feeClass} onChange={e => setFeeClass(e.target.value)}>
                <option value="all">Tất cả lớp</option>
                {data.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Select className="w-auto h-9" value={feeState} onChange={e => setFeeState(e.target.value as typeof feeState)}>
                <option value="all">Tất cả</option>
                <option value="low">Sắp hết buổi (≤ {policies.lowSessionWarning})</option>
                <option value="debt">Hết buổi / nợ phí</option>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="gap-1" onClick={() => remindFees(feeFiltered.filter(r => !r.p.reserved && r.p.remaining <= policies.lowSessionWarning))}><Bell className="w-4 h-4" /> Nhắc học phí</Button>
              <Button className="gap-1" onClick={() => openPay()}><Plus className="w-4 h-4" /> Thu học phí</Button>
            </div>
          </div>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 border-b">
                  <tr><th className="px-4 py-3">Học viên</th><th className="px-4 py-3">Lớp</th><th className="px-4 py-3">Cách thu</th><th className="px-4 py-3 text-right">Đã đóng</th><th className="px-4 py-3 text-center">Buổi đã đóng</th><th className="px-4 py-3 text-center">Đã học</th><th className="px-4 py-3 text-center">Còn lại</th><th className="px-4 py-3 text-right">Công nợ</th><th className="px-4 py-3"></th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {feeFiltered.map(r => (
                    <tr key={`${r.s.id}-${r.cls.id}`} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{r.s.name} {r.p.reserved && <Badge tone="purple">Bảo lưu</Badge>}</td>
                      <td className="px-4 py-3 text-slate-600">{r.cls.name}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{TUITION_MODE_LABELS[r.mode]}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(r.p.paidAmount)}</td>
                      <td className="px-4 py-3 text-center">{r.p.purchased}</td>
                      <td className="px-4 py-3 text-center">{r.p.used}</td>
                      <td className="px-4 py-3 text-center"><span className={`font-bold ${r.p.remaining <= 0 ? 'text-red-500' : r.p.remaining <= policies.lowSessionWarning ? 'text-amber-600' : 'text-emerald-600'}`}>{r.p.remaining}</span></td>
                      <td className="px-4 py-3 text-right text-red-500">{r.p.debtAmount ? formatCurrency(r.p.debtAmount) : '-'}</td>
                      <td className="px-4 py-3"><Button size="sm" variant="outline" onClick={() => openPay(r.s.id, r.cls.id)}>Thu</Button></td>
                    </tr>
                  ))}
                  {feeFiltered.length === 0 && <EmptyRow colSpan={9} text="Không có dữ liệu" />}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <CardHeader><CardTitle>Lịch sử thu học phí ({payments.length})</CardTitle></CardHeader>
            <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 border-b sticky top-0"><tr><th className="px-4 py-3">Ngày</th><th className="px-4 py-3">Học viên</th><th className="px-4 py-3">Lớp</th><th className="px-4 py-3 text-center">Số buổi</th><th className="px-4 py-3 text-right">Số tiền</th><th className="px-4 py-3">Ghi chú</th><th className="px-4 py-3 w-24"></th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">{formatShortDate(t.date)}</td>
                      <td className="px-4 py-3 font-medium">{studentName(t.relatedStudentId || '')}</td>
                      <td className="px-4 py-3 text-slate-600">{className(t.relatedClassId)}</td>
                      <td className="px-4 py-3 text-center">{t.sessionCount || '-'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">{formatCurrency(t.amount)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px] truncate">{t.note || ''}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Button size="sm" variant="ghost" className="px-2 text-blue-500" title="Sửa" onClick={() => editPayment(t)}><Edit2 className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" className="px-2 text-red-400" title="Xóa" onClick={() => deletePayment(t)}><Trash2 className="w-4 h-4" /></Button>
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 && <EmptyRow colSpan={7} text="Chưa có phiếu thu" />}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="text-xs text-slate-500">Số buổi còn lại = buổi đã đóng (+ quy đổi khi chuyển lớp) − buổi có mặt − buổi học bù đã học{policies.deductUnexcusedAbsence ? ' − buổi vắng không phép' : ''}. Vắng có phép không bị trừ buổi.</p>
        </>
      )}

      {tab === 'makeups' && (
        <>
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <Select className="w-auto h-9" value={mkFilter} onChange={e => setMkFilter(e.target.value as typeof mkFilter)}>
              <option value="open">Cần xử lý</option>
              <option value="all">Tất cả</option>
              {Object.entries(MAKEUP_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
            <Button className="gap-1" onClick={() => { setEditMkId(null); setMkNew({ studentId: '', classId: '', absentDate: today, note: '' }); setMkNewOpen(true); }}><Plus className="w-4 h-4" /> Tạo yêu cầu học bù</Button>
          </div>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 border-b">
                  <tr><th className="px-4 py-3">Học viên</th><th className="px-4 py-3">Lớp</th><th className="px-4 py-3">Ngày vắng</th><th className="px-4 py-3">Hạn học bù</th><th className="px-4 py-3">Buổi học bù</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3"></th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {makeups.map(m => {
                    const deadline = deadlineOf(m);
                    const expired = m.status === 'pending' && deadline < today;
                    const ml = data.lessons.find(l => l.id === m.makeupLessonId);
                    return (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">{studentName(m.studentId)}{m.note && <div className="text-xs text-slate-400 font-normal">{m.note}</div>}</td>
                        <td className="px-4 py-3 text-slate-600">{className(m.classId)}</td>
                        <td className="px-4 py-3">{formatShortDate(m.absentDate)}</td>
                        <td className="px-4 py-3">{formatShortDate(deadline)} {expired && <Badge tone="red">Quá hạn</Badge>}</td>
                        <td className="px-4 py-3 text-slate-600">{ml ? `${formatShortDate(ml.date)} ${ml.startTime} • ${className(ml.classId)}` : '-'}</td>
                        <td className="px-4 py-3"><Badge tone={MAKEUP_STATUS[m.status].tone}>{MAKEUP_STATUS[m.status].label}</Badge></td>
                        <td className="px-4 py-3 flex gap-1">
                          {(m.status === 'pending' || m.status === 'scheduled') && <Button size="sm" variant="outline" onClick={() => { setScheduling(m); setMkChoice({ lessonId: m.makeupLessonId || '', newDate: today, startTime: '18:00', endTime: '19:30' }); }}>{m.status === 'pending' ? 'Xếp lịch' : 'Đổi lịch'}</Button>}
                          {m.status === 'scheduled' && <Button size="sm" variant="ghost" className="px-2 text-emerald-600" title="Đã học bù" onClick={() => setMakeupStatus(m, 'done')}><CheckCircle2 className="w-4 h-4" /></Button>}
                          {(m.status === 'pending' || m.status === 'scheduled') && <Button size="sm" variant="ghost" className="px-2 text-amber-500" title="Hủy yêu cầu" onClick={() => setMakeupStatus(m, 'cancelled')}><XCircle className="w-4 h-4" /></Button>}
                          <Button size="sm" variant="ghost" className="px-2 text-blue-500" title="Sửa" onClick={() => openEditMakeup(m)}><Edit2 className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" className="px-2 text-red-400" title="Xóa" onClick={() => deleteMakeup(m)}><Trash2 className="w-4 h-4" /></Button>
                        </td>
                      </tr>
                    );
                  })}
                  {makeups.length === 0 && <EmptyRow colSpan={7} text="Không có yêu cầu học bù" />}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="text-xs text-slate-500">Yêu cầu học bù được tạo tự động khi GV chốt điểm danh{policies.makeupForExcusedOnly ? ' (chỉ với vắng có phép)' : ''}. Hạn học bù {policies.makeupDeadlineDays} ngày{policies.maxMakeupPerMonth ? `, tối đa ${policies.maxMakeupPerMonth} buổi/tháng` : ''}.</p>
        </>
      )}

      {tab === 'transfers' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-5">
          <Card>
            <CardHeader><CardTitle>Chuyển lớp</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Field label="Học viên">
                <Select value={tr.studentId} onChange={e => { const ids = getStudentClassIds(data, e.target.value); setTr({ ...tr, studentId: e.target.value, fromClassId: ids[0] || '', toClassId: '' }); }}>
                  <option value="">-- Chọn học viên --</option>
                  {data.students.filter(s => s.applicationStatus !== 'inactive').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Từ lớp">
                  <Select value={tr.fromClassId} onChange={e => setTr({ ...tr, fromClassId: e.target.value })}>
                    <option value="">--</option>
                    {trFromClasses.map(id => <option key={id} value={id}>{className(id)}</option>)}
                  </Select>
                </Field>
                <Field label="Sang lớp">
                  <Select value={tr.toClassId} onChange={e => setTr({ ...tr, toClassId: e.target.value })}>
                    <option value="">--</option>
                    {data.classes.filter(c => c.id !== tr.fromClassId && c.status !== 'finished').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
                <Field label="Ngày chuyển"><Input type="date" value={tr.date} onChange={e => setTr({ ...tr, date: e.target.value })} /></Field>
                <Field label="Ghi chú"><Input value={tr.note} onChange={e => setTr({ ...tr, note: e.target.value })} /></Field>
              </div>
              {trCalc && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm space-y-1">
                  <div>Còn lại ở lớp cũ: <b>{trCalc.remaining} buổi</b> × {formatCurrency(trCalc.fromFee)}</div>
                  <div>Ghi nhận ở lớp mới: <b>{trCalc.converted} buổi</b> × {formatCurrency(trCalc.toFee)}</div>
                  {trCalc.feeDifference !== 0 && <div className={trCalc.feeDifference > 0 ? 'text-red-600' : 'text-emerald-700'}>{trCalc.feeDifference > 0 ? 'HV cần đóng thêm' : 'Giá trị dư (bảo lưu/hoàn)'}: <b>{formatCurrency(Math.abs(trCalc.feeDifference))}</b></div>}
                  <div className="text-xs text-slate-500">Quy đổi: {policies.transferMode === 'by_value' ? 'theo giá trị tiền còn lại' : 'giữ nguyên số buổi, tính chênh lệch học phí'}</div>
                </div>
              )}
              <div className="flex justify-end"><Button onClick={doTransfer} className="gap-1"><ArrowRightLeft className="w-4 h-4" /> Chuyển lớp</Button></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Lịch sử chuyển lớp ({data.transfers.length})</CardTitle></CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 border-b"><tr><th className="px-4 py-3">Ngày</th><th className="px-4 py-3">Học viên</th><th className="px-4 py-3">Chuyển</th><th className="px-4 py-3 text-center">Buổi</th><th className="px-4 py-3 text-right">Chênh lệch</th><th className="px-4 py-3 w-24"></th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.transfers.slice().reverse().map(t => (
                    <tr key={t.id}>
                      <td className="px-4 py-3">{formatShortDate(t.date)}</td>
                      <td className="px-4 py-3 font-medium">{studentName(t.studentId)}{t.note && <div className="text-xs text-slate-400 font-normal">{t.note}</div>}</td>
                      <td className="px-4 py-3 text-slate-600">{className(t.fromClassId)} → {className(t.toClassId)}</td>
                      <td className="px-4 py-3 text-center">{t.remainingSessions} → {t.convertedSessions}</td>
                      <td className={`px-4 py-3 text-right ${t.feeDifference > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{t.feeDifference ? formatCurrency(t.feeDifference) : '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Button size="sm" variant="ghost" className="px-2 text-blue-500" title="Sửa" onClick={() => editTransfer(t)}><Edit2 className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" className="px-2 text-red-400" title="Xóa / hoàn tác" onClick={() => deleteTransfer(t)}><Trash2 className="w-4 h-4" /></Button>
                      </td>
                    </tr>
                  ))}
                  {data.transfers.length === 0 && <EmptyRow colSpan={6} text="Chưa có lượt chuyển lớp" />}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'reservations' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-5">
          <Card>
            <CardHeader><CardTitle>Đăng ký bảo lưu</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Field label="Học viên">
                <Select value={rs.studentId} onChange={e => { const ids = getStudentClassIds(data, e.target.value); setRs({ ...rs, studentId: e.target.value, classId: ids[0] || '' }); }}>
                  <option value="">-- Chọn học viên --</option>
                  {data.students.filter(s => s.applicationStatus !== 'inactive').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
              <Field label="Lớp">
                <Select value={rs.classId} onChange={e => setRs({ ...rs, classId: e.target.value })}>
                  <option value="">--</option>
                  {(rs.studentId ? getStudentClassIds(data, rs.studentId) : []).map(id => <option key={id} value={id}>{className(id)}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Từ ngày"><Input type="date" value={rs.startDate} onChange={e => setRs({ ...rs, startDate: e.target.value })} /></Field>
                <Field label="Đến ngày"><Input type="date" value={rs.endDate} onChange={e => setRs({ ...rs, endDate: e.target.value })} /></Field>
              </div>
              <Field label="Lý do"><Input value={rs.reason} onChange={e => setRs({ ...rs, reason: e.target.value })} placeholder="Ôn thi, ốm, đi xa..." /></Field>
              {rs.classId && <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg text-sm">Số buổi được bảo lưu: <b>{rsRemaining}</b> • Thời gian: {Math.max(0, dayjs(rs.endDate).diff(dayjs(rs.startDate), 'day'))}/{policies.reservationMaxDays} ngày tối đa</div>}
              <div className="flex justify-end"><Button onClick={doReserve} className="gap-1"><PauseCircle className="w-4 h-4" /> Bảo lưu</Button></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Danh sách bảo lưu ({data.reservations.length})</CardTitle></CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 border-b"><tr><th className="px-4 py-3">Học viên</th><th className="px-4 py-3">Lớp</th><th className="px-4 py-3">Thời gian</th><th className="px-4 py-3 text-center">Buổi</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3"></th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.reservations.slice().reverse().map(r => {
                    const due = r.status === 'active' && r.endDate < today;
                    return (
                      <tr key={r.id}>
                        <td className="px-4 py-3 font-medium">{studentName(r.studentId)}{r.reason && <div className="text-xs text-slate-400 font-normal">{r.reason}</div>}</td>
                        <td className="px-4 py-3 text-slate-600">{className(r.classId)}</td>
                        <td className="px-4 py-3 text-xs">{formatShortDate(r.startDate)} → {formatShortDate(r.endDate)}</td>
                        <td className="px-4 py-3 text-center">{r.sessionsReserved}</td>
                        <td className="px-4 py-3">
                          <Badge tone={r.status === 'active' ? 'purple' : r.status === 'resumed' ? 'green' : 'slate'}>{r.status === 'active' ? 'Đang bảo lưu' : r.status === 'resumed' ? `Đã học lại ${formatShortDate(r.resumedDate)}` : 'Đã hủy'}</Badge>
                          {due && <Badge tone="red" className="ml-1">Đến hạn</Badge>}
                        </td>
                        <td className="px-4 py-3 flex gap-1">
                          {r.status === 'active' && <>
                            <Button size="sm" variant="outline" className="gap-1" onClick={() => resume(r)}><PlayCircle className="w-4 h-4" /> Học lại</Button>
                            <Button size="sm" variant="ghost" className="px-2 text-amber-500" title="Hủy bảo lưu" onClick={() => updateData(prev => ({ reservations: prev.reservations.map(x => x.id === r.id ? { ...x, status: 'cancelled' } : x) }))}><XCircle className="w-4 h-4" /></Button>
                          </>}
                          <Button size="sm" variant="ghost" className="px-2 text-blue-500" title="Sửa" onClick={() => editReservation(r)}><Edit2 className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" className="px-2 text-red-400" title="Xóa" onClick={() => deleteReservation(r)}><Trash2 className="w-4 h-4" /></Button>
                        </td>
                      </tr>
                    );
                  })}
                  {data.reservations.length === 0 && <EmptyRow colSpan={6} text="Chưa có học viên bảo lưu" />}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'policies' && (
        <Card>
          <CardHeader><CardTitle>Quy định học vụ của trung tâm</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Cách thu học phí mặc định">
                <Select value={pol.tuitionMode} onChange={e => setPol({ ...pol, tuitionMode: e.target.value as TuitionMode })}>
                  {Object.entries(TUITION_MODE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Cảnh báo sắp hết buổi khi còn ≤"><Input type="number" min={0} value={pol.lowSessionWarning} onChange={e => setPol({ ...pol, lowSessionWarning: Number(e.target.value) })} /></Field>
              <Field label="Chuyển lớp: quy đổi buổi">
                <Select value={pol.transferMode} onChange={e => setPol({ ...pol, transferMode: e.target.value as CenterPolicies['transferMode'] })}>
                  <option value="by_value">Theo giá trị tiền còn lại</option>
                  <option value="keep_sessions">Giữ nguyên số buổi, tính chênh lệch</option>
                </Select>
              </Field>
              <Field label="Hạn học bù (ngày kể từ buổi vắng)"><Input type="number" min={1} value={pol.makeupDeadlineDays} onChange={e => setPol({ ...pol, makeupDeadlineDays: Number(e.target.value) })} /></Field>
              <Field label="Số buổi học bù tối đa / tháng (0 = không giới hạn)"><Input type="number" min={0} value={pol.maxMakeupPerMonth} onChange={e => setPol({ ...pol, maxMakeupPerMonth: Number(e.target.value) })} /></Field>
              <Field label="Bảo lưu tối đa (ngày)"><Input type="number" min={1} value={pol.reservationMaxDays} onChange={e => setPol({ ...pol, reservationMaxDays: Number(e.target.value) })} /></Field>
              <Field label="Số buổi còn lại tối thiểu để bảo lưu"><Input type="number" min={0} value={pol.reservationMinRemaining} onChange={e => setPol({ ...pol, reservationMinRemaining: Number(e.target.value) })} /></Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Toggle k="deductUnexcusedAbsence" label="Vắng không phép vẫn trừ buổi" hint="Bỏ chọn nếu trung tâm chỉ trừ buổi khi học viên có mặt" />
              <Toggle k="makeupForExcusedOnly" label="Chỉ học bù khi vắng có phép" hint="Bỏ chọn để mọi buổi vắng đều được tạo yêu cầu học bù" />
              <Toggle k="autoNotifyAbsence" label="Tự động báo vắng khi GV chốt điểm danh" hint="Gửi đến học viên hoặc người giám hộ phù hợp" />
              <Toggle k="requireAttendanceApproval" label="Quản lý duyệt điểm danh của GV" />
              <Toggle k="requireExamApproval" label="Quản lý duyệt điểm kiểm tra trước khi công bố" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPol(policies)}>Hoàn tác</Button>
              <Button onClick={savePolicies}>Lưu quy định</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Modal open={payOpen} title="Thu học phí" onClose={() => setPayOpen(false)}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Học viên" className="col-span-2">
            <Select value={pay.studentId} onChange={e => { const cid = getStudentClassIds(data, e.target.value)[0] || ''; const m = cid ? getTuitionMode(data, cid) : policies.tuitionMode; setPay({ ...pay, studentId: e.target.value, classId: cid, units: m === 'per_session' ? 8 : 1 }); }}>
              <option value="">-- Chọn học viên --</option>
              {data.students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Lớp">
            <Select value={pay.classId} onChange={e => { const m = getTuitionMode(data, e.target.value); setPay({ ...pay, classId: e.target.value, units: m === 'per_session' ? 8 : 1 }); }}>
              <option value="">--</option>
              {(pay.studentId ? getStudentClassIds(data, pay.studentId) : data.classes.map(c => c.id)).map(id => <option key={id} value={id}>{className(id)}</option>)}
            </Select>
          </Field>
          <Field label="Cách thu"><Input disabled value={TUITION_MODE_LABELS[payMode]} /></Field>
          <Field label={`${payCalc.unitLabel} (đơn giá ${formatCurrency(payCalc.unitPrice)})`}><Input type="number" min={1} value={pay.units} onChange={e => setPay({ ...pay, units: Number(e.target.value) })} /></Field>
          <Field label="Giảm trừ / ưu đãi (VNĐ)"><Input type="number" min={0} value={pay.discount} onChange={e => setPay({ ...pay, discount: Number(e.target.value) })} /></Field>
          <Field label="Hình thức">
            <Select value={pay.method} onChange={e => setPay({ ...pay, method: e.target.value as Transaction['paymentMethod'] })}>
              <option value="cash">Tiền mặt</option><option value="transfer">Chuyển khoản</option><option value="CKCT">CK công ty</option>
            </Select>
          </Field>
          <Field label="Ngày thu"><Input type="date" value={pay.date} onChange={e => setPay({ ...pay, date: e.target.value })} /></Field>
          <Field label="Ghi chú" className="col-span-2"><Input value={pay.note} onChange={e => setPay({ ...pay, note: e.target.value })} /></Field>
        </div>
        <div className="mt-4 p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-sm flex justify-between">
          <span>Cộng <b>{payCalc.sessions} buổi</b></span>
          <span>Thành tiền: <b className="text-emerald-700">{formatCurrency(Math.max(0, payCalc.gross - pay.discount))}</b></span>
        </div>
        <div className="flex justify-end gap-3 mt-4"><Button variant="outline" onClick={() => setPayOpen(false)}>Hủy</Button><Button onClick={savePayment}>Xác nhận thu</Button></div>
      </Modal>

      <Modal open={!!scheduling} title="Xếp lịch học bù" onClose={() => setScheduling(null)}>
        {scheduling && (
          <div className="space-y-4">
            <div className="text-sm text-slate-600">{studentName(scheduling.studentId)} — vắng {formatShortDate(scheduling.absentDate)} lớp {className(scheduling.classId)}</div>
            <Field label="Học ghép vào buổi có sẵn (cùng môn)">
              <Select value={mkChoice.lessonId} onChange={e => setMkChoice({ ...mkChoice, lessonId: e.target.value })}>
                <option value="">➕ Tạo buổi học bù riêng</option>
                {candidateLessons(scheduling).map(l => <option key={l.id} value={l.id}>{formatShortDate(l.date)} {l.startTime} • {className(l.classId)}{l.topic ? ` • ${l.topic}` : ''}</option>)}
              </Select>
            </Field>
            {!mkChoice.lessonId && (
              <div className="grid grid-cols-3 gap-3">
                <Field label="Ngày"><Input type="date" value={mkChoice.newDate} onChange={e => setMkChoice({ ...mkChoice, newDate: e.target.value })} /></Field>
                <Field label="Bắt đầu"><Input type="time" value={mkChoice.startTime} onChange={e => setMkChoice({ ...mkChoice, startTime: e.target.value })} /></Field>
                <Field label="Kết thúc"><Input type="time" value={mkChoice.endTime} onChange={e => setMkChoice({ ...mkChoice, endTime: e.target.value })} /></Field>
              </div>
            )}
            <p className="text-xs text-slate-500">Lịch học bù sẽ được thông báo đến học viên/người giám hộ phù hợp. Khi GV điểm danh "Có mặt" ở buổi đó, yêu cầu tự chuyển "Đã học bù".</p>
            <div className="flex justify-end gap-3"><Button variant="outline" onClick={() => setScheduling(null)}>Hủy</Button><Button onClick={saveSchedule}>Xếp lịch & thông báo</Button></div>
          </div>
        )}
      </Modal>

      <Modal open={mkNewOpen} title={editMkId ? 'Sửa yêu cầu học bù' : 'Tạo yêu cầu học bù'} onClose={() => { setMkNewOpen(false); setEditMkId(null); }}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Học viên" className="col-span-2">
            <Select value={mkNew.studentId} onChange={e => setMkNew({ ...mkNew, studentId: e.target.value, classId: getStudentClassIds(data, e.target.value)[0] || '' })}>
              <option value="">-- Chọn --</option>
              {data.students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Lớp">
            <Select value={mkNew.classId} onChange={e => setMkNew({ ...mkNew, classId: e.target.value })}>
              <option value="">--</option>
              {(mkNew.studentId ? getStudentClassIds(data, mkNew.studentId) : []).map(id => <option key={id} value={id}>{className(id)}</option>)}
            </Select>
          </Field>
          <Field label="Ngày vắng"><Input type="date" value={mkNew.absentDate} onChange={e => setMkNew({ ...mkNew, absentDate: e.target.value })} /></Field>
          <Field label="Ghi chú" className="col-span-2"><Input value={mkNew.note} onChange={e => setMkNew({ ...mkNew, note: e.target.value })} /></Field>
        </div>
        <div className="flex justify-end gap-3 mt-4"><Button variant="outline" onClick={() => setMkNewOpen(false)}>Hủy</Button><Button onClick={saveNewMakeup}>{editMkId ? 'Cập nhật' : 'Tạo'}</Button></div>
      </Modal>
    </div>
  );
};

export default StudentServices;
