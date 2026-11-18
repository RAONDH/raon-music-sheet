import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { resetPasswordRequest } from '../api/auth'
import { useAuth } from '../context/useAuth'

// 비밀번호 찾기 메일의 링크(/reset-password?token=…)로 여는 화면: 새 비밀번호를 정한다
export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const { token: loginToken, logout } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null) // { email, message }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) return setError('비밀번호는 6자 이상이어야 합니다')
    if (password !== confirm) return setError('새 비밀번호와 확인이 서로 다릅니다')
    setBusy(true)
    try {
      const r = await resetPasswordRequest(token, password)
      // 이 기기에 다른(또는 같은) 계정으로 로그인돼 있었다면 로그아웃해 새 비밀번호로 다시 들어오게 한다
      if (loginToken) logout()
      setDone(r)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="card form-card" onSubmit={handleSubmit}>
        <h1>새 비밀번호 정하기</h1>
        {done ? (
          <>
            <p className="account-help-result ok" role="status">✓ {done.message}</p>
            {done.email && <p className="muted">계정: <b>{done.email}</b></p>}
            <Link to="/" className="button-link">로그인하러 가기</Link>
          </>
        ) : !/^[a-f0-9]{64}$/.test(token) ? (
          <>
            <p className="error-text">링크가 올바르지 않습니다. 메일의 링크를 다시 누르거나, 로그인 화면에서 비밀번호 찾기를 다시 해 주세요.</p>
            <Link to="/" className="button-link">로그인 화면으로</Link>
          </>
        ) : (
          <>
            <p className="muted">앞으로 쓸 비밀번호를 6자 이상으로 넣어 주세요. 바꾸면 다른 기기에 남은 로그인은 모두 끊깁니다.</p>
            <div className="password-field">
              <input
                type={show ? 'text' : 'password'}
                placeholder="새 비밀번호 (6자 이상)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
              <button type="button" className="password-toggle" onClick={() => setShow((v) => !v)} aria-pressed={show}
                aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'}>
                {show ? '숨기기' : '보기'}
              </button>
            </div>
            <input
              type={show ? 'text' : 'password'}
              placeholder="새 비밀번호 확인"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
            <button type="submit" disabled={busy}>{busy ? '바꾸는 중...' : '비밀번호 바꾸기'}</button>
            {error && <p className="error-text">{error}</p>}
            <Link to="/" className="link-button">로그인 화면으로</Link>
          </>
        )}
      </form>
    </div>
  )
}
