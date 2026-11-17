// 곡 목록 탭과 콘티의 곡 선택 창이 같은 기준으로 검색·정렬하도록 함께 쓰는 함수

export const KEY_ORDER = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
                          'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm']

// 코드가 없는 곡은 코드순 정렬에서 맨 뒤로
const keyRank = (key) => {
  const i = KEY_ORDER.indexOf(key || '')
  return i === -1 ? KEY_ORDER.length : i
}

export function sortSongs(songs, by) {
  if (by === 'default') return songs
  return [...songs].sort((a, b) => {
    if (by === 'title')  return (a.title  || '').localeCompare(b.title  || '', 'ko')
    if (by === 'artist') return (a.artist || '').localeCompare(b.artist || '', 'ko')
    if (by === 'key')    return keyRank(a.key) - keyRank(b.key) || (a.title || '').localeCompare(b.title || '', 'ko')
    if (by === 'bpm')    return (a.bpm || 0) - (b.bpm || 0)
    return 0
  })
}

// 띄어쓰기·대소문자를 무시하고 비교한다 ('물위를' = '물 위를', 'f.i.a' = 'F.I.A')
const searchable = (v) => String(v ?? '').toLowerCase().replace(/\s+/g, '')

// 제목·아티스트·코드·주제 태그·찬송가 번호·성경구절·작사·작곡 중 하나라도 검색어를 포함하면 보여 준다
export function filterSongs(songs, search) {
  const q = searchable(search)
  if (!q) return songs
  return songs.filter((s) =>
    [s.title, s.artist, s.key, s.hymnNumber, s.scripture, s.lyricist, s.composer, ...(s.themes || [])]
      .some((v) => v != null && searchable(v).includes(q)))
}

// 검색어와 얼마나 맞는지: 제목이 똑같음 → 제목이 검색어로 시작 → 제목에 들어 있음 → 다른 칸(아티스트·주제 등)에만 있음
function searchRank(song, q) {
  const title = searchable(song.title)
  if (title === q) return 0
  if (title.startsWith(q)) return 1
  if (title.includes(q)) return 2
  return 3
}

// 검색 중이면 제목이 맞는 곡을 위로 올린다. 같은 순위 안에서는 고른 정렬 순서를 그대로 둔다
export function rankBySearch(songs, search) {
  const q = searchable(search)
  if (!q) return songs
  return songs
    .map((song, i) => ({ song, i, r: searchRank(song, q) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.song)
}

// Key별 곡 수 → [['C', 3], ['D', 5], ..., ['none', 2]] (Key 순서대로, Key 없는 곡은 맨 뒤 'none')
export function countByKey(songs) {
  const counts = new Map()
  for (const song of songs) {
    const key = song.key || ''
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const known = KEY_ORDER.filter((k) => counts.has(k)).map((k) => [k, counts.get(k)])
  const others = [...counts].filter(([k]) => k && !KEY_ORDER.includes(k))
  return counts.has('') ? [...known, ...others, ['none', counts.get('')]] : [...known, ...others]
}

// countByKey의 Key 값으로 곡 거르기 ('' = 전체, 'none' = Key 없는 곡)
export function filterByKey(songs, key) {
  if (!key) return songs
  return songs.filter((s) => (key === 'none' ? !s.key : s.key === key))
}
