const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const { takeAttempt, refundAttempt, clientIp } = require('../utils/rateLimit')
const { ensureUserCookie } = require('../utils/sheetAccess')
const { operatorEmails } = require('../utils/operator')
const { mailReady, sendMail, appUrl } = require('../utils/mailer')

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  })
}

// 이메일은 앞뒤 공백을 지우고 소문자로 맞춘다 (가입·로그인 모두 같은 기준)
const normalizeEmail = (email) => String(email || '').trim().toLowerCase()

// 길이를 먼저 제한하고(이메일 표준 최대 254자), 겹치지 않는 패턴으로 검사해 느려지는 입력을 막는다
const isValidEmail = (email) => email.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)
const INVALID_EMAIL = '이메일 주소 형식이 올바르지 않습니다 (예: name@gmail.com)'

const validateEmailAndPassword = (email, password) => {
  if (!email || !password) {
    return '이메일과 비밀번호를 입력해 주세요'
  }
  if (!isValidEmail(email)) {
    return INVALID_EMAIL
  }
  if (password.length < 6) {
    return '비밀번호는 6자 이상이어야 합니다'
  }
  return null
}

exports.signup = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email)
    const { password } = req.body

    const validationError = validateEmailAndPassword(email, password)
    if (validationError) {
      return res.status(400).json({ message: validationError })
    }

    // 운영자(ADMIN_EMAILS) 이메일은 여기서 새로 가입할 수 없다.
    // 가입할 때 이메일 확인을 하지 않으므로, 운영자가 가입하기 전에 남이 그 이메일로 먼저 가입해 운영자가 되는 것을 막는다
    if (operatorEmails().includes(email)) {
      return res.status(403).json({ message: '이 이메일로는 새로 가입할 수 없습니다. 관리자에게 문의해 주세요' })
    }

    const existingUser = await User.findOne({ email })

    if (existingUser) {
      return res.status(400).json({
        message: '이미 가입된 이메일입니다. 아래 "이미 계정이 있어요 → 로그인"으로 로그인해 주세요. 비밀번호를 잊었다면 팀장에게 비밀번호 초기화를 요청하세요',
      })
    }

    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    const user = await User.create({
      email,
      password: hashedPassword,
      lastLoginAt: new Date(),
    })

    ensureUserCookie(req, res, user) // 악보 파일(<img>)용 쿠키
    res.status(201).json({
      _id: user._id,
      email: user.email,
      token: generateToken(user._id),
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: '현재 비밀번호와 새 비밀번호를 입력해주세요' })
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: '비밀번호는 6자 이상이어야 합니다' })
    }
    if (newPassword === currentPassword) {
      return res.status(400).json({ message: '새 비밀번호는 지금 비밀번호와 달라야 합니다' })
    }
    const user = await User.findById(req.user._id)
    const isMatch = await bcrypt.compare(currentPassword, user.password)
    if (!isMatch) {
      return res.status(400).json({ message: '현재 비밀번호가 올바르지 않습니다' })
    }
    const salt = await bcrypt.genSalt(10)
    user.password = await bcrypt.hash(newPassword, salt)
    user.mustChangePassword = false
    user.tempPasswordExpiresAt = null
    await user.save()
    res.json({ message: '비밀번호가 변경되었습니다' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

const LOGIN_FAIL_LIMIT = 20
const LOGIN_WINDOW_MS = 15 * 60 * 1000

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ message: '이메일과 비밀번호를 입력해 주세요' })
    }

    // 비밀번호를 마구 넣어 보지 못하도록 한 기기에서 15분에 20번까지만 틀릴 수 있다 (성공한 로그인은 세지 않음)
    const loginKey = `login:${clientIp(req)}`
    if (!(await takeAttempt(loginKey, LOGIN_FAIL_LIMIT, LOGIN_WINDOW_MS))) {
      return res.status(429).json({ message: '로그인을 너무 많이 실패했습니다. 15분 뒤 다시 시도하거나 팀장에게 비밀번호 초기화를 요청해 주세요' })
    }

    const user = await User.findOne({ email: normalizeEmail(email) })

    if (!user) {
      return res.status(400).json({ message: '이메일 또는 비밀번호가 맞지 않습니다. 처음 오셨다면 아래 "회원가입"을 먼저 해 주세요' })
    }

    const isMatch = await bcrypt.compare(password, user.password)

    if (!isMatch) {
      return res.status(400).json({ message: '이메일 또는 비밀번호가 맞지 않습니다. 처음 오셨다면 아래 "회원가입"을 먼저 해 주세요' })
    }

    await refundAttempt(loginKey)

    if (user.suspended) {
      return res.status(403).json({ message: '사용이 중지된 계정입니다. 관리자에게 문의해 주세요' })
    }

    if (user.mustChangePassword && user.tempPasswordExpiresAt && user.tempPasswordExpiresAt < new Date()) {
      return res.status(400).json({ message: '임시 비밀번호가 만료되었습니다. 팀장에게 다시 초기화를 요청해 주세요' })
    }

    if (!user.mustChangePassword) ensureUserCookie(req, res, user) // 악보 파일(<img>)용 쿠키
    await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() })
    res.json({
      _id: user._id,
      email: user.email,
      mustChangePassword: !!user.mustChangePassword,
      token: generateToken(user._id),
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}
// POST /auth/check-email  { email } → { registered }
// 가입한 이메일이 기억나지 않을 때 확인용. 다른 사람의 가입 여부를 마구 알아내지 못하도록
// 한 기기(IP)에서 15분에 10번까지만 확인할 수 있다
const EMAIL_CHECK_LIMIT = 10
const EMAIL_CHECK_WINDOW_MS = 15 * 60 * 1000
// 기기(IP)를 바꿔 가며 대량으로 확인하지 못하도록 사이트 전체로도 1시간에 100번까지만
const EMAIL_CHECK_GLOBAL_LIMIT = 100
const EMAIL_CHECK_GLOBAL_WINDOW_MS = 60 * 60 * 1000

exports.checkEmail = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email)
    if (!email) return res.status(400).json({ message: '확인할 이메일을 입력해 주세요' })
    if (!isValidEmail(email)) return res.status(400).json({ message: INVALID_EMAIL })
    if (!(await takeAttempt(`email-check:${clientIp(req)}`, EMAIL_CHECK_LIMIT, EMAIL_CHECK_WINDOW_MS))) {
      return res.status(429).json({ message: '확인을 너무 많이 했습니다. 15분 뒤 다시 시도하거나 팀장에게 문의해 주세요' })
    }
    if (!(await takeAttempt('email-check:all', EMAIL_CHECK_GLOBAL_LIMIT, EMAIL_CHECK_GLOBAL_WINDOW_MS))) {
      return res.status(429).json({ message: '지금은 이메일 확인 요청이 많아 잠시 멈췄습니다. 잠시 뒤 다시 시도하거나 팀장에게 문의해 주세요' })
    }
    const registered = !!(await User.exists({ email }))
    res.json({ email, registered })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// ── 비밀번호 찾기 (가입 이메일로 재설정 링크 보내기) ──────────────────
const RESET_TTL_MS = 30 * 60 * 1000 // 링크는 30분 동안만
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex')
const RESET_SENT = '가입된 이메일이면 비밀번호 재설정 메일을 보냈습니다. 메일함(스팸함 포함)을 확인해 주세요. 링크는 30분 동안 쓸 수 있습니다'

function resetMail(link) {
  const text = [
    'RAON music sheet 비밀번호 재설정 안내입니다.',
    '',
    '아래 링크를 눌러 새 비밀번호를 정해 주세요. 링크는 30분 동안, 한 번만 쓸 수 있습니다.',
    link,
    '',
    '비밀번호 찾기를 요청하지 않았다면 이 메일은 무시하셔도 됩니다. 비밀번호는 바뀌지 않습니다.',
  ].join('\n')
  const html = `<div style="font-family:sans-serif;line-height:1.6;color:#1f2a24">
<p><b>RAON music sheet</b> 비밀번호 재설정 안내입니다.</p>
<p>아래 버튼을 눌러 새 비밀번호를 정해 주세요. 링크는 <b>30분 동안, 한 번만</b> 쓸 수 있습니다.</p>
<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#2f5d46;color:#fff;border-radius:8px;text-decoration:none">새 비밀번호 정하기</a></p>
<p style="font-size:13px;color:#666">버튼이 안 눌리면 이 주소를 복사해 브라우저에 붙여 넣으세요:<br>${link}</p>
<p style="font-size:13px;color:#666">비밀번호 찾기를 요청하지 않았다면 이 메일은 무시하셔도 됩니다. 비밀번호는 바뀌지 않습니다.</p>
</div>`
  return { subject: '[RAON music sheet] 비밀번호 재설정 링크', text, html }
}

// POST /api/auth/forgot-password  { email } → 가입된 이메일이면 재설정 링크를 메일로 보낸다
exports.forgotPassword = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email)
    if (!email) return res.status(400).json({ message: '가입한 이메일을 입력해 주세요' })
    if (!isValidEmail(email)) return res.status(400).json({ message: INVALID_EMAIL })
    if (!mailReady()) {
      return res.status(503).json({ message: '비밀번호 찾기 메일이 아직 준비되지 않았습니다. 팀장이나 관리자에게 임시 비밀번호를 요청해 주세요' })
    }
    // 메일 폭탄을 막는다: 한 기기 15분에 5번, 한 이메일 1시간에 3번, 사이트 전체 1시간에 60번
    if (!(await takeAttempt(`forgot:${clientIp(req)}`, 5, 15 * 60 * 1000))) {
      return res.status(429).json({ message: '요청을 너무 많이 했습니다. 15분 뒤 다시 시도해 주세요' })
    }
    if (!(await takeAttempt(`forgot-mail:${email}`, 3, 60 * 60 * 1000))) {
      return res.status(429).json({ message: '이 이메일로는 이미 여러 번 보냈습니다. 메일함(스팸함 포함)을 확인하거나 1시간 뒤 다시 시도해 주세요' })
    }
    if (!(await takeAttempt('forgot:all', 60, 60 * 60 * 1000))) {
      return res.status(429).json({ message: '지금은 요청이 많아 잠시 멈췄습니다. 잠시 뒤 다시 시도하거나 팀장에게 문의해 주세요' })
    }

    const user = await User.findOne({ email })
    // 없는 이메일·사용 중지 계정에도 같은 답을 준다 (메일은 보내지 않음)
    if (!user || user.suspended) return res.json({ message: RESET_SENT })

    const token = crypto.randomBytes(32).toString('hex')
    user.resetTokenHash = hashToken(token)
    user.resetTokenExpiresAt = new Date(Date.now() + RESET_TTL_MS)
    await user.save()
    try {
      await sendMail({ to: user.email, ...resetMail(`${appUrl()}/reset-password?token=${token}`) })
    } catch (err) {
      await User.updateOne({ _id: user._id }, { resetTokenHash: null, resetTokenExpiresAt: null })
      console.error('reset mail failed:', err.message)
      return res.status(502).json({ message: '메일을 보내지 못했습니다. 잠시 뒤 다시 시도하거나 팀장이나 관리자에게 임시 비밀번호를 요청해 주세요' })
    }
    res.json({ message: RESET_SENT })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// POST /api/auth/reset-password  { token, password } → 메일 링크로 새 비밀번호를 정한다
exports.resetPassword = async (req, res) => {
  try {
    const token = String(req.body.token || '')
    const password = String(req.body.password || '')
    if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ message: '링크가 올바르지 않습니다. 메일의 링크를 다시 눌러 주세요' })
    if (password.length < 6) return res.status(400).json({ message: '비밀번호는 6자 이상이어야 합니다' })
    if (!(await takeAttempt(`reset:${clientIp(req)}`, 20, 15 * 60 * 1000))) {
      return res.status(429).json({ message: '너무 많이 시도했습니다. 15분 뒤 다시 시도해 주세요' })
    }
    const user = await User.findOne({ resetTokenHash: hashToken(token), resetTokenExpiresAt: { $gt: new Date() } })
    if (!user) return res.status(400).json({ message: '링크가 만료되었거나 이미 사용했습니다. 로그인 화면에서 비밀번호 찾기를 다시 해 주세요' })
    if (user.suspended) return res.status(403).json({ message: '사용이 중지된 계정입니다. 관리자에게 문의해 주세요' })

    user.password = await bcrypt.hash(password, await bcrypt.genSalt(10))
    user.mustChangePassword = false
    user.tempPasswordExpiresAt = null
    user.resetTokenHash = null
    user.resetTokenExpiresAt = null
    user.sessionsRevokedAt = new Date() // 다른 기기에 남은 로그인도 끊는다 (비밀번호를 도둑맞았을 때 대비)
    await user.save()
    res.json({ email: user.email, message: '비밀번호를 바꿨습니다. 새 비밀번호로 로그인해 주세요' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}
