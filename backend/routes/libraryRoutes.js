const express = require('express')
const router = express.Router()
const { protect } = require('../middleware/authMiddleware')
const c = require('../controllers/libraryController')

// 로그인한 사람 누구나
router.use(protect)
router.get('/', c.list)
router.post('/copy', c.copy)

module.exports = router
