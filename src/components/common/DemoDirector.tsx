import React, { useState } from 'react';
import { PolarisAppState, AppScreen } from '../../types/state';
import { ScenarioId } from '../../types/scenario';
import { DEMO_STAGES } from '../../simulation/demoEngine';
import { polarisStore } from '../../store/polarisStore';

interface DemoDirectorProps {
  state: PolarisAppState;
  isOpen: boolean;
  onClose: () => void;
}

export const DemoDirector: React.FC<DemoDirectorProps> = ({ state, isOpen, onClose }) => {
  const [demoStepIndex, setDemoStepIndex] = useState(1);

  if (!isOpen) return null;

  const currentStep = DEMO_STAGES.find((s) => s.stepIndex === demoStepIndex) || DEMO_STAGES[0];

  const executeDemoStep = (stepIdx: number) => {
    const step = DEMO_STAGES.find((s) => s.stepIndex === stepIdx);
    if (!step) return;
    polarisStore.setScreen(step.targetScreen as AppScreen);
    polarisStore.applyScenario(step.targetScenarioId as ScenarioId);
    if (step.stageKey === 'HAZARD_SIMULATION') {
      setTimeout(() => polarisStore.runHazardSimulation(), 400);
    }
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(14,35,96,0.4)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 640,
        background: 'var(--surface-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--warning-bg)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warning)' }} />
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Demo Director</h2>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>SIH Presentation Runner</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)' }}>×</button>
        </div>

        {/* Current stage */}
        <div style={{ padding: 20 }}>
          <div style={{
            padding: 16, borderRadius: 'var(--r-lg)',
            background: 'var(--surface-alt)', border: '1px solid var(--border)', marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="badge badge-warning" style={{ fontSize: 10 }}>STAGE {currentStep.stepIndex} / {DEMO_STAGES.length}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{currentStep.targetScreen}</span>
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{currentStep.title}</h3>
            <p style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 600, marginBottom: 4 }}>→ {currentStep.suggestedAction}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>"{currentStep.narrativeNote}"</p>
          </div>

          {/* Stage grid */}
          <span className="section-label" style={{ display: 'block', marginBottom: 8 }}>JUMP TO STAGE</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
            {DEMO_STAGES.map(st => (
              <button key={st.stepIndex} onClick={() => { setDemoStepIndex(st.stepIndex); executeDemoStep(st.stepIndex); }}
                style={{
                  padding: '6px 4px', borderRadius: 'var(--r-sm)', border: '1px solid',
                  cursor: 'pointer', fontSize: 10, fontWeight: 600, textAlign: 'center',
                  background: st.stepIndex === demoStepIndex ? 'var(--warning-bg)' : 'var(--surface)',
                  color: st.stepIndex === demoStepIndex ? 'var(--warning)' : 'var(--text-muted)',
                  borderColor: st.stepIndex === demoStepIndex ? 'var(--warning-border)' : 'var(--border)',
                }}
              >{st.stepIndex}</button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <button onClick={() => { polarisStore.resetDemo(); setDemoStepIndex(1); onClose(); }}
            className="btn btn-ghost btn-sm" style={{ color: 'var(--critical)' }}>
            Reset Demo
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={demoStepIndex <= 1} onClick={() => setDemoStepIndex(p => Math.max(1, p - 1))} className="btn btn-secondary btn-sm">← Prev</button>
            <button onClick={() => executeDemoStep(demoStepIndex)} className="btn btn-primary btn-sm">
              Execute Stage {demoStepIndex} →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
