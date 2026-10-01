import { Router } from 'express';
import * as auth from '../controllers/authController.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = Router();

router.get('/bootstrap', auth.publicBootstrap);
router.post('/register', auth.register);
router.post('/verify-email', auth.verifyEmail);
router.post('/resend-verification', auth.resendVerification);
router.post('/login', auth.login);
router.post('/logout', requireAuth, auth.logout);
router.post('/logout-all', requireAuth, auth.logoutEverywhere);
router.post('/refresh', auth.refresh);
router.post('/forgot-password', auth.forgotPassword);
router.post('/reset-password', auth.resetPassword);
router.get('/me', optionalAuth, auth.me);

export default router;
