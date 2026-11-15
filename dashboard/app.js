/* Token Radar dashboard — renders window.RADAR (data.js) and nothing else. No fetch, no network.
 *
 * The model (radar-2), the same function that scored every row in lib/model.ts:
 *   implied = TVL x category multiple x growth x maturity x breadth
 * The multiple is the live market's own median market-cap-per-dollar-of-TVL for that category,
 * read out of this snapshot's protocols that already trade (fewer than five live protocols in a
 * category falls back to the whole market's median), clamped to [0.05, 0.75]. Growth is the
 * protocol's own seven-day TVL change, clamped to -60%..+120% and weighted by one half.
 * Maturity is how long it has run with no token (0.60 at day zero, 1.00 at three years;
 * a missing listed date is read as one year). Breadth adds 5% per extra chain, up to four.
 * The dashboard regenerates each row's farm plan from the same rules as the model, so the
 * plan you read here is the plan the board carries: capital scales with the protocol's TVL
 * ($50 under $100M, $100 under $1B, $150 under $5B, $250 above), the hold window scales
 * with its age (60 days under six months, 45 under a year, 30 beyond), and the first two
 * steps follow the protocol's own category on its first chain.
 *
 * A protocol is shown as recording no token when its snapshot record carries no market cap,
 * no CoinGecko id and no symbol — the record is not proof, and a listed protocol may still
 * hold a token its record does not carry. The Live token view lists protocols that already
 * trade, at the market's own values, and never ranks them against the board.
 */

'use strict';

/** The board data: window.RADAR, set by ../data.js. */
const RADAR = window.RADAR;

/** Capital tiers (USD) by a protocol's TVL — the same tiers as the model. */
const CAPITAL_TIERS = [[5e9, 250], [1e9, 150], [1e8, 100], [0, 50]];

/** How long to hold, by the protocol's age in days — the same rule as the model. */
function holdDaysFor(age) {
  if (age === null || age === undefined) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The capital one farm position needs, from the protocol's own TVL. */
function capitalFor(tvl) {
  for (const [floor, cap] of CAPITAL_TIERS) if (tvl >= floor) return cap;
  return 50;
}

/** A dollar figure with thousands separators, or a dash when it is missing. */
function money(v) {
  if (v === null || v === undefined) return '—';
  return '$' + Math.round(v).toLocaleString('en-US');
}

/** A compact dollar figure for the table: $2.75B, $1.58B, $514M, $8.4M. */
function shortMoney(v) {
  if (v === null || v === undefined) return '—';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2).replace(/0$/, '') + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(v >= 1e8 ? 0 : 1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(v);
}

/** A whole day count from a listed date to the snapshot's date. */
function ageDays(asOf, listedAt) {
  if (!listedAt) return null;
  const a = Date.parse(asOf + 'T00:00:00Z');
  const b = Date.parse(listedAt + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / 86400000));
}

/** A protocol's age as text: "543 days" or "—" when its record carries no date. */
function ageText(row) {
  const d = row.age_days === null || row.age_days === undefined ? ageDays(RADAR.as_of, row.listed_at) : row.age_days;
  return d === null ? '—' : d + 'd';
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(row, capital, chain) {
  const c = (row.category || '').toLowerCase();
  const name = row.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ', then borrow $20 of it back so the position shows both sides.';
  if (c.includes('dex') || c.includes('leveraged farm')) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and swap $10 through it once.';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge, then close it the same week.';
  if (c.includes('yield aggregator') || c.includes('curator') || c.includes('allocator') || c.includes('risk')) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares for the whole window.';
  if (c.includes('yield')) return 'Deposit $' + capital + " into " + name + "'s highest-yield vault on " + chain + ' and harvest the yield once a week.';
  if (c.includes('bridge') || c.includes('cross chain')) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
  if (c.includes('staking') || c.includes('restak')) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
  if (c.includes('prediction')) return 'Fund $' + capital + ' and place one market position on ' + name + ', then settle it.';
  if (c.includes('stable')) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.';
  if (c.includes('rwa')) return 'Mint $' + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it.';
  if (c.includes('insurance')) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy open.';
  if (c.includes('launchpad')) return 'Stake $' + capital + ' in ' + name + "'s launch pool on " + chain + ' and join one sale.';
  if (c.includes('payment')) return 'Send $' + capital + ' through ' + name + ' on ' + chain + ' and keep the receipt.';
  if (c.includes('nft')) return 'List or buy one item through ' + name + ' on ' + chain + ' and keep the position.';
  return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
}

/** The category's weekly qualifying action, distinct from the first deposit. */
function weeklyFor(row, chain) {
  const c = (row.category || '').toLowerCase();
  const name = row.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Adjust the position once a week: add or repay $5, or move it between ' + name + "'s markets on " + chain + '.';
  if (c.includes('dex') || c.includes('leveraged farm')) return 'Swap $5 through ' + name + ' once a week and rebalance the pool position if the range moved.';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) return 'Open and close one small hedge a week on ' + name + ' so the account shows steady trading volume.';
  if (c.includes('yield aggregator') || c.includes('curator') || c.includes('allocator') || c.includes('risk')) return 'Check the ' + name + ' vault allocation once a week and move $5 between its strategies.';
  if (c.includes('yield')) return 'Harvest the vault yield once a week and redeposit it into ' + name + ' on ' + chain + '.';
  if (c.includes('prediction')) return 'Place one small market position a week on ' + name + ' and let it settle.';
  if (c.includes('rwa')) return 'Top the position up by $5 a week and keep the yield asset in the same wallet.';
  return 'Make one qualifying action each week on ' + name + ': a deposit, a swap, a vote or a claim on ' + chain + '.';
}

/** A protocol's farm plan: six steps, each an action with a cost and a time. */
function farmSteps(row) {
  const chain = row.chains && row.chains.length > 0 ? row.chains[0] : 'its main chain';
  const capital = capitalFor(row.tvl_usd);
  const hold = holdDaysFor(row.age_days);
  const gas = capital >= 150 ? 8 : 4;
  return [
    { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: actionFor(row, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of gas on ' + chain, time: '15 minutes to set up' },
    { text: weeklyFor(row, chain), cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
    { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
  ];
}

/** A step as one string: its action, then its cost and time. */
function stepText(step) {
  return step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
}

const $ = (id) => document.getElementById(id);
const rowsEl = $('rows'), countEl = $('count'), detailEl = $('detail'), liveEl = $('live');

/** The watchlist slugs, carried on each row by data.js. */
function isWatch(slug) {
  return RADAR.rows.some((r) => r.slug === slug && r.watch === true);
}

/** Header stats: protocols in the snapshot, rows on the board, watchlist size, live count. */
function renderStats() {
  $('stats').innerHTML = [
    [RADAR.board_size, 'ranked rows'],
    [RADAR.watchlist_size, 'on the watchlist'],
    [RADAR.early_size, 'early finds'],
    [RADAR.live_size, 'already trading'],
  ].map(([n, label]) => '<div class="stat"><b>' + n + '</b><span>' + label + '</span></div>').join('');
  $('asof').textContent = 'Snapshot ' + RADAR.as_of + ' · floor $' + (RADAR.floor_usd / 1e6) + 'M TVL';
  $('src').textContent = RADAR.source + ', sealed ' + RADAR.as_of;
}

/** The calibration chips: the global median and the five strongest category multiples. */
function renderCalib() {
  const top = RADAR.multiples.slice(0, 5);
  $('calib').innerHTML =
    '<span class="chip">Global median <b>' + RADAR.global_median + '×</b> (n=' + RADAR.global_live_count + ' live)</span>' +
    top.map((m) => '<span class="chip">' + m.category + ' <b>' + m.median + '×</b> (n=' + m.live_count + ')</span>').join('') +
    '<span class="chip">Multiple clamped to 0.05–0.75</span>';
}

/** Category and chain options for the filters. */
function renderFilters() {
  const cats = [...new Set(RADAR.rows.map((r) => r.category).filter(Boolean))].sort();
  $('cat').innerHTML = '<option value="">All categories</option>' + cats.map((c) => '<option>' + c + '</option>').join('');
  const chains = [...new Set(RADAR.rows.flatMap((r) => r.chains))].sort();
  $('chain').innerHTML = '<option value="">All chains</option>' + chains.map((c) => '<option>' + c + '</option>').join('');
}

/** The board rows that match the current controls. */
function filteredRows() {
  const q = $('q').value.trim().toLowerCase();
  const cat = $('cat').value, chain = $('chain').value, sort = $('sort').value, watch = $('watch').checked;
  let rows = RADAR.rows.filter((r) => {
    if (watch && !isWatch(r.slug)) return false;
    if (cat && r.category !== cat) return false;
    if (chain && !r.chains.includes(chain)) return false;
    if (q && !(r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q))) return false;
    return true;
  });
  const by = {
    value: (a, b) => b.implied_value_usd - a.implied_value_usd,
    tvl: (a, b) => b.tvl_usd - a.tvl_usd,
    growth: (a, b) => (b.change_7d ?? -1e9) - (a.change_7d ?? -1e9),
    age: (a, b) => (b.age_days ?? -1) - (a.age_days ?? -1),
  }[sort];
  return rows.sort(by);
}

/** One board row's HTML. */
function rowHtml(r) {
  const g = r.change_7d === null || r.change_7d === undefined ? '—' : (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(2) + '%';
  const gClass = r.change_7d === null || r.change_7d === undefined ? '' : (r.change_7d >= 0 ? 'up' : 'down');
  return '<tr data-slug="' + r.slug + '"><td class="rank">' + r.rank + '</td>' +
    '<td><span class="name">' + r.name + '</span>' + (isWatch(r.slug) ? '<span class="badge">WATCHLIST</span>' : '') + '<br><span class="slug">' + r.slug + '</span></td>' +
    '<td class="cat">' + (r.category || '—') + '</td>' +
    '<td class="cat">' + (r.chains.length > 0 ? r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') : '—') + '</td>' +
    '<td class="num">' + shortMoney(r.tvl_usd) + '</td>' +
    '<td class="num ' + gClass + '">' + g + '</td>' +
    '<td class="num">' + ageText(r) + '</td>' +
    '<td class="num val">' + shortMoney(r.implied_value_usd) + '</td></tr>';
}

function renderBoard() {
  const rows = filteredRows();
  rowsEl.innerHTML = rows.map(rowHtml).join('');
  countEl.textContent = rows.length + ' of ' + RADAR.rows.length + ' rows';
  $('empty').classList.toggle('hidden', rows.length > 0);
}

/** The live-token view: protocols that already trade, at the market's own values. */
function renderLive() {
  liveEl.innerHTML = '<h2>Already trading — not ranked</h2>' +
    '<p>These protocols have a token that trades. They are shown at the market\u2019s own values, never mixed into the launch ranking, so the board stays a list of launches that have not happened yet.</p>' +
    '<table><thead><tr><th>Protocol</th><th>Category</th><th style="text-align:right">TVL</th><th style="text-align:right">Market cap</th><th style="text-align:right">7d</th></tr></thead><tbody>' +
    RADAR.live.map((p) => {
      const g = p.change_7d === null || p.change_7d === undefined ? '—' : (p.change_7d >= 0 ? '+' : '') + p.change_7d.toFixed(2) + '%';
      const gc = p.change_7d === null || p.change_7d === undefined ? '' : (p.change_7d >= 0 ? 'up' : 'down');
      return '<tr><td><span class="name">' + p.name + '</span><br><span class="slug">' + p.slug + '</span></td>' +
        '<td class="cat">' + (p.category || '—') + '</td><td class="num">' + shortMoney(p.tvl_usd) + '</td>' +
        '<td class="num">' + money(p.mcap_usd) + '</td><td class="num ' + gc + '">' + g + '</td></tr>';
    }).join('') + '</tbody></table>';
}

/** The detail view: one protocol, its model breakdown, and its farm plan. */
function renderDetail(slug) {
  const r = RADAR.rows.find((x) => x.slug === slug);
  if (!r) { detailEl.classList.add('hidden'); return; }
  const age = r.age_days === null || r.age_days === undefined ? ageDays(RADAR.as_of, r.listed_at) : r.age_days;
  const steps = farmSteps(r);
  detailEl.innerHTML =
    '<h2>' + r.name + ' <span class="slug">' + r.slug + '</span></h2>' +
    '<p class="sub">Rank #' + r.rank + ' · ' + (r.category || 'Uncategorised') + ' · ' + (r.chains.length > 0 ? r.chains.join(', ') : 'no chain listed') +
    ' · listed ' + (r.listed_at || 'date unknown') + ' (' + (age === null ? 'age unknown' : age + ' days') + ')' +
    (isWatch(r.slug) ? ' · <span class="badge">WATCHLIST</span>' : '') + '</p>' +
    '<h3>Why it is worth ' + money(r.implied_value_usd) + '</h3>' +
    '<table class="break"><tbody>' +
    '<tr><td>TVL</td><td>' + money(r.tvl_usd) + '</td></tr>' +
    '<tr><td>Category multiple</td><td>' + r.multiple + '× — ' + r.multiple_source + '</td></tr>' +
    '<tr><td>Base value (TVL × multiple)</td><td>' + money(r.base_value_usd) + '</td></tr>' +
    '<tr><td>Growth multiplier (' + (r.change_7d === null || r.change_7d === undefined ? 'no 7-day change recorded' : (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(2) + '% in 7 days') + ')</td><td>×' + r.growth_multiplier + '</td></tr>' +
    '<tr><td>Maturity multiplier (' + (age === null ? 'age unknown, read as one year' : age + ' days with no token') + ')</td><td>×' + r.maturity_multiplier + '</td></tr>' +
    '<tr><td>Breadth multiplier (' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ')</td><td>×' + r.breadth_multiplier + '</td></tr>' +
    '<tr class="total"><td>Implied launch value</td><td>' + money(r.implied_value_usd) + '</td></tr>' +
    '</tbody></table>' +
    '<h3>Farm plan — about $' + r.farm_cost_usd + ' to set up, ' + r.farm_days + ' days to hold</h3>' +
    '<ol class="steps">' + steps.map((s) => '<li>' + s.text + '<span class="meta"><b>Cost:</b> ' + s.cost + ' &nbsp;·&nbsp; <b>Time:</b> ' + s.time + '</span></li>').join('') + '</ol>' +
    '<p class="note">This plan is a guide, not a promise: airdrops are never guaranteed, and a claim link is only ever the one the protocol itself publishes.</p>';
  detailEl.classList.remove('hidden');
  document.querySelectorAll('#rows tr').forEach((tr) => tr.classList.toggle('sel', tr.dataset.slug === slug));
}

/** Hash routes: #detail=<slug>, #filter=category:<name>, #watchlist, #live. */
function applyHash() {
  const h = location.hash.slice(1);
  if (h.startsWith('detail=')) {
    renderDetail(decodeURIComponent(h.slice(7)));
    // Scroll after load: the browser's own anchor handling on load can reset an earlier scroll.
    const go = () => detailEl.scrollIntoView({ behavior: 'auto', block: 'start' });
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go);
    return;
  }
  if (h.startsWith('filter=category:')) { $('cat').value = decodeURIComponent(h.slice(16)); renderBoard(); return; }
  if (h === 'watchlist') { $('watch').checked = true; renderBoard(); return; }
  if (h === 'live') { liveEl.classList.remove('hidden'); $('liveBtn').textContent = 'Already trading ▴'; return; }
}

rowsEl.addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-slug]');
  if (!tr) return;
  location.hash = 'detail=' + encodeURIComponent(tr.dataset.slug);
});
$('liveBtn').addEventListener('click', () => {
  const open = liveEl.classList.toggle('hidden');
  $('liveBtn').textContent = open ? 'Already trading ▾' : 'Already trading ▴';
});
['q', 'cat', 'chain', 'sort', 'watch'].forEach((id) => $(id).addEventListener('input', renderBoard));
window.addEventListener('hashchange', applyHash);

renderStats();
renderCalib();
renderFilters();
renderLive();
renderBoard();
applyHash();
