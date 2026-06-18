import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:8000' })

export const getContacts = () => api.get('/contacts').then(r => r.data)
export const uploadCSV = (file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/contacts/upload', form).then(r => r.data)
}
export const patchContact = (id, updates) => api.patch(`/contacts/${id}`, updates).then(r => r.data)
export const createContact = (contact) => api.post('/contacts', contact).then(r => r.data)
export const deleteContact = (id) => api.delete(`/contacts/${id}`).then(r => r.data)

export const generateEmail = (id) => api.post(`/generate/${id}`).then(r => r.data)
export const generateBatch = () => api.post('/generate/batch').then(r => r.data)

export const sendEmails = (contactIds, scheduledTime = null) =>
  api.post('/send', { contact_ids: contactIds, scheduled_time: scheduledTime }).then(r => r.data)
export const scanReplies = () => api.post('/scan-replies').then(r => r.data)

export const getStats = () => api.get('/stats').then(r => r.data)
export const getSettings = () => api.get('/settings').then(r => r.data)
export const updateSettings = (updates) => api.patch('/settings', updates).then(r => r.data)
export const getTemplates = () => api.get('/templates').then(r => r.data)
export const updateTemplate = (tier, updates) => api.patch(`/templates/${tier}`, updates).then(r => r.data)
