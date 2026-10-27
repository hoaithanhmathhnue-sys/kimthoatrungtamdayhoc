export type Role = 'admin' | 'accountant';

export interface User {
  id: string;
  name: string;
  role: Role;
}

export interface Teacher {
  id: string;
  name: string;
  degree?: string;
  phone: string;
  email: string;
  idCard?: string;
  address?: string;
  taxId?: string;
  bankAccount?: string;
  bankName?: string;
  subjects: string[];
  salaryRate: number; // percentage, e.g., 60 for 60%
  joinDate: string;
}

export interface Student {
  id: string;
  name: string;
  phone: string;
  dob: string;
  address?: string;
  parentName: string;
  parentPhone: string;
  joinDate: string;
  classId?: string;
  enrolledSubjects?: string[];
  applicationStatus?: 'active' | 'inactive';
  // Liên lạc
  guardianRelation?: string;          // Bố, Mẹ, Ông, Bà, Người giám hộ...
  guardianEmail?: string;
  email?: string;
  preferredContact?: ContactPreference; // Người nhận thông báo ưu tiên
}

// 'auto': HV từ 18 tuổi nhận trực tiếp, dưới 18 tuổi gửi người giám hộ
export type ContactPreference = 'auto' | 'student' | 'guardian' | 'both';

// ===== Khóa học =====

export type TuitionMode = 'per_session' | 'per_course' | 'per_month';

export interface Course {
  id: string;
  code?: string;
  name: string;
  subject: string;
  level?: string;           // Trình độ / khối lớp
  totalSessions: number;    // Tổng số buổi của khóa
  tuitionMode: TuitionMode;
  fee: number;              // Theo buổi: phí/buổi; trọn khóa: tổng phí; theo tháng: phí/tháng
  sessionsPerMonth?: number;
  description?: string;
  status: 'active' | 'inactive';
}

export interface ClassSession {
  id: string;
  code?: string;
  name: string;
  teacherId: string;
  subject: string;
  schedule: string; // e.g., "T2, T4 - 18:00"
  feePerSession: number;
  courseId?: string;
  roomId?: string;
  startDate?: string;
  endDate?: string;
  totalSessions?: number;
  maxStudents?: number;
  status?: 'upcoming' | 'active' | 'finished';
}

// ===== Buổi học (lịch học cụ thể từng buổi) =====

export interface Lesson {
  id: string;
  classId: string;
  date: string;             // YYYY-MM-DD
  startTime: string;        // HH:mm
  endTime: string;
  teacherId: string;
  roomId?: string;
  topic?: string;
  status: 'scheduled' | 'done' | 'cancelled';
  attendanceStatus: 'open' | 'submitted' | 'approved';
  submittedAt?: string;
  submittedBy?: string;
  approvedAt?: string;
  teacherNote?: string;
  isMakeup?: boolean;
  makeupOnly?: boolean;     // Buổi học bù riêng: chỉ dành cho HV có yêu cầu học bù, không phải cả lớp
}

// ===== Bài tập & Kiểm tra =====

export interface Assignment {
  id: string;
  classId: string;
  title: string;
  description?: string;
  assignedDate: string;
  dueDate: string;
  maxScore: number;
}

export interface AssignmentSubmission {
  id: string;
  assignmentId: string;
  studentId: string;
  status: 'not_submitted' | 'submitted' | 'late' | 'graded';
  score?: number;
  feedback?: string;
  submittedAt?: string;
}

export interface ExamResult {
  studentId: string;
  score?: number;
  comment?: string;
}

export interface Exam {
  id: string;
  classId: string;
  title: string;
  examType: string;
  date: string;
  maxScore: number;
  status: 'draft' | 'pending' | 'approved' | 'rejected';
  createdBy?: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewNote?: string;
  results: ExamResult[];
  notifiedAt?: string;
}

// ===== Phản hồi phụ huynh =====

export interface FeedbackHistory {
  at: string;
  by: string;
  action: string;
}

export interface Feedback {
  id: string;
  studentId: string;
  messageId?: string;          // Phản hồi cho thông báo nào
  fromName: string;
  fromRole: 'guardian' | 'student';
  category: 'reply' | 'feedback' | 'suggestion' | 'complaint' | 'question';
  content: string;
  channel: 'portal' | 'zalo' | 'sms' | 'phone' | 'direct';
  createdAt: string;
  status: 'new' | 'received' | 'processing' | 'resolved';
  assignee?: string;
  response?: string;
  receivedAt?: string;
  resolvedAt?: string;
  history: FeedbackHistory[];
}

// ===== Học vụ: học bù, chuyển lớp, bảo lưu =====

export interface MakeupRequest {
  id: string;
  studentId: string;
  classId: string;             // Lớp gốc bị vắng
  absentDate: string;
  absenceLessonId?: string;
  makeupLessonId?: string;     // Buổi học bù (có thể ở lớp khác)
  makeupDate?: string;
  status: 'pending' | 'scheduled' | 'done' | 'cancelled';
  note?: string;
  createdAt: string;
}

export interface ClassTransfer {
  id: string;
  studentId: string;
  fromClassId: string;
  toClassId: string;
  date: string;
  remainingSessions: number;   // Số buổi còn lại ở lớp cũ
  convertedSessions: number;   // Số buổi được ghi nhận ở lớp mới
  feeDifference: number;       // >0: HV đóng thêm, <0: trung tâm hoàn/giữ lại
  note?: string;
}

export interface Reservation {
  id: string;
  studentId: string;
  classId: string;
  startDate: string;
  endDate: string;
  sessionsReserved: number;
  reason?: string;
  status: 'active' | 'resumed' | 'cancelled';
  resumedDate?: string;
  resumedClassId?: string;
}

// ===== Quy định trung tâm =====

export interface CenterPolicies {
  tuitionMode: TuitionMode;           // Cách thu học phí mặc định
  deductUnexcusedAbsence: boolean;    // Vắng không phép vẫn trừ buổi
  makeupForExcusedOnly: boolean;      // Chỉ học bù khi vắng có phép
  makeupDeadlineDays: number;         // Thời hạn học bù (ngày)
  maxMakeupPerMonth: number;          // 0 = không giới hạn
  transferMode: 'by_value' | 'keep_sessions'; // Chuyển lớp: quy đổi theo giá trị tiền / giữ nguyên số buổi
  reservationMaxDays: number;
  reservationMinRemaining: number;    // Số buổi còn lại tối thiểu để được bảo lưu
  lowSessionWarning: number;          // Cảnh báo khi còn <= N buổi
  requireAttendanceApproval: boolean;
  requireExamApproval: boolean;
  autoNotifyAbsence: boolean;
}

export interface Enrollment {
  id: string;
  studentId: string;
  classId: string;
  enrolledAt: string;
}

export interface Attendance {
  id: string;
  classId: string;
  studentId: string;
  date: string;
  status: 'present' | 'absent' | 'excused';
  lessonId?: string;
  note?: string;
}

export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  category: string;
  description: string;
  date: string;
  relatedTeacherId?: string;
  relatedStudentId?: string;
  relatedClassId?: string;
  relatedSubject?: string;
  paymentMethod?: 'cash' | 'transfer' | 'CKCT';
  feePerSession?: number;
  sessionCount?: number;
  // DS nộp tiền extra fields
  school?: string;
  address?: string;
  parentName?: string;
  unitPrice?: number;
  invoiceIssued?: number;     // Xuất HĐ
  invoiceAmount?: number;     // TS tiền xuất HĐ
  note?: string;
}

// ===== Thời khóa biểu =====

export interface Room {
  id: string;
  name: string; // e.g. "Phòng 1", "Phòng 2"
}

export type SessionPeriod = 'morning' | 'afternoon';

// Mỗi buổi (sáng/chiều) có 3 ca dạy
export type SessionSlotIndex = 1 | 2 | 3;

export interface TimetableSlot {
  id: string;
  dayOfWeek: number;         // 2-8 (Thứ 2 đến Chủ nhật)
  period: SessionPeriod;     // sáng / chiều
  slotIndex: SessionSlotIndex; // Ca 1, 2, 3
  roomId: string;
  classId: string;           // Liên kết lớp học
  teacherId: string;
  subject: string;
}

// ===== Kết quả học tập =====

export interface GradeRecord {
  id: string;
  studentId: string;
  classId: string;
  subject: string;
  examType: string; // 'Kiểm tra miệng', 'Kiểm tra 15p', 'Kiểm tra 1 tiết', 'Thi cuối kỳ'
  score: number;    // 0-10
  date: string;
  note?: string;
  examId?: string;
}

// ===== Ngày nghỉ =====

export interface Holiday {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  note?: string;
}

// ===== Tin nhắn phụ huynh =====

export type MessageType = 'fee_reminder' | 'absence' | 'grade' | 'general' | 'comment' | 'schedule';

export interface ParentMessage {
  id: string;
  studentId: string;
  type: MessageType;
  content: string;
  sentAt: string;
  channel: 'sms' | 'zalo' | 'manual' | 'app';
  title?: string;
  classId?: string;
  recipient?: 'student' | 'guardian' | 'both';
  sender?: string;
  status?: 'sent' | 'delivered' | 'read';
  deliveredAt?: string;
  readAt?: string;
}

// ===== Bảng lương =====

export interface SalaryRecord {
  id: string;
  teacherId: string;
  month: string;        // 'YYYY-MM'
  totalSessions: number;
  totalRevenue: number;
  salaryRate: number;
  salaryAmount: number;
  status: 'pending' | 'paid';
  paidDate?: string;
  // Chi trả GV extra fields
  classSubject?: string;     // Môn, lớp
  studentCount?: number;     // Sĩ số
  advance1?: number;         // Tạm ứng L1
  advance2?: number;         // Tạm ứng L2
  advance3?: number;         // Tạm ứng L3
  advance4?: number;         // Tạm ứng L4
  paidTransfer?: number;     // Trả qua TK
  paidCash?: number;         // Trả tiền mặt
  note?: string;             // Ghi chú
  date?: string;             // Ngày chi trả
}

// ===== Lịch sử hoạt động =====

export interface ActivityLog {
  id: string;
  action: string;       // 'add' | 'edit' | 'delete' | 'import' | 'backup' | 'restore'
  entity: string;       // 'student' | 'teacher' | 'class' | 'transaction' | 'timetable' | 'grade' | ...
  entityName: string;   // Tên đối tượng (VD: "Nguyễn Văn A")
  details?: string;     // Chi tiết bổ sung
  timestamp: string;    // ISO datetime
}

export interface DataSnapshot {
  id: string;
  name: string;
  createdAt: string;
  data: string;         // JSON.stringify of DataState (without snapshots to avoid nesting)
}

export interface DataState {
  teachers: Teacher[];
  students: Student[];
  classes: ClassSession[];
  enrollments: Enrollment[];
  attendances: Attendance[];
  transactions: Transaction[];
  rooms: Room[];
  timetableSlots: TimetableSlot[];
  grades: GradeRecord[];
  holidays: Holiday[];
  parentMessages: ParentMessage[];
  salaryRecords: SalaryRecord[];
  activityLogs: ActivityLog[];
  courses: Course[];
  lessons: Lesson[];
  assignments: Assignment[];
  submissions: AssignmentSubmission[];
  exams: Exam[];
  feedbacks: Feedback[];
  makeups: MakeupRequest[];
  transfers: ClassTransfer[];
  reservations: Reservation[];
  settings: {
    geminiApiKey: string;
    geminiModel: string;
    policies: CenterPolicies;
    activeRole: string; // 'manager' | 'teacher:<id>' | 'parent:<studentId>'
    slotTimes: {
      morning: { [key: string]: { start: string; end: string } };
      afternoon: { [key: string]: { start: string; end: string } };
    };
  };
}
