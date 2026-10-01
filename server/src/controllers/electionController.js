import Election from '../models/Election.js';
import Candidate from '../models/Candidate.js';
import Vote from '../models/Vote.js';
import Accreditation from '../models/Accreditation.js';
import { logActivity } from '../services/activityLog.js';
import { resolveElection, uniqueSlug } from '../services/elections.js';
import { apify, slugify } from '../utils/index.js';

function serializeElection(e) {
  const d = apify(e) || { ...e };
  d.status = e.status && typeof e.status === 'function' ? e.status() : e.status;
  return d;
}

export async function getElections(req, res, next) {
  try {
    const now = new Date();
    const elections = await Election.find({}).sort({ start_date: 1 });

    if (req.user?.is_admin) {
      const all = await Promise.all(
        elections.map(async (e) => {
          const s = serializeElection(e);
          s.candidates = await Candidate.find({ election: e._id }).sort({ name: 1 });
          return s;
        })
      );
      return res.json({ elections: all });
    }

    const userId = req.user?._id;
    const [userVotes, accreditations, visibility] = await Promise.all([
      userId ? Vote.find({ user: userId }) : [],
      userId ? Accreditation.find({ user: userId }) : [],
      import('../services/settings.js').then((m) => m.getSetting('results_visible', true)),
    ]);

    const electionsVotedIn = new Set(userVotes.map((v) => String(v.election)));
    const accreditedSet = new Set(accreditations.map((a) => String(a.election)));

    const result = elections.map((e) => {
      const id = String(e._id);
      return {
        ...serializeElection(e),
        is_accredited: accreditedSet.has(id),
        has_voted: electionsVotedIn.has(id),
        can_view_results: visibility || now > e.end_date,
      };
    });

    return res.json({ elections: result });
  } catch (err) {
    next(err);
  }
}

export async function getElection(req, res, next) {
  try {
    const { idOrSlug } = req.params;
    const election = await resolveElection(idOrSlug, {
      populate: { path: 'candidate_refs', options: { sort: { name: 1 } } },
    });
    if (!election) return res.status(404).json({ error: 'Election not found.' });

    const s = serializeElection(election);
    s.candidates = (election.candidate_refs || []).map((c) => apify(c));

    if (req.user) {
      const [votes, acc] = await Promise.all([Vote.find({ user: req.user._id, election: election._id }), Accreditation.findOne({ user: req.user._id, election: election._id })]);
      s.already_voted = votes.length > 0;
      s.is_accredited = Boolean(acc);
      s.has_voted = votes.length > 0;
    }

    return res.json({ election: s });
  } catch (err) {
    next(err);
  }
}

export async function getPositions(req, res, next) {
  try {
    const { idOrSlug } = req.params;
    const election = await resolveElection(idOrSlug);
    if (!election) return res.status(404).json({ error: 'Election not found.' });

    // Query by the resolved _id, not the raw param: this is a string field
    // comparison against a schema ref, so a slug would silently match nothing.
    const positions = await Candidate.distinct('position', { election: election._id });
    const grouped = {};
    for (const position of positions) {
      grouped[position] = (await Candidate.find({ election: election._id, position }).sort({ name: 1 })).map((c) => apify(c));
    }
    return res.json({ positions, candidates_by_position: grouped });
  } catch (err) {
    next(err);
  }
}

// ---------- Admin ----------

export async function adminCreateElection(req, res, next) {
  try {
    const {
      title,
      slug,
      description = '',
      position = 'General Election',
      start_date,
      end_date,
      accreditation_start_date = null,
      accreditation_end_date = null,
      requires_accreditation = false,
    } = req.body || {};
    if (!title) return res.status(400).json({ error: 'Title is required.' });
    if (!start_date || !end_date) return res.status(400).json({ error: 'Start and end dates are required.' });
    const start = new Date(start_date);
    const end = new Date(end_date);
    if (isNaN(start) || isNaN(end) || start >= end) return res.status(400).json({ error: 'End date must be after start date.' });

    const aStart = accreditation_start_date ? new Date(accreditation_start_date) : null;
    const aEnd = accreditation_end_date ? new Date(accreditation_end_date) : null;
    if (aStart && aEnd && aEnd <= aStart) return res.status(400).json({ error: 'Accreditation end must be after accreditation start.' });

    // An admin-supplied slug wins; otherwise derive it from the title. Either
    // way it goes through uniqueSlug, so "General Election" created twice gets
    // general-election and general-election-2 rather than a duplicate-key crash.
    const finalSlug = await uniqueSlug(slug || title);

    const election = await Election.create({
      title,
      slug: finalSlug,
      description,
      position,
      start_date: start,
      end_date: end,
      accreditation_start_date: aStart,
      accreditation_end_date: aEnd,
      requires_accreditation: Boolean(requires_accreditation),
    });

    await logActivity({ user: req.user, username: req.user.username, action: 'ELECTION_CREATE', description: `Created election '${title}'`, entity_type: 'Election', entity_id: election._id, req });
    return res.status(201).json({ election: apify(election) });
  } catch (err) {
    next(err);
  }
}

export async function adminUpdateElection(req, res, next) {
  try {
    const { id } = req.params;
    const election = await Election.findById(id);
    if (!election) return res.status(404).json({ error: 'Election not found.' });

    const { title, slug, description, position, start_date, end_date, accreditation_start_date, accreditation_end_date, requires_accreditation } = req.body || {};
    if (title !== undefined) election.title = title;
    // Only when explicitly sent. Regenerating from a changed title would silently
    // repoint a URL that may already have been shared or bookmarked.
    if (slug !== undefined && String(slug).trim() !== '') {
      const desired = slugify(slug);
      if (desired !== election.slug) {
        const taken = await Election.exists({ slug: desired, _id: { $ne: election._id } });
        if (taken) return res.status(400).json({ error: `The URL slug "${desired}" is already in use.` });
        election.slug = desired;
      }
    }
    if (description !== undefined) election.description = description;
    if (position !== undefined) election.position = position;
    if (start_date !== undefined) election.start_date = new Date(start_date);
    if (end_date !== undefined) election.end_date = new Date(end_date);
    if (accreditation_start_date !== undefined) election.accreditation_start_date = accreditation_start_date ? new Date(accreditation_start_date) : null;
    if (accreditation_end_date !== undefined) election.accreditation_end_date = accreditation_end_date ? new Date(accreditation_end_date) : null;
    if (requires_accreditation !== undefined) election.requires_accreditation = Boolean(requires_accreditation);

    if (election.end_date <= election.start_date) return res.status(400).json({ error: 'End date must be after start date.' });
    if (election.accreditation_start_date && election.accreditation_end_date && election.accreditation_end_date <= election.accreditation_start_date) {
      return res.status(400).json({ error: 'Accreditation end must be after accreditation start.' });
    }

    await election.save();
    await logActivity({
      user: req.user,
      username: req.user.username,
      action: 'ELECTION_UPDATE',
      description: `Updated election '${election.title}'`,
      entity_type: 'Election',
      entity_id: election._id,
      req,
    });
    return res.json({ election: apify(election) });
  } catch (err) {
    next(err);
  }
}

export async function adminDeleteElection(req, res, next) {
  try {
    const { id } = req.params;
    const election = await Election.findById(id);
    if (!election) return res.status(404).json({ error: 'Election not found.' });

    await Election.deleteOne({ _id: election._id });
    await Promise.all([Vote.deleteMany({ election: election._id }), Candidate.deleteMany({ election: election._id }), Accreditation.deleteMany({ election: election._id })]);

    await logActivity({
      user: req.user,
      username: req.user.username,
      action: 'ELECTION_DELETE',
      description: `Deleted election '${election.title}'`,
      entity_type: 'Election',
      entity_id: election._id,
      req,
    });
    return res.json({ message: 'Election deleted.' });
  } catch (err) {
    next(err);
  }
}

export async function adminListCandidates(req, res, next) {
  try {
    const { election_id } = req.params;
    const candidates = await Candidate.find(election_id ? { election: election_id } : {})
      .sort({ position: 1, name: 1 })
      .populate('election', 'title');
    return res.json({ candidates: candidates.map((c) => apify(c)) });
  } catch (err) {
    next(err);
  }
}

export async function adminCreateCandidate(req, res, next) {
  try {
    const { election_id, position, name, bio = '' } = req.body || {};
    if (!election_id || !position || !name) return res.status(400).json({ error: 'Election, position and candidate name are required.' });
    const election = await Election.findById(election_id);
    if (!election) return res.status(404).json({ error: 'Election not found.' });

    const candidate = await Candidate.create({
      election: election._id,
      position,
      name,
      bio,
      photo: req.file ? `uploads/${req.file.filename}` : null,
    });

    await logActivity({
      user: req.user,
      username: req.user.username,
      action: 'CANDIDATE_CREATE',
      description: `Added candidate '${name}' (${position})`,
      entity_type: 'Candidate',
      entity_id: candidate._id,
      req,
    });
    return res.status(201).json({ candidate: apify(candidate) });
  } catch (err) {
    next(err);
  }
}

export async function adminUpdateCandidate(req, res, next) {
  try {
    const { id } = req.params;
    const candidate = await Candidate.findById(id);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found.' });

    const { position, name, bio } = req.body || {};
    if (position !== undefined) candidate.position = position;
    if (name !== undefined) candidate.name = name;
    if (bio !== undefined) candidate.bio = bio;
    if (req.file) candidate.photo = `uploads/${req.file.filename}`;

    await candidate.save();
    await logActivity({
      user: req.user,
      username: req.user.username,
      action: 'CANDIDATE_UPDATE',
      description: `Updated candidate '${candidate.name}'`,
      entity_type: 'Candidate',
      entity_id: candidate._id,
      req,
    });
    return res.json({ candidate: apify(candidate) });
  } catch (err) {
    next(err);
  }
}

export async function adminDeleteCandidate(req, res, next) {
  try {
    const { id } = req.params;
    const candidate = await Candidate.findById(id);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found.' });

    await Candidate.deleteOne({ _id: candidate._id });
    await Vote.deleteMany({ candidate: candidate._id });

    await logActivity({
      user: req.user,
      username: req.user.username,
      action: 'CANDIDATE_DELETE',
      description: `Deleted candidate '${candidate.name}'`,
      entity_type: 'Candidate',
      entity_id: candidate._id,
      req,
    });
    return res.json({ message: 'Candidate deleted.' });
  } catch (err) {
    next(err);
  }
}
