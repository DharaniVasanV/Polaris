import React from 'react';
import { PolarisAppState } from '../../types/state';
import { LeafletMap } from './LeafletMap';

interface PolarMapProps {
  state: PolarisAppState;
  width?: number | string;
  height?: number | string;
}

export const PolarMap: React.FC<PolarMapProps> = ({ state, width = '100%', height = '100%' }) => {
  return (
    <div className="w-full h-full relative overflow-hidden bg-[#060B14]">
      <LeafletMap state={state} width={width} height={height} />
    </div>
  );
};
