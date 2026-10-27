import React, { useState } from 'react';
import { useAppContext } from '../store/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { formatCurrency } from '../lib/utils';
import { Sparkles } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { askGemini } from '../services/ai';
import Swal from 'sweetalert2';
import dayjs from 'dayjs';
import { computeProgress, getClassStudents } from '../lib/academic';

const Dashboard: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const { data } = useAppContext();
  const [aiInsight, setAiInsight] = useState<string>('');
  const [isLoadingAi, setIsLoadingAi] = useState(false);

  // ===== Học vụ =====
  const today = dayjs().format('YYYY-MM-DD');
  const todayLessons = data.lessons.filter(l => l.date === today && l.status !== 'cancelled').sort((a, b) => a.startTime.localeCompare(b.startTime));
  const lowSessionCount = data.classes.reduce((sum, c) => sum + getClassStudents(data, c.id).filter(s => {
    const p = computeProgress(data, s.id, c.id);
    return !p.reserved && p.remaining <= data.settings.policies.lowSessionWarning;
  }).length, 0);
  const todos = [
    { label: 'Buổi học chưa điểm danh', count: data.lessons.filter(l => l.date <= today && l.attendanceStatus === 'open' && l.status !== 'cancelled').length, tab: 'lessons', tone: 'text-amber-600' },
    { label: 'Điểm danh chờ duyệt', count: data.lessons.filter(l => l.attendanceStatus === 'submitted').length, tab: 'lessons', tone: 'text-blue-600' },
    { label: 'Bài kiểm tra chờ duyệt', count: data.exams.filter(e => e.status === 'pending').length, tab: 'assessments', tone: 'text-blue-600' },
    { label: 'Phản hồi PH chưa xử lý', count: data.feedbacks.filter(f => f.status !== 'resolved').length, tab: 'communication', tone: 'text-red-500' },
    { label: 'Yêu cầu học bù chờ xếp', count: data.makeups.filter(m => m.status === 'pending').length, tab: 'services', tone: 'text-purple-600' },
    { label: 'HV sắp hết / hết buổi', count: lowSessionCount, tab: 'progress', tone: 'text-red-500' },
  ];

  const incomeTransactions = data.transactions.filter(t => t.type === 'income');
  const expenseTransactions = data.transactions.filter(t => t.type === 'expense');
  const totalIncome = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = expenseTransactions.reduce((sum, t) => sum + t.amount, 0);
  const profit = totalIncome - totalExpense;

  // Tính công nợ thực tế: Tổng học phí dự kiến - Tổng đã thu
  const totalExpectedFees = data.students.reduce((sum, student) => {
    const enrolledClassIds: string[] = [];
    if (student.classId) enrolledClassIds.push(student.classId);
    data.enrollments.filter(e => e.studentId === student.id).forEach(e => {
      if (!enrolledClassIds.includes(e.classId)) enrolledClassIds.push(e.classId);
    });
    const attendanceCount = data.attendances.filter(a =>
      enrolledClassIds.includes(a.classId) && a.studentId === student.id && a.status === 'present'
    ).length;
    const avgFee = enrolledClassIds.length > 0
      ? data.classes.filter(c => enrolledClassIds.includes(c.id)).reduce((s, c) => s + c.feePerSession, 0) / enrolledClassIds.length
      : 0;
    return sum + (attendanceCount * avgFee);
  }, 0);
  const totalPaidFees = incomeTransactions.filter(t => t.category === 'Học phí').reduce((sum, t) => sum + t.amount, 0);
  const totalDebt = Math.max(0, totalExpectedFees - totalPaidFees);

  // Doanh thu từng tháng (thực từ data)
  const monthlyData: { name: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const m = dayjs().subtract(i, 'month');
    const monthIncome = data.transactions
      .filter(t => t.type === 'income' && dayjs(t.date).format('YYYY-MM') === m.format('YYYY-MM'))
      .reduce((s, t) => s + t.amount, 0);
    monthlyData.push({ name: m.format('T' + (m.month() + 1)), value: monthIncome });
  }
  const maxMonthValue = Math.max(...monthlyData.map(d => d.value), 1);

  // Mục tiêu lợi nhuận - tính thực
  const profitTarget = 10000000;
  const profitPercent = Math.min(Math.round((profit / profitTarget) * 100), 100);

  const getInsights = async () => {
    setIsLoadingAi(true);
    try {
      const prompt = `Bạn là chuyên gia phân tích tài chính giáo dục. Phân tích số liệu Trung tâm Dạy học & Đào tạo Tri Thức Việt:
      - Thu: ${totalIncome}
      - Chi: ${totalExpense}
      - Lợi nhuận: ${profit}
      - Công nợ: ${totalDebt}
      - Số GV: ${data.teachers.length}, Số HV: ${data.students.length}, Số lớp: ${data.classes.length}, Số khóa học: ${data.courses.length}
      - Việc tồn đọng: ${todos.map(t => `${t.label}: ${t.count}`).join("; ")}
      Viết phân tích duy nhất 1 đoạn ngắn gọn tóm tắt tình hình, cảnh báo, đề xuất nhỏ.`;

      const response = await askGemini(prompt, data.settings.geminiApiKey, data.settings.geminiModel);
      setAiInsight(response);
    } catch (error: any) {
      Swal.fire('Lỗi AI', error.message, 'error');
    } finally {
      setIsLoadingAi(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full pb-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="p-5 flex flex-col gap-2">
          <span className="text-[12px] text-slate-500 uppercase tracking-wide">Tổng doanh thu</span>
          <span className="text-[24px] font-[700] text-slate-800">{formatCurrency(totalIncome)}</span>
          <span className="text-[11px] font-[600] text-emerald-600">● {incomeTransactions.length} giao dịch thu</span>
        </Card>
        <Card className="p-5 flex flex-col gap-2">
          <span className="text-[12px] text-slate-500 uppercase tracking-wide">Tổng học viên</span>
          <span className="text-[24px] font-[700] text-slate-800">{data.students.length}</span>
          <span className="text-[11px] font-[600] text-blue-600">● {data.classes.length} lớp đang hoạt động</span>
        </Card>
        <Card className="p-5 flex flex-col gap-2">
          <span className="text-[12px] text-slate-500 uppercase tracking-wide">Tổng chi phí</span>
          <span className="text-[24px] font-[700] text-slate-800">{formatCurrency(totalExpense)}</span>
          <span className="text-[11px] font-[600] text-slate-500">● {data.teachers.length} Giáo viên</span>
        </Card>
        <Card className="p-5 flex flex-col gap-2">
          <span className="text-[12px] text-slate-500 uppercase tracking-wide">Công nợ học phí</span>
          <span className={`text-[24px] font-[700] ${totalDebt > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
            {formatCurrency(totalDebt)}
          </span>
          <span className={`text-[11px] font-[600] ${totalDebt > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
            {totalDebt > 0 ? '⚠ Cần thu thêm' : '✓ Không có công nợ'}
          </span>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">
        <Card className="flex flex-col">
          <CardHeader>
            <span className="text-[16px] font-[600]">Việc cần xử lý</span>
            <span className="text-[12px] text-slate-400">{data.courses.length} khóa học • {data.lessons.filter(l => l.status === 'done').length} buổi đã dạy</span>
          </CardHeader>
          <div className="px-5 pb-5 grid grid-cols-2 md:grid-cols-3 gap-3">
            {todos.map(t => (
              <button key={t.label} onClick={() => onNavigate?.(t.tab)} className="text-left p-3 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/40 transition-colors">
                <div className={`text-[22px] font-bold ${t.count > 0 ? t.tone : 'text-slate-300'}`}>{t.count}</div>
                <div className="text-[12px] text-slate-500">{t.label}</div>
              </button>
            ))}
          </div>
        </Card>
        <Card className="flex flex-col">
          <CardHeader>
            <span className="text-[16px] font-[600]">Lịch học hôm nay ({todayLessons.length})</span>
          </CardHeader>
          <div className="px-5 pb-5 space-y-2 max-h-[220px] overflow-y-auto">
            {todayLessons.map(l => (
              <div key={l.id} className="flex justify-between items-center text-[13px] p-2 rounded-lg bg-slate-50">
                <span className="font-semibold text-slate-700">{l.startTime}–{l.endTime}</span>
                <span className="text-slate-600 truncate mx-2">{data.classes.find(c => c.id === l.classId)?.name} • {data.teachers.find(t => t.id === l.teacherId)?.name}</span>
                <span className={`text-[11px] font-semibold ${l.attendanceStatus === 'open' ? 'text-amber-600' : 'text-emerald-600'}`}>{l.attendanceStatus === 'open' ? 'Chưa ĐD' : 'Đã ĐD'}</span>
              </div>
            ))}
            {todayLessons.length === 0 && <div className="text-center text-slate-400 text-[13px] py-6">Hôm nay không có buổi học</div>}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5 min-h-[420px]">
        <Card className="flex flex-col">
          <CardHeader>
            <span className="text-[16px] font-[600]">Giao dịch gần đây</span>
          </CardHeader>
          <div className="px-5 pb-5 overflow-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-[12px] text-slate-500 font-medium py-2.5 border-b border-slate-100">Mô tả</th>
                  <th className="text-left text-[12px] text-slate-500 font-medium py-2.5 border-b border-slate-100">Danh mục</th>
                  <th className="text-left text-[12px] text-slate-500 font-medium py-2.5 border-b border-slate-100">Ngày</th>
                  <th className="text-right text-[12px] text-slate-500 font-medium py-2.5 border-b border-slate-100">Số tiền</th>
                  <th className="text-right text-[12px] text-slate-500 font-medium py-2.5 border-b border-slate-100">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.slice(0, 5).map(tx => (
                  <tr key={tx.id}>
                    <td className="py-3 text-[13px] border-b border-slate-50 text-slate-800">{tx.description || tx.category}</td>
                    <td className="py-3 text-[13px] border-b border-slate-50 text-slate-600">{tx.category}</td>
                    <td className="py-3 text-[13px] border-b border-slate-50 text-slate-600">{dayjs(tx.date).format('DD/MM/YYYY')}</td>
                    <td className="py-3 text-[13px] border-b border-slate-50 font-medium text-right text-slate-800">{formatCurrency(tx.amount)}</td>
                    <td className="py-3 text-[13px] border-b border-slate-50 text-right">
                      {tx.type === 'income' ?
                        <span className="px-2 py-0.5 rounded-[4px] text-[11px] font-[600] bg-[#dcfce7] text-[#166534]">Đã thu</span> :
                        <span className="px-2 py-0.5 rounded-[4px] text-[11px] font-[600] bg-slate-100 text-slate-600">Đã chi</span>
                      }
                    </td>
                  </tr>
                ))}
                {data.transactions.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-slate-400">Chưa có giao dịch nào</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <span className="text-[16px] font-[600]">Biến động doanh thu</span>
          </CardHeader>
          <div className="flex-1 px-5 pb-5 flex flex-col">
            <div className="flex-1 flex items-end gap-3 pt-5">
              {monthlyData.map((d, i) => (
                <div key={d.name} className="flex-1 relative rounded-t-[4px] min-h-[20px] group cursor-pointer transition-all hover:opacity-80" style={{ height: `${Math.max((d.value / maxMonthValue) * 100, 5)}%`, backgroundColor: i % 2 === 0 ? '#4A90E2' : '#93c5fd' }}>
                  <span className="absolute -bottom-[20px] left-1/2 -translate-x-1/2 text-[10px] text-slate-500">{d.name}</span>
                  <span className="absolute -top-[20px] left-1/2 -translate-x-1/2 text-[9px] text-slate-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">{d.value > 0 ? formatCurrency(d.value) : '0'}</span>
                </div>
              ))}
            </div>
            <div className="mt-[40px] text-[12px] text-slate-500">
              <div className="flex justify-between mb-1 text-slate-600 font-medium">
                <span>Mục tiêu lợi nhuận:</span>
                <span>{profitPercent}% ({formatCurrency(profit)} / {formatCurrency(profitTarget)})</span>
              </div>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${profitPercent >= 100 ? 'bg-emerald-500' : profitPercent >= 50 ? 'bg-accent' : 'bg-red-400'}`} style={{ width: `${profitPercent}%` }}></div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-auto p-4 sleek-ai-panel rounded-xl flex items-center gap-4 relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div className="w-10 h-10 rounded-[10px] flex shrink-0 items-center justify-center text-white font-bold bg-gradient-to-br from-primary to-accent shadow-sm z-10 cursor-pointer" onClick={getInsights}>
          ✨
        </div>
        <div className="text-[13px] leading-relaxed text-[#1e40af] z-10">
          {isLoadingAi ? 'Đang phân tích, vui lòng chờ...' : (
            aiInsight ? aiInsight : (
              <>
                <strong className="block mb-0.5 text-primary">Phân tích từ Gemini AI (Nhấn logo AI để chạy phân tích):</strong>
                Nhấn vào biểu tượng ✨ bên trái để Gemini AI phân tích tình hình tài chính thực tế của trung tâm dựa trên dữ liệu hiện có.
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
