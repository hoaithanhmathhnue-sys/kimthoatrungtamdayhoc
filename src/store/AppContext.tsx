import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { DataState, ActivityLog, DataSnapshot } from '../types';
import { mockData, defaultPolicies } from '../data/mock';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';

interface AppContextType {
  data: DataState;
  updateData: (newData: Partial<DataState> | ((prev: DataState) => Partial<DataState>)) => void;
  resetData: () => void;
  logActivity: (action: string, entity: string, entityName: string, details?: string) => void;
  saveSnapshot: (name: string) => void;
  restoreSnapshot: (snapshotId: string) => void;
  deleteSnapshot: (snapshotId: string) => void;
  getSnapshots: () => DataSnapshot[];
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Giữ nguyên khóa lưu trữ cũ để không mất dữ liệu sau khi đổi tên trung tâm
const STORAGE_KEY = 'chithanh_center_data';
const SNAPSHOTS_KEY = 'chithanh_snapshots';
const MAX_LOGS = 500; // Keep last 500 activity logs

const ARRAY_KEYS = [
  'teachers', 'students', 'classes', 'enrollments', 'attendances', 'transactions', 'grades', 'holidays',
  'parentMessages', 'salaryRecords', 'activityLogs', 'courses', 'lessons', 'assignments', 'submissions',
  'exams', 'feedbacks', 'makeups', 'transfers', 'reservations',
] as const;

// Migration: đảm bảo dữ liệu cũ (localStorage, file backup, snapshot) có đủ các trường mới
export function normalizeData(raw: any): DataState {
  const parsed = { ...raw };
  ARRAY_KEYS.forEach(k => { if (!Array.isArray(parsed[k])) parsed[k] = []; });
  if (!Array.isArray(parsed.rooms)) parsed.rooms = mockData.rooms;
  if (!Array.isArray(parsed.timetableSlots)) parsed.timetableSlots = mockData.timetableSlots;
  const settings = { ...mockData.settings, ...(parsed.settings || {}) };
  if (!settings.slotTimes) settings.slotTimes = mockData.settings.slotTimes;
  settings.policies = { ...defaultPolicies, ...(settings.policies || {}) };
  if (!settings.activeRole) settings.activeRole = 'manager';
  parsed.settings = settings;
  return parsed as DataState;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = useState<DataState>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return normalizeData(JSON.parse(stored));
    } catch (e) {
      console.error('Lỗi khi đọc dữ liệu từ local storage', e);
    }
    return mockData;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const updateData = useCallback((newDataOrUpdater: Partial<DataState> | ((prev: DataState) => Partial<DataState>)) => {
    setData((prev) => {
      const updates = typeof newDataOrUpdater === 'function' ? newDataOrUpdater(prev) : newDataOrUpdater;
      return normalizeData({ ...prev, ...updates });
    });
  }, []);

  const resetData = useCallback(() => {
    setData(mockData);
  }, []);

  // ===== Activity Log =====
  const logActivity = useCallback((action: string, entity: string, entityName: string, details?: string) => {
    const log: ActivityLog = {
      id: uuidv4(),
      action,
      entity,
      entityName,
      details,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss')
    };
    setData(prev => ({
      ...prev,
      activityLogs: [log, ...prev.activityLogs].slice(0, MAX_LOGS)
    }));
  }, []);

  // ===== Snapshots =====
  const saveSnapshot = useCallback((name: string) => {
    const snapshot: DataSnapshot = {
      id: uuidv4(),
      name,
      createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      data: JSON.stringify({ ...data, activityLogs: [] }) // Don't save logs in snapshot
    };
    try {
      const existing = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]') as DataSnapshot[];
      existing.unshift(snapshot);
      // Keep max 10 snapshots
      const trimmed = existing.slice(0, 10);
      localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.error('Lỗi khi lưu snapshot', e);
    }
  }, [data]);

  const restoreSnapshot = useCallback((snapshotId: string) => {
    try {
      const snapshots = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]') as DataSnapshot[];
      const snap = snapshots.find(s => s.id === snapshotId);
      if (snap) {
        const restoredData = normalizeData(JSON.parse(snap.data));
        // Keep current activity logs
        restoredData.activityLogs = data.activityLogs;
        setData(restoredData);
      }
    } catch (e) {
      console.error('Lỗi khi khôi phục snapshot', e);
    }
  }, [data.activityLogs]);

  const deleteSnapshot = useCallback((snapshotId: string) => {
    try {
      const snapshots = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]') as DataSnapshot[];
      const filtered = snapshots.filter(s => s.id !== snapshotId);
      localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(filtered));
    } catch (e) {
      console.error('Lỗi khi xóa snapshot', e);
    }
  }, []);

  const getSnapshots = useCallback((): DataSnapshot[] => {
    try {
      return JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]');
    } catch { return []; }
  }, []);

  return (
    <AppContext.Provider value={{ data, updateData, resetData, logActivity, saveSnapshot, restoreSnapshot, deleteSnapshot, getSnapshots }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
