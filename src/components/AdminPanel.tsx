import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  const isWednesday = today.getDay() === 3;
  const todayStr = today.toISOString().split('T')[0];
  const todaysCount = sightings.filter(s => s.createdOn?.startsWith(todayStr)).length;

  const isBlocked = !isBypass && (!isWednesday || todaysCount >= 2);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        throw new Error(`Server returned invalid JSON (Status ${res.status}): ${text.substring(0, 100)}...`);
      }

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

  return createPortal(
    <div className="encounter-layer" role="presentation">
      <div className="encounter-dim" aria-hidden />

      <div className="pixel-window" role="dialog" aria-modal="true" style={{ maxWidth: '400px' }}>
        <div className="pixel-window__bezel">
          <div className="pixel-window__titlebar">
            <p className="pixel-window__card" style={{ color: 'var(--ice-cyan)' }}>ADMIN COMMAND</p>
            <button
              type="button"
              className="modal-close"
              aria-label="Close admin"
              onClick={onClose}
              disabled={loading}
            >
              X
            </button>
          </div>

          <div className="pixel-window__body">
            <header className="pixel-window__header">
              <div>
                <p className="pixel-window__label" style={{ color: '#ff6b6b' }}>RESTRICTED ACCESS</p>
                <h2 id="encounter-title" style={{ fontSize: '18px' }}>NEW SIGHTING</h2>
              </div>
            </header>

            <div className="pixel-screen" style={{ padding: '16px' }}>
              {isBlocked ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                  <img 
                    src="/assets/abei-sleep.png" 
                    alt="Abei Sleeping" 
                    className="pixel"
                    style={{ width: '150px' }} 
                  />
                  <div style={{ color: 'white', textAlign: 'center', fontFamily: 'inherit', fontSize: '14px', lineHeight: '1.5' }}>
                    <strong>Abei doesn't want to travel now, he goes to sleep.</strong><br/>
                    <span style={{ fontSize: '10px', opacity: 0.7, color: 'var(--ice-cyan)' }}>(Travel is restricted to Wednesdays, max 2 per day)</span>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--ice-cyan)' }}>Admin Passphrase:</label>
                    <input 
                      type="password" 
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      disabled={loading}
                      style={{ padding: '8px', background: 'transparent', border: '2px solid var(--ice-edge)', color: 'white', fontFamily: 'inherit' }}
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
                      style={{ padding: '8px', background: 'transparent', border: '2px solid var(--ice-edge)', color: 'white', fontFamily: 'inherit', resize: 'none' }}
                      required
                    />
                  </div>

                  {error && <div style={{ color: '#ff6b6b', fontSize: '12px', wordBreak: 'break-word' }}>{error}</div>}
                  {message && <div style={{ color: '#4dff4d', fontSize: '12px', wordBreak: 'break-word' }}>{message}</div>}

                  <button 
                    type="submit" 
                    className="pixel-btn"
                    disabled={loading}
                    style={{ 
                      marginTop: '10px',
                      opacity: loading ? 0.5 : 1,
                      cursor: loading ? 'wait' : 'pointer'
                    }}
                  >
                    {loading ? 'GENERATING...' : 'SUBMIT SIGHTING'}
                  </button>
                </form>
              )}
            </div>

            <footer className="pixel-window__footer">
              <button type="button" className="pixel-btn" onClick={onClose} disabled={loading}>
                CLOSE PANEL
              </button>
            </footer>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
