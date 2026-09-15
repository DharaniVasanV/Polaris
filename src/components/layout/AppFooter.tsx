import React from 'react';

export const AppFooter: React.FC = () => {
  return (
    <footer className="w-full bg-[#050912] border-t border-slate-900 px-5 py-1.5 flex items-center justify-between text-[10px] text-slate-500 select-none">
      <div className="flex items-center gap-2">
        <strong className="text-slate-400">POLARIS</strong> &bull; Intelligent Antarctic Navigation Co-Pilot &bull; Prototype v2.4
      </div>
      <div>
        AI recommends; Captain / Ice Navigator makes the final operational decision.
      </div>
    </footer>
  );
};
