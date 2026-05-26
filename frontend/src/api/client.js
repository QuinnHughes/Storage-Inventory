// Central API helper – all requests go to /api (proxied to :8765 in dev)
const BASE = "/api";

async function request(method, path, body = null) {
  const opts = {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

export const api = {
  // Health
  health: () => request("GET", "/health"),

  // Settings
  getSettings: () => request("GET", "/settings"),
  saveSettings: (database_url) => request("PUT", "/settings", { database_url }),

  // Mapping — floors
  getFloors: () => request("GET", "/mapping/floors"),

  // Mapping — ranges
  getRanges: (floorId) => request("GET", `/mapping/floors/${floorId}/ranges`),
  getRange: (rangeId) => request("GET", `/mapping/ranges/${rangeId}`),
  createRange: (data) => request("POST", "/mapping/ranges", data),
  updateRange: (rangeId, data) => request("PUT", `/mapping/ranges/${rangeId}`, data),
  deleteRange: (rangeId) => request("DELETE", `/mapping/ranges/${rangeId}`),

  // Mapping — shelves
  updateShelf: (shelfId, data) => request("PUT", `/mapping/shelves/${shelfId}`, data),

  // Mapping — search
  searchMap: (prefix) => request("GET", `/mapping/search?prefix=${encodeURIComponent(prefix)}`),

  // Mapping — map shapes (floor plan editor)
  getShapes: (floorId) => request("GET", `/mapping/floors/${floorId}/shapes`),
  createShape: (floorId, data) => request("POST", `/mapping/floors/${floorId}/shapes`, data),
  updateShape: (shapeId, data) => request("PUT", `/mapping/shapes/${shapeId}`, data),
  deleteShape: (shapeId) => request("DELETE", `/mapping/shapes/${shapeId}`),
  bulkUpdateShapes: (updates) => request("POST", "/mapping/shapes/bulk-update", updates),

  // Mapping — piece templates
  getTemplates: () => request("GET", "/mapping/piece-templates"),
  createTemplate: (data) => request("POST", "/mapping/piece-templates", data),
  deleteTemplate: (id) => request("DELETE", `/mapping/piece-templates/${id}`),

  // Mapping — shape groups
  getGroups: (floorId) => request("GET", `/mapping/floors/${floorId}/groups`),
  createGroup: (floorId, data) => request("POST", `/mapping/floors/${floorId}/groups`, data),
  updateGroup: (groupId, data) => request("PUT", `/mapping/groups/${groupId}`, data),
  deleteGroup: (groupId) => request("DELETE", `/mapping/groups/${groupId}`),
  assignShapesToGroup: (groupId, shapeIds) => request("POST", `/mapping/groups/${groupId}/assign`, shapeIds),
  removeShapeFromGroup: (groupId, shapeId) => request("DELETE", `/mapping/groups/${groupId}/shapes/${shapeId}`),

  // Collections
  getCollections:    ()            => request("GET",    "/collections"),
  createCollection:  (data)        => request("POST",   "/collections", data),
  updateCollection:  (id, data)    => request("PUT",    `/collections/${id}`, data),
  deleteCollection:  (id)          => request("DELETE", `/collections/${id}`),

  // Locations (nested under their collection)
  createLocation: (collectionId, data) => request("POST",   `/collections/${collectionId}/locations`, data),
  updateLocation: (collectionId, id, data) => request("PUT",    `/collections/${collectionId}/locations/${id}`, data),
  deleteLocation: (collectionId, id)       => request("DELETE", `/collections/${collectionId}/locations/${id}`),

  // Analytics – upload (XHR so we get upload progress events)
  uploadAnalytics: (file, onProgress) => {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/analytics/upload");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let body;
        try { body = JSON.parse(xhr.responseText); } catch { body = {}; }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new Error(body.detail ?? xhr.statusText));
      };
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.send(form);
    });
  },

  // Analytics – meta (filter options)
  getAnalyticsMeta: () => request("GET", "/analytics/meta"),

  // Analytics – records
  searchRecords: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") qs.set(k, v); });
    return request("GET", `/analytics/records?${qs}`);
  },
  getRecord:    (id)       => request("GET",    `/analytics/records/${id}`),
  updateRecord: (id, data) => request("PUT",    `/analytics/records/${id}`, data),
  deleteRecord: (id)       => request("DELETE", `/analytics/records/${id}`),
};
