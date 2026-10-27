/**
 * Excel Import/Export Utilities
 * Cung cấp các hàm tiện ích chung cho việc đọc/ghi file Excel
 */
import * as XLSX from 'xlsx';

/**
 * Đọc file Excel từ File object, trả về Workbook
 */
export const readExcelFile = (file: File): Promise<XLSX.WorkBook> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                resolve(workbook);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('Không thể đọc file'));
        reader.readAsArrayBuffer(file);
    });
};

/**
 * Convert Excel serial date number → YYYY-MM-DD string
 * Excel epoch: 1900-01-01 (với bug leap year 1900)
 */
export const excelDateToString = (serial: number): string => {
    if (!serial || typeof serial !== 'number') return '';
    // Excel serial date → JS Date
    const utcDays = Math.floor(serial - 25569);
    const date = new Date(utcDays * 86400000);
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

/**
 * Format date DD/MM/YYYY từ serial hoặc string
 */
export const excelDateToDisplay = (serial: number): string => {
    const d = excelDateToString(serial);
    if (!d) return '';
    const [yyyy, mm, dd] = d.split('-');
    return `${dd}/${mm}/${yyyy}`;
};

/**
 * Normalize tên tiếng Việt: bỏ dấu, lowercase, trim
 */
const normalizeVN = (str: string): string => {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .trim();
};

/**
 * Tìm HS/GV theo tên gần đúng
 */
export const fuzzyMatchByName = <T extends { id: string; name: string }>(
    searchName: string,
    list: T[]
): T | undefined => {
    if (!searchName?.trim()) return undefined;
    const normalized = normalizeVN(searchName);

    // Exact match first
    const exact = list.find(item => normalizeVN(item.name) === normalized);
    if (exact) return exact;

    // Contains match
    const contains = list.find(item =>
        normalizeVN(item.name).includes(normalized) || normalized.includes(normalizeVN(item.name))
    );
    return contains;
};

/**
 * Parse sheet thành array of arrays (raw)
 */
export const sheetToRawRows = (ws: XLSX.WorkSheet): any[][] => {
    return XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
};

/**
 * Tạo và tải file Excel
 */
export const downloadExcel = (workbook: XLSX.WorkBook, filename: string): void => {
    XLSX.writeFile(workbook, filename);
};

/**
 * Kiểm tra xem giá trị có phải Excel serial date không
 */
export const isExcelSerialDate = (val: any): boolean => {
    return typeof val === 'number' && val > 40000 && val < 60000;
};
