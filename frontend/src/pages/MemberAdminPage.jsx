import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import LoginForm from '../components/LoginForm'
import { getOperatorInfo } from '../api/copyright'
import { listMembers, resetMemberPassword, setMemberSuspended } from '../api/admin'

const when = (d) => (d ? new Date(d).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '')

// 관리자(ADMIN_EMAILS)용 회원 관리 화면: 가입한 회원 보기, 비밀번호 초기화, 사용 중지
export default function MemberAdminPage() {
  const { token } = useAuth()
  const [operator, setOperator] = useState(null) // null = 확인 중
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [data, setData] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    getOperatorInfo().then((r) => setOperator(!!r.operator)).catch(() => setOperator(false))
  }, [token])

  const load = useCallback(() => {
    listMembers(search).then((d) => { setData(d); setError('') }).catch((err) => setError(err.message))
  }, [search])
  useEffect(() => { if (operator) load() }, [operator, load])

  if (!token) return <LoginForm />
  if (operator === null) return <div className="dashboard"><div className="card panel">확인하는 중…</div></div>
  if (!operator) {
    return (
      <div className="dashboard">
        <div className="card panel">
          <h2>관리자만 볼 수 있는 화면입니다</h2>
          <p className="muted-dark">회원 관리는 서버 설정 ADMIN_EMAILS에 적힌 관리자 계정만 할 수 있습니다.</p>
          <Link to="/">돌아가기</Link>
        </div>
      </div>
    )
  }

  const users = data?.users || []
  return (
    <div className="dashboard copyright-admin">
      <div className="card panel">
        <h2>👥 회원 관리</h2>
        <p className="muted-dark">
          가입한 회원을 보고, 비밀번호를 잊은 회원에게 <b>임시 비밀번호</b>를 만들어 주거나 계정 <b>사용을 멈출</b> 수 있습니다.
          계정과 곡·콘티는 지우지 않으며, 사용 중지는 언제든 되돌릴 수 있습니다.
        </p>
        <form className="copyright-actions" onSubmit={(e) => { e.preventDefault(); setOpenId(null); setSearch(query.trim()) }}>
          <input type="search" value={query} placeholder="이메일로 찾기" onChange={(e) => setQuery(e.target.value)} aria-label="이메일로 찾기" />
          <button type="submit" className="secondary">찾기</button>
        </form>
        {error && <p className="error-text">{error}</p>}
        {data && <p className="muted-dark member-count">전체 회원 {data.total}명{search && ` · '${search}' 검색 ${users.length}명`}</p>}
        {data && users.length === 0 ? <p className="muted">회원이 없습니다</p> : (
          <ul className="copyright-list">
            {users.map((u) => (
              <li key={u._id}>
                <button type="button" className={`secondary copyright-row${openId === u._id ? ' active' : ''}`} onClick={() => setOpenId(openId === u._id ? null : u._id)}>
                  {u.operator && <span className="copyright-status st-resolved">관리자</span>}
                  {u.suspended && <span className="copyright-status st-blocked">사용 중지</span>}
                  {u.mustChangePassword && <span className="copyright-status st-reviewing">임시 비밀번호</span>}
                  <b>{u.email}</b>{u.me && <small>(나)</small>}
                  <small>
                    {u.teams.length ? u.teams.map((t) => t.name + (t.owner ? '(팀장)' : '')).join(', ') : '팀 없음'}
                    {' · '}마지막 로그인 {u.lastLoginAt ? when(u.lastLoginAt) : '기록 없음'}
                  </small>
                </button>
                {openId === u._id && <MemberDetail user={u} onChanged={load} />}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="copyright-back"><Link to="/copyright/admin">저작권 신고 처리</Link> · <Link to="/">앱으로 돌아가기</Link></p>
    </div>
  )
}

function MemberDetail({ user: u, onChanged }) {
  const [temp, setTemp] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const locked = u.me || u.operator

  async function run(action, done) {
    setMsg('')
    setBusy(true)
    try {
      const r = await action()
      if (done) setMsg(done)
      onChanged()
      return r
    } catch (err) { setMsg(err.message) } finally { setBusy(false) }
  }

  async function reset() {
    if (!window.confirm(`${u.email} 의 비밀번호를 임시 비밀번호로 바꿀까요?\n이 회원이 로그인해 둔 기기는 모두 로그아웃됩니다.`)) return
    const r = await run(() => resetMemberPassword(u._id))
    if (r?.tempPassword) setTemp(r)
  }

  function copy() {
    navigator.clipboard?.writeText(temp.tempPassword).then(() => setMsg('임시 비밀번호를 복사했습니다')).catch(() => {})
  }

  return (
    <div className="copyright-detail">
      <dl>
        <dt>이메일</dt><dd>{u.email}</dd>
        <dt>가입</dt><dd>{when(u.createdAt)}</dd>
        <dt>마지막 로그인</dt><dd>{u.lastLoginAt ? when(u.lastLoginAt) : '기록 없음 (이 기능을 넣기 전에 로그인함)'}</dd>
        <dt>팀</dt><dd>{u.teams.length ? u.teams.map((t) => `${t.name}${t.owner ? ' (팀장)' : ''}`).join(', ') : '없음'}</dd>
        <dt>만든 곡·콘티</dt><dd>곡 {u.songs}개 · 콘티 {u.setlists}개</dd>
        <dt>상태</dt>
        <dd>
          {u.suspended ? '사용 중지' : '사용 중'}
          {u.mustChangePassword && ` · 임시 비밀번호 발급됨${u.tempPasswordExpiresAt ? ` (${when(u.tempPasswordExpiresAt)}까지)` : ''}`}
        </dd>
      </dl>

      {locked ? (
        <p className="muted-dark">{u.me ? '내 계정입니다. 비밀번호는 앱 위쪽 "비밀번호 변경"에서 바꿔 주세요.' : '다른 관리자 계정은 여기서 바꿀 수 없습니다.'}</p>
      ) : (
        <div className="copyright-actions">
          <button type="button" className="secondary" disabled={busy} onClick={reset}>🔑 임시 비밀번호 만들기</button>
          {u.suspended
            ? <button type="button" className="secondary" disabled={busy} onClick={() => run(() => setMemberSuspended(u._id, false), '다시 사용할 수 있게 했습니다')}>✅ 다시 사용하게 하기</button>
            : <button type="button" className="secondary danger-text" disabled={busy}
                onClick={() => window.confirm(`${u.email} 계정 사용을 멈출까요?\n로그인할 수 없게 되고, 쓰던 기기에서도 로그아웃됩니다. 곡·콘티는 지워지지 않으며 언제든 다시 풀 수 있습니다.`) && run(() => setMemberSuspended(u._id, true), '사용을 멈췄습니다')}>
                ⛔ 사용 중지
              </button>}
        </div>
      )}

      {temp && (
        <div className="member-temp" role="status">
          <p>아래 임시 비밀번호를 <b>{temp.email}</b> 님에게 직접 알려 주세요. <b>이 화면을 닫으면 다시 볼 수 없습니다.</b></p>
          <p className="member-temp-pw"><code>{temp.tempPassword}</code> <button type="button" className="secondary" onClick={copy}>복사</button></p>
          <p className="muted-dark">{when(temp.expiresAt)}까지 쓸 수 있고, 이 비밀번호로 로그인하면 새 비밀번호로 바꾸라는 안내가 나옵니다.</p>
        </div>
      )}
      {msg && <p className="share-pin-msg">{msg}</p>}
    </div>
  )
}
