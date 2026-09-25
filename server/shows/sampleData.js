/*
 * sampleData.js — données de démonstration (ligue fictive + petit simulateur d'événements).
 * Sert uniquement à la démo et aux tests : dans le jeu, ces données viennent du moteur (voir
 * server/showsAdapter.js pour l'adaptateur RÉEL utilisé en production).
 *
 * Copié tel quel depuis le livrable du prestataire (hoop-shows/demo/sampleData.js, voir
 * INTEGRATION.md : "le reste se copie tel quel") — seul le chemin de require ci-dessous a été
 * adapté (demo/ et src/ étaient deux dossiers frères dans le zip livré, sampleData.js vit ici
 * directement à côté de showData.js). Utilisé par server/hoop_shows_test.js pour rejouer, en
 * style projet, les tests de démo/déterminisme livrés avec le pack (voir DEV_NOTES.md point 11).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./showData'));
  else root.HoopSampleData = factory(root.HoopShowData);
})(typeof self !== 'undefined' ? self : this, function (ShowData) {
  'use strict';

  const TEAMS = [
    ['cer', 'Cerberus Basketball Team', 'Cerberus'], ['san', 'Santo Aleixo', 'Santo Aleixo'],
    ['var', 'Olympique Varenne', 'Varenne'], ['atl', 'Atlas Montreuil', 'Atlas'],
    ['nor', 'Nordhaven BC', 'Nordhaven'], ['por', 'Porto Celeste', 'Porto'],
    ['kin', 'Kingsbridge', 'Kingsbridge'], ['lum', 'Lumière Lyon', 'Lumière'],
    ['ste', 'Union Sainte-Marthe', 'Sainte-Marthe'], ['val', 'Vallée d’Or', 'Vallée d’Or'],
    ['red', 'Red Harbor', 'Red Harbor'], ['riv', 'Riverside Hawks', 'Riverside'],
  ];
  const FIRST = ['D.', 'L.', 'K.', 'T.', 'O.', 'R.', 'J.', 'M.', 'P.', 'N.', 'A.', 'F.', 'S.', 'B.', 'C.', 'E.'];
  const LAST = ['Moreau', 'Ferreira', 'Mbaye', 'Lindqvist', 'Adeyemi', 'Costa', 'Almeida', 'Duarte', 'Sousa', 'Okoro', 'Petit', 'Rocha', 'Novak', 'Fontaine', 'Keller', 'Diallo', 'Rossi', 'Bernard', 'Leroy', 'Martin', 'Garnier', 'Traoré', 'Hansen', 'Varga', 'Silva', 'Brunet', 'Kowalski', 'Nakamura', 'Ortega', 'Lambert', 'Ibrahim', 'Weber', 'Marchand', 'Dubois', 'Nguyen', 'Castro', 'Laurent', 'Morel', 'Ruiz', 'Schmidt', 'Pereira', 'Girard', 'Boyer', 'Chevalier', 'Mendes', 'Roux', 'Faure', 'André'];
  const POS = ['MEN', 'ARR', 'AIL', 'AF', 'PIV', 'MEN', 'AIL', 'PIV'];

  function build(seed) {
    const rnd = ShowData.seeded('sample|' + (seed || 1));
    const teams = {}, players = {}, roster = {};
    let n = 0;
    TEAMS.forEach(([id, name, short]) => {
      teams[id] = { name, short };
      roster[id] = [];
      for (let i = 0; i < 8; i++) {
        const pid = id + '-' + i;
        const star = i < 5 ? 1 : 0.55;
        players[pid] = {
          name: FIRST[(n * 7 + i) % FIRST.length] + ' ' + LAST[n % LAST.length], pos: POS[i], teamId: id,
          season: { pts: +(star * (7 + rnd() * 11)).toFixed(1), ast: +(star * (POS[i] === 'MEN' ? 4 + rnd() * 4 : 0.5 + rnd() * 3)).toFixed(1), reb: +(star * (POS[i] === 'PIV' || POS[i] === 'AF' ? 5 + rnd() * 5 : 1.5 + rnd() * 3)).toFixed(1), tpPct: Math.round(28 + rnd() * 16), tov: +(0.8 + rnd() * 2.5).toFixed(1) },
        };
        roster[id].push(pid);
        n++;
      }
    });
    // Donner des noms reconnaissables au match de démo
    Object.assign(players['cer-0'], { name: 'D. Moreau' }); Object.assign(players['san-0'], { name: 'R. Costa' });
    Object.assign(players['cer-4'], { name: 'O. Adeyemi' }); Object.assign(players['san-4'], { name: 'N. Okoro' });

    const pairs = [['cer', 'san'], ['var', 'atl'], ['nor', 'por'], ['kin', 'lum'], ['ste', 'val'], ['red', 'riv']];
    const fixtures = pairs.map(([h, a], i) => ({ id: 'm' + (i + 1), homeId: h, awayId: a }));
    const standings = [
      ['var', 10, 1], ['atl', 9, 2], ['cer', 8, 3], ['ste', 7, 4], ['kin', 6, 5], ['val', 6, 5],
      ['por', 5, 6], ['san', 5, 6], ['lum', 4, 7], ['nor', 3, 8], ['red', 2, 9], ['riv', 1, 10],
    ].map(([teamId, w, l]) => ({ teamId, w, l }));
    const form = {};
    TEAMS.forEach(([id]) => { form[id] = Array.from({ length: 5 }, () => (rnd() < 0.5 ? 'V' : 'D')); });
    const headToHead = [{ day: 1, homeId: 'san', awayId: 'cer', homeScore: 78, awayScore: 71 }];
    const lineups = {};
    TEAMS.forEach(([id]) => { lineups[id] = roster[id].slice(0, 5); });
    const absents = [{ playerId: 'cer-7', teamId: 'cer', reason: 'blessé (cheville)' }, { playerId: 'san-6', teamId: 'san', reason: 'suspendu' }];

    function simulate(fx, idx) {
      const r = ShowData.seeded('match|' + seed + '|' + fx.id);
      const events = [];
      const play = (q, teamId, oppId, dir) => {
        const five = lineups[teamId];
        const shooter = five[Math.floor(r() * 5)];
        if (r() < 0.12) { events.push({ q, type: 'turnover', teamId, playerId: shooter }); return; }
        if (r() < 0.09) {
          const fouler = lineups[oppId][Math.floor(r() * 5)];
          events.push({ q, type: 'foul', teamId: oppId, playerId: fouler });
          for (let k = 0; k < 2; k++) events.push({ q, type: 'ft', teamId, playerId: shooter, made: r() < 0.74 });
          return;
        }
        const three = r() < 0.36;
        const ang = (r() * 160 - 80) * Math.PI / 180;
        const dist = three ? 150 + r() * 25 : 10 + r() * 120;
        const bx = dir > 0 ? 20 : 580;
        let x = bx + dir * Math.cos(ang) * dist, y = 150 + Math.sin(ang) * dist;
        x = Math.min(592, Math.max(8, x)); y = Math.min(292, Math.max(8, y));
        const made = r() < (three ? 0.35 : 0.5);
        const ev = { q, type: 'shot', teamId, playerId: shooter, pts: three ? 3 : 2, made, x: +(x / 600).toFixed(3), y: +(y / 300).toFixed(3) };
        if (made && r() < 0.6) ev.assistId = five.filter((p) => p !== shooter)[Math.floor(r() * 4)];
        events.push(ev);
        if (!made) {
          const offReb = r() < 0.28;
          const rt = offReb ? teamId : oppId;
          events.push({ q, type: 'rebound', teamId: rt, playerId: lineups[rt][3 + Math.floor(r() * 2)] });
        }
      };
      for (let q = 1; q <= 4; q++) {
        for (let k = 0; k < 19; k++) { play(q, fx.homeId, fx.awayId, 1); play(q, fx.awayId, fx.homeId, -1); }
        if (q === 2 && idx === 4) {
          // Démo : un match à égalité parfaite à la mi-temps (Sainte-Marthe – Vallée d'Or)
          const b = ShowData.boxScore({ homeId: fx.homeId, awayId: fx.awayId, events }, { toQuarter: 2 });
          let d = b.teams[fx.homeId].pts - b.teams[fx.awayId].pts;
          const trail = d > 0 ? fx.awayId : fx.homeId;
          d = Math.abs(d);
          while (d >= 2) { events.push({ q: 2, type: 'shot', teamId: trail, playerId: lineups[trail][0], pts: 2, made: true, x: trail === fx.homeId ? 0.06 : 0.94, y: 0.5 }); d -= 2; }
          if (d === 1) events.push({ q: 2, type: 'ft', teamId: trail, playerId: lineups[trail][1], made: true });
        }
      }
      return { id: fx.id, homeId: fx.homeId, awayId: fx.awayId, events };
    }
    const matches = fixtures.map(simulate);
    return { leagueId: 'demo', day: 12, myTeamId: 'cer', teams, players, fixtures, standings, form, headToHead, lineups, absents, matches };
  }

  return { build };
});
