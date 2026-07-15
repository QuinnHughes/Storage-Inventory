import { useState, useEffect } from 'react';
import { apiFetch } from "../../api/client";

export default function EmptyShelves() {
  const [shelves, setShelves] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState('available'); // available, accessioned, all
  const [selectedCategory, setSelectedCategory] = useState('');
  const [formData, setFormData] = useState({
    call_number: '',
    category_id: ''
  });

  const projectId = localStorage.getItem('selectedProjectId');
  const projectName = localStorage.getItem('selectedProjectName');

  useEffect(() => {
    if (projectId) {
      loadData();
    }
  }, [projectId, filter, selectedCategory]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load categories
      const projectData = await apiFetch(`/projects/${projectId}`);
      setCategories(projectData.categories || []);
      
      // Load shelves with filter
      let shelvesUrl = `/shelves?project_id=${projectId}`;
      if (filter !== 'all') {
        shelvesUrl += `&status=${filter}`;
      }
      if (selectedCategory) {
        shelvesUrl += `&category_id=${selectedCategory}`;
      }
      const shelvesData = await apiFetch(shelvesUrl);
      setShelves(Array.isArray(shelvesData) ? shelvesData : []);
      
      // Load project stats
      const statsData = await apiFetch(`/projects/${projectId}/stats`);
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load data:', error);
      setShelves([]);
      alert('Failed to load data. Make sure the backend server is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.call_number || !formData.category_id) {
      alert('Please fill in all fields');
      return;
    }

    try {
      await apiFetch('/shelves', {
        method: 'POST',
        body: JSON.stringify({
          project_id: parseInt(projectId),
          category_id: parseInt(formData.category_id),
          call_number: formData.call_number,
          status: 'available'
        })
      });

      setShowModal(false);
      setFormData({ call_number: '', category_id: '' });
      await loadData();
    } catch (error) {
      console.error('Failed to create shelf:', error);
      alert('Failed to create shelf: ' + error.message);
    }
  };

  const toggleShelfStatus = async (shelfId, currentStatus) => {
    const newStatus = currentStatus === 'available' ? 'accessioned' : 'available';
    
    try {
      await apiFetch(`/shelves/${shelfId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });
      await loadData();
    } catch (error) {
      console.error('Failed to update shelf status:', error);
      alert('Failed to update shelf status');
    }
  };

  const deleteShelf = async (shelfId) => {
    if (!confirm('Are you sure you want to delete this shelf?')) return;
    
    try {
      await apiFetch(`/shelves/${shelfId}`, { method: 'DELETE' });
      await loadData();
    } catch (error) {
      console.error('Failed to delete shelf:', error);
      alert('Failed to delete shelf');
    }
  };

  const exportToExcel = async () => {
    try {
      const response = await fetch(
        `/api/shelves/export?project_id=${projectId}${filter !== 'all' ? `&status=${filter}` : ''}`
      );
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `empty_shelves_${projectName}_${filter}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to export:', error);
      alert('Failed to export shelves');
    }
  };

  if (!projectId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-lg">Please select a project from the Projects page first.</p>
      </div>
    );
  }

  const getCategoryName = (categoryId) => {
    const category = categories.find(c => c.id === categoryId);
    return category ? category.name : 'Unknown';
  };

  const getProgress = (categoryId) => {
    if (!stats) return { current: 0, target: 0, percentage: 0 };
    
    const categoryStat = stats.categories?.find(c => c.category_id === categoryId);
    if (!categoryStat) return { current: 0, target: 0, percentage: 0 };
    
    // Show total recorded shelves (available + accessioned) vs target
    const current = categoryStat.total_shelves || 0;
    const target = categoryStat.shelf_target || 0;
    const percentage = target > 0 ? Math.round((current / target) * 100) : 0;
    
    return { current, target, percentage };
  };

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Empty Shelves Recording</h1>
          <p className="mt-2 text-sm text-gray-700">
            Project: <span className="font-semibold">{projectName}</span>
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex gap-2">
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            Add Empty Shelf
          </button>
          <button
            onClick={exportToExcel}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Export to Excel
          </button>
        </div>
      </div>

      {/* Category Progress */}
      {categories.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Category Progress</h3>
          <div className="space-y-4">
            {categories.map((category) => {
              const progress = getProgress(category.id);
              return (
                <div key={category.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">{category.name}</span>
                    <span className="text-gray-500">
                      {progress.current} / {progress.target} shelves ({progress.percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full transition-all"
                      style={{ width: `${Math.min(progress.percentage, 100)}%` }}
                    ></div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Default items per shelf: {category.default_items_per_shelf}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="border-b border-gray-200 mb-4">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setFilter('available')}
            className={`${
              filter === 'available'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Available Shelves
          </button>
          <button
            onClick={() => setFilter('accessioned')}
            className={`${
              filter === 'accessioned'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Accessioned Shelves
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`${
              filter === 'all'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            All Shelves
          </button>
        </nav>
      </div>

      {/* Category Filter */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Category</label>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Shelves Table */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      ) : shelves.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <p className="text-gray-500">No shelves recorded yet.</p>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Call Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {shelves.map((shelf) => (
                <tr key={shelf.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {shelf.call_number}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {getCategoryName(shelf.category_id)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        shelf.status === 'available'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {shelf.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => toggleShelfStatus(shelf.id, shelf.status)}
                      className="text-blue-600 hover:text-blue-900 mr-4"
                    >
                      Mark as {shelf.status === 'available' ? 'Accessioned' : 'Available'}
                    </button>
                    <button
                      onClick={() => deleteShelf(shelf.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Shelf Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Add Empty Shelf</h3>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Call Number
                  </label>
                  <input
                    type="text"
                    value={formData.call_number}
                    onChange={(e) => setFormData({ ...formData, call_number: e.target.value })}
                    placeholder="e.g., S-1-01B-02-03"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Format: S-[floor]-[range]-[ladder]-[shelf]
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="">Select a category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name} ({category.default_items_per_shelf} items/shelf)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setFormData({ call_number: '', category_id: '' });
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  Add Shelf
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
