import React from 'react';
import { PolarisAppState } from '../types/state';
import { VoyagePlannerScreen } from './VoyagePlannerScreen';

interface Props { state: PolarisAppState; }

export const MissionPlannerScreen: React.FC<Props> = ({ state }) => {
  return <VoyagePlannerScreen state={state} />;
};
