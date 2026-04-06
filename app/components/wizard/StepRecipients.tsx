'use client';

import React, { useState, useRef, useCallback } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { Recipient } from '@/app/types';

interface StepRecipientsProps {
  recipients: Recipient[];
  setRecipients: (r: Recipient[]) => void;
  onNext: () => void;
  onBack: () => void;
}

interface ParseStats {
  valid: number;
  invalid: number;
  duplicates: number;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.toLowerCase());

const findColumn = (headers: string[], searchTerms: string[]): string | undefined => {
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
  for (const term of searchTerms) {
    const index = normalizedHeaders.findIndex(h => h.includes(term));
    if (index !== -1) return headers[index];
  }
  return undefined;
};

export default function StepRecipients({ recipients, setRecipients, onNext, onBack }: StepRecipientsProps) {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ParseStats | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processData = (data: Record<string, string>[]) => {
    if (data.length === 0) {
      setError('The file appears to be empty.');
      return;
    }

    const headers = Object.keys(data[0]);
    const emailCol = findColumn(headers, ['email', 'e-mail', 'email_address', 'emailaddress']);
    const nameCol = findColumn(headers, ['name', 'full_name', 'fullname', 'first_name', 'firstname']);

    if (!emailCol) {
      setError('Could not detect an "email" column. Please check your file.');
      return;
    }

    const seenEmails = new Set<string>();
    const validRecipients: Recipient[] = [];
    let invalidCount = 0;
    let duplicateCount = 0;

    data.forEach((row) => {
      const rawEmail = (row[emailCol] || '').toString().trim();
      const rawName = nameCol ? (row[nameCol] || '').toString().trim() : undefined;

      if (!rawEmail) return;

      if (!validateEmail(rawEmail)) {
        invalidCount++;
        return;
      }

      const email = rawEmail.toLowerCase();
      if (seenEmails.has(email)) {
        duplicateCount++;
        return;
      }

      seenEmails.add(email);
      validRecipients.push({ email, name: rawName || undefined });
    });

    setStats({ valid: validRecipients.length, invalid: invalidCount, duplicates: duplicateCount });
    setRecipients(validRecipients);
    setError(null);
  };

  const handleFile = (file: File) => {
    setError(null);
    setStats(null);

    if (file.size > MAX_FILE_SIZE) {
      setError('File exceeds the 5MB limit.');
      return;
    }

    setFileName(file.name);
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          processData(results.data as Record<string, string>[]);
        },
        error: () => setError('Error reading CSV file.'),
      });
    } else if (extension === 'xlsx' || extension === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet);
          processData(json);
        } catch {
          setError('Error reading Excel file.');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      setError('Unsupported file format. Please upload a .csv, .xls, or .xlsx file.');
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  }, []);

  const clearFile = () => {
    setFileName(null);
    setRecipients([]);
    setStats(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex flex-col text-cp-light">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold font-heading text-white mb-1">Upload Recipients</h2>
          <p className="text-cp-grey text-sm">Upload a CSV or Excel file containing your recipients.</p>
        </div>

        {!fileName ? (
          <div
            className={`relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-xl transition-colors cursor-pointer ${
              dragActive ? 'border-white bg-white/5' : 'border-cp-muted bg-cp-dark hover:bg-cp-border/50 hover:border-cp-muted'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <div className="p-4 bg-cp-border rounded-full mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-lg font-medium text-cp-light mb-1">Click to upload or drag and drop</p>
            <p className="text-sm text-cp-grey">CSV, XLS, XLSX (Max 5MB)</p>
          </div>
        ) : (
          <div className="bg-cp-dark border border-cp-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-white/10 rounded-lg">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-white">{fileName}</p>
                  <button onClick={clearFile} className="text-sm text-red-400/80 hover:text-red-300 transition-colors">
                    Remove file
                  </button>
                </div>
              </div>
            </div>

            {stats && (
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-cp-black border border-cp-border rounded-lg p-4">
                  <p className="text-sm text-cp-grey mb-1">Valid Recipients</p>
                  <p className="text-2xl font-semibold text-emerald-400/80">{stats.valid}</p>
                </div>
                <div className="bg-cp-black border border-cp-border rounded-lg p-4">
                  <p className="text-sm text-cp-grey mb-1">Invalid Emails</p>
                  <p className="text-2xl font-semibold text-red-400/80">{stats.invalid}</p>
                </div>
                <div className="bg-cp-black border border-cp-border rounded-lg p-4">
                  <p className="text-sm text-cp-grey mb-1">Duplicates</p>
                  <p className="text-2xl font-semibold text-amber-400/80">{stats.duplicates}</p>
                </div>
              </div>
            )}

            {recipients.length > 0 && (
              <div className="border border-cp-border rounded-lg overflow-hidden">
                <div className="bg-cp-black px-4 py-2 border-b border-cp-border">
                  <p className="text-xs font-medium text-cp-grey uppercase tracking-wider">Preview (First 10)</p>
                </div>
                <table className="w-full text-sm text-left">
                  <thead className="bg-cp-charcoal text-cp-grey">
                    <tr>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Name</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cp-border">
                    {recipients.slice(0, 10).map((r, i) => (
                      <tr key={i} className="bg-cp-dark">
                        <td className="px-4 py-3 text-cp-light">{r.email}</td>
                        <td className="px-4 py-3 text-cp-grey">{r.name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {recipients.length > 10 && (
                  <div className="px-4 py-2 text-center text-sm text-cp-grey border-t border-cp-border">
                    ...and {recipients.length - 10} more
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-center space-x-2 text-red-400/80 bg-red-400/10 p-4 rounded-lg border border-red-400/20">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm">{error}</span>
          </div>
        )}
      </div>

      <div className="flex justify-between mt-8 pt-6 border-t border-cp-border">
        <button onClick={onBack} className="px-6 py-2.5 text-sm font-medium text-cp-light hover:text-white bg-cp-border hover:bg-cp-muted rounded-lg transition-colors flex items-center">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </button>
        <button
          onClick={onNext}
          disabled={recipients.length === 0}
          className="px-6 py-2.5 text-sm font-medium text-black bg-white hover:bg-cp-light disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center"
        >
          Next Step
          <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
