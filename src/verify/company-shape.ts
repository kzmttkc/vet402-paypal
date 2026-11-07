import { cosine, activeEmbedder, type Embedder } from "./score.js";

/**
 * Company-name exemplars. The generator names are the ones the demo sells.
 * The other twenty are real companies, in the English form used on their own sites.
 * The calibration lists were not used to choose these names.
 */
export const COMPANY_EXEMPLARS = [
  "Kizuna Logistics",
  "Northwind Foods",
  "Hanami Robotics",
  "Blue Ridge Energy",
  "Sakura Bio",
  "Atlas Freight",
  "Mizu Water Co.",
  "Orion Analytics",
  "Pine & Oak Ltd.",
  "Kaito Motors",
  "Lumen Health",
  "Tora Steel",
  "Apple",
  "Amazon",
  "Alphabet",
  "Meta Platforms",
  "Intel Corporation",
  "IBM",
  "Volkswagen",
  "Pfizer",
  "Novartis",
  "Shell",
  "Walmart",
  "Visa",
  "Boeing",
  "BASF",
  "LVMH",
  "Target",
  "Delta Air Lines",
  "Bayer",
  "Roche",
  "Danone",
] as const;

/**
 * Real companies used only to see whether a threshold exists.
 * Not exemplars, and not the held-out sixty.
 */
export const CALIBRATION_COMPANIES = [
  "Microsoft Corporation",
  "Berkshire Hathaway",
  "Johnson & Johnson",
  "Procter & Gamble",
  "The Coca-Cola Company",
  "PepsiCo",
  "Costco Wholesale",
  "The Home Depot",
  "McDonald's",
  "Starbucks",
  "General Motors",
  "Ford Motor Company",
  "Exxon Mobil",
  "Chevron Corporation",
  "JPMorgan Chase",
  "Bank of America",
  "Wells Fargo",
  "Morgan Stanley",
  "Goldman Sachs",
  "American Express",
  "BlackRock",
  "Tesla",
  "NVIDIA",
  "Advanced Micro Devices",
  "Cisco Systems",
  "Dell Technologies",
  "Accenture",
  "Deloitte",
  "Nike",
  "Adidas",
  "Netflix",
  "Oracle",
  "SAP",
  "Spotify",
  "Uber",
  "Qualcomm",
  "Broadcom",
  "Rakuten Group",
  "Fast Retailing",
  "Seven & i Holdings",
] as const;

/**
 * Noun phrases that are not companies, written for the same check.
 * Not exemplars, not OFF_TOPIC_NAMES, and not the held-out sixty.
 */
export const CALIBRATION_OTHERS = [
  "Porcelain Mug",
  "Leather Belt",
  "Winter Coat",
  "Bicycle Pump",
  "Coffee Grinder",
  "Wooden Spoon",
  "Bath Towel",
  "Ceiling Fan",
  "Pocket Knife",
  "Garden Shovel",
  "Ice Cube",
  "Orange Juice",
  "Fried Rice",
  "Grilled Cheese",
  "Morning Dew",
  "Evening Breeze",
  "Storm Warning",
  "Pollen Count",
  "Flash Flood",
  "Sunny Spell",
  "Plastic Bucket",
  "Rubber Glove",
  "Brass Key",
  "Iron Nail",
  "Silk Ribbon",
  "Linen Sheet",
  "Marble Counter",
  "Granite Tile",
  "Velvet Cushion",
  "Canvas Tote",
] as const;

/**
 * Highest nearest-exemplar cosine among CALIBRATION_OTHERS.
 * all-MiniLM-L6-v2, mean pooling, normalized, measured 2026-11-07.
 * The nearest calibration phrase that is not a company was "Iron Nail".
 * A name is company-like only when it is strictly above this.
 * 24 of the 40 calibration companies were above it. The line was not moved to catch the other 16.
 */
export const COMPANY_SHAPE_MIN = 0.4285879420786259;

export type CompanyShape = (name: string) => Promise<boolean>;

let shapeOverride: CompanyShape | null = null;
const exemplarCache = new WeakMap<Embedder, Promise<ArrayLike<number>[]>>();

/** Tests install a fake here so the suite never downloads a model. */
export function useCompanyShape(shape: CompanyShape | null): void {
  shapeOverride = shape;
}

export function activeCompanyShape(): CompanyShape {
  return shapeOverride ?? embeddingCompanyShape;
}

async function cachedExemplars(embed: Embedder): Promise<ArrayLike<number>[]> {
  let pending = exemplarCache.get(embed);
  if (!pending) {
    pending = Promise.all(COMPANY_EXEMPLARS.map((name) => embed(name))).catch((err: unknown) => {
      exemplarCache.delete(embed);
      throw err;
    });
    exemplarCache.set(embed, pending);
  }
  return pending;
}

/** True when the name is nearer an exemplar than every calibration phrase that is not a company. */
export async function embeddingCompanyShape(name: string, embed: Embedder = activeEmbedder()): Promise<boolean> {
  const exemplars = await cachedExemplars(embed);
  const vector = await embed(name);
  let best = 0;
  for (const exemplar of exemplars) best = Math.max(best, cosine(vector, exemplar));
  return best > COMPANY_SHAPE_MIN;
}
