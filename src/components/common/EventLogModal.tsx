import React from 'react';
import { EventLogEntry } from '../../types/domain';

interface EventLogModalProps {
  eventLog: EventLogEntry[];
  isOpen: boolean;
  onClose: () => void;
}

export const EventLogModal: React.FC<EventLogModalProps> = ({ eventLog, isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-3xl bg-[#080E1A] border border-slate-700 rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        <div className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wider">POLARIS OPERATIONAL AUDIT LOG</h2>
              <p className="text-[11px] text-slate-400">Chronological Spatiotemporal Decision-Support Records</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl font-bold">&times;</button>
        </div>

        <div className="p-6 overflow-y-auto flex flex-col gap-2.5 flex-1">
          {eventLog.map((log) => (
            <div key={log.id} className="p-3 rounded-lg bg-slate-950/70 border border-slate-800/80 flex items-start gap-3 text-xs">
              <span className="font-mono text-[11px] text-slate-400 whitespace-nowrap pt-0.5">{log.simulationTimeFormatted}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${
                log.severity === 'CRITICAL' ? 'bg-rose-950 text-rose-400 border-rose-500/40' : log.severity === 'WARNING' ? 'bg-amber-950 text-amber-400 border-amber-500/40' : 'bg-cyan-950 text-cyan-400 border-cyan-500/40'
              }`}>{log.category}</span>
              <span className="text-slate-200 leading-relaxed flex-1">{log.message}</span>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Logged <strong className="text-white">{eventLog.length}</strong> events in session</span>
          <button onClick={onClose} className="btn-secondary !py-1 text-xs">Close Audit Log</button>
        </div>
      </div>
    </div>
  );
};
