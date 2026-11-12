'use strict';
/* =====================================================================
   CLASSEMENT EN LIGNE ENTRE AMIS (facultatif)
   Fonctionne avec un projet Supabase gratuit (base de données hébergée). Tant que ONLINE.url et
   ONLINE.key sont vides, le classement en ligne est simplement désactivé (le jeu marche hors ligne).
   Mise en place : voir README.md, section « Classement en ligne ».
   - Chaque joueur choisit un « code de groupe » (Succès → Classement en ligne), le même pour tous les amis.
   - À la fin de chaque partie, le score est envoyé avec le pseudo, la vague, le personnage et la carte.
   - Le classement affiche les 20 meilleurs scores du groupe.
   La clé « anon » de Supabase est publique par nature : elle ne permet que ce que les règles (RLS) autorisent.
   ===================================================================== */
const ONLINE = {
  url: '',   // ex. 'https://abcdefgh.supabase.co'
  key: '',   // clé « anon public » du projet (Project Settings → API)
  table: 'scores',
};

const Online = {
  cache: {},
  enabled() { return !!(ONLINE.url && ONLINE.key); },
  /** Code de groupe : lettres, chiffres et tirets, 3 à 24 caractères */
  group() { return (Save.data.settings.group || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24); },
  headers() { return { apikey: ONLINE.key, Authorization: `Bearer ${ONLINE.key}`, 'Content-Type': 'application/json' }; },

  /** Envoie le score d'une partie (silencieux en cas d'échec : pas de réseau, pas configuré…) */
  async submit(entry) {
    const grp = this.group();
    if (!this.enabled() || grp.length < 3) return false;
    const row = {
      group_code: grp, name: Cosmetics.playerName().slice(0, 16), score: Math.round(entry.score) || 0, wave: entry.wave || 0,
      kills: entry.kills || 0, char: entry.char || '', map: (typeof MAP !== 'undefined' && MAP.id) || '', win: !!entry.win, prestige: Progress.prestige(),
    };
    try {
      const r = await fetch(`${ONLINE.url}/rest/v1/${ONLINE.table}`, { method: 'POST', headers: Object.assign(this.headers(), { Prefer: 'return=minimal' }), body: JSON.stringify(row) });
      delete this.cache[grp];
      return r.ok;
    } catch (e) { return false; }
  },

  /** 20 meilleurs scores du groupe (mis en cache 30 s) */
  async top(grp = this.group()) {
    if (!this.enabled() || grp.length < 3) return null;
    const c = this.cache[grp];
    if (c && Date.now() - c.t < 30000) return c.rows;
    try {
      const q = `select=name,score,wave,char,map,win,prestige,created_at&group_code=eq.${encodeURIComponent(grp)}&order=score.desc&limit=20`;
      const r = await fetch(`${ONLINE.url}/rest/v1/${ONLINE.table}?${q}`, { headers: this.headers() });
      if (!r.ok) { this.cache[grp] = { t: Date.now(), rows: [], error: `Erreur du serveur (${r.status})` }; return null; }
      const rows = await r.json();
      this.cache[grp] = { t: Date.now(), rows };
      return rows;
    } catch (e) { this.cache[grp] = { t: Date.now(), rows: [], error: 'Pas de connexion' }; return null; }
  },
};
