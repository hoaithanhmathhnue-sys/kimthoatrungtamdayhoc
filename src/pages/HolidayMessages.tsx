import React, { useState } from 'react';
import { useAppContext } from '../store/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Holiday, ParentMessage } from '../types';
import { CalendarOff, Plus, Trash2, Bell, Edit2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import Swal from 'sweetalert2';
import { buildMessage, greetingFor, resolveRecipient, CENTER_SHORT_NAME } from '../lib/academic';

const HolidayMessages: React.FC = () => {
    const { data, updateData, logActivity } = useAppContext();
    const [isAddingHoliday, setIsAddingHoliday] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [holidayForm, setHolidayForm] = useState<Partial<Holiday>>({
        name: '', startDate: dayjs().format('YYYY-MM-DD'), endDate: dayjs().format('YYYY-MM-DD'), note: ''
    });

    // Holiday CRUD
    const handleSaveHoliday = () => {
        if (!holidayForm.name) return Swal.fire('Lỗi', 'Vui lòng nhập tên ngày nghỉ', 'error');
        if ((holidayForm.endDate || '') < (holidayForm.startDate || '')) return Swal.fire('Lỗi', 'Ngày kết thúc phải sau ngày bắt đầu', 'error');
        updateData(prev => ({
            holidays: editingId
                ? prev.holidays.map(h => h.id === editingId ? { ...h, ...holidayForm } as Holiday : h)
                : [...prev.holidays, { ...holidayForm, id: uuidv4() } as Holiday]
        }));
        setIsAddingHoliday(false);
        setEditingId(null);
        setHolidayForm({ name: '', startDate: dayjs().format('YYYY-MM-DD'), endDate: dayjs().format('YYYY-MM-DD'), note: '' });
        Swal.fire('Thành công', editingId ? 'Đã cập nhật ngày nghỉ' : 'Đã thêm ngày nghỉ', 'success');
    };

    const openEdit = (h: Holiday) => {
        setEditingId(h.id);
        setHolidayForm({ ...h });
        setIsAddingHoliday(true);
    };

    const toggleAdd = () => {
        if (isAddingHoliday) { setIsAddingHoliday(false); setEditingId(null); return; }
        setEditingId(null);
        setHolidayForm({ name: '', startDate: dayjs().format('YYYY-MM-DD'), endDate: dayjs().format('YYYY-MM-DD'), note: '' });
        setIsAddingHoliday(true);
    };

    const deleteHoliday = (h: Holiday) => {
        Swal.fire({ title: `Xóa ngày nghỉ "${h.name}"?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy' }).then(r => {
            if (r.isConfirmed) updateData(prev => ({ holidays: prev.holidays.filter(x => x.id !== h.id) }));
        });
    };

    const lessonsInHoliday = (h: Holiday) => data.lessons.filter(l => l.status === 'scheduled' && l.date >= h.startDate && l.date <= h.endDate);

    // Thông báo lịch nghỉ đến học viên/người giám hộ phù hợp, đồng thời hủy các buổi học trùng ngày nghỉ
    const notifyHoliday = (h: Holiday) => {
        const active = data.students.filter(s => s.applicationStatus !== 'inactive');
        const affected = lessonsInHoliday(h);
        Swal.fire({
            title: `Thông báo nghỉ "${h.name}"?`,
            html: `Gửi đến ${active.length} học viên/người giám hộ.${affected.length ? `<br/>${affected.length} buổi học trùng ngày nghỉ sẽ được chuyển sang "Đã hủy".` : ''}`,
            icon: 'question', showCancelButton: true, confirmButtonText: 'Gửi thông báo', cancelButtonText: 'Hủy'
        }).then(r => {
            if (!r.isConfirmed) return;
            const range = h.startDate === h.endDate ? `ngày ${dayjs(h.startDate).format('DD/MM/YYYY')}` : `từ ${dayjs(h.startDate).format('DD/MM')} đến hết ${dayjs(h.endDate).format('DD/MM/YYYY')}`;
            const msgs: ParentMessage[] = active.map(s => {
                const rcp = resolveRecipient(s);
                return buildMessage(s, 'schedule', `${greetingFor(s, rcp)},\n${CENTER_SHORT_NAME} thông báo lịch nghỉ ${h.name} ${range}.${h.note ? ` ${h.note}.` : ''} Các buổi học sẽ tiếp tục theo lịch sau kỳ nghỉ. Trân trọng!`, { title: `Lịch nghỉ: ${h.name}`, recipient: rcp, sender: 'Quản lý' });
            });
            const ids = new Set(affected.map(l => l.id));
            updateData(prev => ({
                parentMessages: [...prev.parentMessages, ...msgs],
                lessons: prev.lessons.map(l => ids.has(l.id) ? { ...l, status: 'cancelled', teacherNote: `Nghỉ ${h.name}` } : l),
            }));
            logActivity('add', 'message', h.name, `Thông báo lịch nghỉ tới ${msgs.length} HV`);
            Swal.fire('Đã gửi', `${msgs.length} thông báo lịch nghỉ.`, 'success');
        });
    };

    // Upcoming holidays
    const upcomingHolidays = data.holidays.filter(h => h.endDate >= dayjs().format('YYYY-MM-DD')).sort((a, b) => a.startDate.localeCompare(b.startDate));
    const pastHolidays = data.holidays.filter(h => h.endDate < dayjs().format('YYYY-MM-DD'));

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center gap-3">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Lịch nghỉ</h2>
                    <p className="text-sm text-slate-500 mt-1">Ngày nghỉ được bỏ qua khi tạo lịch học tự động. Các thông báo khác soạn tại mục Liên lạc & Phản hồi.</p>
                </div>
                <Button onClick={toggleAdd} className="gap-2 shrink-0">
                    {isAddingHoliday ? '✕ Hủy' : <><Plus className="w-4 h-4" /> Thêm ngày nghỉ</>}
                </Button>
            </div>

            {isAddingHoliday && (
                <Card className="border-blue-200">
                    <CardContent className="pt-6 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div><label className="text-sm font-medium text-slate-700">Tên ngày nghỉ *</label><Input value={holidayForm.name} onChange={e => setHolidayForm({ ...holidayForm, name: e.target.value })} placeholder="Tết Nguyên Đán, 30/4..." /></div>
                            <div><label className="text-sm font-medium text-slate-700">Từ ngày</label><Input type="date" value={holidayForm.startDate} onChange={e => setHolidayForm({ ...holidayForm, startDate: e.target.value })} /></div>
                            <div><label className="text-sm font-medium text-slate-700">Đến ngày</label><Input type="date" value={holidayForm.endDate} onChange={e => setHolidayForm({ ...holidayForm, endDate: e.target.value })} /></div>
                            <div><label className="text-sm font-medium text-slate-700">Ghi chú</label><Input value={holidayForm.note} onChange={e => setHolidayForm({ ...holidayForm, note: e.target.value })} /></div>
                        </div>
                        <div className="flex justify-end gap-3"><Button variant="outline" onClick={() => { setIsAddingHoliday(false); setEditingId(null); }}>Hủy</Button><Button onClick={handleSaveHoliday}>{editingId ? 'Cập nhật' : 'Lưu'}</Button></div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader><CardTitle className="text-sm text-emerald-700 flex items-center gap-2"><CalendarOff className="w-4 h-4" /> Sắp tới ({upcomingHolidays.length})</CardTitle></CardHeader>
                    <CardContent>
                        {upcomingHolidays.length > 0 ? (
                            <div className="space-y-3">
                                {upcomingHolidays.map(h => {
                                    const affected = lessonsInHoliday(h).length;
                                    return (
                                        <div key={h.id} className="flex items-center justify-between gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                                            <div>
                                                <div className="font-medium text-slate-800">{h.name}</div>
                                                <div className="text-xs text-slate-500 mt-0.5">{dayjs(h.startDate).format('DD/MM')} → {dayjs(h.endDate).format('DD/MM/YYYY')}{h.note ? ` • ${h.note}` : ''}{affected ? ` • ${affected} buổi học trùng` : ''}</div>
                                            </div>
                                            <div className="flex gap-1 shrink-0">
                                                <Button variant="outline" size="sm" className="gap-1 h-7" onClick={() => notifyHoliday(h)}><Bell className="w-3.5 h-3.5" /> Thông báo</Button>
                                                <Button variant="ghost" size="sm" className="text-blue-500 hover:text-blue-700 px-1 h-7" title="Sửa" onClick={() => openEdit(h)}><Edit2 className="w-3.5 h-3.5" /></Button>
                                                <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600 px-1 h-7" title="Xóa" onClick={() => deleteHoliday(h)}><Trash2 className="w-3.5 h-3.5" /></Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : <div className="text-center text-slate-400 py-6">Không có ngày nghỉ sắp tới</div>}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle className="text-sm text-slate-500 flex items-center gap-2"><CalendarOff className="w-4 h-4" /> Đã qua ({pastHolidays.length})</CardTitle></CardHeader>
                    <CardContent>
                        {pastHolidays.length > 0 ? (
                            <div className="space-y-2">
                                {pastHolidays.slice(0, 5).map(h => (
                                    <div key={h.id} className="flex items-center justify-between gap-2 p-2 text-sm text-slate-500">
                                        <span className="flex-1">{h.name}</span>
                                        <span className="text-xs">{dayjs(h.startDate).format('DD/MM')} - {dayjs(h.endDate).format('DD/MM')}</span>
                                        <button title="Sửa" onClick={() => openEdit(h)} className="text-blue-500 hover:text-blue-700 p-1"><Edit2 className="w-3.5 h-3.5" /></button>
                                        <button title="Xóa" onClick={() => deleteHoliday(h)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                ))}
                            </div>
                        ) : <div className="text-center text-slate-400 py-6">Chưa có</div>}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default HolidayMessages;
