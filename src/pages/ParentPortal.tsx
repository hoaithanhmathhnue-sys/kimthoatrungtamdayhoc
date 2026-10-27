import React, { useState } from 'react';
import { useAppContext } from '../store/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select, Field, Badge, StatCard, Tabs, Textarea } from '../components/ui/Misc';
import { Feedback, ParentMessage } from '../types';
import { UserCircle, Reply, Send, CalendarDays } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import Swal from 'sweetalert2';
import { formatCurrency } from '../lib/utils';
import { parseRole, getStudentClassIds, computeProgress, nowStr, MESSAGE_TYPE_LABELS, WEEKDAY_LABELS, toVnWeekday, formatShortDate, CENTER_NAME } from '../lib/academic';
import { FEEDBACK_STATUS, FEEDBACK_CATEGORY } from './Communication';

const ParentPortal: React.FC = () => {
  const { data, updateData } = useAppContext();
  const role = parseRole(data.settings.activeRole);
  const me = data.students.find(s => s.id === role.id);
  // Anh chị em cùng số điện thoại người giám hộ
  const children = me ? data.students.filter(s => s.id === me.id || (me.parentPhone && s.parentPhone === me.parentPhone)) : [];
  const [childId, setChildId] = useState(me?.id || '');
  const [tab, setTab] = useState<'overview' | 'messages' | 'feedback' | 'fees'>('overview');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [fb, setFb] = useState<{ category: Feedback['category']; content: string; fromRole: Feedback['fromRole'] }>({ category: 'suggestion', content: '', fromRole: 'guardian' });

  const child = data.students.find(s => s.id === childId) || me;
  if (!me || !child) {
    return <Card><div className="p-10 text-center text-slate-500">Không tìm thấy hồ sơ học viên. Vui lòng chọn lại vai trò ở góc trên.</div></Card>;
  }

  const today = dayjs().format('YYYY-MM-DD');
  const classIds = getStudentClassIds(data, child.id);
  const classes = data.classes.filter(c => classIds.includes(c.id));
  const progress = classes.map(c => ({ cls: c, p: computeProgress(data, child.id, c.id) }));
  const myMakeupLessonIds = new Set(data.makeups.filter(m => m.studentId === child.id && m.status === 'scheduled').map(m => m.makeupLessonId));
  const upcoming = data.lessons
    .filter(l => ((classIds.includes(l.classId) && !l.makeupOnly) || myMakeupLessonIds.has(l.id)) && l.date >= today && l.date <= dayjs().add(14, 'day').format('YYYY-MM-DD'))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const messages = data.parentMessages.filter(m => m.studentId === child.id).slice().sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const unread = messages.filter(m => m.status !== 'read').length;
  const myFeedback = data.feedbacks.filter(f => f.studentId === child.id).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const payments = data.transactions.filter(t => t.type === 'income' && t.relatedStudentId === child.id).sort((a, b) => b.date.localeCompare(a.date));
  const makeups = data.makeups.filter(m => m.studentId === child.id && m.status !== 'cancelled');
  const reservations = data.reservations.filter(r => r.studentId === child.id);

  const markRead = (m: ParentMessage) => {
    if (m.status === 'read') return;
    updateData(prev => ({ parentMessages: prev.parentMessages.map(x => x.id === m.id ? { ...x, status: 'read', readAt: nowStr(), deliveredAt: x.deliveredAt || nowStr() } : x) }));
  };

  const fromName = (r: Feedback['fromRole']) => (r === 'student' ? child.name : child.parentName || 'Phụ huynh');

  const sendReply = (m: ParentMessage) => {
    if (!replyText.trim()) return;
    const f: Feedback = {
      id: uuidv4(), studentId: child.id, messageId: m.id, fromName: fromName('guardian'), fromRole: 'guardian', category: 'reply',
      content: replyText, channel: 'portal', createdAt: nowStr(), status: 'new', history: [{ at: nowStr(), by: fromName('guardian'), action: 'Gửi phản hồi qua Cổng PH' }],
    };
    updateData(prev => ({
      feedbacks: [...prev.feedbacks, f],
      parentMessages: prev.parentMessages.map(x => x.id === m.id ? { ...x, status: 'read', readAt: x.readAt || nowStr() } : x),
    }));
    setReplyTo(null); setReplyText('');
    Swal.fire({ title: 'Đã gửi phản hồi', text: 'Trung tâm sẽ tiếp nhận và trả lời sớm.', icon: 'success', timer: 1500, showConfirmButton: false });
  };

  const sendFeedback = () => {
    if (!fb.content.trim()) return Swal.fire('Vui lòng nhập nội dung', '', 'warning');
    const f: Feedback = {
      id: uuidv4(), studentId: child.id, fromName: fromName(fb.fromRole), fromRole: fb.fromRole, category: fb.category,
      content: fb.content, channel: 'portal', createdAt: nowStr(), status: 'new', history: [{ at: nowStr(), by: fromName(fb.fromRole), action: 'Gửi góp ý qua Cổng PH' }],
    };
    updateData(prev => ({ feedbacks: [...prev.feedbacks, f] }));
    setFb({ ...fb, content: '' });
    Swal.fire({ title: 'Cảm ơn bạn đã góp ý!', text: 'Bạn có thể theo dõi tình trạng xử lý ngay bên dưới.', icon: 'success', timer: 1800, showConfirmButton: false });
  };

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <UserCircle className="w-12 h-12 opacity-90" />
          <div>
            <div className="text-xs uppercase tracking-wider opacity-80">{CENTER_NAME}</div>
            <div className="text-xl font-bold">Xin chào {child.guardianRelation ? `${child.guardianRelation} ` : ''}{child.parentName || child.name}</div>
            <div className="text-sm opacity-90">Cổng thông tin học tập của học viên {child.name}</div>
          </div>
        </div>
        {children.length > 1 && (
          <Select className="w-auto bg-white text-slate-800" value={child.id} onChange={e => setChildId(e.target.value)}>
            {children.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        )}
      </div>

      <Tabs active={tab} onChange={id => setTab(id as typeof tab)} tabs={[
        { id: 'overview', label: '📈 Tiến độ & lịch học' },
        { id: 'messages', label: '🔔 Thông báo', count: unread },
        { id: 'feedback', label: '💬 Góp ý & phản hồi' },
        { id: 'fees', label: '💳 Học phí' },
      ]} />

      {tab === 'overview' && (
        <>
          {progress.map(({ cls, p }) => (
            <Card key={cls.id}>
              <CardHeader><CardTitle>{cls.name} <span className="text-sm font-normal text-slate-500">• GV {data.teachers.find(t => t.id === cls.teacherId)?.name || '-'}</span></CardTitle>{p.reserved && <Badge tone="purple">Đang bảo lưu</Badge>}</CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Buổi còn lại" value={p.remaining} tone={p.remaining <= 0 ? 'text-red-500' : p.remaining <= data.settings.policies.lowSessionWarning ? 'text-amber-600' : 'text-emerald-600'} hint={`Đã học ${p.used}/${p.purchased} buổi đã đóng`} />
                <StatCard label="Chuyên cần" value={p.present + p.absent + p.excused > 0 ? `${p.attendanceRate}%` : '-'} hint={`${p.absent + p.excused} buổi vắng${p.makeupPending ? ` • ${p.makeupPending} chờ học bù` : ''}`} />
                <StatCard label="Bài tập đã nộp" value={p.assignmentsTotal ? `${p.assignmentsDone}/${p.assignmentsTotal}` : '-'} />
                <StatCard label="Điểm TB" value={p.avgScore ?? '-'} tone="text-blue-600" hint={`Tiến độ lớp: ${p.doneLessons}/${p.totalLessons || '-'} buổi`} />
              </CardContent>
            </Card>
          ))}
          {progress.length === 0 && <Card><div className="p-8 text-center text-slate-400">Học viên chưa được xếp lớp.</div></Card>}

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="w-4 h-4" /> Lịch học 2 tuần tới</CardTitle></CardHeader>
            <CardContent>
              <div className="divide-y divide-slate-100 text-sm">
                {upcoming.map(l => (
                  <div key={l.id} className={`py-2 flex justify-between gap-2 ${l.status === 'cancelled' ? 'text-slate-400 line-through' : ''}`}>
                    <span>{WEEKDAY_LABELS[toVnWeekday(l.date)]}, {dayjs(l.date).format('DD/MM')} • {l.startTime}–{l.endTime}</span>
                    <span className="text-right">{data.classes.find(c => c.id === l.classId)?.name}{l.topic ? ` • ${l.topic}` : ''} {l.status === 'cancelled' && <Badge tone="red">Nghỉ</Badge>}</span>
                  </div>
                ))}
                {upcoming.length === 0 && <div className="py-4 text-center text-slate-400">Chưa có lịch học</div>}
              </div>
            </CardContent>
          </Card>

          {makeups.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Học bù</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                {makeups.map(m => (
                  <div key={m.id} className="flex justify-between"><span>Vắng ngày {formatShortDate(m.absentDate)} ({data.classes.find(c => c.id === m.classId)?.name})</span>
                    <Badge tone={m.status === 'done' ? 'green' : m.status === 'scheduled' ? 'blue' : 'amber'}>{m.status === 'done' ? 'Đã học bù' : m.status === 'scheduled' ? `Học bù ${formatShortDate(m.makeupDate)}` : 'Đang xếp lịch'}</Badge></div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {tab === 'messages' && (
        <div className="space-y-3">
          {messages.map(m => {
            const replies = data.feedbacks.filter(f => f.messageId === m.id);
            return (
              <Card key={m.id} className={`p-4 ${m.status !== 'read' ? 'border-l-4 border-l-blue-500' : ''}`} onClick={() => markRead(m)}>
                <div className="flex justify-between gap-2 mb-1">
                  <div className="font-semibold text-slate-800 flex items-center gap-2">{m.status !== 'read' && <span className="w-2 h-2 rounded-full bg-blue-500" />}{m.title || MESSAGE_TYPE_LABELS[m.type]}</div>
                  <span className="text-xs text-slate-400 whitespace-nowrap">{dayjs(m.sentAt).format('DD/MM/YYYY HH:mm')}</span>
                </div>
                <div className="text-xs text-slate-400 mb-2">{MESSAGE_TYPE_LABELS[m.type]}{m.sender ? ` • ${m.sender}` : ''}</div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{m.content}</p>
                {replies.map(r => (
                  <div key={r.id} className="mt-2 ml-4 p-2 bg-slate-50 rounded text-sm">
                    <div className="text-xs text-slate-400">Bạn đã phản hồi • <Badge tone={FEEDBACK_STATUS[r.status].tone}>{FEEDBACK_STATUS[r.status].label}</Badge></div>
                    <div className="text-slate-700">{r.content}</div>
                    {r.response && <div className="mt-1 text-emerald-700"><b>Trung tâm:</b> {r.response}</div>}
                  </div>
                ))}
                {replyTo === m.id ? (
                  <div className="mt-3 space-y-2" onClick={e => e.stopPropagation()}>
                    <Textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Nhập phản hồi gửi trung tâm..." className="min-h-[70px]" />
                    <div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setReplyTo(null)}>Hủy</Button><Button size="sm" onClick={() => sendReply(m)} className="gap-1"><Send className="w-3.5 h-3.5" /> Gửi</Button></div>
                  </div>
                ) : (
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" variant="ghost" className="gap-1 text-blue-600" onClick={e => { e.stopPropagation(); markRead(m); setReplyTo(m.id); setReplyText(''); }}><Reply className="w-4 h-4" /> Phản hồi</Button>
                  </div>
                )}
              </Card>
            );
          })}
          {messages.length === 0 && <Card><div className="p-10 text-center text-slate-400">Chưa có thông báo nào</div></Card>}
        </div>
      )}

      {tab === 'feedback' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-5">
          <Card>
            <CardHeader><CardTitle>Gửi góp ý cho trung tâm</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Người gửi">
                  <Select value={fb.fromRole} onChange={e => setFb({ ...fb, fromRole: e.target.value as Feedback['fromRole'] })}>
                    <option value="guardian">Phụ huynh</option>
                    <option value="student">Học viên</option>
                  </Select>
                </Field>
                <Field label="Loại">
                  <Select value={fb.category} onChange={e => setFb({ ...fb, category: e.target.value as Feedback['category'] })}>
                    <option value="suggestion">Góp ý</option>
                    <option value="feedback">Phản hồi</option>
                    <option value="question">Hỏi đáp</option>
                    <option value="complaint">Khiếu nại</option>
                  </Select>
                </Field>
              </div>
              <Field label="Nội dung"><Textarea className="min-h-[120px]" value={fb.content} onChange={e => setFb({ ...fb, content: e.target.value })} placeholder="Ý kiến về chương trình học, giáo viên, lịch học, cơ sở vật chất..." /></Field>
              <div className="flex justify-end"><Button onClick={sendFeedback} className="gap-1"><Send className="w-4 h-4" /> Gửi góp ý</Button></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Theo dõi xử lý ({myFeedback.length})</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {myFeedback.map(f => (
                <div key={f.id} className="p-3 border border-slate-100 rounded-lg text-sm">
                  <div className="flex justify-between gap-2 mb-1">
                    <span className="flex gap-1"><Badge tone="purple">{FEEDBACK_CATEGORY[f.category]}</Badge><Badge tone={FEEDBACK_STATUS[f.status].tone}>{FEEDBACK_STATUS[f.status].label}</Badge></span>
                    <span className="text-xs text-slate-400">{dayjs(f.createdAt).format('DD/MM/YYYY HH:mm')}</span>
                  </div>
                  <p className="text-slate-700 whitespace-pre-wrap">{f.content}</p>
                  {f.response && <div className="mt-2 p-2 bg-emerald-50 rounded text-emerald-800 whitespace-pre-wrap"><b>Trung tâm trả lời:</b> {f.response}</div>}
                  {f.receivedAt && !f.response && <div className="mt-1 text-xs text-blue-600">Trung tâm đã tiếp nhận lúc {f.receivedAt}{f.assignee ? ` • phụ trách: ${f.assignee}` : ''}</div>}
                </div>
              ))}
              {myFeedback.length === 0 && <div className="text-center text-slate-400 py-6">Chưa có góp ý nào</div>}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'fees' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {progress.map(({ cls, p }) => (
              <Card key={cls.id} className="p-4">
                <div className="font-semibold text-slate-800 mb-2">{cls.name}</div>
                <div className="text-sm space-y-1 text-slate-600">
                  <div className="flex justify-between"><span>Đã đóng</span><span className="font-medium">{formatCurrency(p.paidAmount)} ({p.purchased} buổi)</span></div>
                  <div className="flex justify-between"><span>Đã học (đã trừ)</span><span className="font-medium">{p.used} buổi</span></div>
                  <div className="flex justify-between"><span>Còn lại</span><span className={`font-bold ${p.remaining <= 0 ? 'text-red-500' : 'text-emerald-600'}`}>{p.remaining} buổi</span></div>
                  {p.debtAmount > 0 && <div className="flex justify-between text-red-500"><span>Cần đóng thêm</span><span className="font-bold">{formatCurrency(p.debtAmount)}</span></div>}
                </div>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle>Lịch sử đóng học phí</CardTitle></CardHeader>
            <CardContent>
              <div className="divide-y divide-slate-100 text-sm">
                {payments.map(t => (
                  <div key={t.id} className="py-2 flex justify-between gap-2">
                    <span>{formatShortDate(t.date)} • {data.classes.find(c => c.id === t.relatedClassId)?.name || t.description}{t.sessionCount ? ` • ${t.sessionCount} buổi` : ''}</span>
                    <span className="font-medium text-emerald-600">{formatCurrency(t.amount)}</span>
                  </div>
                ))}
                {payments.length === 0 && <div className="py-4 text-center text-slate-400">Chưa có giao dịch</div>}
              </div>
            </CardContent>
          </Card>
          {reservations.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Bảo lưu</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                {reservations.map(r => <div key={r.id} className="flex justify-between"><span>{data.classes.find(c => c.id === r.classId)?.name}: {formatShortDate(r.startDate)} → {formatShortDate(r.endDate)} ({r.sessionsReserved} buổi)</span><Badge tone={r.status === 'active' ? 'purple' : 'slate'}>{r.status === 'active' ? 'Đang bảo lưu' : r.status === 'resumed' ? 'Đã học lại' : 'Đã hủy'}</Badge></div>)}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default ParentPortal;
