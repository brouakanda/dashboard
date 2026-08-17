/* ============================================================================
   <maeci-map> — carte du monde, signature de la plateforme.
   Géométrie réelle Natural Earth (world-atlas 110m) rendue en d3-geo.
   Aucune tuile, aucun appel de données : seule la géométrie est chargée.
   API : el.setLayer({mode, values, bubbles, arcs, unite, legende})
         el.focusOn(scope)   scope = {continent} | {iso3} | null (monde)
         évènements : 'pays-clic' (detail.iso3), 'pays-survol'
   ========================================================================== */
(function () {
  'use strict';
  const GEO = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';
  let geoPromise = null;

  const C = {
    encre: '#1C1917', papier: '#FFFFFF', filet: '#E4E0D5', terre: '#F1EDE4',
    bleu: '#2E6FC4', orange: '#F5A623', accent: '#B54708', graphite: '#5B6169'
  };

  class MaeciMap extends HTMLElement {
    constructor() {
      super();
      this._layer = { mode: 'choro', values: {}, bubbles: [], arcs: [], unite: '' };
      this._scope = null;
      this._ready = false;
    }
    connectedCallback() {
      if (this._mounted) return;
      this._mounted = true;
      this.style.display = 'block';
      this.style.position = 'relative';
      this.style.width = '100%';
      this.style.height = '100%';
      this.style.background = C.papier;
      this._build();
    }
    async _build() {
      const d3 = window.d3, topojson = window.topojson;
      if (!d3 || !topojson) { this._fallback('Bibliothèque cartographique indisponible'); return; }
      if (!geoPromise) geoPromise = fetch(GEO).then(function (r) { return r.json(); });
      let topo;
      try { topo = await geoPromise; } catch (e) { this._fallback('Géométrie indisponible hors ligne'); return; }
      this._features = topojson.feature(topo, topo.objects.countries).features;

      const svg = d3.select(this).append('svg')
        .attr('width', '100%').attr('height', '100%')
        .style('display', 'block').style('position', 'absolute').style('inset', '0');
      this._svg = svg;

      const defs = svg.append('defs');
      // Hachure : données non consolidées / projetées.
      const h = defs.append('pattern').attr('id', 'mm-hachure').attr('width', 6).attr('height', 6)
        .attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'rotate(45)');
      h.append('rect').attr('width', 6).attr('height', 6).attr('fill', C.terre);
      h.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 6)
        .attr('stroke', C.filet).attr('stroke-width', 2);
      const glow = defs.append('filter').attr('id', 'mm-glow').attr('x', '-60%').attr('y', '-60%').attr('width', '220%').attr('height', '220%');
      glow.append('feGaussianBlur').attr('stdDeviation', 3).attr('result', 'b');
      const fm = glow.append('feMerge'); fm.append('feMergeNode').attr('in', 'b'); fm.append('feMergeNode').attr('in', 'SourceGraphic');

      this._g = svg.append('g');
      this._gGraticule = this._g.append('g');
      this._gPays = this._g.append('g');
      this._gArcs = this._g.append('g').attr('fill', 'none');
      this._gBulles = this._g.append('g');
      this._gLabels = this._g.append('g').style('pointer-events', 'none');

      this._projection = d3.geoNaturalEarth1();
      this._path = d3.geoPath(this._projection);
      this._graticule = d3.geoGraticule10();

      this._tip = document.createElement('div');
      Object.assign(this._tip.style, {
        position: 'absolute', pointerEvents: 'none', opacity: '0', zIndex: '5',
        background: '#1C1917', color: '#FFFFFF', padding: '8px 11px', borderRadius: '6px',
        font: "500 11.5px/1.45 'Public Sans', system-ui, sans-serif",
        border: '1px solid #1C1917', transition: 'opacity .14s ease', maxWidth: '240px',
        boxShadow: '0 10px 30px -12px rgba(0,0,0,.5)'
      });
      this.appendChild(this._tip);

      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(this);
      this._ready = true;
      this._resize();
      this.dispatchEvent(new CustomEvent('carte-prete'));
    }
    _fallback(msg) {
      const d = document.createElement('div');
      Object.assign(d.style, {
        position: 'absolute', inset: '0', display: 'flex', alignItems: 'center',
        justifyContent: 'center', font: "500 12px/1.5 'IBM Plex Mono', monospace",
        color: C.graphite, letterSpacing: '.08em', textAlign: 'center', padding: '24px'
      });
      d.textContent = msg;
      this.appendChild(d);
    }
    _resize() {
      if (!this._ready) return;
      const w = this.clientWidth || 900, hgt = this.clientHeight || 500;
      this._w = w; this._h = hgt;
      this._projection.fitExtent([[10, 10], [w - 10, hgt - 10]], { type: 'Sphere' });
      this._base = { k: this._projection.scale(), t: this._projection.translate() };
      this._draw(false);
      if (this._scope) this.focusOn(this._scope, false);
    }
    _reduced() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

    _draw(animate) {
      const d3 = window.d3, self = this;
      const path = this._path;
      this._gGraticule.selectAll('path').data([this._graticule]).join('path')
        .attr('d', path).attr('fill', 'none').attr('stroke', C.filet)
        .attr('stroke-width', .4).attr('stroke-opacity', .5);

      const vals = this._layer.values || {};
      const nums = Object.keys(vals).map(function (k) { return vals[k]; }).filter(function (v) { return v > 0; });
      const max = nums.length ? Math.max.apply(null, nums) : 1;
      const scale = d3.scaleSqrt().domain([0, max]).range([0, 1]);
      const ramp = d3.interpolateRgb('#F7EADA', C.accent);

      const sel = this._gPays.selectAll('path').data(this._features, function (d) { return d.id; });
      const enter = sel.enter().append('path')
        .attr('d', path)
        .attr('stroke', C.papier).attr('stroke-width', .6)
        .style('cursor', 'pointer')
        .on('mousemove', function (ev, d) { self._hover(ev, d); })
        .on('mouseleave', function () { self._tip.style.opacity = '0'; self._gPays.selectAll('path').attr('stroke-width', .6); })
        .on('click', function (ev, d) {
          const iso = self._iso(d);
          if (iso) self.dispatchEvent(new CustomEvent('pays-clic', { detail: { iso3: iso }, bubbles: true }));
        });

      /* Le remplissage est posé de façon SYNCHRONE : porté par une transition
         d3 anonyme, il était interrompu par le tween de zoom de focusOn, qui
         redessine les mêmes tracés à chaque image, et la valeur finale
         n'arrivait jamais. Seule l'opacité d'entrée s'anime, sur une
         transition nommée qui ne peut pas entrer en concurrence. */
      const all = enter.merge(sel).attr('d', path).attr('fill', function (d) {
        const iso = self._iso(d);
        const v = iso ? vals[iso] : 0;
        if (iso === 'CIV') return C.encre;
        return v > 0 ? ramp(scale(v)) : C.terre;
      });
      if (animate && !this._reduced()) {
        all.attr('opacity', 0.25).transition('entree').duration(520)
          .delay(function (d, i) { return (i % 40) * 7; }).attr('opacity', 1);
      } else {
        all.attr('opacity', 1);
      }

      this._drawBubbles(animate);
      this._drawArcs(animate);
      this._drawCiv();
    }
    _drawCiv() {
      const p = this._projection([-5.5, 7.5]);
      const g = this._gLabels.selectAll('g.civ').data([1]).join(
        function (e) { const g = e.append('g').attr('class', 'civ'); g.append('circle'); g.append('text'); return g; }
      );
      g.attr('transform', 'translate(' + p[0] + ',' + p[1] + ')');
      g.select('circle').attr('r', 3.4).attr('fill', C.orange).attr('stroke', C.encre).attr('stroke-width', 1);
      g.select('text').attr('x', 8).attr('y', 3.5).attr('fill', C.encre)
        .style('font', "600 10px/1 'IBM Plex Mono', monospace").style('letter-spacing', '.06em')
        .text('ABIDJAN');
    }
    _drawBubbles(animate) {
      const d3 = window.d3, self = this;
      const data = this._layer.bubbles || [];
      const max = data.length ? Math.max.apply(null, data.map(function (b) { return b.v; })) : 1;
      const r = d3.scaleSqrt().domain([0, max]).range([0, Math.max(10, Math.min(this._w, this._h) * 0.075)]);
      const sel = this._gBulles.selectAll('circle').data(data, function (b) { return b.iso3; });
      sel.exit().transition().duration(250).attr('r', 0).remove();
      const enter = sel.enter().append('circle').attr('r', 0).style('cursor', 'pointer')
        .on('mousemove', function (ev, b) {
          self._tipHtml(ev, '<b>' + b.nom + '</b><br>' + b.txt);
        })
        .on('mouseleave', function () { self._tip.style.opacity = '0'; })
        .on('click', function (ev, b) { self.dispatchEvent(new CustomEvent('pays-clic', { detail: { iso3: b.iso3 }, bubbles: true })); });
      const merged = enter.merge(sel)
        .attr('cx', function (b) { return self._projection([b.lon, b.lat])[0]; })
        .attr('cy', function (b) { return self._projection([b.lon, b.lat])[1]; })
        .attr('fill', function (b) { return b.projete ? 'none' : 'rgba(46,111,196,.24)'; })
        .attr('stroke', function (b) { return b.projete ? C.orange : C.bleu; })
        .attr('stroke-width', function (b) { return b.projete ? 1.4 : 1; })
        .attr('stroke-dasharray', function (b) { return b.projete ? '3 3' : null; });
      (animate && !this._reduced()
        ? merged.transition().duration(700).delay(function (d, i) { return i * 22; })
        : merged).attr('r', function (b) { return r(b.v); });
    }
    _drawArcs(animate) {
      const self = this;
      const data = this._layer.arcs || [];
      const origin = this._projection([-5.5, 7.5]);
      const sel = this._gArcs.selectAll('path').data(data, function (a) { return a.iso3; });
      sel.exit().remove();
      const enter = sel.enter().append('path')
        .attr('stroke', C.orange).attr('stroke-opacity', .55).attr('stroke-linecap', 'round');
      const merged = enter.merge(sel)
        .attr('stroke-width', function (a) { return a.w || 1; })
        .attr('d', function (a) {
          const p = self._projection([a.lon, a.lat]);
          const mx = (origin[0] + p[0]) / 2, my = (origin[1] + p[1]) / 2;
          const dx = p[0] - origin[0], dy = p[1] - origin[1];
          const nx = -dy, ny = dx, len = Math.sqrt(nx * nx + ny * ny) || 1;
          const bend = Math.min(90, len * 0.22);
          return 'M' + origin[0] + ',' + origin[1] + 'Q' + (mx + nx / len * bend) + ',' + (my + ny / len * bend) + ' ' + p[0] + ',' + p[1];
        });
      if (animate && !this._reduced()) {
        merged.each(function () {
          const L = this.getTotalLength();
          window.d3.select(this).attr('stroke-dasharray', L + ' ' + L).attr('stroke-dashoffset', L)
            .transition().duration(900).ease(window.d3.easeCubicOut).attr('stroke-dashoffset', 0);
        });
      } else { merged.attr('stroke-dasharray', null).attr('stroke-dashoffset', null); }
    }
    _iso(d) {
      if (!this._byName) {
        this._byName = {};
        (window.MAECI ? window.MAECI.pays : []).forEach((p) => { this._byName[p.en] = p.iso3; });
      }
      const n = d.properties && d.properties.name;
      return this._byName[n] || null;
    }
    _hover(ev, d) {
      const iso = this._iso(d);
      const p = iso && window.MAECI ? window.MAECI.paysIndex[iso] : null;
      if (!p) { this._tip.style.opacity = '0'; return; }
      const v = (this._layer.values || {})[iso];
      const txt = '<b>' + p.nom + '</b><br><span style="opacity:.7">' + p.region + '</span>'
        + (v !== undefined ? '<br><span style="font-family:\'IBM Plex Mono\',monospace">' + window.MAECI.fmt.nombre(v) + ' ' + (this._layer.unite || '') + '</span>' : '');
      this._tipHtml(ev, txt);
    }
    _tipHtml(ev, html) {
      const r = this.getBoundingClientRect();
      this._tip.innerHTML = html;
      this._tip.style.opacity = '1';
      const x = ev.clientX - r.left, y = ev.clientY - r.top;
      this._tip.style.left = Math.min(x + 14, r.width - 250) + 'px';
      this._tip.style.top = (y + 14) + 'px';
    }

    setLayer(layer) {
      this._layer = Object.assign({ mode: 'choro', values: {}, bubbles: [], arcs: [], unite: '' }, layer || {});
      if (this._ready) this._draw(true);
    }
    focusOn(scope, animate) {
      this._scope = scope;
      if (!this._ready) return;
      const d3 = window.d3;
      let feats = this._features;
      if (scope && scope.iso3) {
        feats = this._features.filter((f) => this._iso(f) === scope.iso3);
      } else if (scope && scope.continent && window.MAECI) {
        const set = {};
        window.MAECI.pays.forEach(function (p) { if (p.continent === scope.continent) set[p.iso3] = 1; });
        feats = this._features.filter((f) => set[this._iso(f)]);
      }
      let k = this._base.k, t = this._base.t;
      if (feats.length && feats !== this._features) {
        const coll = { type: 'FeatureCollection', features: feats };
        const b = this._path.bounds(coll);
        const dx = b[1][0] - b[0][0], dy = b[1][1] - b[0][1];
        const s = Math.max(1, Math.min(7, 0.72 / Math.max(dx / this._w, dy / this._h)));
        const cx = (b[0][0] + b[1][0]) / 2, cy = (b[0][1] + b[1][1]) / 2;
        k = this._base.k * s;
        t = [this._w / 2 - s * (cx - this._base.t[0]) - (s - 1) * this._base.t[0], this._h / 2 - s * (cy - this._base.t[1]) - (s - 1) * this._base.t[1]];
        t = [this._w / 2 + s * (this._base.t[0] - cx), this._h / 2 + s * (this._base.t[1] - cy)];
      }
      const self = this;
      const from = { k: this._projection.scale(), t: this._projection.translate() };
      if (animate === false || this._reduced()) {
        this._projection.scale(k).translate(t); this._draw(false); return;
      }
      d3.transition().duration(750).ease(d3.easeCubicInOut).tween('zoom', function () {
        const ik = d3.interpolate(from.k, k), it = d3.interpolate(from.t, t);
        return function (u) { self._projection.scale(ik(u)).translate(it(u)); self._draw(false); };
      });
    }
  }
  if (!customElements.get('maeci-map')) customElements.define('maeci-map', MaeciMap);
})();
