import React, { useState, useMemo } from 'react';
import { useAppContext } from '../store/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { ClassSession, Attendance } from '../types';
import { Plus, Users, ArrowLeft, CheckCircle2, XCircle, Trash2, Edit2, BarChart3, BookOpen } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import Swal from 'sweetalert2';
import { computeProgress, getSessionFee, getActiveReservation, TUITION_MODE_LABELS } from '../lib/academic';
import { Badge } from '../components/ui/Misc';

// Danh sách môn học mặc định
const DEFAULT_SUBJECTS = ['Toán', 'Lý', 'Hóa', 'Sinh', 'Anh', 'Văn', 'Sử', 'Địa', 'GDCD', 'Tin học'];

const Classes: React.FC = () => {
  const { data, updateData } = useAppContext();
  const [selectedClass, setSelectedClass] = useState<ClassSession | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<ClassSession>>({
    name: '', code: '', teacherId: '', subject: '', schedule: '', feePerSession: 0, status: 'active'
  });

  const [attendanceDate, setAttendanceDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [showStats, setShowStats] = useState(false);

  // Danh sách môn học: kết hợp default + các môn đã dùng trong classes
  const allSubjects = useMemo(() => {
    const used = data.classes.map(c => c.subject).filter(Boolean);
    return [...new Set([...DEFAULT_SUBJECTS, ...used])].sort();
  }, [data.classes]);

  const emptyForm = (): Partial<ClassSession> => ({
    name: '', code: '', teacherId: '', subject: '', schedule: '', feePerSession: 0, courseId: '', roomId: '',
    startDate: dayjs().format('YYYY-MM-DD'), totalSessions: 0, maxStudents: 0, status: 'active'
  });

  // Chọn khóa học → tự điền môn, số buổi, học phí/buổi quy đổi
  const handleCourseSelect = (courseId: string) => {
    const course = data.courses.find(c => c.id === courseId);
    if (!course) return setFormData({ ...formData, courseId: '' });
    let fee = course.fee;
    if (course.tuitionMode === 'per_course' && course.totalSessions > 0) fee = Math.round(course.fee / course.totalSessions);
    if (course.tuitionMode === 'per_month' && (course.sessionsPerMonth || 0) > 0) fee = Math.round(course.fee / (course.sessionsPerMonth || 1));
    setFormData({ ...formData, courseId, subject: course.subject, totalSessions: course.totalSessions, feePerSession: fee, name: formData.name || course.name });
  };

  const openAdd = () => {
    setEditingId(null);
    setFormData(emptyForm());
    setIsAdding(true);
  };

  const openEdit = (cls: ClassSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(cls.id);
    setFormData({ ...cls });
    setIsAdding(true);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData(emptyForm());
  };

  const handleSave = () => {
    if (!formData.name || !formData.teacherId) return Swal.fire('Lỗi', 'Vui lòng nhập Tên lớp và phân công Giáo viên', 'error');

    if (editingId) {
      updateData(prev => ({
        classes: prev.classes.map(c => c.id === editingId ? { ...c, ...formData } as ClassSession : c)
      }));
      Swal.fire('Thành công', 'Đã cập nhật lớp học', 'success');
    } else {
      updateData(prev => ({
        classes: [...prev.classes, { ...formData, id: uuidv4() } as ClassSession]
      }));
      Swal.fire('Thành công', 'Đã thêm lớp học', 'success');
    }
    handleCancel();
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    Swal.fire({ title: 'Xóa lớp học?', text: 'Thao tác này cũng ảnh hưởng đến enrollment và điểm danh.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy' }).then(result => {
      if (result.isConfirmed) {
        updateData(prev => ({
          classes: prev.classes.filter(c => c.id !== id),
          enrollments: prev.enrollments.filter(e => e.classId !== id),
          attendances: prev.attendances.filter(a => a.classId !== id),
          lessons: prev.lessons.filter(l => l.classId !== id),
          timetableSlots: prev.timetableSlots.filter(t => t.classId !== id),
        }));
        Swal.fire('Đã xóa', '', 'success');
      }
    });
  };

  const markAttendance = (studentId: string, status: 'present' | 'absent' | 'excused') => {
    if (!selectedClass) return;

    updateData(prev => {
      const existingIdx = prev.attendances.findIndex(a => a.classId === selectedClass.id && a.studentId === studentId && a.date === attendanceDate);
      const newAttendances = [...prev.attendances];
      if (existingIdx > -1) {
        newAttendances[existingIdx] = { ...newAttendances[existingIdx], status };
      } else {
        newAttendances.push({ id: uuidv4(), classId: selectedClass.id, studentId, date: attendanceDate, status });
      }
      return { attendances: newAttendances };
    });
  };

  // Attendance detail view
  if (selectedClass) {
    // Get students enrolled in this class via enrollments + classId
    const enrolledStudentIds = data.enrollments.filter(e => e.classId === selectedClass.id).map(e => e.studentId);
    const classStudents = data.students.filter(s =>
      s.classId === selectedClass.id || enrolledStudentIds.includes(s.id)
    );

    // Stats for current class
    const classAttendances = data.attendances.filter(a => a.classId === selectedClass.id);
    const totalPresent = classAttendances.filter(a => a.status === 'present').length;
    const totalAbsent = classAttendances.filter(a => a.status === 'absent').length;
    const totalExcused = classAttendances.filter(a => a.status === 'excused').length;
    const totalRecords = classAttendances.length;
    const presentRate = totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 100) : 0;

    // Today's attendance
    const todayRecords = classAttendances.filter(a => a.date === attendanceDate);
    const unmarkedCount = classStudents.length - todayRecords.length;

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => { setSelectedClass(null); setShowStats(false); }} className="h-10 w-10 p-0 rounded-full bg-slate-100 hover:bg-slate-200">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Điểm danh: {selectedClass.name}</h2>
              <p className="text-sm text-slate-500">Giáo viên: {data.teachers.find(t => t.id === selectedClass.teacherId)?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => setShowStats(!showStats)} className="gap-1">
              <BarChart3 className="w-4 h-4" /> {showStats ? 'Ẩn thống kê' : 'Thống kê'}
            </Button>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700">Ngày:</label>
              <Input type="date" value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)} className="w-[150px]" />
            </div>
          </div>
        </div>

        {/* Stats panel */}
        {showStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 text-center">
              <div className="text-2xl font-bold text-emerald-600">{presentRate}%</div>
              <div className="text-xs text-slate-500 mt-1">Tỷ lệ có mặt</div>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-2xl font-bold text-emerald-600">{totalPresent}</div>
              <div className="text-xs text-slate-500 mt-1">Tổng có mặt</div>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-2xl font-bold text-red-500">{totalAbsent}</div>
              <div className="text-xs text-slate-500 mt-1">Tổng vắng</div>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-2xl font-bold text-amber-500">{totalExcused}</div>
              <div className="text-xs text-slate-500 mt-1">Tổng có phép</div>
            </Card>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-100 text-blue-800 px-4 py-3 rounded-lg text-sm">
          💡 Đây là điểm danh nhanh theo ngày. Để điểm danh theo từng buổi (chốt/duyệt, tự báo vắng cho phụ huynh, tạo học bù) hãy dùng mục <b>Lịch học & Điểm danh</b>.
        </div>

        {/* Unmarked warning */}
        {unmarkedCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm font-medium">
            ⚠ Còn {unmarkedCount}/{classStudents.length} học sinh chưa được điểm danh ngày {dayjs(attendanceDate).format('DD/MM')}
          </div>
        )}

        <Card>
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b">
              <tr>
                <th className="px-6 py-4 w-12">#</th>
                <th className="px-6 py-4">Tên học sinh</th>
                <th className="px-6 py-4">Số điện thoại</th>
                <th className="px-6 py-4 text-center">Buổi còn lại</th>
                <th className="px-6 py-4 text-center">Trạng thái ({dayjs(attendanceDate).format('DD/MM')})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {classStudents.map((student, idx) => {
                const record = data.attendances.find(a => a.classId === selectedClass.id && a.studentId === student.id && a.date === attendanceDate);
                const status = record?.status;
                const prog = computeProgress(data, student.id, selectedClass.id);
                const reserved = !!getActiveReservation(data, student.id, selectedClass.id);

                return (
                  <tr key={student.id} className={`hover:bg-slate-50 ${!status ? 'bg-amber-50/30' : ''}`}>
                    <td className="px-6 py-4 text-slate-400 font-medium">{idx + 1}</td>
                    <td className="px-6 py-4 font-medium text-slate-800">{student.name} {reserved && <Badge tone="purple">Bảo lưu</Badge>}</td>
                    <td className="px-6 py-4 text-slate-600">{student.phone}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`font-bold ${prog.remaining <= 0 ? 'text-red-500' : prog.remaining <= data.settings.policies.lowSessionWarning ? 'text-amber-600' : 'text-emerald-600'}`}>{prog.remaining}</span>
                      <span className="text-xs text-slate-400"> / {prog.purchased}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2 justify-center">
                        <Button
                          size="sm"
                          className={`gap-1 ${status === 'present' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                          onClick={() => markAttendance(student.id, 'present')}>
                          <CheckCircle2 className="w-4 h-4" /> Có mặt
                        </Button>
                        <Button
                          size="sm"
                          className={`gap-1 ${status === 'absent' ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                          onClick={() => markAttendance(student.id, 'absent')}>
                          <XCircle className="w-4 h-4" /> Vắng
                        </Button>
                        <Button
                          size="sm"
                          className={`gap-1 ${status === 'excused' ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                          onClick={() => markAttendance(student.id, 'excused')}>
                          Có phép
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {classStudents.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">Chưa có học viên nào trong lớp này. Hãy ghi danh tại trang Học viên.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Quản lý Lớp học ({data.classes.length})</h2>
        <Button onClick={() => isAdding ? handleCancel() : openAdd()} className="gap-2">
          {isAdding ? '✕ Hủy' : <><Plus className="w-4 h-4" /> Thêm Lớp</>}
        </Button>
      </div>

      {isAdding && (
        <Card className="border-blue-200">
          <CardHeader><CardTitle>{editingId ? 'Chỉnh sửa Lớp' : 'Thêm Lớp Mới'}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700">Thuộc khóa học</label>
                <select className="w-full h-10 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" value={formData.courseId || ''} onChange={e => handleCourseSelect(e.target.value)}>
                  <option value="">-- Không thuộc khóa --</option>
                  {data.courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label className="text-sm font-medium text-slate-700">Mã lớp</label><Input value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} placeholder="VD: T9A" /></div>
              <div><label className="text-sm font-medium text-slate-700">Tên lớp *</label><Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Toán 9 Cơ bản" /></div>
              <div>
                <label className="text-sm font-medium text-slate-700">Giáo viên phụ trách *</label>
                <select className="w-full h-10 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" value={formData.teacherId} onChange={e => setFormData({ ...formData, teacherId: e.target.value })}>
                  <option value="">-- Chọn Giáo viên --</option>
                  {data.teachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.subjects.join(', ')})</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" /> Môn học</label>
                <select className="w-full h-10 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" value={formData.subject} onChange={e => setFormData({ ...formData, subject: e.target.value })}>
                  <option value="">-- Chọn Môn học --</option>
                  {allSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div><label className="text-sm font-medium text-slate-700">Lịch học</label><Input value={formData.schedule} onChange={e => setFormData({ ...formData, schedule: e.target.value })} placeholder="T2, T4 - 18h" /></div>
              <div><label className="text-sm font-medium text-slate-700">Học phí / Buổi</label><Input type="number" value={formData.feePerSession} onChange={e => setFormData({ ...formData, feePerSession: Number(e.target.value) })} /></div>
              <div>
                <label className="text-sm font-medium text-slate-700">Phòng học</label>
                <select className="w-full h-10 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" value={formData.roomId || ''} onChange={e => setFormData({ ...formData, roomId: e.target.value })}>
                  <option value="">-- Chọn phòng --</option>
                  {data.rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div><label className="text-sm font-medium text-slate-700">Ngày khai giảng</label><Input type="date" value={formData.startDate || ''} onChange={e => setFormData({ ...formData, startDate: e.target.value })} /></div>
              <div><label className="text-sm font-medium text-slate-700">Tổng số buổi</label><Input type="number" min={0} value={formData.totalSessions || 0} onChange={e => setFormData({ ...formData, totalSessions: Number(e.target.value) })} /></div>
              <div><label className="text-sm font-medium text-slate-700">Sĩ số tối đa</label><Input type="number" min={0} value={formData.maxStudents || 0} onChange={e => setFormData({ ...formData, maxStudents: Number(e.target.value) })} /></div>
              <div>
                <label className="text-sm font-medium text-slate-700">Trạng thái</label>
                <select className="w-full h-10 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" value={formData.status || 'active'} onChange={e => setFormData({ ...formData, status: e.target.value as ClassSession['status'] })}>
                  <option value="upcoming">Sắp khai giảng</option>
                  <option value="active">Đang học</option>
                  <option value="finished">Đã kết thúc</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end pt-4 gap-3">
              <Button variant="outline" onClick={handleCancel}>Hủy bỏ</Button>
              <Button onClick={handleSave}>{editingId ? 'Cập nhật' : 'Lưu thông tin'}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data.classes.map((c: ClassSession) => {
          const teacher = data.teachers.find(t => t.id === c.teacherId);
          const course = data.courses.find(co => co.id === c.courseId);
          const classLessons = data.lessons.filter(l => l.classId === c.id && l.status !== 'cancelled' && !l.makeupOnly);
          const doneLessons = classLessons.filter(l => l.status === 'done').length;
          const totalLessons = c.totalSessions || classLessons.length;
          const enrolledStudentIds = data.enrollments.filter(e => e.classId === c.id).map(e => e.studentId);
          const studentCount = data.students.filter(s => s.classId === c.id || enrolledStudentIds.includes(s.id)).length;

          return (
            <Card key={c.id} className="hover:shadow-md transition-shadow relative overflow-hidden group cursor-pointer" onClick={() => setSelectedClass(c)}>
              <div className="absolute top-3 right-3 flex gap-1 z-10">
                <Button variant="ghost" className="h-8 w-8 p-0 text-blue-500 bg-white/80 hover:bg-blue-50 backdrop-blur" onClick={(e) => openEdit(c, e)}>
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" className="h-8 w-8 p-0 text-red-500 bg-white/80 hover:bg-red-50 backdrop-blur" onClick={(e) => handleDelete(c.id, e)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <CardHeader className="bg-gradient-to-br from-blue-50 to-white pb-4 border-b border-blue-100/50">
                <div className="flex justify-between items-start pr-16">
                  <div>
                    <h3 className="text-lg font-bold text-blue-900 group-hover:text-blue-700 transition-colors">{c.code ? `[${c.code}] ` : ''}{c.name}</h3>
                    <p className="text-sm text-slate-500 font-medium mt-0.5">{c.subject}</p>
                  </div>
                  <div className="px-3 py-1 bg-white border border-blue-100 rounded-full text-xs font-semibold text-blue-700 shadow-sm flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> {studentCount}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-5">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Giáo viên:</span>
                  <span className="font-medium text-slate-800">{teacher?.name || 'Chưa phân công'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Lịch học:</span>
                  <span className="font-medium text-slate-800 whitespace-pre-wrap text-right">{c.schedule || '-'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Học phí/Buổi:</span>
                  <span className="font-bold text-blue-600">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(getSessionFee(data, c.id))}</span>
                </div>
                {course && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Khóa học:</span>
                    <span className="font-medium text-indigo-700 text-right">{course.name} <span className="text-xs text-slate-400">({TUITION_MODE_LABELS[course.tuitionMode]})</span></span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Phòng / Sĩ số:</span>
                  <span className="font-medium text-slate-800">{data.rooms.find(r => r.id === c.roomId)?.name || '-'} • {studentCount}{c.maxStudents ? `/${c.maxStudents}` : ''} HV</span>
                </div>
                {totalLessons > 0 && (
                  <div>
                    <div className="flex justify-between text-xs text-slate-500 mb-1"><span>Tiến độ lớp</span><span>{doneLessons}/{totalLessons} buổi</span></div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, Math.round(doneLessons / totalLessons * 100))}%` }} /></div>
                  </div>
                )}
                {c.status && c.status !== 'active' && <Badge tone={c.status === 'upcoming' ? 'amber' : 'slate'}>{c.status === 'upcoming' ? 'Sắp khai giảng' : 'Đã kết thúc'}</Badge>}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {data.classes.length === 0 && !isAdding && (
        <Card>
          <div className="p-12 text-center text-slate-500">Chưa có lớp học nào</div>
        </Card>
      )}
    </div>
  );
};

export default Classes;
