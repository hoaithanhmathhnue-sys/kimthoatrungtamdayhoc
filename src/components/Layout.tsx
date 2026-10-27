import React, { useState, useMemo } from 'react';
import { LayoutDashboard, Users, GraduationCap, Calendar, Clock, BookMarked, DollarSign, Calculator, BarChart3, CalendarOff, History, Settings as SettingsIcon, Menu, X, Search, Library, ClipboardCheck, FileText, TrendingUp, MessagesSquare, Wallet, UserCircle, BadgeInfo, LogOut } from 'lucide-react';
import { AuthorModal } from './Author';
import { AUTHOR } from '../lib/author';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../store/AppContext';
import { parseRole, CENTER_NAME } from '../lib/academic';
import { DataState } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLock: () => void;
}

type RoleKind = 'manager' | 'teacher' | 'parent';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  group: string;
  roles: RoleKind[];
}

export const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard, group: 'Tổng quan', roles: ['manager'] },
  { id: 'portal', label: 'Cổng phụ huynh', icon: UserCircle, group: 'Tổng quan', roles: ['parent'] },
  { id: 'courses', label: 'Khóa học', icon: Library, group: 'Đào tạo', roles: ['manager'] },
  { id: 'classes', label: 'Lớp học', icon: Calendar, group: 'Đào tạo', roles: ['manager'] },
  { id: 'lessons', label: 'Lịch học & Điểm danh', icon: ClipboardCheck, group: 'Đào tạo', roles: ['manager', 'teacher'] },
  { id: 'timetable', label: 'Thời khóa biểu', icon: Clock, group: 'Đào tạo', roles: ['manager'] },
  { id: 'teachers', label: 'Giáo viên', icon: Users, group: 'Đào tạo', roles: ['manager'] },
  { id: 'students', label: 'Học viên', icon: GraduationCap, group: 'Đào tạo', roles: ['manager'] },
  { id: 'assessments', label: 'Bài tập & Kiểm tra', icon: FileText, group: 'Học tập', roles: ['manager', 'teacher'] },
  { id: 'grades', label: 'Kết quả HT', icon: BookMarked, group: 'Học tập', roles: ['manager', 'teacher'] },
  { id: 'progress', label: 'Tiến độ học tập', icon: TrendingUp, group: 'Học tập', roles: ['manager', 'teacher'] },
  { id: 'communication', label: 'Liên lạc & Phản hồi', icon: MessagesSquare, group: 'Liên lạc & Học vụ', roles: ['manager', 'teacher'] },
  { id: 'services', label: 'Học phí & Học vụ', icon: Wallet, group: 'Liên lạc & Học vụ', roles: ['manager'] },
  { id: 'holidays', label: 'Lịch nghỉ', icon: CalendarOff, group: 'Liên lạc & Học vụ', roles: ['manager'] },
  { id: 'finances', label: 'Tài chính', icon: DollarSign, group: 'Tài chính', roles: ['manager'] },
  { id: 'salary', label: 'Lương GV', icon: Calculator, group: 'Tài chính', roles: ['manager'] },
  { id: 'reports', label: 'Báo cáo', icon: BarChart3, group: 'Tài chính', roles: ['manager'] },
  { id: 'history', label: 'Lịch sử', icon: History, group: 'Hệ thống', roles: ['manager'] },
  { id: 'settings', label: 'Cài đặt', icon: SettingsIcon, group: 'Hệ thống', roles: ['manager'] },
  { id: 'author', label: 'Tác giả', icon: BadgeInfo, group: 'Hệ thống', roles: ['manager', 'teacher', 'parent'] },
];

export const getNavForRole = (role: string) => {
  const kind = parseRole(role).kind;
  return navItems.filter(n => n.roles.includes(kind));
};

// Số việc cần xử lý hiển thị cạnh menu
const getPendingCounts = (data: DataState): Record<string, number> => {
  const r = parseRole(data.settings.activeRole);
  const today = new Date().toISOString().slice(0, 10);
  if (r.kind === 'teacher') {
    const classIds = data.classes.filter(c => c.teacherId === r.id).map(c => c.id);
    return {
      lessons: data.lessons.filter(l => classIds.includes(l.classId) && l.attendanceStatus === 'open' && l.status !== 'cancelled' && l.date <= today).length,
      assessments: data.exams.filter(e => classIds.includes(e.classId) && e.status === 'rejected').length,
    };
  }
  if (r.kind === 'manager') {
    return {
      lessons: data.lessons.filter(l => l.attendanceStatus === 'submitted').length,
      assessments: data.exams.filter(e => e.status === 'pending').length,
      communication: data.feedbacks.filter(f => f.status === 'new').length,
      services: data.makeups.filter(m => m.status === 'pending').length,
    };
  }
  return {};
};

const SidebarNav: React.FC<{ items: NavItem[]; activeTab: string; onClick: (id: string) => void; counts: Record<string, number> }> = ({ items, activeTab, onClick, counts }) => {
  const groups = [...new Set(items.map(i => i.group))];
  return (
    <>
      {groups.map(g => (
        <div key={g} className="mb-1">
          {items.length > 3 && <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{g}</div>}
          {items.filter(i => i.group === g).map(item => (
            <button
              key={item.id}
              onClick={() => onClick(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 rounded-[10px] transition-colors duration-200 font-medium",
                activeTab === item.id
                  ? "bg-blue-50 text-primary"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              )}
            >
              <item.icon className="w-[18px] h-[18px] shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {!!counts[item.id] && <span className="px-1.5 min-w-[18px] text-center rounded-full bg-red-500 text-white text-[10px] leading-[18px]">{counts[item.id]}</span>}
            </button>
          ))}
        </div>
      ))}
    </>
  );
};

// Chuyển vai trò sử dụng: quản lý / giáo viên / phụ huynh
const RoleSwitcher: React.FC<{ className?: string }> = ({ className }) => {
  const { data, updateData } = useAppContext();
  return (
    <select
      title="Sử dụng với vai trò"
      className={cn("h-9 px-2 border border-slate-200 rounded-lg bg-white text-[13px] text-slate-700 max-w-[230px]", className)}
      value={data.settings.activeRole}
      onChange={e => updateData(prev => ({ settings: { ...prev.settings, activeRole: e.target.value } }))}
    >
      <option value="manager">👔 Quản lý trung tâm</option>
      {data.teachers.length > 0 && (
        <optgroup label="Giáo viên">
          {data.teachers.map(t => <option key={t.id} value={`teacher:${t.id}`}>👩‍🏫 GV {t.name}</option>)}
        </optgroup>
      )}
      {data.students.length > 0 && (
        <optgroup label="Phụ huynh / Học viên">
          {data.students.map(s => <option key={s.id} value={`parent:${s.id}`}>👪 {s.parentName || 'PH'} ({s.name})</option>)}
        </optgroup>
      )}
    </select>
  );
};

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab, onLock }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isAuthorOpen, setIsAuthorOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { data } = useAppContext();
  const visibleNav = getNavForRole(data.settings.activeRole);
  const counts = useMemo(() => getPendingCounts(data), [data]);
  const isManager = parseRole(data.settings.activeRole).kind === 'manager';

  const handleNavClick = (id: string) => {
    setActiveTab(id);
    setIsMobileMenuOpen(false);
  };

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const results: { type: string; name: string; detail: string; tab: string }[] = [];

    data.teachers.forEach(t => {
      if (t.name.toLowerCase().includes(q) || t.phone.includes(q)) {
        results.push({ type: '👨‍🏫 GV', name: t.name, detail: t.phone, tab: 'teachers' });
      }
    });
    data.students.forEach(s => {
      if (s.name.toLowerCase().includes(q) || s.phone.includes(q)) {
        results.push({ type: '🎓 HV', name: s.name, detail: s.phone, tab: 'students' });
      }
    });
    data.classes.forEach(c => {
      if (c.name.toLowerCase().includes(q) || c.subject.toLowerCase().includes(q) || (c.code && c.code.toLowerCase().includes(q))) {
        results.push({ type: '📚 Lớp', name: c.name, detail: c.subject, tab: 'classes' });
      }
    });
    data.courses.forEach(c => {
      if (c.name.toLowerCase().includes(q) || (c.code && c.code.toLowerCase().includes(q))) {
        results.push({ type: '📘 KH', name: c.name, detail: c.subject, tab: 'courses' });
      }
    });

    return results.slice(0, 8);
  }, [searchQuery, data]);

  const handleSearchSelect = (tab: string) => {
    setActiveTab(tab);
    setIsSearchOpen(false);
    setSearchQuery('');
  };

  return (
    <div className="flex h-screen bg-[#f4faf9] text-slate-800 overflow-hidden text-[14px]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-[250px] flex-col bg-white border-r border-[#e2e8f0] z-20 h-full">
        <div className="px-5 pt-5 pb-3 flex items-center gap-[10px] font-[800] tracking-tight leading-tight">
          <span className="text-[24px]">🎓</span>
          <div>
            <div className="text-[18px] sleek-gradient-text">TRI THỨC VIỆT</div>
            <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Dạy học & Đào tạo</div>
          </div>
        </div>

        <nav className="flex-1 px-3 overflow-y-auto">
          <SidebarNav items={visibleNav} activeTab={activeTab} onClick={handleNavClick} counts={counts} />
        </nav>

        <div className="p-3 mt-auto">
          <button onClick={() => setIsAuthorOpen(true)} title="Thông tin tác giả" className="w-full flex items-center gap-2.5 bg-slate-50 hover:bg-blue-50 border border-slate-100 p-2.5 rounded-xl text-left transition-colors">
            <img src={AUTHOR.avatar} alt="" className="w-9 h-9 rounded-full object-cover border-2 border-white shadow-sm" />
            <div className="min-w-0 leading-tight">
              <div className="text-[10px] text-slate-400 uppercase tracking-wide">Tác giả • v3.1</div>
              <div className="text-[12px] font-semibold text-slate-700 truncate">{AUTHOR.name}</div>
              <div className="text-[10px] text-slate-500 truncate">{AUTHOR.school}</div>
            </div>
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-30 flex items-center justify-between px-4 gap-2">
        <h1 className="text-[16px] font-bold sleek-gradient-text tracking-tight flex items-center gap-2 shrink-0">
          <span>🎓</span> TRI THỨC VIỆT
        </h1>
        <div className="flex items-center gap-1 min-w-0">
          <RoleSwitcher className="max-w-[130px]" />
          {isManager && (
            <button onClick={() => setIsSearchOpen(true)} className="p-2 text-slate-600">
              <Search className="w-5 h-5" />
            </button>
          )}
          <button onClick={onLock} className="p-2 text-slate-600" title="Khóa màn hình">
            <LogOut className="w-5 h-5" />
          </button>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-slate-600">
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Search Modal */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/50 flex items-start justify-center pt-[15vh]"
            onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
                <Search className="w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm giáo viên, học viên, lớp, khóa học..."
                  className="flex-1 text-[15px] outline-none bg-transparent text-slate-800 placeholder:text-slate-400"
                />
                <button onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {searchQuery.trim() && (
                <div className="max-h-[300px] overflow-y-auto">
                  {searchResults.length > 0 ? searchResults.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => handleSearchSelect(r.tab)}
                      className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors text-left"
                    >
                      <span className="text-[13px] font-medium text-slate-400 w-12">{r.type}</span>
                      <div>
                        <div className="text-[14px] font-medium text-slate-800">{r.name}</div>
                        <div className="text-[12px] text-slate-500">{r.detail}</div>
                      </div>
                    </button>
                  )) : (
                    <div className="px-5 py-8 text-center text-slate-400 text-[14px]">
                      Không tìm thấy kết quả cho "{searchQuery}"
                    </div>
                  )}
                </div>
              )}
              {!searchQuery.trim() && (
                <div className="px-5 py-6 text-center text-slate-400 text-[13px]">
                  Nhập tên giáo viên, học viên, lớp hoặc khóa học...
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AuthorModal open={isAuthorOpen} onClose={() => setIsAuthorOpen(false)} />

      {/* Mobile Menu Backdrop */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 z-20 bg-slate-900/50 pt-16"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <motion.nav
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className="w-3/4 max-w-sm h-full bg-white shadow-xl flex flex-col p-4 overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <SidebarNav items={visibleNav} activeTab={activeTab} onClick={handleNavClick} counts={counts} />
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden w-full lg:w-auto relative pt-16 lg:pt-0">
        <header className="hidden lg:flex h-[70px] px-6 items-center justify-between gap-4 bg-white border-b border-slate-200 shrink-0">
          <div className="text-[17px] font-semibold text-slate-800 truncate">
            {CENTER_NAME}
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <RoleSwitcher />
            {isManager && (
              <>
                <div className="text-slate-400 cursor-pointer hover:text-slate-600" onClick={() => setIsSearchOpen(true)}>
                  <Search className="w-5 h-5" />
                </div>
                <button className="text-slate-400 hover:text-slate-600 cursor-pointer" onClick={() => setActiveTab('settings')}>
                  <SettingsIcon className="w-[20px] h-[20px]" />
                </button>
              </>
            )}
            <button onClick={() => setIsAuthorOpen(true)} title="Tác giả" className="shrink-0">
              <img src={AUTHOR.avatar} alt="Tác giả" className="w-9 h-9 rounded-full object-cover border-2 border-slate-100" />
            </button>
            <button onClick={onLock} title="Khóa màn hình / Đăng xuất" className="flex items-center gap-1 text-[13px] text-slate-500 hover:text-red-600">
              <LogOut className="w-[18px] h-[18px]" /> Khóa
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-6 w-full h-full pb-8">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="max-w-7xl mx-auto flex flex-col h-full"
          >
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
};
