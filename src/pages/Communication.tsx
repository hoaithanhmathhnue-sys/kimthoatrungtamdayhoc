import React, { useMemo, useState } from 'react';
import { useAppContext } from '../store/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select, Field, Badge, Modal, StatCard, PageHeader, Tabs, EmptyRow, Textarea, BadgeTone } from '../components/ui/Misc';
import { Feedback, MessageType, ParentMessage, Student } from '../types';
import { MessagesSquare, Send, Copy, CheckCheck, Eye, Plus, Inbox, Edit2, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import Swal from 'sweetalert2';
import {
  parseRole, roleDisplayName, getClassStudents, getStudentClassIds, resolveRecipient, recipientContact, greetingFor,
  fillTemplate, buildMessage, nowStr, MESSAGE_TYPE_LABELS, RECIPIENT_LABELS, CENTER_SHORT_NAME,
} from '../lib/academic';

const TEMPLATES: Record<MessageType, { title: string; body: string }> = {
  comment: { title: 'Nhận xét học tập', body: '{greeting},\nGiáo viên lớp {className} xin gửi nhận xét về {who}: [Nội dung nhận xét]. Trân trọng.' },
  schedule: { title: 'Thông báo lịch học', body: '{greeting},\n{center} thông báo lịch học lớp {className}: [Thời gian/thay đổi lịch]. Mong {who} sắp xếp tham gia đầy đủ.' },
  absence: { title: 'Thông báo vắng mặt', body: '{greeting},\n{center} thông báo {who} đã vắng mặt buổi học lớp {className} ngày {date}. Vui lòng phản hồi lý do để trung tâm sắp xếp học bù.' },
  grade: { title: 'Kết quả kiểm tra', body: '{greeting},\nKết quả kiểm tra gần đây của {who} lớp {className}: [Điểm/Nhận xét].' },
  fee_reminder: { title: 'Nhắc học phí', body: '{greeting},\n{center} xin nhắc: học phí lớp {className} của {who} sắp đến hạn. Vui lòng thanh toán để việc học không bị gián đoạn. Xin cảm ơn!' },
  general: { title: 'Thông báo chung', body: '{greeting},\n{center} xin thông báo: [Nội dung]. Trân trọng cảm ơn!' },
};

const MSG_STATUS: Record<NonNullable<ParentMessage['status']>, { label: string; tone: BadgeTone }> = {
  sent: { label: 'Đã gửi', tone: 'slate' },
  delivered: { label: 'Đã nhận', tone: 'blue' },
  read: { label: 'Đã xem', tone: 'green' },
};

export const FEEDBACK_STATUS: Record<Feedback['status'], { label: string; tone: BadgeTone }> = {
  new: { label: 'Mới', tone: 'red' },
  received: { label: 'Đã tiếp nhận', tone: 'blue' },
  processing: { label: 'Đang xử lý', tone: 'amber' },
  resolved: { label: 'Đã xử lý', tone: 'green' },
};

export const FEEDBACK_CATEGORY: Record<Feedback['category'], string> = {
  reply: 'Trả lời thông báo', feedback: 'Phản hồi', suggestion: 'Góp ý', complaint: 'Khiếu nại', question: 'Hỏi đáp',
};

const CHANNEL_LABEL: Record<string, string> = { app: 'Ứng dụng', zalo: 'Zalo', sms: 'SMS', manual: 'Gọi/Trực tiếp', portal: 'Cổng PH', phone: 'Điện thoại', direct: 'Trực tiếp' };

const Communication: React.FC = () => {
  const { data, updateData, logActivity } = useAppContext();
  const role = parseRole(data.settings.activeRole);
  const isManager = role.kind === 'manager';
  const actor = roleDisplayName(data);

  const myClasses = useMemo(() => (role.kind === 'teacher' ? data.classes.filter(c => c.teacherId === role.id) : data.classes), [data.classes, role.kind, role.id]);
  const myStudents = useMemo(() => {
    if (isManager) return data.students;
    const ids = new Set(myClasses.flatMap(c => getClassStudents(data, c.id).map(s => s.id)));
    return data.students.filter(s => ids.has(s.id));
  }, [data, myClasses, isManager]);
  const myStudentIds = new Set(myStudents.map(s => s.id));

  const [tab, setTab] = useState<'compose' | 'sent' | 'feedback'>('compose');

  // ===== Soạn =====
  const [target, setTarget] = useState<'student' | 'class' | 'all'>('student');
  const [studentId, setStudentId] = useState('');
  const [classId, setClassId] = useState('');
  const [type, setType] = useState<MessageType>('comment');
  const [recipientMode, setRecipientMode] = useState<'auto' | 'student' | 'guardian' | 'both'>('auto');
  const [channel, setChannel] = useState<ParentMessage['channel']>('app');
  const [title, setTitle] = useState(TEMPLATES.comment.title);
  const [body, setBody] = useState(TEMPLATES.comment.body);

  const recipients: { s: Student; classId?: string }[] = useMemo(() => {
    if (target === 'student') {
      const s = myStudents.find(x => x.id === studentId);
      return s ? [{ s, classId: classId || getStudentClassIds(data, s.id)[0] }] : [];
    }
    if (target === 'class') return classId ? getClassStudents(data, classId).filter(s => s.applicationStatus !== 'inactive').map(s => ({ s, classId })) : [];
    return myStudents.filter(s => s.applicationStatus !== 'inactive').map(s => ({ s, classId: getStudentClassIds(data, s.id)[0] }));
  }, [target, studentId, classId, myStudents, data]);

  const rcpFor = (s: Student) => (recipientMode === 'auto' ? resolveRecipient(s) : recipientMode);
  const render = (s: Student, cId?: string) => {
    const rcp = rcpFor(s);
    return fillTemplate(body, {
      greeting: greetingFor(s, rcp), who: rcp === 'student' ? 'em' : `em ${s.name}`, studentName: s.name,
      parentName: s.parentName, className: data.classes.find(c => c.id === cId)?.name || '', date: dayjs().format('DD/MM/YYYY'), center: CENTER_SHORT_NAME,
    });
  };

  const applyType = (t: MessageType) => { setType(t); setTitle(TEMPLATES[t].title); setBody(TEMPLATES[t].body); };

  const send = () => {
    if (recipients.length === 0) return Swal.fire('Chưa chọn người nhận', 'Chọn học viên hoặc lớp.', 'warning');
    if (!body.trim()) return Swal.fire('Thiếu nội dung', '', 'warning');
    const msgs = recipients.map(({ s, classId: cId }) => buildMessage(s, type, render(s, cId), { classId: cId, title, channel, sender: actor, recipient: rcpFor(s) }));
    updateData(prev => ({ parentMessages: [...prev.parentMessages, ...msgs] }));
    logActivity('add', 'message', title, `Gửi ${msgs.length} thông báo`);
    Swal.fire('Đã gửi', `${msgs.length} thông báo đã được gửi${channel === 'app' ? ' lên Cổng phụ huynh' : `. Hãy gửi qua ${CHANNEL_LABEL[channel]} rồi xác nhận "Đã nhận" trong mục Đã gửi`}.`, 'success');
    setTab('sent');
  };

  const copyPreview = () => {
    if (!recipients[0]) return;
    navigator.clipboard.writeText(render(recipients[0].s, recipients[0].classId));
    Swal.fire({ title: 'Đã copy!', icon: 'success', timer: 1000, showConfirmButton: false });
  };

  // ===== Đã gửi =====
  const [msgFilterType, setMsgFilterType] = useState('all');
  const [msgFilterStatus, setMsgFilterStatus] = useState('all');
  const [viewMsg, setViewMsg] = useState<ParentMessage | null>(null);
  const messages = data.parentMessages
    .filter(m => myStudentIds.has(m.studentId))
    .filter(m => msgFilterType === 'all' || m.type === msgFilterType)
    .filter(m => msgFilterStatus === 'all' || (m.status || 'sent') === msgFilterStatus)
    .slice().sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const allMine = data.parentMessages.filter(m => myStudentIds.has(m.studentId));
  const unconfirmed = allMine.filter(m => (m.status || 'sent') === 'sent').length;
  const readCount = allMine.filter(m => m.status === 'read').length;

  const [editMsg, setEditMsg] = useState<ParentMessage | null>(null);
  const saveEditMsg = () => {
    if (!editMsg || !editMsg.content.trim()) return Swal.fire('Thiếu nội dung', '', 'warning');
    updateData(prev => ({ parentMessages: prev.parentMessages.map(m => m.id === editMsg.id ? { ...m, title: editMsg.title, content: editMsg.content, type: editMsg.type, channel: editMsg.channel } : m) }));
    setEditMsg(null);
    Swal.fire({ title: 'Đã cập nhật thông báo', icon: 'success', timer: 1000, showConfirmButton: false });
  };
  const deleteMsg = (m: ParentMessage) => {
    Swal.fire({ title: 'Xóa thông báo?', text: 'Thông báo sẽ không còn hiển thị trên Cổng phụ huynh.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy' }).then(r => {
      if (r.isConfirmed) updateData(prev => ({ parentMessages: prev.parentMessages.filter(x => x.id !== m.id) }));
    });
  };

  const markDelivered = (ids: string[]) => {
    updateData(prev => ({ parentMessages: prev.parentMessages.map(m => ids.includes(m.id) && (m.status || 'sent') === 'sent' ? { ...m, status: 'delivered', deliveredAt: nowStr() } : m) }));
  };

  // ===== Phản hồi =====
  const [fbFilter, setFbFilter] = useState<'open' | 'all' | Feedback['status']>('open');
  const [fbOpen, setFbOpen] = useState(false);
  const [fbForm, setFbForm] = useState<Partial<Feedback>>({});
  const [editFbId, setEditFbId] = useState<string | null>(null);
  const [handling, setHandling] = useState<Feedback | null>(null);
  const [responseText, setResponseText] = useState('');

  const feedbacks = data.feedbacks
    .filter(f => myStudentIds.has(f.studentId))
    .filter(f => fbFilter === 'all' || (fbFilter === 'open' ? f.status !== 'resolved' : f.status === fbFilter))
    .slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const allFb = data.feedbacks.filter(f => myStudentIds.has(f.studentId));
  const resolved = allFb.filter(f => f.status === 'resolved' && f.resolvedAt);
  const avgHours = resolved.length ? Math.round(resolved.reduce((s, f) => s + dayjs(f.resolvedAt).diff(dayjs(f.createdAt), 'hour'), 0) / resolved.length) : null;

  const updateFb = (id: string, patch: Partial<Feedback>, action: string) => {
    updateData(prev => ({
      feedbacks: prev.feedbacks.map(f => f.id === id ? { ...f, ...patch, history: [...(f.history || []), { at: nowStr(), by: actor, action }] } : f),
    }));
  };

  const receive = (f: Feedback) => updateFb(f.id, { status: 'received', receivedAt: nowStr(), assignee: f.assignee || actor }, 'Tiếp nhận phản hồi');

  const openHandle = (f: Feedback) => { setHandling(f); setResponseText(f.response || ''); };

  const saveHandling = (status: Feedback['status']) => {
    if (!handling) return;
    if (status === 'resolved' && !responseText.trim()) return Swal.fire('Thiếu nội dung', 'Nhập nội dung trả lời / kết quả xử lý.', 'warning');
    const s = data.students.find(x => x.id === handling.studentId);
    const reply = status === 'resolved' && s
      ? buildMessage(s, 'general', `${greetingFor(s, handling.fromRole === 'student' ? 'student' : 'guardian')},\n${CENTER_SHORT_NAME} trả lời ${FEEDBACK_CATEGORY[handling.category].toLowerCase()} của ${handling.fromRole === 'student' ? 'em' : 'Quý PH'}:\n"${handling.content.slice(0, 120)}${handling.content.length > 120 ? '...' : ''}"\n\n${responseText}`,
        { title: `Trả lời: ${FEEDBACK_CATEGORY[handling.category]}`, sender: actor, recipient: handling.fromRole === 'student' ? 'student' : 'guardian' })
      : null;
    updateData(prev => ({
      feedbacks: prev.feedbacks.map(f => f.id === handling.id ? {
        ...f, status, response: responseText, assignee: f.assignee || actor,
        receivedAt: f.receivedAt || nowStr(),
        resolvedAt: status === 'resolved' ? nowStr() : f.resolvedAt,
        history: [...(f.history || []), { at: nowStr(), by: actor, action: status === 'resolved' ? 'Đã xử lý & trả lời' : 'Cập nhật: đang xử lý' }],
      } : f),
      parentMessages: reply ? [...prev.parentMessages, reply] : prev.parentMessages,
    }));
    setHandling(null);
    Swal.fire({ title: status === 'resolved' ? 'Đã xử lý & gửi trả lời' : 'Đã cập nhật', icon: 'success', timer: 1200, showConfirmButton: false });
  };

  const openEditFeedback = (f: Feedback) => { setEditFbId(f.id); setFbForm({ ...f }); setFbOpen(true); };
  const deleteFeedback = (f: Feedback) => {
    Swal.fire({ title: 'Xóa phản hồi?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy' }).then(r => {
      if (r.isConfirmed) updateData(prev => ({ feedbacks: prev.feedbacks.filter(x => x.id !== f.id) }));
    });
  };

  const openNewFeedback = () => {
    setEditFbId(null);
    setFbForm({ studentId: myStudents[0]?.id || '', fromRole: 'guardian', category: 'feedback', channel: 'phone', content: '', fromName: myStudents[0]?.parentName || '' });
    setFbOpen(true);
  };
  const saveFeedback = () => {
    const s = data.students.find(x => x.id === fbForm.studentId);
    if (!s || !fbForm.content) return Swal.fire('Lỗi', 'Chọn học viên và nhập nội dung', 'error');
    if (editFbId) {
      updateData(prev => ({
        feedbacks: prev.feedbacks.map(f => f.id === editFbId ? {
          ...f, studentId: s.id, fromName: fbForm.fromName || f.fromName, fromRole: fbForm.fromRole || f.fromRole, category: fbForm.category || f.category,
          channel: fbForm.channel || f.channel, content: fbForm.content!, history: [...(f.history || []), { at: nowStr(), by: actor, action: 'Sửa nội dung phản hồi' }],
        } : f),
      }));
      setFbOpen(false);
      setEditFbId(null);
      return;
    }
    const fb: Feedback = {
      id: uuidv4(), studentId: s.id, fromName: fbForm.fromName || (fbForm.fromRole === 'student' ? s.name : s.parentName), fromRole: fbForm.fromRole || 'guardian',
      category: fbForm.category || 'feedback', content: fbForm.content, channel: fbForm.channel || 'phone', createdAt: nowStr(),
      status: 'received', receivedAt: nowStr(), assignee: actor,
      history: [{ at: nowStr(), by: actor, action: `Ghi nhận phản hồi qua ${CHANNEL_LABEL[fbForm.channel || 'phone']}` }],
    };
    updateData(prev => ({ feedbacks: [...prev.feedbacks, fb] }));
    setFbOpen(false);
  };

  const studentName = (id: string) => data.students.find(s => s.id === id)?.name || '?';
  const newFb = allFb.filter(f => f.status === 'new').length;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={MessagesSquare}
        title="Liên lạc & Phản hồi"
        subtitle="Gửi nhận xét, lịch học, vắng mặt đến học viên hoặc người giám hộ phù hợp; theo dõi tiếp nhận và xử lý phản hồi."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Thông báo đã gửi" value={allMine.length} hint={`${readCount} đã xem`} />
        <StatCard label="Chưa xác nhận nhận" value={unconfirmed} tone={unconfirmed > 0 ? 'text-amber-600' : 'text-emerald-600'} />
        <StatCard label="Phản hồi mới / đang xử lý" value={`${newFb} / ${allFb.filter(f => f.status === 'received' || f.status === 'processing').length}`} tone={newFb > 0 ? 'text-red-500' : 'text-slate-800'} />
        <StatCard label="Thời gian xử lý TB" value={avgHours !== null ? `${avgHours} giờ` : '-'} hint={`${resolved.length} phản hồi đã xử lý`} />
      </div>

      <Tabs active={tab} onChange={id => setTab(id as typeof tab)} tabs={[
        { id: 'compose', label: <><Send className="w-4 h-4" /> Soạn thông báo</> },
        { id: 'sent', label: <><Inbox className="w-4 h-4" /> Đã gửi</>, count: unconfirmed },
        { id: 'feedback', label: <><MessagesSquare className="w-4 h-4" /> Phản hồi phụ huynh</>, count: newFb },
      ]} />

      {tab === 'compose' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-5">
          <Card>
            <CardHeader><CardTitle>Soạn thông báo</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(Object.keys(MESSAGE_TYPE_LABELS) as MessageType[]).map(t => (
                  <button key={t} onClick={() => applyType(t)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${type === t ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{MESSAGE_TYPE_LABELS[t]}</button>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Gửi cho">
                  <Select value={target} onChange={e => setTarget(e.target.value as typeof target)}>
                    <option value="student">Một học viên</option>
                    <option value="class">Cả lớp</option>
                    <option value="all">{isManager ? 'Tất cả học viên đang học' : 'Tất cả HV các lớp tôi dạy'}</option>
                  </Select>
                </Field>
                {target === 'student' && (
                  <Field label="Học viên">
                    <Select value={studentId} onChange={e => setStudentId(e.target.value)}>
                      <option value="">-- Chọn học viên --</option>
                      {myStudents.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select>
                  </Field>
                )}
                {(target === 'class' || target === 'student') && (
                  <Field label={target === 'class' ? 'Lớp' : 'Lớp liên quan'}>
                    <Select value={classId} onChange={e => setClassId(e.target.value)}>
                      <option value="">{target === 'class' ? '-- Chọn lớp --' : 'Lớp chính của HV'}</option>
                      {myClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  </Field>
                )}
                <Field label="Người nhận">
                  <Select value={recipientMode} onChange={e => setRecipientMode(e.target.value as typeof recipientMode)}>
                    <option value="auto">Phù hợp (theo cài đặt từng HV)</option>
                    <option value="guardian">Người giám hộ</option>
                    <option value="student">Học viên</option>
                    <option value="both">Cả học viên và người giám hộ</option>
                  </Select>
                </Field>
                <Field label="Kênh gửi">
                  <Select value={channel} onChange={e => setChannel(e.target.value as ParentMessage['channel'])}>
                    <option value="app">Cổng phụ huynh (trong ứng dụng)</option>
                    <option value="zalo">Zalo</option>
                    <option value="sms">SMS</option>
                    <option value="manual">Gọi điện / Trực tiếp</option>
                  </Select>
                </Field>
              </div>
              <Field label="Tiêu đề"><Input value={title} onChange={e => setTitle(e.target.value)} /></Field>
              <Field label="Nội dung">
                <Textarea className="min-h-[140px]" value={body} onChange={e => setBody(e.target.value)} />
              </Field>
              <p className="text-xs text-slate-500">Biến tự điền: {'{greeting}'} lời chào phù hợp người nhận, {'{who}'}, {'{studentName}'}, {'{parentName}'}, {'{className}'}, {'{date}'}, {'{center}'}</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={copyPreview} className="gap-1"><Copy className="w-4 h-4" /> Copy bản xem trước</Button>
                <Button onClick={send} className="gap-1"><Send className="w-4 h-4" /> Gửi {recipients.length > 0 ? `(${recipients.length})` : ''}</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Xem trước & người nhận ({recipients.length})</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {recipients[0] ? (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm whitespace-pre-wrap text-slate-700">
                  <div className="font-semibold text-blue-800 mb-1">{title}</div>
                  {render(recipients[0].s, recipients[0].classId)}
                </div>
              ) : <div className="text-sm text-slate-400 text-center py-6">Chọn người nhận để xem trước</div>}
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 text-sm">
                {recipients.map(({ s }) => {
                  const rcp = rcpFor(s);
                  return (
                    <div key={s.id} className="py-2 flex justify-between gap-2">
                      <span className="font-medium text-slate-700">{s.name}</span>
                      <span className="text-xs text-slate-500 text-right"><Badge tone={rcp === 'student' ? 'blue' : rcp === 'guardian' ? 'purple' : 'green'}>{RECIPIENT_LABELS[rcp]}</Badge><br />{recipientContact(s, rcp)}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'sent' && (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            <Select className="w-auto h-9" value={msgFilterType} onChange={e => setMsgFilterType(e.target.value)}>
              <option value="all">Tất cả loại</option>
              {(Object.keys(MESSAGE_TYPE_LABELS) as MessageType[]).map(t => <option key={t} value={t}>{MESSAGE_TYPE_LABELS[t]}</option>)}
            </Select>
            <Select className="w-auto h-9" value={msgFilterStatus} onChange={e => setMsgFilterStatus(e.target.value)}>
              <option value="all">Tất cả trạng thái</option>
              <option value="sent">Chưa xác nhận nhận</option>
              <option value="delivered">Đã nhận</option>
              <option value="read">Đã xem</option>
            </Select>
            {unconfirmed > 0 && <Button size="sm" variant="outline" className="gap-1" onClick={() => markDelivered(messages.filter(m => (m.status || 'sent') === 'sent').map(m => m.id))}><CheckCheck className="w-4 h-4" /> Xác nhận đã nhận ({messages.filter(m => (m.status || 'sent') === 'sent').length})</Button>}
          </div>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 border-b">
                  <tr><th className="px-4 py-3">Thời gian</th><th className="px-4 py-3">Học viên / Người nhận</th><th className="px-4 py-3">Loại</th><th className="px-4 py-3">Tiêu đề</th><th className="px-4 py-3">Kênh</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3 w-40"></th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {messages.map(m => {
                    const st = m.status || 'sent';
                    const replies = data.feedbacks.filter(f => f.messageId === m.id).length;
                    return (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dayjs(m.sentAt).format('DD/MM HH:mm')}</td>
                        <td className="px-4 py-3"><div className="font-medium text-slate-800">{studentName(m.studentId)}</div><div className="text-xs text-slate-400">{m.recipient ? RECIPIENT_LABELS[m.recipient] : 'Phụ huynh'}{m.sender ? ` • từ ${m.sender}` : ''}</div></td>
                        <td className="px-4 py-3 text-xs">{MESSAGE_TYPE_LABELS[m.type] || m.type}</td>
                        <td className="px-4 py-3 text-slate-700 max-w-[220px] truncate">{m.title || m.content.slice(0, 50)}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{CHANNEL_LABEL[m.channel] || m.channel}</td>
                        <td className="px-4 py-3">
                          <Badge tone={MSG_STATUS[st].tone}>{MSG_STATUS[st].label}</Badge>
                          {replies > 0 && <Badge tone="purple" className="ml-1">{replies} phản hồi</Badge>}
                          {m.readAt && <div className="text-[10px] text-slate-400 mt-0.5">xem {dayjs(m.readAt).format('DD/MM HH:mm')}</div>}
                        </td>
                        <td className="px-4 py-3 flex gap-1">
                          <Button size="sm" variant="ghost" className="px-2" onClick={() => setViewMsg(m)} title="Xem"><Eye className="w-4 h-4" /></Button>
                          {st === 'sent' && <Button size="sm" variant="ghost" className="px-2 text-blue-600" onClick={() => markDelivered([m.id])} title="Xác nhận đã nhận"><CheckCheck className="w-4 h-4" /></Button>}
                          <Button size="sm" variant="ghost" className="px-2 text-blue-500" onClick={() => setEditMsg({ ...m })} title="Sửa"><Edit2 className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" className="px-2 text-red-400" onClick={() => deleteMsg(m)} title="Xóa"><Trash2 className="w-4 h-4" /></Button>
                        </td>
                      </tr>
                    );
                  })}
                  {messages.length === 0 && <EmptyRow colSpan={7} text="Chưa có thông báo nào" />}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {tab === 'feedback' && (
        <>
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <Select className="w-auto h-9" value={fbFilter} onChange={e => setFbFilter(e.target.value as typeof fbFilter)}>
              <option value="open">Chưa xử lý xong</option>
              <option value="all">Tất cả</option>
              {Object.entries(FEEDBACK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
            <Button onClick={openNewFeedback} className="gap-1"><Plus className="w-4 h-4" /> Ghi nhận phản hồi (điện thoại, Zalo...)</Button>
          </div>
          <div className="space-y-3">
            {feedbacks.map(f => {
              const msg = f.messageId ? data.parentMessages.find(m => m.id === f.messageId) : null;
              return (
                <Card key={f.id} className="p-4">
                  <div className="flex flex-col md:flex-row md:items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge tone={FEEDBACK_STATUS[f.status].tone}>{FEEDBACK_STATUS[f.status].label}</Badge>
                        <Badge tone="purple">{FEEDBACK_CATEGORY[f.category]}</Badge>
                        <span className="text-sm font-medium text-slate-800">{f.fromName} ({f.fromRole === 'student' ? 'Học viên' : 'Người giám hộ'}) — HV {studentName(f.studentId)}</span>
                      </div>
                      <div className="text-xs text-slate-400 mb-2">{dayjs(f.createdAt).format('DD/MM/YYYY HH:mm')} • qua {CHANNEL_LABEL[f.channel]}{f.assignee ? ` • Phụ trách: ${f.assignee}` : ''}</div>
                      {msg && <div className="text-xs text-slate-500 border-l-2 border-slate-200 pl-2 mb-2">Trả lời thông báo: {msg.title || msg.content.slice(0, 60)}</div>}
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{f.content}</p>
                      {f.response && <div className="mt-2 p-2 bg-emerald-50 border border-emerald-100 rounded text-sm text-emerald-800 whitespace-pre-wrap"><b>Trung tâm:</b> {f.response}</div>}
                      {f.history?.length > 0 && (
                        <details className="mt-2 text-xs text-slate-500">
                          <summary className="cursor-pointer">Lịch sử xử lý ({f.history.length})</summary>
                          <ul className="mt-1 space-y-0.5">{f.history.map((h, i) => <li key={i}>{h.at} — {h.by}: {h.action}</li>)}</ul>
                        </details>
                      )}
                    </div>
                    <div className="flex md:flex-col gap-2 shrink-0">
                      {f.status === 'new' && <Button size="sm" onClick={() => receive(f)}>Tiếp nhận</Button>}
                      {f.status !== 'resolved' && <Button size="sm" variant="outline" onClick={() => openHandle(f)}>Xử lý / Trả lời</Button>}
                      {f.status === 'resolved' && <Button size="sm" variant="ghost" onClick={() => updateFb(f.id, { status: 'processing' }, 'Mở lại để xử lý tiếp')}>Mở lại</Button>}
                      <span className="flex gap-1 md:justify-end">
                        <Button size="sm" variant="ghost" className="px-2 text-blue-500" title="Sửa" onClick={() => openEditFeedback(f)}><Edit2 className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" className="px-2 text-red-400" title="Xóa" onClick={() => deleteFeedback(f)}><Trash2 className="w-4 h-4" /></Button>
                      </span>
                    </div>
                  </div>
                </Card>
              );
            })}
            {feedbacks.length === 0 && <Card><div className="p-10 text-center text-slate-400">Không có phản hồi nào</div></Card>}
          </div>
        </>
      )}

      <Modal open={!!viewMsg} title={viewMsg?.title || 'Thông báo'} onClose={() => setViewMsg(null)}>
        {viewMsg && (() => {
          const s = data.students.find(x => x.id === viewMsg.studentId);
          return (
            <div className="space-y-3 text-sm">
              <div className="text-slate-500">Gửi {dayjs(viewMsg.sentAt).format('DD/MM/YYYY HH:mm')} • {CHANNEL_LABEL[viewMsg.channel]} • {s && viewMsg.recipient ? recipientContact(s, viewMsg.recipient) : studentName(viewMsg.studentId)}</div>
              <div className="p-3 bg-slate-50 rounded-lg whitespace-pre-wrap text-slate-700">{viewMsg.content}</div>
              <div className="text-xs text-slate-500">
                Trạng thái: {MSG_STATUS[viewMsg.status || 'sent'].label}
                {viewMsg.deliveredAt && ` • nhận ${viewMsg.deliveredAt}`}{viewMsg.readAt && ` • xem ${viewMsg.readAt}`}
              </div>
              <div className="flex justify-end">
                <Button variant="outline" className="gap-1" onClick={() => { navigator.clipboard.writeText(viewMsg.content); Swal.fire({ title: 'Đã copy', icon: 'success', timer: 900, showConfirmButton: false }); }}><Copy className="w-4 h-4" /> Copy</Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal open={!!editMsg} title="Sửa thông báo" onClose={() => setEditMsg(null)}>
        {editMsg && (
          <div className="space-y-4">
            <div className="text-sm text-slate-500">Học viên: {studentName(editMsg.studentId)}</div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Loại">
                <Select value={editMsg.type} onChange={e => setEditMsg({ ...editMsg, type: e.target.value as MessageType })}>
                  {(Object.keys(MESSAGE_TYPE_LABELS) as MessageType[]).map(t => <option key={t} value={t}>{MESSAGE_TYPE_LABELS[t]}</option>)}
                </Select>
              </Field>
              <Field label="Kênh">
                <Select value={editMsg.channel} onChange={e => setEditMsg({ ...editMsg, channel: e.target.value as ParentMessage['channel'] })}>
                  <option value="app">Cổng phụ huynh</option><option value="zalo">Zalo</option><option value="sms">SMS</option><option value="manual">Gọi điện / Trực tiếp</option>
                </Select>
              </Field>
            </div>
            <Field label="Tiêu đề"><Input value={editMsg.title || ''} onChange={e => setEditMsg({ ...editMsg, title: e.target.value })} /></Field>
            <Field label="Nội dung"><Textarea className="min-h-[140px]" value={editMsg.content} onChange={e => setEditMsg({ ...editMsg, content: e.target.value })} /></Field>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditMsg(null)}>Hủy</Button><Button onClick={saveEditMsg}>Cập nhật</Button></div>
          </div>
        )}
      </Modal>

      <Modal open={!!handling} title="Xử lý phản hồi" onClose={() => setHandling(null)}>
        {handling && (
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-lg text-sm whitespace-pre-wrap text-slate-700"><b>{handling.fromName}:</b> {handling.content}</div>
            <Field label="Nội dung trả lời / kết quả xử lý">
              <Textarea className="min-h-[120px]" value={responseText} onChange={e => setResponseText(e.target.value)} placeholder="Trung tâm đã tiếp nhận và ..." />
            </Field>
            <p className="text-xs text-slate-500">Khi chọn "Đã xử lý", nội dung trả lời sẽ được gửi lại cho người phản hồi.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => saveHandling('processing')}>Lưu - Đang xử lý</Button>
              <Button onClick={() => saveHandling('resolved')}>Đã xử lý & gửi trả lời</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={fbOpen} title={editFbId ? 'Sửa phản hồi' : 'Ghi nhận phản hồi'} onClose={() => setFbOpen(false)}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Học viên" className="col-span-2">
            <Select value={fbForm.studentId} onChange={e => { const s = data.students.find(x => x.id === e.target.value); setFbForm({ ...fbForm, studentId: e.target.value, fromName: fbForm.fromRole === 'student' ? s?.name : s?.parentName }); }}>
              {myStudents.map(s => <option key={s.id} value={s.id}>{s.name} (PH: {s.parentName})</option>)}
            </Select>
          </Field>
          <Field label="Người phản hồi">
            <Select value={fbForm.fromRole} onChange={e => { const s = data.students.find(x => x.id === fbForm.studentId); const r = e.target.value as Feedback['fromRole']; setFbForm({ ...fbForm, fromRole: r, fromName: r === 'student' ? s?.name : s?.parentName }); }}>
              <option value="guardian">Người giám hộ</option>
              <option value="student">Học viên</option>
            </Select>
          </Field>
          <Field label="Tên"><Input value={fbForm.fromName || ''} onChange={e => setFbForm({ ...fbForm, fromName: e.target.value })} /></Field>
          <Field label="Loại">
            <Select value={fbForm.category} onChange={e => setFbForm({ ...fbForm, category: e.target.value as Feedback['category'] })}>
              {Object.entries(FEEDBACK_CATEGORY).filter(([k]) => k !== 'reply' || fbForm.category === 'reply').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Kênh">
            <Select value={fbForm.channel} onChange={e => setFbForm({ ...fbForm, channel: e.target.value as Feedback['channel'] })}>
              {editFbId && <option value="portal">Cổng PH</option>}
              <option value="phone">Điện thoại</option><option value="zalo">Zalo</option><option value="sms">SMS</option><option value="direct">Trực tiếp</option>
            </Select>
          </Field>
          <Field label="Nội dung" className="col-span-2"><Textarea value={fbForm.content || ''} onChange={e => setFbForm({ ...fbForm, content: e.target.value })} /></Field>
        </div>
        <div className="flex justify-end gap-3 mt-4"><Button variant="outline" onClick={() => setFbOpen(false)}>Hủy</Button><Button onClick={saveFeedback}>Lưu</Button></div>
      </Modal>
    </div>
  );
};

export default Communication;
