const fs = require('fs');
const path = require('path');

const SNAPSHOTS_PATH = path.join(__dirname, '..', 'data', 'snapshots.json');
const OHLC_PATH = path.join(__dirname, '..', 'data', 'daily-ohlc.json');
const API_KEY = process.env.DBB_API_KEY;

async function main() {
  const headers = API_KEY ? { 'X-API-Key': API_KEY } : {};

  const [rateRes, fxRes] = await Promise.all([
    fetch('https://api.dolarbluebolivia.click/v1/officialRate', { headers }),
    fetch('https://api.frankfurter.app/latest?from=USD&to=EUR')
  ]);

  if (!rateRes.ok) throw new Error(`officialRate falló: ${rateRes.status}`);
  const rateJson = await rateRes.json();
  const d = rateJson.data;

  let usdToEur = null;
  if (fxRes.ok) {
    const fxJson = await fxRes.json();
    usdToEur = fxJson.rates?.EUR ?? null;
  }

  const snapshot = {
    ts: new Date().toISOString(),
    blue_buy: d.blue.buy,
    blue_sell: d.blue.sell,
    official_buy: d.official.buy,
    official_sell: d.official.sell,
    usd_eur: usdToEur
  };

  const snapshots = fs.existsSync(SNAPSHOTS_PATH)
    ? JSON.parse(fs.readFileSync(SNAPSHOTS_PATH, 'utf8'))
    : [];

  snapshots.push(snapshot);
  fs.writeFileSync(SNAPSHOTS_PATH, JSON.stringify(snapshots, null, 2));

  rebuildDailyOhlc(snapshots);
}

function rebuildDailyOhlc(snapshots) {
  const days = {};
  for (const s of snapshots) {
    const day = s.ts.slice(0, 10);
    if (!days[day]) days[day] = { usd: [], eur: [], official: [] };
    days[day].usd.push(s.blue_sell);
    days[day].official.push(s.official_sell);
    if (s.usd_eur) days[day].eur.push(s.blue_sell / s.usd_eur);
  }

  const ohlc = { usd: [], eur: [], official: [] };
  for (const day of Object.keys(days).sort()) {
    ohlc.usd.push(candle(day, days[day].usd));
    ohlc.official.push(candle(day, days[day].official));
    if (days[day].eur.length) ohlc.eur.push(candle(day, days[day].eur));
  }

  fs.writeFileSync(OHLC_PATH, JSON.stringify(ohlc, null, 2));
}

function candle(day, vals) {
  return {
    time: day,
    open: vals[0],
    high: Math.max(...vals),
    low: Math.min(...vals),
    close: vals[vals.length - 1]
  };
}

main().catch(err => { console.error(err); process.exit(1); });