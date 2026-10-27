import React, { useState, useMemo, useRef } from 'react';
import { useAppContext } from '../store/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { SalaryRecord, Transaction, Teacher, ClassSession } from '../types';
import { Calculator, CheckCircle2, Upload, Download, Plus, Trash2, Edit2, CheckSquare, Square } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import { formatCurrency } from '../lib/utils';
import { readExcelFile, sheetToRawRows, excelDateToString, isExcelSerialDate, fuzzyMatchByName } from '../services/excelUtils';
import { findOrCreateTeacher, findOrCreateClass } from '../services/smartImport';

const Salary: React.FC = () => {
    const { data, updateData, logActivity } = useAppContext();
    const [selectedMonth, setSelectedMonth] = useState(dayjs().format('YYYY-MM'));
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Selection state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const toggleSelect = (id: string) => { setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };

    // Form state for manual add/edit
    const emptyForm: Partial<SalaryRecord> = {
        teacherId: '', classSubject: '', studentCount: 0, totalRevenue: 0,
        salaryRate: 70, salaryAmount: 0, advance1: 0, advance2: 0, advance3: 0, advance4: 0,
        paidTransfer: 0, paidCash: 0, note: '', date: dayjs().format('YYYY-MM-DD')
    };
    const [formData, setFormData] = useState<Partial<SalaryRecord>>(emptyForm);

    // Get salary records for this month
    const monthRecords = useMemo(() => {
        return data.salaryRecords.filter(s => s.month === selectedMonth);
    }, [data.salaryRecords, selectedMonth]);

    // Totals
    const totals = useMemo(() => {
        return monthRecords.reduce((acc, r) => ({
            studentCount: acc.studentCount + (r.studentCount || 0),
            totalRevenue: acc.totalRevenue + r.totalRevenue,
            salaryAmount: acc.salaryAmount + r.salaryAmount,
            advance1: acc.advance1 + (r.advance1 || 0),
            advance2: acc.advance2 + (r.advance2 || 0),
            advance3: acc.advance3 + (r.advance3 || 0),
            advance4: acc.advance4 + (r.advance4 || 0),
            paidTransfer: acc.paidTransfer + (r.paidTransfer || 0),
            paidCash: acc.paidCash + (r.paidCash || 0),
        }), { studentCount: 0, totalRevenue: 0, salaryAmount: 0, advance1: 0, advance2: 0, advance3: 0, advance4: 0, paidTransfer: 0, paidCash: 0 });
    }, [monthRecords]);

    // Auto-calculate salary when fields change
    const updateFormCalc = (updates: Partial<SalaryRecord>) => {
        const merged = { ...formData, ...updates };
        const revenue = merged.totalRevenue || 0;
        const rate = (merged.salaryRate || 0) / 100;
        const salary = Math.round(revenue * rate);
        setFormData({ ...merged, salaryAmount: salary });
    };

    const openAdd = () => {
        setEditingId(null);
        setFormData({ ...emptyForm, date: dayjs().format('YYYY-MM-DD') });
        setIsAdding(true);
    };

    const openEdit = (record: SalaryRecord) => {
        setEditingId(record.id);
        setFormData({ ...record });
        setIsAdding(true);
    };

    const handleSave = () => {
        if (!formData.teacherId) return Swal.fire('Lỗi', 'Vui lòng chọn giáo viên', 'error');

        const record: SalaryRecord = {
            id: editingId || uuidv4(),
            teacherId: formData.teacherId!,
            month: selectedMonth,
            totalSessions: 0,
            totalRevenue: formData.totalRevenue || 0,
            salaryRate: formData.salaryRate || 0,
            salaryAmount: formData.salaryAmount || 0,
            status: ((formData.paidTransfer || 0) > 0 || (formData.paidCash || 0) > 0) ? 'paid' : 'pending',
            paidDate: formData.date,
            classSubject: formData.classSubject,
            studentCount: formData.studentCount,
            advance1: formData.advance1 || 0,
            advance2: formData.advance2 || 0,
            advance3: formData.advance3 || 0,
            advance4: formData.advance4 || 0,
            paidTransfer: formData.paidTransfer || 0,
            paidCash: formData.paidCash || 0,
            note: formData.note,
            date: formData.date,
        };

        updateData(prev => {
            const others = prev.salaryRecords.filter(s => s.id !== record.id);
            return { salaryRecords: [...others, record] };
        });

        logActivity(editingId ? 'edit' : 'add', 'salary', data.teachers.find(t => t.id === formData.teacherId)?.name || '', '');
        setIsAdding(false);
        setEditingId(null);
        Swal.fire('Thành công', editingId ? 'Đã cập nhật' : 'Đã thêm bản ghi chi trả', 'success');
    };

    const handleDelete = (id: string) => {
        Swal.fire({ title: 'Xóa bản ghi?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy' }).then(result => {
            if (result.isConfirmed) {
                updateData(prev => ({ salaryRecords: prev.salaryRecords.filter(s => s.id !== id) }));
                Swal.fire('Đã xóa', '', 'success');
            }
        });
    };

    const handleDeleteSelected = () => {
        if (selectedIds.size === 0) return;
        Swal.fire({ title: `Xóa ${selectedIds.size} bản ghi?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy' }).then(result => {
            if (result.isConfirmed) {
                updateData(prev => ({ salaryRecords: prev.salaryRecords.filter(s => !selectedIds.has(s.id)) }));
                setSelectedIds(new Set());
                Swal.fire('Đã xóa', '', 'success');
            }
        });
    };

    // ===== IMPORT =====
    const handleImportClick = () => fileInputRef.current?.click();

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const wb = await readExcelFile(file);
            const newRecords: SalaryRecord[] = [];
            const newTeachers: Teacher[] = [];
            const newClasses: ClassSession[] = [];

            wb.SheetNames.forEach(sheetName => {
                const rows = sheetToRawRows(wb.Sheets[sheetName]);
                let headerRowIdx = -1;
                for (let ri = 0; ri < Math.min(rows.length, 10); ri++) {
                    const row = rows[ri];
                    if (!row) continue;
                    const rowStr = row.map((c: any) => String(c || '').toLowerCase()).join('|');
                    if (rowStr.includes('giáo viên') || rowStr.includes('giao vien')) { headerRowIdx = ri; break; }
                }
                if (headerRowIdx < 0) return;

                for (let ri = headerRowIdx + 1; ri < rows.length; ri++) {
                    const row = rows[ri];
                    if (!row || row.length < 3) continue;
                    const teacherName = row[1]?.toString()?.trim();
                    if (!teacherName) continue;

                    let dateStr = '';
                    if (isExcelSerialDate(row[0])) dateStr = excelDateToString(row[0]);
                    else if (row[0]) dateStr = row[0].toString();

                    const classSubject = row[2]?.toString()?.trim() || '';
                    const totalRevenue = Number(row[4]) || 0;
                    const rate = Number(row[5]) || 0;
                    const salaryRate = rate < 1 ? rate * 100 : rate;

                    // === SMART IMPORT: tự tạo GV và Lớp nếu chưa có ===
                    const subject = classSubject.split(/[\s,]+/)[0] || '';
                    const { teacherId } = findOrCreateTeacher(teacherName, { subject, salaryRate }, data.teachers, newTeachers);

                    // Tạo lớp từ cột "Môn, lớp"
                    if (classSubject) {
                        findOrCreateClass(classSubject, subject, data.classes, newClasses);
                    }

                    newRecords.push({
                        id: uuidv4(),
                        teacherId,
                        month: dateStr ? dayjs(dateStr).format('YYYY-MM') : selectedMonth,
                        totalSessions: 0,
                        totalRevenue,
                        salaryRate,
                        salaryAmount: Number(row[6]) || 0,
                        status: ((Number(row[11]) || 0) > 0 || (Number(row[12]) || 0) > 0) ? 'paid' : 'pending',
                        paidDate: dateStr,
                        classSubject,
                        studentCount: Number(row[3]) || 0,
                        advance1: Number(row[7]) || 0,
                        advance2: Number(row[8]) || 0,
                        advance3: Number(row[9]) || 0,
                        advance4: Number(row[10]) || 0,
                        paidTransfer: Number(row[11]) || 0,
                        paidCash: Number(row[12]) || 0,
                        note: row[13]?.toString() || '',
                        date: dateStr,
                    });
                }
            });

            if (newRecords.length === 0) {
                Swal.fire('Thông báo', 'Không tìm thấy dữ liệu hợp lệ', 'info');
            } else {
                updateData(prev => ({
                    salaryRecords: [...prev.salaryRecords, ...newRecords],
                    teachers: [...prev.teachers, ...newTeachers],
                    classes: [...prev.classes, ...newClasses]
                }));
                const summary = [`✅ ${newRecords.length} bản ghi chi trả`];
                if (newTeachers.length > 0) summary.push(`👩‍🏫 ${newTeachers.length} GV mới`);
                if (newClasses.length > 0) summary.push(`📚 ${newClasses.length} lớp mới`);
                logActivity('import', 'salary', 'Chi trả GV', summary.join(', '));
                Swal.fire('Import thành công!', summary.join('\n'), 'success');
            }
        } catch {
            Swal.fire('Lỗi', 'Không thể đọc file Excel', 'error');
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // ===== EXPORT =====
    const exportSalary = () => {
        const wb = XLSX.utils.book_new();
        const wsData: any[][] = [];
        wsData.push(['THEO DÕI CHI TRẢ GIÁO VIÊN']);
        wsData.push([`Năm ${selectedMonth.split('-')[0]}`]);
        wsData.push([]);
        wsData.push(['Ngày', 'Giáo viên', 'Môn, lớp', 'Sĩ số', 'Tổng thu', 'Tỉ lệ trả', 'GV nhận',
            'Tạm ứng L1', 'Tạm ứng L2', 'Tạm ứng L3', 'Tạm ứng L4', 'Trả qua TK', 'Trả tiền mặt', 'Ghi chú']);

        monthRecords.forEach(r => {
            const teacher = data.teachers.find(t => t.id === r.teacherId);
            wsData.push([
                r.date ? dayjs(r.date).format('D.M') : '',
                teacher?.name || '', r.classSubject || '', r.studentCount || '',
                r.totalRevenue, (r.salaryRate || 0) / 100, r.salaryAmount,
                r.advance1 || 0, r.advance2 || 0, r.advance3 || 0, r.advance4 || 0,
                r.paidTransfer || 0, r.paidCash || 0, r.note || ''
            ]);
        });

        // Totals row
        wsData.push([]);
        wsData.push(['', '', '', totals.studentCount, totals.totalRevenue, '', totals.salaryAmount,
            totals.advance1, totals.advance2, totals.advance3, totals.advance4,
            totals.paidTransfer, totals.paidCash, '']);

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [{ wch: 8 }, { wch: 16 }, { wch: 14 }, { wch: 7 }, { wch: 14 }, { wch: 8 }, { wch: 14 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 13 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Chi trả GV');
        XLSX.writeFile(wb, `Chi_Tra_GV_${selectedMonth}.xlsx`);
        Swal.fire('Thành công', 'Đã xuất file', 'success');
    };

    const fmtNum = (n: number | undefined) => (n || 0).toLocaleString('vi-VN');

    const allSelected = monthRecords.length > 0 && monthRecords.every(r => selectedIds.has(r.id));
    const toggleSelectAll = () => {
        if (allSelected) setSelectedIds(new Set());
        else setSelectedIds(new Set(monthRecords.map(r => r.id)));
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-3">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Calculator className="w-7 h-7 text-primary" /> Theo Dõi Chi Trả Giáo Viên
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                    <Input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-[150px]" />
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
                    <Button variant="outline" onClick={handleImportClick} className="gap-1 text-xs h-9"><Upload className="w-3.5 h-3.5" /> Nhập Excel</Button>
                    <Button variant="outline" onClick={exportSalary} className="gap-1 text-xs h-9"><Download className="w-3.5 h-3.5" /> Xuất Excel</Button>
                    {selectedIds.size > 0 && (
                        <Button variant="outline" onClick={handleDeleteSelected} className="gap-1 text-xs h-9 text-red-600 border-red-300 hover:bg-red-50">
                            <Trash2 className="w-3.5 h-3.5" /> Xóa {selectedIds.size}
                        </Button>
                    )}
                    <Button onClick={() => isAdding ? (setIsAdding(false), setEditingId(null)) : openAdd()} className="gap-1 text-xs h-9">
                        {isAdding ? '✕ Hủy' : <><Plus className="w-3.5 h-3.5" /> Thêm</>}
                    </Button>
                </div>
            </div>

            {/* ===== FORM THÊM/SỬA ===== */}
            {isAdding && (
                <Card className="border-purple-200 shadow-purple-100">
                    <CardHeader className="py-3"><CardTitle className="text-sm">{editingId ? 'Sửa bản ghi' : 'Thêm chi trả GV'}</CardTitle></CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                            <div>
                                <label className="text-xs font-medium text-slate-600">Ngày</label>
                                <Input type="date" value={formData.date || ''} onChange={e => setFormData({ ...formData, date: e.target.value })} className="h-8 text-xs" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600">Giáo viên *</label>
                                <select className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs" value={formData.teacherId || ''} onChange={e => setFormData({ ...formData, teacherId: e.target.value })}>
                                    <option value="">-- Chọn GV --</option>
                                    {data.teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600">Môn, lớp</label>
                                <Input value={formData.classSubject || ''} onChange={e => setFormData({ ...formData, classSubject: e.target.value })} className="h-8 text-xs" placeholder="Lý 11D" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600">Sĩ số</label>
                                <Input type="number" value={formData.studentCount || 0} onChange={e => setFormData({ ...formData, studentCount: Number(e.target.value) })} className="h-8 text-xs" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600">Tổng thu</label>
                                <Input type="number" value={formData.totalRevenue || 0} onChange={e => updateFormCalc({ totalRevenue: Number(e.target.value) })} className="h-8 text-xs" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600">Tỉ lệ trả (%)</label>
                                <Input type="number" value={formData.salaryRate || 0} onChange={e => updateFormCalc({ salaryRate: Number(e.target.value) })} className="h-8 text-xs" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600">GV nhận</label>
                                <Input type="number" value={formData.salaryAmount || 0} readOnly className="h-8 text-xs bg-slate-50 font-bold text-emerald-600" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600">Tạm ứng L1</label>
                                <Input type="number" value={formData.advance1 || 0} onChange={e => setFormData({ ...formData, advance1: Number(e.target.value) })} className="h-8 text-xs" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600">Tạm ứng L2</label>
                                <Input type="number" value={formData.advance2 || 0} onChange={e => setFormData({ ...formData, advance2: Number(e.target.value) })} className="h-8 text-xs" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600">Tạm ứng L3</label>
                                <Input type="number" value={formData.advance3 || 0} onChange={e => setFormData({ ...formData, advance3: Number(e.target.value) })} className="h-8 text-xs" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600">Tạm ứng L4</label>
                                <Input type="number" value={formData.advance4 || 0} onChange={e => setFormData({ ...formData, advance4: Number(e.target.value) })} className="h-8 text-xs" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600">Trả qua TK</label>
                                <Input type="number" value={formData.paidTransfer || 0} onChange={e => setFormData({ ...formData, paidTransfer: Number(e.target.value) })} className="h-8 text-xs" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600">Trả tiền mặt</label>
                                <Input type="number" value={formData.paidCash || 0} onChange={e => setFormData({ ...formData, paidCash: Number(e.target.value) })} className="h-8 text-xs" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600">Ghi chú</label>
                                <Input value={formData.note || ''} onChange={e => setFormData({ ...formData, note: e.target.value })} className="h-8 text-xs" />
                            </div>
                        </div>
                        <div className="flex justify-end pt-3 gap-2">
                            <Button variant="outline" onClick={() => { setIsAdding(false); setEditingId(null); }} className="text-xs h-8">Hủy</Button>
                            <Button onClick={handleSave} className="text-xs h-8 bg-purple-600 hover:bg-purple-700">{editingId ? 'Cập nhật' : 'Lưu'}</Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="p-3">
                    <div className="text-xs text-slate-500">Tổng thu</div>
                    <div className="text-lg font-bold text-blue-600">{formatCurrency(totals.totalRevenue)}</div>
                </Card>
                <Card className="p-3">
                    <div className="text-xs text-slate-500">GV nhận</div>
                    <div className="text-lg font-bold text-emerald-600">{formatCurrency(totals.salaryAmount)}</div>
                </Card>
                <Card className="p-3">
                    <div className="text-xs text-slate-500">Trả qua TK</div>
                    <div className="text-lg font-bold text-indigo-600">{formatCurrency(totals.paidTransfer)}</div>
                </Card>
                <Card className="p-3">
                    <div className="text-xs text-slate-500">Trả tiền mặt</div>
                    <div className="text-lg font-bold text-amber-600">{formatCurrency(totals.paidCash)}</div>
                </Card>
            </div>

            {/* ===== BẢNG CHI TRẢ — ĐẦY ĐỦ 14 CỘT ===== */}
            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left whitespace-nowrap">
                        <thead className="bg-slate-100 text-slate-700 font-semibold border-b-2 border-slate-300">
                            <tr>
                                <th className="px-2 py-3 text-center w-8">
                                    <button onClick={toggleSelectAll}>{allSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-slate-400" />}</button>
                                </th>
                                <th className="px-3 py-3 sticky left-0 bg-slate-100 z-10">Ngày</th>
                                <th className="px-3 py-3">Giáo viên</th>
                                <th className="px-3 py-3">Môn, lớp</th>
                                <th className="px-3 py-3 text-center">Sĩ số</th>
                                <th className="px-3 py-3 text-right">Tổng thu</th>
                                <th className="px-3 py-3 text-center">Tỉ lệ trả</th>
                                <th className="px-3 py-3 text-right">GV nhận</th>
                                <th className="px-3 py-3 text-right">Tạm ứng L1</th>
                                <th className="px-3 py-3 text-right">Tạm ứng L2</th>
                                <th className="px-3 py-3 text-right">Tạm ứng L3</th>
                                <th className="px-3 py-3 text-right">Tạm ứng L4</th>
                                <th className="px-3 py-3 text-right">Trả qua TK</th>
                                <th className="px-3 py-3 text-right">Trả tiền mặt</th>
                                <th className="px-3 py-3">Ghi chú</th>
                                <th className="px-3 py-3 text-center w-20">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {monthRecords.map(r => {
                                const teacher = data.teachers.find(t => t.id === r.teacherId);
                                return (
                                    <tr key={r.id} className={`hover:bg-blue-50/50 ${selectedIds.has(r.id) ? 'bg-blue-50' : ''}`}>
                                        <td className="px-2 py-2.5 text-center">
                                            <button onClick={() => toggleSelect(r.id)}>{selectedIds.has(r.id) ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-slate-300" />}</button>
                                        </td>
                                        <td className="px-3 py-2.5 sticky left-0 bg-white font-medium">{r.date ? dayjs(r.date).format('D.M') : '-'}</td>
                                        <td className="px-3 py-2.5 font-medium text-slate-800">{teacher?.name || '?'}</td>
                                        <td className="px-3 py-2.5">{r.classSubject || '-'}</td>
                                        <td className="px-3 py-2.5 text-center">{r.studentCount || '-'}</td>
                                        <td className="px-3 py-2.5 text-right font-medium">{fmtNum(r.totalRevenue)}</td>
                                        <td className="px-3 py-2.5 text-center font-bold text-blue-600">{((r.salaryRate || 0) / 100).toFixed(1)}</td>
                                        <td className="px-3 py-2.5 text-right font-bold text-emerald-600">{fmtNum(r.salaryAmount)}</td>
                                        <td className="px-3 py-2.5 text-right">{fmtNum(r.advance1)}</td>
                                        <td className="px-3 py-2.5 text-right">{fmtNum(r.advance2)}</td>
                                        <td className="px-3 py-2.5 text-right">{fmtNum(r.advance3)}</td>
                                        <td className="px-3 py-2.5 text-right">{fmtNum(r.advance4)}</td>
                                        <td className="px-3 py-2.5 text-right font-medium text-indigo-600">{fmtNum(r.paidTransfer)}</td>
                                        <td className="px-3 py-2.5 text-right font-medium text-amber-600">{fmtNum(r.paidCash)}</td>
                                        <td className="px-3 py-2.5 text-slate-500 max-w-[120px] truncate">{r.note || ''}</td>
                                        <td className="px-3 py-2.5 text-center">
                                            <div className="flex gap-1 justify-center">
                                                <button onClick={() => openEdit(r)} className="text-blue-500 hover:text-blue-700 p-1"><Edit2 className="w-3.5 h-3.5" /></button>
                                                <button onClick={() => handleDelete(r.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {monthRecords.length === 0 && (
                                <tr><td colSpan={16} className="px-6 py-8 text-center text-slate-400">Chưa có dữ liệu chi trả tháng này</td></tr>
                            )}
                        </tbody>
                        {monthRecords.length > 0 && (
                            <tfoot className="bg-slate-50 font-bold text-xs border-t-2 border-slate-300">
                                <tr>
                                    <td className="px-3 py-3"></td>
                                    <td className="px-3 py-3 sticky left-0 bg-slate-50" colSpan={3}>TỔNG CỘNG</td>
                                    <td className="px-3 py-3 text-center">{totals.studentCount}</td>
                                    <td className="px-3 py-3 text-right">{fmtNum(totals.totalRevenue)}</td>
                                    <td className="px-3 py-3"></td>
                                    <td className="px-3 py-3 text-right text-emerald-700">{fmtNum(totals.salaryAmount)}</td>
                                    <td className="px-3 py-3 text-right">{fmtNum(totals.advance1)}</td>
                                    <td className="px-3 py-3 text-right">{fmtNum(totals.advance2)}</td>
                                    <td className="px-3 py-3 text-right">{fmtNum(totals.advance3)}</td>
                                    <td className="px-3 py-3 text-right">{fmtNum(totals.advance4)}</td>
                                    <td className="px-3 py-3 text-right text-indigo-700">{fmtNum(totals.paidTransfer)}</td>
                                    <td className="px-3 py-3 text-right text-amber-700">{fmtNum(totals.paidCash)}</td>
                                    <td className="px-3 py-3" colSpan={2}></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default Salary;
