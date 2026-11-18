const nodemailer = require('nodemailer')

// 메일 보내기 (비밀번호 찾기 등). Vercel 환경 변수로 설정한다 — 값은 사람이 직접 넣는다
// - Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER=보내는 지메일 주소, SMTP_PASS=구글 '앱 비밀번호'
// - Resend: SMTP_HOST=smtp.resend.com, SMTP_PORT=465, SMTP_USER=resend, SMTP_PASS=Resend API 키, MAIL_FROM=인증한 도메인의 주소
// MAIL_FROM이 없으면 SMTP_USER로 보낸다
function mailConfig() {
  const host = (process.env.SMTP_HOST || '').trim()
  const user = (process.env.SMTP_USER || '').trim()
  const pass = (process.env.SMTP_PASS || '').trim()
  if (!host || !user || !pass) return null
  const port = Number(process.env.SMTP_PORT || 465)
  const from = (process.env.MAIL_FROM || '').trim() || user
  return { host, port, user, pass, from }
}

exports.mailReady = () => !!mailConfig()

exports.sendMail = async ({ to, subject, text, html }) => {
  const cfg = mailConfig()
  if (!cfg) throw new Error('메일 발송이 설정되지 않았습니다')
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  })
  const from = /</.test(cfg.from) ? cfg.from : `"RAON music sheet" <${cfg.from}>`
  return transport.sendMail({ from, to, subject, text, html })
}

// 메일 속 링크에 쓰는 앱 주소. 요청의 Host 헤더는 믿지 않는다 (가짜 주소로 링크를 바꿔치기하지 못하게)
exports.appUrl = () => ((process.env.APP_URL || '').trim() || 'https://raon-music-sheet.vercel.app').replace(/\/+$/, '')
