import React from 'react';
import { PolarisAppState } from '../../types/state';
import { OpenLayersPolarMap } from './OpenLayersPolarMap';

interface PolarMapProps {
  state: PolarisAppState;
  width?: number | string;
  height?: number | string;
}

export const PolarMap: React.FC<PolarMapProps> = ({ state, width = '100%', height = '100%' }) => {
  return (
    <div className="w-full h-full relative flex items-center justify-center bg-slate-100 p-4">
      {/* WGS 84 / Antarctic Polar Stereographic EPSG:3031 Circular Chart Viewport */}
      <div className="relative w-[85vh] h-[85vh] max-w-[92vw] max-h-[92vw] rounded-full border-4 border-slate-700/80 shadow-[0_0_50px_rgba(0,0,0,0.25)] overflow-hidden bg-[#060B14] flex items-center justify-center">
        <OpenLayersPolarMap state={state} width="100%" height="100%" />
      </div>
    </div>
  );
};
