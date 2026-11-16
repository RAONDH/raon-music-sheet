const Song = require('../models/Song')
const Team = require('../models/Team')
const { resolveWorkspace, FORBIDDEN_WORKSPACE } = require('../utils/access')

// 공용 곡 목록: 관리자가 '공용'으로 정한 팀의 곡 정보를 가입한 모든 사람이 보고, 자기 공간으로 복사해 간다.
// 악보 파일·악보 주소·MR 주소·팀 메모는 나누지 않는다 (악보는 그 팀원만 본다)
const SHARED_FIELDS = [
  'title', 'artist', 'key', 'bpm', 'capo', 'youtubeUrl', 'structure', 'tempo', 'timeSignature',
  'themes', 'target', 'traits', 'hymnNumber', 'scripture', 'lyricist', 'composer', 'durationMin',
]
const MAX_COPY = 3000

// 제목·아티스트가 같은 곡인지 (띄어쓰기·대소문자 무시)
const sameKey = (s) => `${String(s.title || '').toLowerCase().replace(/\s+/g, '')}|${String(s.artist || '').toLowerCase().replace(/\s+/g, '')}`

const libraryTeams = () => Team.find({ sharedLibrary: true }, 'name').lean()

// GET /api/library → { teams: [{_id, name}], songs: [...] } (팀이 없으면 빈 목록)
exports.list = async (req, res) => {
  try {
    const teams = await libraryTeams()
    if (!teams.length) return res.json({ teams: [], songs: [] })
    const songs = await Song.find({ team: { $in: teams.map((t) => t._id) } }, SHARED_FIELDS.join(' ') + ' team')
      .sort({ title: 1 }).lean()
    res.json({ teams, songs: songs.map(({ team, ...s }) => ({ ...s, libraryTeam: String(team) })) })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// POST /api/library/copy  { songIds: [], team } → 내 공간(개인 또는 내 팀)으로 곡 정보를 복사. 이미 같은 제목·아티스트가 있으면 건너뛴다
exports.copy = async (req, res) => {
  try {
    const ids = [...new Set((req.body?.songIds || []).map(String))].slice(0, MAX_COPY)
    if (!ids.length) return res.status(400).json({ message: '가져올 곡을 골라 주세요' })
    const ws = await resolveWorkspace(req.user, req.body?.team)
    if (!ws) return res.status(403).json({ message: FORBIDDEN_WORKSPACE })

    const teams = await libraryTeams()
    const source = await Song.find({ _id: { $in: ids.filter((id) => /^[a-f0-9]{24}$/i.test(id)) }, team: { $in: teams.map((t) => t._id) } },
      SHARED_FIELDS.join(' ')).lean()
    const have = new Set((await Song.find(ws.filter, 'title artist').lean()).map(sameKey))
    const docs = []
    for (const s of source) {
      const k = sameKey(s)
      if (have.has(k)) continue
      have.add(k)
      const doc = { user: req.user._id, team: ws.team ? ws.team._id : null }
      SHARED_FIELDS.forEach((f) => { if (s[f] !== undefined) doc[f] = s[f] })
      docs.push(doc)
    }
    if (docs.length) await Song.insertMany(docs)
    res.json({ copied: docs.length, skipped: source.length - docs.length })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}
