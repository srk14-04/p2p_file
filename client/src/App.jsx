import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import ParticleBackground from './components/ParticleBackground';
import HomePage from './pages/HomePage';
import RoomPage from './pages/RoomPage';

function App() {
  return (
    <BrowserRouter>
      <div className="bg-void min-h-screen text-gray-200 font-sans selection:bg-neon-indigo/30 selection:text-white">
        <ParticleBackground />
        <Header />
        
        <main>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/room/:id" element={<RoomPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
