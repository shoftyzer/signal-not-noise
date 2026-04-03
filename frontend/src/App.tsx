import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import SignalList from './pages/SignalList';
import SignalDetail from './pages/SignalDetail';
import SignalForm from './pages/SignalForm';
import WatchList from './pages/WatchList';
import ExternalSearch from './pages/ExternalSearch';
import LoginPage from './pages/LoginPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="*"
            element={
              <div className="flex h-screen bg-slate-50">
                <Navbar />
                <main className="flex-1 overflow-y-auto">
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/signals" element={<SignalList />} />
                    <Route path="/signals/:id" element={<SignalDetail />} />
                    <Route
                      path="/signals/new"
                      element={<ProtectedRoute><SignalForm /></ProtectedRoute>}
                    />
                    <Route
                      path="/signals/:id/edit"
                      element={<ProtectedRoute><SignalForm /></ProtectedRoute>}
                    />
                    <Route path="/watchlist" element={<WatchList />} />
                    <Route
                      path="/external-search"
                      element={<ProtectedRoute><ExternalSearch /></ProtectedRoute>}
                    />
                  </Routes>
                </main>
              </div>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
