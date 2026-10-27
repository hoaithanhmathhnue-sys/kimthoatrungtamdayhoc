import React, { useState, useMemo, useRef } from 'react';
import { useAppContext } from '../store/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Plus, Trash2, Filter, Edit2, BookOpen, Upload, Download, CheckSquare, Square, ClipboardList, Users } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import { Student, Attendance, ClassSession, Enrollment } from '../types';
import { readExcelFile, sheetToRawRows, excelDateToString, isExcelSerialDate, fuzzyMatchByName } from '../services/excelUtils';
import { findOrCreateClass, findOrCreateStudent, ensureEnrollment } from '../services/smartImport';

const emptyForm: Partial<Student> = {
  name: '', phone: '', dob: '', parentName: '', parentPhone: '', joinDate: dayjs().format('YYYY-MM-DD'), classId: '', applicationStatus: 'active'
};

const Students: React.FC = () => {
  const { data, updateData, logActivity } = useAppContext();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterClass, setFilterClass] = useState<string>('all');
  const [formData, setFormData] = useState<Partial<Student>>(emptyForm);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'attendance'>('list');

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // File refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attendanceFileRef = useRef<HTMLInputElement>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const openAdd = () => { setEditingId(null); setFormData({ ...emptyForm, joinDate: dayjs().format('YYYY-MM-DD') }); setSelectedClassIds([]); setIsAdding(true); };
  const openEdit = (student: Student) => {
    setEditingId(student.id); setFormData({ ...student });
    const ids = data.enrollments.filter(e => e.studentId === student.id).map(e => e.classId);
    if (student.classId && !ids.includes(student.classId)) ids.push(student.classId);
    setSelectedClassIds(ids); setIsAdding(true);
  };
  const handleCancel = () => { setIsAdding(false); setEditingId(null); setFormData(emptyForm); setSelectedClassIds([]); };
  const toggleClassEnroll = (classId: string) => { setSelectedClassIds(prev => prev.includes(classId) ? prev.filter(id => id !== classId) : [...prev, classId]); };

  const handleSave = () => {
    if (!formData.name) return Swal.fire('Lỗi', 'Vui lòng nhập tên', 'error');
    const studentId = editingId || uuidv4();
    const primaryClassId = selectedClassIds[0] || '';
    if (editingId) {
      updateData(prev => {
        const others = prev.enrollments.filter(e => e.studentId !== editingId);
        const newEnrollments = selectedClassIds.map(cId => ({ id: uuidv4(), studentId: editingId, classId: cId, enrolledAt: dayjs().format('YYYY-MM-DD') }));
        return { students: prev.students.map(s => s.id === editingId ? { ...s, ...formData, classId: primaryClassId } as Student : s), enrollments: [...others, ...newEnrollments] };
      });
      Swal.fire('Thành công', 'Đã cập nhật', 'success');
    } else {
      updateData(prev => {
        const newEnrollments = selectedClassIds.map(cId => ({ id: uuidv4(), studentId, classId: cId, enrolledAt: dayjs().format('YYYY-MM-DD') }));
        return { students: [...prev.students, { ...formData, id: studentId, classId: primaryClassId } as Student], enrollments: [...prev.enrollments, ...newEnrollments] };
      });
      Swal.fire('Thành công', 'Đã thêm học sinh', 'success');
      logActivity('add', 'student', formData.name || '', '');
    }
    handleCancel();
  };

  const handleDelete = (id: string) => {
    Swal.fire({ title: 'Xóa học sinh?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy' }).then(result => {
      if (result.isConfirmed) {
        updateData(prev => ({ students: prev.students.filter(s => s.id !== id), enrollments: prev.enrollments.filter(e => e.studentId !== id) }));
        Swal.fire('Đã xóa', '', 'success');
      }
    });
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    Swal.fire({ title: `Xóa ${selectedIds.size} học sinh?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy' }).then(result => {
      if (result.isConfirmed) {
        updateData(prev => ({ students: prev.students.filter(s => !selectedIds.has(s.id)), enrollments: prev.enrollments.filter(e => !selectedIds.has(e.studentId)) }));
        setSelectedIds(new Set());
        Swal.fire('Đã xóa', '', 'success');
      }
    });
  };

  // ===== IMPORT DS học sinh — SMART: tạo HS, Lớp, ghi danh =====
  const handleImportStudents = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const wb = await readExcelFile(file);
      const newStudents: Student[] = [];
      const newClasses: ClassSession[] = [];
      const newEnrollments: Enrollment[] = [];

      wb.SheetNames.forEach(sheetName => {
        const rows = sheetToRawRows(wb.Sheets[sheetName]);
        let headerIdx = -1;
        for (let ri = 0; ri < Math.min(rows.length, 10); ri++) {
          const rowStr = (rows[ri] || []).map((c: any) => String(c || '').toLowerCase()).join('|');
          if (rowStr.includes('họ và tên') || rowStr.includes('ho va ten') || rowStr.includes('học sinh')) { headerIdx = ri; break; }
        }
        if (headerIdx < 0) return;

        for (let ri = headerIdx + 1; ri < rows.length; ri++) {
          const row = rows[ri];
          if (!row) continue;
          const name = row[1]?.toString()?.trim();
          if (!name) continue;

          const subject = row[2]?.toString()?.trim() || '';
          const className = row[3]?.toString()?.trim() || sheetName;
          const school = row[4]?.toString()?.trim() || '';
          const phone = row[5]?.toString() || '';

          // Smart import: tạo HS, Lớp, ghi danh
          const { studentId } = findOrCreateStudent(name, {
            phone, enrolledSubjects: subject ? [subject] : []
          }, data.students, newStudents);

          if (className || subject) {
            const classId = findOrCreateClass(className, subject, data.classes, newClasses);
            if (studentId && classId) {
              ensureEnrollment(studentId, classId, data.enrollments, newEnrollments);
              const s = [...data.students, ...newStudents].find(x => x.id === studentId);
              if (s && !s.classId) s.classId = classId;
            }
          }
        }
      });

      if (newStudents.length === 0 && newClasses.length === 0 && newEnrollments.length === 0) {
        Swal.fire('Thông báo', 'Không tìm thấy dữ liệu mới hoặc đã tồn tại', 'info');
        return;
      }

      updateData(prev => ({
        students: [...prev.students, ...newStudents],
        classes: [...prev.classes, ...newClasses],
        enrollments: [...prev.enrollments, ...newEnrollments]
      }));

      const summary = [];
      if (newStudents.length > 0) summary.push(`👤 ${newStudents.length} HS mới`);
      if (newClasses.length > 0) summary.push(`📚 ${newClasses.length} lớp mới`);
      if (newEnrollments.length > 0) summary.push(`📝 ${newEnrollments.length} ghi danh`);
      logActivity('import', 'student', 'DS HS', summary.join(', '));
      Swal.fire('Import thành công!', summary.join('\n'), 'success');
    } catch {
      Swal.fire('Lỗi', 'Không thể đọc file Excel', 'error');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ===== IMPORT kiểm diện — SMART: tạo HS, Lớp, ghi danh + điểm danh =====
  const handleImportAttendance = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const wb = await readExcelFile(file);
      const newStudents: Student[] = [];
      const newClasses: ClassSession[] = [];
      const newEnrollments: Enrollment[] = [];
      const newAttendances: Attendance[] = [];
      let importCount = 0;

      wb.SheetNames.forEach(sheetName => {
        const rows = sheetToRawRows(wb.Sheets[sheetName]);
        if (rows.length < 4) return;

        // Find date header row
        let headerRowIdx = -1;
        let dateStartCol = -1;
        for (let ri = 0; ri < Math.min(rows.length, 10); ri++) {
          const row = rows[ri];
          if (!row) continue;
          for (let ci = 3; ci < row.length; ci++) {
            if (isExcelSerialDate(row[ci])) { headerRowIdx = ri; dateStartCol = ci; break; }
          }
          if (headerRowIdx >= 0) break;
        }
        if (headerRowIdx < 0) return;

        const headerRow = rows[headerRowIdx];
        const dates: string[] = [];
        for (let ci = dateStartCol; ci < headerRow.length; ci++) {
          if (isExcelSerialDate(headerRow[ci])) dates.push(excelDateToString(headerRow[ci]));
          else if (typeof headerRow[ci] === 'string' && headerRow[ci].toLowerCase().includes('tổng')) break;
        }

        for (let ri = headerRowIdx + 1; ri < rows.length; ri++) {
          const row = rows[ri];
          if (!row) continue;
          const name = row[1]?.toString()?.trim();
          if (!name) continue;

          let subject = row[2]?.toString()?.trim() || '';
          if (!subject) { const parts = sheetName.split('.'); subject = parts[0]?.trim() || ''; }
          const className = row[3]?.toString()?.trim() || sheetName.split('.')[1]?.trim() || sheetName;

          // Smart import: tạo HS + Lớp + ghi danh
          const { studentId } = findOrCreateStudent(name, {
            enrolledSubjects: subject ? [subject] : []
          }, data.students, newStudents);

          const classId = findOrCreateClass(className, subject, data.classes, newClasses);
          if (studentId && classId) {
            ensureEnrollment(studentId, classId, data.enrollments, newEnrollments);
            const s = [...data.students, ...newStudents].find(x => x.id === studentId);
            if (s && !s.classId) s.classId = classId;
          }

          // Parse attendance data
          for (let di = 0; di < dates.length; di++) {
            const val = row[dateStartCol + di];
            if (val === 1 || val === 0) {
              newAttendances.push({ id: uuidv4(), classId: classId || '', studentId, date: dates[di], status: val === 1 ? 'present' : 'absent' });
            }
          }
          importCount++;
        }
      });

      if (importCount === 0) { Swal.fire('Thông báo', 'Không tìm thấy dữ liệu kiểm diện hợp lệ', 'info'); return; }

      updateData(prev => ({
        students: [...prev.students, ...newStudents],
        classes: [...prev.classes, ...newClasses],
        enrollments: [...prev.enrollments, ...newEnrollments],
        attendances: [...prev.attendances, ...newAttendances]
      }));

      const summary = [`✅ ${newAttendances.length} bản ghi điểm danh`];
      if (newStudents.length > 0) summary.push(`👤 ${newStudents.length} HS mới`);
      if (newClasses.length > 0) summary.push(`📚 ${newClasses.length} lớp mới`);
      if (newEnrollments.length > 0) summary.push(`📝 ${newEnrollments.length} ghi danh`);
      logActivity('import', 'attendance', 'Kiểm diện', summary.join(', '));
      Swal.fire('Thành công', `Import ${newAttendances.length} bản ghi điểm danh.\nTạo mới ${newStudents.length} học sinh.`, 'success');
    } catch {
      Swal.fire('Lỗi', 'Không thể đọc file', 'error');
    }
    if (attendanceFileRef.current) attendanceFileRef.current.value = '';
  };

  // ===== EXPORT kiểm diện — đúng format ảnh mẫu =====
  const exportAttendance = () => {
    const wb = XLSX.utils.book_new();
    const allDates = Array.from(new Set<string>(data.attendances.map(a => a.date))).sort();
    if (allDates.length === 0 && data.students.length === 0) { Swal.fire('Thông báo', 'Chưa có dữ liệu', 'info'); return; }

    const wsData: any[][] = [];
    wsData.push(['DANH SÁCH KIỂM DIỆN HỌC SINH']);
    wsData.push([]);
    const header = ['Stt', 'Họ và tên học sinh', 'Môn', 'Lớp', 'Trường', ...allDates.map(d => dayjs(d).format('D.M')), 'Tổng'];
    wsData.push(header);

    const studentsToExport = filterClass !== 'all' ? filteredStudents : data.students;
    studentsToExport.forEach((s, idx) => {
      const enrolledClasses = data.classes.filter(c => {
        const enrolledIds = data.enrollments.filter(e => e.studentId === s.id).map(e => e.classId);
        if (s.classId && !enrolledIds.includes(s.classId)) enrolledIds.push(s.classId);
        return enrolledIds.includes(c.id);
      });
      const subject = enrolledClasses.map(c => c.subject).filter(Boolean).join(', ');
      const className = enrolledClasses.map(c => c.name).join(', ');

      const row: any[] = [idx + 1, s.name, subject, className, ''];
      let total = 0;
      allDates.forEach(date => {
        const att = data.attendances.find(a => a.studentId === s.id && a.date === date);
        if (att) { const val = att.status === 'present' ? 1 : 0; row.push(val); total += val; }
        else row.push('');
      });
      row.push(total);
      wsData.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const cols = [{ wch: 4 }, { wch: 22 }, { wch: 8 }, { wch: 6 }, { wch: 18 }];
    allDates.forEach(() => cols.push({ wch: 5 })); cols.push({ wch: 5 });
    ws['!cols'] = cols;
    XLSX.utils.book_append_sheet(wb, ws, 'Kiểm diện');
    XLSX.writeFile(wb, `Kiem_Dien_HS_${dayjs().format('YYYYMMDD')}.xlsx`);
    Swal.fire('Thành công', 'Đã xuất file', 'success');
  };

  const filteredStudents = useMemo(() => {
    let result = data.students;
    if (filterClass !== 'all') {
      const ids = data.enrollments.filter(e => e.classId === filterClass).map(e => e.studentId);
      result = result.filter(s => s.classId === filterClass || ids.includes(s.id));
    }
    return result;
  }, [data.students, data.enrollments, filterClass]);

  // Attendance dates for the attendance view
  const attendanceDates = useMemo(() => {
    return Array.from(new Set<string>(data.attendances.map(a => a.date))).sort();
  }, [data.attendances]);

  const allSelected = filteredStudents.length > 0 && filteredStudents.every(s => selectedIds.has(s.id));
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredStudents.map(s => s.id)));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-2xl font-bold text-slate-800">Quản lý Học sinh ({filteredStudents.length})</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-slate-500" />
            <select value={filterClass} onChange={e => setFilterClass(e.target.value)} className="h-8 px-2 border border-slate-300 rounded-lg text-xs bg-slate-50">
              <option value="all">Tất cả lớp</option>
              {data.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* View mode toggle */}
          <div className="flex border border-slate-200 rounded-lg overflow-hidden">
            <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1 ${viewMode === 'list' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'}`}>
              <Users className="w-3.5 h-3.5" /> DS HS
            </button>
            <button onClick={() => setViewMode('attendance')} className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1 ${viewMode === 'attendance' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'}`}>
              <ClipboardList className="w-3.5 h-3.5" /> Kiểm diện
            </button>
          </div>

          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportStudents} />
          <input ref={attendanceFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportAttendance} />

          <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-1 text-xs h-8"><Upload className="w-3.5 h-3.5" /> Nhập DS HS</Button>
          <Button variant="outline" onClick={() => attendanceFileRef.current?.click()} className="gap-1 text-xs h-8"><Upload className="w-3.5 h-3.5" /> Nhập Kiểm diện</Button>
          <Button variant="outline" onClick={exportAttendance} className="gap-1 text-xs h-8"><Download className="w-3.5 h-3.5" /> Xuất Kiểm diện</Button>

          {selectedIds.size > 0 && (
            <Button variant="outline" onClick={handleDeleteSelected} className="gap-1 text-xs h-8 text-red-600 border-red-300 hover:bg-red-50">
              <Trash2 className="w-3.5 h-3.5" /> Xóa {selectedIds.size}
            </Button>
          )}
          <Button onClick={() => isAdding ? handleCancel() : openAdd()} className="gap-1 text-xs h-8">
            {isAdding ? '✕ Hủy' : <><Plus className="w-3.5 h-3.5" /> Thêm HS</>}
          </Button>
        </div>
      </div>

      {/* Form thêm/sửa */}
      {isAdding && (
        <Card className="border-blue-200 shadow-blue-100">
          <CardHeader><CardTitle className="text-sm">{editingId ? 'Chỉnh sửa Học viên' : 'Thêm Học viên Mới'}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><label className="text-xs font-medium text-slate-700">Họ tên *</label><Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} /></div>
              <div><label className="text-xs font-medium text-slate-700">Ngày sinh</label><Input type="date" value={formData.dob} onChange={e => setFormData({ ...formData, dob: e.target.value })} /></div>
              <div><label className="text-xs font-medium text-slate-700">SĐT HS</label><Input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} /></div>
              <div><label className="text-xs font-medium text-slate-700">Tên Phụ huynh</label><Input value={formData.parentName} onChange={e => setFormData({ ...formData, parentName: e.target.value })} /></div>
              <div><label className="text-xs font-medium text-slate-700">SĐT PH</label><Input value={formData.parentPhone} onChange={e => setFormData({ ...formData, parentPhone: e.target.value })} /></div>
              <div>
                <label className="text-xs font-medium text-slate-700">Quan hệ người giám hộ</label>
                <select className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm" value={formData.guardianRelation || ''} onChange={e => setFormData({ ...formData, guardianRelation: e.target.value })}>
                  <option value="">-- Chọn --</option>
                  {['Bố', 'Mẹ', 'Ông', 'Bà', 'Anh/Chị', 'Người giám hộ'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">Người nhận thông báo</label>
                <select className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm" value={formData.preferredContact || 'auto'} onChange={e => setFormData({ ...formData, preferredContact: e.target.value as any })}>
                  <option value="auto">Tự động (dưới 18 tuổi → người giám hộ)</option>
                  <option value="guardian">Người giám hộ</option>
                  <option value="student">Học viên</option>
                  <option value="both">Cả hai</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">Tình trạng</label>
                <select className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm" value={formData.applicationStatus || 'active'} onChange={e => setFormData({ ...formData, applicationStatus: e.target.value as any })}>
                  <option value="active">Đang học</option><option value="inactive">Đã nghỉ</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700 flex items-center gap-1 mb-2"><BookOpen className="w-3.5 h-3.5" /> Ghi danh lớp</label>
              <div className="flex flex-wrap gap-2">
                {data.classes.map(c => (
                  <button key={c.id} type="button" onClick={() => toggleClassEnroll(c.id)} className={`px-3 py-1 rounded-lg text-xs font-medium border ${selectedClassIds.includes(c.id) ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                    {c.name} ({c.subject})
                  </button>
                ))}
                {data.classes.length === 0 && <span className="text-xs text-slate-400 italic">Chưa có lớp</span>}
              </div>
            </div>
            <div className="flex justify-end pt-3 border-t gap-2">
              <Button variant="outline" onClick={handleCancel} className="text-xs h-8">Hủy</Button>
              <Button onClick={handleSave} className="text-xs h-8">{editingId ? 'Cập nhật' : 'Lưu'}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== VIEW: DANH SÁCH HS ===== */}
      {viewMode === 'list' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left whitespace-nowrap">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b-2 border-slate-300">
                <tr>
                  <th className="px-2 py-3 text-center w-8">
                    <button onClick={toggleSelectAll}>{allSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-slate-400" />}</button>
                  </th>
                  <th className="px-2 py-3">Stt</th>
                  <th className="px-3 py-3">Họ và tên</th>
                  <th className="px-2 py-3">Ngày sinh</th>
                  <th className="px-2 py-3">SĐT</th>
                  <th className="px-3 py-3">Phụ huynh</th>
                  <th className="px-2 py-3">Lớp</th>
                  <th className="px-2 py-3">Môn</th>
                  <th className="px-2 py-3 text-center">Trạng thái</th>
                  <th className="px-2 py-3 text-center w-20">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((student, idx) => {
                  const enrolledClassIds = data.enrollments.filter(e => e.studentId === student.id).map(e => e.classId);
                  if (student.classId && !enrolledClassIds.includes(student.classId)) enrolledClassIds.push(student.classId);
                  const enrolledClasses = data.classes.filter(c => enrolledClassIds.includes(c.id));
                  const enrolledSubjects = [...new Set(enrolledClasses.map(c => c.subject).filter(Boolean))];

                  return (
                    <tr key={student.id} className={`hover:bg-blue-50/50 ${selectedIds.has(student.id) ? 'bg-blue-50' : ''}`}>
                      <td className="px-2 py-2 text-center">
                        <button onClick={() => toggleSelect(student.id)}>{selectedIds.has(student.id) ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-slate-300" />}</button>
                      </td>
                      <td className="px-2 py-2 text-slate-400">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{student.name}</td>
                      <td className="px-2 py-2">{student.dob ? dayjs(student.dob).format('DD/MM/YYYY') : '-'}</td>
                      <td className="px-2 py-2">{student.phone || '-'}</td>
                      <td className="px-3 py-2">{student.parentName || '-'}<br /><span className="text-[10px] text-slate-400">{student.parentPhone}</span></td>
                      <td className="px-2 py-2">
                        <div className="flex flex-col gap-0.5">{enrolledClasses.map(c => <span key={c.id} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] w-fit">{c.name}</span>)}{enrolledClasses.length === 0 && <span className="text-slate-400 italic">-</span>}</div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-0.5">{enrolledSubjects.map(s => <span key={s} className="px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded text-[10px]">{s}</span>)}{enrolledSubjects.length === 0 && '-'}</div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        {student.applicationStatus === 'inactive'
                          ? <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px]">Nghỉ</span>
                          : <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px]">Đang học</span>}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <div className="flex gap-0.5 justify-center">
                          <button onClick={() => openEdit(student)} className="text-blue-500 hover:text-blue-700 p-1"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDelete(student.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredStudents.length === 0 && <tr><td colSpan={10} className="px-6 py-8 text-center text-slate-400">Chưa có dữ liệu</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ===== VIEW: KIỂM DIỆN HS — FORMAT NHƯ ẢNH MẪU ===== */}
      {viewMode === 'attendance' && (
        <Card>
          <CardHeader className="py-3 border-b">
            <CardTitle className="text-sm flex items-center gap-2">
              <ClipboardList className="w-4 h-4" /> DANH SÁCH KIỂM DIỆN HỌC SINH — Ngày học
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left whitespace-nowrap">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b-2 border-slate-300">
                <tr>
                  <th className="px-2 py-2.5 sticky left-0 bg-slate-100 z-10 w-8">Stt</th>
                  <th className="px-3 py-2.5 sticky left-8 bg-slate-100 z-10 min-w-[150px]">Họ và tên học sinh</th>
                  <th className="px-2 py-2.5">Môn</th>
                  <th className="px-2 py-2.5">Lớp</th>
                  <th className="px-2 py-2.5">Trường</th>
                  {attendanceDates.map(d => (
                    <th key={d} className="px-1 py-2.5 text-center min-w-[28px]" title={dayjs(d).format('DD/MM/YYYY')}>
                      {dayjs(d).format('D.M')}
                    </th>
                  ))}
                  <th className="px-2 py-2.5 text-center font-bold">Tổng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((student, idx) => {
                  const enrolledClassIds = data.enrollments.filter(e => e.studentId === student.id).map(e => e.classId);
                  if (student.classId && !enrolledClassIds.includes(student.classId)) enrolledClassIds.push(student.classId);
                  const enrolledClasses = data.classes.filter(c => enrolledClassIds.includes(c.id));
                  const subjects = enrolledClasses.map(c => c.subject).filter(Boolean).join(', ');
                  const classNames = enrolledClasses.map(c => c.name).join(', ');

                  let total = 0;
                  return (
                    <tr key={student.id} className="hover:bg-blue-50/30">
                      <td className="px-2 py-1.5 sticky left-0 bg-white text-slate-400">{idx + 1}</td>
                      <td className="px-3 py-1.5 sticky left-8 bg-white font-medium text-slate-800">{student.name}</td>
                      <td className="px-2 py-1.5">{subjects || '-'}</td>
                      <td className="px-2 py-1.5">{classNames || '-'}</td>
                      <td className="px-2 py-1.5">-</td>
                      {attendanceDates.map(d => {
                        const att = data.attendances.find(a => a.studentId === student.id && a.date === d);
                        const val = att ? (att.status === 'present' ? 1 : 0) : '';
                        if (val === 1) total++;
                        return (
                          <td key={d} className={`px-1 py-1.5 text-center font-medium ${val === 1 ? 'text-emerald-600' : val === 0 ? 'text-red-400' : ''}`}>
                            {val !== '' ? val : ''}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-center font-bold text-blue-600">{total}</td>
                    </tr>
                  );
                })}
                {filteredStudents.length === 0 && <tr><td colSpan={5 + attendanceDates.length + 1} className="px-6 py-8 text-center text-slate-400">Chưa có dữ liệu</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default Students;
