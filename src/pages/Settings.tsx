import React, { useState } from 'react';
import { useAppContext } from '../store/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Settings as SettingsIcon, Save, Key, Database, RefreshCcw } from 'lucide-react';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';

const Settings: React.FC = () => {
  const { data, updateData, resetData } = useAppContext();
  const [apiKey, setApiKey] = useState(data.settings.geminiApiKey);

  const handleSaveAI = () => {
    updateData(prev => ({
      settings: { ...prev.settings, geminiApiKey: apiKey }
    }));
    Swal.fire('Thành công', 'Đã lưu cấu hình AI', 'success');
  };

  const handleReset = () => {
    Swal.fire({
      title: 'Khôi phục dữ liệu mẫu?',
      text: 'Toàn bộ dữ liệu hiện tại sẽ bị xóa sạch và thay thế bằng dữ liệu demo.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Đồng ý xóa'
    }).then(res => {
      if(res.isConfirmed) {
        resetData();
        Swal.fire('Đã khôi phục', 'Dữ liệu đã được nạp lại.', 'success');
      }
    });
  };

  const downloadBackup = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const dt = new Date().getTime();
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", `TriThucViet_Backup_${dt}.json`);
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <SettingsIcon className="w-8 h-8 text-slate-800" />
        <h2 className="text-2xl font-bold text-slate-800">Cài đặt Hệ thống</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Key className="w-5 h-5 text-blue-600"/> Cấu hình Gemini AI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">
            Cung cấp API Key từ Google AI Studio để hệ thống có thể sử dụng các tính năng phân tích tài chính thông minh.
            API Key được lưu an toàn trong trình duyệt của bạn (Local Storage).
          </p>
          <div className="flex gap-4 max-w-2xl">
            <Input 
              type="password" 
              placeholder="Nhập Gemini API Key (Bắt đầu bằng AIzaSy...)" 
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
            <Button onClick={handleSaveAI} className="gap-2 px-8"><Save className="w-4 h-4"/> Lưu</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Database className="w-5 h-5 text-orange-600"/> Quản lý Dữ liệu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4">
            <Button variant="outline" onClick={downloadBackup} className="gap-2">Tải file Backup (JSON)</Button>
            <Button variant="danger" className="gap-2" onClick={handleReset}><RefreshCcw className="w-4 h-4" /> Khôi phục dữ liệu Demo</Button>
          </div>
          <p className="text-xs text-slate-500">
            Hệ thống lưu trữ 100% dữ liệu trực tiếp trong trình duyệt của bạn. Để tránh mất mát, hãy xuất backup định kỳ.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
