import React, { useState, useMemo } from 'react';
import { useAppContext } from '../store/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { History as HistoryIcon, Save, RotateCcw, Trash2, Download, Upload, Search, Clock, Database } from 'lucide-react';
import dayjs from 'dayjs';
import Swal from 'sweetalert2';
import { DataSnapshot } from '../types';

const ACTION_LABELS: Record<string, { label: string; color: string; icon: string }> = {
    add: { label: 'Thêm', color: 'bg-emerald-100 text-emerald-700', icon: '➕' },
    edit: { label: 'Sửa', color: 'bg-blue-100 text-blue-700', icon: '✏️' },
    delete: { label: 'Xóa', color: 'bg-red-100 text-red-700', icon: '🗑️' },
    import: { label: 'Import', color: 'bg-purple-100 text-purple-700', icon: '📥' },
    backup: { label: 'Sao lưu', color: 'bg-amber-100 text-amber-700', icon: '💾' },
    restore: { label: 'Khôi phục', color: 'bg-indigo-100 text-indigo-700', icon: '🔄' },
    paid: { label: 'Thanh toán', color: 'bg-emerald-100 text-emerald-700', icon: '💰' },
    attendance: { label: 'Điểm danh', color: 'bg-cyan-100 text-cyan-700', icon: '✅' },
};

const ENTITY_LABELS: Record<string, string> = {
    student: 'Học sinh', teacher: 'Giáo viên', class: 'Lớp học', transaction: 'Giao dịch',
    timetable: 'Thời khóa biểu', grade: 'Kết quả HT', salary: 'Lương GV',
    holiday: 'Ngày nghỉ', message: 'Thông báo', room: 'Phòng học', snapshot: 'Bản sao lưu',
    attendance: 'Điểm danh', system: 'Hệ thống',
};

const History: React.FC = () => {
    const { data, logActivity, saveSnapshot, restoreSnapshot, deleteSnapshot, getSnapshots, updateData } = useAppContext();
    const [activeTab, setActiveTab] = useState<'logs' | 'snapshots'>('logs');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterEntity, setFilterEntity] = useState('all');
    const [snapshotName, setSnapshotName] = useState('');
    const [snapshots, setSnapshots] = useState<DataSnapshot[]>(() => getSnapshots());

    // Refresh snapshots
    const refreshSnapshots = () => setSnapshots(getSnapshots());

    // Filtered logs
    const filteredLogs = useMemo(() => {
        let logs = data.activityLogs || [];
        if (filterEntity !== 'all') logs = logs.filter(l => l.entity === filterEntity);
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            logs = logs.filter(l => l.entityName.toLowerCase().includes(q) || l.details?.toLowerCase().includes(q) || l.entity.toLowerCase().includes(q));
        }
        return logs;
    }, [data.activityLogs, filterEntity, searchQuery]);

    // Entity types that exist in logs
    const logEntities = useMemo(() => {
        const entities = [...new Set((data.activityLogs || []).map(l => l.entity))];
        return entities.sort();
    }, [data.activityLogs]);

    // Save snapshot
    const handleSaveSnapshot = () => {
        const name = snapshotName.trim() || `Bản sao ${dayjs().format('DD/MM HH:mm')}`;
        saveSnapshot(name);
        logActivity('backup', 'snapshot', name, `Đã lưu phiên dữ liệu`);
        setSnapshotName('');
        refreshSnapshots();
        Swal.fire({ title: 'Đã lưu!', text: `Bản sao lưu "${name}" đã được tạo`, icon: 'success', timer: 1500, showConfirmButton: false });
    };

    // Restore snapshot
    const handleRestore = (snap: DataSnapshot) => {
        Swal.fire({
            title: 'Khôi phục dữ liệu?',
            html: `Bản sao: <b>${snap.name}</b><br/>Lúc: ${snap.createdAt}<br/><br/>⚠️ Dữ liệu hiện tại sẽ bị thay thế. Hãy lưu phiên trước nếu cần.`,
            icon: 'warning', showCancelButton: true, confirmButtonText: 'Khôi phục', cancelButtonText: 'Hủy',
            confirmButtonColor: '#4f46e5'
        }).then(r => {
            if (r.isConfirmed) {
                restoreSnapshot(snap.id);
                logActivity('restore', 'snapshot', snap.name, `Khôi phục từ bản sao "${snap.name}" tạo lúc ${snap.createdAt}`);
                Swal.fire({ title: 'Đã khôi phục!', icon: 'success', timer: 1500, showConfirmButton: false });
            }
        });
    };

    // Delete snapshot  
    const handleDeleteSnap = (snap: DataSnapshot) => {
        deleteSnapshot(snap.id);
        refreshSnapshots();
    };

    // Export data as JSON file
    const handleExportData = () => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `TriThucViet_Backup_${dayjs().format('YYYYMMDD_HHmm')}.json`;
        a.click();
        URL.revokeObjectURL(url);
        logActivity('backup', 'system', 'Xuất file JSON', 'Đã xuất toàn bộ dữ liệu ra file JSON');
    };

    // Import data from JSON file
    const handleImportData = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const imported = JSON.parse(ev.target?.result as string);
                    if (imported.teachers && imported.students) {
                        Swal.fire({
                            title: 'Import dữ liệu?',
                            text: 'Dữ liệu hiện tại sẽ bị thay thế bởi file đã chọn.',
                            icon: 'question', showCancelButton: true, confirmButtonText: 'Import', cancelButtonText: 'Hủy'
                        }).then(r => {
                            if (r.isConfirmed) {
                                updateData(() => imported);
                                logActivity('import', 'system', file.name, 'Đã import dữ liệu từ file JSON');
                                Swal.fire({ title: 'Thành công!', icon: 'success', timer: 1500, showConfirmButton: false });
                            }
                        });
                    } else {
                        Swal.fire('Lỗi', 'File không hợp lệ', 'error');
                    }
                } catch { Swal.fire('Lỗi', 'Không đọc được file JSON', 'error'); }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    // Clear logs
    const handleClearLogs = () => {
        Swal.fire({ title: 'Xóa toàn bộ lịch sử?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy' }).then(r => {
            if (r.isConfirmed) updateData({ activityLogs: [] });
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-2">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <HistoryIcon className="w-7 h-7 text-primary" /> Lịch sử & Sao lưu
                </h2>
                <div className="flex gap-2">
                    <button onClick={() => setActiveTab('logs')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'logs' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                        <Clock className="w-4 h-4 inline mr-1" /> Lịch sử
                    </button>
                    <button onClick={() => { setActiveTab('snapshots'); refreshSnapshots(); }} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'snapshots' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                        <Database className="w-4 h-4 inline mr-1" /> Sao lưu
                    </button>
                </div>
            </div>

            {activeTab === 'logs' && (
                <>
                    {/* Filters */}
                    <div className="flex gap-3 flex-wrap items-center">
                        <div className="relative flex-1 max-w-xs">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Tìm trong lịch sử..." className="pl-9 h-9" />
                        </div>
                        <select className="h-9 px-3 border border-slate-300 rounded-lg text-sm bg-white" value={filterEntity} onChange={e => setFilterEntity(e.target.value)}>
                            <option value="all">Tất cả loại</option>
                            {logEntities.map(e => <option key={e} value={e}>{ENTITY_LABELS[e] || e}</option>)}
                        </select>
                        <span className="text-sm text-slate-500">{filteredLogs.length} bản ghi</span>
                        {(data.activityLogs?.length || 0) > 0 && (
                            <Button variant="outline" size="sm" className="text-red-500 border-red-200 hover:bg-red-50 gap-1 ml-auto" onClick={handleClearLogs}>
                                <Trash2 className="w-3.5 h-3.5" /> Xóa lịch sử
                            </Button>
                        )}
                    </div>

                    <Card>
                        <div className="max-h-[500px] overflow-y-auto divide-y divide-slate-100">
                            {filteredLogs.map(log => {
                                const a = ACTION_LABELS[log.action] || { label: log.action, color: 'bg-slate-100 text-slate-600', icon: '📝' };
                                return (
                                    <div key={log.id} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50">
                                        <span className="text-lg mt-0.5">{a.icon}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${a.color}`}>{a.label}</span>
                                                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium">{ENTITY_LABELS[log.entity] || log.entity}</span>
                                                <span className="text-sm font-medium text-slate-800 truncate">{log.entityName}</span>
                                            </div>
                                            {log.details && <div className="text-xs text-slate-500 mt-0.5 truncate">{log.details}</div>}
                                        </div>
                                        <span className="text-[11px] text-slate-400 whitespace-nowrap mt-1">{dayjs(log.timestamp).format('DD/MM HH:mm')}</span>
                                    </div>
                                );
                            })}
                            {filteredLogs.length === 0 && (
                                <div className="px-6 py-12 text-center text-slate-400">
                                    {(data.activityLogs?.length || 0) === 0 ? 'Chưa có hoạt động nào được ghi nhận.' : 'Không tìm thấy kết quả.'}
                                </div>
                            )}
                        </div>
                    </Card>
                </>
            )}

            {activeTab === 'snapshots' && (
                <>
                    {/* Save snapshot */}
                    <Card className="border-blue-200">
                        <CardContent className="pt-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <h4 className="font-semibold text-sm text-slate-700 mb-3 flex items-center gap-2"><Save className="w-4 h-4 text-blue-600" /> Lưu phiên hiện tại</h4>
                                    <div className="flex gap-2">
                                        <Input value={snapshotName} onChange={e => setSnapshotName(e.target.value)} placeholder={`VD: Trước khi sửa TKB...`} className="flex-1" />
                                        <Button onClick={handleSaveSnapshot} className="gap-1.5"><Save className="w-4 h-4" /> Lưu</Button>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-2">Tối đa 10 bản sao lưu. Bản cũ nhất sẽ tự xóa.</p>
                                </div>
                                <div>
                                    <h4 className="font-semibold text-sm text-slate-700 mb-3 flex items-center gap-2"><Download className="w-4 h-4 text-emerald-600" /> Xuất / Nhập file</h4>
                                    <div className="flex gap-2">
                                        <Button variant="outline" onClick={handleExportData} className="gap-1.5"><Download className="w-4 h-4" /> Xuất JSON</Button>
                                        <Button variant="outline" onClick={handleImportData} className="gap-1.5"><Upload className="w-4 h-4" /> Nhập JSON</Button>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-2">Lưu ra file để chuyển máy hoặc backup ngoài.</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Snapshot list */}
                    <Card>
                        <CardHeader><CardTitle className="text-sm">Các bản sao lưu ({snapshots.length}/10)</CardTitle></CardHeader>
                        <CardContent>
                            {snapshots.length > 0 ? (
                                <div className="space-y-2">
                                    {snapshots.map((snap, i) => {
                                        let info = '';
                                        try {
                                            const d = JSON.parse(snap.data);
                                            info = `${d.students?.length || 0} HS • ${d.teachers?.length || 0} GV • ${d.classes?.length || 0} lớp • ${d.transactions?.length || 0} GD`;
                                        } catch { info = ''; }

                                        return (
                                            <div key={snap.id} className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50">
                                                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold">{i + 1}</div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium text-slate-800 text-sm truncate">{snap.name}</div>
                                                    <div className="text-xs text-slate-500">{snap.createdAt} — {info}</div>
                                                </div>
                                                <div className="flex gap-1.5 flex-shrink-0">
                                                    <Button size="sm" className="gap-1 h-7 text-xs bg-indigo-600 hover:bg-indigo-700" onClick={() => handleRestore(snap)}>
                                                        <RotateCcw className="w-3 h-3" /> Khôi phục
                                                    </Button>
                                                    <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600 px-1.5 h-7" onClick={() => handleDeleteSnap(snap)}>
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center text-slate-400 py-8">Chưa có bản sao lưu nào. Nhấn "Lưu" để tạo bản đầu tiên.</div>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
};

export default History;
