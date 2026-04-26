"use client";

import { useState, useCallback } from "react";

interface FileUploadProps {
  accept: string;
  label: string;
  onFileLoaded: (content: string, fileName: string, file: File) => void;
  readAsText?: boolean;
}

export default function FileUpload({
  accept,
  label,
  onFileLoaded,
  readAsText = true,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        onFileLoaded(e.target?.result as string, file.name, file);
      };
      if (readAsText) reader.readAsText(file);
      else reader.readAsDataURL(file);
    },
    [onFileLoaded, readAsText]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const isImage = accept.includes("image");

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`relative border-2 border-dashed rounded-xl p-7 text-center cursor-pointer transition-all ${
        isDragging
          ? "border-[var(--color-stebo-yellow)] bg-[var(--color-stebo-yellow-50)] scale-[1.01]"
          : fileName
            ? "border-[var(--color-stebo-blue-300)] bg-[var(--color-stebo-blue-50)]"
            : "border-[var(--color-stebo-line)] bg-white hover:border-[var(--color-stebo-blue-300)] hover:bg-[var(--color-stebo-paper)]"
      }`}
    >
      <input
        type="file"
        accept={accept}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        className="hidden"
        id={`upload-${label}`}
      />
      <label htmlFor={`upload-${label}`} className="cursor-pointer block">
        {fileName ? (
          <div>
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[var(--color-stebo-yellow)] text-[var(--color-stebo-blue-900)] mb-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <p className="text-[var(--color-stebo-blue-900)] font-semibold truncate max-w-full">
              {fileName}
            </p>
            <p className="text-xs text-[var(--color-stebo-mute)] mt-1">
              Klik of sleep om te vervangen
            </p>
          </div>
        ) : (
          <div>
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[var(--color-stebo-yellow-50)] text-[var(--color-stebo-blue-700)] mb-3">
              {isImage ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              )}
            </div>
            <p className="font-semibold text-[var(--color-stebo-ink)]">{label}</p>
            <p className="text-sm text-[var(--color-stebo-mute)] mt-1">
              Sleep bestand hierheen of klik om te uploaden
            </p>
          </div>
        )}
      </label>
    </div>
  );
}
