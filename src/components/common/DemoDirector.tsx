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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-2xl bg-[#09111E] border border-amber-500/40 rounded-xl shadow-[0_0_30px_rgba(245,158,11,0.2)] overflow-hidden flex flex-col">
        <div className="px-5 py-3.5 bg-gradient-to-r from-amber-950/80 to-slate-900 border-b border-amber-500/30 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse"></span>
            <h2 className="text-sm font-extrabold text-amber-200 tracking-wider">POLARIS DEMO DIRECTOR — SIH PRESENTATION RUNNER</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg font-bold">&times;</button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">STAGE {currentStep.stepIndex} OF {DEMO_STAGES.length}</span>
              <span className="text-xs text-slate-400 font-mono">Target: {currentStep.targetScreen}</span>
            </div>
            <h3 className="text-base font-bold text-white">{currentStep.title}</h3>
            <p className="text-xs text-amber-300/90 font-medium">💡 Action: {currentStep.suggestedAction}</p>
            <p className="text-xs text-slate-400 italic">🎤 Narrative: "{currentStep.narrativeNote}"</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Jump to SIH Demo Stage</span>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 max-h-48 overflow-y-auto pr-1">
              {DEMO_STAGES.map((st) => (
                <button
                  key={st.stepIndex}
                  onClick={() => {
                    setDemoStepIndex(st.stepIndex);
                    executeDemoStep(st.stepIndex);
                  }}
                  className={`p-2 text-left text-[11px] rounded border transition-all truncate ${
                    st.stepIndex === demoStepIndex
                      ? 'bg-amber-950/80 text-amber-300 border-amber-500/60 font-bold'
                      : 'bg-slate-900/80 text-slate-300 border-slate-800 hover:border-slate-700 font-normal'
                  }`}
                >
                  {st.stepIndex}. {st.stageKey}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={() => {
              polarisStore.resetDemo();
              setDemoStepIndex(1);
              onClose();
            }}
            className="btn-secondary !py-1.5 text-xs text-rose-400 hover:text-rose-300 border-rose-900/50"
          >
            Reset Demo to Baseline
          </button>
          <div className="flex items-center gap-2">
            <button
              disabled={demoStepIndex <= 1}
              onClick={() => setDemoStepIndex((prev) => Math.max(1, prev - 1))}
              className={`btn-secondary !py-1.5 text-xs ${demoStepIndex <= 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              &larr; Previous
            </button>
            <button
              onClick={() => executeDemoStep(demoStepIndex)}
              className="btn-primary !py-1.5 text-xs bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold"
            >
              Execute Stage {demoStepIndex} &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
