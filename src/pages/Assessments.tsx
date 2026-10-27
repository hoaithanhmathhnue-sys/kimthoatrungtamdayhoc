import React, { useMemo, useState } from 'react';
import { useAppContext } from '../store/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select, Field, Badge, Modal, StatCard, PageHeader, Tabs, EmptyRow, Textarea, BadgeTone } from '../components/ui/Misc';
import { Assignment, AssignmentSubmission, Exam, ExamResult, GradeRecord, ParentMessage } from '../types';
import { FileText, Plus, ArrowLeft, Send, CheckCircle2, XCircle, Bell, Trash2, Unlock } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import Swal from 'sweetalert2';
import { parseRole, roleDisplayName, getClassStudents, buildMessage, greetingFor, resolveRecipient, nowStr, formatShortDate } from '../lib/academic';

const EXAM_TYPES = ['Kiểm tra miệng', 'Kiểm tra 15 phút', 'Kiểm tra 1 tiết', 'Kiểm tra giữa khóa', 'Thi cuối khóa', 'Thi thử'];

const EXAM_STATUS: Record<Exam['status'], { label: string; tone: BadgeTone }> = {
  draft: { label: 'Nháp', tone: 'slate' },
  pending: { label: 'Chờ duyệt', tone: 'amber' },
  approved: { label: 'Đã duyệt', tone: 'green' },
  rejected: { label: 'Yêu cầu sửa', tone: 'red' },
};

const SUB_STATUS: Record<AssignmentSubmission['status'], string> = {
  not_submitted: 'Chưa nộp', submitted: 'Đã nộp', late: 'Nộp muộn', graded: 'Đã chấm',
};

const Assessments: React.FC = () => {
  const { data, updateData, logActivity } = useAppContext();
  const role = parseRole(data.settings.activeRole);
  const isManager = role.kind === 'manager';
  const actor = roleDisplayName(data);
  const requireApproval = data.settings.policies.requireExamApproval;

  const myClasses = useMemo(() => (role.kind === 'teacher' ? data.classes.filter(c => c.teacherId === role.id) : data.classes), [data.classes, role.kind, role.id]);
  const myClassIds = myClasses.map(c => c.id);

  const [tab, setTab] = useState<'assignments' | 'exams'>('exams');
  const [filterClass, setFilterClass] = useState('all');
  const [selectedAssignment, setSelectedAssignment] = useState<string | null>(null);
  const [selectedExam, setSelectedExam] = useState<string | null>(null);
  const [subDraft, setSubDraft] = useState<Record<string, Partial<AssignmentSubmission>>>({});
  const [examDraft, setExamDraft] = useState<Record<string, ExamResult>>({});

  const [asgOpen, setAsgOpen] = useState(false);
  const [asgForm, setAsgForm] = useState<Partial<Assignment>>({});
  const [examOpen, setExamOpen] = useState(false);
  const [examForm, setExamForm] = useState<Partial<Exam>>({});

  const inFilter = (classId: string) => myClassIds.includes(classId) && (filterClass === 'all' || filterClass === classId);
  const assignments = data.assignments.filter(a => inFilter(a.classId)).sort((a, b) => b.assignedDate.localeCompare(a.assignedDate));
  const exams = data.exams.filter(e => inFilter(e.classId)).sort((a, b) => b.date.localeCompare(a.date));
  const className = (id: string) => data.classes.find(c => c.id === id)?.name || '?';

  // ===== Bài tập =====
  const openNewAssignment = () => {
    setAsgForm({ classId: filterClass !== 'all' ? filterClass : myClasses[0]?.id || '', title: '', description: '', assignedDate: dayjs().format('YYYY-MM-DD'), dueDate: dayjs().add(3, 'day').format('YYYY-MM-DD'), maxScore: 10 });
    setAsgOpen(true);
  };
  const saveAssignment = () => {
    if (!asgForm.classId || !asgForm.title) return Swal.fire('Lỗi', 'Chọn lớp và nhập tên bài tập', 'error');
    updateData(prev => ({ assignments: [...prev.assignments, { ...asgForm, id: uuidv4() } as Assignment] }));
    logActivity('add', 'assignment', asgForm.title || '', className(asgForm.classId));
    setAsgOpen(false);
  };
  const openAssignment = (a: Assignment) => {
    const d: Record<string, Partial<AssignmentSubmission>> = {};
    data.submissions.filter(s => s.assignmentId === a.id).forEach(s => { d[s.studentId] = { ...s }; });
    setSubDraft(d);
    setSelectedAssignment(a.id);
  };
  const deleteAssignment = (a: Assignment) => {
    Swal.fire({ title: 'Xóa bài tập?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy' }).then(r => {
      if (r.isConfirmed) updateData(prev => ({ assignments: prev.assignments.filter(x => x.id !== a.id), submissions: prev.submissions.filter(s => s.assignmentId !== a.id) }));
    });
  };

  // ===== Kiểm tra =====
  const openNewExam = () => {
    setExamForm({ classId: filterClass !== 'all' ? filterClass : myClasses[0]?.id || '', title: '', examType: EXAM_TYPES[1], date: dayjs().format('YYYY-MM-DD'), maxScore: 10 });
    setExamOpen(true);
  };
  const saveExam = () => {
    if (!examForm.classId || !examForm.title) return Swal.fire('Lỗi', 'Chọn lớp và nhập tên bài kiểm tra', 'error');
    const exam = { ...examForm, id: uuidv4(), status: 'draft', createdBy: actor, results: [] } as Exam;
    updateData(prev => ({ exams: [...prev.exams, exam] }));
    logActivity('add', 'exam', exam.title, className(exam.classId));
    setExamOpen(false);
    openExam(exam);
  };
  const openExam = (e: Exam) => {
    const d: Record<string, ExamResult> = {};
    e.results.forEach(r => { d[r.studentId] = { ...r }; });
    setExamDraft(d);
    setSelectedExam(e.id);
  };
  const deleteExam = (e: Exam) => {
    Swal.fire({ title: 'Xóa bài kiểm tra?', text: 'Điểm đã công bố của bài này cũng bị xóa khỏi Kết quả HT.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy' }).then(r => {
      if (r.isConfirmed) updateData(prev => ({ exams: prev.exams.filter(x => x.id !== e.id), grades: prev.grades.filter(g => g.examId !== e.id) }));
    });
  };

  // ===== Chi tiết bài tập =====
  const asg = data.assignments.find(a => a.id === selectedAssignment);
  if (asg) {
    const students = getClassStudents(data, asg.classId);
    const done = students.filter(s => subDraft[s.id]?.status && subDraft[s.id]?.status !== 'not_submitted').length;
    const setSub = (sid: string, patch: Partial<AssignmentSubmission>) => setSubDraft(prev => ({ ...prev, [sid]: { ...prev[sid], ...patch } }));

    const save = () => {
      updateData(prev => {
        const others = prev.submissions.filter(s => s.assignmentId !== asg.id);
        const subs: AssignmentSubmission[] = students.filter(s => subDraft[s.id]?.status).map(s => ({
          id: subDraft[s.id].id || uuidv4(), assignmentId: asg.id, studentId: s.id,
          status: subDraft[s.id].status!, score: subDraft[s.id].score, feedback: subDraft[s.id].feedback,
          submittedAt: subDraft[s.id].submittedAt || (subDraft[s.id].status !== 'not_submitted' ? dayjs().format('YYYY-MM-DD') : undefined),
        }));
        return { submissions: [...others, ...subs] };
      });
      Swal.fire({ title: 'Đã lưu', icon: 'success', timer: 1000, showConfirmButton: false });
    };

    const remind = () => {
      const pending = students.filter(s => !subDraft[s.id]?.status || subDraft[s.id]?.status === 'not_submitted');
      if (pending.length === 0) return Swal.fire('Tất cả đã nộp', '', 'info');
      const msgs: ParentMessage[] = pending.map(s => {
        const rcp = resolveRecipient(s);
        return buildMessage(s, 'comment', `${greetingFor(s, rcp)},\nBài tập "${asg.title}" lớp ${className(asg.classId)} có hạn nộp ${formatShortDate(asg.dueDate)}. Hiện ${rcp === 'student' ? 'em' : `em ${s.name}`} chưa nộp bài, mong ${rcp === 'student' ? 'em' : 'gia đình nhắc nhở em'} hoàn thành đúng hạn.`, { classId: asg.classId, title: `Nhắc nộp bài: ${asg.title}`, sender: actor, recipient: rcp });
      });
      updateData(prev => ({ parentMessages: [...prev.parentMessages, ...msgs] }));
      Swal.fire('Đã gửi nhắc nhở', `${msgs.length} thông báo đã được gửi.`, 'success');
    };

    return (
      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => setSelectedAssignment(null)} className="h-10 w-10 p-0 rounded-full bg-slate-100"><ArrowLeft className="w-5 h-5" /></Button>
            <div>
              <h2 className="text-xl font-bold text-slate-800">{asg.title}</h2>
              <p className="text-sm text-slate-500">{className(asg.classId)} • Giao {formatShortDate(asg.assignedDate)} • Hạn nộp {formatShortDate(asg.dueDate)} • {done}/{students.length} đã nộp</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={remind} className="gap-1"><Bell className="w-4 h-4" /> Nhắc HV chưa nộp</Button>
            <Button onClick={save}>Lưu</Button>
          </div>
        </div>
        {asg.description && <Card className="p-4 text-sm text-slate-600">{asg.description}</Card>}
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 border-b">
                <tr><th className="px-4 py-3">Học viên</th><th className="px-4 py-3">Tình trạng</th><th className="px-4 py-3 w-28">Điểm /{asg.maxScore}</th><th className="px-4 py-3">Nhận xét</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map(s => {
                  const row = subDraft[s.id] || {};
                  return (
                    <tr key={s.id}>
                      <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                      <td className="px-4 py-3">
                        <Select className="h-9 w-40" value={row.status || 'not_submitted'} onChange={e => setSub(s.id, { status: e.target.value as AssignmentSubmission['status'] })}>
                          {Object.entries(SUB_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </Select>
                      </td>
                      <td className="px-4 py-3"><Input type="number" min={0} max={asg.maxScore} step={0.25} className="h-9" value={row.score ?? ''} onChange={e => setSub(s.id, { score: e.target.value === '' ? undefined : Number(e.target.value), status: 'graded' })} /></td>
                      <td className="px-4 py-3"><Input className="h-9" value={row.feedback || ''} onChange={e => setSub(s.id, { feedback: e.target.value })} placeholder="Nhận xét bài làm" /></td>
                    </tr>
                  );
                })}
                {students.length === 0 && <EmptyRow colSpan={4} text="Lớp chưa có học viên" />}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  // ===== Chi tiết kiểm tra =====
  const exam = data.exams.find(e => e.id === selectedExam);
  if (exam) {
    const students = getClassStudents(data, exam.classId);
    const editable = isManager || exam.status === 'draft' || exam.status === 'rejected';
    const setRes = (sid: string, patch: Partial<ExamResult>) => setExamDraft(prev => ({ ...prev, [sid]: { ...prev[sid], studentId: sid, ...patch } }));
    const results = (): ExamResult[] => students.map(s => examDraft[s.id] || { studentId: s.id }).filter(r => r.score !== undefined || r.comment);
    const scored = results().filter(r => r.score !== undefined);
    const avg = scored.length ? (scored.reduce((s, r) => s + (r.score || 0), 0) / scored.length).toFixed(1) : '-';
    const passRate = scored.length ? Math.round(scored.filter(r => (r.score || 0) >= exam.maxScore / 2).length / scored.length * 100) : 0;

    const toGrades = (e: Exam, res: ExamResult[]): GradeRecord[] => res.filter(r => r.score !== undefined).map(r => ({
      id: uuidv4(), studentId: r.studentId, classId: e.classId, subject: data.classes.find(c => c.id === e.classId)?.subject || '',
      examType: e.examType, score: Math.round(((r.score || 0) / (e.maxScore || 10)) * 100) / 10, date: e.date, note: r.comment, examId: e.id,
    }));

    const invalid = scored.some(r => (r.score || 0) < 0 || (r.score || 0) > exam.maxScore);

    const saveDraft = () => {
      if (invalid) return Swal.fire('Lỗi', `Điểm phải từ 0 đến ${exam.maxScore}`, 'error');
      updateData(prev => ({ exams: prev.exams.map(e => e.id === exam.id ? { ...e, results: results() } : e) }));
      Swal.fire({ title: 'Đã lưu', icon: 'success', timer: 1000, showConfirmButton: false });
    };

    const approveNow = (e: Exam, res: ExamResult[]) => {
      updateData(prev => ({
        exams: prev.exams.map(x => x.id === e.id ? { ...x, results: res, status: 'approved', reviewedAt: nowStr(), reviewNote: undefined } : x),
        grades: [...prev.grades.filter(g => g.examId !== e.id), ...toGrades(e, res)],
      }));
      logActivity('edit', 'exam', e.title, 'Duyệt & công bố điểm');
    };

    const submit = () => {
      if (invalid) return Swal.fire('Lỗi', `Điểm phải từ 0 đến ${exam.maxScore}`, 'error');
      if (scored.length === 0) return Swal.fire('Chưa có điểm', 'Nhập điểm trước khi gửi.', 'warning');
      if (isManager || !requireApproval) {
        approveNow(exam, results());
        Swal.fire('Đã công bố điểm', 'Điểm đã được ghi vào Kết quả học tập.', 'success');
      } else {
        updateData(prev => ({ exams: prev.exams.map(e => e.id === exam.id ? { ...e, results: results(), status: 'pending', submittedAt: nowStr() } : e) }));
        logActivity('edit', 'exam', exam.title, 'Gửi duyệt');
        Swal.fire('Đã gửi duyệt', 'Quản lý sẽ kiểm tra và duyệt kết quả.', 'success');
      }
    };

    const reject = () => {
      Swal.fire({ title: 'Yêu cầu GV chỉnh sửa', input: 'textarea', inputPlaceholder: 'Nội dung cần sửa...', showCancelButton: true, confirmButtonText: 'Gửi lại GV', cancelButtonText: 'Hủy' }).then(r => {
        if (!r.isConfirmed) return;
        updateData(prev => ({ exams: prev.exams.map(e => e.id === exam.id ? { ...e, status: 'rejected', reviewNote: r.value, reviewedAt: nowStr() } : e) }));
      });
    };

    const reopen = () => {
      updateData(prev => ({
        exams: prev.exams.map(e => e.id === exam.id ? { ...e, status: 'draft' } : e),
        grades: prev.grades.filter(g => g.examId !== exam.id),
      }));
    };

    const notify = () => {
      const msgs: ParentMessage[] = exam.results.filter(r => r.score !== undefined).map(r => {
        const s = data.students.find(x => x.id === r.studentId);
        if (!s) return null;
        const rcp = resolveRecipient(s);
        const content = `${greetingFor(s, rcp)},\nKết quả "${exam.title}" (${formatShortDate(exam.date)}) lớp ${className(exam.classId)} của ${rcp === 'student' ? 'em' : `em ${s.name}`}: ${r.score}/${exam.maxScore} điểm.${r.comment ? `\nNhận xét của GV: ${r.comment}` : ''}\nĐiểm TB lớp: ${avg}.`;
        return buildMessage(s, 'grade', content, { classId: exam.classId, title: `Kết quả: ${exam.title}`, sender: actor, recipient: rcp });
      }).filter(Boolean) as ParentMessage[];
      updateData(prev => ({
        parentMessages: [...prev.parentMessages, ...msgs],
        exams: prev.exams.map(e => e.id === exam.id ? { ...e, notifiedAt: nowStr() } : e),
      }));
      Swal.fire('Đã gửi kết quả', `${msgs.length} thông báo kết quả đã gửi đến học viên/người giám hộ.`, 'success');
    };

    return (
      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => setSelectedExam(null)} className="h-10 w-10 p-0 rounded-full bg-slate-100"><ArrowLeft className="w-5 h-5" /></Button>
            <div>
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">{exam.title} <Badge tone={EXAM_STATUS[exam.status].tone}>{EXAM_STATUS[exam.status].label}</Badge></h2>
              <p className="text-sm text-slate-500">{className(exam.classId)} • {exam.examType} • {formatShortDate(exam.date)} • Thang điểm {exam.maxScore} • Người tạo: {exam.createdBy || '-'}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {editable && exam.status !== 'approved' && <Button variant="outline" onClick={saveDraft}>Lưu nháp</Button>}
            {(exam.status === 'draft' || exam.status === 'rejected') && (
              <Button onClick={submit} className="gap-1"><Send className="w-4 h-4" /> {isManager || !requireApproval ? 'Duyệt & công bố' : 'Gửi duyệt'}</Button>
            )}
            {isManager && exam.status === 'pending' && <>
              <Button variant="outline" onClick={reject} className="gap-1 text-red-600"><XCircle className="w-4 h-4" /> Yêu cầu sửa</Button>
              <Button onClick={() => { if (invalid) return; approveNow(exam, results()); Swal.fire('Đã duyệt', 'Điểm đã được công bố vào Kết quả học tập.', 'success'); }} className="gap-1"><CheckCircle2 className="w-4 h-4" /> Duyệt</Button>
            </>}
            {exam.status === 'approved' && <>
              <Button onClick={notify} className="gap-1"><Bell className="w-4 h-4" /> {exam.notifiedAt ? 'Gửi lại kết quả' : 'Gửi kết quả cho PH/HV'}</Button>
              {isManager && <Button variant="outline" onClick={reopen} className="gap-1"><Unlock className="w-4 h-4" /> Mở lại</Button>}
            </>}
          </div>
        </div>

        {exam.status === 'rejected' && exam.reviewNote && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">Quản lý yêu cầu chỉnh sửa: {exam.reviewNote}</div>
        )}
        {exam.notifiedAt && <div className="text-xs text-emerald-600">✓ Đã gửi kết quả lúc {exam.notifiedAt}</div>}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Đã có điểm" value={`${scored.length}/${students.length}`} />
          <StatCard label="Điểm TB" value={avg} tone="text-blue-600" />
          <StatCard label="Cao nhất" value={scored.length ? Math.max(...scored.map(r => r.score || 0)) : '-'} tone="text-emerald-600" />
          <StatCard label="Tỷ lệ đạt (≥ 50%)" value={`${passRate}%`} tone={passRate >= 70 ? 'text-emerald-600' : 'text-amber-600'} />
        </div>

        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 border-b">
                <tr><th className="px-4 py-3 w-10">#</th><th className="px-4 py-3">Học viên</th><th className="px-4 py-3 w-32">Điểm /{exam.maxScore}</th><th className="px-4 py-3">Nhận xét</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((s, i) => {
                  const r = examDraft[s.id] || { studentId: s.id };
                  return (
                    <tr key={s.id}>
                      <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                      <td className="px-4 py-3"><Input disabled={!editable} type="number" min={0} max={exam.maxScore} step={0.25} className="h-9" value={r.score ?? ''} onChange={e => setRes(s.id, { score: e.target.value === '' ? undefined : Number(e.target.value) })} /></td>
                      <td className="px-4 py-3"><Input disabled={!editable} className="h-9" value={r.comment || ''} onChange={e => setRes(s.id, { comment: e.target.value })} placeholder="Nhận xét" /></td>
                    </tr>
                  );
                })}
                {students.length === 0 && <EmptyRow colSpan={4} text="Lớp chưa có học viên" />}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  // ===== Danh sách =====
  const pendingExams = data.exams.filter(e => myClassIds.includes(e.classId) && e.status === 'pending').length;
  const rejectedExams = data.exams.filter(e => myClassIds.includes(e.classId) && e.status === 'rejected').length;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={FileText}
        title="Bài tập & Kiểm tra"
        subtitle={isManager ? 'Giáo viên nhập điểm và gửi duyệt; quản lý kiểm tra, duyệt rồi công bố kết quả.' : 'Giao bài tập, chấm bài, nhập điểm kiểm tra và gửi quản lý duyệt.'}
        actions={tab === 'assignments'
          ? <Button onClick={openNewAssignment} className="gap-2"><Plus className="w-4 h-4" /> Giao bài tập</Button>
          : <Button onClick={openNewExam} className="gap-2"><Plus className="w-4 h-4" /> Tạo bài kiểm tra</Button>}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs active={tab} onChange={id => setTab(id as typeof tab)} tabs={[
          { id: 'exams', label: '📝 Kiểm tra', count: isManager ? pendingExams : rejectedExams },
          { id: 'assignments', label: '📚 Bài tập' },
        ]} />
        <Select className="w-auto h-9" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
          <option value="all">Tất cả lớp</option>
          {myClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>

      {tab === 'exams' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 border-b">
                <tr><th className="px-4 py-3">Ngày</th><th className="px-4 py-3">Bài kiểm tra</th><th className="px-4 py-3">Lớp</th><th className="px-4 py-3 text-center">Đã nhập</th><th className="px-4 py-3 text-center">Điểm TB</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3 w-24"></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {exams.map(e => {
                  const sc = e.results.filter(r => r.score !== undefined);
                  const a = sc.length ? (sc.reduce((s, r) => s + (r.score || 0), 0) / sc.length).toFixed(1) : '-';
                  return (
                    <tr key={e.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openExam(e)}>
                      <td className="px-4 py-3 text-slate-600">{formatShortDate(e.date)}</td>
                      <td className="px-4 py-3"><div className="font-medium text-slate-800">{e.title}</div><div className="text-xs text-slate-400">{e.examType} • {e.createdBy}</div></td>
                      <td className="px-4 py-3 text-slate-600">{className(e.classId)}</td>
                      <td className="px-4 py-3 text-center">{sc.length}/{getClassStudents(data, e.classId).length}</td>
                      <td className="px-4 py-3 text-center font-semibold text-blue-600">{a}</td>
                      <td className="px-4 py-3"><Badge tone={EXAM_STATUS[e.status].tone}>{EXAM_STATUS[e.status].label}</Badge>{e.notifiedAt && <Badge tone="blue" className="ml-1">Đã báo PH</Badge>}</td>
                      <td className="px-4 py-3" onClick={ev => ev.stopPropagation()}>
                        {(isManager || e.status === 'draft') && <Button size="sm" variant="ghost" className="text-red-400 px-2" onClick={() => deleteExam(e)}><Trash2 className="w-4 h-4" /></Button>}
                      </td>
                    </tr>
                  );
                })}
                {exams.length === 0 && <EmptyRow colSpan={7} text="Chưa có bài kiểm tra nào" />}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'assignments' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 border-b">
                <tr><th className="px-4 py-3">Bài tập</th><th className="px-4 py-3">Lớp</th><th className="px-4 py-3">Giao</th><th className="px-4 py-3">Hạn nộp</th><th className="px-4 py-3">Tỷ lệ nộp</th><th className="px-4 py-3 w-16"></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assignments.map(a => {
                  const total = getClassStudents(data, a.classId).length;
                  const done = data.submissions.filter(s => s.assignmentId === a.id && s.status !== 'not_submitted').length;
                  const pct = total ? Math.round(done / total * 100) : 0;
                  const overdue = a.dueDate < dayjs().format('YYYY-MM-DD') && done < total;
                  return (
                    <tr key={a.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openAssignment(a)}>
                      <td className="px-4 py-3"><div className="font-medium text-slate-800">{a.title}</div>{a.description && <div className="text-xs text-slate-400 truncate max-w-[280px]">{a.description}</div>}</td>
                      <td className="px-4 py-3 text-slate-600">{className(a.classId)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatShortDate(a.assignedDate)}</td>
                      <td className="px-4 py-3">{formatShortDate(a.dueDate)} {overdue && <Badge tone="red">Quá hạn</Badge>}</td>
                      <td className="px-4 py-3 min-w-[140px]">
                        <div className="text-xs text-slate-500 mb-1">{done}/{total} ({pct}%)</div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                      </td>
                      <td className="px-4 py-3" onClick={ev => ev.stopPropagation()}><Button size="sm" variant="ghost" className="text-red-400 px-2" onClick={() => deleteAssignment(a)}><Trash2 className="w-4 h-4" /></Button></td>
                    </tr>
                  );
                })}
                {assignments.length === 0 && <EmptyRow colSpan={6} text="Chưa giao bài tập nào" />}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={asgOpen} title="Giao bài tập" onClose={() => setAsgOpen(false)}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Lớp" className="col-span-2">
            <Select value={asgForm.classId} onChange={e => setAsgForm({ ...asgForm, classId: e.target.value })}>
              <option value="">-- Chọn lớp --</option>
              {myClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Tên bài tập *" className="col-span-2"><Input value={asgForm.title} onChange={e => setAsgForm({ ...asgForm, title: e.target.value })} /></Field>
          <Field label="Ngày giao"><Input type="date" value={asgForm.assignedDate} onChange={e => setAsgForm({ ...asgForm, assignedDate: e.target.value })} /></Field>
          <Field label="Hạn nộp"><Input type="date" value={asgForm.dueDate} onChange={e => setAsgForm({ ...asgForm, dueDate: e.target.value })} /></Field>
          <Field label="Thang điểm"><Input type="number" min={1} value={asgForm.maxScore} onChange={e => setAsgForm({ ...asgForm, maxScore: Number(e.target.value) })} /></Field>
          <Field label="Yêu cầu / Mô tả" className="col-span-2"><Textarea value={asgForm.description} onChange={e => setAsgForm({ ...asgForm, description: e.target.value })} /></Field>
        </div>
        <div className="flex justify-end gap-3 mt-4"><Button variant="outline" onClick={() => setAsgOpen(false)}>Hủy</Button><Button onClick={saveAssignment}>Giao bài</Button></div>
      </Modal>

      <Modal open={examOpen} title="Tạo bài kiểm tra" onClose={() => setExamOpen(false)}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Lớp" className="col-span-2">
            <Select value={examForm.classId} onChange={e => setExamForm({ ...examForm, classId: e.target.value })}>
              <option value="">-- Chọn lớp --</option>
              {myClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Tên bài kiểm tra *" className="col-span-2"><Input value={examForm.title} onChange={e => setExamForm({ ...examForm, title: e.target.value })} /></Field>
          <Field label="Hình thức">
            <Select value={examForm.examType} onChange={e => setExamForm({ ...examForm, examType: e.target.value })}>
              {EXAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Ngày kiểm tra"><Input type="date" value={examForm.date} onChange={e => setExamForm({ ...examForm, date: e.target.value })} /></Field>
          <Field label="Thang điểm"><Input type="number" min={1} value={examForm.maxScore} onChange={e => setExamForm({ ...examForm, maxScore: Number(e.target.value) })} /></Field>
        </div>
        <div className="flex justify-end gap-3 mt-4"><Button variant="outline" onClick={() => setExamOpen(false)}>Hủy</Button><Button onClick={saveExam}>Tạo & nhập điểm</Button></div>
      </Modal>
    </div>
  );
};

export default Assessments;
