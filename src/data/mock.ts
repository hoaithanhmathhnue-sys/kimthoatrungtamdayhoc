import { DataState, CenterPolicies } from '../types';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';

const today = dayjs().format('YYYY-MM-DD');
const lastMonth = dayjs().subtract(1, 'month').format('YYYY-MM-DD');
const d = (offset: number) => dayjs().add(offset, 'day').format('YYYY-MM-DD');
const now = dayjs().format('YYYY-MM-DD HH:mm');

export const defaultPolicies: CenterPolicies = {
  tuitionMode: 'per_session',
  deductUnexcusedAbsence: true,
  makeupForExcusedOnly: true,
  makeupDeadlineDays: 30,
  maxMakeupPerMonth: 2,
  transferMode: 'by_value',
  reservationMaxDays: 90,
  reservationMinRemaining: 2,
  lowSessionWarning: 2,
  requireAttendanceApproval: false,
  requireExamApproval: true,
  autoNotifyAbsence: true,
};

export const mockData: DataState = {
  teachers: [
    { id: 't1', name: 'Nguyễn Văn A', degree: 'Thạc sĩ Toán', phone: '0901234567', email: 'vana@gmail.com', subjects: ['Toán', 'Lý'], salaryRate: 60, joinDate: '2023-01-15', bankName: 'Vietcombank', bankAccount: '123456789' },
    { id: 't2', name: 'Trần Thị B', degree: 'Cử nhân Hóa', phone: '0987654321', email: 'thib@gmail.com', subjects: ['Hóa', 'Sinh'], salaryRate: 50, joinDate: '2023-05-20', bankName: 'Techcombank', bankAccount: '987654321' },
  ],
  students: [
    { id: 's1', name: 'Lê Hoàng C', phone: '0911111111', dob: '2010-05-10', address: 'Hoàn Kiếm, HN', parentName: 'Lê Văn X', parentPhone: '0922222222', joinDate: '2024-01-10', classId: 'c1', enrolledSubjects: ['Toán'], applicationStatus: 'active', guardianRelation: 'Bố', preferredContact: 'auto' },
    { id: 's2', name: 'Phạm Minh D', phone: '0933333333', dob: '2011-08-15', address: 'Ba Đình, HN', parentName: 'Phạm Thị Y', parentPhone: '0944444444', joinDate: '2024-02-05', classId: 'c2', enrolledSubjects: ['Hóa'], applicationStatus: 'active', guardianRelation: 'Mẹ', preferredContact: 'auto' },
  ],
  classes: [
    { id: 'c1', code: 'T9A', name: 'Toán 9A', teacherId: 't1', subject: 'Toán', schedule: 'T3, CN - 18:00', feePerSession: 150000, courseId: 'co1', roomId: 'r1', startDate: d(-14), totalSessions: 24, maxStudents: 20, status: 'active' },
    { id: 'c2', code: 'H10B', name: 'Hóa 10B', teacherId: 't2', subject: 'Hóa', schedule: 'T2, T5 - 19:30', feePerSession: 120000, courseId: 'co2', roomId: 'r2', startDate: d(-14), totalSessions: 16, maxStudents: 15, status: 'active' },
  ],
  enrollments: [],
  attendances: [
    { id: 'att1', classId: 'c1', studentId: 's1', date: d(-7), status: 'present', lessonId: 'l1' },
    { id: 'att2', classId: 'c2', studentId: 's2', date: d(-6), status: 'excused', lessonId: 'l3', note: 'Ốm' },
  ],
  transactions: [
    { id: 'tx1', type: 'income', amount: 1200000, category: 'Học phí', description: 'Đợt 1 năm 2026', date: today, relatedStudentId: 's1', relatedClassId: 'c1', relatedSubject: 'Toán', paymentMethod: 'transfer', sessionCount: 8, feePerSession: 150000 },
    { id: 'tx2', type: 'expense', amount: 2000000, category: 'Vận hành', description: 'Tiền điện nước tháng trước', date: lastMonth },
    { id: 'tx3', type: 'expense', amount: 3500000, category: 'Lương giáo viên', description: 'Thanh toán lương Toán 9A', date: today, relatedTeacherId: 't1' },
    { id: 'tx4', type: 'income', amount: 960000, category: 'Học phí', description: 'Thu học phí Hóa 10B', date: today, relatedStudentId: 's2', relatedClassId: 'c2', relatedSubject: 'Hóa', paymentMethod: 'cash', sessionCount: 8, feePerSession: 120000 },
  ],
  rooms: [
    { id: 'r1', name: 'Phòng 1' },
    { id: 'r2', name: 'Phòng 2' },
    { id: 'r3', name: 'Phòng 3' },
  ],
  timetableSlots: [
    { id: 'ts1', dayOfWeek: 3, period: 'afternoon', slotIndex: 1, roomId: 'r1', classId: 'c1', teacherId: 't1', subject: 'Toán' },
    { id: 'ts2', dayOfWeek: 2, period: 'afternoon', slotIndex: 2, roomId: 'r2', classId: 'c2', teacherId: 't2', subject: 'Hóa' },
  ],
  grades: [],
  holidays: [],
  parentMessages: [],
  salaryRecords: [],
  activityLogs: [],
  courses: [
    { id: 'co1', code: 'TOAN9', name: 'Toán 9 - Ôn thi vào 10', subject: 'Toán', level: 'Lớp 9', totalSessions: 24, tuitionMode: 'per_session', fee: 150000, description: 'Củng cố kiến thức và luyện đề thi vào lớp 10', status: 'active' },
    { id: 'co2', code: 'HOA10', name: 'Hóa 10 - Nền tảng', subject: 'Hóa', level: 'Lớp 10', totalSessions: 16, tuitionMode: 'per_course', fee: 1920000, description: 'Kiến thức nền tảng Hóa học 10', status: 'active' },
  ],
  lessons: [
    { id: 'l1', classId: 'c1', date: d(-7), startTime: '18:00', endTime: '19:30', teacherId: 't1', roomId: 'r1', topic: 'Hệ phương trình bậc nhất', status: 'done', attendanceStatus: 'approved', submittedAt: now },
    { id: 'l2', classId: 'c1', date: d(2), startTime: '18:00', endTime: '19:30', teacherId: 't1', roomId: 'r1', topic: 'Giải bài toán bằng cách lập hệ', status: 'scheduled', attendanceStatus: 'open' },
    { id: 'l3', classId: 'c2', date: d(-6), startTime: '19:30', endTime: '21:00', teacherId: 't2', roomId: 'r2', topic: 'Cấu tạo nguyên tử', status: 'done', attendanceStatus: 'approved', submittedAt: now },
    { id: 'l4', classId: 'c2', date: today, startTime: '19:30', endTime: '21:00', teacherId: 't2', roomId: 'r2', topic: 'Bảng tuần hoàn', status: 'scheduled', attendanceStatus: 'open' },
  ],
  assignments: [
    { id: 'as1', classId: 'c1', title: 'BTVN: Hệ phương trình (bài 1-10)', description: 'Làm vào vở, chụp ảnh nộp', assignedDate: d(-7), dueDate: d(1), maxScore: 10 },
  ],
  submissions: [
    { id: 'sub1', assignmentId: 'as1', studentId: 's1', status: 'submitted', submittedAt: d(-2) },
  ],
  exams: [
    { id: 'ex1', classId: 'c1', title: 'Kiểm tra 15 phút - Hệ phương trình', examType: 'Kiểm tra 15 phút', date: d(-7), maxScore: 10, status: 'pending', createdBy: 'Nguyễn Văn A', submittedAt: now, results: [{ studentId: 's1', score: 8.5, comment: 'Trình bày tốt' }] },
  ],
  feedbacks: [
    { id: 'fb1', studentId: 's2', fromName: 'Phạm Thị Y', fromRole: 'guardian', category: 'question', content: 'Cháu nghỉ ốm buổi trước, trung tâm có xếp lịch học bù không ạ?', channel: 'zalo', createdAt: now, status: 'new', history: [{ at: now, by: 'Phạm Thị Y', action: 'Gửi phản hồi' }] },
  ],
  makeups: [
    { id: 'mk1', studentId: 's2', classId: 'c2', absentDate: d(-6), absenceLessonId: 'l3', status: 'pending', createdAt: d(-6) },
  ],
  transfers: [],
  reservations: [],
  settings: {
    geminiApiKey: '',
    geminiModel: 'gemini-3.1-flash',
    policies: defaultPolicies,
    activeRole: 'manager',
    slotTimes: {
      morning: {
        '1': { start: '7:00', end: '8:30' },
        '2': { start: '8:45', end: '10:15' },
        '3': { start: '10:30', end: '12:00' },
      },
      afternoon: {
        '1': { start: '13:30', end: '15:00' },
        '2': { start: '15:15', end: '16:45' },
        '3': { start: '17:00', end: '18:30' },
      },
    },
  }
};
