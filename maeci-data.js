/* ============================================================================
   MAECI — Jeu de données unique de la plateforme de pilotage décisionnel.
   ----------------------------------------------------------------------------
   SOURCE DE VÉRITÉ UNIQUE. Toutes les vues lisent ces tables de faits et
   agrègent à la lecture : aucun total n'est pré-écrit, donc la vue d'ensemble,
   les modules et le détail par pays se réconcilient par construction.

   POINT DE REMPLACEMENT API : la fonction build() ci-dessous est le seul
   endroit à remplacer par un fetch. Tout le reste (agrégations, formats,
   règles d'alerte) fonctionne à l'identique sur des données réelles.

   Données générées par règles saisonnières avec graine fixe : reproductibles,
   d'ordres de grandeur plausibles pour une administration centrale.
   ========================================================================== */
(function () {
  'use strict';

  /* --- générateur pseudo-aléatoire à graine fixe (reproductibilité) ------- */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const R = rng(20260811);
  const jitter = (amp) => 1 + (R() - 0.5) * 2 * amp;
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));

  /* ======================= RÉFÉRENTIEL PAYS ================================
     Table unique référencée par les cinq modules. C'est elle qui rend
     possibles le drill-down Monde → Continent → Pays et l'analyse
     transversale.  `en` sert au raccord avec la géométrie Natural Earth.    */
  const pays = [
    ['CIV', "Côte d'Ivoire", "Côte d'Ivoire", 'Afrique', 'Afrique de l’Ouest', 7.5, -5.5],
    ['FRA', 'France', 'France', 'Europe', 'Europe de l’Ouest', 46.6, 2.4],
    ['MAR', 'Maroc', 'Morocco', 'Afrique', 'Afrique du Nord', 31.8, -7.1],
    ['SEN', 'Sénégal', 'Senegal', 'Afrique', 'Afrique de l’Ouest', 14.5, -14.5],
    ['GHA', 'Ghana', 'Ghana', 'Afrique', 'Afrique de l’Ouest', 7.9, -1.0],
    ['NGA', 'Nigéria', 'Nigeria', 'Afrique', 'Afrique de l’Ouest', 9.1, 8.7],
    ['MLI', 'Mali', 'Mali', 'Afrique', 'Afrique de l’Ouest', 17.6, -4.0],
    ['BFA', 'Burkina Faso', 'Burkina Faso', 'Afrique', 'Afrique de l’Ouest', 12.2, -1.6],
    ['GIN', 'Guinée', 'Guinea', 'Afrique', 'Afrique de l’Ouest', 9.9, -9.7],
    ['BEN', 'Bénin', 'Benin', 'Afrique', 'Afrique de l’Ouest', 9.3, 2.3],
    ['TGO', 'Togo', 'Togo', 'Afrique', 'Afrique de l’Ouest', 8.6, 0.8],
    ['NER', 'Niger', 'Niger', 'Afrique', 'Afrique de l’Ouest', 17.6, 8.1],
    ['CMR', 'Cameroun', 'Cameroon', 'Afrique', 'Afrique centrale', 5.7, 12.7],
    ['GAB', 'Gabon', 'Gabon', 'Afrique', 'Afrique centrale', -0.8, 11.6],
    ['COD', 'Rép. dém. du Congo', 'Dem. Rep. Congo', 'Afrique', 'Afrique centrale', -4.0, 21.8],
    ['TUN', 'Tunisie', 'Tunisia', 'Afrique', 'Afrique du Nord', 33.9, 9.5],
    ['DZA', 'Algérie', 'Algeria', 'Afrique', 'Afrique du Nord', 28.0, 1.7],
    ['EGY', 'Égypte', 'Egypt', 'Afrique', 'Afrique du Nord', 26.8, 30.8],
    ['ZAF', 'Afrique du Sud', 'South Africa', 'Afrique', 'Afrique australe', -30.6, 22.9],
    ['KEN', 'Kenya', 'Kenya', 'Afrique', 'Afrique de l’Est', 0.2, 37.9],
    ['ETH', 'Éthiopie', 'Ethiopia', 'Afrique', 'Afrique de l’Est', 9.1, 40.5],
    ['RWA', 'Rwanda', 'Rwanda', 'Afrique', 'Afrique de l’Est', -1.9, 29.9],
    ['BEL', 'Belgique', 'Belgium', 'Europe', 'Europe de l’Ouest', 50.5, 4.5],
    ['DEU', 'Allemagne', 'Germany', 'Europe', 'Europe de l’Ouest', 51.2, 10.5],
    ['ESP', 'Espagne', 'Spain', 'Europe', 'Europe du Sud', 40.5, -3.7],
    ['ITA', 'Italie', 'Italy', 'Europe', 'Europe du Sud', 41.9, 12.6],
    ['CHE', 'Suisse', 'Switzerland', 'Europe', 'Europe de l’Ouest', 46.8, 8.2],
    ['GBR', 'Royaume-Uni', 'United Kingdom', 'Europe', 'Europe du Nord', 55.4, -3.4],
    ['PRT', 'Portugal', 'Portugal', 'Europe', 'Europe du Sud', 39.4, -8.2],
    ['TUR', 'Turquie', 'Turkey', 'Europe', 'Europe de l’Est', 39.0, 35.2],
    ['RUS', 'Russie', 'Russia', 'Europe', 'Europe de l’Est', 61.5, 105.3],
    ['USA', 'États-Unis', 'United States of America', 'Amérique', 'Amérique du Nord', 39.8, -98.6],
    ['CAN', 'Canada', 'Canada', 'Amérique', 'Amérique du Nord', 56.1, -106.3],
    ['BRA', 'Brésil', 'Brazil', 'Amérique', 'Amérique du Sud', -14.2, -51.9],
    ['ARG', 'Argentine', 'Argentina', 'Amérique', 'Amérique du Sud', -38.4, -63.6],
    ['MEX', 'Mexique', 'Mexico', 'Amérique', 'Amérique du Nord', 23.6, -102.5],
    ['CHN', 'Chine', 'China', 'Asie', 'Asie de l’Est', 35.9, 104.2],
    ['JPN', 'Japon', 'Japan', 'Asie', 'Asie de l’Est', 36.2, 138.3],
    ['KOR', 'Corée du Sud', 'South Korea', 'Asie', 'Asie de l’Est', 35.9, 127.8],
    ['IND', 'Inde', 'India', 'Asie', 'Asie du Sud', 20.6, 79.0],
    ['ARE', 'Émirats arabes unis', 'United Arab Emirates', 'Asie', 'Moyen-Orient', 23.4, 53.8],
    ['SAU', 'Arabie saoudite', 'Saudi Arabia', 'Asie', 'Moyen-Orient', 23.9, 45.1],
    ['QAT', 'Qatar', 'Qatar', 'Asie', 'Moyen-Orient', 25.4, 51.2],
    ['ISR', 'Israël', 'Israel', 'Asie', 'Moyen-Orient', 31.0, 34.9],
    ['IDN', 'Indonésie', 'Indonesia', 'Asie', 'Asie du Sud-Est', -0.8, 113.9],
    ['VNM', 'Viêt Nam', 'Vietnam', 'Asie', 'Asie du Sud-Est', 14.1, 108.3],
    ['AUS', 'Australie', 'Australia', 'Océanie', 'Océanie', -25.3, 133.8]
  ].map(function (r) {
    return { iso3: r[0], nom: r[1], en: r[2], continent: r[3], region: r[4], lat: r[5], lon: r[6] };
  });
  const paysIndex = {}; pays.forEach(function (p) { paysIndex[p.iso3] = p; });
  // La Côte d'Ivoire est le pays émetteur : exclue des pays partenaires.
  const partenaires = pays.filter(function (p) { return p.iso3 !== 'CIV'; });

  /* ======================= PÉRIODES ========================================
     16 trimestres consécutifs T1 2023 → T4 2026. T3 2026 est la période en
     cours (données partielles), T4 2026 n'est pas encore ouverte.           */
  const periodes = [];
  for (let y = 2023; y <= 2026; y++) {
    for (let t = 1; t <= 4; t++) {
      const id = y + '-T' + t;
      periodes.push({
        id: id, annee: y, trimestre: t,
        libelle: 'T' + t + ' ' + y,
        debut: new Date(Date.UTC(y, (t - 1) * 3, 1)),
        fin: new Date(Date.UTC(y, t * 3, 0)),
        consolide: (y < 2026) || (y === 2026 && t <= 2),
        encours: (y === 2026 && t === 3),
        ouverte: !(y === 2026 && t === 4)
      });
    }
  }
  const periodesOuvertes = periodes.filter(function (p) { return p.ouverte; });
  const pIndex = {}; periodes.forEach(function (p, i) { pIndex[p.id] = i; });

  /* Facteur de complétude : la période en cours ne porte qu'une fraction du
     volume trimestriel. Jamais additionnée aux consolidées sans mention.    */
  function completude(p) { return p.encours ? 0.42 : 1; }

  /* Tendance de fond, distincte par module, plus bruit trimestriel. */
  function tendance(i, pente) { return Math.pow(1 + pente, i / 4); }

  /* ======================= NOMENCLATURES =================================== */
  const domainesEtudes = ['Ingénierie', 'Santé', 'Sciences sociales', 'Agronomie', 'Numérique', 'Droit et administration'];
  const organisations = [
    { code: 'ONU', nom: 'Nations unies — Secrétariat', siege: 'USA' },
    { code: 'UNESCO', nom: 'UNESCO', siege: 'FRA' },
    { code: 'OMS', nom: 'Organisation mondiale de la santé', siege: 'CHE' },
    { code: 'PNUD', nom: 'Programme des Nations unies pour le développement', siege: 'USA' },
    { code: 'UA', nom: 'Union africaine', siege: 'ETH' },
    { code: 'CEDEAO', nom: 'CEDEAO', siege: 'NGA' },
    { code: 'BAD', nom: 'Banque africaine de développement', siege: 'CIV' },
    { code: 'FAO', nom: 'Organisation des Nations unies pour l’alimentation', siege: 'ITA' },
    { code: 'OMC', nom: 'Organisation mondiale du commerce', siege: 'CHE' },
    { code: 'UNICEF', nom: 'UNICEF', siege: 'USA' },
    { code: 'OIF', nom: 'Organisation internationale de la Francophonie', siege: 'FRA' },
    { code: 'BM', nom: 'Banque mondiale', siege: 'USA' }
  ];
  const domainesOI = ['Gouvernance', 'Santé publique', 'Économie et finances', 'Éducation', 'Environnement', 'Paix et sécurité'];
  const typesActe = [
    { code: 'LEG', nom: 'Légalisation de signature', cible: 5 },
    { code: 'VIS', nom: 'Visa diplomatique', cible: 7 },
    { code: 'NAT', nom: 'Certificat de nationalité', cible: 15 },
    { code: 'APO', nom: 'Apostille', cible: 4 },
    { code: 'AUT', nom: 'Attestation d’authenticité', cible: 10 },
    { code: 'TRA', nom: 'Transcription d’acte d’état civil', cible: 20 }
  ];
  const secteurs = ['Agro-industrie', 'Énergie', 'Infrastructures', 'Numérique', 'Mines', 'Tourisme', 'Santé', 'Logistique portuaire'];
  const stades = ['Prospection', 'Contact établi', 'Projet identifié', 'Négociation', 'Accord signé', 'Réalisé'];
  const domainesCoop = ['Économique et commercial', 'Culturel et éducatif', 'Sécurité et défense', 'Santé', 'Agriculture', 'Technique et scientifique'];
  const ministeres = ['Enseignement supérieur', 'Santé', 'Économie et finances', 'Agriculture', 'Numérique', 'Affaires étrangères', 'Défense'];

  /* ======================= FAITS — BOURSES =================================
     Grain : période × pays d'accueil × domaine × genre.
     Saisonnalité : pic aux T2/T3 (rentrées universitaires).                 */
  const saisonBourses = { 1: 0.62, 2: 1.34, 3: 1.28, 4: 0.76 };
  const paysAccueil = ['FRA', 'MAR', 'TUN', 'CHN', 'RUS', 'DZA', 'SEN', 'CAN', 'BEL', 'DEU', 'TUR', 'IND', 'JPN', 'KOR', 'USA', 'GBR', 'ITA', 'ESP', 'CHE', 'EGY', 'ZAF', 'GHA', 'ARE', 'BRA'];
  const poidsAccueil = {};
  paysAccueil.forEach(function (c, i) { poidsAccueil[c] = Math.max(0.12, 1.7 * Math.exp(-i / 5.2) * jitter(0.25)); });
  const bourses = [];
  periodesOuvertes.forEach(function (per, i) {
    paysAccueil.forEach(function (iso) {
      domainesEtudes.forEach(function (dom, di) {
        const poidsDom = [1.25, 1.1, 0.9, 0.85, 1.0, 0.7][di];
        ['F', 'H'].forEach(function (g) {
          // Parité proche de 1 mais dégradée en ingénierie et numérique.
          const biais = g === 'F' ? [0.72, 1.12, 1.08, 0.94, 0.78, 1.02][di] : 1;
          const base = 22 * poidsAccueil[iso] * poidsDom * biais
            * saisonBourses[per.trimestre] * tendance(i, 0.11) * jitter(0.22) * completude(per);
          const disponibles = Math.max(0, Math.round(base));
          const candidatures = Math.round(disponibles * (3.9 + R() * 2.6));
          const recevables = Math.round(candidatures * (0.62 + R() * 0.16));
          const preselection = Math.round(recevables * (0.34 + R() * 0.14));
          const attribuees = Math.min(disponibles, Math.round(preselection * (0.66 + R() * 0.2)));
          if (disponibles === 0) return;
          bourses.push({
            pid: per.id, iso3: iso, domaine: dom, genre: g,
            disponibles: disponibles, candidatures: candidatures, recevables: recevables,
            preselection: preselection, attribuees: attribuees,
            voie: R() < 0.38 ? 'Recrutement direct' : 'Dépôt de dossier au Ministère',
            ministere: pick(ministeres)
          });
        });
      });
    });
  });

  /* ======================= FAITS — POSTES EN ORGANISATIONS INTERNATIONALES */
  const postesOI = [];
  organisations.forEach(function (org, oi) {
    domainesOI.forEach(function (dom, di) {
      // Certaines cases sont structurellement vides : c'est l'information.
      const presence = ((oi * 7 + di * 5) % 11) / 11;
      periodesOuvertes.forEach(function (per, i) {
        const vacants = Math.max(0, Math.round((6 - oi * 0.32) * (1.3 - di * 0.1) * (0.5 + presence) * jitter(0.4) * tendance(i, 0.05) * completude(per)));
        if (vacants === 0) return;
        // Taux de candidature nationale : faible dans les niches non couvertes.
        const couverture = presence < 0.25 ? R() * 0.18 : 0.3 + R() * 0.6;
        const candidatures = Math.round(vacants * couverture * (1.4 + R()));
        const pourvus = Math.round(candidatures * (0.06 + R() * 0.16));
        const echeance = new Date(per.fin.getTime() + ri(10, 160) * 864e5);
        postesOI.push({
          pid: per.id, org: org.code, domaine: dom, vacants: vacants,
          candidatures: candidatures, candidaturesF: Math.round(candidatures * (0.3 + R() * 0.28)),
          pourvus: pourvus, echeance: echeance,
          grade: pick(['P2', 'P3', 'P4', 'P5', 'D1']),
          lieu: paysIndex[org.siege].nom
        });
      });
    });
  });

  /* ======================= FAITS — ACTES ADMINISTRATIFS ====================
     Grain : période × pays émetteur × type d'acte.
     Convention : un acte est compté à sa DATE DE DÉPÔT, pas de sortie.
     Saisonnalité : pic estival T3.                                          */
  const saisonActes = { 1: 0.82, 2: 1.0, 3: 1.28, 4: 0.9 };
  const emetteurs = ['FRA', 'USA', 'CAN', 'BEL', 'ITA', 'ESP', 'DEU', 'GBR', 'MAR', 'TUN', 'CHN', 'ARE', 'SEN', 'GHA', 'BFA', 'MLI', 'NGA', 'CMR', 'GAB', 'ZAF', 'TUR', 'CHE', 'PRT', 'BRA', 'JPN', 'QAT', 'SAU', 'IND', 'AUS', 'RUS'];
  const poidsEmet = {};
  emetteurs.forEach(function (c, i) { poidsEmet[c] = Math.max(0.1, 2.2 * Math.exp(-i / 6.5) * jitter(0.28)); });
  function quantiles(cible, dispersion) {
    // Distribution log-normale des délais, asymétrique à droite : quelques
    // dossiers bloqués tirent la moyenne mais pas la médiane.
    const med = cible * (0.72 + R() * 0.75);
    const s = dispersion;
    return {
      min: Math.max(1, Math.round(med * 0.42)),
      q1: Math.round(med * (0.72 - s * 0.05)),
      p50: Math.round(med),
      q3: Math.round(med * (1.42 + s * 0.1)),
      p90: Math.round(med * (2.1 + s * 0.5)),
      max: Math.round(med * (3.3 + s))
    };
  }
  const actes = [];
  const stockCourant = {};
  periodesOuvertes.forEach(function (per, i) {
    emetteurs.forEach(function (iso) {
      typesActe.forEach(function (ta, ti) {
        const poidsT = [1.6, 0.9, 0.7, 1.1, 0.6, 0.5][ti];
        const recus = Math.max(0, Math.round(90 * poidsEmet[iso] * poidsT * saisonActes[per.trimestre] * tendance(i, 0.14) * jitter(0.2) * completude(per)));
        if (recus === 0) return;
        const k = iso + ta.code;
        const stockAvant = stockCourant[k] || Math.round(recus * 0.3);
        // Capacité de traitement légèrement inférieure aux entrées en pic.
        const capacite = recus * (0.86 + R() * 0.3);
        const traites = Math.round(Math.min(stockAvant + recus, capacite));
        stockCourant[k] = stockAvant + recus - traites;
        const q = quantiles(ta.cible, R());
        actes.push({
          pid: per.id, iso3: iso, type: ta.code, typeNom: ta.nom, cible: ta.cible,
          recus: recus, traites: traites, stock: stockCourant[k],
          q: q, dansDelai: Math.round(traites * Math.max(0.25, Math.min(0.98, 1 - (q.p50 / ta.cible - 0.7) * 0.6)))
        });
      });
    });
  });

  /* ======================= FAITS — DIPLOMATIE ÉCONOMIQUE ===================
     Grain : projet. Les montants ANNONCÉS et les projets en négociation ne
     sont jamais additionnés aux montants SIGNÉS.                            */
  const partenairesEco = ['CHN', 'FRA', 'ARE', 'TUR', 'IND', 'MAR', 'USA', 'DEU', 'ITA', 'JPN', 'KOR', 'QAT', 'SAU', 'BRA', 'ZAF', 'GBR', 'CAN', 'BEL', 'VNM', 'IDN', 'RUS', 'ESP'];
  const entreprises = ['Groupe portuaire', 'Consortium énergétique', 'Fonds souverain', 'Groupe agro-alimentaire', 'Opérateur télécom', 'Société minière', 'Groupe hôtelier', 'Constructeur ferroviaire', 'Laboratoire pharmaceutique', 'Plateforme logistique'];
  const projets = [];
  for (let n = 0; n < 430; n++) {
    const iso = pick(partenairesEco);
    const secteur = pick(secteurs);
    const per = periodesOuvertes[ri(0, periodesOuvertes.length - 1)];
    const stade = stades[Math.min(5, Math.floor(Math.pow(R(), 0.85) * 6))];
    const annonce = Math.round((12 + Math.pow(R(), 2.1) * 340)) * 1e6;
    const avance = stades.indexOf(stade) >= 4;
    projets.push({
      id: 'PRJ-' + (1000 + n),
      pid: per.id, iso3: iso, secteur: secteur, stade: stade,
      partenaire: pick(entreprises) + ' ' + paysIndex[iso].nom,
      montantAnnonce: annonce,
      montantSigne: avance ? Math.round(annonce * (0.45 + R() * 0.5)) : 0,
      mission: R() < 0.72,
      date: new Date(per.debut.getTime() + ri(0, 80) * 864e5)
    });
  }

  /* ======================= FAITS — RELATIONS BILATÉRALES =================== */
  const accords = [];
  const partenairesBil = partenaires.filter(function () { return R() < 0.82; });
  partenairesBil.forEach(function (p) {
    const n = 2 + Math.floor(Math.pow(R(), 1.4) * 8);
    for (let k = 0; k < n; k++) {
      const per = periodes[ri(0, 14)];
      const dureeAns = pick([3, 5, 5, 10]);
      const signature = new Date(per.debut.getTime() + ri(0, 80) * 864e5);
      const echeance = new Date(signature.getTime() + dureeAns * 365.25 * 864e5);
      accords.push({
        id: 'ACC-' + p.iso3 + '-' + k,
        pid: per.id, iso3: p.iso3, domaine: pick(domainesCoop),
        intitule: 'Accord de coopération ' + pick(domainesCoop).toLowerCase(),
        signature: signature, echeance: echeance,
        statut: echeance < new Date(2026, 7, 11) ? 'Échu' : 'En vigueur',
        typeCoop: pick(['Bilatérale', 'Triangulaire', 'Sud-Sud'])
      });
    }
  });
  // Commissions mixtes : concentration en fin d'année (T4).
  const commissions = [];
  partenairesBil.forEach(function (p) {
    const n = ri(0, 3);
    for (let k = 0; k < n; k++) {
      const cand = periodes.filter(function (q) { return q.ouverte && (q.trimestre === 4 ? R() < 0.75 : R() < 0.22); });
      if (!cand.length) continue;
      const per = pick(cand);
      commissions.push({
        pid: per.id, iso3: p.iso3, session: ri(1, 12) + 'ᵉ session',
        date: new Date(per.debut.getTime() + ri(0, 80) * 864e5),
        lieu: R() < 0.5 ? 'Abidjan' : paysIndex[p.iso3].nom
      });
    }
  });

  /* ======================= FORMATS fr-FR =================================== */
  const NBSP = ' '; // espace fine insécable
  function nombre(v, dec) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    const s = (dec ? Number(v).toFixed(dec) : Math.round(v).toString());
    const parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return parts.join(',');
  }
  function pourcent(v, dec) { return nombre(v, dec === undefined ? 1 : dec) + NBSP + '%'; }
  function montant(v) {
    if (v >= 1e9) return nombre(v / 1e9, 1) + NBSP + 'Md FCFA';
    if (v >= 1e6) return nombre(v / 1e6, 0) + NBSP + 'M FCFA';
    return nombre(v) + NBSP + 'FCFA';
  }
  function dateCourte(d) {
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  /* ======================= AGRÉGATION ======================================
     Toutes les vues passent par ici : un total est toujours la somme des
     lignes de fait retenues par le filtre, jamais une valeur écrite.        */
  function rangePeriodes(granularite, ancre) {
    const idx = pIndex[ancre];
    const n = { mois: 1, trimestre: 1, semestre: 2, annee: 4, triennal: 12 }[granularite] || 1;
    const debut = Math.max(0, idx - n + 1);
    return periodes.slice(debut, idx + 1).map(function (p) { return p.id; });
  }
  function comparaison(granularite, ancre, mode) {
    const ids = rangePeriodes(granularite, ancre);
    const n = ids.length;
    const first = pIndex[ids[0]];
    if (mode === 'n1') {
      const d = Math.max(0, first - 4);
      return periodes.slice(d, d + n).map(function (p) { return p.id; });
    }
    const d = Math.max(0, first - n);
    return periodes.slice(d, d + n).map(function (p) { return p.id; });
  }
  function matchFiltres(row, f) {
    if (!f) return true;
    if (f.continent && row.iso3 && paysIndex[row.iso3] && paysIndex[row.iso3].continent !== f.continent) return false;
    if (f.iso3 && row.iso3 !== f.iso3) return false;
    if (f.domaine && row.domaine !== f.domaine) return false;
    if (f.secteur && row.secteur !== f.secteur) return false;
    if (f.genre && row.genre !== f.genre) return false;
    if (f.org && row.org !== f.org) return false;
    if (f.type && row.type !== f.type) return false;
    return true;
  }
  function slice(table, ids, f) {
    const set = {}; ids.forEach(function (i) { set[i] = 1; });
    return table.filter(function (r) { return set[r.pid] && matchFiltres(r, f); });
  }
  function somme(rows, champ) {
    return rows.reduce(function (a, r) { return a + (r[champ] || 0); }, 0);
  }
  function medianePonderee(rows, champQ, poids) {
    // P50 et P90 recomposés à partir des quantiles par ligne, pondérés par
    // le volume traité : la moyenne des médianes seule serait fausse.
    let tot = 0, acc50 = 0, acc90 = 0;
    rows.forEach(function (r) {
      const w = r[poids] || 0; tot += w;
      acc50 += r[champQ].p50 * w; acc90 += r[champQ].p90 * w;
    });
    return tot ? { p50: acc50 / tot, p90: acc90 / tot } : { p50: 0, p90: 0 };
  }
  function variation(courant, precedent) {
    if (!precedent) return null;
    return { pct: ((courant - precedent) / precedent) * 100, abs: courant - precedent, base: precedent };
  }

  /* ======================= SEUILS D'ALERTE (objet unique modifiable) ======= */
  const seuils = {
    variationNotable: 20,       // % d'écart sur un KPI de tête
    concentration: 40,          // % d'un total détenu par une seule entité
    echeanceJours: 90,          // accord ou poste expirant sous N jours
    dormanceMois: 24,           // partenariat sans commission mixte depuis N mois
    ruptureTendance: 3          // périodes consécutives d'inversion de pente
  };

  window.MAECI = {
    pays: pays, paysIndex: paysIndex, partenaires: partenaires,
    periodes: periodes, periodesOuvertes: periodesOuvertes, pIndex: pIndex,
    domainesEtudes: domainesEtudes, organisations: organisations, domainesOI: domainesOI,
    typesActe: typesActe, secteurs: secteurs, stades: stades,
    domainesCoop: domainesCoop, ministeres: ministeres,
    bourses: bourses, postesOI: postesOI, actes: actes, projets: projets,
    accords: accords, commissions: commissions,
    seuils: seuils,
    fmt: { nombre: nombre, pourcent: pourcent, montant: montant, date: dateCourte, NBSP: NBSP },
    agg: {
      rangePeriodes: rangePeriodes, comparaison: comparaison, slice: slice,
      somme: somme, medianePonderee: medianePonderee, variation: variation
    },
    /* Dictionnaire des indicateurs — identique partout, affiché en infobulle */
    dico: {
      attribution: { nom: "Taux d'attribution", def: 'Bourses attribuées ÷ bourses disponibles sur la période.' },
      selectivite: { nom: 'Ratio de sélectivité', def: 'Candidatures recevables ÷ bourses disponibles.' },
      parite: { nom: 'Indice de parité', def: 'Candidates femmes ÷ candidats hommes. 1,00 = parité stricte.' },
      couverture: { nom: 'Taux de couverture', def: 'Postes ayant reçu au moins une candidature nationale ÷ postes vacants.' },
      delai: { nom: 'Délai de traitement', def: 'Jours ouvrés entre dépôt recevable et mise à disposition. Publié en P50 et P90.' },
      respect: { nom: 'Taux de respect du délai', def: 'Actes traités dans le délai cible ÷ actes traités.' },
      concretisation: { nom: 'Taux de concrétisation', def: 'Montant signé ÷ montant annoncé, cohorte à 24 mois.' },
      dormant: { nom: 'Partenariat dormant', def: 'Pays sans commission mixte depuis plus de 24 mois.' }
    }
  };
})();
