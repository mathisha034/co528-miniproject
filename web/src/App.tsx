import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/layout/Layout';

import { Dashboard } from './pages/Dashboard/Dashboard';
import { Feed } from './pages/Feed/Feed';
import { Jobs } from './pages/Jobs/Jobs';
import { Events } from './pages/Events/Events';
import { Research } from './pages/Research/Research';
import { Notifications } from './pages/Notifications/Notifications';
import { Profile } from './pages/Profile/Profile';
import { Analytics } from './pages/Analytics/Analytics';
import { InfraStatus } from './pages/InfraStatus/InfraStatus';
const Unauthorized = () => <div><h1 style={{ padding: '2rem' }}>403 Unauthorized: You do not have permission to view this page.</h1></div>;

function App() {
  return (
    <Routes>
      {/* Routes needing Layout and Auth */}
      <Route element={<Layout />}>
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/feed" element={<ProtectedRoute><Feed /></ProtectedRoute>} />
        <Route path="/jobs" element={<ProtectedRoute><Jobs /></ProtectedRoute>} />
        <Route path="/events" element={<ProtectedRoute><Events /></ProtectedRoute>} />
        <Route path="/research" element={<ProtectedRoute><Research /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

        {/* Admin routes */}
        <Route
          path="/analytics"
          element={<ProtectedRoute roles={['admin']}><Analytics /></ProtectedRoute>}
        />
        <Route
          path="/infra"
          element={<ProtectedRoute roles={['admin']}><InfraStatus /></ProtectedRoute>}
        />
      </Route>

      {/* Routes without standard Layout */}
      <Route path="/unauthorized" element={<Unauthorized />} />
    </Routes>
  );
}

export default App;
