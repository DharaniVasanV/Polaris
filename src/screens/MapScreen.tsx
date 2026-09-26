import React from 'react';
import { PolarisAppState } from '../types/state';

export const MapScreen: React.FC<{ state: PolarisAppState }> = () => (
  <div className="flex-1 flex items-center justify-center p-8 bg-[#FAFBFF] text-[#0E2360] font-sans font-bold">
    <div className="flex flex-col items-center gap-4 text-center">
      <svg className="w-16 h-16 text-[#415BB1]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
      <h2 className="text-2xl">Fullscreen Antarctic Map Workspace</h2>
      <p className="text-sm font-normal text-[#5C74A8] max-w-md">Provides an uninterrupted, edge-to-edge view of the Southern Ocean with granular layer controls.</p>
    </div>
  </div>
);
