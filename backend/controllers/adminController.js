const bcrypt = require('bcryptjs')
const mongoose = require('mongoose')
const User = require('../models/User')
const Team = require('../models/Team')
const Song = require('../models/Song')
const Setlist = require('../models/Setlist')
const { generateTempPassword } = require('../utils/tempPassword')
const { isOperator } = require('../utils/operator')

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
    const users = await User.find(filter, 'email createdAt lastLoginAt mustChangePassword tempPasswordExpiresAt suspended')
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
