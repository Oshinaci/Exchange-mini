// ======= UTIL =======
const $ = (sel) => document.querySelector(sel);
const fmtPrice = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty   = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 6 });
const toTime   = (ms) => {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  const ss = String(d.getSeconds()).padStart(2,'0');
  return `${hh}:${mm}:${ss}`;
};

// ======= CHART SETUP =======
const chartEl = $('#chart');
const chart = LightweightCharts.createChart(chartEl, {
  layout: { background: { color: '#171a24' }, textColor: '#e6e8ef' },
  grid: { vertLines: { color: '#262b3a' }, horzLines: { color: '#262b3a' } },
  rightPriceScale: { borderVisible: false },
  timeScale: { borderVisible: false },
  crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
});

const candleSeries = chart.addCandlestickSeries({
  upColor: '#4bffb5',
  downColor: '#ff4976',
  borderDownColor: '#ff4976',
  borderUpColor: '#4bffb5',
  wickDownColor: '#838ca1',
  wickUpColor: '#838ca1',
});

const volumeSeries = chart.addHistogramSeries({
  priceFormat: { type: 'volume' },
  priceScaleId: '',
  scaleMargins: { top: 0.85, bottom: 0 },
});
const ma9  = chart.addLineSeries({ color: 'red', lineWidth: 2 });
const ma21 = chart.addLineSeries({ color: 'lime', lineWidth: 2 });

// Responsive resize
const resize = () => {
  const rect = chartEl.getBoundingClientRect();
  chart.applyOptions({ width: rect.width, height: Math.max(380, rect.height) });
};
new ResizeObserver(resize).observe(chartEl);
window.addEventListener('load', resize);

// ======= DATA FETCHERS (Binance Public API) =======
const BASE = 'https://api.binance.com';

async function getKlines() {
  const url = `${BASE}/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=200`;
  const res = await fetch(url);
  const data = await res.json();
  const candles = data.map(d => ({
    time: d[0] / 1000,
    open: +d[1],
    high: +d[2],
    low:  +d[3],
    close:+d[4],
  }));
  const volumes = data.map(d => ({
    time: d[0] / 1000,
    value: +d[5],
    color: (+d[4] >= +d[1]) ? '#4bffb5' : '#ff4976'
  }));
  return { candles, volumes };
}

function calcMA(candles, period){
  const out = [];
  let sum = 0;
  for (let i=0;i<candles.length;i++){
    sum += candles[i].close;
    if (i >= period) sum -= candles[i-period].close;
    if (i >= period-1) out.push({ time: candles[i].time, value: sum/period });
  }
  return out;
}

async function getTicker24h() {
  const res = await fetch(`${BASE}/api/v3/ticker/24hr?symbol=BTCUSDT`);
  return res.json();
}

async function getDepth(limit=20){
  const res = await fetch(`${BASE}/api/v3/depth?symbol=BTCUSDT&limit=${limit}`);
  return res.json();
}

async function getTrades(limit=30){
  const res = await fetch(`${BASE}/api/v3/trades?symbol=BTCUSDT&limit=${limit}`);
  return res.json();
}

// ======= RENDERERS =======
function renderPriceBox(ticker){
  const priceEl = $('#price');
  const changeEl = $('#change');

  const price = Number(ticker.lastPrice);
  const pct = Number(ticker.priceChangePercent);

  priceEl.textContent = `${fmtPrice(price)} USD`;
  changeEl.textContent = `${pct.toFixed(2)}%`;

  const up = pct >= 0;
  priceEl.style.color  = up ? '#4bffb5' : '#ff4976';
  changeEl.style.color = up ? '#4bffb5' : '#ff4976';
}

function renderOrderBook(depth){
  const bidsEl = $('#bids');
  const asksEl = $('#asks');

  const topBids = depth.bids.slice(0, 10);
  const topAsks = depth.asks.slice(0, 10);

  bidsEl.innerHTML = topBids.map(([p,q]) => `
    <div class="ob-row green">
      <div class="price">${fmtPrice(p)}</div>
      <div class="qty">${fmtQty(q)}</div>
    </div>
  `).join('');

  asksEl.innerHTML = topAsks.map(([p,q]) => `
    <div class="ob-row red">
      <div class="price">${fmtPrice(p)}</div>
      <div class="qty">${fmtQty(q)}</div>
    </div>
  `).join('');
}

function renderTrades(trades){
  const box = $('#trades');
  box.innerHTML = trades.map(t => {
    const sideRed = t.isBuyerMaker === true; // sell (taker is seller) → merah
    return `
      <div class="trade-row">
        <div class="time">${toTime(t.time)}</div>
        <div class="price ${sideRed ? 'red' : 'green'}">${fmtPrice(t.price)}</div>
        <div class="qty">${fmtQty(t.qty)}</div>
      </div>
    `;
  }).join('');
}

// ======= INIT =======
async function init(){
  const { candles, volumes } = await getKlines();
  candleSeries.setData(candles);
  volumeSeries.setData(volumes);
  ma9.setData( calcMA(candles, 9) );
  ma21.setData( calcMA(candles, 21) );

  const ticker = await getTicker24h();
  renderPriceBox(ticker);

  const depth = await getDepth(20);
  renderOrderBook(depth);

  const trades = await getTrades(30);
  renderTrades(trades);
}
init().catch(console.error);

// ======= LIVE UPDATES =======
// Harga + % (2s), OrderBook (3s), Trades (3s), Candle last update (5s)
setInterval(async () => {
  try{
    const t = await getTicker24h();
    renderPriceBox(t);
  }catch(e){ /* silent */ }
}, 2000);

setInterval(async () => {
  try{
    const d = await getDepth(20);
    renderOrderBook(d);
  }catch(e){}
}, 3000);

setInterval(async () => {
  try{
    const tr = await getTrades(30);
    renderTrades(tr);
  }catch(e){}
}, 3000);

setInterval(async () => {
  try{
    // ambil 1 candle terakhir untuk update realtime 5m
    const url = `${BASE}/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=1`;
    const res = await fetch(url);
    const d = await res.json();
    const c = {
      time: d[0][0] / 1000,
      open: +d[0][1],
      high: +d[0][2],
      low:  +d[0][3],
      close:+d[0][4],
    };
    candleSeries.update(c);
    volumeSeries.update({
      time: d[0][0] / 1000,
      value: +d[0][5],
      color: (+d[0][4] >= +d[0][1]) ? '#4bffb5' : '#ff4976'
    });
    // Recalc MA terakhir (hemat, cukup titik paling ujung)
    // (Untuk akurasi penuh, bisa recalc semua, tapi lebih berat.)
  }catch(e){}
}, 5000);

// Optional: recalc MA penuh setiap 60s agar akurat setelah sesi berjalan lama
setInterval(async () => {
  try{
    const { candles } = await getKlines();
    ma9.setData( calcMA(candles, 9) );
    ma21.setData( calcMA(candles, 21) );
  }catch(e){}
}, 60000);
