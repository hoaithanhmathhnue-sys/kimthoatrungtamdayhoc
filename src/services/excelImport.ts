import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import {
  DataState,
  Student,
  Teacher,
  ClassSession,
  Transaction,
  Attendance,
  Enrollment,
  SalaryRecord,
} from '../types';

// ===== Helpers =====

type Row = (string | number)[];

const readSheetMatrix = (ws: XLSX.WorkSheet): Row[] => {
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as Row[];
};

const norm = (v: unknown): string => String(v ?? '').trim();

const parseAmount = (v: unknown): number => {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(/[^\d]/g, '');
  return s ? Number(s) : 0;
};

// Parse "23.1", "3.2", "28.10" -> YYYY-MM-DD using reference year
const parseShortDate = (v: unknown, refYear?: number): string | null => {
  const s = norm(v);
  if (!s) return null;
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Try dayjs on common formats
  const dj = dayjs(s, ['D/M/YY', 'D/M/YYYY', 'DD/MM/YYYY', 'M/D/YY', 'M/D/YYYY', 'YYYY-MM-DD'], true);
  if (dj.isValid()) return dj.format('YYYY-MM-DD');
  // "D.M" form (day.month)
  const m = s.match(/^(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = m[3] ? Number(m[3]) : refYear ?? dayjs().year();
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return dayjs(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`).format('YYYY-MM-DD');
    }
  }
  return null;
};

const normalizeName = (v: unknown) => norm(v).toLowerCase().replace(/\s+/g, ' ');

// Find or create a student by name+phone; returns id.
const findOrCreateStudent = (
  students: Student[],
  info: { name: string; phone?: string; parentName?: string; parentPhone?: string; address?: string; classId?: string }
): { id: string; created: boolean; student: Student } => {
  const byPhone = info.phone
    ? students.find((s) => s.phone && norm(s.phone) === norm(info.phone))
    : undefined;
  const byName = !byPhone
    ? students.find((s) => normalizeName(s.name) === normalizeName(info.name))
    : undefined;
  const existing = byPhone || byName;
  if (existing) {
    // Augment missing fields
    if (info.parentName && !existing.parentName) existing.parentName = info.parentName;
    if (info.address && !existing.address) existing.address = info.address;
    if (info.phone && !existing.phone) existing.phone = info.phone;
    if (info.classId && !existing.classId) existing.classId = info.classId;
    return { id: existing.id, created: false, student: existing };
  }
  const s: Student = {
    id: uuidv4(),
    name: info.name,
    phone: info.phone || '',
    dob: '',
    address: info.address || '',
    parentName: info.parentName || '',
    parentPhone: info.parentPhone || '',
    joinDate: dayjs().format('YYYY-MM-DD'),
    classId: info.classId,
    applicationStatus: 'active',
  };
  students.push(s);
  return { id: s.id, created: true, student: s };
};

const findOrCreateClass = (
  classes: ClassSession[],
  info: { name: string; subject: string; code?: string; teacherId?: string; feePerSession?: number }
): ClassSession => {
  const existing = classes.find(
    (c) => normalizeName(c.name) === normalizeName(info.name) && c.subject === info.subject
  );
  if (existing) return existing;
  const c: ClassSession = {
    id: uuidv4(),
    name: info.name,
    code: info.code,
    subject: info.subject,
    teacherId: info.teacherId || '',
    schedule: '',
    feePerSession: info.feePerSession ?? 0,
  };
  classes.push(c);
  return c;
};

const findOrCreateTeacher = (teachers: Teacher[], name: string): Teacher => {
  const existing = teachers.find((t) => normalizeName(t.name) === normalizeName(name));
  if (existing) return existing;
  const t: Teacher = {
    id: uuidv4(),
    name,
    phone: '',
    email: '',
    subjects: [],
    salaryRate: 60,
    joinDate: dayjs().format('YYYY-MM-DD'),
  };
  teachers.push(t);
  return t;
};

// Generic header index finder (row of strings)
const headerIndex = (row: Row, keywords: string[]): number => {
  const lower = row.map((c) => norm(c).toLowerCase());
  for (let i = 0; i < lower.length; i++) {
    for (const k of keywords) {
      if (lower[i].includes(k.toLowerCase())) return i;
    }
  }
  return -1;
};

// Find the header row in first ~8 rows by searching for "stt" or "họ và tên"
const findHeaderRow = (matrix: Row[]): number => {
  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
    const r = matrix[i];
    const lower = r.map((c) => norm(c).toLowerCase());
    if (lower.some((v) => v === 'stt') && lower.some((v) => v.includes('họ và tên'))) return i;
  }
  return -1;
};

// ===== File 1: Student Payment Import =====
// Sheets named like "Thu Toán 12D đợt 2.2026"
// Headers: Stt, Họ và tên học sinh, Lớp, Trường, Môn, SĐT, Địa chỉ, PH, Đơn, Số tiền, Hình thức, Ngày nộp

export interface PaymentImportResult {
  newStudents: number;
  newClasses: number;
  newTransactions: number;
  skippedRows: number;
  sheetsProcessed: number;
  warnings: string[];
}

export const importPaymentExcel = (
  fileData: ArrayBuffer | string,
  prev: DataState
): { next: Partial<DataState>; result: PaymentImportResult } => {
  const wb = XLSX.read(fileData, { type: typeof fileData === 'string' ? 'binary' : 'array' });
  const students = [...prev.students];
  const classes = [...prev.classes];
  const transactions = [...prev.transactions];
  const enrollments = [...prev.enrollments];

  const res: PaymentImportResult = {
    newStudents: 0,
    newClasses: 0,
    newTransactions: 0,
    skippedRows: 0,
    sheetsProcessed: 0,
    warnings: [],
  };

  const beforeStudents = students.length;
  const beforeClasses = classes.length;
  const beforeTx = transactions.length;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const matrix = readSheetMatrix(ws);
    const headerRow = findHeaderRow(matrix);
    if (headerRow < 0) continue;

    const h = matrix[headerRow];
    const idxName = headerIndex(h, ['họ và tên']);
    const idxClass = headerIndex(h, ['lớp']);
    const idxSchool = headerIndex(h, ['trường']);
    const idxSubject = headerIndex(h, ['môn']);
    const idxPhone = headerIndex(h, ['số điện thoại', 'sđt', 'điện thoại']);
    const idxAddr = headerIndex(h, ['địa chỉ']);
    const idxParent = headerIndex(h, ['phụ huynh']);
    const idxAmount = headerIndex(h, ['số tiền']);
    const idxMethod = headerIndex(h, ['hình thức']);
    const idxDate = headerIndex(h, ['ngày nộp', 'ngày']);
    if (idxName < 0 || idxAmount < 0) continue;

    res.sheetsProcessed++;

    // Extract year hint from sheet name (e.g., "2.2026" -> 2026)
    const yearMatch = sheetName.match(/(\d{4})/);
    const refYear = yearMatch ? Number(yearMatch[1]) : undefined;

    // Infer subject/class fallback from sheet name
    // e.g. "Thu Toán 12D đợt 2.2026" -> subject "Toán", class "12D"
    const sheetSubjectMatch = sheetName.match(/(Toán|Văn|Lý|Hóa|Sinh|Sử|Địa|Anh|GDCD|Tin|Ngữ Văn)/i);
    const sheetClassMatch = sheetName.match(/\b(\d{1,2}[A-Za-zĐ]?)\b/);

    for (let r = headerRow + 1; r < matrix.length; r++) {
      const row = matrix[r];
      const name = norm(row[idxName]);
      if (!name) continue;
      // Skip total-rows where name column is empty but numeric totals appear further
      if (!/[A-Za-zÀ-ỹ]/.test(name)) continue;

      const phone = idxPhone >= 0 ? norm(row[idxPhone]) : '';
      const clsName = (idxClass >= 0 ? norm(row[idxClass]) : '') || sheetClassMatch?.[1] || '';
      const school = idxSchool >= 0 ? norm(row[idxSchool]) : '';
      const subject = (idxSubject >= 0 ? norm(row[idxSubject]) : '') || sheetSubjectMatch?.[1] || '';
      const address = idxAddr >= 0 ? norm(row[idxAddr]) : '';
      const parentName = idxParent >= 0 ? norm(row[idxParent]) : '';
      const amount = idxAmount >= 0 ? parseAmount(row[idxAmount]) : 0;
      const method = idxMethod >= 0 ? norm(row[idxMethod]).toUpperCase() : '';
      const dateRaw = idxDate >= 0 ? row[idxDate] : '';
      const date = parseShortDate(dateRaw, refYear) || dayjs().format('YYYY-MM-DD');

      // Ensure class exists
      let classId: string | undefined;
      if (clsName) {
        const fullClassName = subject ? `${subject} ${clsName}` : clsName;
        const cls = findOrCreateClass(classes, {
          name: fullClassName,
          subject: subject || 'Khác',
          code: clsName,
        });
        classId = cls.id;
      }

      // Create/find student
      const { id: studentId } = findOrCreateStudent(students, {
        name,
        phone,
        parentName,
        address: address || school,
        classId,
      });

      // Ensure enrollment link
      if (classId && !enrollments.some((e) => e.studentId === studentId && e.classId === classId)) {
        enrollments.push({
          id: uuidv4(),
          studentId,
          classId,
          enrolledAt: dayjs().format('YYYY-MM-DD'),
        });
      }

      if (amount <= 0) {
        // Student registered but not yet paid — skip transaction creation
        res.skippedRows++;
        continue;
      }

      const paymentMethod: 'cash' | 'transfer' =
        method.includes('CK') || method.includes('TK') ? 'transfer' : 'cash';

      const tx: Transaction = {
        id: uuidv4(),
        type: 'income',
        amount,
        category: 'Học phí',
        description: `Nhập từ Excel: ${sheetName} — ${name}${clsName ? ' (' + clsName + ')' : ''}`,
        date,
        relatedStudentId: studentId,
        relatedClassId: classId,
        relatedSubject: subject || undefined,
        paymentMethod,
      };
      transactions.push(tx);
    }
  }

  res.newStudents = students.length - beforeStudents;
  res.newClasses = classes.length - beforeClasses;
  res.newTransactions = transactions.length - beforeTx;

  return {
    next: { students, classes, transactions, enrollments },
    result: res,
  };
};

// ===== File 2: Student Attendance Import =====
// Sheets named like "Toán 6. Hà NT", headers row has dates like "13.9", "20.9"

export interface AttendanceImportResult {
  newStudents: number;
  newClasses: number;
  newAttendances: number;
  sheetsProcessed: number;
  warnings: string[];
}

export const importAttendanceExcel = (
  fileData: ArrayBuffer | string,
  prev: DataState
): { next: Partial<DataState>; result: AttendanceImportResult } => {
  const wb = XLSX.read(fileData, { type: typeof fileData === 'string' ? 'binary' : 'array' });
  const students = [...prev.students];
  const classes = [...prev.classes];
  const attendances = [...prev.attendances];
  const enrollments = [...prev.enrollments];

  const res: AttendanceImportResult = {
    newStudents: 0,
    newClasses: 0,
    newAttendances: 0,
    sheetsProcessed: 0,
    warnings: [],
  };

  const beforeStudents = students.length;
  const beforeClasses = classes.length;
  const beforeAtt = attendances.length;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const matrix = readSheetMatrix(ws);
    if (matrix.length === 0) continue;
    const headerRow = findHeaderRow(matrix);
    if (headerRow < 0) continue;

    const h = matrix[headerRow];
    const idxName = headerIndex(h, ['họ và tên']);
    const idxSubject = headerIndex(h, ['môn']);
    const idxClass = headerIndex(h, ['lớp']);
    const idxSchool = headerIndex(h, ['trường']);
    if (idxName < 0) continue;

    res.sheetsProcessed++;

    // Determine the range of date columns: everything after the last of (name/subject/class/school)
    // until either "Tổng" or end.
    const startDateCol = Math.max(idxName, idxSubject, idxClass, idxSchool) + 1;
    const totalCol = headerIndex(h, ['tổng']);
    const endDateCol = totalCol >= 0 ? totalCol : h.length;

    // Extract year hint from sheet name / preceding rows
    let refYear: number | undefined;
    for (let i = 0; i < headerRow; i++) {
      const joined = matrix[i].map(norm).join(' ');
      const m = joined.match(/(\d{4})/);
      if (m) {
        refYear = Number(m[1]);
        break;
      }
    }

    // Build date columns map
    const dateCols: { col: number; date: string }[] = [];
    for (let c = startDateCol; c < endDateCol; c++) {
      const raw = h[c];
      const d = parseShortDate(raw, refYear);
      if (d) dateCols.push({ col: c, date: d });
    }
    if (dateCols.length === 0) continue;

    // Parse subject/class from sheet name as fallback: "Toán 6. Hà NT" -> subject "Toán", class "6"
    const snMatch = sheetName.match(/^(\S+)\s+(\d+[A-Za-zĐ]?)\b/);
    const sheetSubject = snMatch?.[1] || '';
    const sheetClass = snMatch?.[2] || '';

    // For each data row, determine subject + class, find/create class, find/create student, create attendances
    for (let r = headerRow + 1; r < matrix.length; r++) {
      const row = matrix[r];
      const name = norm(row[idxName]);
      if (!name) continue;
      if (!/[A-Za-zÀ-ỹ]/.test(name)) continue;
      // Numeric-only names (like total rows "16") — skip
      if (/^\d+$/.test(name)) continue;

      const subject = (idxSubject >= 0 ? norm(row[idxSubject]) : '') || sheetSubject || 'Khác';
      const clsName = (idxClass >= 0 ? norm(row[idxClass]) : '') || sheetClass || '';
      const school = idxSchool >= 0 ? norm(row[idxSchool]) : '';

      const fullClassName = clsName ? `${subject} ${clsName}` : subject;
      const cls = findOrCreateClass(classes, {
        name: fullClassName,
        subject,
        code: clsName,
      });

      const { id: studentId } = findOrCreateStudent(students, {
        name,
        classId: cls.id,
        address: school,
      });

      if (!enrollments.some((e) => e.studentId === studentId && e.classId === cls.id)) {
        enrollments.push({
          id: uuidv4(),
          studentId,
          classId: cls.id,
          enrolledAt: dayjs().format('YYYY-MM-DD'),
        });
      }

      for (const { col, date } of dateCols) {
        const cell = norm(row[col]);
        if (cell === '') continue; // not attended class that day
        const status: 'present' | 'absent' = cell === '1' ? 'present' : cell === '0' ? 'absent' : 'present';
        // De-dup: if attendance exists for same student+class+date, skip
        const existing = attendances.find(
          (a) => a.studentId === studentId && a.classId === cls.id && a.date === date
        );
        if (existing) {
          if (existing.status !== status) existing.status = status;
          continue;
        }
        attendances.push({
          id: uuidv4(),
          studentId,
          classId: cls.id,
          date,
          status,
        });
      }
    }
  }

  res.newStudents = students.length - beforeStudents;
  res.newClasses = classes.length - beforeClasses;
  res.newAttendances = attendances.length - beforeAtt;

  return {
    next: { students, classes, attendances, enrollments },
    result: res,
  };
};

// ===== File 3: Teacher Payout Import =====
// Columns: Ngày, Giáo viên, Môn lớp, Sĩ số, Tổng thu, Tỉ lệ trả, GV nhận,
//          Tạm ứng L1..L4, Trả qua TK, Trả tiền mặt, Ghi chú

export interface TeacherPayoutImportResult {
  newTeachers: number;
  newSalaryRecords: number;
  newTransactions: number;
  rowsProcessed: number;
  warnings: string[];
}

export const importTeacherPayoutExcel = (
  fileData: ArrayBuffer | string,
  prev: DataState
): { next: Partial<DataState>; result: TeacherPayoutImportResult } => {
  const wb = XLSX.read(fileData, { type: typeof fileData === 'string' ? 'binary' : 'array' });
  const teachers = [...prev.teachers];
  const salaryRecords = [...prev.salaryRecords];
  const transactions = [...prev.transactions];

  const res: TeacherPayoutImportResult = {
    newTeachers: 0,
    newSalaryRecords: 0,
    newTransactions: 0,
    rowsProcessed: 0,
    warnings: [],
  };

  const beforeTeachers = teachers.length;
  const beforeSalary = salaryRecords.length;
  const beforeTx = transactions.length;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const matrix = readSheetMatrix(ws);
    if (matrix.length === 0) continue;

    // Find header row by searching "Giáo viên" + "Ngày"
    let headerRow = -1;
    for (let i = 0; i < Math.min(matrix.length, 10); i++) {
      const lower = matrix[i].map((c) => norm(c).toLowerCase());
      if (lower.some((v) => v === 'ngày') && lower.some((v) => v.includes('giáo viên'))) {
        headerRow = i;
        break;
      }
    }
    if (headerRow < 0) continue;

    const h = matrix[headerRow];
    const idxDate = headerIndex(h, ['ngày']);
    const idxTeacher = headerIndex(h, ['giáo viên']);
    const idxClass = headerIndex(h, ['môn, lớp', 'môn lớp', 'lớp']);
    const idxSize = headerIndex(h, ['sĩ số']);
    const idxRevenue = headerIndex(h, ['tổng thu']);
    const idxRate = headerIndex(h, ['tỉ lệ trả', 'tỷ lệ trả', 'tỉ lệ', 'tỷ lệ']);
    const idxReceive = headerIndex(h, ['gv nhận']);
    const idxBank = headerIndex(h, ['trả qua tk', 'qua tk']);
    const idxCash = headerIndex(h, ['trả tiền mặt', 'tiền mặt']);
    const idxNote = headerIndex(h, ['ghi chú']);

    // Reference year from rows above header
    let refYear: number | undefined;
    for (let i = 0; i < headerRow; i++) {
      const joined = matrix[i].map(norm).join(' ');
      const m = joined.match(/(\d{4})/);
      if (m) {
        refYear = Number(m[1]);
        break;
      }
    }

    for (let r = headerRow + 1; r < matrix.length; r++) {
      const row = matrix[r];
      const teacherName = idxTeacher >= 0 ? norm(row[idxTeacher]) : '';
      if (!teacherName) continue;
      const dateRaw = idxDate >= 0 ? row[idxDate] : '';
      const date = parseShortDate(dateRaw, refYear);
      if (!date) continue;

      const subjectClass = idxClass >= 0 ? norm(row[idxClass]) : '';
      const revenue = idxRevenue >= 0 ? parseAmount(row[idxRevenue]) : 0;
      const rateRaw = idxRate >= 0 ? norm(row[idxRate]) : '';
      // Rate could be "0.7" or "70%"
      let rate = Number(rateRaw.replace('%', '').replace(',', '.'));
      if (!isFinite(rate) || rate === 0) rate = 0;
      if (rate > 1) rate = rate / 100;
      const salaryRate = Math.round(rate * 100);

      const receive = idxReceive >= 0 ? parseAmount(row[idxReceive]) : Math.round(revenue * rate);
      const bankAmount = idxBank >= 0 ? parseAmount(row[idxBank]) : 0;
      const cashAmount = idxCash >= 0 ? parseAmount(row[idxCash]) : 0;
      const note = idxNote >= 0 ? norm(row[idxNote]) : '';

      const teacher = findOrCreateTeacher(teachers, teacherName);
      if (salaryRate && !teacher.salaryRate) teacher.salaryRate = salaryRate;

      res.rowsProcessed++;

      const month = dayjs(date).format('YYYY-MM');
      const salary: SalaryRecord = {
        id: uuidv4(),
        teacherId: teacher.id,
        month,
        totalSessions: 0,
        totalRevenue: revenue,
        salaryRate: salaryRate || teacher.salaryRate,
        salaryAmount: receive,
        status: bankAmount + cashAmount > 0 ? 'paid' : 'pending',
        paidDate: bankAmount + cashAmount > 0 ? date : undefined,
      };
      salaryRecords.push(salary);

      // Record bank transfer payout
      if (bankAmount > 0) {
        transactions.push({
          id: uuidv4(),
          type: 'expense',
          amount: bankAmount,
          category: 'Lương giáo viên',
          description: `Trả lương (CK) ${teacher.name} - ${subjectClass}${note ? ' - ' + note : ''}`,
          date,
          relatedTeacherId: teacher.id,
          paymentMethod: 'transfer',
        });
      }
      // Record cash payout
      if (cashAmount > 0) {
        transactions.push({
          id: uuidv4(),
          type: 'expense',
          amount: cashAmount,
          category: 'Lương giáo viên',
          description: `Trả lương (TM) ${teacher.name} - ${subjectClass}${note ? ' - ' + note : ''}`,
          date,
          relatedTeacherId: teacher.id,
          paymentMethod: 'cash',
        });
      }
    }
  }

  res.newTeachers = teachers.length - beforeTeachers;
  res.newSalaryRecords = salaryRecords.length - beforeSalary;
  res.newTransactions = transactions.length - beforeTx;

  return {
    next: { teachers, salaryRecords, transactions },
    result: res,
  };
};
