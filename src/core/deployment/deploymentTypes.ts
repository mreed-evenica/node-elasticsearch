export enum DeploymentStrategy {
  SAFE = 'safe',           // Manual swap required
  AUTO_SWAP = 'auto-swap', // Automatic swap after validation
  BLUE_ONLY = 'blue-only', // Always deploy to blue
  GREEN_ONLY = 'green-only' // Always deploy to green
}

export enum DeploymentStatus {
  IDLE = 'idle',
  DEPLOYING = 'deploying',
  READY_FOR_SWAP = 'ready-for-swap',
  SWAPPING = 'swapping',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLING_BACK = 'rolling-back'
}

export interface DeploymentState {
  alias: string;
  activeColor?: 'blue' | 'green';
  activeIndex?: string;
  stagingColor?: 'blue' | 'green';
  stagingIndex?: string;
  deploymentStatus: keyof typeof DeploymentStatus;
  lastDeployment: Date;
  strategy: DeploymentStrategy;
  error?: string;
}

export interface HealthCheckOptions {
  timeout?: number;
  expectedDocCount?: number;
  minimumDocCount?: number;
  checkInterval?: number;
}
