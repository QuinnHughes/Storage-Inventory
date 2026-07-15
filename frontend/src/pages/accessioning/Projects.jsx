import { useState, useEffect } from "react";
import { apiFetch } from "../../api/client";

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch("/projects");
      setProjects(Array.isArray(data) ? data : []);
      
      // Auto-select if there's a saved project in localStorage
      const savedProjectId = localStorage.getItem("selectedProjectId");
      if (savedProjectId && Array.isArray(data)) {
        const saved = data.find(p => p.id === parseInt(savedProjectId));
        if (saved) setSelectedProject(saved);
      }
    } catch (err) {
      console.error("Failed to load projects:", err);
      setError("Failed to load projects: " + err.message);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }

  function handleProjectSelect(project) {
    setSelectedProject(project);
    localStorage.setItem("selectedProjectId", project.id);
    localStorage.setItem("selectedProjectName", project.name);
  }

  function handleCreateProject() {
    setShowCreateModal(true);
  }

  function handleEditProject() {
    if (!selectedProject) return;
    setShowEditModal(true);
  }

  async function handleDeleteProject() {
    if (!selectedProject) return;
    if (!window.confirm(`Are you sure you want to delete "${selectedProject.name}"? This will delete all associated data.`)) {
      return;
    }

    try {
      await apiFetch(`/projects/${selectedProject.id}`, { method: "DELETE" });
      setSelectedProject(null);
      localStorage.removeItem("selectedProjectId");
      localStorage.removeItem("selectedProjectName");
      await fetchProjects();
    } catch (err) {
      setError("Failed to delete project: " + err.message);
    }
  }

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Projects</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Project Selection */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Select Active Project</h2>
        
        {projects.length === 0 ? (
          <p className="text-gray-500 mb-4">No projects yet. Create one to get started!</p>
        ) : (
          <div className="mb-4">
            <select
              value={selectedProject?.id || ""}
              onChange={(e) => {
                const project = projects.find(p => p.id === parseInt(e.target.value));
                handleProjectSelect(project);
              }}
              className="w-full max-w-md px-4 py-3 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">-- Select a Project --</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedProject && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">Active Project: {selectedProject.name}</h3>
            {selectedProject.description && (
              <p className="text-blue-700 text-sm">{selectedProject.description}</p>
            )}
            <div className="mt-3">
              <strong className="text-blue-900">Categories:</strong>
              <ul className="mt-1 space-y-1">
                {selectedProject.categories.map((cat) => (
                  <li key={cat.id} className="text-blue-700 text-sm">
                    • {cat.name}: {cat.shelf_target} shelves needed, {cat.default_items_per_shelf} items/shelf
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleCreateProject}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
          >
            Create New Project
          </button>
          
          {selectedProject && (
            <>
              <button
                onClick={handleEditProject}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Edit Project
              </button>
              
              <button
                onClick={handleDeleteProject}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                Delete Project
              </button>
            </>
          )}
        </div>
      </div>

      {/* Project Stats */}
      {selectedProject && <ProjectStats projectId={selectedProject.id} />}

      {/* Modals */}
      {showCreateModal && (
        <ProjectModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSave={() => {
            setShowCreateModal(false);
            fetchProjects();
          }}
        />
      )}

      {showEditModal && selectedProject && (
        <ProjectModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSave={() => {
            setShowEditModal(false);
            fetchProjects();
          }}
          project={selectedProject}
        />
      )}
    </div>
  );
}

// Project Stats Component
function ProjectStats({ projectId }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchStats();
  }, [projectId]);

  async function fetchStats() {
    try {
      const data = await apiFetch(`/projects/${projectId}/stats`);
      setStats(data);
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  }

  if (!stats) return null;

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">Project Progress</h2>
      
      <div className="space-y-4">
        {stats.categories.map((cat) => (
          <div key={cat.category_id} className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-lg mb-2">{cat.category_name}</h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Target:</span>
                <div className="text-2xl font-bold text-blue-600">{cat.shelf_target}</div>
              </div>
              <div>
                <span className="text-gray-600">Recorded:</span>
                <div className="text-2xl font-bold text-green-600">{cat.total_shelves}</div>
              </div>
              <div>
                <span className="text-gray-600">Available:</span>
                <div className="text-2xl font-bold text-yellow-600">{cat.available_shelves}</div>
              </div>
              <div>
                <span className="text-gray-600">Accessioned:</span>
                <div className="text-2xl font-bold text-purple-600">{cat.accessioned_shelves}</div>
              </div>
            </div>
            
            {cat.remaining_needed > 0 && (
              <div className="mt-2 text-sm text-orange-600">
                ⚠️ Still need {cat.remaining_needed} more shelves
              </div>
            )}
            
            {/* Progress bar */}
            <div className="mt-3">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (cat.total_shelves / cat.shelf_target) * 100)}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {Math.round((cat.total_shelves / cat.shelf_target) * 100)}% of target
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Project Create/Edit Modal
function ProjectModal({ isOpen, onClose, onSave, project = null }) {
  const isEdit = !!project;
  const [formData, setFormData] = useState({
    name: project?.name || "",
    description: project?.description || "",
    categories: project?.categories || []
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function addCategory() {
    setFormData({
      ...formData,
      categories: [
        ...formData.categories,
        { name: "", shelf_target: 0, default_items_per_shelf: 25 }
      ]
    });
  }

  function updateCategory(index, field, value) {
    const updated = [...formData.categories];
    updated[index][field] = value;
    setFormData({ ...formData, categories: updated });
  }

  function removeCategory(index) {
    const updated = formData.categories.filter((_, i) => i !== index);
    setFormData({ ...formData, categories: updated });
  }

  async function handleSave() {
    setError("");
    
    // Validation
    if (!formData.name.trim()) {
      setError("Project name is required");
      return;
    }
    
    if (formData.categories.length === 0) {
      setError("At least one category is required");
      return;
    }
    
    for (const cat of formData.categories) {
      if (!cat.name.trim()) {
        setError("All categories must have a name");
        return;
      }
      if (cat.shelf_target <= 0) {
        setError("Shelf target must be greater than 0");
        return;
      }
      if (cat.default_items_per_shelf <= 0) {
        setError("Default items per shelf must be greater than 0");
        return;
      }
    }

    try {
      setSaving(true);
      const url = isEdit ? `/projects/${project.id}` : "/projects";
      const method = isEdit ? "PUT" : "POST";
      
      await apiFetch(url, {
        method,
        body: JSON.stringify(formData)
      });

      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4">
            {isEdit ? "Edit Project" : "Create New Project"}
          </h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {/* Project Name */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Project Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., Veterinary Library Project"
            />
          </div>

          {/* Description */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows="3"
              placeholder="Optional description"
            />
          </div>

          {/* Categories */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Categories *
              </label>
              <button
                onClick={addCategory}
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
              >
                + Add Category
              </button>
            </div>

            <div className="space-y-3">
              {formData.categories.map((cat, index) => (
                <div key={index} className="border border-gray-300 rounded-lg p-4 relative">
                  <button
                    onClick={() => removeCategory(index)}
                    className="absolute top-2 right-2 text-red-600 hover:text-red-800"
                  >
                    ✕
                  </button>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Category Name
                      </label>
                      <input
                        type="text"
                        value={cat.name}
                        onChange={(e) => updateCategory(index, "name", e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded"
                        placeholder="e.g., Bound Journals"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Shelves Needed
                      </label>
                      <input
                        type="number"
                        value={cat.shelf_target}
                        onChange={(e) => updateCategory(index, "shelf_target", parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-1 border border-gray-300 rounded"
                        min="1"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Items per Shelf
                      </label>
                      <input
                        type="number"
                        value={cat.default_items_per_shelf}
                        onChange={(e) => updateCategory(index, "default_items_per_shelf", parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-1 border border-gray-300 rounded"
                        min="1"
                      />
                    </div>
                  </div>
                </div>
              ))}

              {formData.categories.length === 0 && (
                <p className="text-gray-500 text-sm italic">No categories yet. Add at least one category.</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {saving ? "Saving..." : (isEdit ? "Update Project" : "Create Project")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
