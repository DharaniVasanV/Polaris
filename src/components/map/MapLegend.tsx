import React, { useState } from 'react';

export const MapLegend: React.FC = () => {
  const [isOpen, setIsOpen] = useState<boolean>(true);

  return (
    <div style={{
      width: 260, background: 'var(--surface-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-md)', overflow: 'hidden',
    }}>
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%', padding: '10px 14px', background: 'var(--surface-alt)',
          border: 'none', borderBottom: isOpen ? '1px solid var(--border)' : 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-primary)' }}>
          NAVIGATION LEGEND
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Legend Contents */}
      {isOpen && (
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 11, color: 'var(--text-secondary)' }}>
          {/* Risk Levels */}
          <div>
            <div className="section-label" style={{ marginBottom: 6 }}>FUSED RISK MATRIX</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--success)' }} />
                <span>Safe</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--warning)' }} />
                <span>Moderate</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--high)' }} />
                <span>High</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--critical)' }} />
                <span>Critical</span>
              </div>
            </div>
          </div>

          {/* Routes */}
          <div style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <div className="section-label" style={{ marginBottom: 6 }}>ROUTES</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 18, height: 3, background: 'var(--route-primary)', borderRadius: 2 }} />
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Recommended Corridor</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 18, height: 2, background: 'var(--route-alt)', borderStyle: 'dashed' }} />
                <span>Alternative Route B</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 18, height: 2, background: 'var(--route-shortest)' }} />
                <span>Shortest (Rejected)</span>
              </div>
            </div>
          </div>

          {/* Symbols */}
          <div style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <div className="section-label" style={{ marginBottom: 6 }}>MARKERS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, background: '#3B8FC4', transform: 'rotate(45deg)' }} />
                <span>Iceberg (GRU Track)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(59, 143, 196, 0.2)', border: '1px stroke #3B8FC4' }} />
                <span>Selected Uncertainty</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '10px solid #0EA5E9' }} />
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Vessel Position</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
