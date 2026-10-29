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
export const importRecruitingFolder = () => api.post('/gmail/import-recruiting').then(r => r.data)

export const inviteUser = (email) => api.post(`/invite?email=${encodeURIComponent(email)}`).then(r => r.data)

export const apolloSearch = (params) => api.post('/apollo/search', params).then(r => r.data)
export const apolloReveal = (apolloIds, dealId = null) => api.post('/apollo/reveal', { apollo_ids: apolloIds, deal_id: dealId }).then(r => r.data)
export const getDeals = (bank = '') => api.get('/deals', { params: { bank } }).then(r => r.data)
export const searchDeals = (bank, days = 90, focus = '', more = false) => api.post('/deals/search', { bank, days, focus, more }).then(r => r.data)
export const addDeal = (deal) => api.post('/deals', deal).then(r => r.data)
export const extractDealFromLink = (url) => api.post('/deals/extract', { url }).then(r => r.data)
export const updateDeal = (id, updates) => api.patch(`/deals/${id}`, updates).then(r => r.data)
export const deleteDeal = (id) => api.delete(`/deals/${id}`).then(r => r.data)
export const getDealsOverview = () => api.get('/deals/overview').then(r => r.data)
export const getDealBrief = (id, refresh = false) => api.post(`/deals/${id}/brief`, { refresh }).then(r => r.data)
export const addDealContacts = (id, people) => api.post(`/deals/${id}/contacts`, { people }).then(r => r.data)
export const revealContacts = (contactIds) => api.post('/contacts/reveal', { contact_ids: contactIds }).then(r => r.data)
export const getDealClientTitles = () => api.get('/deals/client-titles').then(r => r.data)
export const apolloLinkedIn = (url, useCredit = false) => api.post('/apollo/linkedin', { url, use_credit: useCredit }).then(r => r.data)
export const apolloLists =() => api.get('/apollo/lists').then(r => r.data)
export const apolloSaved = (params) => api.post('/apollo/saved', params).then(r => r.data)
export const apolloImportSaved = (body) => api.post('/apollo/saved/import', body).then(r => r.data)

export const getCalendarEvents = (start, end) => api.get('/calendar/events', { params: { start, end } }).then(r => r.data)
export const getUsage = () => api.get('/usage').then(r => r.data)
export const getApplications = () => api.get('/applications').then(r => r.data)
export const createApplication = (app) => api.post('/applications', app).then(r => r.data)
export const updateApplication = (id, updates) => api.patch(`/applications/${id}`, updates).then(r => r.data)
export const deleteApplication = (id) => api.delete(`/applications/${id}`).then(r => r.data)
export const getTodos = () => api.get('/todos').then(r => r.data)
export const createTodo = (todo) => api.post('/todos', todo).then(r => r.data)
export const updateTodo = (id, updates) => api.patch(`/todos/${id}`, updates).then(r => r.data)
export const deleteTodo = (id) => api.delete(`/todos/${id}`).then(r => r.data)

export const getCalendarList =() => api.get('/calendar/list').then(r => r.data)
export const getAvailabilityPreview =(location = '') => api.get('/calendar/availability-preview', { params: { location } }).then(r => r.data)

export const generateFollowups = (contactIds) => api.post('/followups/generate', { contact_ids: contactIds }).then(r => r.data)
export const sendFollowups = (contactIds) => api.post('/followups/send', { contact_ids: contactIds }).then(r => r.data)
export const cancelScheduled = (id) => api.delete(`/scheduled/${id}`).then(r => r.data)
export const cancelAllScheduled = () => api.post('/scheduled/cancel-all').then(r => r.data)
export const getScheduled =() => api.get('/scheduled').then(r => r.data)
export const browseFile = () => api.get('/browse-file').then(r => r.data)
export const uploadAttachment = (file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/attachments', form).then(r => r.data)
}
export const removeAttachment = (ref) => api.delete('/attachments', { params: { ref } }).then(r => r.data)
export const sendTestEmail = (subject, body) => api.post('/send-test', { subject, body }).then(r => r.data)
