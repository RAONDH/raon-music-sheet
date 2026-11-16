const mongoose = require('mongoose')

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    // 팀장이 임시 비밀번호로 초기화하면 true → 다음 로그인 때 비밀번호 변경을 안내한다
    mustChangePassword: {
      type: Boolean,
      default: false,
    },
    // 악보 파일 올리기 전 '사용 권한이 있는 악보만 올린다'에 동의한 때와 그때 안내문 판 번호
    sheetRightsAgreedAt: { type: Date, default: null },
    sheetRightsVersion: { type: Number, default: 0 },
    // 각자 따로 표시하는 즐겨찾기 곡 (다른 사람에게는 보이지 않는다)
    favoriteSongs: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Song',
      },
    ],
    // 관리자가 사용을 멈춘 계정 → 로그인할 수 없고, 쓰던 기기도 로그아웃된다
    suspended: { type: Boolean, default: false },
    // 이 시각 전에 받은 로그인은 더 이상 쓸 수 없다 (관리자가 비밀번호를 초기화하거나 사용을 멈췄을 때)
    sessionsRevokedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    // 임시 비밀번호의 유효 기한 (지나면 그 임시 비밀번호로는 로그인할 수 없다)
    tempPasswordExpiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model('User', userSchema)