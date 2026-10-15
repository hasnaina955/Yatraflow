/* P7 Look Inside: binds a public trip payload (data/<id>.js) to the page.
   Locked days arrive as previews only. Their stops load from data/<id>.paid.js after the pretend payment. */
(function () {
  'use strict'
  var Q = new URLSearchParams(location.search)
  var TRIPS = window.YF_TRIPS || {}
  var INDEX = window.YF_INDEX || []
  var id = TRIPS[Q.get('trip')] ? Q.get('trip') : 'spiti'
  var T = TRIPS[id]
  var root = document.documentElement
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
  var still = Q.get('static') === '1'
  var priced = T.pub.price != null
  var N = T.pub.days
  var C = T.creator
  var state = { owned: false, waved: false }

  /* ---------- formatting ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) }
  function inr(n) { return '₹' + Number(n).toLocaleString('en-IN') }
  function two(n) { return (n < 10 ? '0' : '') + n }
  function hm(m) { m = Math.round(m); var h = Math.floor(m / 60), r = m % 60; return h ? (r ? h + ' h ' + r + ' m' : h + ' h') : r + ' m' }
  function clock(m) { m = Math.round(m) % 1440; var h = Math.floor(m / 60), r = m % 60, ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return r ? h + ':' + two(r) + ' ' + ap : h + ' ' + ap }
  function hhmm(s) { return s ? clock(+s.slice(0, 2) * 60 + +s.slice(3, 5)) : '' }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many) }
  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s }
  function dayList(nums) {
    var runs = [], out = []
    nums.forEach(function (n) { var r = runs[runs.length - 1]; if (r && n === r[1] + 1) r[1] = n; else runs.push([n, n]) })
    runs.forEach(function (r) { if (r[1] - r[0] >= 2) out.push(r[0] + ' to ' + r[1]); else for (var k = r[0]; k <= r[1]; k++) out.push(String(k)) })
    return out.length > 1 ? out.slice(0, -1).join(', ') + ' and ' + out[out.length - 1] : out[0]
  }
  function splitTitle(t) { var m = t.split(/\s+[—–]\s+/); return m.length > 1 ? [m[0], m.slice(1).join(' — ')] : [t, null] }
  var mainTitle = splitTitle(T.pub.title)[0]

  /* ---------- icons ---------- */
  var IC = {
    lock: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    fork: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="5" r="2.2"/><circle cx="18" cy="5" r="2.2"/><circle cx="12" cy="19" r="2.2"/><path d="M6 7.2v2.3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7.2M12 12.5v4.3"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    tick: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
  }
  // Plain pictograms that every traveller already knows: a car, a train, a plane, the sun, a clock.
  function pic(d) { return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>' }
  IC.car = pic('<path d="M5 17H3v-5l2.4-5.2A2 2 0 0 1 7.2 5.6h9.6a2 2 0 0 1 1.8 1.2L21 12v5h-2"/><path d="M3 12h18"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/><path d="M9.5 17h5"/>')
  IC.train = pic('<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 10h14"/><circle cx="9" cy="13.5" r=".6"/><circle cx="15" cy="13.5" r=".6"/><path d="M8 21l2-4M16 21l-2-4"/>')
  IC.plane = pic('<path d="M10.2 20.5 12 19v-5l8 3v-2.2l-8-5V4.6a1.6 1.6 0 0 0-3.2 0v5.2l-7.8 5V17l7.8-3v5l1.8 1.5"/>')
  IC.sun = pic('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>')
  IC.clock = pic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>')
  IC.moon = pic('<path d="M20 14.6A8.2 8.2 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6z"/>')
  IC.pin = pic('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>')
  IC.rupee = pic('<path d="M7 4.5h10M7 9h10M7 4.5h3.2a4.3 4.3 0 0 1 0 8.6H7l7.5 7"/>')
  IC.note = pic('<path d="M5 3.5h14v12l-5 5H5z"/><path d="M14 20.5v-5h5M8.5 8.5h7M8.5 12h4"/>')
  IC.door = pic('<path d="M5 21V4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5V21M3 21h18"/><circle cx="15" cy="12.5" r=".8"/>')
  IC.lockSm = IC.lock
  IC.grid = pic('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>')
  IC.cal = pic('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>')
  IC.cam = pic('<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>')
  IC.user = pic('<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>')

  /* ---------- categories: one colour, one icon and one word each ----------
     Icons follow the app's CATEGORY_ICONS (src/components/icons.tsx). Hues follow the app's map-pin
     hues (TripMap.tsx), tuned for AA text on a tint in both themes. Two hues moved off the app:
     sight (yellow) and outdoors (orange) sat too close to saffron, which means "paid" here. */
  var CATS = {
    sightseeing: { one: 'sight', many: 'sights', ic: IC.cam },
    nature: { one: 'nature stop', many: 'nature stops', ic: pic('<path d="M5 19.5c0-8.5 5.5-14 14.5-14.5 0 9-5.5 14.5-14.5 14.5z"/><path d="M5 19.5c3-4.5 6.5-7.5 10.5-9.5"/>') },
    food: { one: 'food stop', many: 'food stops', ic: pic('<path d="M7 3v18M4.5 3v5.5a2.5 2.5 0 0 0 5 0V3M17.5 21V3c-2.2 1.4-3.5 4.2-3.5 7.5V13h3.5"/>') },
    temple: { one: 'temple', many: 'temples', ic: pic('<path d="M3 20.5h18M5.5 20.5V11M18.5 20.5V11M10 20.5V11M14 20.5V11M3.5 11h17L12 3.5z"/>') },
    museum: { one: 'museum', many: 'museums', ic: pic('<rect x="5" y="3.5" width="14" height="17" rx="1.5"/><path d="M9 7.5h1.5M13.5 7.5H15M9 11.5h1.5M13.5 11.5H15M10.5 20.5v-3.5h3v3.5"/>') },
    beach: { one: 'beach', many: 'beaches', ic: pic('<path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5h-17A8.5 8.5 0 0 1 12 3.5z"/><path d="M12 12v6.5a2 2 0 0 1-4 0"/>') },
    shopping: { one: 'market', many: 'markets', ic: pic('<path d="M5 8h14l-1.2 12.5H6.2z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>') },
    adventure: { one: 'outdoor stop', many: 'outdoor stops', ic: pic('<path d="M2.5 20 9.5 7.5l4.2 7.2 2.6-4.2 5.2 9.5z"/>') },
    event: { one: 'evening out', many: 'evenings out', ic: pic('<path d="M9 18V5.5l11-2v12.5"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>') },
    hotel: { one: 'stay', many: 'stays', ic: pic('<path d="M3 19.5V6M3 14.5h18v5M21 14.5v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="1.8"/>') },
    travel: { one: 'transfer', many: 'transfers', ic: IC.train }
  }
  // Fixed light fills for the navy plate (the plate is navy in both themes).
  var PLATE_FILL = { sightseeing: '#8DB8F2', nature: '#6BD08F', food: '#F59595', temple: '#B9A2F8', museum: '#A5A8F8', beach: '#5FD0E6', shopping: '#F48FB8', adventure: '#A9D46A', event: '#EE9BF5', hotel: '#A3B1C2', travel: '#8FD6C9' }
  function catKey(k) { return CATS[k] ? k : 'sightseeing' }
  function catWords(k, n) { var c = CATS[catKey(k)]; return n + ' ' + (n === 1 ? c.one : c.many) }
  function mixList(mix) {
    return Object.keys(mix || {}).filter(function (k) { return mix[k] > 0 }).map(function (k) { return [catKey(k), mix[k]] })
      .reduce(function (acc, e) { var f = acc.filter(function (x) { return x[0] === e[0] })[0]; if (f) f[1] += e[1]; else acc.push(e.slice()); return acc }, [])
      .sort(function (a, b) { return b[1] - a[1] })
  }
  function cchip(k, n) { return '<span class="cchip" style="--c:var(--c-' + k + ')">' + CATS[k].ic + '<span>' + catWords(k, n) + '</span></span>' }
  function cchips(mix, max) {
    var l = mixList(mix); if (!l.length) return ''
    var shown = l.slice(0, max || 6), rest = l.slice(max || 6).reduce(function (s, e) { return s + e[1] }, 0)
    return '<span class="cchips">' + shown.map(function (e) { return cchip(e[0], e[1]) }).join('') + (rest ? '<span class="cchip cchip-more">' + plural(rest, 'other place', 'other places') + '</span>' : '') + '</span>'
  }
  function mixStrip(mix, cls) {
    var l = mixList(mix); if (!l.length) return ''
    return '<span class="mix ' + (cls || '') + '" aria-hidden="true">' + l.map(function (e) { return '<i style="--c:var(--c-' + e[0] + ');flex-grow:' + e[1] + '"></i>' }).join('') + '</span>'
  }
  function sumMix(list) { return list.reduce(function (m, d) { Object.keys(d.mix || {}).forEach(function (k) { m[k] = (m[k] || 0) + d.mix[k] }); return m }, {}) }

  /* ---------- derived ---------- */
  var days = T.days
  var freeIdx = days.filter(function (d) { return !d.locked }).map(function (d) { return d.index })
  var lockedIdx = days.filter(function (d) { return d.locked }).map(function (d) { return d.index })
  var feature = days.filter(function (d) { return !d.locked }).reduce(function (best, d) { return !best || d.timed > best.timed ? d : best }, null)
  var runs = []
  days.forEach(function (d) { if (!d.locked) return; var r = runs[runs.length - 1]; if (r && r[r.length - 1].index === d.index - 1) r.push(d); else runs.push([d]) })
  var long = N > 10

  function paidDay(i) { var P = window.YF_PAID && window.YF_PAID[id]; return P && P.days[i] }
  function dayTitle(d) {
    if (!d.locked) return d.title || 'Day ' + (d.index + 1)
    if (state.owned && paidDay(d.index)) return paidDay(d.index).title || 'Day ' + (d.index + 1)
    return d.teaser || 'Day ' + (d.index + 1)
  }
  function dayStops(d) { return d.locked ? (paidDay(d.index) || {}).stops : d.stops }

  /* ---------- plain words for a day ---------- */
  // A stranger reads words, not charts: each day gets a pace label, a plain detail line and, when free, its first places.
  var mode = /train/.test(T.travel.label) ? 'train' : days.some(function (d) { return d.stats.flights }) ? 'air' : T.travel.value === 'One base' ? 'base' : 'road'
  function pace(d) {
    var s = d.stats, span = (s.end || 0) - (s.start || 0)
    if (!s.stops && !s.flights) return { k: 'none', ic: IC.moon, label: 'Nothing planned' }
    if (s.flights) return { k: 'flight', ic: IC.plane, label: 'Flight day' }
    if (s.road >= 180) return { k: 'long', ic: mode === 'train' ? IC.clock : IC.car, label: mode === 'train' ? 'Long travel day' : 'Long drive' }
    if (s.stops >= 4 || span >= 600) return { k: 'full', ic: IC.pin, label: 'Full day' }
    return { k: 'easy', ic: IC.sun, label: 'Easy day' }
  }
  function paceTag(d) { var p = pace(d); return '<span class="pace pace-' + p.k + '">' + p.ic + '<span>' + p.label + '</span></span>' }
  function plainMeta(d) {
    var s = d.stats, bits = []
    if (!s.stops && !s.flights) return 'No stops planned for this day'
    if (s.flights) bits.push(plural(s.flights, 'flight', 'flights'))
    if (s.stops) bits.push(plural(s.stops, 'place', 'places') + ' to see')
    if (s.km > 4) bits.push(hm(s.road) + (mode === 'train' ? ' of travel' : ' on the road'))
    else if (s.stops > 1) bits.push('all close together')
    return bits.join(' · ')
  }
  /* ---------- the plate: a trip ticket when there is no photo ---------- */
  function routeBits() {
    var r = T.pub.route, p = r.parts.filter(function (x) { return !/^\d+ more$/.test(x) })
    var more = r.parts.filter(function (x) { return /^\d+ more$/.test(x) })[0]
    var round = r.back === p[0] || (mode === 'air' && /^([A-Z]{3}) .* \1$/.test(T.travel.label))
    var from = p[0], to = round ? null : (r.back || p[p.length - 1])
    var via = p.slice(1, round ? p.length : p.length - 1)
    if (more) via.push(more)
    var main = p.length === 1 && !r.back ? from : round ? 'Round trip from ' + from : from + ' to ' + to
    return { main: main, via: via.length ? 'via ' + (via.length > 1 ? via.slice(0, -1).join(', ') + ' and ' + via[via.length - 1] : via[0]) : (mode === 'base' ? T.travel.label.replace(/^[^,]+,\s*/, '') : '') }
  }
  function modeWords() {
    if (mode === 'train') return [IC.train, T.travel.value + ' by train']
    if (mode === 'air') return [IC.plane, T.travel.value]
    if (mode === 'base') return [IC.pin, 'One base']
    return [IC.car, T.travel.value + ' by road']
  }
  function ticket() {
    var r = routeBits(), m = modeWords()
    return '<div class="ticket"><div class="tk-main"><p class="tk-route">' + esc(r.main) + '</p>' + (r.via ? '<p class="tk-via">' + esc(cap(r.via)) + '</p>' : '') + cchips(T.mix, 3) + '</div>' +
      '<div class="tk-stub"><p class="tk-days"><b>' + N + '</b> ' + (N === 1 ? 'day' : 'days') + '</p><p class="tk-mode">' + m[0] + '<span>' + esc(m[1]) + '</span></p></div></div>'
  }
  // One tile per stop kind, in the trip's own proportions: a map of icons, not a stock photo.
  function collage() {
    var l = mixList(T.mix), base = []
    l.forEach(function (e) { for (var k = 0; k < e[1]; k++) base.push(e[0]) })
    if (!base.length) for (var z = 0; z < 6; z++) base.push('travel')
    var h = 0; for (var c = 0; c < id.length; c++) h = (h * 31 + id.charCodeAt(c)) >>> 0
    function rnd() { h = (h + 0x6D2B79F5) >>> 0; var t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
    for (var i = base.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), x = base[i]; base[i] = base[j]; base[j] = x }
    var out = '', n = 0
    for (var cell = 0; cell < 72; cell++) {
      if (rnd() > 0.58) { out += '<b></b>'; continue }
      var k2 = base[n++ % base.length], icon = k2 === 'travel' ? modeWords()[0] : CATS[k2].ic
      out += '<i style="--f:' + PLATE_FILL[k2] + ';--rt:' + Math.round(rnd() * 30 - 15) + 'deg;--d:' + Math.min(cell, 40) + '">' + icon + '</i>'
    }
    return '<div class="collage" aria-hidden="true">' + out + '</div>'
  }
  function plate() { return '<div class="plate">' + collage() + ticket() + '</div>' }
  function coverArt(where) {
    var c = T.cover
    if (c && (c.kind === 'local' || c.kind === 'remote')) {
      return '<img class="' + (where === 'cover' ? 'cover-photo' : '') + '" src="' + esc(c.src) + '" alt="' + esc(c.alt) + '" style="object-position:' + (c.focus || '50% 50%') + '"' +
        (c.kind === 'remote' ? ' referrerpolicy="no-referrer" data-remote' : '') + (where === 'cover' ? ' fetchpriority="high"' : ' loading="lazy"') + '>'
    }
    return plate()
  }

  /* ---------- buy boxes ---------- */
  var freeLine = 'Read ' + (freeIdx.length === 1 ? 'day ' : 'days ') + dayList(freeIdx.map(function (i) { return i + 1 })) + ' free first'
  function buy(where) {
    var compact = where === 'sticky' || where === 'bar'
    if (!priced) {
      if (where === 'sticky') return '<span class="sb-price">Free plan</span><button class="btn btn-primary" type="button" data-fork>' + IC.fork + 'Fork to my trips</button>'
      if (where === 'bar') return '<div class="pb-text"><span class="pb-price">Free plan</span><span class="pb-terms">every day is open</span></div><button class="btn btn-primary" type="button" data-fork>' + IC.fork + 'Fork</button>'
      return '<div class="buy-price"><span class="price">Free plan</span><span class="buy-terms">Every day is open to read.</span></div>' +
        (where === 'head' && T.pub.pitch ? pitch() : '') +
        '<button class="btn btn-primary btn-block" type="button" data-fork>' + IC.fork + 'Fork to my trips</button>' +
        (where === 'head' ? '<button class="link" type="button" data-goto="feature">Read day ' + (feature.index + 1) + ' first ' + IC.arrow + '</button>' : '')
    }
    if (state.owned) {
      if (where === 'sticky') return '<span class="sb-terms">You own this plan</span><button class="btn btn-primary" type="button" data-fork>' + IC.fork + 'Fork to my trips</button>'
      if (where === 'bar') return '<div class="pb-text"><span class="pb-price">You own this plan</span><span class="pb-terms">Bought today</span></div><button class="btn btn-primary" type="button" data-fork>' + IC.fork + 'Fork</button>'
      return '<div class="owned-mark"><span class="tick">' + IC.tick + '</span><div><p class="price">You own this plan</p><p class="buy-terms">Bought today for ' + inr(T.pub.price) + '. Pretend payment: nothing was charged.</p></div></div>' +
        '<button class="btn btn-primary btn-block" type="button" data-fork>' + IC.fork + 'Fork to my trips</button>' +
        (where === 'head' ? '<button class="link" type="button" data-goto="sealed">Read the days you unlocked ' + IC.arrow + '</button>' : '')
    }
    var label = 'Unlock all ' + N + ' days'
    if (where === 'sticky') return '<span class="sb-price">' + inr(T.pub.price) + '</span><span class="sb-terms">one payment</span><button class="btn btn-saffron" type="button" data-unlock>' + IC.lock + '<span class="lbl">' + label + '</span></button>'
    if (where === 'bar') return '<div class="pb-text"><span class="pb-price">' + inr(T.pub.price) + '</span><span class="pb-terms">one payment · ' + plural(freeIdx.length, 'day', 'days') + ' free</span></div><button class="btn btn-saffron" type="button" data-unlock>' + IC.lock + '<span class="lbl">Unlock</span></button>'
    return '<div class="buy-price"><span class="price num" data-count="' + T.pub.price + '" data-prefix="₹">' + inr(T.pub.price) + '</span><span class="buy-terms">one payment, no subscription</span></div>' +
      (where === 'head' && T.pub.pitch ? pitch() : '') +
      '<button class="btn btn-saffron btn-block" type="button" data-unlock>' + IC.lock + '<span class="lbl">' + label + '</span></button>' +
      (where === 'head' ? '<button class="link" type="button" data-goto="feature">' + freeLine + ' ' + IC.arrow + '</button>' : '')
  }
  function pitch() {
    return '<blockquote class="pitch"><p>“' + esc(T.pub.pitch) + '”</p><cite>' + esc(C.name) + ', who made this plan</cite></blockquote>'
  }
  function renderBuys() {
    document.querySelectorAll('[data-buy]').forEach(function (el) { el.innerHTML = buy(el.getAttribute('data-buy')) })
  }

  /* ---------- head ---------- */
  function facts() {
    var f = []
    f.push([plural(N, 'day', 'days'), priced ? (freeIdx.length + ' free to read') : 'all free to read'])
    f.push([T.travel.value, T.travel.label])
    if (T.pub.season) f.push([T.pub.season.split(/\s+[—–-]\s+|;|,/)[0].trim(), 'best season'])
    if (T.pub.budget > 0) f.push([inr(T.pub.budget), 'a person, about'])
    if (T.pub.style) f.push([cap(T.pub.style), 'trip style'])
    return '<dl class="facts" data-rise style="--i:3">' + f.map(function (x) { return '<div><dt>' + esc(x[1]) + '</dt><dd>' + esc(x[0]) + '</dd></div>' }).join('') + '</dl>'
  }
  function byline() {
    var bits = ['Planned by <b>' + esc(C.name) + '</b>', plural(C.plans, 'plan', 'plans') + ' on YatraFlow', (T.pub.refreshed ? 'updated ' : 'published ') + (T.pub.updatedDays === 0 ? 'today' : plural(T.pub.updatedDays, 'day', 'days') + ' ago')]
    if (T.pub.views >= 100) bits.push(T.pub.views.toLocaleString('en-IN') + ' views')
    if (T.pub.copies >= 25) bits.push(T.pub.copies.toLocaleString('en-IN') + ' forks')
    return '<p class="byline" data-rise style="--i:2"><span class="avatar" aria-hidden="true">' + esc(C.initial) + '</span><span class="by-text">' + bits.join(' · ') + '</span></p>'
  }
  function head() {
    var t = splitTitle(T.pub.title)
    return '<header class="head" id="top" aria-labelledby="title">' +
      '<div class="head-grid"><div>' +
      '<h1 class="h1" id="title" data-rise style="--i:0">' + esc(t[0]) + (t[1] ? '<span class="h1-sub">' + esc(t[1]) + '</span>' : '') + '</h1>' +
      (T.pub.tagline ? '<p class="tagline" data-rise style="--i:1">' + esc(T.pub.tagline) + '</p>' : '') +
      byline() + facts() + '</div>' +
      '<div class="buy" data-buy="head" data-rise style="--i:2"></div></div></header>'
  }

  /* ---------- what is inside: plain day cards ---------- */
  function insideSentence() {
    var r = routeBits(), how = mode === 'train' ? ' by train' : mode === 'air' ? ' with ' + T.travel.value : mode === 'base' ? '' : ' by road'
    var where = mode === 'base' ? ' in and around ' + T.pub.route.parts[0] : /^Round trip from /.test(r.main) ? ', a round trip from ' + T.pub.route.parts[0] : r.main.indexOf(' to ') > 0 ? ', from ' + r.main : ''
    var s = 'A ' + N + '-day trip' + how + where + '. '
    if (!priced) return s + 'Every day is free to read.'
    if (state.owned) return s + 'You own this plan, so all ' + N + ' days are open.'
    var fr = freeIdx.map(function (i) { return i + 1 }), lk = lockedIdx.map(function (i) { return i + 1 })
    return s + esc(C.name) + ' lets you read ' + (fr.length === 1 ? 'day ' : 'days ') + dayList(fr) + ' free. ' + (lk.length === 1 ? 'Day ' : 'Days ') + dayList(lk) + (lk.length === 1 ? ' is' : ' are') + ' locked until you buy the plan.'
  }
  function gets() {
    var c = T.counts, g = []
    if (c.stops) g.push([IC.clock, c.timed === c.stops ? 'A time for each of the ' + c.stops + ' places' : 'A time for ' + c.timed + ' of the ' + c.stops + ' places'])
    if (c.stops) g.push(mode === 'train' ? [IC.train, 'Travel time between cities'] : mode === 'air' ? [IC.plane, 'Flight and airport times'] : [IC.car, mode === 'base' ? 'Travel time between places' : 'Driving time between places'])
    if (c.fees) g.push([IC.rupee, 'Entry fees for ' + plural(c.fees, 'place', 'places')])
    if (c.hours) g.push([IC.door, 'Opening hours for ' + plural(c.hours, 'place', 'places')])
    var tips = T.pub.tips.length
    if (c.notes) g.push([IC.note, 'Notes from ' + C.name + ' on ' + plural(c.notes, 'place', 'places') + (tips ? ', and ' + plural(tips, 'tip', 'tips') + ' before you go' : '')])
    else if (tips) g.push([IC.note, plural(tips, 'tip', 'tips') + ' from ' + C.name + ' before you go'])
    g.push([IC.fork, 'A copy in your trips that you can change'])
    return '<ul class="gets" aria-label="What the plan gives you">' + g.map(function (x) { return '<li>' + x[0] + '<span>' + esc(x[1]) + '</span></li>' }).join('') + '</ul>'
  }
  function hIc(ic) { return '<span class="h-ic">' + ic + '</span>' }
  function andList(a) { return a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a[0] }
  function lockedLine() {
    if (!priced || state.owned || !lockedIdx.length) return ''
    var l = mixList(sumMix(days.filter(function (d) { return d.locked }))), lk = lockedIdx.map(function (i) { return i + 1 })
    if (!l.length) return ''
    return '<p class="lockline">' + IC.lock + '<span>Inside ' + (lk.length === 1 ? 'day ' : 'days ') + dayList(lk) + ': ' + andList(l.map(function (e) { return catWords(e[0], e[1]) })) + '. Their names open when you buy the plan.</span></p>'
  }
  function mixBox() {
    var l = mixList(T.mix); if (!l.length) return ''
    var total = l.reduce(function (s, e) { return s + e[1] }, 0)
    return '<div class="mixbox"><p class="mixbox-t">The ' + total + ' places, by kind</p>' + cchips(T.mix, 8) + lockedLine() + '</div>'
  }
  function travelMeta(d) {
    var s = d.stats
    if (!s.stops && !s.flights) return 'No stops planned for this day'
    var bits = []
    if (s.flights) bits.push(plural(s.flights, 'flight', 'flights'))
    if (s.km > 4) bits.push(hm(s.road) + (mode === 'train' ? ' of travel' : ' on the road'))
    else bits.push(s.stops > 1 ? 'all close together' : 'close by')
    return bits.join(' · ')
  }
  function stopList(stops, max) {
    var st = (stops || []).filter(function (x) { return x.kind === 'stop' })
    if (!st.length) return ''
    var shown = st.slice(0, max), more = st.length - shown.length
    return '<span class="dc-stops">' + shown.map(function (x) { var k = catKey(x.cat); return '<span class="dst" style="--c:var(--c-' + k + ')">' + CATS[k].ic + '<span>' + esc(x.title) + '</span></span>' }).join('') +
      (more ? '<span class="dst-more">and ' + plural(more, 'more place', 'more places') + '</span>' : '') + '</span>'
  }
  function chip(d) {
    if (d.locked && !state.owned) return '<span class="chip chip-lock">' + IC.lock + 'Locked</span>'
    if (d.locked) return '<span class="chip chip-own">Yours</span>'
    return '<span class="chip chip-free">' + (priced ? 'Free to read' : 'Open') + '</span>'
  }
  function dcard(d, k) {
    var n = d.index + 1, locked = d.locked && !state.owned
    var title = dayTitle(d), fallback = locked && !d.teaser
    var body = locked ? cchips(d.mix, 4) : stopList(dayStops(d), 3)
    return '<li style="--i:' + k + '"><a class="dcard' + (locked ? ' is-locked' : '') + '" href="#day-' + n + '" data-goto="' + d.index + '">' + mixStrip(d.mix, 'mix-top') +
      '<span class="dc-top"><span class="dc-n">Day ' + n + '</span>' + chip(d) + '</span>' +
      '<span class="dc-t' + (fallback ? ' is-fallback' : '') + '">' + esc(fallback ? 'Opens when you buy the plan' : title) + '</span>' +
      '<span class="dc-pace">' + paceTag(d) + '<span class="dc-m">' + esc(travelMeta(d)) + '</span></span>' + body + '</a></li>'
  }
  function dcards() {
    var clip = N > 12
    return '<ol class="dcards' + (clip ? ' is-clipped' : '') + (state.owned ? ' is-owned is-in' : '') + '" id="dcards" data-reveal>' + days.map(dcard).join('') + '</ol>' +
      (clip ? '<button class="btn btn-soft dc-more" type="button" data-more aria-controls="dcards" aria-expanded="false">Show all ' + N + ' days</button>' : '')
  }
  /* ---------- day by day ---------- */
  function timeline(stops) {
    if (!stops || !stops.length) return '<ol class="tl"><li class="tl-empty" style="--i:0"><span></span><p>No stops planned for this day.</p></li></ol>'
    var i = 0, out = ''
    stops.forEach(function (s) {
      if (s.kind === 'flight') { out += '<li class="tl-flight" style="--i:' + (i++) + '"><time>' + clock(s.t) + '</time><div class="tl-body"><h4>Flight, ' + esc(s.from) + ' to ' + esc(s.to) + '</h4><p class="tl-meta">About ' + hm(150) + ' with the airport</p></div></li>'; return }
      if (s.kind === 'stay') { out += '<li class="tl-stay" style="--i:' + (i++) + '"><span>Night</span><div class="tl-body">' + esc(s.title) + '</div></li>'; return }
      if (s.leg && s.leg.min >= 20) {
        var how = s.leg.mode === 'train' ? 'by train' : s.leg.mode === 'transfer' ? 'airport transfer' : 'by road'
        out += '<li class="tl-leg" style="--i:' + (i++) + '"><span></span><div class="tl-body"><i class="leg-bar" style="--m:' + Math.min(240, s.leg.min) + '"></i><span>' + hm(s.leg.min) + ' ' + how + (s.leg.km ? ' · ' + s.leg.km.toLocaleString('en-IN') + ' km' : '') + '</span></div></li>'
      }
      var meta = [s.catLabel, s.min ? hm(s.min) : null, s.open ? 'open ' + hhmm(s.open) + (s.close ? ' to ' + hhmm(s.close) : '') : null, s.fee ? inr(s.fee) + ' entry' : null].filter(Boolean).join(' · ')
      out += '<li class="tl-stop" style="--i:' + (i++) + '"><time>' + clock(s.t) + '</time><div class="tl-body"><span class="tl-ic" style="--c:var(--c-' + catKey(s.cat) + ')">' + CATS[catKey(s.cat)].ic + '</span><h4>' + esc(s.title) + '</h4><p class="tl-meta">' + esc(meta) + '</p>' + (s.note ? '<p class="tl-note">' + esc(s.note) + '</p>' : '') + '</div></li>'
    })
    return '<ol class="tl">' + out + '</ol>'
  }
  function ledger(d) {
    var st = (dayStops(d) || []).filter(function (s) { return s.kind === 'stop' })
    if (!st.length) return ''
    var fees = st.reduce(function (s, x) { return s + (x.fee || 0) }, 0), notes = st.filter(function (x) { return x.note }).length
    var rows = [['Starts', clock(d.stats.start)], ['Ends about', clock(d.stats.end)], ['On the move', d.stats.road ? hm(d.stats.road) : 'short hops']]
    if (d.stats.km > 4) rows.push(['Distance', d.stats.km.toLocaleString('en-IN') + ' km'])
    rows.push(['Entry fees', fees ? inr(fees) + ' a person' : 'none listed'])
    if (notes) rows.push(['Notes from ' + C.name, String(notes)])
    return '<dl class="ledger">' + rows.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>' }).join('') + '</dl>'
  }
  function dayCard(d, opts) {
    opts = opts || {}
    var open = !!opts.open, n = d.index + 1
    var label = opts.owned ? 'Read day ' + n : (d.index === feature.index ? 'Day ' + n + ' in full' : 'Read free')
    return '<article class="day' + (open ? ' is-open' : '') + (opts.owned ? ' is-locked' : '') + '" id="day-' + n + '" data-i="' + d.index + '" style="--i:' + (opts.k || 0) + '"' + (opts.owned ? '' : ' data-draw') + '>' +
      '<div class="day-head"><span class="day-n">' + n + '</span><div class="day-tt"><h3>' + esc(dayTitle(d)) + '</h3><p class="day-meta">' + esc(plainMeta(d)) + '</p></div>' +
      paceTag(d) +
      '<button class="day-act" type="button" aria-expanded="' + open + '" aria-controls="body-' + n + '"><span>' + (open ? 'Close' : label) + '</span>' + IC.chev + '</button></div>' +
      '<div class="day-body" id="body-' + n + '"' + (open ? '' : ' inert') + '><div class="day-inner"><div class="day-grid">' + timeline(dayStops(d)) + ledger(d) + '</div></div></div></article>'
  }
  function srow(d) {
    var n = d.index + 1
    return '<li class="srow is-locked" id="day-' + n + '" data-i="' + d.index + '"><span class="day-n">' + n + '</span><div><p class="srow-t' + (d.teaser ? '' : ' is-fallback') + '" data-teaser="' + d.index + '">' + esc(d.teaser || 'Day ' + n) + '</p>' +
      '<p class="srow-m">' + esc(plainMeta(d)) + '</p>' + cchips(d.mix, 4) +
      '<div class="teaser-edit"><label for="tz-' + n + '">Teaser strangers see for day ' + n + '</label><input id="tz-' + n + '" data-tz="' + d.index + '" maxlength="80" value="' + esc(d.teaser || '') + '" placeholder="Day ' + n + '"><small>Say what the day feels like. Do not name the stops. Empty shows “Day ' + n + '”.</small></div></div>' +
      paceTag(d) + '</li>'
  }
  function weekGroups(run) {
    var g = []
    run.forEach(function (d) { var w = Math.floor(d.index / 7), last = g[g.length - 1]; if (last && last.w === w) last.days.push(d); else g.push({ w: w, days: [d] }) })
    return g
  }
  function weekMeta(list) {
    var stops = list.reduce(function (s, d) { return s + d.stats.stops }, 0)
    var moves = list.filter(function (d) { return d.stats.road >= 180 || d.stats.flights }).length
    return plural(stops, 'stop', 'stops') + (moves ? ' · ' + plural(moves, 'long travel day', 'long travel days') : '')
  }
  function week(list, open, inner) {
    var a = list[0].index + 1, b = list[list.length - 1].index + 1
    return '<div class="week' + (open ? ' is-open' : '') + '"><button class="week-head" type="button" aria-expanded="' + open + '"><span><span class="week-t">Days ' + a + ' to ' + b + '</span><span class="week-m">' + weekMeta(list) + '</span></span>' +
      '<span class="week-toggle">' + IC.chev + '</span></button>' +
      '<div class="week-body"' + (open ? '' : ' inert') + '><div class="week-inner">' + inner + '</div></div></div>'
  }
  function sealed(run, k) {
    var a = run[0].index + 1, b = run[run.length - 1].index + 1
    var label = run.length === 1 ? 'Day ' + a + ' is locked' : 'Days ' + a + ' to ' + b + ' are locked'
    var stops = run.reduce(function (s, d) { return s + d.stats.stops }, 0)
    var rows
    if (run.length > 7) rows = weekGroups(run).map(function (g, gi) { return week(g.days, gi === 0, '<ol class="sealed-rows">' + g.days.map(srow).join('') + '</ol>') }).join('')
    else rows = '<ol class="sealed-rows">' + run.map(srow).join('') + '</ol>'
    return '<section class="sealed" data-run="' + k + '" aria-labelledby="seal-' + k + '">' +
      '<div class="sealed-head"><h3 id="seal-' + k + '">' + label + '</h3><p>' + plural(run.length, 'day', 'days') + ' and ' + plural(stops, 'stop', 'stops') + '. You see ' + esc(C.name) + '’s one-line teaser for each day. The places, times and notes open on this page when you buy the plan.</p></div>' +
      '<div class="sealed-list">' + rows + '</div><div class="owned-days"></div>' +
      '<div class="sealed-foot"><button class="btn btn-saffron" type="button" data-unlock>' + IC.lock + '<span class="lbl">Unlock all ' + N + ' days</span></button><p>' + inr(T.pub.price) + ', one payment, no subscription.</p></div></section>'
  }
  function book() {
    var out = '', k = 0, r = 0
    days.forEach(function (d) {
      if (!d.locked) { out += dayCard(d, { open: d.index === feature.index, k: k++ }); return }
      var run = runs[r]
      if (run && run[0].index === d.index) { out += sealed(run, r); r++ }
    })
    return out
  }
  function bookLede() {
    var n = feature.index + 1
    if (!priced) return 'Day ' + n + ' is open below. Every other day opens in place.'
    return 'Day ' + n + ' is open below, free. Every day in this plan is written like it: times, travel, fees, hours and ' + esc(C.name) + '’s notes.'
  }

  /* ---------- the rest of the page ---------- */
  function gallery() {
    if (!T.gallery) return ''
    return '<section class="sec" id="photos" aria-labelledby="photos-h"><div class="wrap"><div class="sec-head" data-reveal><h2 id="photos-h">' + hIc(IC.cam) + 'From the road</h2><p>Photos from the places on this route. Each one is credited below it.</p></div></div>' +
      '<div class="gallery" tabindex="0" role="region" aria-label="Photos from the road, scroll sideways">' + T.gallery.map(function (g) {
        return '<figure><div class="ph" style="--ar:' + g.w + '/' + g.h + '"><img src="' + esc(g.src) + '" alt="' + esc(g.title) + '" decoding="async"></div><figcaption>' + esc(g.title) + '. <a href="' + esc(g.page) + '" rel="noopener" target="_blank">' + esc(g.credit) + '</a></figcaption></figure>'
      }).join('') + '</div></section>'
  }
  function notes() {
    var p = T.pub, s = ''
    if (p.season) {
      var parts = p.season.split(/\s+[—–]\s+/), first = parts[0].trim(), rest = parts.slice(1).join(' — ')
      var m = first.match(/^([A-Za-z]+)\s*[–-]\s*([A-Za-z]+)$/)
      s = '<p class="lede"><b>' + (m ? 'Go between ' + esc(m[1]) + ' and ' + esc(m[2]) + '.' : 'Best season: ' + esc(first) + '.') + '</b>' + (rest ? ' ' + esc(cap(rest)) + '.' : '') + '</p>'
    }
    function list(items, cls) { return '<ul class="notes-list' + (cls || '') + '">' + items.map(function (x) { return '<li>' + esc(x) + '</li>' }).join('') + '</ul>' }
    return '<section class="sec wrap" id="notes" aria-labelledby="notes-h"><div class="sec-head" data-reveal><h2 id="notes-h">' + hIc(IC.note) + 'Notes from ' + esc(C.name) + '</h2>' + s + '</div>' +
      '<div class="notes-grid" data-reveal>' +
      (p.tips.length ? '<div><h3>Before you go</h3>' + list(p.tips) + '</div>' : '') +
      (p.warnings.length ? '<div><h3>What the plan assumes</h3>' + list(p.warnings, ' is-warn') + '</div>' : '') + '</div></section>'
  }
  function cost() {
    var p = T.pub, c = T.counts
    var plan = priced
      ? '<div class="cost-plan"><p class="cost-big" data-count="' + p.price + '" data-prefix="₹">' + inr(p.price) + '</p><p class="cost-cap">for the plan. You pay once. There is no subscription.</p></div>'
      : '<div class="cost-plan"><p class="cost-big">Free</p><p class="cost-cap">to read and to fork. ' + esc(C.name) + ' shares this plan at no cost.</p></div>'
    var trip = p.budget > 0
      ? '<div class="cost-trip"><p class="cost-big" data-count="' + p.budget + '" data-prefix="₹">' + inr(p.budget) + '</p><p class="cost-cap">a person for the trip itself, about. This is ' + esc(C.name) + '’s own estimate, not a quote.</p></div>'
      : '<div class="cost-trip"><p class="cost-cap">' + esc(C.name) + ' did not estimate what the trip itself costs.</p></div>'
    var scale = p.budget > 0
      ? '<div class="scale' + (priced ? '' : ' is-free') + '" data-scale aria-hidden="true"><span class="scale-plan" style="--w:' + (priced ? (p.price / p.budget * 100).toFixed(2) : 0) + '%"></span></div>' +
        '<p class="scale-cap">' + (priced ? 'The saffron part is the plan. The whole bar is the trip for one person.' : 'The whole bar is the trip for one person. The plan adds nothing to it.') + '</p>'
      : ''
    var get = [[c.timed, c.timed === 1 ? 'stop with a visit time' : 'stops with visit times'], [N, 'days in your trips, ready to edit'], [c.hours, c.hours === 1 ? 'stop with opening hours' : 'stops with opening hours'], [c.fees, c.fees === 1 ? 'stop with its entry fee' : 'stops with entry fees'], [c.notes, (c.notes === 1 ? 'note' : 'notes') + ' from ' + C.name]]
      .filter(function (g) { return g[0] > 0 })
    return '<section class="cost" id="cost" aria-labelledby="cost-h"><div class="wrap"><div class="sec-head" data-reveal><h2 id="cost-h">' + hIc(IC.rupee) + 'What it costs</h2></div>' +
      '<div class="cost-grid" data-reveal>' + plan + trip + '</div>' + scale +
      '</div></section>'
  }
  function creator() {
    var c = T.counts
    var get = [[c.timed, c.timed === 1 ? 'stop with a visit time' : 'stops with visit times'], [N, 'days, ready to fork and edit'], [c.hours, c.hours === 1 ? 'stop with opening hours' : 'stops with opening hours'], [c.fees, c.fees === 1 ? 'stop with its entry fee' : 'stops with entry fees'], [c.notes, c.notes === 1 ? 'stop with a note' : 'stops with notes'], [T.pub.tips.length, T.pub.tips.length === 1 ? 'tip before you go' : 'tips before you go']]
      .filter(function (g) { return g[0] > 0 })
    var work = '<div class="work"><h3>What ' + esc(C.name) + ' put into this plan</h3><dl class="get">' + get.map(function (g) { return '<div><dt>' + esc(g[1]) + '</dt><dd data-count="' + g[0] + '">' + g[0] + '</dd></div>' }).join('') + '</dl></div>'
    return '<section class="sec wrap" id="creator" aria-labelledby="creator-h"><div class="sec-head" data-reveal><h2 id="creator-h">' + hIc(IC.user) + 'The person behind it</h2></div>' +
      '<div class="creator-grid" data-reveal><span class="avatar-xl" aria-hidden="true">' + esc(C.initial) + '</span><div><p class="creator-name">' + esc(C.name) + '</p>' +
      '<p class="creator-bio">' + esc(C.bio) + '</p><p class="creator-facts">' + plural(C.plans, 'plan', 'plans') + ' on YatraFlow · this one ' + (T.pub.refreshed ? 'updated ' : 'published ') + plural(T.pub.updatedDays, 'day', 'days') + ' ago</p>' +
      '<div class="creator-act"><button class="btn btn-soft" type="button" data-toast="Their profile opens here in the app.">See ' + esc(C.name) + '’s other plans</button></div></div>' + work + '</div></section>'
  }
  function steps() {
    var locked = lockedIdx.map(function (i) { return i + 1 })
    if (!priced) return ['Every day is open. Read it here, as it is.', 'Fork it to your trips. Change the dates, the people and the stops.']
    if (state.owned) return ['You own this plan. It stays in My purchases.', 'Fork it to your trips. Change the dates, the people and the stops.']
    return ['You pay ' + inr(T.pub.price) + ' once.', (locked.length === 1 ? 'Day ' : 'Days ') + dayList(locked) + ' open on this page at once.', 'Fork it to your trips. Change the dates, the people and the stops.']
  }
  function take() {
    return '<section class="take" id="take" aria-labelledby="take-h"><div class="take-bg">' + coverArt('take') + '</div>' +
      '<div class="take-card" data-reveal><h2 id="take-h">Take this trip</h2><ul class="steps" id="steps">' + steps().map(function (s) { return '<li>' + esc(s) + '</li>' }).join('') + '</ul>' +
      '<div class="buy" data-buy="take"></div>' +
      '<div class="share"><button class="btn btn-soft" type="button" data-copy>Copy link</button><button class="btn btn-soft" type="button" data-toast="WhatsApp opens here in the app.">Share on WhatsApp</button></div></div></section>'
  }
  function foot() {
    var credit = T.cover && T.cover.credit ? 'Cover: ' + (T.cover.page ? '<a href="' + esc(T.cover.page) + '" rel="noopener" target="_blank">' + esc(T.cover.credit) + '</a>' : esc(T.cover.credit)) + '. ' : ''
    return '<footer class="foot wrap"><p class="foot-mark">YatraFlow</p><p>' + credit + 'Prototype page. Times and distances are approximate here; the app computes them with its trip engine. The creator, the pitch and the teasers are sample text.</p></footer>'
  }

  /* ---------- page ---------- */
  function page() {
    var credit = T.cover && T.cover.credit ? '<a class="cover-credit" href="' + esc(T.cover.page) + '" rel="noopener" target="_blank">Photo: ' + esc(T.cover.credit.replace(/^".*?" by /, '').replace(/, via Wikimedia Commons$/, '')) + '</a>' : ''
    return '<div class="wrap topbar"><a class="wordmark" href="#top">YatraFlow</a><nav aria-label="Main"><a href="#explore">Explore</a><a href="#trips">My trips</a></nav><button class="btn btn-soft" type="button" data-toast="Log in opens here in the app.">Log in</button></div>' +
      '<div class="creator-strip" role="note"><b>This is what buyers see.</b><span>' + T.pub.views + ' views and ' + T.pub.copies + ' forks so far.</span><span>Strangers read your teasers, never your stops. Edit them in the locked days below.</span></div>' +
      '<div class="stage"><div class="cover" aria-hidden="' + (T.cover && T.cover.alt ? 'false' : 'true') + '"><div class="cover-move">' + coverArt('cover') + '<span class="cover-veil"></span></div>' + credit + '</div>' + head() + '</div>' +
      '<main id="main">' +
      '<section class="sec wrap" id="inside" aria-labelledby="inside-h"><div class="inside-top" data-reveal><div><div class="sec-head"><h2 id="inside-h">' + hIc(IC.grid) + 'What is inside</h2><p class="lede">' + insideSentence() + '</p></div>' + mixBox() + '</div>' + gets() + '</div>' +
      '<div class="dcards-wrap">' + dcards() + '</div></section>' +
      '<section class="sec wrap" id="days" aria-labelledby="days-h"><div class="sec-head" data-reveal><h2 id="days-h">' + hIc(IC.cal) + 'Day by day</h2><p>' + bookLede() + '</p></div><div class="book" id="book">' + book() + '</div></section>' +
      gallery() + notes() + cost() + creator() + take() + '</main>' + foot() +
      '<div class="stickybar" id="stickybar" aria-label="Price"><span class="avatar" aria-hidden="true">' + esc(C.initial) + '</span><span class="sb-title">' + esc(mainTitle) + '</span><span data-buy="sticky" style="display:flex;align-items:center;gap:14px"></span></div>' +
      '<div class="pricebar" id="pricebar" data-buy="bar" aria-label="Price"></div>'
  }

  /* ---------- behaviour ---------- */
  function q(s, el) { return (el || document).querySelector(s) }
  function qa(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)) }
  var toastTimer
  function toast(msg) { var t = q('#toast'); t.textContent = msg; t.classList.add('is-on'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('is-on') }, 2600) }

  function countUp(el) {
    var to = +el.getAttribute('data-count'), pre = el.getAttribute('data-prefix') || ''
    if (!to || reduce.matches || still || el.dataset.done) return
    el.dataset.done = '1'
    var t0 = performance.now(), dur = 900
    function f(now) { var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = pre + Math.round(to * e).toLocaleString('en-IN'); if (p < 1) requestAnimationFrame(f) }
    requestAnimationFrame(f)
  }

  function observe() {
    var els = qa('[data-reveal],[data-draw],[data-scale],[data-count]')
    if (still || !('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('is-in') }); return }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return
        e.target.classList.add('is-in')
        if (e.target.hasAttribute('data-count')) countUp(e.target)
        io.unobserve(e.target)
      })
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0 })
    els.forEach(function (e) { io.observe(e) })
  }

  function toggleDay(card, force) {
    var open = force != null ? force : !card.classList.contains('is-open')
    var btn = q('.day-act', card), body = q('.day-body', card), n = +card.dataset.i + 1
    card.classList.toggle('is-open', open)
    card.classList.remove('is-opening')
    if (open) { void card.offsetWidth; card.classList.add('is-opening'); body.removeAttribute('inert') } else body.setAttribute('inert', '')
    btn.setAttribute('aria-expanded', open)
    var owned = card.closest('.owned-days')
    q('span', btn).textContent = open ? 'Close' : (owned ? 'Read day ' + n : (+card.dataset.i === feature.index ? 'Day ' + n + ' in full' : 'Read free'))
  }
  function toggleWeek(w, force) {
    var open = force != null ? force : !w.classList.contains('is-open')
    w.classList.toggle('is-open', open)
    q('.week-head', w).setAttribute('aria-expanded', open)
    var b = q('.week-body', w); if (open) b.removeAttribute('inert'); else b.setAttribute('inert', '')
  }
  function goTo(target) {
    var el
    if (target === 'feature') el = document.getElementById('day-' + (feature.index + 1))
    else if (target === 'sealed') el = q('.sealed')
    else {
      var i = +target, n = i + 1
      el = state.owned ? (q('.owned-days #day-' + n) || document.getElementById('day-' + n)) : document.getElementById('day-' + n)
    }
    if (!el) return
    var w = el.closest('.week'); if (w && !w.classList.contains('is-open')) toggleWeek(w, true)
    if (el.classList.contains('day') && !el.classList.contains('is-open')) toggleDay(el, true)
    el.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'start' })
  }

  function wireCover() {
    var mv = q('.cover-move'), veil = q('.cover-veil'), img = q('.cover-photo[data-remote]')
    if (img) img.addEventListener('error', function () { mv.innerHTML = plate(true) + '<span class="cover-veil"></span>'; var cr = q('.cover-credit'); if (cr) cr.remove(); veil = q('.cover-veil') })
    if (reduce.matches) return
    var ticking = false
    function f() {
      ticking = false
      var p = Math.max(0, Math.min(1, window.scrollY / (window.innerHeight * 0.9)))
      mv.style.transform = 'translate3d(0,' + (p * 6).toFixed(2) + '%,0) scale(' + (1 + p * 0.08).toFixed(4) + ')'
      if (veil) veil.style.opacity = (p * 0.5).toFixed(3)
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(f) } }, { passive: true })
    f()
  }

  function wireBars() {
    var sb = q('#stickybar'), pb = q('#pricebar'), headBuy = q('[data-buy="head"]'), takeCard = q('.take-card')
    var past = false, atEnd = false, away = false, phone = window.matchMedia('(max-width: 820px)'), ready = false
    setTimeout(function () { ready = true; sync() }, still ? 0 : 1400)
    function sync() { var on = (phone.matches ? (away && ready) : past) && !atEnd; sb.classList.toggle('is-on', on); pb.classList.toggle('is-on', on); sb.setAttribute('aria-hidden', !on); pb.setAttribute('aria-hidden', !on); if (on) { sb.removeAttribute('inert'); pb.removeAttribute('inert') } else { sb.setAttribute('inert', ''); pb.setAttribute('inert', '') } }
    new IntersectionObserver(function (es) { es.forEach(function (e) { past = !e.isIntersecting && e.boundingClientRect.bottom < 0; away = !e.isIntersecting }); sync() }).observe(headBuy)
    new IntersectionObserver(function (es) { es.forEach(function (e) { atEnd = e.isIntersecting }); sync() }, { threshold: 0.2 }).observe(takeCard)
    sync()
  }

  /* ---------- unlock ---------- */
  function loadPaid() {
    return new Promise(function (res, rej) {
      if (window.YF_PAID && window.YF_PAID[id]) return res()
      var s = document.createElement('script'); s.src = 'data/' + id + '.paid.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s)
    })
  }
  function fillOwned() {
    qa('.sealed').forEach(function (s) {
      var run = runs[+s.dataset.run], a = run[0].index + 1, b = run[run.length - 1].index + 1
      q('.sealed-head h3', s).textContent = run.length === 1 ? 'Day ' + a + ' is yours now' : 'Days ' + a + ' to ' + b + ' are yours now'
      q('.sealed-head p', s).textContent = 'Open any day to read it in full: times, travel, fees, hours and ' + C.name + '’s notes.'
      var cards
      if (run.length > 7) cards = weekGroups(run).map(function (g, gi) { return week(g.days, gi === 0, g.days.map(function (d, k) { return dayCard(d, { owned: true, k: k, wave: k * 110 }) }).join('')) }).join('')
      else cards = run.map(function (d, k) { return dayCard(d, { owned: true, k: k, wave: k * 110 + 120 }) }).join('')
      q('.owned-days', s).innerHTML = cards
    })
  }
  function setOwned(animate) {
    state.owned = true
    document.body.dataset.state = 'owned'
    renderBuys()
    q('#steps').innerHTML = steps().map(function (s) { return '<li>' + esc(s) + '</li>' }).join('')
    fillOwned()
    var open = q('#dcards').classList.contains('is-clipped') === false
    q('.dcards-wrap').innerHTML = dcards()
    var mb = q('.mixbox'); if (mb) mb.outerHTML = mixBox()
    var ld = q('#inside-h + .lede'); if (ld) ld.innerHTML = insideSentence()
    if (open && q('[data-more]')) showAll()
    if (!animate) { qa('.sealed').forEach(function (s) { s.classList.add('is-owned') }); state.waved = true }
  }
  function showAll() {
    var l = q('#dcards'), b = q('[data-more]'); if (!l || !b) return
    l.classList.remove('is-clipped'); b.remove()
    var nx = l.children[8]; if (nx) q('a', nx).focus({ preventScroll: true })
  }
  function playUnseal() {
    var s = q('.sealed'); if (!s) return
    goTo('sealed')
    setTimeout(function () {
      qa('.sealed').forEach(function (x) { x.classList.add('is-owned', 'is-unsealing') })
    }, reduce.matches ? 0 : 420)
    // the overview cards turn from Locked to Yours in a wave when the reader scrolls back to them
    var dc = q('#dcards')
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { dc.classList.add('is-waving'); io.disconnect() } }) }, { threshold: 0.2 })
    io.observe(dc)
  }
  function unlock() {
    if (state.owned || !priced) return
    qa('[data-unlock]').forEach(function (b) { b.setAttribute('aria-busy', 'true'); var l = q('.lbl', b); if (l) l.textContent = 'Opening…' })
    loadPaid().then(function () {
      setTimeout(function () { setOwned(true); openReveal() }, reduce.matches ? 0 : 650)
    }, function () { toast('The paid days did not load. Nothing was charged.') ; renderBuys() })
  }
  function openReveal() {
    var d = q('#reveal'), opened = lockedIdx.length
    var date = new Date(2026, 9, 15).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    d.innerHTML = '<div class="reveal-in"><div class="reveal-art">' + coverArt('art') + '</div><div class="reveal-body">' +
      '<h2 class="reveal-title" id="reveal-title" style="--i:0">You own this plan</h2>' +
      '<p class="reveal-by" style="--i:1">' + esc(mainTitle) + ', planned by ' + esc(C.name) + '</p>' +
      '<dl class="reveal-facts" style="--i:2"><div><dt>days</dt><dd>' + N + '</dd></div><div><dt>stops</dt><dd>' + T.counts.stops + '</dd></div><div><dt>just opened</dt><dd>' + plural(opened, 'day', 'days') + '</dd></div></dl>' +
      '<p class="reveal-receipt" style="--i:3">' + inr(T.pub.price) + ' paid once on ' + date + '. This is a pretend payment. Nothing was charged.</p>' +
      '<div class="reveal-act" style="--i:4"><button class="btn btn-primary" type="button" data-fork>' + IC.fork + 'Fork to my trips</button><button class="btn btn-soft" type="button" data-read>Read the plan</button></div></div></div>'
    d.addEventListener('close', function onClose() { d.removeEventListener('close', onClose); playUnseal() })
    d.showModal()
    q('[data-read]', d).focus()
  }

  /* ---------- dev panel ---------- */
  function wireDev() {
    var dev = q('#dev'), btn = q('.dev-btn', dev), sel = q('#dev-trip')
    sel.innerHTML = INDEX.map(function (t) { return '<option value="' + t.id + '"' + (t.id === id ? ' selected' : '') + '>' + esc(t.label) + '</option>' }).join('')
    btn.addEventListener('click', function () { var o = !dev.classList.contains('is-open'); dev.classList.toggle('is-open', o); btn.setAttribute('aria-expanded', o) })
    sel.addEventListener('change', function () { var p = new URLSearchParams(location.search); p.set('trip', sel.value); p.delete('state'); location.search = p.toString() })
    function themeNow() { return root.getAttribute('data-theme') || 'system' }
    qa('[data-theme-set]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.themeSet === themeNow())
      b.addEventListener('click', function () {
        var t = b.dataset.themeSet
        if (t === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t)
        try { if (t === 'system') localStorage.removeItem('yf-proto-theme'); else localStorage.setItem('yf-proto-theme', t) } catch (e) {}
        qa('[data-theme-set]').forEach(function (x) { x.setAttribute('aria-pressed', x.dataset.themeSet === themeNow()) })
      })
    })
    qa('[data-state-set]').forEach(function (b) {
      var cur = Q.get('state') === 'owned' ? 'owned' : 'locked'
      b.setAttribute('aria-pressed', b.dataset.stateSet === cur); if (!priced) b.disabled = true
      b.addEventListener('click', function () { var p = new URLSearchParams(location.search); if (b.dataset.stateSet === 'owned') p.set('state', 'owned'); else p.delete('state'); location.search = p.toString() })
    })
    var cv = q('#dev-creator'); cv.setAttribute('aria-pressed', root.classList.contains('as-creator'))
    cv.addEventListener('click', function () { var on = !root.classList.contains('as-creator'); root.classList.toggle('as-creator', on); cv.setAttribute('aria-pressed', on) })
    q('#dev-replay').addEventListener('click', function () { window.scrollTo(0, 0); location.reload() })
    q('#dev-note').textContent = (T.coverNote ? T.coverNote + ' ' : '') + 'Creator, pitch and teasers are sample text.' + (priced ? '' : ' Free plan: no lock states.')
  }

  /* ---------- boot ---------- */
  function boot() {
    document.title = mainTitle + ' · YatraFlow'
    q('#app').innerHTML = page()
    renderBuys()
    observe(); wireCover(); wireBars(); wireDev()

    document.addEventListener('click', function (e) {
      var t = e.target.closest('button, a'); if (!t) return
      if (t.hasAttribute('data-unlock')) { e.preventDefault(); unlock(); return }
      if (t.hasAttribute('data-fork')) { e.preventDefault(); toast(priced && !state.owned ? 'Unlock first, then fork it.' : 'Forked to My trips. This is a prototype, so nothing was saved.'); return }
      if (t.hasAttribute('data-read')) { q('#reveal').close(); return }
      if (t.hasAttribute('data-more')) { showAll(); return }
      if (t.hasAttribute('data-goto')) { e.preventDefault(); goTo(t.getAttribute('data-goto')); return }
      if (t.hasAttribute('data-toast')) { e.preventDefault(); toast(t.getAttribute('data-toast')); return }
      if (t.hasAttribute('data-copy')) { e.preventDefault(); try { navigator.clipboard.writeText(location.href) } catch (x) {} toast('Link copied.'); return }
      if (t.classList.contains('day-act')) { toggleDay(t.closest('.day')); return }
      if (t.classList.contains('week-head')) { toggleWeek(t.closest('.week')); return }
      if (t.matches('.topbar nav a')) { e.preventDefault(); toast('This link opens the app.') }
    })
    document.addEventListener('input', function (e) {
      var i = e.target.getAttribute && e.target.getAttribute('data-tz'); if (i == null) return
      var d = days[+i], v = e.target.value.trim(); d.teaser = v || null
      var p = q('[data-teaser="' + i + '"]'); p.textContent = v || 'Day ' + (+i + 1); p.classList.toggle('is-fallback', !v)
      var c = q('#dcards [data-goto="' + i + '"] .dc-t'); if (c) { c.textContent = v || 'Opens when you buy the plan'; c.classList.toggle('is-fallback', !v) }
    })

    if (Q.get('state') === 'owned' && priced) loadPaid().then(function () { setOwned(false) })
    if (Q.get('open') === 'all') qa('.day').forEach(function (c) { toggleDay(c, true) })
  }
  boot()
})()
