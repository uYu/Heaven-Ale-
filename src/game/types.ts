export type Resource = 0 | 1 | 2 | 3 | 4;
export type Tile =
  | { id: string; kind: 'resource'; color: Resource; value: number }
  | { id: string; kind: 'monk'; monk: number };
export type Privilege = 'color' | 'lowest' | 'barrel' | 'coins' | 'master';
export type Slot = 'number' | `r${number}` | `m${number}`;
export interface Cell {
  id: number;
  x: number;
  y: number;
  side: 'sun' | 'shade' | 'shed';
}
export interface Player {
  id: number;
  name: string;
  coins: number;
  resources: number[];
  master: number;
  garden: Record<number, Tile>;
  sheds: Record<number, number>;
  scored: Slot[];
  cards: Privilege[];
  privileges: Partial<Record<number, Privilege | 'skip'>>;
  barrels: { goal: number; points: number }[];
  position: number;
  home: number | null;
}
export type BuyPhase = { kind: 'buy'; space: number; bought: number };
export type Phase =
  | { kind: 'setup' }
  | { kind: 'move' }
  | BuyPhase
  | { kind: 'shed'; cell: number; tier: number; rest: number[]; resume: BuyPhase }
  | { kind: 'score'; space: number }
  | { kind: 'privilege'; pair: number }
  | { kind: 'home' }
  | { kind: 'finished' };
export interface MarketSpace {
  type: 'resource' | 'monk' | 'score' | 'barrel';
  cost?: number;
  scoring?: 'A' | 'B' | 'C' | 'ABC';
  tiles: Tile[];
  disc: boolean | number;
}
export interface LogEntry {
  id: number;
  round: number;
  player: number | null;
  text: string;
}
export interface GameSetup {
  playerCount: 2 | 3 | 4;
  randomStart: boolean;
  chooseStartingPositions?: boolean;
}
export interface GameState {
  setup?: GameSetup;
  turnOrder?: number[];
  startingSlots?: (number | null)[];
  version: 1;
  seed: number;
  round: number;
  turn: number;
  players: Player[];
  market: MarketSpace[];
  resourceDeck: Tile[];
  monkDeck: Tile[];
  barrelSupply: number[];
  phase: Phase;
  log: LogEntry[];
  actions: Action[];
  revision: number;
}
export type Action =
  | { type: 'start'; slot: number; color?: number }
  | { type: 'move'; space: number }
  | { type: 'buy'; tile: string; cell: number }
  | { type: 'endBuy' }
  | { type: 'shed'; cells: number[] }
  | { type: 'score'; slot: Slot; value?: number }
  | { type: 'privilege'; card: Privilege | 'skip'; color?: number }
  | { type: 'emergency'; card: Privilege }
  | { type: 'home'; slot: number; color?: number };
export interface Result {
  player: number;
  before: number[];
  afterExchange: number[];
  afterCoins: number[];
  rate: number;
  multiplier: number;
  exchanges: { from: number[]; to: number }[];
  coinsSpent: number;
  minimum: number;
  production: number;
  barrels: number;
  privilege: number;
  first: number;
  total: number;
}
