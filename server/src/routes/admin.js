import { Router } from 'express';
import * as admin from '../controllers/adminController.js';
import * as settings from '../controllers/settingsController.js';
import * as election from '../controllers/electionController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { uploadCandidatePhoto } from '../middleware/upload.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/stats', admin.getStats);
router.get('/analytics', admin.getAnalytics);

router.post('/elections', election.adminCreateElection);
router.put('/elections/:id', election.adminUpdateElection);
router.delete('/elections/:id', election.adminDeleteElection);

router.get('/candidates/:election_id?', election.adminListCandidates);
router.post('/candidates', uploadCandidatePhoto, election.adminCreateCandidate);
router.put('/candidates/:id', uploadCandidatePhoto, election.adminUpdateCandidate);
router.delete('/candidates/:id', election.adminDeleteCandidate);

router.get('/accredit/:election_id', admin.listVoters);
router.post('/accredit', admin.accredit);
router.post('/deaccredit', admin.deaccredit);
router.post('/accredit/bulk', admin.bulkAccredit);

router.post('/users/:id/verify-email', admin.verifyUserEmail);

router.get('/logs', admin.listActivityLogs);
router.post('/logs/clear', admin.clearActivityLogs);
router.get('/logs/export', admin.exportActivityLogs);

router.get('/contacts', admin.listContacts);
router.get('/contacts/:id', admin.getContact);
router.put('/contacts/:id/read', admin.toggleContactRead);
router.post('/contacts/:id/reply', admin.replyContact);
router.delete('/contacts/:id', admin.deleteContact);

router.get('/export/:election_id', admin.exportResultsCsv);

router.get('/settings', settings.getSettings);
router.put('/settings', settings.updateSettings);
router.post('/settings/test-email', settings.sendTestEmailToAdmin);
router.get('/backup', settings.backupDatabase);
router.post('/restore', settings.restoreDatabase);

export default router;
