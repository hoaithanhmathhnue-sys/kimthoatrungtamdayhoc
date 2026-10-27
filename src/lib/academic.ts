import dayjs from 'dayjs';
import { v4 as uuidv4 } from 'uuid';
import { DataState, Student, ParentMessage, MessageType, TuitionMode } from '../types';

export const CENTER_NAME = 'TRUNG TÂM DẠY HỌC & ĐÀO TẠO TRI THỨC VIỆT';
export const CENTER_SHORT_NAME = 'Trung tâm Tri Thức Việt';

export const TUITION_MODE_LABELS: Record<TuitionMode, string> = {
  per_session: 'Theo buổi',
  per_course: 'Trọn khóa',
  per_month: 'Theo tháng',
};

export const MESSAGE_TYPE_LABELS: Record<MessageType, string> = {
  comment: '📝 Nhận xét',
  schedule: '📅 Lịch học',
  absence: '📞 Vắng mặt',
  grade: '📊 Kết quả',
  fee_reminder: '💰 Học phí',
  general: '📢 Thông báo chung',
};

export const RECIPIENT_LABELS = { student: 'Học viên', guardian: 'Người giám hộ', both: 'HV + Người giám hộ' } as const;

export const WEEKDAY_LABELS: Record<number, string> = { 2: 'T2', 3: 'T3', 4: 'T4', 5: 'T5', 6: 'T6', 7: 'T7', 8: 'CN' };

// dayjs: 0 = CN ... 6 = T7  →  2..8 (T2..CN)
export const toVnWeekday = (date: string) => {
  const d = dayjs(date).day();
  return d === 0 ? 8 : d + 1;
};

export const nowStr = () => dayjs().format('YYYY-MM-DD HH:mm');

export const parseRole = (role: string): { kind: 'manager' | 'teacher' | 'parent'; id?: string } => {
  if (role?.startsWith('teacher:')) return { kind: 'teacher', id: role.slice(8) };
  if (role?.startsWith('parent:')) return { kind: 'parent', id: role.slice(7) };
  return { kind: 'manager' };
};

export const roleDisplayName = (data: DataState): string => {
  const r = parseRole(data.settings.activeRole);
  if (r.kind === 'teacher') return data.teachers.find(t => t.id === r.id)?.name || 'Giáo viên';
  if (r.kind === 'parent') return data.students.find(s => s.id === r.id)?.parentName || 'Phụ huynh';
  return 'Quản lý';
};

// ===== Ghi danh =====

export const getStudentClassIds = (data: DataState, studentId: string): string[] => {
  const ids = data.enrollments.filter(e => e.studentId === studentId).map(e => e.classId);
  const student = data.students.find(s => s.id === studentId);
  if (student?.classId && !ids.includes(student.classId)) ids.push(student.classId);
  return ids.filter(id => data.classes.some(c => c.id === id));
};

export const getClassStudents = (data: DataState, classId: string): Student[] => {
  const enrolled = new Set(data.enrollments.filter(e => e.classId === classId).map(e => e.studentId));
  return data.students.filter(s => s.classId === classId || enrolled.has(s.id));
};

export const getActiveReservation = (data: DataState, studentId: string, classId: string) =>
  data.reservations.find(r => r.studentId === studentId && r.classId === classId && r.status === 'active');

// ===== Học phí =====

// Giá trị 1 buổi học của lớp (dùng cho quy đổi chuyển lớp, công nợ)
export const getSessionFee = (data: DataState, classId: string): number => {
  const cls = data.classes.find(c => c.id === classId);
  if (!cls) return 0;
  const course = cls.courseId ? data.courses.find(c => c.id === cls.courseId) : undefined;
  if (course) {
    if (course.tuitionMode === 'per_course' && course.totalSessions > 0) return Math.round(course.fee / course.totalSessions);
    if (course.tuitionMode === 'per_month' && (course.sessionsPerMonth || 0) > 0) return Math.round(course.fee / (course.sessionsPerMonth || 1));
  }
  return cls.feePerSession || course?.fee || 0;
};

export const getTuitionMode = (data: DataState, classId: string): TuitionMode => {
  const cls = data.classes.find(c => c.id === classId);
  const course = cls?.courseId ? data.courses.find(c => c.id === cls.courseId) : undefined;
  return course?.tuitionMode || data.settings.policies.tuitionMode;
};

// ===== Tiến độ học tập của 1 HV trong 1 lớp =====

export interface StudentProgress {
  purchased: number;      // Số buổi đã đóng học phí (kể cả quy đổi chuyển lớp)
  present: number;
  absent: number;
  excused: number;
  makeupDone: number;
  makeupPending: number;
  used: number;           // Số buổi đã trừ
  remaining: number;      // Số buổi còn lại (âm = nợ học phí)
  totalLessons: number;   // Tổng số buổi của lớp
  doneLessons: number;    // Số buổi lớp đã học
  attendanceRate: number; // %
  assignmentsTotal: number;
  assignmentsDone: number;
  avgScore: number | null;
  paidAmount: number;
  debtAmount: number;
  reserved: boolean;
}

export const computeProgress = (data: DataState, studentId: string, classId: string): StudentProgress => {
  const policies = data.settings.policies;
  const cls = data.classes.find(c => c.id === classId);
  const sessionFee = getSessionFee(data, classId);

  const tuitionTxs = data.transactions.filter(t =>
    t.type === 'income' && t.category === 'Học phí' && t.relatedStudentId === studentId && t.relatedClassId === classId
  );
  const paidAmount = tuitionTxs.reduce((s, t) => s + t.amount, 0);
  let purchased = tuitionTxs.reduce((s, t) => {
    if (t.sessionCount) return s + t.sessionCount;
    return s + (sessionFee > 0 ? Math.floor(t.amount / sessionFee) : 0);
  }, 0);
  data.transfers.forEach(tr => {
    if (tr.studentId !== studentId) return;
    if (tr.toClassId === classId) purchased += tr.convertedSessions;
    if (tr.fromClassId === classId) purchased -= tr.remainingSessions;
  });

  const atts = data.attendances.filter(a => a.studentId === studentId && a.classId === classId);
  const present = atts.filter(a => a.status === 'present').length;
  const absent = atts.filter(a => a.status === 'absent').length;
  const excused = atts.filter(a => a.status === 'excused').length;
  const makeups = data.makeups.filter(m => m.studentId === studentId && m.classId === classId);
  const makeupDone = makeups.filter(m => m.status === 'done').length;
  const makeupPending = makeups.filter(m => m.status === 'pending' || m.status === 'scheduled').length;

  const used = present + makeupDone + (policies.deductUnexcusedAbsence ? absent : 0);
  const remaining = purchased - used;

  const classLessons = data.lessons.filter(l => l.classId === classId && l.status !== 'cancelled' && !l.makeupOnly);
  const totalLessons = cls?.totalSessions || classLessons.length;
  const doneLessons = classLessons.filter(l => l.status === 'done').length;
  const marked = present + absent + excused;
  const attendanceRate = marked > 0 ? Math.round(((present + makeupDone) / marked) * 100) : 0;

  const classAssignments = data.assignments.filter(a => a.classId === classId);
  const assignmentsDone = data.submissions.filter(s =>
    s.studentId === studentId && classAssignments.some(a => a.id === s.assignmentId) && s.status !== 'not_submitted'
  ).length;

  const grades = data.grades.filter(g => g.studentId === studentId && g.classId === classId);
  const avgScore = grades.length > 0 ? Math.round((grades.reduce((s, g) => s + g.score, 0) / grades.length) * 10) / 10 : null;

  return {
    purchased, present, absent, excused, makeupDone, makeupPending, used, remaining,
    totalLessons, doneLessons, attendanceRate,
    assignmentsTotal: classAssignments.length, assignmentsDone, avgScore,
    paidAmount, debtAmount: remaining < 0 ? -remaining * sessionFee : 0,
    reserved: !!getActiveReservation(data, studentId, classId),
  };
};

// ===== Liên lạc =====

export const getAge = (dob?: string) => (dob && dayjs(dob).isValid() ? dayjs().diff(dayjs(dob), 'year') : null);

// Người nhận phù hợp: theo cấu hình của HV; mặc định HV đủ 18 tuổi nhận trực tiếp, chưa đủ gửi người giám hộ
export const resolveRecipient = (student: Student): 'student' | 'guardian' | 'both' => {
  const pref = student.preferredContact || 'auto';
  if (pref !== 'auto') return pref;
  const age = getAge(student.dob);
  if (age !== null && age >= 18) return 'student';
  return student.parentPhone || student.parentName ? 'guardian' : 'student';
};

export const recipientContact = (student: Student, recipient: 'student' | 'guardian' | 'both') => {
  const guardian = `${student.guardianRelation || 'PH'} ${student.parentName || ''} - ${student.parentPhone || 'chưa có SĐT'}`.trim();
  const self = `HV ${student.name} - ${student.phone || 'chưa có SĐT'}`;
  if (recipient === 'student') return self;
  if (recipient === 'guardian') return guardian;
  return `${self}; ${guardian}`;
};

export const fillTemplate = (template: string, vars: Record<string, string | number | undefined>) =>
  template.replace(/\{(\w+)\}/g, (m, key) => (vars[key] !== undefined && vars[key] !== '' ? String(vars[key]) : m));

export const greetingFor = (student: Student, recipient: 'student' | 'guardian' | 'both') =>
  recipient === 'student' ? `Chào em ${student.name}` : `Kính gửi ${student.guardianRelation ? student.guardianRelation + ' ' : 'Quý PH '}${student.parentName || ''}`.trim();

export const buildMessage = (
  student: Student,
  type: MessageType,
  content: string,
  opts: { classId?: string; title?: string; channel?: ParentMessage['channel']; sender?: string; recipient?: 'student' | 'guardian' | 'both' } = {}
): ParentMessage => ({
  id: uuidv4(),
  studentId: student.id,
  type,
  content,
  title: opts.title,
  classId: opts.classId,
  channel: opts.channel || 'app',
  recipient: opts.recipient || resolveRecipient(student),
  sender: opts.sender,
  sentAt: nowStr(),
  status: 'sent',
});

export const absenceMessage = (data: DataState, student: Student, classId: string, date: string, excused: boolean, sender?: string) => {
  const cls = data.classes.find(c => c.id === classId);
  const recipient = resolveRecipient(student);
  const who = recipient === 'student' ? 'em' : `em ${student.name}`;
  const content = `${greetingFor(student, recipient)},\n${CENTER_SHORT_NAME} thông báo: ${who} đã vắng mặt ${excused ? '(có phép) ' : ''}buổi học lớp ${cls?.name || ''} ngày ${dayjs(date).format('DD/MM/YYYY')}.${excused ? ' Trung tâm sẽ sắp xếp lịch học bù.' : ' Vui lòng phản hồi lý do vắng để trung tâm nắm thông tin.'}\nTrân trọng.`;
  return buildMessage(student, 'absence', content, { classId, title: `Vắng mặt ngày ${dayjs(date).format('DD/MM')}`, sender, recipient });
};

export const formatShortDate = (d?: string) => (d ? dayjs(d).format('DD/MM/YYYY') : '-');
