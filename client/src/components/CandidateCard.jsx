import { photoUrl } from '../lib/format';

export default function CandidateCard({ candidate, position, selected, onSelect }) {
  const url = photoUrl(candidate.photo);
  return (
    <label className={`relative card p-4 cursor-pointer transition-all duration-200 border-2 ${selected ? 'border-primary-500 ring-2 ring-primary-500/30' : 'border-transparent hover:shadow-md'}`}>
      <input
        id={`candidate-option-${candidate.candidate_id || candidate._id}`}
        type="radio"
        name={`votes_${position}`}
        value={candidate.candidate_id || candidate._id}
        checked={selected}
        onChange={() => onSelect(candidate.candidate_id || candidate._id)}
        className="sr-only peer"
      />
      <div className="flex flex-col items-center text-center gap-3">
        {url ? (
          <img
            src={url}
            alt={candidate.name}
            className="w-20 h-20 rounded-full object-cover border-4 border-slate-100 dark:border-slate-700"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-brand-gradient flex items-center justify-center text-white text-2xl font-bold">{(candidate.name || '?').charAt(0).toUpperCase()}</div>
        )}
        <div>
          <div className="font-semibold text-slate-800 dark:text-slate-100">{candidate.name}</div>
          {candidate.bio && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-3">{candidate.bio}</p>}
        </div>
      </div>
      <div
        className={`absolute top-3 right-3 w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] transition ${
          selected ? 'bg-success-500 border-success-500 text-white' : 'border-slate-300 dark:border-slate-600 text-transparent'
        }`}
      >
        <i className="fas fa-check" />
      </div>
    </label>
  );
}
