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
      if (readAsText) {
        const reader = new FileReader();
        reader.onload = (e) => {
          onFileLoaded(e.target?.result as string, file.name, file);
        };
        reader.readAsText(file);
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          onFileLoaded(e.target?.result as string, file.name, file);
        };
        reader.readAsDataURL(file);
      }
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

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
        isDragging
          ? "border-blue-500 bg-blue-50"
          : fileName
            ? "border-green-400 bg-green-50"
            : "border-gray-300 hover:border-gray-400"
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
      <label htmlFor={`upload-${label}`} className="cursor-pointer">
        {fileName ? (
          <div>
            <p className="text-green-700 font-medium">{fileName}</p>
            <p className="text-sm text-gray-500 mt-1">
              Klik of sleep om te vervangen
            </p>
          </div>
        ) : (
          <div>
            <div className="text-4xl mb-2">
              {accept.includes("image") ? "🖼" : "📄"}
            </div>
            <p className="font-medium text-gray-700">{label}</p>
            <p className="text-sm text-gray-500 mt-1">
              Sleep bestand hierheen of klik om te uploaden
            </p>
          </div>
        )}
      </label>
    </div>
  );
}
