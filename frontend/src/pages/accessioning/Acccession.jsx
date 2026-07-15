import { useState, useEffect } from 'react';
import { apiFetch } from "../../api/client";

export default function Accessioning() {
  const [shelves, setShelves] = useState([]);
  const [selectedShelf, setSelectedShelf] = useState(null);
  const [itemCount, setItemCount] = useState('');
  const [additionalCount, setAdditionalCount] = useState('');
  const [excelPreview, setExcelPreview] = useState(null);
  const [labelsPreview, setLabelsPreview] = useState(null);
  const [additionalLabels, setAdditionalLabels] = useState(null);
  const [showExcelPreview, setShowExcelPreview] = useState(false);
  const [showLabelsPreview, setShowLabelsPreview] = useState(false);
  const [showAdditionalLabels, setShowAdditionalLabels] = useState(false);

  const projectId = localStorage.getItem('selectedProjectId');
  const projectName = localStorage.getItem('selectedProjectName');

  useEffect(() => {
    if (projectId) {
      loadShelves();
    }
  }, [projectId]);

  const loadShelves = async () => {
    try {
      const data = await apiFetch(`/shelves?project_id=${projectId}&status=available`);
      setShelves(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load shelves:', error);
      setShelves([]);
      alert('Failed to load shelves. Make sure the backend server is running.');
    }
  };

  const handleShelfChange = (e) => {
    const shelfId = e.target.value;
    const shelf = shelves.find(s => s.id === parseInt(shelfId));
    setSelectedShelf(shelf);
    setItemCount('');
    setExcelPreview(null);
    setLabelsPreview(null);
    setAdditionalLabels(null);
    setShowExcelPreview(false);
    setShowLabelsPreview(false);
    setShowAdditionalLabels(false);
  };

  const generateMaterials = async () => {
    if (!selectedShelf || !itemCount || itemCount <= 0) {
      alert('Please enter a valid item count');
      return;
    }

    try {
      // Generate Excel preview
      const excelData = await apiFetch('/accession/generate-excel', {
        method: 'POST',
        body: JSON.stringify({
          project_id: parseInt(projectId),
          shelf_call_number: selectedShelf.call_number,
          item_count: parseInt(itemCount)
        })
      });
      setExcelPreview(excelData);

      // Generate labels preview
      const labelsData = await apiFetch('/accession/generate-labels', {
        method: 'POST',
        body: JSON.stringify({
          project_id: parseInt(projectId),
          shelf_call_number: selectedShelf.call_number,
          item_count: parseInt(itemCount)
        })
      });
      setLabelsPreview(labelsData.labels);
    } catch (error) {
      console.error('Failed to generate materials:', error);
      alert('Failed to generate materials: ' + error.message);
    }
  };

  const downloadExcel = async () => {
    if (!selectedShelf || !itemCount) return;

    try {
      const response = await fetch('/api/accession/download-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: parseInt(projectId),
          shelf_call_number: selectedShelf.call_number,
          item_count: parseInt(itemCount)
        })
      });

      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `accession_${selectedShelf.call_number.replace(/\//g, '-')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download Excel:', error);
      alert('Failed to download Excel file');
    }
  };

  const copyLabelsToClipboard = (labels) => {
    navigator.clipboard.writeText(labels).then(() => {
      alert('Labels copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy:', err);
      alert('Failed to copy to clipboard');
    });
  };

  const generateAdditionalLabels = async () => {
    if (!selectedShelf || !itemCount || !additionalCount || additionalCount <= 0) {
      alert('Please enter a valid additional count');
      return;
    }

    try {
      const data = await apiFetch('/accession/generate-additional-labels', {
        method: 'POST',
        body: JSON.stringify({
          project_id: parseInt(projectId),
          shelf_call_number: selectedShelf.call_number,
          current_item_count: parseInt(itemCount),
          additional_count: parseInt(additionalCount)
        })
      });
      setAdditionalLabels(data.labels);
      setShowAdditionalLabels(true);
    } catch (error) {
      console.error('Failed to generate additional labels:', error);
      alert('Failed to generate additional labels: ' + error.message);
    }
  };

  if (!projectId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-lg">Please select a project from the Projects page first.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Accessioning</h1>
        <p className="mt-2 text-sm text-gray-700">
          Project: <span className="font-semibold">{projectName}</span>
        </p>
      </div>

      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Generate Accessioning Materials</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Shelf
            </label>
            <select
              value={selectedShelf?.id || ''}
              onChange={handleShelfChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Choose a shelf...</option>
              {shelves.map((shelf) => (
                <option key={shelf.id} value={shelf.id}>
                  {shelf.call_number}
                </option>
              ))}
            </select>
          </div>

          {selectedShelf && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Number of Items
              </label>
              <input
                type="number"
                min="1"
                value={itemCount}
                onChange={(e) => setItemCount(e.target.value)}
                placeholder="e.g., 25"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}

          {selectedShelf && itemCount && (
            <button
              onClick={generateMaterials}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Generate Materials
            </button>
          )}
        </div>
      </div>

      {/* Excel Preview */}
      {excelPreview && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Excel Sheet</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setShowExcelPreview(!showExcelPreview)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                {showExcelPreview ? 'Hide' : 'Show'} Preview
              </button>
              <button
                onClick={downloadExcel}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Download Excel
              </button>
            </div>
          </div>

          {showExcelPreview && (
            <div className="border rounded-md overflow-auto max-h-96">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Barcode
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Alternative Call Number
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {excelPreview.rows?.map((row, idx) => (
                    <tr key={idx}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {row.barcode || '(empty)'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {row.alternative_call_number}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Labels Preview */}
      {labelsPreview && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Batch Print Labels</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setShowLabelsPreview(!showLabelsPreview)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                {showLabelsPreview ? 'Hide' : 'Show'} Preview
              </button>
              <button
                onClick={() => copyLabelsToClipboard(labelsPreview)}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Copy to Clipboard
              </button>
            </div>
          </div>

          {showLabelsPreview && (
            <pre className="bg-gray-50 p-4 rounded-md overflow-auto max-h-96 text-sm font-mono">
              {labelsPreview}
            </pre>
          )}
        </div>
      )}

      {/* Additional Labels Generator */}
      {excelPreview && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Generate Additional Labels</h3>
          <p className="text-sm text-gray-600 mb-4">
            If you need more labels than originally generated, enter the additional count here.
          </p>
          
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Additional Items Count
              </label>
              <input
                type="number"
                min="1"
                value={additionalCount}
                onChange={(e) => setAdditionalCount(e.target.value)}
                placeholder="e.g., 3"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              onClick={generateAdditionalLabels}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Generate
            </button>
          </div>

          {additionalLabels && showAdditionalLabels && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-gray-900">Additional Labels Preview</h4>
                <button
                  onClick={() => copyLabelsToClipboard(additionalLabels)}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Copy to Clipboard
                </button>
              </div>
              <pre className="bg-gray-50 p-4 rounded-md overflow-auto max-h-64 text-sm font-mono">
                {additionalLabels}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
