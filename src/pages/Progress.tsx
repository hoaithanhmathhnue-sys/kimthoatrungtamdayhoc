import React, { useMemo, useState } from 'react';
import { useAppContext } from '../store/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select, Badge, Modal, StatCard, PageHeader, EmptyRow } from '../components/ui/Misc';
import { ParentMessage, Student, ClassSession } from '../types';
import { TrendingUp, MessageSquarePlus, Bell, Search } from 'lucide-react';
import Swal from 'sweetalert2';
import dayjs from 'dayjs';
import { formatCurrency } from '../lib/utils';
import {
  parseRole, roleDisplayName, getClassStudents, computeProgress, StudentProgress, buildMessage, greetingFor,
  resolveRecipient, formatShortDate, getSessionFee, CENTER_SHORT_NAME,
} from '../lib/academic';

interface Row { student: Student; cls: ClassSession; p: StudentProgress }

const ATT_LABEL = { present: '✓ Có mặt', absent: '✗ Vắng', excused: '○ Có phép' } as const;

const Progress: React.FC = () => {
  const { data, updateData } = useAppContext();
  const role = parseRole(data.settings.activeRole);
  const isManager = role.kind === 'manager';
  const actor = roleDisplayName(data);
  const warnAt = data.settings.policies.lowSessionWarning;

  const myClasses = useMemo(() => (role.kind === 'teacher' ? data.classes.filter(c => c.teacherId === role.id) : data.classes), [data.classes, role.kind, role.id]);
  const [filterClass, setFilterClass] = useState('all');
  const [filterState, setFilterState] = useState<'all' | 'low' | 'debt' | 'weak' | 'reserved'>('all');
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<Row | null>(null);

  const rows: Row[] = useMemo(() => myClasses
    .filter(c => filterClass === 'all' || c.id === filterClass)
    .flatMap(cls => getClassStudents(data, cls.id).map(student => ({ student, cls, p: computeProgress(data, student.id, cls.id) }))),
    [data, myClasses, filterClass]
  );

  const filtered = rows.filter(r => {
    if (query && !r.student.name.toLowerCase().includes(query.toLowerCase())) return false;
    if (filterState === 'low') return !r.p.reserved && r.p.remaining > 0 && r.p.remaining <= warnAt;
    if (filterState === 'debt') return r.p.remaining <= 0 && !r.p.reserved;
    if (filterState === 'weak') return (r.p.avgScore !== null && r.p.avgScore < 5) || (r.p.attendanceRate > 0 && r.p.attendanceRate < 80);
    if (filterState === 'reserved') return r.p.reserved;
    return true;
  });

  const lowCount = rows.filter(r => !r.p.reserved && r.p.remaining > 0 && r.p.remaining <= warnAt).length;
  const debtCount = rows.filter(r => !r.p.reserved && r.p.remaining <= 0).length;
  const scoredRows = rows.filter(r => r.p.avgScore !== null);
  const avgAll = scoredRows.length ? (scoredRows.reduce((s, r) => s + (r.p.avgScore || 0), 0) / scoredRows.length).toFixed(1) : '-';
  const attRows = rows.filter(r => r.p.present + r.p.absent + r.p.excused > 0);
  const avgAtt = attRows.length ? Math.round(attRows.reduce((s, r) => s + r.p.attendanceRate, 0) / attRows.length) : 0;

  const sendComment = (r: Row) => {
    const rcp = resolveRecipient(r.student);
    Swal.fire({
      title: `Nhận xét: ${r.student.name}`,
      html: `<div style="font-size:13px;color:#64748b">Gửi tới: ${rcp === 'student' ? 'Học viên' : rcp === 'guardian' ? 'Người giám hộ' : 'Học viên và người giám hộ'}</div>`,
      input: 'textarea',
      inputValue: `Tình hình học tập lớp ${r.cls.name}: chuyên cần ${r.p.attendanceRate}%, đã nộp ${r.p.assignmentsDone}/${r.p.assignmentsTotal} bài tập${r.p.avgScore !== null ? `, điểm TB ${r.p.avgScore}` : ''}.\nNhận xét: `,
      showCancelButton: true, confirmButtonText: 'Gửi nhận xét', cancelButtonText: 'Hủy',
    }).then(res => {
      if (!res.isConfirmed || !res.value) return;
      const msg = buildMessage(r.student, 'comment', `${greetingFor(r.student, rcp)},\n${res.value}\n— GV/${CENTER_SHORT_NAME}`, { classId: r.cls.id, title: `Nhận xét lớp ${r.cls.name}`, sender: actor, recipient: rcp });
      updateData(prev => ({ parentMessages: [...prev.parentMessages, msg] }));
      Swal.fire({ title: 'Đã gửi nhận xét', icon: 'success', timer: 1200, showConfirmButton: false });
    });
  };

  const feeReminder = (targets: Row[]) => {
    if (targets.length === 0) return Swal.fire('Không có học viên cần nhắc', '', 'info');
    const msgs: ParentMessage[] = targets.map(r => {
      const rcp = resolveRecipient(r.student);
      const fee = getSessionFee(data, r.cls.id);
      const content = `${greetingFor(r.student, rcp)},\n${CENTER_SHORT_NAME} xin thông báo: ${rcp === 'student' ? 'em' : `em ${r.student.name}`} lớp ${r.cls.name} ${r.p.remaining > 0 ? `chỉ còn ${r.p.remaining} buổi học đã đóng phí` : r.p.remaining === 0 ? 'đã học hết số buổi đã đóng phí' : `đã học vượt ${-r.p.remaining} buổi (tương đương ${formatCurrency(-r.p.remaining * fee)})`}. Vui lòng gia hạn học phí để việc học không bị gián đoạn. Xin cảm ơn!`;
      return buildMessage(r.student, 'fee_reminder', content, { classId: r.cls.id, title: 'Nhắc gia hạn học phí', sender: actor, recipient: rcp });
    });
    updateData(prev => ({ parentMessages: [...prev.parentMessages, ...msgs] }));
    Swal.fire('Đã gửi nhắc học phí', `${msgs.length} thông báo đã gửi.`, 'success');
  };

  const remainingTone = (p: StudentProgress) => p.remaining <= 0 ? 'text-red-500' : p.remaining <= warnAt ? 'text-amber-600' : 'text-emerald-600';

  return (
    <div className="space-y-5">
      <PageHeader
        icon={TrendingUp}
        title="Tiến độ học tập"
        subtitle="Theo dõi chuyên cần, bài tập, kết quả kiểm tra và số buổi còn lại của từng học viên."
        actions={isManager && <Button variant="outline" className="gap-2" onClick={() => feeReminder(rows.filter(r => !r.p.reserved && r.p.remaining <= warnAt))}><Bell className="w-4 h-4" /> Nhắc học phí HV sắp hết buổi</Button>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Lượt HV - lớp" value={rows.length} />
        <StatCard label="Chuyên cần TB" value={`${avgAtt}%`} tone={avgAtt >= 85 ? 'text-emerald-600' : 'text-amber-600'} />
        <StatCard label="Điểm TB" value={avgAll} tone="text-blue-600" />
        <StatCard label="Sắp hết / Hết buổi" value={`${lowCount} / ${debtCount}`} tone={debtCount > 0 ? 'text-red-500' : 'text-amber-600'} hint={`Cảnh báo khi còn ≤ ${warnAt} buổi`} />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input className="h-9 pl-9 w-56" placeholder="Tìm học viên..." value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <Select className="w-auto h-9" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
          <option value="all">Tất cả lớp</option>
          {myClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select className="w-auto h-9" value={filterState} onChange={e => setFilterState(e.target.value as typeof filterState)}>
          <option value="all">Tất cả tình trạng</option>
          <option value="low">Sắp hết buổi</option>
          <option value="debt">Hết buổi / nợ phí</option>
          <option value="weak">Cần quan tâm (điểm &lt; 5 hoặc chuyên cần &lt; 80%)</option>
          <option value="reserved">Đang bảo lưu</option>
        </Select>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 border-b">
              <tr>
                <th className="px-4 py-3">Học viên</th>
                <th className="px-4 py-3">Lớp</th>
                <th className="px-4 py-3 text-center">Tiến độ lớp</th>
                <th className="px-4 py-3 text-center">Chuyên cần</th>
                <th className="px-4 py-3 text-center">Bài tập</th>
                <th className="px-4 py-3 text-center">Điểm TB</th>
                <th className="px-4 py-3 text-center">Đã học / Đã đóng</th>
                <th className="px-4 py-3 text-center">Còn lại</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(r => (
                <tr key={`${r.student.id}-${r.cls.id}`} className="hover:bg-slate-50 cursor-pointer" onClick={() => setDetail(r)}>
                  <td className="px-4 py-3 font-medium text-slate-800">{r.student.name} {r.p.reserved && <Badge tone="purple">Bảo lưu</Badge>}</td>
                  <td className="px-4 py-3 text-slate-600">{r.cls.name}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{r.p.doneLessons}/{r.p.totalLessons || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={r.p.attendanceRate >= 85 ? 'text-emerald-600' : r.p.attendanceRate >= 70 ? 'text-amber-600' : 'text-red-500'}>{r.p.present + r.p.absent + r.p.excused > 0 ? `${r.p.attendanceRate}%` : '-'}</span>
                    {r.p.makeupPending > 0 && <div className="text-[10px] text-purple-600">{r.p.makeupPending} buổi chờ bù</div>}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-600">{r.p.assignmentsTotal ? `${r.p.assignmentsDone}/${r.p.assignmentsTotal}` : '-'}</td>
                  <td className="px-4 py-3 text-center font-semibold">{r.p.avgScore ?? '-'}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{r.p.used} / {r.p.purchased}</td>
                  <td className="px-4 py-3 text-center"><span className={`font-bold ${remainingTone(r.p)}`}>{r.p.remaining}</span></td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" className="text-blue-600 px-2 gap-1" onClick={() => sendComment(r)} title="Gửi nhận xét"><MessageSquarePlus className="w-4 h-4" /></Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <EmptyRow colSpan={9} text="Không có học viên phù hợp" />}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={!!detail} wide title={detail ? `${detail.student.name} — ${detail.cls.name}` : ''} onClose={() => setDetail(null)}>
        {detail && (() => {
          const { student, cls, p } = detail;
          const atts = data.attendances.filter(a => a.studentId === student.id && a.classId === cls.id).sort((a, b) => b.date.localeCompare(a.date));
          const grades = data.grades.filter(g => g.studentId === student.id && g.classId === cls.id).sort((a, b) => b.date.localeCompare(a.date));
          const asgs = data.assignments.filter(a => a.classId === cls.id);
          const makeups = data.makeups.filter(m => m.studentId === student.id && m.classId === cls.id);
          return (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Còn lại" value={`${p.remaining} buổi`} tone={remainingTone(p)} hint={`Đã đóng ${p.purchased} • đã trừ ${p.used}`} />
                <StatCard label="Chuyên cần" value={`${p.attendanceRate}%`} hint={`${p.present} có mặt • ${p.absent} vắng • ${p.excused} có phép`} />
                <StatCard label="Bài tập" value={`${p.assignmentsDone}/${p.assignmentsTotal}`} />
                <StatCard label="Điểm TB" value={p.avgScore ?? '-'} tone="text-blue-600" hint={`Học phí đã đóng: ${formatCurrency(p.paidAmount)}`} />
              </div>
              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <h4 className="font-semibold text-slate-700 mb-2">Điểm danh</h4>
                  <div className="max-h-56 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100 text-sm">
                    {atts.map(a => (
                      <div key={a.id} className="px-3 py-2 flex justify-between">
                        <span>{formatShortDate(a.date)}</span>
                        <span className={a.status === 'present' ? 'text-emerald-600' : a.status === 'absent' ? 'text-red-500' : 'text-amber-600'}>{ATT_LABEL[a.status]}{a.note ? ` (${a.note})` : ''}</span>
                      </div>
                    ))}
                    {atts.length === 0 && <div className="px-3 py-4 text-center text-slate-400">Chưa có dữ liệu</div>}
                  </div>
                  {makeups.length > 0 && (
                    <div className="mt-3 text-sm space-y-1">
                      <h4 className="font-semibold text-slate-700">Học bù</h4>
                      {makeups.map(m => <div key={m.id} className="flex justify-between text-slate-600"><span>Vắng {formatShortDate(m.absentDate)}</span><Badge tone={m.status === 'done' ? 'green' : m.status === 'cancelled' ? 'slate' : 'purple'}>{m.status === 'done' ? 'Đã bù' : m.status === 'scheduled' ? `Hẹn ${formatShortDate(m.makeupDate)}` : m.status === 'cancelled' ? 'Hủy' : 'Chờ xếp lịch'}</Badge></div>)}
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="font-semibold text-slate-700 mb-2">Kết quả kiểm tra</h4>
                  <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100 text-sm">
                    {grades.map(g => (
                      <div key={g.id} className="px-3 py-2 flex justify-between gap-2">
                        <span className="truncate">{formatShortDate(g.date)} • {g.examType}</span>
                        <span className={`font-bold ${g.score >= 8 ? 'text-emerald-600' : g.score >= 5 ? 'text-blue-600' : 'text-red-500'}`}>{g.score}</span>
                      </div>
                    ))}
                    {grades.length === 0 && <div className="px-3 py-4 text-center text-slate-400">Chưa có điểm</div>}
                  </div>
                  <h4 className="font-semibold text-slate-700 mb-2 mt-4">Bài tập</h4>
                  <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100 text-sm">
                    {asgs.map(a => {
                      const sub = data.submissions.find(s => s.assignmentId === a.id && s.studentId === student.id);
                      const late = !sub && a.dueDate < dayjs().format('YYYY-MM-DD');
                      return (
                        <div key={a.id} className="px-3 py-2 flex justify-between gap-2">
                          <span className="truncate">{a.title}</span>
                          <span className={sub && sub.status !== 'not_submitted' ? 'text-emerald-600' : late ? 'text-red-500' : 'text-slate-400'}>
                            {sub && sub.status !== 'not_submitted' ? (sub.score !== undefined ? `${sub.score}/${a.maxScore}` : 'Đã nộp') : late ? 'Quá hạn' : 'Chưa nộp'}
                          </span>
                        </div>
                      );
                    })}
                    {asgs.length === 0 && <div className="px-3 py-4 text-center text-slate-400">Chưa có bài tập</div>}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                {isManager && <Button variant="outline" onClick={() => feeReminder([detail])} className="gap-1"><Bell className="w-4 h-4" /> Nhắc học phí</Button>}
                <Button onClick={() => sendComment(detail)} className="gap-1"><MessageSquarePlus className="w-4 h-4" /> Gửi nhận xét</Button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

export default Progress;
