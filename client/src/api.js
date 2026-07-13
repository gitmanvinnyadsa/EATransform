/** Thin typed-ish API client. All backend access goes through here. */

async function req(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.details = data?.details;
    throw err;
  }
  return data;
}

export const api = {
  health: () => req('/health'),
  // projects
  listProjects: () => req('/projects'),
  createProject: (body) => req('/projects', { method: 'POST', body }),
  getProject: (id) => req(`/projects/${id}`),
  updateProject: (id, body) => req(`/projects/${id}`, { method: 'PATCH', body }),
  deleteProject: (id) => req(`/projects/${id}`, { method: 'DELETE' }),
  // processes
  createProcess: (body) => req('/processes', { method: 'POST', body }),
  getProcess: (id) => req(`/processes/${id}`),
  saveMap: (id, map, { snapshot = true, versionLabel = '', source = 'manual' } = {}) =>
    req(`/processes/${id}/map?snapshot=${snapshot ? 1 : 0}`, {
      method: 'PUT',
      body: { map, versionLabel, source },
    }),
  applyOperations: (id, operations) =>
    req(`/processes/${id}/operations`, { method: 'POST', body: { operations } }),
  autoLayout: (id) => req(`/processes/${id}/autolayout`, { method: 'POST' }),
  updateProcessMeta: (id, body) => req(`/processes/${id}`, { method: 'PATCH', body }),
  deleteProcess: (id) => req(`/processes/${id}`, { method: 'DELETE' }),
  getAnalysis: (id) => req(`/processes/${id}/analysis`),
  // versions
  listVersions: (id) => req(`/processes/${id}/versions`),
  getVersion: (id, versionId) => req(`/processes/${id}/versions/${versionId}`),
  restoreVersion: (id, versionId) =>
    req(`/processes/${id}/versions/${versionId}/restore`, { method: 'POST' }),
  // AI
  aiStatus: () => req('/ai/status'),
  aiChat: (body) => req('/ai/chat', { method: 'POST', body }),
  aiEdit: (processId, instruction) =>
    req('/ai/edit', { method: 'POST', body: { processId, instruction } }),
  aiInsights: (processId) => req('/ai/insights', { method: 'POST', body: { processId } }),
  aiUsage: () => req('/ai/usage'),
  // documents
  listDocuments: (projectId) => req(`/documents?projectId=${encodeURIComponent(projectId)}`),
  deleteDocument: (id) => req(`/documents/${id}`, { method: 'DELETE' }),
  uploadDocument: async (projectId, file) => {
    const form = new FormData();
    form.append('file', file);
    form.append('projectId', projectId);
    const res = await fetch('/api/documents', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Upload failed');
    return data;
  },
  // export
  exportUrl: (processId, format) => `/api/export/${processId}/${format}`,
  documentModel: (processId) => req(`/export/${processId}/document-model`),
};
