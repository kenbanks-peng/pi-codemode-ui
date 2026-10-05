export interface OutputCard {
  title: string;
  value: unknown;
  mutationConfirmation?: string;
  decodePartialDiscovery?: boolean;
}

export interface ToolCall {
  name: string;
  target: string;
  args: string;
  status: string;
  duration?: number;
  error: string;
  cost?: number;
}
export interface RunModel {
  cards: OutputCard[];
  raw: string[];
  calls: ToolCall[];
  images: string[];
  failed: boolean;
  error: string;
  elapsed: string;
  path: string;
}
