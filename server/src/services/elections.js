import Election from '../models/Election.js';
import { isObjectId } from '../config/db.js';
import { slugify } from '../utils/index.js';

/**
 * Resolves an election from either its ObjectId or its public slug.
 *
 * Public URLs carry the slug, but links shared before slugs existed (and the
 * admin pages, which still address elections by id) pass an ObjectId, so both
 * have to work. Branching on isObjectId is what keeps a slug from reaching
 * findById, where it would throw a CastError instead of returning a clean 404.
 */
export async function resolveElection(idOrSlug, { populate } = {}) {
  if (idOrSlug === undefined || idOrSlug === null || idOrSlug === '') return null;

  const query = isObjectId(idOrSlug) ? Election.findById(idOrSlug) : Election.findOne({ slug: String(idOrSlug).trim().toLowerCase() });

  return populate ? query.populate(populate) : query;
}

/**
 * Returns a slug that no other election holds, appending -2, -3, ... on
 * collision. excludeId keeps an election from colliding with itself when it is
 * renaming. The loop is capped so a pathological title can't spin forever.
 */
export async function uniqueSlug(desired, { excludeId = null, maxAttempts = 50 } = {}) {
  const base = slugify(desired);
  for (let i = 1; i <= maxAttempts; i += 1) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const clash = await Election.exists({ slug: candidate, ...(excludeId ? { _id: { $ne: excludeId } } : {}) });
    if (!clash) return candidate;
  }
  throw new Error('Could not generate a unique slug. Please choose another.');
}

/**
 * The election fields the results list actually needs. Kept in one place so the
 * slug is never dropped from a hand-rolled projection.
 */
export function electionRef(e) {
  if (!e) return null;
  return {
    _id: e._id,
    election_id: e._id,
    slug: e.slug || null,
    title: e.title,
    description: e.description,
    end_date: e.end_date,
  };
}
