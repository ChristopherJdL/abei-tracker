import React, { useState } from 'react';
import type { Sighting } from '../types';

interface AdminPanelProps {
  sightings: Sighting[];
  onClose: () => void;
}

export function AdminPanel({ sightings, onClose }: AdminPanelProps) {
  const [passphrase, setPassphrase] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Restriction logic
  const isBypass = new URLSearchParams(window.location.search).get('restriction') === 'bypass';
  const today = new Date();
  const isWednesday = today.getDay() === 3; // 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday
  const todayStr = today.toISOString().split('T')[0];
  const todaysCount = sightings.filter(s => s.createdOn?.startsWith(todayStr)).length;

  const isBlocked = !isBypass && (!isWednesday || todaysCount >= 2);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBlocked) return;
    
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const res = await fetch('/api/add-sighting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase, description })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to add sighting');
      }

      setMessage(data.message);
      setPassphrase('');
      setDescription('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="encounter-overlay" style={{ pointerEvents: 'auto' }}>
      <div className="encounter-card" style={{ width: '400px', padding: '20px' }}>
        <div className="encounter-header">
          <span className="encounter-title">ADD ABEI SIGHTING</span>
          <button className="encounter-close" onClick={onClose} disabled={loading}>X</button>
        </div>
        
        {isBlocked ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '20px', gap: '15px' }}>
            <img 
              src="/assets/abei-sleep.png" 
              alt="Abei Sleeping" 
              style={{ width: '150px', imageRendering: 'pixelated' }} 
            />
            <div style={{ color: 'var(--ice-cyan)', textAlign: 'center', fontFamily: 'inherit', fontSize: '14px', lineHeight: '1.5' }}>
              <strong>Abei doesn't want to travel now, he goes to sleep.</strong><br/>
              <span style={{ fontSize: '10px', opacity: 0.7 }}>(Travel is restricted to Wednesdays, max 2 per day)</span>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '12px', color: 'var(--ice-cyan)' }}>Admin Passphrase:</label>
              <input 
                type="password" 
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                disabled={loading}
                style={{ padding: '8px', background: 'rgba(0,0,0,0.5)', border: '2px solid var(--ice-edge)', color: 'white', fontFamily: 'inherit' }}
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '12px', color: 'var(--ice-cyan)' }}>Sighting Description:</label>
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
                rows={4}
                placeholder="e.g. Abei eating a pizza in Rome..."
                style={{ padding: '8px', background: 'rgba(0,0,0,0.5)', border: '2px solid var(--ice-edge)', color: 'white', fontFamily: 'inherit', resize: 'none' }}
                required
              />
            </div>

            {error && <div style={{ color: '#ff6b6b', fontSize: '12px' }}>{error}</div>}
            {message && <div style={{ color: '#4dff4d', fontSize: '12px' }}>{message}</div>}

            <button 
              type="submit" 
              disabled={loading}
              style={{ 
                padding: '10px', 
                background: 'var(--ice-cyan)', 
                color: 'black', 
                border: 'none', 
                cursor: loading ? 'wait' : 'pointer',
                fontFamily: 'inherit',
                fontWeight: 'bold',
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'GENERATING...' : 'SUBMIT SIGHTING'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
