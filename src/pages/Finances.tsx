import React, { useState, useMemo, useRef } from 'react';
import { useAppContext } from '../store/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { formatCurrency } from '../lib/utils';
import { Plus, Download, Upload, Target, Wallet, AlertTriangle, Trash2, CalendarDays, Edit2, CheckSquare, Square } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import { Transaction, Student } from '../types';
import { readExcelFile, sheetToRawRows, fuzzyMatchByName, excelDateToString, isExcelSerialDate } from '../services/excelUtils';
import { findOrCreateClass, findOrCreateStudent, ensureEnrollment } from '../services/smartImport';

const Finances: React.FC = () => {
  const { data, updateData, logActivity } = useAppContext();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [txType, setTxType] = useState<'income' | 'expense' | 'tuition'>('income');
  const [formData, setFormData] = useState<Partial<Transaction>>({
    amount: 0, category: '', description: '', date: dayjs().format('YYYY-MM-DD'), sessionCount: 0, paymentMethod: 'cash'
  });
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all');
  const [customFrom, setCustomFrom] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [customTo, setCustomTo] = useState(dayjs().format('YYYY-MM-DD'));

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ===== Selection helpers =====
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleStudentSelect = (studentId: string) => {
    const student = data.students.find(s => s.id === studentId);
    if (!student) { setFormData({ ...formData, relatedStudentId: studentId }); return; }
    const enrolledClassIds: string[] = [];
    if (student.classId) enrolledClassIds.push(student.classId);
    data.enrollments.filter(e => e.studentId === studentId).forEach(e => {
      if (!enrolledClassIds.includes(e.classId)) enrolledClassIds.push(e.classId);
    });
    const firstClass = enrolledClassIds.length > 0 ? data.classes.find(c => c.id === enrolledClassIds[0]) : undefined;
    const fee = firstClass?.feePerSession || 0;
    setFormData({
      ...formData, relatedStudentId: studentId, relatedClassId: firstClass?.id || '',
      relatedSubject: firstClass?.subject || '', feePerSession: fee, amount: fee * (formData.sessionCount || 0)
    });
  };

  const handleTuitionClassSelect = (classId: string) => {
    const cls = data.classes.find(c => c.id === classId);
    if (cls) {
      setFormData({ ...formData, relatedClassId: classId, relatedSubject: cls.subject, feePerSession: cls.feePerSession, amount: cls.feePerSession * (formData.sessionCount || 0) });
    } else {
      setFormData({ ...formData, relatedClassId: classId });
    }
  };

  const openEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setFormData({ ...tx });
    setTxType(tx.category === 'Học phí' ? 'tuition' : tx.type);
    setIsAdding(true);
  };

  const handleSave = () => {
    if (!formData.amount) return Swal.fire('Lỗi', 'Vui lòng nhập số tiền', 'error');
    if (txType !== 'tuition' && !formData.category) return Swal.fire('Lỗi', 'Vui lòng nhập danh mục', 'error');
    if (txType === 'tuition' && !formData.relatedStudentId) return Swal.fire('Lỗi', 'Vui lòng chọn học sinh', 'error');

    let submitData = { ...formData, type: txType === 'tuition' ? 'income' : txType, id: editingId || uuidv4() } as Transaction;
    if (txType === 'tuition') {
      submitData.category = 'Học phí';
      const student = data.students.find(s => s.id === formData.relatedStudentId);
      const cls = data.classes.find(c => c.id === formData.relatedClassId);
      submitData.description = `Thu học phí: ${student?.name || ''} - Lớp ${cls?.name || ''} (${formData.relatedSubject || ''}) - ${formData.sessionCount || 0} buổi. ${formData.description || ''}`;
    }

    updateData((prev) => ({
      transactions: editingId
        ? prev.transactions.map(t => t.id === editingId ? submitData : t)
        : [submitData, ...prev.transactions]
    }));
    setIsAdding(false); setEditingId(null);
    setFormData({ amount: 0, category: '', description: '', date: dayjs().format('YYYY-MM-DD'), sessionCount: 0, paymentMethod: 'cash' });
    Swal.fire('Thành công', editingId ? 'Đã cập nhật' : 'Đã lưu giao dịch', 'success');
    logActivity(editingId ? 'edit' : 'add', 'transaction', formData.category || '', `${txType === 'expense' ? 'Chi' : 'Thu'}: ${formData.amount?.toLocaleString()}đ`);
  };

  const handleDeleteTx = (txId: string) => {
    Swal.fire({ title: 'Xóa giao dịch?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy' }).then(result => {
      if (result.isConfirmed) {
        updateData(prev => ({ transactions: prev.transactions.filter(t => t.id !== txId) }));
        logActivity('delete', 'transaction', '', 'Xóa giao dịch');
        Swal.fire('Đã xóa', '', 'success');
      }
    });
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    Swal.fire({ title: `Xóa ${selectedIds.size} giao dịch?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy' }).then(result => {
      if (result.isConfirmed) {
        updateData(prev => ({ transactions: prev.transactions.filter(t => !selectedIds.has(t.id)) }));
        setSelectedIds(new Set());
        Swal.fire('Đã xóa', `${selectedIds.size} giao dịch`, 'success');
      }
    });
  };

  // ===== EXPORT - DS nộp tiền đúng cấu trúc ảnh mẫu =====
  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const tuitionTxs = data.transactions.filter(t => t.type === 'income' && t.category === 'Học phí');

    // Group by class/sheet
    const groupedByClass = new Map<string, Transaction[]>();
    tuitionTxs.forEach(tx => {
      const cls = data.classes.find(c => c.id === tx.relatedClassId);
      const key = cls?.name || 'Khác';
      if (!groupedByClass.has(key)) groupedByClass.set(key, []);
      groupedByClass.get(key)!.push(tx);
    });

    groupedByClass.forEach((txs, className) => {
      const wsData: any[][] = [];
      wsData.push(['DANH SÁCH HỌC SINH NỘP TIỀN']);
      wsData.push([`NĂM HỌC ${dayjs().year() - 1} - ${dayjs().year()}`]);
      wsData.push([]);
      wsData.push(['Stt', 'Họ và tên học sinh', 'Lớp', 'Trường', 'Môn', 'Số điện thoại', 'Địa chỉ',
        'Họ và tên phụ', 'Đơn', 'Số tiền', 'Hình thức', 'Ngày nộp', 'Xuất HĐ', 'TS tiền xuất HĐ', 'Ghi chú']);

      txs.forEach((t, idx) => {
        const student = data.students.find(s => s.id === t.relatedStudentId);
        wsData.push([
          idx + 1, student?.name || '', className, t.school || '', t.relatedSubject || '',
          student?.phone || '', t.address || '', student?.parentName || t.parentName || '',
          t.unitPrice || t.feePerSession || '', t.amount,
          t.paymentMethod === 'transfer' ? 'CK' : (t.paymentMethod === 'CKCT' ? 'CKCT' : 'TM'),
          dayjs(t.date).format('D.M'), t.invoiceIssued || 0, t.invoiceAmount || 0, t.note || ''
        ]);
      });
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [{ wch: 4 }, { wch: 22 }, { wch: 6 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 20 },
      { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 6 }, { wch: 12 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, ws, className.substring(0, 31));
    });

    // All transactions sheet
    const allData = data.transactions.map((t, idx) => ({
      'STT': idx + 1, 'Ngày': dayjs(t.date).format('DD/MM/YYYY'), 'Loại': t.type === 'income' ? 'Thu' : 'Chi',
      'Danh mục': t.category, 'Số tiền': t.amount, 'Hình thức': t.paymentMethod === 'transfer' ? 'CK' : 'TM', 'Mô tả': t.description
    }));
    const wsAll = XLSX.utils.json_to_sheet(allData);
    wsAll['!cols'] = [{ wch: 5 }, { wch: 12 }, { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, wsAll, "Tất cả GD");
    XLSX.writeFile(wb, `DS_Nop_Tien_${dayjs().format('YYYYMMDD')}.xlsx`);
    Swal.fire('Thành công', 'Đã xuất file Excel', 'success');
  };

  // ===== IMPORT - DS nộp tiền — AUTO-CREATE HS mới =====
  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const wb = await readExcelFile(file);
      const newStudents: Student[] = [];
      const newClasses: any[] = [];
      const newEnrollments: any[] = [];
      const newTransactions: Transaction[] = [];
      let totalImported = 0;

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

          const className = row[2]?.toString()?.trim() || sheetName;
          const school = row[3]?.toString() || '';
          const subject = row[4]?.toString()?.trim() || '';
          const phone = row[5]?.toString() || '';
          const address = row[6]?.toString() || '';
          const parentName = row[7]?.toString() || '';
          const unitPrice = Number(row[8]) || 0;
          const amount = Number(row[9]) || 0;
          const payMethodRaw = row[10]?.toString()?.toUpperCase() || '';
          const dateVal = row[11];
          const invoiceIssued = Number(row[12]) || 0;
          const invoiceAmount = Number(row[13]) || 0;
          const note = row[14]?.toString() || '';

          let paymentMethod: 'cash' | 'transfer' | 'CKCT' = 'cash';
          if (payMethodRaw.includes('CK') && payMethodRaw.includes('CT')) paymentMethod = 'CKCT';
          else if (payMethodRaw.includes('CK')) paymentMethod = 'transfer';

          let dateStr = dayjs().format('YYYY-MM-DD');
          if (isExcelSerialDate(dateVal)) dateStr = excelDateToString(dateVal);
          else if (dateVal) {
            const parsed = dayjs(dateVal.toString(), ['D.M', 'DD/MM/YYYY', 'DD.MM.YYYY'], true);
            if (parsed.isValid()) dateStr = parsed.format('YYYY-MM-DD');
          }

          // === SMART IMPORT: Tự động tạo Lớp, HS, ghi danh ===
          const classId = findOrCreateClass(className, subject, data.classes, newClasses);
          const { studentId } = findOrCreateStudent(name, { phone, address, parentName, enrolledSubjects: subject ? [subject] : [] }, data.students, newStudents);
          if (studentId && classId) {
            ensureEnrollment(studentId, classId, data.enrollments, newEnrollments);
            // Cập nhật classId cho student nếu chưa có
            const s = [...data.students, ...newStudents].find(x => x.id === studentId);
            if (s && !s.classId) s.classId = classId;
          }

          newTransactions.push({
            id: uuidv4(), type: 'income', amount, category: 'Học phí',
            description: `Nộp tiền: ${name} - ${className}`,
            date: dateStr, relatedStudentId: studentId, relatedClassId: classId, relatedSubject: subject,
            paymentMethod, school, address, parentName, unitPrice,
            invoiceIssued, invoiceAmount, note
          });
          totalImported++;
        }
      });

      if (totalImported === 0) { Swal.fire('Thông báo', 'Không tìm thấy dữ liệu hợp lệ', 'info'); return; }

      updateData(prev => ({
        students: [...prev.students, ...newStudents],
        classes: [...prev.classes, ...newClasses],
        enrollments: [...prev.enrollments, ...newEnrollments],
        transactions: [...newTransactions, ...prev.transactions]
      }));

      const summary = [`✅ Import ${totalImported} giao dịch`];
      if (newStudents.length > 0) summary.push(`👤 Tạo ${newStudents.length} HS mới`);
      if (newClasses.length > 0) summary.push(`📚 Tạo ${newClasses.length} lớp mới`);
      if (newEnrollments.length > 0) summary.push(`📝 Ghi danh ${newEnrollments.length} HS vào lớp`);

      logActivity('import', 'transaction', 'DS nộp tiền', summary.join(', '));
      Swal.fire('Import thành công!', summary.join('\n'), 'success');
    } catch {
      Swal.fire('Lỗi', 'Không thể đọc file Excel', 'error');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const filteredTransactions = useMemo(() => {
    let result = data.transactions;
    if (timeFilter === 'today') { const today = dayjs().format('YYYY-MM-DD'); result = result.filter(t => t.date === today); }
    else if (timeFilter === 'week') { const s = dayjs().startOf('week').format('YYYY-MM-DD'); const e = dayjs().endOf('week').format('YYYY-MM-DD'); result = result.filter(t => t.date >= s && t.date <= e); }
    else if (timeFilter === 'month') { const m = dayjs().format('YYYY-MM'); result = result.filter(t => t.date.startsWith(m)); }
    else if (timeFilter === 'custom') { result = result.filter(t => t.date >= customFrom && t.date <= customTo); }
    if (filterType !== 'all') result = result.filter(t => t.type === filterType);
    return result;
  }, [data.transactions, filterType, timeFilter, customFrom, customTo]);

  const filteredIncome = filteredTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const filteredExpense = filteredTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const filteredProfit = filteredIncome - filteredExpense;

  const allSelected = filteredTransactions.length > 0 && filteredTransactions.every(t => selectedIds.has(t.id));
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredTransactions.map(t => t.id)));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-slate-800">Tài chính & Giao dịch</h2>
        <div className="flex gap-2 flex-wrap">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
          <Button variant="outline" onClick={handleImportClick} className="gap-1 text-xs h-9"><Upload className="w-3.5 h-3.5" /> Nhập DS nộp tiền</Button>
          <Button variant="outline" onClick={exportExcel} className="gap-1 text-xs h-9"><Download className="w-3.5 h-3.5" /> Xuất Excel</Button>
          {selectedIds.size > 0 && (
            <Button variant="outline" onClick={handleDeleteSelected} className="gap-1 text-xs h-9 text-red-600 border-red-300 hover:bg-red-50">
              <Trash2 className="w-3.5 h-3.5" /> Xóa {selectedIds.size} mục
            </Button>
          )}
          <Button onClick={() => { setIsAdding(!isAdding); setEditingId(null); }} className="gap-1 text-xs h-9 bg-gradient-to-r from-blue-600 to-orange-500">
            {isAdding ? '✕ Hủy' : <><Plus className="w-3.5 h-3.5" /> Thu / Chi</>}
          </Button>
        </div>
      </div>

      {/* Time filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <CalendarDays className="w-4 h-4 text-slate-500" />
        {[{ val: 'all', label: 'Tất cả' }, { val: 'today', label: 'Hôm nay' }, { val: 'week', label: 'Tuần này' }, { val: 'month', label: 'Tháng này' }, { val: 'custom', label: 'Tùy chọn' }].map(f => (
          <button key={f.val} onClick={() => setTimeFilter(f.val as any)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${timeFilter === f.val ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{f.label}</button>
        ))}
        {timeFilter === 'custom' && (
          <div className="flex items-center gap-1.5 ml-2">
            <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-8 text-xs w-[130px]" />
            <span className="text-slate-400">→</span>
            <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-8 text-xs w-[130px]" />
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4"><div className="text-xs text-slate-500 uppercase">Thu</div><div className="text-xl font-bold text-emerald-600 mt-1">{formatCurrency(filteredIncome)}</div></Card>
        <Card className="p-4"><div className="text-xs text-slate-500 uppercase">Chi</div><div className="text-xl font-bold text-rose-600 mt-1">{formatCurrency(filteredExpense)}</div></Card>
        <Card className="p-4"><div className="text-xs text-slate-500 uppercase">Lợi nhuận</div><div className={`text-xl font-bold mt-1 ${filteredProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(filteredProfit)}</div></Card>
      </div>

      {/* Add/Edit form */}
      {isAdding && (
        <Card className="border-blue-200 shadow-blue-100 overflow-visible">
          <CardHeader>
            <div className="flex gap-4">
              <button onClick={() => setTxType('tuition')} className={`px-4 py-2 font-medium rounded-lg text-sm transition-all ${txType === 'tuition' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-100'}`}>Tạo Phiếu Thu Học Phí</button>
              <button onClick={() => setTxType('income')} className={`px-4 py-2 font-medium rounded-lg text-sm transition-all ${txType === 'income' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500 hover:bg-slate-100'}`}>Thu Nhập Khác</button>
              <button onClick={() => setTxType('expense')} className={`px-4 py-2 font-medium rounded-lg text-sm transition-all ${txType === 'expense' ? 'bg-rose-100 text-rose-700' : 'text-slate-500 hover:bg-slate-100'}`}>Tạo Phiếu Chi</button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {txType === 'tuition' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700">Học sinh *</label>
                  <select className="w-full h-10 px-3 py-2 border border-slate-300 rounded-lg text-sm" value={formData.relatedStudentId} onChange={e => handleStudentSelect(e.target.value)}>
                    <option value="">-- Chọn HS --</option>
                    {data.students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Lớp học</label>
                  <select className="w-full h-10 px-3 py-2 border border-slate-300 rounded-lg text-sm" value={formData.relatedClassId || ''} onChange={e => handleTuitionClassSelect(e.target.value)}>
                    <option value="">-- Chọn Lớp --</option>
                    {data.classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.subject})</option>)}
                  </select>
                </div>
                <div><label className="text-sm font-medium text-slate-700">Môn</label><Input value={formData.relatedSubject || ''} onChange={e => setFormData({ ...formData, relatedSubject: e.target.value })} /></div>
                <div><label className="text-sm font-medium text-slate-700">Số buổi</label><Input type="number" value={formData.sessionCount} onChange={e => { const c = Number(e.target.value); setFormData({ ...formData, sessionCount: c, amount: c * (formData.feePerSession || 0) }); }} /></div>
                <div><label className="text-sm font-medium text-slate-700">Học phí/buổi</label><Input type="number" value={formData.feePerSession} onChange={e => { const f = Number(e.target.value); setFormData({ ...formData, feePerSession: f, amount: f * (formData.sessionCount || 0) }); }} /></div>
                <div><label className="text-sm font-medium text-slate-700">Tổng tiền *</label><Input type="number" value={formData.amount} onChange={e => setFormData({ ...formData, amount: Number(e.target.value) })} /></div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Hình thức</label>
                  <select className="w-full h-10 px-3 py-2 border border-slate-300 rounded-lg text-sm" value={formData.paymentMethod} onChange={e => setFormData({ ...formData, paymentMethod: e.target.value as any })}>
                    <option value="cash">TM (Tiền mặt)</option>
                    <option value="transfer">CK (Chuyển khoản)</option>
                    <option value="CKCT">CKCT</option>
                  </select>
                </div>
                <div><label className="text-sm font-medium text-slate-700">Ngày nộp</label><Input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} /></div>
                <div><label className="text-sm font-medium text-slate-700">Xuất HĐ</label><Input type="number" value={formData.invoiceIssued || 0} onChange={e => setFormData({ ...formData, invoiceIssued: Number(e.target.value) })} /></div>
                <div><label className="text-sm font-medium text-slate-700">TS tiền xuất HĐ</label><Input type="number" value={formData.invoiceAmount || 0} onChange={e => setFormData({ ...formData, invoiceAmount: Number(e.target.value) })} /></div>
                <div className="lg:col-span-2"><label className="text-sm font-medium text-slate-700">Ghi chú</label><Input value={formData.note || ''} onChange={e => setFormData({ ...formData, note: e.target.value })} /></div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div><label className="text-sm font-medium text-slate-700">Số tiền *</label><Input type="number" value={formData.amount} onChange={e => setFormData({ ...formData, amount: Number(e.target.value) })} /></div>
                <div><label className="text-sm font-medium text-slate-700">Danh mục *</label><Input value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} /></div>
                <div><label className="text-sm font-medium text-slate-700">Ngày</label><Input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} /></div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Hình thức</label>
                  <select className="w-full h-10 px-3 py-2 border border-slate-300 rounded-lg text-sm" value={formData.paymentMethod} onChange={e => setFormData({ ...formData, paymentMethod: e.target.value as any })}>
                    <option value="cash">TM</option><option value="transfer">CK</option><option value="CKCT">CKCT</option>
                  </select>
                </div>
                <div className="lg:col-span-4"><label className="text-sm font-medium text-slate-700">Mô tả</label><Input value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} /></div>
              </div>
            )}
            <div className="flex justify-end pt-4">
              <Button onClick={handleSave} className={txType === 'expense' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}>
                {editingId ? 'Cập nhật' : `Lưu ${txType === 'expense' ? 'Phiếu Chi' : 'Phiếu Thu'}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        <button onClick={() => setFilterType('all')} className={`px-4 py-2 rounded-lg text-sm font-medium ${filterType === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>Tất cả ({data.transactions.length})</button>
        <button onClick={() => setFilterType('income')} className={`px-4 py-2 rounded-lg text-sm font-medium ${filterType === 'income' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'}`}>Thu</button>
        <button onClick={() => setFilterType('expense')} className={`px-4 py-2 rounded-lg text-sm font-medium ${filterType === 'expense' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700'}`}>Chi</button>
      </div>

      {/* ===== BẢNG DS NỘP TIỀN — ĐẦY ĐỦ CỘT THEO ẢNH MẪU ===== */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left whitespace-nowrap">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b-2 border-slate-300">
              <tr>
                <th className="px-2 py-3 text-center w-8">
                  <button onClick={toggleSelectAll} className="text-slate-500 hover:text-blue-600">
                    {allSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="px-2 py-3">Stt</th>
                <th className="px-3 py-3">Họ và tên</th>
                <th className="px-2 py-3">Lớp</th>
                <th className="px-2 py-3">Trường</th>
                <th className="px-2 py-3">Môn</th>
                <th className="px-2 py-3">SĐT</th>
                <th className="px-3 py-3">Phụ huynh</th>
                <th className="px-2 py-3 text-right">Đơn</th>
                <th className="px-2 py-3 text-right">Số tiền</th>
                <th className="px-2 py-3 text-center">HT</th>
                <th className="px-2 py-3">Ngày nộp</th>
                <th className="px-2 py-3 text-center">Xuất HĐ</th>
                <th className="px-2 py-3 text-right">TS tiền HĐ</th>
                <th className="px-3 py-3">Ghi chú</th>
                <th className="px-2 py-3 text-center w-16">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransactions.map((tx, idx) => {
                const student = data.students.find(s => s.id === tx.relatedStudentId);
                const cls = data.classes.find(c => c.id === tx.relatedClassId);
                return (
                  <tr key={tx.id} className={`hover:bg-blue-50/50 ${selectedIds.has(tx.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-2 py-2 text-center">
                      <button onClick={() => toggleSelect(tx.id)}>{selectedIds.has(tx.id) ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-slate-300" />}</button>
                    </td>
                    <td className="px-2 py-2 text-slate-400">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{student?.name || tx.description?.split(':')[1]?.split('-')[0]?.trim() || '-'}</td>
                    <td className="px-2 py-2">{cls?.name || '-'}</td>
                    <td className="px-2 py-2">{tx.school || '-'}</td>
                    <td className="px-2 py-2">{tx.relatedSubject || tx.category}</td>
                    <td className="px-2 py-2 text-slate-500">{student?.phone || '-'}</td>
                    <td className="px-3 py-2">{student?.parentName || tx.parentName || '-'}</td>
                    <td className="px-2 py-2 text-right">{(tx.unitPrice || tx.feePerSession || 0).toLocaleString()}</td>
                    <td className={`px-2 py-2 text-right font-bold ${tx.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>{tx.amount.toLocaleString()}</td>
                    <td className="px-2 py-2 text-center">{tx.paymentMethod === 'transfer' ? 'CK' : tx.paymentMethod === 'CKCT' ? 'CKCT' : 'TM'}</td>
                    <td className="px-2 py-2">{dayjs(tx.date).format('D.M')}</td>
                    <td className="px-2 py-2 text-center">{tx.invoiceIssued || 0}</td>
                    <td className="px-2 py-2 text-right">{(tx.invoiceAmount || 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-slate-500 max-w-[100px] truncate">{tx.note || ''}</td>
                    <td className="px-2 py-2 text-center">
                      <div className="flex gap-0.5 justify-center">
                        <button onClick={() => openEdit(tx)} className="text-blue-500 hover:text-blue-700 p-1"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDeleteTx(tx.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredTransactions.length === 0 && (
                <tr><td colSpan={16} className="px-6 py-8 text-center text-slate-400">Chưa có giao dịch</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default Finances;
