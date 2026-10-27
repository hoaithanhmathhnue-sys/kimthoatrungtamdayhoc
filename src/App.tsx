/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useState } from 'react';
import { AppProvider, useAppContext } from './store/AppContext';
import { Layout, getNavForRole } from './components/Layout';
import Dashboard from './pages/Dashboard';
import Teachers from './pages/Teachers';
import Students from './pages/Students';
import Classes from './pages/Classes';
import Courses from './pages/Courses';
import Lessons from './pages/Lessons';
import Assessments from './pages/Assessments';
import Progress from './pages/Progress';
import Communication from './pages/Communication';
import StudentServices from './pages/StudentServices';
import ParentPortal from './pages/ParentPortal';
import Timetable from './pages/Timetable';
import Grades from './pages/Grades';
import Finances from './pages/Finances';
import Salary from './pages/Salary';
import Reports from './pages/Reports';
import HolidayMessages from './pages/HolidayMessages';
import History from './pages/History';
import Settings from './pages/Settings';
import AuthorPage from './components/Author';
import LoginScreen from './components/LoginScreen';
import { isUnlocked, setUnlocked } from './lib/auth';

function AppContent({ onLock }: { onLock: () => void }) {
  const { data } = useAppContext();
  const [activeTab, setActiveTab] = useState('dashboard');
  const allowedTabs = getNavForRole(data.settings.activeRole).map(n => n.id);

  // Đổi vai trò → chuyển về trang đầu tiên được phép xem
  useEffect(() => {
    if (!allowedTabs.includes(activeTab)) setActiveTab(allowedTabs[0]);
  }, [data.settings.activeRole]); // eslint-disable-line react-hooks/exhaustive-deps

  const tab = allowedTabs.includes(activeTab) ? activeTab : allowedTabs[0];

  const renderContent = () => {
    switch (tab) {
      case 'dashboard': return <Dashboard onNavigate={setActiveTab} />;
      case 'portal': return <ParentPortal />;
      case 'courses': return <Courses />;
      case 'teachers': return <Teachers />;
      case 'students': return <Students />;
      case 'classes': return <Classes />;
      case 'lessons': return <Lessons />;
      case 'timetable': return <Timetable />;
      case 'assessments': return <Assessments />;
      case 'grades': return <Grades />;
      case 'progress': return <Progress />;
      case 'communication': return <Communication />;
      case 'services': return <StudentServices />;
      case 'finances': return <Finances />;
      case 'salary': return <Salary />;
      case 'reports': return <Reports />;
      case 'holidays': return <HolidayMessages />;
      case 'history': return <History />;
      case 'settings': return <Settings />;
      case 'author': return <AuthorPage />;
      default: return <Dashboard onNavigate={setActiveTab} />;
    }
  };

  return (
    <Layout activeTab={tab} setActiveTab={setActiveTab} onLock={onLock}>
      {/* key theo vai trò để trang được khởi tạo lại khi đổi người dùng */}
      <React.Fragment key={data.settings.activeRole}>{renderContent()}</React.Fragment>
    </Layout>
  );
}

export default function App() {
  // Màn hình đăng nhập: phiên mở khóa giữ trong tab hiện tại (sessionStorage)
  const [unlocked, setUnlockedState] = useState(isUnlocked);
  const unlock = () => { setUnlocked(true); setUnlockedState(true); };
  const lock = () => { setUnlocked(false); setUnlockedState(false); };

  if (!unlocked) return <LoginScreen onSuccess={unlock} />;
  return (
    <AppProvider>
      <AppContent onLock={lock} />
    </AppProvider>
  );
}
