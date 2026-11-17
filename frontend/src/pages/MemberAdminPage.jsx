import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import LoginForm from '../components/LoginForm'
import { getOperatorInfo } from '../api/copyright'
import { listMembers, resetMemberPassword, setMemberSuspended, listTeamsForAdmin, setTeamLibrary, getMyLibrary, setMyLibrary, giveSongs } from '../api/admin'
import { getMyTeams } from '../api/teams'
import { getSongs } from '../api/songs'
import { filterSongs } from '../utils/songSort'
import { effectiveSheets } from '../utils/sheets'

// 곡을 받은 회원: '곡 복사해 주기' 기록이 있거나, 개인 곡에 내 악보가 연결돼 있으면
const received = (u) => !!u.gifts || u.linkedSheets > 0
const when = (d) => (d ? new Date(d).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '')

// 관리자(ADMIN_EMAILS)용 회원 관리 화면: 가입한 회원 보기, 비밀번호 초기화, 사용 중지
export default function MemberAdminPage() {
  const { token } = useAuth()
  const [operator, setOperator] = useState(null) // null = 확인 중
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [data, setData] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [giftedOnly, setGiftedOnly] = useState(false)
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

  const allUsers = data?.users || []
  const giftedCount = allUsers.filter(received).length
  const users = giftedOnly ? allUsers.filter(received) : allUsers
  return (
    <div className="dashboard copyright-admin">
      <div className="card panel">
        <div className="admin-head">
          <Link to="/" className="admin-back">← 앱으로 돌아가기</Link>
        </div>
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
        {data && (
          <p className="muted-dark member-count">
            전체 회원 {data.total}명{search && ` · '${search}' 검색 ${allUsers.length}명`}
            {giftedCount > 0 && (
              <label className="member-gift-filter">
                <input type="checkbox" checked={giftedOnly} onChange={(e) => setGiftedOnly(e.target.checked)} /> 곡 받은 회원만 ({giftedCount}명)
              </label>
            )}
          </p>
        )}
        {data && users.length === 0 ? <p className="muted">회원이 없습니다</p> : (
          <ul className="copyright-list">
            {users.map((u) => (
              <li key={u._id}>
                <button type="button" className={`secondary copyright-row${openId === u._id ? ' active' : ''}`} onClick={() => setOpenId(openId === u._id ? null : u._id)}>
                  {u.operator && <span className="copyright-status st-resolved">관리자</span>}
                  {u.suspended && <span className="copyright-status st-blocked">사용 중지</span>}
                  {u.mustChangePassword && <span className="copyright-status st-reviewing">임시 비밀번호</span>}
                  {received(u) && <span className="copyright-status st-gift">✓ 곡 받음</span>}
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
      <LibraryTeams />
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
        <dt>곡 받음</dt>
        <dd>
          {received(u) ? '✓ ' : '아직 없음'}
          {u.gifts && `복사해 준 기록 ${u.gifts.times}번 (마지막 ${when(u.gifts.lastAt)})`}
          {u.gifts && u.linkedSheets > 0 && ' · '}
          {u.linkedSheets > 0 && `내 악보가 연결된 곡 ${u.linkedSheets.toLocaleString()}곡`}
        </dd>
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

      {!locked && <GiveSongs user={u} onDone={onChanged} />}

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

// 관리자가 고른 내 곡(악보 연결 포함)을 이 회원의 개인 공간으로 복사해 준다
function GiveSongs({ user: u, onDone }) {
  const [open, setOpen] = useState(false)
  const [teams, setTeams] = useState([])
  const [from, setFrom] = useState('personal')
  const [songs, setSongs] = useState(null)
  const [search, setSearch] = useState('')
  const [onlySheets, setOnlySheets] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!open) return
    getMyTeams().then((t) => setTeams(Array.isArray(t) ? t : [])).catch(() => setTeams([]))
  }, [open])
  useEffect(() => {
    if (!open) return
    let alive = true
    getSongs(from === 'personal' ? '' : from)
      .then((d) => { if (alive) { setSongs(Array.isArray(d) ? d : []); setMsg('') } })
      .catch((err) => { if (alive) { setSongs([]); setMsg(err.message) } })
    return () => { alive = false }
  }, [open, from])

  const picked = useMemo(() => {
    const list = filterSongs(songs || [], search)
    return onlySheets ? list.filter((s) => effectiveSheets(s).length > 0) : list
  }, [songs, search, onlySheets])

  async function give() {
    if (!picked.length) return
    if (!window.confirm(`${picked.length.toLocaleString()}곡을 ${u.email} 님의 개인 공간으로 복사해 줄까요?\n악보도 함께 연결되어 이 회원이 볼 수 있게 됩니다. 복사한 곡은 이 회원의 곡이 되어 되돌릴 수 없습니다.`)) return
    setBusy(true)
    setMsg('')
    try {
      const r = await giveSongs(u._id, from, picked.map((s) => s._id))
      const parts = r.copied || r.filled
        ? [`${r.copied.toLocaleString()}곡을 복사해 주었습니다`]
        : ['이미 같은 곡을 모두 가지고 있어 새로 들어간 곡은 없습니다(같은 제목·아티스트). 준 기록은 남겼습니다']
      if (r.filled) parts.push(`이미 있던 ${r.filled}곡에 악보를 넣었습니다`)
      if (r.skipped) parts.push(`이미 있는 ${r.skipped}곡은 건너뜀`)
      setMsg(parts.join(' · ') + '.')
      onDone?.()
    } catch (err) { setMsg(err.message) } finally { setBusy(false) }
  }

  if (!open) {
    return (
      <div className="copyright-actions">
        <button type="button" className="secondary" onClick={() => setOpen(true)}>🎁 내 곡 복사해 주기</button>
      </div>
    )
  }
  return (
    <div className="give-songs">
      <h3>🎁 내 곡 복사해 주기</h3>
      <p className="muted-dark">
        내 곡을 <b>{u.email}</b> 님의 <b>개인 공간</b>으로 복사합니다. 곡 정보·MR 주소와 함께 <b>악보도 연결</b>되어 이 회원이 볼 수 있습니다(팀 메모는 빠짐).
        이 회원은 자기 곡으로 자유롭게 고칠 수 있고, 내 곡에는 영향이 없습니다. 같은 제목·아티스트가 이미 있으면 건너뛰고, 그 곡에 악보가 없을 때만 악보를 채웁니다.
      </p>
      <div className="give-songs-tools">
        <label>복사할 곳
          <select value={from} onChange={(e) => { setFrom(e.target.value); setSongs(null) }}>
            <option value="personal">내 개인 공간</option>
            {teams.map((t) => <option key={t._id} value={t._id}>{t.name} 팀</option>)}
          </select>
        </label>
        <input type="search" value={search} placeholder="제목·아티스트·주제로 고르기 (비우면 전부)" onChange={(e) => setSearch(e.target.value)} aria-label="복사할 곡 찾기" />
        <label className="give-songs-check"><input type="checkbox" checked={onlySheets} onChange={(e) => setOnlySheets(e.target.checked)} /> 악보 있는 곡만</label>
      </div>
      <div className="copyright-actions">
        <button type="button" disabled={busy || !songs || !picked.length} onClick={give}>
          {songs ? `${picked.length.toLocaleString()}곡 복사해 주기` : '곡 불러오는 중…'}
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={() => setOpen(false)}>닫기</button>
      </div>
      <p className="muted-dark">악보는 우리 교회가 가진 사용 권한 안에서만 나눠 주세요.</p>
      {msg && <p className="share-pin-msg">{msg}</p>}
    </div>
  )
}

// 공용 곡 목록으로 쓸 팀: 켜면 그 팀 곡 정보(악보 빼고)를 가입한 모든 사람이 보고 가져갈 수 있다
function LibraryTeams() {
  const [teams, setTeams] = useState(null)
  const [mine, setMine] = useState(null) // 내 개인 공간 곡
  const [msg, setMsg] = useState('')
  const load = useCallback(() => {
    listTeamsForAdmin().then(setTeams).catch((err) => setMsg(err.message))
    getMyLibrary().then(setMine).catch(() => {})
  }, [])

  async function toggleMine() {
    const on = !mine.sharedLibrary
    if (on && !window.confirm(`내 개인 공간의 곡 ${mine.songs}곡 정보(제목·Key·BPM·주제 등)를 가입한 모든 사람이 찾아보고 가져갈 수 있게 할까요?\n악보 파일·MR·메모는 나누지 않습니다.`)) return
    setMsg('')
    try {
      await setMyLibrary(on)
      setMsg(on ? '내 개인 곡을 공용 곡 목록으로 열었습니다. 이제 모든 회원이 곡 목록 탭에서 찾아볼 수 있습니다.' : '내 개인 곡을 공용 곡 목록에서 뺐습니다')
      load()
    } catch (err) { setMsg(err.message) }
  }
  useEffect(() => { load() }, [load])

  async function toggle(t) {
    const on = !t.sharedLibrary
    if (on && !window.confirm(`'${t.name}' 팀의 곡 ${t.songs}곡 정보(제목·Key·BPM·주제 등)를 가입한 모든 사람이 보고 가져갈 수 있게 할까요?\n악보 파일·MR·팀 메모는 나누지 않습니다.`)) return
    setMsg('')
    try {
      await setTeamLibrary(t._id, on)
      setMsg(on ? `'${t.name}' 팀 곡을 공용 곡 목록으로 열었습니다` : `'${t.name}' 팀 곡을 공용 곡 목록에서 뺐습니다`)
      load()
    } catch (err) { setMsg(err.message) }
  }

  return (
    <div className="card panel">
      <h2>📚 공용 곡 목록</h2>
      <p className="muted-dark">
        켜 둔 곡(내 개인 공간 또는 팀)의 <b>정보</b>(제목·아티스트·Key·BPM·주제·유튜브 등)를 가입한 모든 사람이 곡 목록 위 <b>공용 곡 목록</b>에서 보고 자기 곡으로 가져갈 수 있습니다.
        <b> 악보 파일·MR·팀 메모는 나누지 않으며</b>, 악보는 지금처럼 그 팀원만 봅니다. 가져간 곡은 가져간 사람의 곡이 되므로, 나중에 끄더라도 이미 가져간 곡은 남습니다.
      </p>
      {mine && (
        <ul className="copyright-list">
          <li className="library-team-row">
            <span>
              {mine.sharedLibrary && <span className="copyright-status st-resolved">공용</span>} <b>내 개인 공간의 곡</b>
              <small className="muted-dark"> · 곡 {mine.songs.toLocaleString()}곡</small>
            </span>
            <button type="button" className={mine.sharedLibrary ? 'secondary' : ''} onClick={toggleMine}>
              {mine.sharedLibrary ? '공용 끄기' : '공용으로 열기'}
            </button>
          </li>
        </ul>
      )}
      {!teams ? <p className="muted">불러오는 중…</p> : teams.length === 0 ? null : (
        <ul className="copyright-list">
          {teams.map((t) => (
            <li key={t._id} className="library-team-row">
              <span>
                {t.sharedLibrary && <span className="copyright-status st-resolved">공용</span>} <b>{t.name}</b>
                <small className="muted-dark"> · 곡 {t.songs.toLocaleString()}곡 · 팀원 {t.members}명 · 팀장 {t.owner}</small>
              </span>
              <button type="button" className={t.sharedLibrary ? 'secondary' : ''} onClick={() => toggle(t)}>
                {t.sharedLibrary ? '공용 끄기' : '공용으로 열기'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="share-pin-msg">{msg}</p>}
    </div>
  )
}
