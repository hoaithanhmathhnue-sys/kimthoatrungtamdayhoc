import React from 'react';
import { MapPin, School, GraduationCap, Heart, X, Award } from 'lucide-react';
import { AUTHOR } from '../lib/author';
import { CENTER_NAME } from '../lib/academic';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

const FEATURES = [
  'Quản lý khóa học, lớp, lịch học, giáo viên và học viên',
  'Giáo viên điểm danh từng buổi; quản lý kiểm tra và duyệt',
  'Theo dõi bài tập, kết quả kiểm tra, tiến độ và số buổi còn lại',
  'Liên lạc với học viên / người giám hộ, tiếp nhận và xử lý phản hồi',
  'Học phí, học bù, chuyển lớp, bảo lưu theo quy định trung tâm',
];

// Thẻ thông tin tác giả dùng chung cho cửa sổ và trang "Tác giả"
export const AuthorProfile: React.FC = () => (
  <div className="space-y-5">
    <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100">
      <div className="relative shrink-0">
        <img src={AUTHOR.avatar} alt={`Ảnh tác giả ${AUTHOR.name}`} className="w-32 h-32 rounded-2xl object-cover border-4 border-white shadow-md" />
        <span className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-amber-400 text-white flex items-center justify-center shadow"><GraduationCap className="w-5 h-5" /></span>
      </div>
      <div className="text-center sm:text-left">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">Giáo viên phát triển</div>
        <div className="text-2xl font-bold text-slate-800">{AUTHOR.name}</div>
        <div className="text-sm text-slate-600 mt-1">{AUTHOR.role}</div>
        <div className="flex items-center gap-2 mt-2 justify-center sm:justify-start text-slate-700 font-semibold">
          <img src={AUTHOR.logo} alt="Logo tác giả" className="w-7 h-7 rounded bg-white border border-slate-200 object-contain" />
          <School className="w-4 h-4 text-amber-500" /> {AUTHOR.school}
        </div>
        <div className="flex items-start gap-1.5 mt-1.5 text-sm text-slate-500 justify-center sm:justify-start">
          <MapPin className="w-4 h-4 mt-0.5 text-emerald-500 shrink-0" /> {AUTHOR.address}
        </div>
      </div>
    </div>

    <div className="p-4 rounded-2xl border border-slate-100 bg-white">
      <div className="flex items-center gap-2 font-semibold text-slate-700 mb-2"><Heart className="w-4 h-4 text-rose-500" /> Sứ mệnh ứng dụng</div>
      <p className="text-sm text-slate-600 leading-relaxed">
        Ứng dụng <b>{CENTER_NAME}</b> được phát triển nhằm chuyển đổi số công tác quản lý đào tạo: giúp trung tâm, giáo viên và
        phụ huynh cùng theo dõi việc học của học viên một cách minh bạch, kịp thời và chính xác.
      </p>
      <ul className="mt-3 grid sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-slate-600">
        {FEATURES.map(f => <li key={f} className="flex gap-2"><Award className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />{f}</li>)}
      </ul>
    </div>
    <div className="text-center text-xs text-slate-400">© {AUTHOR.year} • Bản quyền thuộc về tác giả {AUTHOR.name} — {AUTHOR.school}</div>
  </div>
);

export const AuthorModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl my-8 p-6" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"><X className="w-5 h-5" /></button>
        <div className="text-center mb-5">
          <span className="inline-block px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-[11px] font-semibold text-blue-700 uppercase tracking-wider">Thông tin tác giả & bản quyền</span>
          <h3 className="text-2xl font-bold text-slate-800 mt-2">Tác giả ứng dụng</h3>
          <p className="text-sm text-slate-500">Sản phẩm chuyển đổi số trong quản lý dạy học và đào tạo</p>
        </div>
        <AuthorProfile />
        <Button onClick={onClose} className="w-full mt-5 h-11">Đóng cửa sổ</Button>
      </div>
    </div>
  );
};

// Trang "Tác giả" trong menu
const AuthorPage: React.FC = () => (
  <div className="space-y-5 max-w-3xl">
    <div>
      <h2 className="text-2xl font-bold text-slate-800">Tác giả</h2>
      <p className="text-sm text-slate-500 mt-1">Thông tin tác giả và bản quyền ứng dụng</p>
    </div>
    <Card className="p-6"><AuthorProfile /></Card>
  </div>
);

export default AuthorPage;
