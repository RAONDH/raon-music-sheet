import { apiFetch } from './client'

export function loginRequest(payload) {
  return apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function signupRequest(payload) {
  return apiFetch('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function changePasswordRequest(payload) {
  return apiFetch('/auth/change-password', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}
export function checkEmailRequest(email) {
  return apiFetch('/auth/check-email', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}
export function forgotPasswordRequest(email) {
  return apiFetch('/auth/forgot-password', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({ email }),
  })
}
export function resetPasswordRequest(token, password) {
  return apiFetch('/auth/reset-password', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({ token, password }),
  })
}
