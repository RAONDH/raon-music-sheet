import { useEffect, useMemo, useState } from 'react'
import { getLibrary, copyFromLibrary } from '../api/library'
import { filterSongs } from '../utils/songSort'

const PAGE = 100
// 제목·아티스트가 같은 곡인지 (띄어쓰기·대소문자 무시) — 서버와 같은 기준
const sameKey = (s) => `${String(s.title || '').toLowerCase().replace(/\s+/g, '')}|${String(s.artist || '').toLowerCase().replace(/\s+/g, '')}`

// 곡 목록 위의 '공용 곡 목록': 관리자가 공용으로 연 팀의 곡 정보를 보고 지금 작업 공간으로 가져온다 (악보는 오지 않음)
export default function LibraryPanel({ songs, workspace, workspaceLabel, onCopied }) {
  const [lib, setLib] = useState(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [shown, setShown] = useState(PAGE)
  const [picked, setPicked] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let alive = true
    getLibrary().then((d) => { if (alive) setLib(d) }).catch(() => { if (alive) setLib({ teams: [], songs: [] }) })
    return () => { alive = false }
  }, [])

  const have = useMemo(() => new Set(songs.map(sameKey)), [songs])
  const results = useMemo(() => filterSongs(lib?.songs || [], search), [lib, search])

  // 공용 곡이 없거나, 지금 보고 있는 공간이 바로 공용 곡의 출처(공용 팀, 또는 공용으로 연 내 개인 공간)면 보여 주지 않는다
  if (!lib?.songs?.length) return null
  if (lib.teams.some((t) => t._id === workspace)) return null
  if (!workspace && lib.ownPersonal && !lib.teams.length) return null

  const visible = results.slice(0, shown)
  const pickable = results.filter((s) => !have.has(sameKey(s)))
  const toggle = (id) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })

  async function copy(ids) {
    if (!ids.length) return
    setBusy(true)
    setMsg('')
    try {
      const r = await copyFromLibrary(ids, workspace)
      setMsg(`${r.copied}곡을 '${workspaceLabel}'에 가져왔습니다${r.skipped ? ` (이미 있는 ${r.skipped}곡은 건너뜀)` : ''}. 악보는 각 곡의 수정에서 넣어 주세요.`)
      setPicked(new Set())
      await onCopied?.()
    } catch (err) { setMsg(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="card panel library-panel">
      <div className="library-head">
        <div>
          <h2>📚 공용 곡 목록</h2>
          <p className="muted-dark">
            누구나 찾아볼 수 있는 곡 {lib.songs.length.toLocaleString()}곡입니다. 곡 정보(제목·Key·BPM·주제 등)를 내 곡으로 가져올 수 있습니다.
            <b> 악보는 함께 오지 않습니다.</b>
          </p>
        </div>
        <button type="button" className="secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? '접기' : '둘러보기'}</button>
      </div>

      {open && (
        <>
          <div className="library-tools">
            <input type="search" value={search} placeholder="제목·아티스트·주제로 찾기 (띄어쓰기 무시)"
              onChange={(e) => { setSearch(e.target.value); setShown(PAGE) }} aria-label="공용 곡 찾기" />
            <span className="muted-dark">{results.length.toLocaleString()}곡 · 가져올 수 있는 곡 {pickable.length.toLocaleString()}곡</span>
          </div>
          <div className="library-actions">
            <button type="button" disabled={busy || !picked.size} onClick={() => copy([...picked])}>
              고른 곡 가져오기 ({picked.size})
            </button>
            {search && pickable.length > 0 && (
              <button type="button" className="secondary" disabled={busy}
                onClick={() => window.confirm(`찾은 곡 중 아직 없는 ${pickable.length}곡을 '${workspaceLabel}'에 가져올까요?`) && copy(pickable.map((s) => s._id))}>
                찾은 곡 모두 가져오기 ({pickable.length})
              </button>
            )}
            {!search && pickable.length > 0 && (
              <button type="button" className="secondary" disabled={busy}
                onClick={() => window.confirm(`공용 곡 중 아직 없는 ${pickable.length}곡을 모두 '${workspaceLabel}'에 가져올까요?`) && copy(pickable.map((s) => s._id))}>
                전부 가져오기 ({pickable.length})
              </button>
            )}
            <span className="muted-dark">→ 지금 작업 공간: <b>{workspaceLabel}</b></span>
          </div>
          {msg && <p className="share-pin-msg">{msg}</p>}
          <ul className="library-list">
            {visible.map((s) => {
              const mine = have.has(sameKey(s))
              return (
                <li key={s._id} className={mine ? 'is-mine' : ''}>
                  <label>
                    <input type="checkbox" disabled={mine} checked={picked.has(s._id)} onChange={() => toggle(s._id)} />
                    <span className="library-title">{s.title}</span>
                    {s.artist && <span className="muted-dark"> — {s.artist}</span>}
                    {s.key && <span className="library-key">{s.key}</span>}
                    {s.bpm > 0 && <span className="muted-dark library-bpm">{s.bpm} BPM</span>}
                    {mine && <span className="library-mine">이미 있음</span>}
                  </label>
                </li>
              )
            })}
          </ul>
          {results.length > shown && (
            <button type="button" className="secondary library-more" onClick={() => setShown((n) => n + PAGE)}>
              더 보기 ({(results.length - shown).toLocaleString()}곡 남음)
            </button>
          )}
        </>
      )}
    </div>
  )
}
