import { useState, useEffect } from 'react';
import { apiFetch } from "../../api/client";

export default function BatchPrinting() {
  const [shelves, setShelves] = useState([]);
  const [selectedShelves, setSelectedShelves] = useState([]);
  const [shelfQuantities, setShelfQuantities] = useState({});
  const [labels, setLabels] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');

  const projectId = localStorage.getItem('selectedProjectId');
  const projectName = localStorage.getItem('selectedProjectName');

  useEffect(() => {
    if (projectId) {
      loadCategories();
      loadShelves();
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      loadShelves();
    }
  }, [selectedCategory]);

  const loadCategories = async () => {
    try {
      const data = await apiFetch(`/projects/${projectId}`);
      setCategories(data.categories || []);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const loadShelves = async () => {
    try {
      let url = `/shelves?project_id=${projectId}&status=available`;
      if (selectedCategory) {
        url += `&category_id=${selectedCategory}`;
      }
      const data = await apiFetch(url);
      const shelvesArray = Array.isArray(data) ? data : [];
      setShelves(shelvesArray);
      
      // Load default quantities
      const defaults = {};
      for (const shelf of shelvesArray) {
        try {
          const defaultData = await apiFetch(`/batch-print/shelf-defaults/${shelf.id}`);
          defaults[shelf.id] = defaultData.default_items_per_shelf;
        } catch (err) {
          console.error(`Failed to load defaults for shelf ${shelf.id}`);
          defaults[shelf.id] = 25; // fallback default
        }
      }
      setShelfQuantities(defaults);
    } catch (error) {
      console.error('Failed to load shelves:', error);
      setShelves([]);
      alert('Failed to load shelves. Make sure the backend server is running.');
    }
  };

  const toggleShelf = (shelfId) => {
    setSelectedShelves(prev => {
      if (prev.includes(shelfId)) {
        return prev.filter(id => id !== shelfId);
      } else {
        return [...prev, shelfId];
      }
    });
  };

  const updateQuantity = (shelfId, quantity) => {
    setShelfQuantities(prev => ({
      ...prev,
      [shelfId]: parseInt(quantity) || 0
    }));
  };

  const generateBatchLabels = async () => {
    if (selectedShelves.length === 0) {
      alert('Please select at least one shelf');
      return;
    }

    const shelfConfigs = selectedShelves.map(shelfId => ({
      shelf_id: shelfId,
      item_count: shelfQuantities[shelfId] || 0
    }));

    try {
      const data = await apiFetch('/batch-print/generate', {
        method: 'POST',
        body: JSON.stringify({
          project_id: parseInt(projectId),
          shelf_configs: shelfConfigs
        })
      });
      setLabels(data.labels);
      setShowPreview(true);
    } catch (error) {
      console.error('Failed to generate batch labels:', error);
      alert('Failed to generate batch labels: ' + error.message);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(labels).then(() => {
      alert('Labels copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy:', err);
      alert('Failed to copy to clipboard');
    });
  };

  const selectAll = () => {
    setSelectedShelves(shelves.map(s => s.id));
  };

  const deselectAll = () => {
    setSelectedShelves([]);
  };

  const getShelfCategory = (shelf) => {
    // You would typically fetch category name from the shelf data
    return shelf.category_name || 'Unknown Category';
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
        <h1 className="text-3xl font-bold text-gray-900">Batch Printing</h1>
        <p className="mt-2 text-sm text-gray-700">
          Project: <span className="font-semibold">{projectName}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Shelf Selection */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Select Shelves</h3>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Select All
              </button>
              <button
                onClick={deselectAll}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Deselect All
              </button>
            </div>
          </div>

          {shelves.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No available shelves found.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-auto">
              {shelves.map((shelf) => (
                <div
                  key={shelf.id}
                  className={`border rounded-md p-3 ${
                    selectedShelves.includes(shelf.id)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedShelves.includes(shelf.id)}
                      onChange={() => toggleShelf(shelf.id)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900">
                          {shelf.call_number}
                        </span>
                        <span className="text-xs text-gray-500">
                          {shelf.category_name}
                        </span>
                      </div>
                      {selectedShelves.includes(shelf.id) && (
                        <div className="mt-2">
                          <label className="block text-xs text-gray-600 mb-1">
                            Items per shelf
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={shelfQuantities[shelf.id] || ''}
                            onChange={(e) => updateQuantity(shelf.id, e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6">
            <button
              onClick={generateBatchLabels}
              disabled={selectedShelves.length === 0}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Generate Batch Labels ({selectedShelves.length} shelves)
            </button>
          </div>
        </div>

        {/* Labels Preview and Output */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Batch Labels Output</h3>
            {labels && (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  {showPreview ? 'Hide' : 'Show'} Preview
                </button>
                <button
                  onClick={copyToClipboard}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Copy to Clipboard
                </button>
              </div>
            )}
          </div>

          {!labels ? (
            <div className="text-center py-12 text-gray-500">
              <p>Select shelves and click "Generate Batch Labels" to see output.</p>
            </div>
          ) : showPreview ? (
            <div>
              <div className="mb-2 text-sm text-gray-600">
                Total labels: {labels.split('===============').length - 1}
              </div>
              <pre className="bg-gray-50 p-4 rounded-md overflow-auto max-h-96 text-xs font-mono">
                {labels}
              </pre>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>Labels generated! Click "Show Preview" to view or "Copy to Clipboard" to use.</p>
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      {selectedShelves.length > 0 && (
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">Selection Summary</h4>
          <div className="text-sm text-blue-800">
            <p>Selected shelves: {selectedShelves.length}</p>
            <p>
              Total labels to generate:{' '}
              {selectedShelves.reduce((sum, shelfId) => sum + (shelfQuantities[shelfId] || 0), 0)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
