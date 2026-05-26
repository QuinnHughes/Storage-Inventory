import { useRef, useState } from "react";
import { api } from "../../api/client";

const ACCEPTED = ".csv,.xlsx,.xls";

export default function Upload() {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(null); // 0-100 during XHR upload phase, null otherwise
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState(null);
  const fileRef = useRef();

  const handleFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    setUploading(true);
    setProgress(0);
    setResult(null);
    setError(null);
    try {
      const res = await api.uploadAnalytics(file, (pct) => setProgress(pct));
      setResult(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const onInputChange = (e) => handleFile(e.target.files[0]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-bold mb-2" style={{ color: "#1E4D2B" }}>Upload Analytics</h1>
      <p className="text-base text-gray-500 mb-8">
        Import an Alma analytics export (CSV or Excel). Records are matched to
        a collection by their location code and upserted by barcode — re-uploading
        is always safe.
      </p>

      {/* Drop zone */}
      <div
        className={`relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-14 cursor-pointer transition-colors
          ${dragging ? "border-green-600 bg-green-50" : "border-gray-300 bg-gray-50 hover:border-green-500 hover:bg-green-50"}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED}
          hidden
          onChange={onInputChange}
        />
        <span className="text-4xl">📤</span>
        <p className="text-sm font-medium text-gray-600">
          {dragging ? "Drop to upload" : "Drag & drop a file here, or click to browse"}
        </p>
        <p className="text-xs text-gray-400">Supported formats: .csv, .xlsx, .xls</p>
      </div>

      {/* Progress bar */}
      {uploading && (
        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span className="flex items-center gap-2">
              {progress !== null && progress < 100 ? (
                <>Uploading <span className="font-mono text-gray-700">{fileName}</span>…</>
              ) : (
                <>
                  <svg className="animate-spin h-4 w-4 text-green-700 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Processing <span className="font-mono text-gray-700">{fileName}</span>…
                </>
              )}
            </span>
            {progress !== null && progress < 100 && (
              <span className="font-mono text-xs text-gray-400">{progress}%</span>
            )}
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-150 ease-out rounded-full"
              style={{ width: `${progress ?? 100}%`, backgroundColor: "#1E4D2B" }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-6 bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">
          <span className="font-semibold">Upload failed: </span>{error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="mt-6 bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">✅</span>
            <h2 className="text-base font-semibold text-gray-800">
              Import complete — <span className="font-mono text-sm text-gray-500">{fileName}</span>
            </h2>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Stat label="Created" value={result.created} color="text-green-700" />
            <Stat label="Updated" value={result.updated} color="text-blue-700" />
            <Stat label="Skipped" value={result.skipped} color="text-gray-500" />
          </div>

          {result.unknown_codes.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm">
              <p className="font-medium text-amber-800 mb-1">
                {result.skipped} record{result.skipped !== 1 ? "s" : ""} skipped — unrecognised location code{result.unknown_codes.length !== 1 ? "s" : ""}:
              </p>
              <div className="flex flex-wrap gap-2 mt-1">
                {result.unknown_codes.map((c) => (
                  <span key={c} className="font-mono bg-amber-100 text-amber-900 px-2 py-0.5 rounded text-xs">{c}</span>
                ))}
              </div>
              <p className="text-xs text-amber-700 mt-2">
                Add these codes under <strong>Settings → Collections & Locations</strong> and re-upload.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="bg-gray-50 rounded-lg px-4 py-3 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
