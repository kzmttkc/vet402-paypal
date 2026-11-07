/** npm run sellers — totals of the frozen export, and the top sellers' approval cards. */
import { aggregateSellers, loadFrozenExport, sellerCard, totalsOf } from "../src/sellers/index.js";

const { rows, meta } = loadFrozenExport();
const sellers = aggregateSellers(rows);
const t = totalsOf(rows, sellers);
console.log(
  `export ${meta.fetchedAt.slice(0, 10)} sha256=${meta.sha256.slice(0, 12)} rows=${t.rows} sellers=${t.sellers} settled=${t.settled} shape_match=${t.shapeMatch} shape_mismatch=${t.shapeMismatch} paid_4xx=${t.paid4xx} paid_5xx=${t.paid5xx}`,
);
const top = [...sellers.values()].sort((a, b) => b.settled - a.settled).slice(0, 5);
for (const s of top) console.log(`  ${sellerCard(s)}`);
