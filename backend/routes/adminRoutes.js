const express = require('express')
const router = express.Router()
const { protect } = require('../middleware/authMiddleware')
const { requireOperator } = require('../utils/operator')
const c = require('../controllers/adminController')

// 관리자(ADMIN_EMAILS)만
router.use(protect, requireOperator)
router.get('/users', c.listUsers)
router.post('/users/:id/reset-password', c.resetPassword)
router.put('/users/:id/suspended', c.setSuspended)
router.get('/teams', c.listTeams)
router.put('/teams/:id/library', c.setTeamLibrary)
router.get('/me/library', c.myLibrary)
router.put('/me/library', c.setMyLibrary)

module.exports = router
