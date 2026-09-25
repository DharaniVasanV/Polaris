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
    <div className="w-full h-full relative">
      {/* Full Rectangular Antarctic Operational Navigation Map Viewport */}
      <OpenLayersPolarMap state={state} width="100%" height="100%" />
    </div>
  );
};
