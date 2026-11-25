// Token Launch Radar dashboard: sortable, filterable board + detail view.
// Data comes from ../data.js (window.RADAR_DATA), written by main.ts from
// the same board.json rows, so the page and the gate file always agree.
(function () {
  var D = window.RADAR_DATA;
  if (!D) { document.getElementById('subline').textContent = 'No data loaded.'; return; }
  var rows = D.rows.slice();
  var maxImplied = rows.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 1);
  var sortKey = 'rank', sortDir = 1;
  var $ = function (id) { return document.getElementById(id); };

  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  $('subline').textContent = 'Snapshot ' + D.as_of + ' · model ' + D.model_version + ' · pre-token protocols only';
  $('stats').innerHTML = [
    [D.board_size, 'protocols ranked'], [D.watchlist_size, 'watchlist covered'],
    [D.early_size, 'early finds below the floor'], [D.live_size, 'live-token set aside'],
    [money(D.floor_usd), 'watchlist TVL floor'], [D.global_multiple.toFixed(3) + 'x', 'global mcap / TVL median']
  ].map(function (s) { return '<div class="stat"><b>' + s[0] + '</b><span>' + s[1] + '</span></div>'; }).join('');
  $('model-note').innerHTML = '<b>How the value is derived:</b> implied value = TVL x category mcap/TVL median ' +
    '(learned from the snapshot\'s own launched protocols; thin categories use the global median) x a 7-day growth factor ' +
    '(change clamped to -50%..+100%, weight 0.35) x an age factor (longer running with no token scores higher; under 30 days is discounted) ' +
    'x a chain-breadth factor (+3% per extra chain, up to 7). Open any row to see its exact breakdown and farm plan.';

  var cats = {}, chains = {};
  rows.forEach(function (r) { if (r.category) cats[r.category] = 1; (r.chains || []).forEach(function (c) { chains[c] = 1; }); });
  Object.keys(cats).sort().forEach(function (c) { $('f-cat').insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>'); });
  Object.keys(chains).sort().forEach(function (c) { $('f-chain').insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>'); });

  function filtered() {
    var q = $('q').value.trim().toLowerCase(), cat = $('f-cat').value, ch = $('f-chain').value, w = $('f-watch').checked;
    return rows.filter(function (r) {
      if (q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q) < 0) return false;
      if (cat && r.category !== cat) return false;
      if (ch && (r.chains || []).indexOf(ch) < 0) return false;
      if (w && !r.watchlist) return false;
      return true;
    });
  }
  function render() {
    var list = filtered();
    list.sort(function (a, b) {
      var x = a[sortKey], y = b[sortKey];
      if (x == null) return 1; if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * sortDir;
    });
    $('count').textContent = list.length + ' shown';
    $('rows').innerHTML = list.map(function (r) {
      var pct = r.change_7d == null ? '—' : (r.change_7d >= 0 ? '+' : '') + Number(r.change_7d).toFixed(1) + '%';
      var cls = r.change_7d == null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg');
      var w = Math.max(3, Math.round(100 * r.implied_value_usd / maxImplied));
      return '<tr data-slug="' + esc(r.slug) + '"><td>' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span><br><span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num ' + cls + '">' + pct + '</td>' +
        '<td class="num">' + (r.age_days == null ? '—' : r.age_days) + '</td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td>' +
        '<td><span class="pill ' + (r.watchlist ? 'watch' : 'early') + '">' + (r.watchlist ? 'WATCHLIST' : 'EARLY') + '</span>' +
        '<div class="bar"><i style="width:' + w + '%"></i></div></td></tr>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('#rows tr'), function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
    });
  }
  function openDetail(slug) {
    var r = null;
    rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    var m = r.model;
    $('detail').innerHTML = '<button class="close" id="d-close">Close</button>' +
      '<h2>' + esc(r.name) + '</h2><div class="slug">' + esc(r.slug) + ' · rank #' + r.rank + ' · ' + (r.watchlist ? 'watchlist' : 'early find') + '</div>' +
      '<div class="kv">' +
      '<div><b>' + money(r.implied_value_usd) + '</b><span>Implied value</span></div>' +
      '<div><b>' + money(r.tvl_usd) + '</b><span>TVL</span></div>' +
      '<div><b>' + esc(r.category || '—') + '</b><span>Category</span></div>' +
      '<div><b>' + (r.age_days == null ? 'unknown' : r.age_days + ' days') + '</b><span>Running, no token recorded</span></div></div>' +
      '<h3>Why this value — model breakdown</h3><div class="formula">' +
      money(r.tvl_usd) + ' TVL x ' + m.multiple.toFixed(4) + ' (' + esc(m.multiple_source) + ')<br>' +
      'x ' + m.growth_factor.toFixed(3) + ' growth (7d ' + (r.change_7d == null ? 'n/a' : Number(r.change_7d).toFixed(1) + '%') + ')' +
      ' x ' + m.age_factor.toFixed(3) + ' age x ' + m.breadth_factor.toFixed(3) + ' breadth (' + (r.chains || []).length + ' chains: ' + esc((r.chains || []).join(', ')) + ')' +
      '<br>= ' + money(r.implied_value_usd) + ' implied value</div>' +
      '<h3>Farm plan</h3><ol>' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    $('detail').classList.remove('hidden'); $('scrim').classList.remove('hidden');
    $('d-close').addEventListener('click', closeDetail);
  }
  function closeDetail() { $('detail').classList.add('hidden'); $('scrim').classList.add('hidden'); }
  $('scrim').addEventListener('click', closeDetail);
  ['q', 'f-cat', 'f-chain', 'f-watch'].forEach(function (id) {
    $(id).addEventListener('input', render); $(id).addEventListener('change', render);
  });
  Array.prototype.forEach.call(document.querySelectorAll('th[data-k]'), function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-k');
      if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = (k === 'name' || k === 'category') ? 1 : -1; if (k === 'rank') sortDir = 1; }
      render();
    });
  });
  render();
  // Deep links: #watch=1 starts filtered to the watchlist, #detail=<slug>
  // opens that protocol's detail view (handy for sharing a single row).
  var hash = {};
  String(location.hash || '').replace(/^#/, '').split('&').forEach(function (pair) {
    var kv = pair.split('='); if (kv[0]) hash[kv[0]] = decodeURIComponent(kv[1] || '');
  });
  if (hash.watch === '1') { $('f-watch').checked = true; render(); }
  if (hash.cat) { $('f-cat').value = hash.cat; render(); }
  if (hash.detail) openDetail(hash.detail);
  window.__radar = { openDetail: openDetail, render: render };
})();
