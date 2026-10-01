import { Link } from 'react-router-dom';
import FaceGate from '../components/face/FaceGate';
import { useAuth } from '../context/AuthContext';

export default function FaceVerify() {
  const { refreshUser } = useAuth();
  return (
    <div className="max-w-3xl mx-auto py-10 space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">
          <i className="fas fa-camera text-primary-600 mr-2" /> Face Verification
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Complete this one-time check to unlock voting.</p>
      </div>
      <FaceGate onComplete={refreshUser} onError={() => {}} />
      <div className="text-center">
        <Link to="/dashboard" className="btn-secondary">
          <i className="fas fa-arrow-left" /> Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
