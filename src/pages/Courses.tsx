import React, { useState } from 'react';
import { useAppContext } from '../store/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select, Field, Badge, Textarea, PageHeader } from '../components/ui/Misc';
import { Course, TuitionMode } from '../types';
import { Library, Plus, Edit2, Trash2, Users, BookOpen } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import Swal from 'sweetalert2';
import { formatCurrency } from '../lib/utils';
import { TUITION_MODE_LABELS, getClassStudents } from '../lib/academic';

const DEFAULT_SUBJECTS = ['Toán', 'Lý', 'Hóa', 'Sinh', 'Anh', 'Văn', 'Sử', 'Địa', 'GDCD', 'Tin học'];

const Courses: React.FC = () => {
  const { data, updateData, logActivity } = useAppContext();
  const emptyForm = (): Partial<Course> => ({
    code: '', name: '', subject: '', level: '', totalSessions: 24,
    tuitionMode: data.settings.policies.tuitionMode, fee: 0, sessionsPerMonth: 8, description: '', status: 'active'
  });
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Course>>(emptyForm);

  const subjects = [...new Set([...DEFAULT_SUBJECTS, ...data.classes.map(c => c.subject), ...data.courses.map(c => c.subject)].filter(Boolean))].sort();

  const openAdd = () => { setEditingId(null); setForm(emptyForm()); setIsAdding(true); };
  const openEdit = (c: Course) => { setEditingId(c.id); setForm({ ...c }); setIsAdding(true); };
  const cancel = () => { setIsAdding(false); setEditingId(null); };

  const save = () => {
    if (!form.name || !form.subject) return Swal.fire('Lỗi', 'Vui lòng nhập tên khóa học và môn học', 'error');
    if (editingId) {
      updateData(prev => ({ courses: prev.courses.map(c => c.id === editingId ? { ...c, ...form } as Course : c) }));
      logActivity('edit', 'course', form.name);
    } else {
      updateData(prev => ({ courses: [...prev.courses, { ...form, id: uuidv4() } as Course] }));
      logActivity('add', 'course', form.name);
    }
    Swal.fire({ title: 'Đã lưu khóa học', icon: 'success', timer: 1200, showConfirmButton: false });
    cancel();
  };

  const remove = (c: Course) => {
    const classCount = data.classes.filter(cl => cl.courseId === c.id).length;
    Swal.fire({
      title: `Xóa khóa học "${c.name}"?`,
      text: classCount > 0 ? `${classCount} lớp đang thuộc khóa này sẽ được gỡ liên kết (lớp vẫn giữ nguyên).` : '',
      icon: 'warning', showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy'
    }).then(r => {
      if (!r.isConfirmed) return;
      updateData(prev => ({
        courses: prev.courses.filter(x => x.id !== c.id),
        classes: prev.classes.map(cl => cl.courseId === c.id ? { ...cl, courseId: undefined } : cl),
      }));
      logActivity('delete', 'course', c.name);
    });
  };

  const feeLabel = (c: Partial<Course>) => {
    if (c.tuitionMode === 'per_course') return 'Học phí trọn khóa';
    if (c.tuitionMode === 'per_month') return 'Học phí / tháng';
    return 'Học phí / buổi';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Library}
        title={`Khóa học (${data.courses.length})`}
        subtitle="Mỗi khóa học có chương trình, số buổi và cách tính học phí riêng; các lớp mở theo khóa."
        actions={<Button onClick={() => isAdding ? cancel() : openAdd()} className="gap-2">{isAdding ? '✕ Hủy' : <><Plus className="w-4 h-4" /> Thêm khóa học</>}</Button>}
      />

      {isAdding && (
        <Card className="border-blue-200">
          <CardHeader><CardTitle>{editingId ? 'Chỉnh sửa khóa học' : 'Thêm khóa học mới'}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label="Mã khóa"><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="VD: TOAN9" /></Field>
              <Field label="Tên khóa học *" className="lg:col-span-2"><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Toán 9 - Ôn thi vào 10" /></Field>
              <Field label="Môn học *">
                <Select value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}>
                  <option value="">-- Chọn môn --</option>
                  {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label="Trình độ / Khối"><Input value={form.level} onChange={e => setForm({ ...form, level: e.target.value })} placeholder="Lớp 9, IELTS 5.0..." /></Field>
              <Field label="Tổng số buổi"><Input type="number" min={1} value={form.totalSessions} onChange={e => setForm({ ...form, totalSessions: Number(e.target.value) })} /></Field>
              <Field label="Cách thu học phí">
                <Select value={form.tuitionMode} onChange={e => setForm({ ...form, tuitionMode: e.target.value as TuitionMode })}>
                  {Object.entries(TUITION_MODE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label={feeLabel(form)}><Input type="number" min={0} value={form.fee} onChange={e => setForm({ ...form, fee: Number(e.target.value) })} /></Field>
              {form.tuitionMode === 'per_month' && (
                <Field label="Số buổi / tháng"><Input type="number" min={1} value={form.sessionsPerMonth} onChange={e => setForm({ ...form, sessionsPerMonth: Number(e.target.value) })} /></Field>
              )}
              <Field label="Trạng thái">
                <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Course['status'] })}>
                  <option value="active">Đang tuyển sinh / giảng dạy</option>
                  <option value="inactive">Tạm dừng</option>
                </Select>
              </Field>
              <Field label="Mô tả / Mục tiêu" className="md:col-span-2 lg:col-span-4">
                <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="min-h-[60px]" />
              </Field>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={cancel}>Hủy bỏ</Button>
              <Button onClick={save}>{editingId ? 'Cập nhật' : 'Lưu khóa học'}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {data.courses.map(c => {
          const classes = data.classes.filter(cl => cl.courseId === c.id);
          const studentIds = new Set(classes.flatMap(cl => getClassStudents(data, cl.id).map(s => s.id)));
          return (
            <Card key={c.id} className="group relative">
              <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" className="h-8 w-8 p-0 text-blue-500 bg-white/80" onClick={() => openEdit(c)}><Edit2 className="w-4 h-4" /></Button>
                <Button variant="ghost" className="h-8 w-8 p-0 text-red-500 bg-white/80" onClick={() => remove(c)}><Trash2 className="w-4 h-4" /></Button>
              </div>
              <CardHeader className="bg-gradient-to-br from-indigo-50 to-white border-b border-indigo-100/60 items-start">
                <div className="pr-16">
                  <div className="flex items-center gap-2 mb-1">
                    {c.code && <Badge tone="purple">{c.code}</Badge>}
                    <Badge tone={c.status === 'active' ? 'green' : 'slate'}>{c.status === 'active' ? 'Đang mở' : 'Tạm dừng'}</Badge>
                  </div>
                  <h3 className="text-lg font-bold text-indigo-900">{c.name}</h3>
                  <p className="text-sm text-slate-500">{c.subject}{c.level ? ` • ${c.level}` : ''}</p>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Số buổi:</span><span className="font-medium">{c.totalSessions} buổi</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Học phí ({TUITION_MODE_LABELS[c.tuitionMode]}):</span><span className="font-bold text-blue-600">{formatCurrency(c.fee)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" /> Lớp:</span><span className="font-medium text-right">{classes.length > 0 ? classes.map(cl => cl.name).join(', ') : 'Chưa mở lớp'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Học viên:</span><span className="font-medium">{studentIds.size}</span></div>
                {c.description && <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">{c.description}</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {data.courses.length === 0 && !isAdding && (
        <Card><div className="p-12 text-center text-slate-500">Chưa có khóa học nào. Nhấn "Thêm khóa học" để bắt đầu.</div></Card>
      )}
    </div>
  );
};

export default Courses;
