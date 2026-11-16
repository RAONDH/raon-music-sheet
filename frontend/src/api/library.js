import { apiFetch } from './client'

// 공용 곡 목록 (관리자가 공용으로 연 팀의 곡 정보, 악보 제외)
export function getLibrary() {
  return apiFetch('/library')
}
export function copyFromLibrary(songIds, team) {
  return apiFetch('/library/copy', { method: 'POST', body: JSON.stringify({ songIds, team: team || null }) })
}
