// 로그인 토큰(또는 악보 쿠키)의 주인이 지금도 쓸 수 있는 계정인지
// - 사용이 멈춘 계정은 안 된다
// - 관리자가 초기화·사용 중지한 시각보다 먼저 받은 로그인은 안 된다
module.exports = function sessionUsable(user, decoded) {
  if (!user || user.suspended) return false
  if (user.sessionsRevokedAt && (decoded?.iat || 0) < Math.floor(user.sessionsRevokedAt.getTime() / 1000)) return false
  return true
}
