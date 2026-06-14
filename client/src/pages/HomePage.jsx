import { useNavigate } from 'react-router-dom';
import FileDrop from '../components/FileDrop';
import { generateEncryptionKey } from '../utils/crypto';

export default function HomePage() {
  const navigate = useNavigate();

  const handleFileSelected = async (file) => {
    try {
      // Generate the zero-knowledge encryption key here
      // We do this BEFORE going to the room so we have it ready for the URL
      const { base64Key } = await generateEncryptionKey();
      
      // Store the file in memory to be picked up by the RoomPage
      window.__P2P_SELECTED_FILE = file;
      
      // Navigate to a new room (we don't have the ID yet, we'll create it on mount in RoomPage)
      navigate('/room/new', { state: { encryptionKey: base64Key } });
    } catch (error) {
      console.error('Error preparing file:', error);
      alert('Failed to initialize encryption for this file.');
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-12 flex flex-col items-center justify-center px-4 relative z-10">
      
      {/* Hero Section */}
      <div className="text-center max-w-3xl mx-auto mb-16 animate-slide-up">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neon-indigo/10 border border-neon-indigo/20 text-neon-indigo text-xs font-semibold uppercase tracking-wider mb-6">
          <span className="w-2 h-2 rounded-full bg-neon-indigo animate-pulse"></span>
          Decentralized File Sharing
        </div>
        
        <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-6 tracking-tight">
          Share files directly.<br />
          <span className="bg-gradient-to-r from-neon-indigo via-neon-violet to-neon-purple bg-clip-text text-transparent">
            No servers. No limits.
          </span>
        </h1>
        
        <p className="text-lg text-gray-400 mb-8 max-w-2xl mx-auto">
          Send files directly from your browser to theirs using WebRTC. 
          End-to-end encrypted. Zero data stored on our servers.
        </p>
      </div>

      {/* Main Upload Area */}
      <div className="w-full animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <FileDrop onFileSelected={handleFileSelected} />
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mt-24 animate-slide-up" style={{ animationDelay: '0.2s' }}>
        <FeatureCard 
          title="Direct P2P Transfer" 
          description="Files stream directly between browsers using WebRTC Data Channels. Faster and more secure than cloud storage."
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10l-6-4.34V16z"/>
            </svg>
          }
        />
        <FeatureCard 
          title="Zero-Knowledge Encryption" 
          description="Chunks are encrypted locally with AES-GCM 256. The decryption key is in the URL hash, never sent to the signaling server."
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          }
        />
        <FeatureCard 
          title="Auto-Resume" 
          description="Connection dropped? No problem. The transfer automatically picks up from the last verified chunk when reconnected."
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10"/>
              <polyline points="23 20 23 14 17 14"/>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
            </svg>
          }
        />
      </div>

      {/* Footer */}
      <footer className="mt-24 text-center text-sm text-gray-500">
        <p>Built with React, WebRTC, and Tailwind CSS</p>
      </footer>
    </div>
  );
}

function FeatureCard({ title, description, icon }) {
  return (
    <div className="bg-glass/50 border border-glass-border rounded-2xl p-6 hover:bg-glass hover:border-neon-indigo/30 transition-all duration-300">
      <div className="w-12 h-12 rounded-xl bg-void border border-glass-border flex items-center justify-center text-neon-indigo mb-4">
        <div className="w-6 h-6">{icon}</div>
      </div>
      <h3 className="text-white font-semibold mb-2">{title}</h3>
      <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
    </div>
  );
}
