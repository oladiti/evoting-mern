import Vote from '../models/Vote.js';
import Candidate from '../models/Candidate.js';
import Election from '../models/Election.js';
import { resolveElection, electionRef } from '../services/elections.js';
import { getSetting } from '../services/settings.js';

async function buildResults(electionId) {
  const election = await resolveElection(electionId);
  if (!election) throw Object.assign(new Error('Election not found.'), { status: 404 });

  const candidates = await Candidate.find({ election: election._id });

  const counts = await Vote.aggregate([{ $match: { election: election._id } }, { $group: { _id: '$candidate', votes: { $sum: 1 } } }]);
  const countMap = {};
  counts.forEach((c) => {
    countMap[String(c._id)] = c.votes;
  });

  const byPosition = {};
  const positions = [...new Set(candidates.map((c) => c.position))].sort();
  for (const position of positions) {
    const list = candidates
      .filter((c) => c.position === position)
      .map((c) => {
        const votes = countMap[String(c._id)] || 0;
        return { candidate: c, votes };
      })
      .sort((a, b) => b.votes - a.votes);
    const total = list.reduce((s, c) => s + c.votes, 0);
    const topVotes = list[0]?.votes || 0;
    byPosition[position] = {
      candidates: list.map(({ candidate, votes }) => ({
        candidate_id: candidate._id,
        name: candidate.name,
        photo: candidate.photo,
        bio: candidate.bio,
        votes,
        percentage: total ? (votes / total) * 100 : 0,
        is_winner: votes > 0 && votes === topVotes,
      })),
      total_votes: total,
    };
  }

  return { election, by_position: byPosition, total_votes_cast: counts.reduce((s, c) => s + c.votes, 0) };
}

export async function getResults(req, res, next) {
  try {
    const { idOrSlug } = req.params;

    const visible = await getSetting('results_visible', true);
    let overridden = Boolean(req.user?.is_admin);
    if (!req.user && !visible) return res.status(403).json({ error: 'Results are not available yet.' });

    // Resolve once and reuse: this used to be a second, independent lookup in
    // the visibility gate, which would have needed the same slug handling and
    // is easy to miss when the param is an id-or-slug.
    const election = await resolveElection(idOrSlug);
    if (!election) return res.status(404).json({ error: 'Election not found.' });

    if (req.user && !req.user.is_admin && !visible) {
      overridden = election.end_date < new Date();
      if (!overridden) return res.status(403).json({ error: 'Results are not available yet.' });
    }

    const data = await buildResults(election._id);
    data.can_view = true;
    return res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getAllResults(req, res, next) {
  try {
    const visible = await getSetting('results_visible', true);
    const now = new Date();
    const isAdmin = req.user?.is_admin;
    const elections = await Election.find({}).sort({ start_date: -1 });
    const viewable = elections.filter((e) => isAdmin || (visible && e.end_date < now));
    const results = [];
    for (const e of viewable) {
      const data = await buildResults(e._id);
      // Was { election: data.election, ...data, election: {...} } — a duplicate
      // key, so the spread's election was silently discarded and the hand-rolled
      // object won. It used _id (not election_id) and had no slug, which is
      // exactly the field a per-election link needs. electionRef keeps it in sync.
      results.push({ ...data, election: electionRef(e) });
    }
    return res.json({ elections: results });
  } catch (err) {
    next(err);
  }
}

export async function getLiveResults(req, res, next) {
  try {
    const visible = await getSetting('results_visible', true);
    if (!visible && !req.user?.is_admin) {
      return res.status(403).json({ error: 'Results are not available yet.' });
    }
    const now = new Date();
    const elections = await Election.find({ start_date: { $lte: now }, end_date: { $gte: now } });
    const out = [];
    for (const e of elections) {
      out.push(await buildResults(e._id));
    }
    return res.json({ elections: out });
  } catch (err) {
    next(err);
  }
}
