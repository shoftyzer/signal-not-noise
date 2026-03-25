import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import SignalList from './pages/SignalList';
import SignalDetail from './pages/SignalDetail';
import SignalForm from './pages/SignalForm';

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen bg-slate-50">
        <Navbar />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/signals" element={<SignalList />} />
            <Route path="/signals/new" element={<SignalForm />} />
            <Route path="/signals/:id" element={<SignalDetail />} />
            <Route path="/signals/:id/edit" element={<SignalForm />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
