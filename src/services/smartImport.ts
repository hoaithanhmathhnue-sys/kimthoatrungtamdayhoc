/**
 * smartImport.ts — Tiện ích import thông minh
 * Tự động tạo Lớp, ghi danh HS, tạo GV, và phân loại dữ liệu
 */
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import { Student, Teacher, ClassSession, Enrollment } from '../types';
import { fuzzyMatchByName } from './excelUtils';

/**
 * Tìm hoặc tạo lớp mới dựa trên tên lớp + môn
 * Trả về classId
 */
export function findOrCreateClass(
    className: string,
    subject: string,
    existingClasses: ClassSession[],
    newClasses: ClassSession[]
): string {
    if (!className && !subject) return '';

    // Normalize
    const normalName = className.trim();
    const normalSubject = subject.trim();

    // Check existing
    let found = existingClasses.find(c => {
        const nameMatch = c.name.toLowerCase() === normalName.toLowerCase();
        // Nếu cả class name và subject đều match hoặc chỉ class name match
        if (nameMatch && normalSubject) return c.subject.toLowerCase() === normalSubject.toLowerCase();
        return nameMatch;
    });
    if (found) return found.id;

    // Check already created in this import batch
    found = newClasses.find(c => {
        const nameMatch = c.name.toLowerCase() === normalName.toLowerCase();
        if (nameMatch && normalSubject) return c.subject.toLowerCase() === normalSubject.toLowerCase();
        return nameMatch;
    });
    if (found) return found.id;

    // Create new class
    const newId = uuidv4();
    const newClass: ClassSession = {
        id: newId,
        name: normalName || normalSubject,
        teacherId: '',
        subject: normalSubject,
        schedule: '',
        feePerSession: 0,
    };
    newClasses.push(newClass);
    return newId;
}

/**
 * Tìm hoặc tạo học sinh mới, cập nhật thông tin nếu tìm thấy
 * Trả về studentId
 */
export function findOrCreateStudent(
    name: string,
    info: {
        phone?: string;
        dob?: string;
        parentName?: string;
        parentPhone?: string;
        address?: string;
        enrolledSubjects?: string[];
    },
    existingStudents: Student[],
    newStudents: Student[]
): { studentId: string; isNew: boolean; student: Student } {
    const trimmedName = name.trim();
    if (!trimmedName) return { studentId: '', isNew: false, student: {} as Student };

    // Check existing
    const existing = fuzzyMatchByName(trimmedName, existingStudents);
    if (existing) {
        // Update existing student info if new data is available
        const s = existing as Student;
        if (info.phone && !s.phone) s.phone = info.phone;
        if (info.parentName && !s.parentName) s.parentName = info.parentName;
        if (info.parentPhone && !s.parentPhone) s.parentPhone = info.parentPhone;
        if (info.address && !s.address) s.address = info.address;
        if (info.dob && !s.dob) s.dob = info.dob;
        if (info.enrolledSubjects && info.enrolledSubjects.length > 0) {
            const existing_subjects = s.enrolledSubjects || [];
            const merged = [...new Set([...existing_subjects, ...info.enrolledSubjects])];
            s.enrolledSubjects = merged;
        }
        return { studentId: s.id, isNew: false, student: s };
    }

    // Check in newStudents batch
    const inBatch = newStudents.find(s => s.name.toLowerCase() === trimmedName.toLowerCase());
    if (inBatch) {
        if (info.phone && !inBatch.phone) inBatch.phone = info.phone;
        if (info.parentName && !inBatch.parentName) inBatch.parentName = info.parentName;
        if (info.address && !inBatch.address) inBatch.address = info.address;
        if (info.enrolledSubjects) {
            const existing_subjects = inBatch.enrolledSubjects || [];
            inBatch.enrolledSubjects = [...new Set([...existing_subjects, ...info.enrolledSubjects])];
        }
        return { studentId: inBatch.id, isNew: false, student: inBatch };
    }

    // Create new
    const studentId = uuidv4();
    const newStudent: Student = {
        id: studentId,
        name: trimmedName,
        phone: info.phone || '',
        dob: info.dob || '',
        parentName: info.parentName || '',
        parentPhone: info.parentPhone || '',
        joinDate: dayjs().format('YYYY-MM-DD'),
        classId: '',
        enrolledSubjects: info.enrolledSubjects || [],
        applicationStatus: 'active',
        address: info.address,
    };
    newStudents.push(newStudent);
    return { studentId, isNew: true, student: newStudent };
}

/**
 * Tìm hoặc tạo giáo viên mới
 * Trả về teacherId
 */
export function findOrCreateTeacher(
    name: string,
    info: { subject?: string; phone?: string; salaryRate?: number },
    existingTeachers: Teacher[],
    newTeachers: Teacher[]
): { teacherId: string; isNew: boolean } {
    const trimmedName = name.trim();
    if (!trimmedName) return { teacherId: '', isNew: false };

    // Check existing
    const existing = fuzzyMatchByName(trimmedName, existingTeachers);
    if (existing) {
        const t = existing as Teacher;
        // Cập nhật thông tin bổ sung
        if (info.subject && !t.subjects.includes(info.subject)) {
            t.subjects.push(info.subject);
        }
        if (info.salaryRate && !t.salaryRate) t.salaryRate = info.salaryRate;
        return { teacherId: t.id, isNew: false };
    }

    // Check in batch
    const inBatch = newTeachers.find(t => t.name.toLowerCase() === trimmedName.toLowerCase());
    if (inBatch) {
        if (info.subject && !inBatch.subjects.includes(info.subject)) inBatch.subjects.push(info.subject);
        return { teacherId: inBatch.id, isNew: false };
    }

    // Create new
    const teacherId = uuidv4();
    newTeachers.push({
        id: teacherId,
        name: trimmedName,
        phone: info.phone || '',
        email: '',
        subjects: info.subject ? [info.subject] : [],
        salaryRate: info.salaryRate || 0,
        joinDate: dayjs().format('YYYY-MM-DD'),
    });
    return { teacherId, isNew: true };
}

/**
 * Tạo enrollment nếu chưa có
 */
export function ensureEnrollment(
    studentId: string,
    classId: string,
    existingEnrollments: Enrollment[],
    newEnrollments: Enrollment[]
): void {
    if (!studentId || !classId) return;

    const exists = existingEnrollments.some(e => e.studentId === studentId && e.classId === classId)
        || newEnrollments.some(e => e.studentId === studentId && e.classId === classId);
    if (exists) return;

    newEnrollments.push({
        id: uuidv4(),
        studentId,
        classId,
        enrolledAt: dayjs().format('YYYY-MM-DD'),
    });
}
