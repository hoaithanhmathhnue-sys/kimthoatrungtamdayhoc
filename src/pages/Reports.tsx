import React, { useMemo, useState } from 'react';
import { useAppContext } from '../store/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { formatCurrency } from '../lib/utils';
import { BarChart3, TrendingUp, Users, GraduationCap, Calendar, DollarSign, BookMarked } from 'lucide-react';
import dayjs from 'dayjs';

const Reports: React.FC = () => {
    const { data } = useAppContext();
    const [reportMonth, setReportMonth] = useState(dayjs().format('YYYY-MM'));

    const monthTx = data.transactions.filter(t => t.date.startsWith(reportMonth));
    const monthIncome = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const monthExpense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const monthProfit = monthIncome - monthExpense;

    const monthAttendances = data.attendances.filter(a => a.date.startsWith(reportMonth));
    const monthPresent = monthAttendances.filter(a => a.status === 'present').length;
    const monthAbsent = monthAttendances.filter(a => a.status === 'absent').length;
    const attendanceRate = monthAttendances.length > 0 ? Math.round((monthPresent / monthAttendances.length) * 100) : 0;

    const monthGrades = data.grades.filter(g => g.date.startsWith(reportMonth));
    const avgGrade = monthGrades.length > 0 ? (monthGrades.reduce((s, g) => s + g.score, 0) / monthGrades.length).toFixed(1) : '-';

    // New students this month
    const newStudents = data.students.filter(s => s.joinDate.startsWith(reportMonth)).length;

    // Revenue by category
    const categoryMap = new Map<string, number>();
    monthTx.filter(t => t.type === 'income').forEach(t => {
        categoryMap.set(t.category, (categoryMap.get(t.category) || 0) + t.amount);
    });
    const categories = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1]);

    // Expense by category
    const expenseMap = new Map<string, number>();
    monthTx.filter(t => t.type === 'expense').forEach(t => {
        expenseMap.set(t.category, (expenseMap.get(t.category) || 0) + t.amount);
    });
    const expenses = Array.from(expenseMap.entries()).sort((a, b) => b[1] - a[1]);

    // Monthly trend (last 6 months)
    const trendData = useMemo(() => {
        const result: { month: string; income: number; expense: number }[] = [];
        for (let i = 5; i >= 0; i--) {
            const m = dayjs().subtract(i, 'month').format('YYYY-MM');
            const mTx = data.transactions.filter(t => t.date.startsWith(m));
            result.push({
                month: 'T' + (Number(m.split('-')[1])),
                income: mTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
                expense: mTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
            });
        }
        return result;
    }, [data.transactions]);
    const maxTrend = Math.max(...trendData.map(d => Math.max(d.income, d.expense)), 1);

    // Top students by attendance
    const topStudents = useMemo(() => {
        return data.students.map(s => {
            const present = data.attendances.filter(a => a.studentId === s.id && a.date.startsWith(reportMonth) && a.status === 'present').length;
            const total = data.attendances.filter(a => a.studentId === s.id && a.date.startsWith(reportMonth)).length;
            return { student: s, present, total, rate: total > 0 ? Math.round((present / total) * 100) : 0 };
        }).sort((a, b) => b.rate - a.rate).slice(0, 5);
    }, [data, reportMonth]);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <BarChart3 className="w-7 h-7 text-primary" /> Báo cáo Tổng hợp
                </h2>
                <Input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} className="w-[160px]" />
            </div>

            {/* Overview Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <Card className="p-4">
                    <div className="text-xs text-slate-500 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Doanh thu</div>
                    <div className="text-lg font-bold text-emerald-600 mt-1">{formatCurrency(monthIncome)}</div>
                </Card>
                <Card className="p-4">
                    <div className="text-xs text-slate-500 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Chi phí</div>
                    <div className="text-lg font-bold text-rose-600 mt-1">{formatCurrency(monthExpense)}</div>
                </Card>
                <Card className="p-4">
                    <div className="text-xs text-slate-500 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Lợi nhuận</div>
                    <div className={`text-lg font-bold mt-1 ${monthProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(monthProfit)}</div>
                </Card>
                <Card className="p-4">
                    <div className="text-xs text-slate-500 flex items-center gap-1"><Calendar className="w-3 h-3" /> Chuyên cần</div>
                    <div className="text-lg font-bold text-blue-600 mt-1">{attendanceRate}%</div>
                </Card>
                <Card className="p-4">
                    <div className="text-xs text-slate-500 flex items-center gap-1"><GraduationCap className="w-3 h-3" /> HS mới</div>
                    <div className="text-lg font-bold text-slate-800 mt-1">{newStudents}</div>
                </Card>
                <Card className="p-4">
                    <div className="text-xs text-slate-500 flex items-center gap-1"><BookMarked className="w-3 h-3" /> Điểm TB</div>
                    <div className="text-lg font-bold text-purple-600 mt-1">{avgGrade}</div>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Revenue Trend */}
                <Card>
                    <CardHeader><CardTitle className="text-sm">Xu hướng Thu - Chi (6 tháng gần nhất)</CardTitle></CardHeader>
                    <CardContent>
                        <div className="flex items-end gap-2 h-[180px]">
                            {trendData.map((d, i) => (
                                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                    <div className="w-full flex gap-0.5 items-end h-[140px]">
                                        <div className="flex-1 bg-emerald-400 rounded-t transition-all" style={{ height: `${(d.income / maxTrend) * 100}%`, minHeight: d.income > 0 ? '4px' : '0' }}></div>
                                        <div className="flex-1 bg-rose-400 rounded-t transition-all" style={{ height: `${(d.expense / maxTrend) * 100}%`, minHeight: d.expense > 0 ? '4px' : '0' }}></div>
                                    </div>
                                    <span className="text-[10px] text-slate-500">{d.month}</span>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-4 mt-4 justify-center text-xs text-slate-500">
                            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-400 rounded"></span> Thu</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-rose-400 rounded"></span> Chi</span>
                        </div>
                    </CardContent>
                </Card>

                {/* Category breakdown */}
                <Card>
                    <CardHeader><CardTitle className="text-sm">Phân loại Doanh thu</CardTitle></CardHeader>
                    <CardContent>
                        {categories.length > 0 ? (
                            <div className="space-y-3">
                                {categories.map(([cat, amount]) => (
                                    <div key={cat}>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-slate-700 font-medium">{cat}</span>
                                            <span className="text-emerald-600 font-bold">{formatCurrency(amount)}</span>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-2">
                                            <div className="h-2 bg-emerald-500 rounded-full" style={{ width: `${(amount / monthIncome) * 100}%` }}></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : <div className="text-center text-slate-400 py-8">Chưa có doanh thu</div>}
                    </CardContent>
                </Card>

                {/* Top Attendance */}
                <Card>
                    <CardHeader><CardTitle className="text-sm">Top Chuyên cần ({reportMonth})</CardTitle></CardHeader>
                    <CardContent>
                        {topStudents.length > 0 ? (
                            <div className="space-y-2">
                                {topStudents.map((d, i) => (
                                    <div key={d.student.id} className="flex items-center gap-3">
                                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-400' : 'bg-orange-400'}`}>{i + 1}</span>
                                        <span className="flex-1 text-sm font-medium text-slate-700">{d.student.name}</span>
                                        <span className="text-sm text-slate-500">{d.present}/{d.total}</span>
                                        <span className={`text-sm font-bold ${d.rate >= 80 ? 'text-emerald-600' : d.rate >= 50 ? 'text-amber-600' : 'text-red-500'}`}>{d.rate}%</span>
                                    </div>
                                ))}
                            </div>
                        ) : <div className="text-center text-slate-400 py-8">Chưa có dữ liệu</div>}
                    </CardContent>
                </Card>

                {/* Expense breakdown */}
                <Card>
                    <CardHeader><CardTitle className="text-sm">Phân loại Chi phí</CardTitle></CardHeader>
                    <CardContent>
                        {expenses.length > 0 ? (
                            <div className="space-y-3">
                                {expenses.map(([cat, amount]) => (
                                    <div key={cat}>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-slate-700 font-medium">{cat}</span>
                                            <span className="text-rose-600 font-bold">{formatCurrency(amount)}</span>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-2">
                                            <div className="h-2 bg-rose-500 rounded-full" style={{ width: `${(amount / monthExpense) * 100}%` }}></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : <div className="text-center text-slate-400 py-8">Chưa có chi phí</div>}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default Reports;
