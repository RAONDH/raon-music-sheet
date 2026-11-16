import { apiFetch } from './client'

// 관리자(ADMIN_EMAILS) 회원 관리
export function listMembers(q = '') {
  return apiFetch(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`)
}
export function resetMemberPassword(id) {
  return apiFetch(`/admin/users/${id}/reset-password`, { method: 'POST' })
}
export function setMemberSuspended(id, suspended) {
  return apiFetch(`/admin/users/${id}/suspended`, { method: 'PUT', body: JSON.stringify({ suspended }) })
}
