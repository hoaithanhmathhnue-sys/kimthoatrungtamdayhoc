import React, { useState, useMemo } from 'react';
import { useAppContext } from '../store/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { GradeRecord } from '../types';
import { Plus, Trash2, BookMarked, Award, TrendingUp, Edit2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import Swal from 'sweetalert2';

const EXAM_TYPES = ['Kiểm tra miệng', 'Kiểm tra 15 phút', 'Kiểm tra 1 tiết', 'Thi cuối kỳ'];
const DEFAULT_SUBJECTS = ['Toán', 'Lý', 'Hóa', 'Sinh', 'Anh', 'Văn', 'Sử', 'Địa', 'GDCD', 'Tin học'];

const Grades: React.FC = () => {
    const { data, updateData } = useAppContext();
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [filterStudent, setFilterStudent] = useState<string>('all');
    const [filterClass, setFilterClass] = useState<string>('all');
    const [formData, setFormData] = useState<Partial<GradeRecord>>({
        studentId: '', classId: '', subject: '', examType: EXAM_TYPES[0], score: 0, date: dayjs().format('YYYY-MM-DD'), note: ''
    });

    const allSubjects = useMemo(() => {
        const used = data.classes.map(c => c.subject).filter(Boolean);
        return [...new Set([...DEFAULT_SUBJECTS, ...used])].sort();
    }, [data.classes]);

    const handleClassSelect = (classId: string) => {
        const cls = data.classes.find(c => c.id === classId);
        setFormData({ ...formData, classId, subject: cls?.subject || '' });
    };

    const handleSave = () => {
        if (!formData.studentId || !formData.subject) return Swal.fire('Lỗi', 'Vui lòng chọn học sinh và môn', 'error');
        if (formData.score === undefined || formData.score < 0 || formData.score > 10) return Swal.fire('Lỗi', 'Điểm phải từ 0 đến 10', 'error');

        updateData(prev => ({
            grades: editingId
                ? prev.grades.map(g => g.id === editingId ? { ...g, ...formData } as GradeRecord : g)
                : [...prev.grades, { ...formData, id: uuidv4() } as GradeRecord]
        }));
        setIsAdding(false);
        setEditingId(null);
        setFormData({ studentId: '', classId: '', subject: '', examType: EXAM_TYPES[0], score: 0, date: dayjs().format('YYYY-MM-DD'), note: '' });
        Swal.fire('Thành công', editingId ? 'Đã cập nhật kết quả' : 'Đã lưu kết quả', 'success');
    };

    const openEdit = (g: GradeRecord) => {
        setEditingId(g.id);
        setFormData({ ...g });
        setIsAdding(true);
    };

    const openAdd = () => {
        if (isAdding) { setIsAdding(false); setEditingId(null); return; }
        setEditingId(null);
        setFormData({ studentId: '', classId: '', subject: '', examType: EXAM_TYPES[0], score: 0, date: dayjs().format('YYYY-MM-DD'), note: '' });
        setIsAdding(true);
    };

    const handleDelete = (id: string) => {
        Swal.fire({ title: 'Xóa kết quả?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy' }).then(r => {
            if (r.isConfirmed) updateData(prev => ({ grades: prev.grades.filter(g => g.id !== id) }));
        });
    };

    const filteredGrades = useMemo(() => {
        let result = data.grades;
        if (filterStudent !== 'all') result = result.filter(g => g.studentId === filterStudent);
        if (filterClass !== 'all') result = result.filter(g => g.classId === filterClass);
        return result.sort((a, b) => b.date.localeCompare(a.date));
    }, [data.grades, filterStudent, filterClass]);

    // Stats
    const avgScore = filteredGrades.length > 0 ? (filteredGrades.reduce((s, g) => s + g.score, 0) / filteredGrades.length).toFixed(1) : '-';
    const excellent = filteredGrades.filter(g => g.score >= 8).length;
    const poor = filteredGrades.filter(g => g.score < 5).length;

    const getScoreColor = (score: number) => {
        if (score >= 8) return 'text-emerald-600 bg-emerald-50';
        if (score >= 6.5) return 'text-blue-600 bg-blue-50';
        if (score >= 5) return 'text-amber-600 bg-amber-50';
        return 'text-red-600 bg-red-50';
    };

    const getGrade = (score: number) => {
        if (score >= 8) return 'Giỏi';
        if (score >= 6.5) return 'Khá';
        if (score >= 5) return 'TB';
        return 'Yếu';
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <BookMarked className="w-7 h-7 text-primary" /> Kết quả Học tập
                </h2>
                <Button onClick={openAdd} className="gap-2">
                    {isAdding ? '✕ Hủy' : <><Plus className="w-4 h-4" /> Nhập điểm</>}
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="p-4">
                    <div className="text-xs text-slate-500 uppercase">Tổng bài KT</div>
                    <div className="text-xl font-bold text-slate-800 mt-1">{filteredGrades.length}</div>
                </Card>
                <Card className="p-4">
                    <div className="text-xs text-slate-500 uppercase">Điểm TB</div>
                    <div className="text-xl font-bold text-blue-600 mt-1">{avgScore}</div>
                </Card>
                <Card className="p-4">
                    <div className="text-xs text-slate-500 uppercase flex items-center gap-1"><Award className="w-3 h-3" /> Giỏi (≥8)</div>
                    <div className="text-xl font-bold text-emerald-600 mt-1">{excellent}</div>
                </Card>
                <Card className="p-4">
                    <div className="text-xs text-slate-500 uppercase flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Yếu (&lt;5)</div>
                    <div className="text-xl font-bold text-red-500 mt-1">{poor}</div>
                </Card>
            </div>

            {isAdding && (
                <Card className="border-blue-200">
                    <CardHeader><CardTitle>{editingId ? 'Sửa kết quả kiểm tra' : 'Nhập Điểm Kiểm Tra'}</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <label className="text-sm font-medium text-slate-700">Học sinh *</label>
                                <select className="w-full h-10 px-3 py-2 border border-slate-300 rounded-lg text-sm" value={formData.studentId} onChange={e => setFormData({ ...formData, studentId: e.target.value })}>
                                    <option value="">-- Chọn HS --</option>
                                    {data.students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-700">Lớp</label>
                                <select className="w-full h-10 px-3 py-2 border border-slate-300 rounded-lg text-sm" value={formData.classId} onChange={e => handleClassSelect(e.target.value)}>
                                    <option value="">-- Chọn Lớp --</option>
                                    {data.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-700">Môn *</label>
                                <select className="w-full h-10 px-3 py-2 border border-slate-300 rounded-lg text-sm" value={formData.subject} onChange={e => setFormData({ ...formData, subject: e.target.value })}>
                                    <option value="">-- Chọn Môn --</option>
                                    {allSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-700">Hình thức KT</label>
                                <select className="w-full h-10 px-3 py-2 border border-slate-300 rounded-lg text-sm" value={formData.examType} onChange={e => setFormData({ ...formData, examType: e.target.value })}>
                                    {EXAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-700">Điểm (0-10) *</label>
                                <Input type="number" min={0} max={10} step={0.5} value={formData.score} onChange={e => setFormData({ ...formData, score: Number(e.target.value) })} />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-700">Ngày KT</label>
                                <Input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                            </div>
                            <div className="lg:col-span-2">
                                <label className="text-sm font-medium text-slate-700">Ghi chú</label>
                                <Input value={formData.note} onChange={e => setFormData({ ...formData, note: e.target.value })} placeholder="Nhận xét..." />
                            </div>
                        </div>
                        <div className="flex justify-end pt-4 gap-3">
                            <Button variant="outline" onClick={() => { setIsAdding(false); setEditingId(null); }}>Hủy bỏ</Button>
                            <Button onClick={handleSave}>{editingId ? 'Cập nhật' : 'Lưu điểm'}</Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
                <select className="h-9 px-3 border border-slate-300 rounded-lg text-sm bg-white" value={filterStudent} onChange={e => setFilterStudent(e.target.value)}>
                    <option value="all">Tất cả HS</option>
                    {data.students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select className="h-9 px-3 border border-slate-300 rounded-lg text-sm bg-white" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
                    <option value="all">Tất cả lớp</option>
                    {data.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </div>

            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-600 font-medium border-b">
                            <tr>
                                <th className="px-5 py-3">Ngày</th>
                                <th className="px-5 py-3">Học sinh</th>
                                <th className="px-5 py-3">Lớp</th>
                                <th className="px-5 py-3">Môn</th>
                                <th className="px-5 py-3">Hình thức</th>
                                <th className="px-5 py-3 text-center">Điểm</th>
                                <th className="px-5 py-3 text-center">Xếp loại</th>
                                <th className="px-5 py-3">Ghi chú</th>
                                <th className="px-5 py-3 w-20"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredGrades.map(g => (
                                <tr key={g.id} className="hover:bg-slate-50">
                                    <td className="px-5 py-3 text-slate-600">{dayjs(g.date).format('DD/MM/YYYY')}</td>
                                    <td className="px-5 py-3 font-medium text-slate-800">{data.students.find(s => s.id === g.studentId)?.name || '?'}</td>
                                    <td className="px-5 py-3 text-slate-600">{data.classes.find(c => c.id === g.classId)?.name || '-'}</td>
                                    <td className="px-5 py-3"><span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded text-xs font-medium">{g.subject}</span></td>
                                    <td className="px-5 py-3 text-slate-600 text-xs">{g.examType}</td>
                                    <td className="px-5 py-3 text-center">
                                        <span className={`px-2.5 py-1 rounded-lg text-sm font-bold ${getScoreColor(g.score)}`}>{g.score}</span>
                                    </td>
                                    <td className="px-5 py-3 text-center text-xs font-medium text-slate-600">{getGrade(g.score)}</td>
                                    <td className="px-5 py-3 text-slate-500 text-xs max-w-[150px] truncate">{g.note || '-'}</td>
                                    <td className="px-5 py-3 whitespace-nowrap">
                                        <Button variant="ghost" size="sm" className="text-blue-500 hover:text-blue-700 px-1 h-7" title="Sửa" onClick={() => openEdit(g)}>
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600 px-1 h-7" title="Xóa" onClick={() => handleDelete(g.id)}>
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            {filteredGrades.length === 0 && (
                                <tr><td colSpan={9} className="px-6 py-8 text-center text-slate-400">Chưa có kết quả nào</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default Grades;
