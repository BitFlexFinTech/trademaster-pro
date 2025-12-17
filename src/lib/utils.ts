import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Export data as CSV file and trigger download
 */
export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  filename: string,
  columns?: { key: keyof T; header: string }[]
) {
  if (data.length === 0) return;

  // Auto-detect columns if not provided
  const cols = columns || Object.keys(data[0]).map(key => ({ key: key as keyof T, header: key }));
  
  // Create CSV header
  const header = cols.map(c => `"${c.header}"`).join(',');
  
  // Create CSV rows
  const rows = data.map(row => 
    cols.map(c => {
      const value = row[c.key];
      if (value === null || value === undefined) return '';
      if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
      if (typeof value === 'object' && Object.prototype.toString.call(value) === '[object Date]') {
        return `"${(value as Date).toISOString()}"`;
      }
      return String(value);
    }).join(',')
  );
  
  // Combine and create blob
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  
  // Trigger download
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}
