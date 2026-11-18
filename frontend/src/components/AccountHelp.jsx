import { useState } from 'react'
import { checkEmailRequest, forgotPasswordRequest } from '../api/auth'

// 로그인 화면의 "이메일·비밀번호를 잊으셨나요?" — 가입한 이메일인지 확인하거나, 비밀번호 재설정 메일을 받는다.
// 로그인 <form> 안에 들어가므로 form을 쓰지 않는다 (form 안의 form은 안 되고, Enter가 로그인으로 넘어가지 않게 막는다)
export default function AccountHelp({ onUseEmail }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [result, setResult] = useState(null) // { email, registered }
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState('')

  async function handleSend(target) {
    const to = (target || email).trim()
    if (!to) return
    setError('')
    setSent('')
    setSending(true)
    try {
      const r = await forgotPasswordRequest(to)
      setSent(r.message)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  async function handleCheck() {
    if (!email.trim()) return
    setError('')
    setResult(null)
    setChecking(true)
    try {
      setResult(await checkEmailRequest(email))
    } catch (err) {
      setError(err.message)
    } finally {
      setChecking(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="link-button" onClick={() => setOpen(true)}>
        이메일·비밀번호를 잊으셨나요?
      </button>
    )
  }

  return (
    <div className="account-help">
      <b>이메일 확인 · 비밀번호 찾기</b>
      <p>가입한 이메일을 넣고 <b>확인</b>을 누르면 가입되어 있는지 알려 드립니다. 비밀번호를 잊었다면 <b>비밀번호 재설정 메일 받기</b>를 누르세요. 그 이메일로 새 비밀번호를 정하는 링크가 갑니다.</p>
      <div className="account-help-form">
        <input
          type="email"
          placeholder="예: name@gmail.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCheck() } }}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-label="확인할 이메일"
        />
        <button type="button" className="secondary" onClick={handleCheck} disabled={checking || !email.trim()}>
          {checking ? '확인 중...' : '확인'}
        </button>
      </div>
      <button type="button" onClick={() => handleSend()} disabled={sending || !email.trim()} style={{ marginTop: 8 }}>
        {sending ? '보내는 중...' : '✉️ 비밀번호 재설정 메일 받기'}
      </button>
      {sent && <div className="account-help-result ok" role="status">✓ {sent}</div>}

      {result?.registered && (
        <div className="account-help-result ok">
          ✓ <b>{result.email}</b> 는 가입된 이메일입니다.
          <button type="button" className="link-button" onClick={() => { onUseEmail(result.email); setOpen(false) }}>
            이 이메일로 로그인하기
          </button>
          비밀번호가 기억나지 않으면 위의 <b>비밀번호 재설정 메일 받기</b>를 누르세요.
        </div>
      )}
      {result && !result.registered && (
        <div className="account-help-result no">
          <b>{result.email}</b> 는 가입되지 않은 이메일입니다. 다른 이메일로 확인해 보거나, 처음이라면 회원가입을 해 주세요.
        </div>
      )}
      {error && <p className="error-text">{error}</p>}

      <p className="account-help-note">
        어떤 이메일로 가입했는지 전혀 모르겠거나 메일이 오지 않으면 <b>팀장에게 문의</b>하세요. 팀장은 팀 탭에서 팀원 이메일을 보고 임시 비밀번호를 만들어 줄 수 있습니다.
      </p>
      <button type="button" className="link-button" onClick={() => setOpen(false)}>닫기</button>
    </div>
  )
}
