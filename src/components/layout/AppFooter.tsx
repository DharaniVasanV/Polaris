import React from 'react';

export const AppFooter: React.FC = () => {
  return (
    <footer className="w-full bg-[#EAF3FF] border-t border-[#D7E8FD] px-5 py-1.5 flex items-center justify-between text-[10px] text-[#5C74A8] select-none">
      <div className="flex items-center gap-2">
        <strong className="text-[#415BB1]">POLARIS</strong> &bull; Intelligent Antarctic Navigation Co-Pilot &bull; Prototype v2.4
      </div>
      <div>
        AI recommends; Captain / Ice Navigator makes the final operational decision.
      </div>
    </footer>
  );
};
