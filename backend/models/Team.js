const mongoose = require('mongoose')
const crypto = require('crypto')

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // 관리자가 켜면 이 팀의 곡 정보(악보 파일 빼고)를 가입한 모든 사람이 보고 자기 곡으로 가져갈 수 있다
    sharedLibrary: { type: Boolean, default: false },
    inviteCode: {
      type: String,
      unique: true,
      default: () => crypto.randomBytes(4).toString('hex').toUpperCase(),
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Team', teamSchema)
