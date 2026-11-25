// Token Launch Radar model — written for token-radar-01.
//
// Idea: do not guess a token price from a protocol's name. Learn what the
// market already pays for a launched token, per unit of TVL, from the
// snapshot itself, then apply that yardstick to protocols that record
// no token yet.
//
//   1. For every protocol in the snapshot whose token already trades
//      (mcap_usd present), compute ratio = mcap_usd / tvl_usd.
//   2. Group those ratios by category and take the median per category.
//      A category with fewer than MIN_SAMPLES launched peers falls back
//      to the global median of all launched protocols.
//   3. For a pre-token protocol:
//        implied = TVL x category_multiple
//                      x growth_factor   (7-day TVL change, clamped)
//                      x age_factor      (days running with no token)
//                      x breadth_factor  (how many chains it runs on)
//      growth_factor  = 1 + clamp(change_7d, -50, 100) / 100 x 0.35
//      age_factor     = 0.78 + min(age_days, 1095) / 1095 x 0.44,
//                       x 0.82 when younger than 30 days,
//                       0.92 when the listing date is unknown
//      breadth_factor = 1 + min(chains - 1, 7) x 0.03
//   4. The board is every watchlist protocol plus the highest-implied
//      pre-token protocols outside it, up to TARGET_ROWS rows. Protocols
//      whose token already trades are counted and set aside, never ranked.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface Breakdown {
  multiple: number;
  multiple_source: string;
  growth_factor: number;
  age_factor: number;
  breadth_factor: number;
  age_days: number | null;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  model: Breakdown;
  farm_steps: string[];
}

export interface RadarRow extends BoardRow {}

export interface RadarData {
  as_of: string;
  floor_usd: number;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  pretoken_size: number;
  global_multiple: number;
  rows: RadarRow[];
}

export const MODEL_VERSION = 'launch-radar-2';
export const TARGET_ROWS = 288;
export const MIN_SAMPLES = 3;
const DAY_MS = 86_400_000;

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot is missing protocols or watchlist');
  }
  return raw;
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Category mcap/TVL medians learned from the snapshot's launched protocols. */
export function learnMultiples(snapshot: Snapshot): { byCategory: Map<string, number>; global: number } {
  const groups = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const key = p.category ?? '(none)';
    const list = groups.get(key) ?? [];
    list.push(ratio);
    groups.set(key, list);
  }
  const global = all.length > 0 ? median(all) : 0.2;
  const byCategory = new Map<string, number>();
  for (const [key, list] of groups) {
    if (list.length >= MIN_SAMPLES) byCategory.set(key, median(list));
  }
  return { byCategory, global };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export function scoreProtocol(
  p: SnapshotProtocol,
  asOf: string,
  multiples: { byCategory: Map<string, number>; global: number },
): { implied: number; breakdown: Breakdown } {
  const key = p.category ?? '(none)';
  const fromCategory = multiples.byCategory.get(key);
  const multiple = fromCategory ?? multiples.global;
  const source = fromCategory !== undefined ? `category median (${key})` : 'global median (thin category)';

  const rawGrowth = typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : 0;
  const growth = Math.min(100, Math.max(-50, rawGrowth));
  const growthFactor = 1 + (growth / 100) * 0.35;

  const age = ageDays(asOf, p.listed_at);
  let ageFactor: number;
  if (age === null) ageFactor = 0.92;
  else if (age < 30) ageFactor = (0.78 + (age / 1095) * 0.44) * 0.82;
  else ageFactor = 0.78 + (Math.min(age, 1095) / 1095) * 0.44;

  const breadthFactor = 1 + Math.min(Math.max(p.chains.length - 1, 0), 7) * 0.03;

  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growthFactor * ageFactor * breadthFactor));
  return {
    implied,
    breakdown: {
      multiple: round4(multiple),
      multiple_source: source,
      growth_factor: round4(growthFactor),
      age_factor: round4(ageFactor),
      breadth_factor: round4(breadthFactor),
      age_days: age,
    },
  };
}

// ---- farm plans -----------------------------------------------------------

const L2_CHAINS = new Set(['Arbitrum', 'Base', 'Optimism', 'zkSync Era', 'Linea', 'Scroll', 'Mantle', 'Blast', 'Mode', 'Taiko', 'Polygon', 'Polygon zkEVM']);

/** A plain-language gas estimate for the protocol's first chain. */
export function gasFor(chain: string): string {
  if (chain === 'Ethereum') return 'about $5-$25 in ETH gas per transaction at normal congestion';
  if (chain === 'Solana') return 'about $0.05 in SOL fees per transaction';
  if (chain === 'BSC') return 'about $0.20 in BNB fees per transaction';
  if (L2_CHAINS.has(chain)) return 'about $0.10-$1 in gas per transaction on this layer-2';
  return 'about $0.50-$2 in gas per transaction on this chain';
}

function capitalFor(tvl: number): number {
  if (tvl >= 5_000_000_000) return 500;
  if (tvl >= 1_000_000_000) return 250;
  if (tvl >= 250_000_000) return 150;
  if (tvl >= 50_000_000) return 100;
  return 50;
}

function weeksFor(age: number | null): number {
  if (age === null) return 10;
  if (age < 180) return 12;
  if (age < 540) return 10;
  return 8;
}

/** The category playbook: the concrete first action for this kind of protocol. */
function openingAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('dex') || c.includes('liquidity')) return `Add $${capital} of liquidity to the busiest USDC pair on ${n} (${chain}) and keep the LP position open instead of hopping pools.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('un collateral') || c.includes('uncollateral')) return `Supply $${capital} of USDC as collateral on ${n} (${chain}), then borrow no more than 40% against it so the health factor stays safely above 1.5.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC from Ethereum to ${chain} through ${n}, then use the bridged funds in one app on the far side the same day.`;
  if (c.includes('staking') || c.includes('restaking') || c.includes('restaked')) return `Stake $${capital} of ETH or its liquid staking token through ${n} on ${chain} and hold the receipt token in the same wallet for the full season.`;
  if (c.includes('deriv') || c.includes('option') || c.includes('prediction')) return `Open one small hedged position of about $${capital} notional on ${n} (${chain}) each week, sized so a full loss costs under $10.`;
  if (c.includes('yield') || c.includes('farm') || c.includes('allocator') || c.includes('curator')) return `Deposit $${capital} of USDC into the main ${n} vault on ${chain} and leave it compounding instead of rotating between vaults weekly.`;
  if (c.includes('rwa') || c.includes('stablecoin') || c.includes('basis') || c.includes('btc')) return `Buy or mint $${capital} of the flagship asset on ${n} (${chain}) and hold it in your own wallet rather than on an exchange.`;
  if (c.includes('cex') || c.includes('cedefi') || c.includes('card') || c.includes('payment')) return `Complete KYC on ${n}, deposit $${capital}, and make two or three genuine spot trades a week on ${chain === 'its main chain' ? 'its exchange' : chain} instead of wash volume.`;
  if (c.includes('chain')) return `Deploy or use one live contract interaction a week on ${n}: bridge $${capital} in, swap, lend and withdraw so the wallet shows real usage of the chain.`;
  return `Use the core product of ${n} on ${chain} with about $${capital} at stake: one real deposit, trade or stake that you keep open for the whole farming window.`;
}

export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const chainList = p.chains.length > 1 ? p.chains.slice(0, 3).join(', ') : chain;
  const capital = capitalFor(p.tvl_usd);
  const weeks = weeksFor(age);
  const gas = gasFor(chain);
  const steps = [
    `Set up one dedicated wallet for ${p.name} and fund it with $${capital + 50} on ${chain}: $${capital} to farm with and $50 spare for fees, costing ${gas}. Time: 20 minutes once.`,
    openingAction(p, capital, chain),
    `Repeat one genuine action on ${p.name} every week for ${weeks} weeks (a swap, a supply top-up or a claim-and-restake on ${chainList}), about 15 minutes a week, costing ${gas} each time.`,
    `Keep a simple log of every transaction hash, date and fee for ${p.name}; raise activity to twice a week in the final 2 weeks before any announced snapshot, still never exceeding $${capital * 2} total at risk.`,
    `Review the position every Sunday for 10 minutes: exit if ${p.name} is exploited, if TVL falls more than 40% in a week, or if fees for a week pass $15 with no points or rewards program live.`,
  ];
  return steps.map((s) => (s.length > 600 ? `${s.slice(0, 596)}...` : s));
}

// ---- board ----------------------------------------------------------------

const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/**
 * For rows beyond the watchlist, apply the same wrapped/staked/exchange
 * exclusions the watchlist rule uses: a wrapped or staked product of a
 * token that already trades is not a launch candidate, however large
 * its TVL is, and ranking one would poison the board's top rows.
 */
export function isLaunchCandidate(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED_NAME.test(p.name)) return false;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x))) return false;
  return true;
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const multiples = learnMultiples(snapshot);
  const watch = new Set(snapshot.watchlist);
  const preToken = snapshot.protocols.filter(isPreToken);
  const liveSize = snapshot.protocols.length - preToken.length;

  const scored = preToken.filter((p) => watch.has(p.slug) || isLaunchCandidate(p)).map((p) => {
    const { implied, breakdown } = scoreProtocol(p, snapshot.as_of, multiples);
    return { p, implied, breakdown };
  });
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));

  const chosen = new Map<string, (typeof scored)[number]>();
  for (const s of scored.slice(0, TARGET_ROWS)) chosen.set(s.p.slug, s);
  for (const s of scored) if (watch.has(s.p.slug)) chosen.set(s.p.slug, s);

  const finalList = [...chosen.values()].sort(
    (a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1),
  );
  const board: BoardRow[] = finalList.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.breakdown.age_days,
    watchlist: watch.has(s.p.slug),
    implied_value_usd: s.implied,
    model: s.breakdown,
    farm_steps: farmSteps(s.p, s.breakdown.age_days),
  }));

  const radar: RadarData = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !r.watchlist).length,
    live_size: liveSize,
    pretoken_size: preToken.length,
    global_multiple: round4(multiples.global),
    rows: board,
  };
  return { board, radar };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board has ${board.length} rows`;
  const slugs = new Set(board.map((r) => r.slug));
  for (const slug of snapshot.watchlist) if (!slugs.has(slug)) return `watchlist slug missing: ${slug}`;
  for (let i = 0; i < board.length; i++) {
    const r = board[i]!;
    if (r.rank !== i + 1) return `rank gap at ${r.slug}`;
    if (i > 0 && board[i - 1]!.implied_value_usd < r.implied_value_usd) return `values rise at rank ${r.rank}`;
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `bad implied value at ${r.slug}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `farm step count at ${r.slug}`;
    for (const step of r.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `farm step length ${len} at ${r.slug}`;
    }
  }
  if (new Set(board.map((r) => r.implied_value_usd)).size < 2) return 'all implied values equal';
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR_DATA = ${JSON.stringify(radar)};\n`;
}
