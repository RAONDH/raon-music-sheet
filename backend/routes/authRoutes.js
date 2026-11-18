const express = require('express')
const router = express.Router()
const { signup, login, changePassword, checkEmail, forgotPassword, resetPassword } = require('../controllers/authController')
const { protect } = require('../middleware/authMiddleware')

router.post('/signup', signup)
router.post('/login', login)
router.post('/check-email', checkEmail)
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)
router.put('/change-password', protect, changePassword)

module.exports = router