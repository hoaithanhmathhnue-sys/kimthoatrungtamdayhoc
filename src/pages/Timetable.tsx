import React, { useState, useMemo } from 'react';
import { useAppContext } from '../store/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { TimetableSlot, SessionPeriod, SessionSlotIndex } from '../types';
import { Plus, Trash2, Edit2, Clock, MapPin, X, Settings2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import Swal from 'sweetalert2';

const DAYS = [
    { value: 2, label: 'Hai' },
    { value: 3, label: 'Ba' },
    { value: 4, label: 'Tư' },
    { value: 5, label: 'Năm' },
    { value: 6, label: 'Sáu' },
    { value: 7, label: 'Bảy' },
    { value: 8, label: 'CN' },
];

const PERIODS: { value: SessionPeriod; label: string }[] = [
    { value: 'morning', label: 'Sáng' },
    { value: 'afternoon', label: 'Chiều' },
];

const SLOT_INDICES: SessionSlotIndex[] = [1, 2, 3];

const DEFAULT_SUBJECTS = ['Toán', 'Lý', 'Hóa', 'Sinh', 'Anh', 'Văn', 'Sử', 'Địa', 'GDCD', 'Tin học'];

const subjectColors: Record<string, string> = {
    'Toán': 'text-blue-700', 'Lý': 'text-purple-700', 'Hóa': 'text-red-600',
    'Sinh': 'text-green-700', 'Anh': 'text-amber-700', 'Văn': 'text-pink-600',
    'Sử': 'text-orange-600', 'Địa': 'text-teal-700', 'GDCD': 'text-indigo-600', 'Tin học': 'text-cyan-700',
};
const getSubjectColor = (s: string) => subjectColors[s] || 'text-slate-700';

const subjectBgColors: Record<string, string> = {
    'Toán': 'bg-blue-50', 'Lý': 'bg-purple-50', 'Hóa': 'bg-red-50',
    'Sinh': 'bg-green-50', 'Anh': 'bg-amber-50', 'Văn': 'bg-pink-50',
    'Sử': 'bg-orange-50', 'Địa': 'bg-teal-50', 'GDCD': 'bg-indigo-50', 'Tin học': 'bg-cyan-50',
};
const getSubjectBg = (s: string) => subjectBgColors[s] || '';

const Timetable: React.FC = () => {
    const { data, updateData } = useAppContext();
    const [isAddingRoom, setIsAddingRoom] = useState(false);
    const [newRoomName, setNewRoomName] = useState('');
    const [isAddingSlot, setIsAddingSlot] = useState(false);
    const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
    const [isEditingTimes, setIsEditingTimes] = useState(false);
    const [slotForm, setSlotForm] = useState<Partial<TimetableSlot>>({
        dayOfWeek: 2, period: 'afternoon', slotIndex: 3, roomId: '', classId: '', teacherId: '', subject: ''
    });

    // Get slot time string from settings
    const getSlotTime = (period: SessionPeriod, idx: SessionSlotIndex) => {
        const st = data.settings.slotTimes?.[period]?.[String(idx)];
        if (st) return `${st.start}-${st.end}`;
        return '';
    };

    const allSubjects = useMemo(() => {
        const used = data.classes.map(c => c.subject).filter(Boolean);
        return [...new Set([...DEFAULT_SUBJECTS, ...used])].sort();
    }, [data.classes]);

    // ===== Room CRUD =====
    const handleAddRoom = () => {
        if (!newRoomName.trim()) return Swal.fire('Lỗi', 'Vui lòng nhập tên phòng', 'error');
        updateData(prev => ({ rooms: [...prev.rooms, { id: uuidv4(), name: newRoomName.trim() }] }));
        setNewRoomName('');
        setIsAddingRoom(false);
    };

    const handleRenameRoom = (roomId: string, current: string) => {
        Swal.fire({ title: 'Đổi tên phòng', input: 'text', inputValue: current, showCancelButton: true, confirmButtonText: 'Lưu', cancelButtonText: 'Hủy' }).then(r => {
            if (r.isConfirmed && String(r.value || '').trim()) {
                updateData(prev => ({ rooms: prev.rooms.map(rm => rm.id === roomId ? { ...rm, name: String(r.value).trim() } : rm) }));
            }
        });
    };

    const handleDeleteRoom = (roomId: string) => {
        const slotsInRoom = data.timetableSlots.filter(s => s.roomId === roomId).length;
        Swal.fire({
            title: 'Xóa phòng học?',
            text: slotsInRoom > 0 ? `Phòng này có ${slotsInRoom} tiết. Xóa phòng sẽ xóa luôn các tiết.` : '',
            icon: 'warning', showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy'
        }).then(r => {
            if (r.isConfirmed) {
                updateData(prev => ({
                    rooms: prev.rooms.filter(rm => rm.id !== roomId),
                    timetableSlots: prev.timetableSlots.filter(s => s.roomId !== roomId)
                }));
            }
        });
    };

    // ===== Slot Time Customization =====
    const handleSlotTimeChange = (period: SessionPeriod, idx: string, field: 'start' | 'end', value: string) => {
        updateData(prev => ({
            settings: {
                ...prev.settings,
                slotTimes: {
                    ...prev.settings.slotTimes,
                    [period]: {
                        ...prev.settings.slotTimes[period],
                        [idx]: { ...prev.settings.slotTimes[period][idx], [field]: value }
                    }
                }
            }
        }));
    };

    // ===== Slot CRUD =====
    const openAddSlot = (dayOfWeek?: number, period?: SessionPeriod, slotIndex?: SessionSlotIndex, roomId?: string) => {
        setEditingSlotId(null);
        setSlotForm({
            dayOfWeek: dayOfWeek || 2, period: period || 'afternoon', slotIndex: slotIndex || 3,
            roomId: roomId || data.rooms[0]?.id || '', classId: '', teacherId: '', subject: ''
        });
        setIsAddingSlot(true);
    };

    const openEditSlot = (slot: TimetableSlot) => {
        setEditingSlotId(slot.id);
        setSlotForm({ ...slot });
        setIsAddingSlot(true);
    };

    const handleCancelSlot = () => { setIsAddingSlot(false); setEditingSlotId(null); };

    const handleSaveSlot = () => {
        if (!slotForm.roomId) return Swal.fire('Lỗi', 'Vui lòng chọn phòng', 'error');
        if (!slotForm.classId && !slotForm.subject) return Swal.fire('Lỗi', 'Vui lòng chọn lớp hoặc môn', 'error');

        const conflict = data.timetableSlots.find(s =>
            s.id !== editingSlotId && s.roomId === slotForm.roomId &&
            s.dayOfWeek === slotForm.dayOfWeek && s.period === slotForm.period && s.slotIndex === slotForm.slotIndex
        );
        if (conflict) return Swal.fire('Trùng lịch!', `Phòng đã có lớp tại ca này.`, 'error');

        if (slotForm.teacherId) {
            const tc = data.timetableSlots.find(s =>
                s.id !== editingSlotId && s.teacherId === slotForm.teacherId &&
                s.dayOfWeek === slotForm.dayOfWeek && s.period === slotForm.period && s.slotIndex === slotForm.slotIndex
            );
            if (tc) { const t = data.teachers.find(t => t.id === slotForm.teacherId); return Swal.fire('Trùng GV!', `GV ${t?.name} đã dạy ca này.`, 'error'); }
        }

        if (editingSlotId) {
            updateData(prev => ({ timetableSlots: prev.timetableSlots.map(s => s.id === editingSlotId ? { ...s, ...slotForm } as TimetableSlot : s) }));
        } else {
            updateData(prev => ({ timetableSlots: [...prev.timetableSlots, { ...slotForm, id: uuidv4() } as TimetableSlot] }));
        }
        Swal.fire({ title: 'Thành công', icon: 'success', timer: 1200, showConfirmButton: false });
        handleCancelSlot();
    };

    const handleDeleteSlot = (slotId: string) => {
        Swal.fire({ title: 'Xóa tiết?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy' }).then(r => {
            if (r.isConfirmed) updateData(prev => ({ timetableSlots: prev.timetableSlots.filter(s => s.id !== slotId) }));
        });
    };

    const handleClassSelect = (classId: string) => {
        const cls = data.classes.find(c => c.id === classId);
        if (cls) setSlotForm({ ...slotForm, classId, teacherId: cls.teacherId, subject: cls.subject });
        else setSlotForm({ ...slotForm, classId });
    };

    // Build grid data
    const rooms = data.rooms;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-2">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Clock className="w-7 h-7 text-primary" /> Thời Khóa Biểu
                </h2>
                <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => setIsEditingTimes(!isEditingTimes)} className="gap-1.5">
                        <Settings2 className="w-4 h-4" /> {isEditingTimes ? '✕ Đóng' : 'Chỉnh giờ ca'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setIsAddingRoom(!isAddingRoom)} className="gap-1.5">
                        <MapPin className="w-4 h-4" /> {isAddingRoom ? '✕ Đóng' : 'Quản lý Phòng'}
                    </Button>
                    <Button size="sm" onClick={() => isAddingSlot ? handleCancelSlot() : openAddSlot()} className="gap-1.5">
                        {isAddingSlot ? '✕ Hủy' : <><Plus className="w-4 h-4" /> Thêm Tiết</>}
                    </Button>
                </div>
            </div>

            {/* Slot Time Customization */}
            {isEditingTimes && (
                <Card className="border-amber-200">
                    <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Settings2 className="w-4 h-4 text-amber-600" /> Tùy chỉnh giờ các ca dạy</CardTitle></CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {PERIODS.map(period => (
                                <div key={period.value}>
                                    <h4 className={`font-semibold text-sm mb-3 ${period.value === 'morning' ? 'text-amber-700' : 'text-indigo-700'}`}>
                                        {period.value === 'morning' ? '☀' : '🌙'} Buổi {period.label}
                                    </h4>
                                    <div className="space-y-2">
                                        {SLOT_INDICES.map(idx => {
                                            const st = data.settings.slotTimes?.[period.value]?.[String(idx)] || { start: '', end: '' };
                                            return (
                                                <div key={idx} className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-slate-600 w-12">Ca {idx}:</span>
                                                    <input type="time" value={st.start} onChange={e => handleSlotTimeChange(period.value, String(idx), 'start', e.target.value)}
                                                        className="h-8 px-2 border border-slate-300 rounded text-sm w-[110px]" />
                                                    <span className="text-slate-400">→</span>
                                                    <input type="time" value={st.end} onChange={e => handleSlotTimeChange(period.value, String(idx), 'end', e.target.value)}
                                                        className="h-8 px-2 border border-slate-300 rounded text-sm w-[110px]" />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Room Management */}
            {isAddingRoom && (
                <Card className="border-blue-200">
                    <CardContent className="pt-5 space-y-3">
                        <div className="flex gap-3 items-end">
                            <div className="flex-1">
                                <label className="text-sm font-medium text-slate-700">Tên phòng mới</label>
                                <Input value={newRoomName} onChange={e => setNewRoomName(e.target.value)} placeholder="VD: Phòng 6" />
                            </div>
                            <Button onClick={handleAddRoom}>Thêm</Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {rooms.map(rm => (
                                <div key={rm.id} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                    <span className="font-medium text-slate-700">{rm.name}</span>
                                    <button onClick={() => handleRenameRoom(rm.id, rm.name)} title="Sửa tên phòng" className="text-blue-500 hover:text-blue-700"><Edit2 className="w-3 h-3" /></button>
                                    <button onClick={() => handleDeleteRoom(rm.id)} title="Xóa phòng" className="text-red-400 hover:text-red-600"><X className="w-3 h-3" /></button>
                                </div>
                            ))}
                            {rooms.length === 0 && <span className="text-sm text-slate-400 italic">Chưa có phòng</span>}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Add/Edit Slot Form */}
            {isAddingSlot && (
                <Card className="border-blue-200">
                    <CardHeader><CardTitle className="text-sm">{editingSlotId ? 'Chỉnh sửa Tiết học' : 'Thêm Tiết học'}</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                            <div>
                                <label className="text-xs font-medium text-slate-600">Thứ *</label>
                                <select className="w-full h-9 px-2 border border-slate-300 rounded-lg text-sm" value={slotForm.dayOfWeek} onChange={e => setSlotForm({ ...slotForm, dayOfWeek: Number(e.target.value) })}>
                                    {DAYS.map(d => <option key={d.value} value={d.value}>Thứ {d.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600">Buổi *</label>
                                <select className="w-full h-9 px-2 border border-slate-300 rounded-lg text-sm" value={slotForm.period} onChange={e => setSlotForm({ ...slotForm, period: e.target.value as SessionPeriod })}>
                                    {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600">Ca *</label>
                                <select className="w-full h-9 px-2 border border-slate-300 rounded-lg text-sm" value={slotForm.slotIndex} onChange={e => setSlotForm({ ...slotForm, slotIndex: Number(e.target.value) as SessionSlotIndex })}>
                                    {SLOT_INDICES.map(i => <option key={i} value={i}>Ca {i} ({getSlotTime(slotForm.period as SessionPeriod || 'morning', i)})</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600">Phòng *</label>
                                <select className="w-full h-9 px-2 border border-slate-300 rounded-lg text-sm" value={slotForm.roomId} onChange={e => setSlotForm({ ...slotForm, roomId: e.target.value })}>
                                    <option value="">-- Phòng --</option>
                                    {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600">Lớp</label>
                                <select className="w-full h-9 px-2 border border-slate-300 rounded-lg text-sm" value={slotForm.classId} onChange={e => handleClassSelect(e.target.value)}>
                                    <option value="">-- Lớp --</option>
                                    {data.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600">Môn</label>
                                <select className="w-full h-9 px-2 border border-slate-300 rounded-lg text-sm" value={slotForm.subject} onChange={e => setSlotForm({ ...slotForm, subject: e.target.value })}>
                                    <option value="">-- Môn --</option>
                                    {allSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600">Giáo viên</label>
                                <select className="w-full h-9 px-2 border border-slate-300 rounded-lg text-sm" value={slotForm.teacherId} onChange={e => setSlotForm({ ...slotForm, teacherId: e.target.value })}>
                                    <option value="">-- GV --</option>
                                    {data.teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={handleCancelSlot}>Hủy</Button>
                            <Button size="sm" onClick={handleSaveSlot}>{editingSlotId ? 'Cập nhật' : 'Lưu'}</Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ===== Main Timetable Grid (like the image) ===== */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-center text-lg">THỜI KHÓA BIỂU KHỐI</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse border border-slate-300">
                            <thead>
                                <tr className="bg-slate-50">
                                    <th className="border border-slate-300 px-2 py-2 text-center font-semibold text-slate-700 w-[50px]">Thứ</th>
                                    <th className="border border-slate-300 px-1 py-2 text-center font-semibold text-slate-700 w-[28px]">Ca</th>
                                    <th className="border border-slate-300 px-1 py-2 text-center font-semibold text-slate-700 w-[80px]">Thời gian</th>
                                    {rooms.map(rm => (
                                        <th key={rm.id} className="border border-slate-300 px-2 py-2 text-center font-semibold text-blue-700 min-w-[130px]">{rm.name}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {DAYS.map(day => {
                                    // Only show slots that actually exist for this day, or all periods
                                    const daySlots = PERIODS.flatMap(period =>
                                        SLOT_INDICES.map(idx => ({ period: period.value as SessionPeriod, idx }))
                                    );

                                    return daySlots.map((slot, rowIdx) => {
                                        const timeStr = getSlotTime(slot.period, slot.idx);
                                        const isFirst = rowIdx === 0;
                                        const totalRows = daySlots.length;

                                        return (
                                            <tr key={`${day.value}-${slot.period}-${slot.idx}`} className={`${isFirst ? 'border-t-2 border-t-slate-400' : ''} hover:bg-slate-50/50`}>
                                                {isFirst && (
                                                    <td rowSpan={totalRows} className="border border-slate-300 px-2 py-1 text-center font-bold text-slate-800 align-middle bg-slate-50 text-sm">
                                                        {day.label}
                                                    </td>
                                                )}
                                                <td className="border border-slate-300 px-1 py-1 text-center font-semibold text-slate-600">
                                                    {slot.idx}
                                                </td>
                                                <td className="border border-slate-300 px-1 py-1 text-center text-slate-500 whitespace-nowrap">
                                                    {timeStr}
                                                </td>
                                                {rooms.map(rm => {
                                                    const cellSlot = data.timetableSlots.find(s =>
                                                        s.dayOfWeek === day.value && s.period === slot.period &&
                                                        s.slotIndex === slot.idx && s.roomId === rm.id
                                                    );
                                                    if (!cellSlot) {
                                                        return (
                                                            <td key={rm.id} className="border border-slate-300 px-1 py-1 text-center cursor-pointer hover:bg-blue-50/50 group"
                                                                onClick={() => openAddSlot(day.value, slot.period, slot.idx, rm.id)}>
                                                                <span className="text-transparent group-hover:text-blue-300 text-[10px]">+ thêm</span>
                                                            </td>
                                                        );
                                                    }

                                                    const cls = data.classes.find(c => c.id === cellSlot.classId);
                                                    const teacher = data.teachers.find(t => t.id === cellSlot.teacherId);
                                                    const displayName = cls?.name || cellSlot.subject;
                                                    const teacherShort = teacher ? `C. ${teacher.name.split(' ').pop()}` : '';
                                                    const colorCls = getSubjectColor(cellSlot.subject);
                                                    const bgCls = getSubjectBg(cellSlot.subject);

                                                    return (
                                                        <td key={rm.id} className={`border border-slate-300 px-1.5 py-1 ${bgCls} group relative`}>
                                                            <div className={`font-bold ${colorCls} text-[11px] leading-tight`}>
                                                                {displayName}
                                                            </div>
                                                            {teacherShort && (
                                                                <div className={`${colorCls} text-[10px] opacity-80`}>
                                                                    {teacherShort}
                                                                </div>
                                                            )}
                                                            {/* Edit/Delete on hover */}
                                                            <div className="absolute top-0 right-0 hidden group-hover:flex gap-0.5 bg-white/90 rounded-bl p-0.5 shadow-sm">
                                                                <button onClick={() => openEditSlot(cellSlot)} className="text-blue-500 hover:text-blue-700 p-0.5">
                                                                    <Edit2 className="w-3 h-3" />
                                                                </button>
                                                                <button onClick={() => handleDeleteSlot(cellSlot.id)} className="text-red-400 hover:text-red-600 p-0.5">
                                                                    <Trash2 className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    });
                                })}
                            </tbody>
                        </table>
                    </div>
                    {rooms.length === 0 && (
                        <div className="py-12 text-center text-slate-400 text-sm">
                            Chưa có phòng học. Nhấn "Quản lý Phòng" để thêm phòng trước.
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default Timetable;
