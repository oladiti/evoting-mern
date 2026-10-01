import { Router } from 'express';
import * as election from '../controllers/electionController.js';
import * as results from '../controllers/resultsController.js';
import * as vote from '../controllers/voteController.js';
import * as face from '../controllers/faceController.js';
import * as contact from '../controllers/contactController.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadFacePhoto } from '../middleware/upload.js';

const router = Router();

router.get('/elections', requireAuth, election.getElections);
router.get('/elections/:idOrSlug', requireAuth, election.getElection);
router.get('/elections/:idOrSlug/positions', requireAuth, election.getPositions);
router.post('/votes/cast', requireAuth, vote.castVote);

// Order matters: the two literals are declared before the param so they are not
// swallowed by it. Renaming the param below does not affect that.
router.get('/results/live', requireAuth, results.getLiveResults);
router.get('/results/all', requireAuth, results.getAllResults);
router.get('/results/:idOrSlug', requireAuth, results.getResults);

router.get('/face/status', requireAuth, face.faceStatus);
router.post('/face/enroll', requireAuth, uploadFacePhoto, face.enrollFace);
router.post('/face/verify', requireAuth, face.verifyFace);

router.post('/contact', contact.submitContact);

export default router;
