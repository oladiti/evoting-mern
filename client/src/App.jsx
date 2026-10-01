import { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';

import PublicLayout from './components/layout/PublicLayout';
import AppLayout from './components/layout/AppLayout';
import AdminLayout from './components/layout/AdminLayout';
import BackToTop from './components/BackToTop';
import { ProtectedRoute, AdminRoute, GuestRoute } from './components/ui/guards';
import { useAuth } from './context/AuthContext';
import CookieConsent from './components/CookieConsent';
import { FullLoader } from './components/ui';

// Every page is code-split. The 26 static imports this replaces put the whole
// application - plus Chart.js, framer-motion and the face-api.js detection
// models - into a single ~1.3MB entry chunk that every anonymous visitor to the
// login page downloaded in full.
//
// The layouts stay eager on purpose: they are on the critical path for every
// route, so splitting them would only add a request without shrinking anything.
// Chart.js is already a dynamic import inside the admin/Results pages.
const Home = lazy(() => import('./pages/Home'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Help = lazy(() => import('./pages/Help'));
const Features = lazy(() => import('./pages/Features'));
const Contact = lazy(() => import('./pages/Contact'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Vote = lazy(() => import('./pages/Vote'));
const Results = lazy(() => import('./pages/Results'));
const FaceEnroll = lazy(() => import('./pages/FaceEnroll'));
const FaceVerify = lazy(() => import('./pages/FaceVerify'));
const NotFound = lazy(() => import('./pages/NotFound'));

const Privacy = lazy(() => import('./pages/legal/Privacy'));
const Terms = lazy(() => import('./pages/legal/Terms'));
const CookiePolicy = lazy(() => import('./pages/legal/CookiePolicy'));

const AdminOverview = lazy(() => import('./pages/admin/AdminOverview'));
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'));
const AdminElections = lazy(() => import('./pages/admin/AdminElections'));
const AdminAccredit = lazy(() => import('./pages/admin/AdminAccredit'));
const AdminLogs = lazy(() => import('./pages/admin/AdminLogs'));
const AdminContacts = lazy(() => import('./pages/admin/AdminContacts'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));

function SessionWatcher() {
  const navigate = useNavigate();
  const { setUser } = useAuth();

  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      navigate('/login', { replace: true, state: { sessionExpired: true } });
    };
    window.addEventListener('app:session-expired', onExpired);
    return () => window.removeEventListener('app:session-expired', onExpired);
  }, [navigate, setUser]);

  return null;
}

export default function App() {
  return (
    <>
      <SessionWatcher />
      {/* One boundary around the whole route tree. Each page chunk is fetched
          on navigation; without a Suspense parent above them, the first one to
          resolve would throw "A component suspended while responding to
          synchronous input" or simply render nothing. */}
      <Suspense fallback={<FullLoader />}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/help" element={<Help />} />
            <Route path="/features" element={<Features />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/cookies" element={<CookiePolicy />} />
            <Route path="*" element={<NotFound />} />
          </Route>

          <Route element={<GuestRoute />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>

          {/* Token-bearing recovery links. These sit outside GuestRoute on purpose: a
              password reset must stay reachable when the browser still holds a
              session, otherwise the guard silently redirects to the dashboard and
              the emailed ?token= is lost. */}
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/vote/:slug" element={<Vote />} />
              <Route path="/results" element={<Results />} />
              <Route path="/results/:slug" element={<Results />} />
              <Route path="/face-enroll" element={<FaceEnroll />} />
              <Route path="/face-verify" element={<FaceVerify />} />
            </Route>
          </Route>

          <Route element={<AdminRoute />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<AdminOverview />} />
              <Route path="/admin/analytics" element={<AdminAnalytics />} />
              <Route path="/admin/elections" element={<AdminElections />} />
              <Route path="/admin/accredit" element={<AdminAccredit />} />
              <Route path="/admin/logs" element={<AdminLogs />} />
              <Route path="/admin/contacts" element={<AdminContacts />} />
              <Route path="/admin/settings" element={<AdminSettings />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <BackToTop />
      <CookieConsent />
    </>
  );
}
