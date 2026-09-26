import React from 'react';
import { EventLogEntry } from '../../types/domain';

interface EventLogModalProps {
  eventLog: EventLogEntry[];
  isOpen: boolean;
  onClose: () => void;
}

export const EventLogModal: React.FC<EventLogModalProps> = ({ eventLog, isOpen, onClose }) => {
  if (!isOpen) return null;

  const severityStyles: Record<string, { bg: string; color: string; border: string }> = {
    CRITICAL: { bg: 'var(--critical-bg)', color: 'var(--critical)', border: 'var(--critical-border)' },
    WARNING:  { bg: 'var(--warning-bg)',  color: 'var(--warning)',  border: 'var(--warning-border)' },
    INFO:     { bg: 'var(--info-bg)',     color: 'var(--info)',     border: 'var(--border)' },
    NORMAL:   { bg: 'var(--surface-alt)', color: 'var(--text-muted)', border: 'var(--border)' },
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(14,35,96,0.4)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 720, maxHeight: '80vh',
        background: 'var(--surface-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Operational Audit Log</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Chronological decision-support records</p>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 20, color: 'var(--text-muted)', lineHeight: 1,
          }}>×</button>
        </div>

        {/* Log entries */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {eventLog.map(log => {
            const s = severityStyles[log.severity] || severityStyles.NORMAL;
            return (
              <div key={log.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '10px 12px', borderRadius: 'var(--r-md)',
                background: 'var(--surface-alt)', border: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-faint)', whiteSpace: 'nowrap', paddingTop: 1 }}>{log.simulationTimeFormatted}</span>
                <span style={{
                  padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                  background: s.bg, color: s.color, border: `1px solid ${s.border}`,
                  whiteSpace: 'nowrap',
                }}>{log.category}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, flex: 1 }}>{log.message}</span>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{eventLog.length}</strong> events logged
          </span>
          <button onClick={onClose} className="btn btn-secondary btn-sm">Close</button>
        </div>
      </div>
    </div>
  );
};
