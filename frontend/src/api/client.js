import axios from 'axios'
import { supabase } from '../lib/supabase'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000' })

api.interceptors.request.use(async (config) => {
  if (localStorage.getItem('devMode') === 'true') {
    config.headers.Authorization = 'Bearer dev-token'
  } else {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`
    }
  }
  return config
})

export const getMe = () => api.get('/me').then(r => r.data)

export const getContacts = () => api.get('/contacts').then(r => r.data)
export const createContact = (contact) => api.post('/contacts', contact).then(r => r.data)
export const uploadCSV = (file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/contacts/upload', form).then(r => r.data)
}
export const patchContact = (id, updates) => api.patch(`/contacts/${id}`, updates).then(r => r.data)
export const deleteContact = (id) => api.delete(`/contacts/${id}`).then(r => r.data)

export const generateEmail = (id) => api.post(`/generate/${id}`).then(r => r.data)
export const composeEmail = (prompt, context) => api.post('/compose', { prompt, context }).then(r => r.data)
export const generateBatch = () => api.post('/generate/batch').then(r => r.data)
export const generateBatchCustom = (prompt, contactIds) => api.post('/generate/batch/custom', { prompt, contact_ids: contactIds }).then(r => r.data)

export const sendEmails = (contactIds, options = {}) =>
  api.post('/send', { contact_ids: contactIds, ...options }).then(r => r.data)
export const scanReplies = () => api.post('/scan-replies').then(r => r.data)

export const getStats = () => api.get('/stats').then(r => r.data)
export const getSettings = () => api.get('/settings').then(r => r.data)
export const updateSettings = (updates) => api.patch('/settings', updates).then(r => r.data)
export const getTemplates = () => api.get('/templates').then(r => r.data)
export const updateTemplate = (tier, updates) => api.patch(`/templates/${tier}`, updates).then(r => r.data)

export const getGmailAuthUrl = () => api.get('/gmail/auth-url').then(r => r.data)
export const getGmailStatus = () => api.get('/gmail/status').then(r => r.data)

export const inviteUser = (email) => api.post(`/invite?email=${encodeURIComponent(email)}`).then(r => r.data)

export const getScheduled = () => api.get('/scheduled').then(r => r.data)
export const browseFile = () => api.get('/browse-file').then(r => r.data)
export const sendTestEmail = (subject, body) => api.post('/send-test', { subject, body }).then(r => r.data)
