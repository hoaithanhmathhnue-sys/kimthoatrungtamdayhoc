import React, { useState, useRef } from 'react';
import { useAppContext } from '../store/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Plus, Edit2, Trash2, Download, Upload, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import { Teacher } from '../types';

const emptyForm: Partial<Teacher> = {
  name: '', degree: '', phone: '', email: '', idCard: '', address: '', taxId: '', bankAccount: '', bankName: '', subjects: [], salaryRate: 60, joinDate: dayjs().format('YYYY-MM-DD')
};

const Teachers: React.FC = () => {
  const { data, updateData, logActivity } = useAppContext();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Teacher>>(emptyForm);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openAdd = () => {
    setEditingId(null);
    setFormData({ ...emptyForm, joinDate: dayjs().format('YYYY-MM-DD') });
    setIsAdding(true);
  };

  const openEdit = (teacher: Teacher) => {
    setEditingId(teacher.id);
    setFormData({ ...teacher });
    setIsAdding(true);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData(emptyForm);
  };

  const handleSave = () => {
    if (!formData.name || !formData.phone) return Swal.fire('Lỗi', 'Vui lòng nhập tên và số điện thoại', 'error');

    if (editingId) {
      // Update existing
      updateData((prev) => ({
        teachers: prev.teachers.map(t => t.id === editingId ? { ...t, ...formData } as Teacher : t)
      }));
      Swal.fire('Thành công', 'Đã cập nhật giáo viên', 'success');
      logActivity('edit', 'teacher', formData.name || '', 'Cập nhật thông tin GV');
    } else {
      // Add new
      updateData((prev) => ({
        teachers: [...prev.teachers, { ...formData, id: uuidv4() } as Teacher]
      }));
      Swal.fire('Thành công', 'Đã thêm giáo viên', 'success');
      logActivity('add', 'teacher', formData.name || '', `Môn: ${formData.subjects?.join(', ')}`);
    }
    handleCancel();
  };

  const handleDelete = (id: string) => {
    Swal.fire({ title: 'Xóa giáo viên?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy' }).then(result => {
      if (result.isConfirmed) {
        const teacher = data.teachers.find(t => t.id === id);
        updateData(prev => ({ teachers: prev.teachers.filter(t => t.id !== id) }));
        logActivity('delete', 'teacher', teacher?.name || '', '');
        Swal.fire('Đã xóa', '', 'success');
      }
    });
  };

  const exportExcel = () => {
    const wsData = data.teachers.map(t => ({
      'Họ và tên': t.name,
      'Trình độ': t.degree || '',
      'Số điện thoại': t.phone,
      'Email': t.email || '',
      'Số CCCD': t.idCard || '',
      'Địa chỉ': t.address || '',
      'Mã số thuế': t.taxId || '',
      'Số TK': t.bankAccount || '',
      'Ngân hàng': t.bankName || '',
      'Môn đào tạo': t.subjects.join(', '),
      'Tỷ lệ lương (%)': t.salaryRate,
      'Ngày tham gia': dayjs(t.joinDate).format('DD/MM/YYYY')
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Giao_Vien");
    XLSX.writeFile(wb, `DanhSachGiaoVien_${dayjs().format('YYYYMMDD')}.xlsx`);
  };

  const importExcel = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataStr = e.target?.result;
      const workbook = XLSX.read(dataStr, { type: 'binary' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const items = XLSX.utils.sheet_to_json(worksheet) as any[];

      const newTeachers = items.map(item => ({
        id: uuidv4(),
        name: item['Họ và tên'] || '',
        degree: item['Trình độ'] || '',
        phone: item['Số điện thoại'] || '',
        email: item['Email'] || '',
        idCard: item['Số CCCD'] || '',
        address: item['Địa chỉ'] || '',
        taxId: item['Mã số thuế'] || '',
        bankAccount: item['Số TK'] || '',
        bankName: item['Ngân hàng'] || '',
        subjects: item['Môn đào tạo'] ? item['Môn đào tạo'].split(',').map((s: string) => s.trim()) : [],
        salaryRate: item['Tỷ lệ lương (%)'] || 60,
        joinDate: dayjs().format('YYYY-MM-DD')
      }));

      const validTeachers = newTeachers.filter(t => t.name && t.phone);

      if (validTeachers.length > 0) {
        updateData(prev => ({
          teachers: [...prev.teachers, ...validTeachers as Teacher[]]
        }));
        Swal.fire('Thành công', `Đã nhập ${validTeachers.length} giáo viên hợp lệ`, 'success');
      } else {
        Swal.fire('Lỗi', 'Không tìm thấy dữ liệu hợp lệ trong file', 'error');
      }

      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Quản lý Giáo viên ({data.teachers.length})</h2>
        <div className="flex gap-2">
          <input type="file" accept=".xlsx, .xls" ref={fileInputRef} className="hidden" onChange={importExcel} />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2 hidden md:flex">
            <Upload className="w-4 h-4" /> Import Excel
          </Button>
          <Button variant="outline" onClick={exportExcel} className="gap-2 hidden md:flex">
            <Download className="w-4 h-4" /> Export Excel
          </Button>
          <Button onClick={() => isAdding ? handleCancel() : openAdd()} className="gap-2">
            {isAdding ? '✕ Hủy' : <><Plus className="w-4 h-4" /> Thêm giáo viên</>}
          </Button>
        </div>
      </div>

      {isAdding && (
        <Card className="border-blue-200">
          <CardHeader><CardTitle>{editingId ? 'Chỉnh sửa Giáo viên' : 'Thêm Giáo viên Mới'}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><label className="text-sm font-medium text-slate-700">Họ tên *</label><Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Nguyễn Văn A" /></div>
              <div><label className="text-sm font-medium text-slate-700">Trình độ</label><Input value={formData.degree} onChange={e => setFormData({ ...formData, degree: e.target.value })} placeholder="Thạc sĩ, Cử nhân..." /></div>
              <div><label className="text-sm font-medium text-slate-700">Số điện thoại *</label><Input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="09..." /></div>
              <div><label className="text-sm font-medium text-slate-700">Email</label><Input value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="email@gmail.com" /></div>
              <div><label className="text-sm font-medium text-slate-700">Số CCCD</label><Input value={formData.idCard} onChange={e => setFormData({ ...formData, idCard: e.target.value })} /></div>
              <div className="lg:col-span-1"><label className="text-sm font-medium text-slate-700">Địa chỉ</label><Input value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} /></div>
              <div><label className="text-sm font-medium text-slate-700">Mã số thuế</label><Input value={formData.taxId} onChange={e => setFormData({ ...formData, taxId: e.target.value })} /></div>
              <div><label className="text-sm font-medium text-slate-700">Số TK Ngân hàng</label><Input value={formData.bankAccount} onChange={e => setFormData({ ...formData, bankAccount: e.target.value })} /></div>
              <div><label className="text-sm font-medium text-slate-700">Tên Ngân hàng</label><Input value={formData.bankName} onChange={e => setFormData({ ...formData, bankName: e.target.value })} /></div>
              <div className="lg:col-span-2"><label className="text-sm font-medium text-slate-700">Môn đào tạo (cách nhau dấu phẩy)</label><Input value={formData.subjects?.join(', ')} onChange={e => setFormData({ ...formData, subjects: e.target.value.split(',').map(s => s.trim()) })} placeholder="Toán, Lý..." /></div>
              <div><label className="text-sm font-medium text-slate-700">Tỷ lệ lương (%) *</label><Input type="number" value={formData.salaryRate} onChange={e => setFormData({ ...formData, salaryRate: Number(e.target.value) })} /></div>
            </div>
            <div className="flex justify-end pt-4 gap-3">
              <Button variant="outline" onClick={handleCancel}>Hủy bỏ</Button>
              <Button onClick={handleSave}>{editingId ? 'Cập nhật' : 'Lưu thông tin'}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b">
              <tr>
                <th className="px-5 py-4">Giáo viên</th>
                <th className="px-5 py-4">Liên hệ & CCCD</th>
                <th className="px-5 py-4">Tài khoản & MST</th>
                <th className="px-5 py-4">Chuyên môn</th>
                <th className="px-5 py-4 text-center">Tỷ lệ</th>
                <th className="px-5 py-4 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.teachers.map(teacher => (
                <tr key={teacher.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <div className="font-medium text-slate-800">{teacher.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{teacher.degree || 'Chưa cập nhật'}</div>
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    <div>📞 {teacher.phone}</div>
                    {teacher.email && <div className="text-xs mt-1">✉️ {teacher.email}</div>}
                    {teacher.idCard && <div className="text-xs mt-1">💳 {teacher.idCard}</div>}
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    <div className="text-xs">
                      {teacher.bankAccount ? `🏦 ${teacher.bankName} - ${teacher.bankAccount}` : 'Chưa có STK'}
                    </div>
                    {teacher.taxId && <div className="text-xs mt-1">📝 MST: {teacher.taxId}</div>}
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    <div className="flex gap-1 flex-wrap">
                      {teacher.subjects.map((sub, i) => <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs border border-blue-100">{sub}</span>)}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-800 font-bold text-center">{teacher.salaryRate}%</td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2 justify-center">
                      <Button variant="ghost" size="sm" className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 px-2 h-8" onClick={() => openEdit(teacher)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2 h-8" onClick={() => handleDelete(teacher.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.teachers.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">Chưa có dữ liệu</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default Teachers;
