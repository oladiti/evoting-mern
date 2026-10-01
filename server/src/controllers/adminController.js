import mongoose from 'mongoose';
import User from '../models/User.js';
import Election from '../models/Election.js';
import Candidate from '../models/Candidate.js';
import Vote from '../models/Vote.js';
import Accreditation from '../models/Accreditation.js';
import ActivityLog from '../models/ActivityLog.js';
import Contact from '../models/Contact.js';
import EmailVerification from '../models/EmailVerification.js';
import { logActivity } from '../services/activityLog.js';
import { sendAccreditationEmail, sendContactReply } from '../services/email.js';
import { resolveElection, electionRef } from '../services/elections.js';
import { escapeRegExp, publicUrl } from '../utils/index.js';

export async function getStats(req, res, next) {
  try {
    // Voter metrics must exclude admin accounts: the cards are labelled
    // "Registered Voters" / "Faces Enrolled", and counting the admin login
    // inflated both by one.
    const voterFilter = { is_admin: false };
    const [elections, activeElections, candidates, voters, votesCast, facesEnrolled, unreadContacts] = await Promise.all([
      Election.countDocuments(),
      Election.countDocuments({ start_date: { $lte: new Date() }, end_date: { $gte: new Date() } }),
      Candidate.countDocuments(),
      User.countDocuments(voterFilter),
      Vote.countDocuments(),
      User.countDocuments({ ...voterFilter, face_enrolled: true }),
      Contact.countDocuments({ is_read: false }),
    ]);
    return res.json({ stats: { elections, active_lections: activeElections, candidates, voters, votes_cast: votesCast, faces_enrolled: facesEnrolled, unread_contacts: unreadContacts } });
  } catch (err) {
    next(err);
  }
}

// ---------- Analytics ----------

const ANALYTICS_DEFAULT_DAYS = 30;
// A year. Long enough for a "compare this year" view, short enough that the
// per-day bucket array and the chart labels stay readable. Clamped rather than
// rejected, so a hand-typed ?days=9999 degrades to a full year instead of erroring.
const ANALYTICS_MAX_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

// Buckets are UTC days and the key sent to the client is a plain YYYY-MM-DD
// string rather than a Date. A Date would be re-read in the browser's timezone,
// so a vote cast at 00:30 Lagos (23:30 UTC the previous day) would be filed under
// the previous day for one reader and the current day for another, and the chart
// would disagree with the database depending on who opened it. The string is
// unambiguous; the client parses it back as UTC when it needs a label.
function utcDayKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

// Every day in the window, in order, including the ones with no documents. A
// $group by bucket only ever returns days that have rows, so a line chart fed
// straight from the aggregation would draw a straight line across a quiet week
// and imply voting continued through it. The client gets a dense series instead.
function dayBuckets(from, days) {
  return Array.from({ length: days }, (_, i) => utcDayKey(new Date(from.getTime() + i * DAY_MS)));
}

function countByBucket(rows) {
  const map = new Map();
  rows.forEach((r) => map.set(utcDayKey(r._id), r.count));
  return map;
}

function densify(buckets, rows) {
  const map = countByBucket(rows);
  return buckets.map((date) => ({ date, count: map.get(date) || 0 }));
}

export async function getAnalytics(req, res, next) {
  try {
    const { days: daysParam, election_id: electionIdParam } = req.query;

    const days = Math.min(ANALYTICS_MAX_DAYS, Math.max(1, Number(daysParam) || ANALYTICS_DEFAULT_DAYS));

    // Scope is optional. Omitting it reports every election, which is the right
    // default for a page whose job is to show how the system as a whole is being
    // used; passing one narrows the vote-derived figures to that election. The
    // trend lines stay system-wide on purpose - "how has turnout moved" is a
    // question about the platform, and scoping it to one election would make the
    // chart empty for every other one.
    let election = null;
    if (electionIdParam) {
      election = await resolveElection(electionIdParam);
      if (!election) return res.status(404).json({ error: 'Election not found.' });
    }

    const scope = election ? { election: election._id } : {};
    // Same rule as getStats: the cards say "voters", and admin accounts are not
    // voters. Counting them inflates the register and drags turnout down.
    const voterFilter = { is_admin: false };

    const now = new Date();
    // Start of the current UTC day, minus (days - 1) whole days, so the window is
    // exactly `days` buckets wide and ends on today rather than mid-afternoon.
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));
    const since = { $gte: from };
    const buckets = dayBuckets(from, days);

    const [
      voters,
      votesCast,
      electionCount,
      candidateCount,
      accreditations,
      facesEnrolled,
      emailVerified,
      messageCount,
      voteDays,
      registrationDays,
      loginDays,
      hourlyRows,
      positionVotes,
      positionCandidates,
      activityRows,
      failedLogins,
      failedFaceChecks,
      lockedVoters,
      electionRows,
      perElection,
      distinctVoters,
    ] = await Promise.all([
      User.countDocuments(voterFilter),
      Vote.countDocuments(scope),
      Election.countDocuments(),
      election ? Candidate.countDocuments({ election: election._id }) : Candidate.countDocuments(),
      election ? Accreditation.countDocuments({ election: election._id }) : Accreditation.countDocuments(),
      User.countDocuments({ ...voterFilter, face_enrolled: true }),
      User.countDocuments({ ...voterFilter, email_verified: true }),
      Contact.countDocuments(),
      // vote_time, not created_at: the Vote schema renames its timestamp field.
      // Aggregating on created_at matches nothing and would render as a flat line.
      Vote.aggregate([{ $match: { ...scope, vote_time: since } }, { $group: { _id: { $dateTrunc: { date: '$vote_time', unit: 'day', timezone: 'UTC' } }, count: { $sum: 1 } } }]),
      User.aggregate([{ $match: { ...voterFilter, created_at: since } }, { $group: { _id: { $dateTrunc: { date: '$created_at', unit: 'day', timezone: 'UTC' } }, count: { $sum: 1 } } }]),
      ActivityLog.aggregate([{ $match: { action: 'LOGIN', created_at: since } }, { $group: { _id: { $dateTrunc: { date: '$created_at', unit: 'day', timezone: 'UTC' } }, count: { $sum: 1 } } }]),
      // UTC hours, so "when do people vote" is a single shared frame of reference
      // rather than one that shifts with the admin's browser.
      Vote.aggregate([{ $match: { ...scope, vote_time: since } }, { $group: { _id: { $hour: { date: '$vote_time', timezone: 'UTC' } }, count: { $sum: 1 } } }]),
      // position_voted is denormalised onto the vote, so the split needs no join
      // back to candidates.
      Vote.aggregate([{ $match: { ...scope, vote_time: since } }, { $group: { _id: '$position_voted', votes: { $sum: 1 } } }]),
      election
        ? Candidate.aggregate([{ $match: { election: election._id } }, { $group: { _id: '$position', candidates: { $sum: 1 } } }])
        : Candidate.aggregate([{ $group: { _id: '$position', candidates: { $sum: 1 } } }]),
      ActivityLog.aggregate([{ $match: { created_at: since } }, { $group: { _id: '$action', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]),
      ActivityLog.countDocuments({ action: 'LOGIN_FAILED', created_at: since }),
      ActivityLog.countDocuments({ action: 'FACE_VERIFY_FAILED', created_at: since }),
      User.countDocuments({ ...voterFilter, face_locked_until: { $gt: now } }),
      // One list serves both the scope selector and the per-election table, so it
      // is capped rather than unbounded. 50 is far past any plausible election
      // count for one institution, and a chart that silently omits old elections
      // is worse than one that stops.
      Election.find({}).sort({ start_date: -1 }).limit(50),
      Vote.aggregate([{ $match: scope }, { $group: { _id: '$election', votes: { $sum: 1 }, voters: { $addToSet: '$user' } } }, { $project: { votes: 1, voters: { $size: '$voters' } } }]),
      Vote.distinct('user', scope),
    ]);

    // The denominator follows the same population the votes were drawn from.
    // When an election requires accreditation, only accredited voters were ever
    // able to vote in it, so measuring against the whole register would report a
    // turnout nobody could have reached. The {user, election} unique index makes
    // one row per voter, so the count is already distinct.
    const eligible = election && election.requires_accreditation ? accreditations : voters;
    const turnout = {
      eligible,
      voted: distinctVoters.length,
      percentage: eligible ? Math.round((distinctVoters.length / eligible) * 1000) / 10 : 0,
    };

    const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, votes: hourlyRows.find((h) => h._id === hour)?.count || 0 }));

    // Union of both sides: a position can have candidates and no votes yet, and
    // can have votes whose candidates have since been deleted. Either alone would
    // silently drop rows from the chart.
    const candidateMap = new Map(positionCandidates.map((c) => [c._id, c.candidates]));
    const byPosition = [...new Set([...positionVotes.map((v) => v._id), ...positionCandidates.map((c) => c._id)])]
      .filter(Boolean)
      .map((position) => ({ position, candidates: candidateMap.get(position) || 0, votes: positionVotes.find((v) => v._id === position)?.votes || 0 }))
      .sort((a, b) => b.votes - a.votes);

    const perElectionMap = new Map(perElection.map((r) => [String(r._id), r]));
    // Per-election turnout is measured against the full register for every row, so
    // these percentages are comparable to each other but are not eligibility
    // figures. requires_accreditation rides along so the client can mark the rows
    // where a lower number is expected rather than reading them as a shortfall.
    const elections = electionRows.map((e) => {
      const row = perElectionMap.get(String(e._id));
      return {
        ...electionRef(e),
        status: e.status(),
        requires_accreditation: e.requires_accreditation,
        votes: row?.votes || 0,
        voters: row?.voters || 0,
        turnout_percentage: voters ? Math.round(((row?.voters || 0) / voters) * 1000) / 10 : 0,
      };
    });

    return res.json({
      range: { days, from: utcDayKey(from), to: utcDayKey(now) },
      election: electionRef(election),
      totals: {
        voters,
        votes_cast: votesCast,
        elections: electionCount,
        candidates: candidateCount,
        accreditations,
        faces_enrolled: facesEnrolled,
        email_verified: emailVerified,
        messages: messageCount,
      },
      turnout,
      series: {
        registrations: densify(buckets, registrationDays),
        votes: densify(buckets, voteDays),
        logins: densify(buckets, loginDays),
      },
      hourly,
      by_position: byPosition,
      activity: activityRows.map((a) => ({ action: a._id, count: a.count })),
      security: { failed_logins: failedLogins, failed_face_checks: failedFaceChecks, locked_voters: lockedVoters },
      elections,
    });
  } catch (err) {
    next(err);
  }
}

// ---------- Accreditation ----------

export async function listVoters(req, res, next) {
  try {
    const { election_id } = req.params;
    const { q = '' } = req.query;
    const election = await Election.findById(election_id);
    if (!election) return res.status(404).json({ error: 'Election not found.' });

    const filter = {};
    if (q) {
      const rx = new RegExp(escapeRegExp(q), 'i');
      filter.$or = [{ username: rx }, { email: rx }, { full_name: rx }, { matric_no: rx }];
    }
    const voters = await User.find(filter).sort({ created_at: -1 }).limit(500);
    const accreditations = await Accreditation.find({ election: election._id });
    const accSet = new Set(accreditations.map((a) => String(a.user)));

    return res.json({
      election: { _id: election._id, title: election.title, requires_accreditation: election.requires_accreditation },
      accreditation_open: accreditationWindowOpen(election),
      voters: voters.map((u) => ({
        user_id: u._id,
        username: u.username,
        full_name: u.full_name,
        email: u.email,
        matric_no: u.matric_no,
        is_accredited: accSet.has(String(u._id)),
        email_verified: u.email_verified,
      })),
    });
  } catch (err) {
    next(err);
  }
}

// Escape hatch for when the mail server is down: login is blocked for
// unverified accounts, so without this a misconfigured SMTP host permanently
// strands every affected voter with no way back in. Always audited, idempotent,
// and scoped to one user.
export async function verifyUserEmail(req, res, next) {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.email_verified) {
      return res.status(400).json({ error: 'This account is already verified.' });
    }

    user.email_verified = true;
    await user.save();
    // Discard any outstanding codes so they cannot be replayed later.
    await EmailVerification.deleteMany({ user: user._id });

    await logActivity({
      user: req.user,
      username: req.user.username,
      action: 'EMAIL_VERIFY_MANUAL',
      description: `Manually verified email for ${user.email} (${user.username})`,
      entity_type: 'User',
      entity_id: user._id,
      req,
    });

    return res.json({ message: `Email verified for ${user.email}.`, user_id: user._id, email: user.email, email_verified: true });
  } catch (err) {
    next(err);
  }
}

function accreditationWindowOpen(election) {
  const now = new Date();
  const s = election.accreditation_start_date || election.start_date;
  const e = election.accreditation_end_date || election.end_date;
  return now >= s && now <= e;
}

export async function accredit(req, res, next) {
  try {
    const { election_id, user_id } = req.body || {};
    const election = await Election.findById(election_id);
    if (!election) return res.status(404).json({ error: 'Election not found.' });
    const user = await User.findById(user_id);
    if (!user) return res.status(404).json({ error: 'Voter not found.' });

    const result = await Accreditation.updateOne(
      { user: user._id, election: election._id },
      { $set: { user: user._id, election: election._id, accredited_by: req.user._id }, $setOnInsert: { accredited_at: new Date() } },
      { upsert: true }
    );

    // The write was always an upsert on a unique {user, election} index, so a repeat
    // of this request matched the existing row and changed nothing. The mail was not
    // guarded the same way, so every repeat still fired an email and the voter was
    // told they had been accredited as many times as the request was delivered -
    // a double-click, a retried write, or an admin clicking again because the row
    // had not refreshed yet. upsertedCount is the atomic answer to "did this request
    // create the accreditation", so it, not the request itself, gates the mail. On a
    // genuine repeat it also keeps accredited_by pointing at whoever actually did it.
    const isNew = result.upsertedCount === 1;

    if (isNew) {
      const voteUrl = publicUrl('/dashboard');
      await sendAccreditationEmail(user.email, user.full_name, election.title, voteUrl);
    }

    await logActivity({
      user: req.user,
      username: req.user.username,
      action: 'ACCREDIT',
      description: `Accredited '${user.username}' for '${election.title}'`,
      entity_type: 'Accreditation',
      entity_id: election._id,
      req,
    });

    const who = user.full_name || user.username;
    return res.json(
      isNew ? { message: `${who} accredited.`, already_accredited: false, emailed: true } : { message: `${who} was already accredited for this election.`, already_accredited: true, emailed: false }
    );
  } catch (err) {
    next(err);
  }
}

export async function deaccredit(req, res, next) {
  try {
    const { election_id, user_id } = req.body || {};
    await Accreditation.deleteOne({ user: user_id, election: election_id });
    const election = await Election.findById(election_id);
    const user = await User.findById(user_id);
    await logActivity({
      user: req.user,
      username: req.user.username,
      action: 'DEACCREDIT',
      description: `De-accredited '${user?.username || user_id}' for '${election?.title || election_id}'`,
      entity_type: 'Accreditation',
      entity_id: election_id,
      req,
    });
    return res.json({ message: 'Voter de-accredited.' });
  } catch (err) {
    next(err);
  }
}

export async function bulkAccredit(req, res, next) {
  try {
    const { election_id, user_ids = [] } = req.body || {};
    const election = await Election.findById(election_id);
    if (!election) return res.status(404).json({ error: 'Election not found.' });
    const ids = [...new Set(user_ids.filter((x) => x))];
    let count = 0;
    for (const id of ids) {
      await Accreditation.updateOne(
        { user: id, election: election._id },
        { $set: { user: id, election: election._id, accredited_by: req.user._id }, $setOnInsert: { accredited_at: new Date() } },
        { upsert: true }
      );
      count++;
    }
    await logActivity({
      user: req.user,
      username: req.user.username,
      action: 'ACCREDIT',
      description: `Bulk accredited ${count} voter(s) for '${election.title}'`,
      entity_type: 'Accreditation',
      entity_id: election._id,
      req,
    });
    return res.json({ message: `${count} voter(s) accredited.`, count });
  } catch (err) {
    next(err);
  }
}

// ---------- Activity logs ----------

export async function listActivityLogs(req, res, next) {
  try {
    const { action = '', entity = '', q = '', page = 1, per_page = 50, days } = req.query;
    const filter = {};
    const ors = [];
    if (action) filter.action = action;
    if (entity) {
      ors.push({ entity_type: entity }, { entity_id: entity });
    }
    if (q) {
      const rx = new RegExp(escapeRegExp(q), 'i');
      ors.push({ username: rx }, { description: rx }, { action: rx });
    }
    if (ors.length) filter.$or = ors;
    if (days && Number(days) > 0) {
      filter.created_at = { $gte: new Date(Date.now() - Number(days) * 86400000) };
    }
    const pageNum = Math.max(1, Number(page) || 1);
    const per = Math.min(200, Math.max(1, Number(per_page) || 50));
    const [logs, total] = await Promise.all([
      ActivityLog.find(filter)
        .sort({ created_at: -1 })
        .skip((pageNum - 1) * per)
        .limit(per),
      ActivityLog.countDocuments(filter),
    ]);
    const actions = await ActivityLog.distinct('action');
    const totalPages = Math.ceil(total / per);
    return res.json({
      logs,
      total,
      page: pageNum,
      per_page: per,
      actions,
      pagination: { page: pageNum, per_page: per, total_count: total, total_pages: totalPages },
    });
  } catch (err) {
    next(err);
  }
}

export async function clearActivityLogs(req, res, next) {
  try {
    const { days } = req.body || {};
    const filter = {};
    if (days && Number(days) > 0) {
      filter.created_at = { $lte: new Date(Date.now() - Number(days) * 86400000) };
    }
    const result = await ActivityLog.deleteMany(filter);
    await logActivity({ user: req.user, username: req.user.username, action: 'LOGS_CLEAR', description: `Cleared ${result.deletedCount} activity log(s)`, entity_type: null, entity_id: null, req });
    return res.json({ message: `${result.deletedCount} log(s) cleared.` });
  } catch (err) {
    next(err);
  }
}

export async function exportActivityLogs(req, res, next) {
  try {
    const logs = await ActivityLog.find({}).sort({ created_at: -1 }).limit(5000);
    const rows = [['Timestamp', 'Username', 'Action', 'Description', 'Entity Type', 'Entity ID', 'IP Address']];
    logs.forEach((l) => {
      rows.push([new Date(l.created_at).toISOString(), l.username || '', l.action || '', l.description || '', l.entity_type || '', l.entity_id || '', l.ip_address || '']);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=activity_logs.csv');
    return res.send(csv);
  } catch (err) {
    next(err);
  }
}

// ---------- Contacts ----------

export async function listContacts(req, res, next) {
  try {
    const { q = '' } = req.query;
    const filter = q ? { $or: [{ name: new RegExp(escapeRegExp(q), 'i') }, { email: new RegExp(escapeRegExp(q), 'i') }, { subject: new RegExp(escapeRegExp(q), 'i') }] } : {};
    const [contacts, unread] = await Promise.all([Contact.find(filter).sort({ created_at: -1 }).limit(200), Contact.countDocuments({ is_read: false })]);
    return res.json({ contacts, unread_total: unread });
  } catch (err) {
    next(err);
  }
}

export async function getContact(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(404).json({ error: 'Message not found.' });
    const contact = await Contact.findById(id);
    if (!contact) return res.status(404).json({ error: 'Message not found.' });
    if (!contact.is_read) {
      contact.is_read = true;
      contact.read_at = new Date();
      await contact.save();
    }
    return res.json({ contact });
  } catch (err) {
    next(err);
  }
}

export async function toggleContactRead(req, res, next) {
  try {
    const { id } = req.params;
    const contact = await Contact.findById(id);
    if (!contact) return res.status(404).json({ error: 'Message not found.' });
    if (contact.is_read) {
      contact.is_read = false;
      contact.read_at = null;
    } else {
      contact.is_read = true;
      contact.read_at = new Date();
    }
    await contact.save();
    return res.json({ message: contact.is_read ? 'Marked as read.' : 'Marked as unread.', contact });
  } catch (err) {
    next(err);
  }
}

export async function replyContact(req, res, next) {
  try {
    const { id } = req.params;
    const { message } = req.body || {};
    if (!message || !String(message).trim()) return res.status(400).json({ error: 'Reply message is required.' });
    const contact = await Contact.findById(id);
    if (!contact) return res.status(404).json({ error: 'Message not found.' });
    contact.replied_at = new Date();
    contact.is_read = true;
    contact.read_at = contact.read_at || contact.replied_at;
    await contact.save();
    const emailResult = await sendContactReply(contact.email, contact.name, contact.subject, String(message).trim());
    if (!emailResult?.ok && !emailResult?.skipped) {
      return res.status(502).json({ error: 'Reply saved but the email could not be sent. Check SMTP configuration.' });
    }
    await logActivity({
      user: req.user,
      username: req.user.username,
      action: 'CONTACT_REPLY',
      description: `Replied to contact message from ${contact.name}`,
      entity_type: 'Contact',
      entity_id: contact._id,
      req,
    });
    return res.json({ message: 'Reply sent.' });
  } catch (err) {
    next(err);
  }
}

export async function deleteContact(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(404).json({ error: 'Message not found.' });
    const deleted = await Contact.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: 'Message not found.' });
    return res.json({ message: 'Message deleted.' });
  } catch (err) {
    next(err);
  }
}

// ---------- Export CSV ----------

export async function exportResultsCsv(req, res, next) {
  try {
    const { election_id } = req.params;
    const election = await Election.findById(election_id);
    if (!election) return res.status(404).json({ error: 'Election not found.' });
    const candidates = await Candidate.find({ election: election._id });
    const counts = await Vote.aggregate([{ $match: { election: election._id } }, { $group: { _id: '$candidate', votes: { $sum: 1 } } }]);
    const map = {};
    counts.forEach((c) => (map[String(c._id)] = c.votes));

    const positions = [...new Set(candidates.map((c) => c.position))].sort();
    const rows = [['Position', 'Candidate', 'Votes', 'Percentage']];
    for (const position of positions) {
      const list = candidates.filter((c) => c.position === position);
      const total = list.reduce((s, c) => s + (map[String(c._id)] || 0), 0);
      for (const c of list) {
        const votes = map[String(c._id)] || 0;
        rows.push([position, c.name, votes, total ? ((votes / total) * 100).toFixed(2) : '0.00']);
      }
    }
    const csv = rows.map((r) => r.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const title = election.title.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${title}_results.csv"`);
    await logActivity({
      user: req.user,
      username: req.user.username,
      action: 'EXPORT_CSV',
      description: `Exported results CSV for '${election.title}'`,
      entity_type: 'Election',
      entity_id: election._id,
      req,
    });
    return res.send(csv);
  } catch (err) {
    next(err);
  }
}
