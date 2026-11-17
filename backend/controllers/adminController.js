const bcrypt = require('bcryptjs')
const mongoose = require('mongoose')
const User = require('../models/User')
const Team = require('../models/Team')
const Song = require('../models/Song')
const Setlist = require('../models/Setlist')
const { generateTempPassword } = require('../utils/tempPassword')
const { isOperator } = require('../utils/operator')
const { resolveWorkspace } = require('../utils/access')
const { SHARED_FIELDS, sameKey } = require('./libraryController')

// 관리자(ADMIN_EMAILS) 회원 관리: 가입한 회원 보기, 비밀번호 초기화, 사용 중지·다시 사용
// 계정과 곡·콘티는 지우지 않는다 (사용 중지는 언제든 되돌릴 수 있다)

const TEMP_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000
const fail = (res, status, message) => res.status(status).json({ message })
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// GET /api/admin/users?q=  → 회원 목록 (최근 가입 순)
exports.listUsers = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100)
    const filter = q ? { email: { $regex: escapeRegex(q), $options: 'i' } } : {}
    const users = await User.find(filter, 'email createdAt lastLoginAt mustChangePassword tempPasswordExpiresAt suspended songGifts')
      .sort({ createdAt: -1 }).limit(500).lean()
    const ids = users.map((u) => u._id)

    const [teams, songCounts, setlistCounts, total] = await Promise.all([
      Team.find({ $or: [{ members: { $in: ids } }, { owner: { $in: ids } }] }, 'name owner members').lean(),
      Song.aggregate([{ $match: { user: { $in: ids } } }, { $group: { _id: '$user', n: { $sum: 1 } } }]),
      Setlist.aggregate([{ $match: { user: { $in: ids } } }, { $group: { _id: '$user', n: { $sum: 1 } } }]),
      User.countDocuments(),
    ])
    const countMap = (rows) => new Map(rows.map((r) => [String(r._id), r.n]))
    const songs = countMap(songCounts)
    const setlists = countMap(setlistCounts)

    res.json({
      total,
      users: users.map((u) => {
        const id = String(u._id)
        return {
          _id: id,
          email: u.email,
          createdAt: u.createdAt,
          lastLoginAt: u.lastLoginAt,
          suspended: !!u.suspended,
          mustChangePassword: !!u.mustChangePassword,
          tempPasswordExpiresAt: u.mustChangePassword ? u.tempPasswordExpiresAt : null,
          operator: isOperator(u),
          me: id === String(req.user._id),
          teams: teams
            .filter((t) => String(t.owner) === id || (t.members || []).some((m) => String(m) === id))
            .map((t) => ({ _id: t._id, name: t.name, owner: String(t.owner) === id })),
          songs: songs.get(id) || 0,
          setlists: setlists.get(id) || 0,
          // 곡 복사해 주기로 받은 기록: 받은 횟수·마지막으로 받은 때·받은 곡 수(새로 받은 곡 + 악보를 채운 곡)
          gifts: (u.songGifts || []).length
            ? {
                times: u.songGifts.length,
                lastAt: u.songGifts[u.songGifts.length - 1].at,
                songs: u.songGifts.reduce((n, g) => n + (g.copied || 0) + (g.filled || 0), 0),
              }
            : null,
        }
      }),
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// 다른 회원만, 그리고 다른 관리자 계정은 건드리지 않는다
async function targetUser(req, res) {
  const { id } = req.params
  if (!mongoose.Types.ObjectId.isValid(id)) { fail(res, 400, '잘못된 요청입니다'); return null }
  if (id === String(req.user._id)) { fail(res, 400, '내 계정은 여기서 바꿀 수 없습니다. 비밀번호는 위쪽 "비밀번호 변경"을 쓰세요'); return null }
  const user = await User.findById(id)
  if (!user) { fail(res, 404, '회원을 찾을 수 없습니다'); return null }
  if (isOperator(user)) { fail(res, 403, '다른 관리자 계정은 바꿀 수 없습니다'); return null }
  return user
}

// POST /api/admin/users/:id/reset-password → { email, tempPassword } (임시 비밀번호는 이 응답에서 한 번만 보여 준다)
exports.resetPassword = async (req, res) => {
  try {
    const user = await targetUser(req, res)
    if (!user) return
    const tempPassword = generateTempPassword()
    user.password = await bcrypt.hash(tempPassword, await bcrypt.genSalt(10))
    user.mustChangePassword = true
    user.tempPasswordExpiresAt = new Date(Date.now() + TEMP_PASSWORD_TTL_MS)
    user.sessionsRevokedAt = new Date() // 이미 로그인해 둔 기기도 로그아웃
    await user.save()
    res.json({ email: user.email, tempPassword, expiresAt: user.tempPasswordExpiresAt })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// PUT /api/admin/users/:id/suspended  { suspended: boolean }
exports.setSuspended = async (req, res) => {
  try {
    if (typeof req.body?.suspended !== 'boolean') return fail(res, 400, '잘못된 요청입니다')
    const user = await targetUser(req, res)
    if (!user) return
    user.suspended = req.body.suspended
    if (user.suspended) user.sessionsRevokedAt = new Date() // 쓰던 기기에서도 바로 로그아웃
    await user.save()
    res.json({ _id: user._id, suspended: user.suspended })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// GET /api/admin/teams → 모든 팀 (공용 곡 목록으로 쓸 팀 고르기)
exports.listTeams = async (req, res) => {
  try {
    const teams = await Team.find({}, 'name owner members sharedLibrary').populate('owner', 'email').sort({ createdAt: 1 }).lean()
    const counts = new Map((await Song.aggregate([{ $match: { team: { $in: teams.map((t) => t._id) } } }, { $group: { _id: '$team', n: { $sum: 1 } } }]))
      .map((r) => [String(r._id), r.n]))
    res.json(teams.map((t) => ({
      _id: t._id, name: t.name, owner: t.owner?.email || '', members: (t.members || []).length,
      songs: counts.get(String(t._id)) || 0, sharedLibrary: !!t.sharedLibrary,
    })))
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// PUT /api/admin/teams/:id/library  { shared: boolean } — 이 팀 곡 정보를 공용 곡 목록으로 열기·닫기
exports.setTeamLibrary = async (req, res) => {
  try {
    if (typeof req.body?.shared !== 'boolean') return fail(res, 400, '잘못된 요청입니다')
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return fail(res, 400, '잘못된 요청입니다')
    const team = await Team.findByIdAndUpdate(req.params.id, { sharedLibrary: req.body.shared }, { new: true })
    if (!team) return fail(res, 404, '팀을 찾을 수 없습니다')
    res.json({ _id: team._id, sharedLibrary: team.sharedLibrary })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// GET /api/admin/me/library → 내(관리자) 개인 공간 곡 수와 공용 여부
exports.myLibrary = async (req, res) => {
  try {
    const songs = await Song.countDocuments({ user: req.user._id, team: null })
    res.json({ songs, sharedLibrary: !!req.user.sharedLibrary })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// PUT /api/admin/me/library  { shared: boolean } — 내 개인 공간 곡 정보를 공용 곡 목록으로 열기·닫기
exports.setMyLibrary = async (req, res) => {
  try {
    if (typeof req.body?.shared !== 'boolean') return fail(res, 400, '잘못된 요청입니다')
    await User.updateOne({ _id: req.user._id }, { sharedLibrary: req.body.shared })
    res.json({ sharedLibrary: req.body.shared })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// 관리자가 고른 곡을 한 회원의 개인 공간으로 복사해 준다 (곡 정보 + MR 주소 + 악보 주소. 팀 메모는 빼고).
// 악보는 파일을 복사하지 않고 같은 주소를 넣는다 → 받은 회원의 곡이 되므로 그 회원이 볼 수 있다
// 같은 제목·아티스트가 이미 있으면 새로 만들지 않고, 그 곡에 악보가 없을 때만 악보를 채운다
const GIVE_FIELDS = [...SHARED_FIELDS, 'mrUrl']
const SHEET_FIELDS = ['sheets', 'sheetImageUrl', 'sheetPdfUrl']
const MAX_GIVE = 5000
const hasSheet = (s) => !!(s?.sheets?.length || s?.sheetImageUrl || s?.sheetPdfUrl)

// POST /api/admin/users/:id/give-songs  { from: 'personal' | 팀 id, songIds: [] } → { email, copied, filled, skipped }
exports.giveSongs = async (req, res) => {
  try {
    const user = await targetUser(req, res)
    if (!user) return
    const ids = [...new Set((req.body?.songIds || []).map(String))].filter((id) => mongoose.Types.ObjectId.isValid(id))
    if (!ids.length) return fail(res, 400, '복사할 곡을 골라 주세요')
    if (ids.length > MAX_GIVE) return fail(res, 400, `한 번에 ${MAX_GIVE.toLocaleString()}곡까지 복사할 수 있습니다`)
    const ws = await resolveWorkspace(req.user, req.body?.from)
    if (!ws) return fail(res, 403, '내가 쓰는 공간의 곡만 복사할 수 있습니다')

    // 내 공간(개인 또는 내 팀)에 있는 곡만
    const source = await Song.find({ $and: [{ _id: { $in: ids } }, ws.filter] }, [...GIVE_FIELDS, ...SHEET_FIELDS].join(' ')).lean()
    const theirs = new Map()
    for (const m of await Song.find({ user: user._id, team: null }, 'title artist ' + SHEET_FIELDS.join(' ')).lean()) {
      const k = sameKey(m)
      if (!theirs.has(k)) theirs.set(k, m)
    }
    const docs = []
    const fills = []
    for (const s of source) {
      const k = sameKey(s)
      const sheets = {}
      SHEET_FIELDS.forEach((f) => { if (s[f] !== undefined) sheets[f] = s[f] })
      const m = theirs.get(k)
      if (m) {
        if (!hasSheet(m) && hasSheet(s)) {
          fills.push({ updateOne: { filter: { _id: m._id }, update: { $set: sheets } } })
          Object.assign(m, sheets)
        }
        continue
      }
      const doc = { user: user._id, team: null, ...sheets }
      GIVE_FIELDS.forEach((f) => { if (s[f] !== undefined) doc[f] = s[f] })
      docs.push(doc)
      theirs.set(k, doc)
    }
    if (docs.length) await Song.insertMany(docs)
    if (fills.length) await Song.bulkWrite(fills)
    if (docs.length || fills.length) {
      await User.updateOne({ _id: user._id }, {
        $push: { songGifts: { $each: [{ by: req.user._id, at: new Date(), copied: docs.length, filled: fills.length }], $slice: -20 } },
      })
    }
    res.json({ email: user.email, copied: docs.length, filled: fills.length, skipped: source.length - docs.length - fills.length })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}
