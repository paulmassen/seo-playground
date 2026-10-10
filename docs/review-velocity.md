# Spec — Review Velocity (benchmark concurrentiel des avis Google)

> Statut : **lot 1 implémenté** (benchmark à la demande, rapport comparatif, export PDF/Excel). Lots 2 et 3 à faire.
>
> Décisions prises : interface et rapport **entièrement en anglais** · **10 fiches max** par analyse · fenêtre fixe de 3 mois ·
> premier passage à 100 avis puis **une relance automatique** si les 3 mois ne sont pas couverts · pondération du score du §5.2 ·
> seuil de 3 avis négatifs (au lieu de 5) pour le taux de réponse aux avis négatifs.
>
> Fichiers : `src/lib/review-velocity.ts` (calendrier, couverture, profondeur), `src/lib/review-report.ts` (critères, rangs, score, synthèse),
> `src/lib/review-report-pdf.ts` (sections PDF), `src/lib/review-velocity-db.ts` (tables `rv_*` créées à la première utilisation),
> `src/lib/review-velocity-tasks.ts` (post/collecte/relance), `src/lib/review-velocity-discovery.ts` (Maps SERP),
> `src/app/dashboard/review-velocity/*` (page, actions, création sur carte, onglets Overview/Report/Data).
> Le critère 17 (position Maps) est déjà inclus. Les blocs PDF génériques (`drawTable`, `drawLineChart`, `drawBarChart`,
> `drawParagraphs`) et les options `orientation`/`kicker`/`label`/`locale` de `ReportPdfExportButton` sont réutilisables.
> Périmètre : nouvelle vue dans la section *Business*, à côté de *Google Reviews*.

## 1. Objectif

Comparer le **rythme d'acquisition d'avis Google** (« review velocity ») d'une fiche avec celui de ses concurrents locaux :
combien de **nouveaux avis par semaine et par mois**, la tendance, et l'effort à fournir pour rattraper ou distancer chacun.

Livrable principal : un **rapport comparatif** qui classe les fiches sur plusieurs critères (vélocité, taux de
réponse, note récente…) et qui s'exporte en **PDF** (§5).

Question à laquelle l'écran doit répondre en 5 secondes :
*« Est-ce que je prends des avis plus vite ou moins vite que les concurrents qui comptent, et de combien ? »*

## 2. Parcours utilisateur

1. **Définir le marché** : saisir un mot-clé métier (`plombier`, `pizzeria`…) et choisir une **zone sur la carte**
   (clic = centre, curseur = rayon en km, cercle dessiné sur la carte).
2. **Découvrir les fiches** : bouton *Find listings* → recherche Google Maps sur la zone ; les fiches apparaissent
   en liste **et** en marqueurs numérotés sur la carte (note, nombre d'avis, catégorie, distance au centre).
   Les fiches hors du cercle sont grisées (filtrage local par lat/lng).
3. **Sélectionner** : cocher les fiches à suivre (max 10 par défaut), désigner **« My listing »** (bouton radio,
   optionnel mais recommandé — c'est la référence des comparaisons). Possibilité d'ajouter une fiche absente
   des résultats via la recherche par nom existante (`/api/business-search`).
4. **Lancer** : fenêtre d'analyse **fixée à 3 mois** (pas de réglage), **coût maximal estimé** affiché avant
   validation → *Start analysis*. Le benchmark est enregistré.
5. **Consulter** le tableau de bord (§7) dès que les tâches DataForSEO reviennent (file standard : jusqu'à 45 min).
6. **Suivre dans le temps** : planification hebdomadaire (jour + heure + fuseau) ou *Refresh now*.

## 3. Stratégie de données — hybride

### 3.0 Fenêtre d'analyse : 3 mois
- **Date de coupure** = 1er jour du 3e mois complet précédent (ex. le 15 août → 1er mai), dans le fuseau du benchmark.
  On couvre ainsi 3 mois complets, le mois en cours et au moins 13 semaines ISO complètes.
- **L'API n'accepte pas de filtre par date** : `reviews/task_post` (comme `extended_reviews`) ne prend que
  `keyword | cid | place_id`, la localisation, la langue, `depth`, `sort_by`, `priority` et `tag`. Elle ne gère pas
  non plus la pagination ou l'offset. On combine donc `sort_by: "newest"` et une `depth` dimensionnée, et c'est
  nous qui coupons à la date.

### 3.1 Reconstruction historique (backfill, au lancement)
- Pour chaque fiche : `business_data/google/reviews/task_post` avec **`cid`** (pas de `keyword` → pas d'ambiguïté
  de nom), `sort_by: "newest"`, `depth: 100` (multiple de 10).
- Chaque avis porte un `timestamp` UTC exact (`"2019-11-15 12:57:46 +00:00"`) et un `review_id` unique
  → on agrège par semaine / mois **immédiatement**, sans attendre des semaines de suivi.
- **Arrêt / relance** au retour de la tâche :
  - plus ancien avis reçu **antérieur à la coupure**, ou `items_count < depth` (plus d'avis disponibles) → fenêtre couverte, terminé ;
  - sinon, la fiche reçoit plus de 100 avis en 3 mois → **une seule relance** avec
    `depth = ceil10(items_count × durée_fenêtre / durée_couverte × 1.2)`, plafonnée à 4 490.
    Faute d'offset, la relance re-facture les 100 premiers avis (≤ 0,0075 $ de surcoût par fiche concernée).
- Les avis antérieurs à la coupure, déjà payés, sont stockés mais exclus des calculs de la vue.
- Dans la majorité des cas (commerce local < 100 avis par trimestre), un seul passage suffit.

### 3.2 Rafraîchissement incrémental (planifié)
- Même endpoint, `sort_by: "newest"`, avec une **profondeur adaptative** :
  `depth = clamp(ceil10(vélocité_hebdo × semaines_depuis_dernier_fetch × 1.5 + 10), 10, 1000)`.
- Fusion par `review_id` (upsert) → pas de doublons.
- **Contrôle de recouvrement** : le lot rafraîchi doit contenir au moins un `review_id` déjà connu
  (ou un avis plus ancien que le plus récent stocké). Sinon il y a un **trou** : on relance une tâche avec
  `depth × 4` (borné), et si le trou persiste on le marque comme période non couverte.

### 3.3 Snapshots du total
- Chaque résultat de tâche avis contient `reviews_count` et `rating` (total affiché par Google) → une ligne de
  snapshot par fiche et par fetch. La découverte Maps fournit aussi `rating.votes_count` pour toutes les fiches
  (snapshot gratuit au passage).
- Sert à calculer la **variation nette du total** entre deux relevés et à la confronter aux avis datés :
  `avis publiés sur la période − Δ total ≈ avis supprimés/filtrés par Google` (signal intéressant : faux avis purgés).

### 3.4 Couverture (point critique de justesse)
On ne doit **jamais afficher 0** pour une période qu'on n'a simplement pas récupérée.
- Si `items_count < depth` (ou `items_count ≥ reviews_count`) → historique **complet**, couvert depuis le 1er avis.
- Sinon → couverture à partir du plus ancien avis récupéré ; on ne garde que les **périodes complètes** après lui
  (lundi suivant pour les semaines, 1er du mois suivant pour les mois). Les périodes antérieures sont affichées
  « non couvert » (gris hachuré), pas 0.
- Une fiche dont la couverture reste plus courte que les 3 mois après la relance (plafond de 4 490 avis atteint)
  est signalée par un badge (*Partial · 7 wk*).

## 4. Définitions des métriques

Toutes calculées dans un module pur `src/lib/review-velocity.ts` (testé), à partir des avis stockés.

| Métrique | Définition |
|---|---|
| **Semaine** | Semaine ISO (lundi → dimanche) dans le fuseau du benchmark (défaut : fuseau du navigateur à la création, ex. `Europe/Paris`). |
| **Mois** | Mois calendaire dans ce même fuseau. |
| **Période en cours** | Exclue des moyennes ; affichée à part (« en cours ») avec un rythme projeté = `compte / fraction écoulée`. |
| `last7d` / `last30d` | Avis publiés sur les 7 / 30 derniers jours glissants. |
| `avgPerWeek` | Moyenne sur les **12 dernières semaines complètes** couvertes. |
| `avgPerMonth` | Moyenne sur les **3 derniers mois complets** couverts. |
| `trend` | `(4 dernières semaines complètes − 4 précédentes) / 4 précédentes`, en %. `null` si couverture insuffisante ou base nulle. |
| `newRating` | Note moyenne des avis de la fenêtre (vs note globale → la fiche s'améliore-t-elle ?). |
| `replyRate` | % d'avis de la fenêtre avec `owner_answer`. |
| `netDelta` | Δ du total Google entre le premier et le dernier snapshot de la fenêtre (cf. 3.3). |
| `gapPerMonth` | `avgPerMonth(concurrent) − avgPerMonth(moi)`. |
| `catchUpMonths` | Mois pour rattraper le total du concurrent au rythme actuel : `(total_c − total_moi) / (avgPerMonth_moi − avgPerMonth_c)` si dénominateur > 0, sinon « jamais au rythme actuel ». |

## 5. Rapport comparatif (cœur de la fonctionnalité)

L'objectif est de **classer les fiches sur plusieurs critères** et de situer « My listing » sur chacun, puis de
résumer le tout dans un rapport consultable à l'écran et **exportable en PDF**.

### 5.1 Critères classés

Chaque critère produit un rang 1…N (ex æquo = même rang). ↑ = plus haut est meilleur, ↓ = plus bas est meilleur.
Fenêtre : les 3 mois définis en §3.0.

| # | Axe | Critère | Calcul | Sens |
|---|---|---|---|---|
| 1 | Dynamique | **Avis / semaine (4 dernières semaines)** | moyenne des 4 dernières semaines ISO complètes | ↑ |
| 2 | Dynamique | Avis / mois | moyenne des 3 derniers mois complets | ↑ |
| 3 | Dynamique | Momentum | 4 dernières semaines vs 4 précédentes, en % | ↑ |
| 4 | Dynamique | Régularité | % des 13 dernières semaines avec au moins 1 avis (récompense le flux continu plutôt que les pics) | ↑ |
| 5 | Dynamique | Fraîcheur | jours depuis le dernier avis | ↓ |
| 6 | Dynamique | Part de voix des avis | part de la fiche dans le total des nouveaux avis du marché sur 3 mois | ↑ |
| 7 | Satisfaction | Note récente | note moyenne des avis des 3 mois | ↑ |
| 8 | Satisfaction | Évolution de la note | note récente − note globale Google (la fiche s'améliore-t-elle ?) | ↑ |
| 9 | Satisfaction | Avis négatifs récents | % d'avis ≤ 3★ sur 3 mois | ↓ |
| 10 | Engagement | **Taux de réponse du propriétaire** | % d'avis avec `owner_answer`, calculé sur les avis publiés **il y a plus de 7 jours** (pour ne pas pénaliser une réponse pas encore faite) | ↑ |
| 11 | Engagement | Réponse aux avis négatifs | même calcul restreint aux avis ≤ 3★ (ce que les prospects lisent en premier) | ↑ |
| 12 | Engagement | Délai de réponse médian | médiane de `owner_timestamp − timestamp` | ↓ |
| 13 | Richesse | Avis avec texte | % d'avis non vides, avec la longueur médiane en info | ↑ |
| 14 | Richesse | Avis avec photos | % d'avis avec `images` | ↑ |
| 15 | Richesse | Local Guides | % d'avis rédigés par des Local Guides | ↑ |
| 16 | Acquis | Total d'avis / note affichée | dernier snapshot Google | ↑ |
| 17 | Acquis | Position Maps | rang de la fiche dans la recherche de découverte (mot-clé + zone) : met la visibilité en regard de la vélocité | ↓ |

**Règles de robustesse**
- Taux et moyennes (critères 7 à 15) : il faut **au moins 5 avis** dans la fenêtre, sinon `n/a`. Une fiche `n/a` est
  affichée en fin de classement sur ce critère, et le poids du critère est redistribué dans son score global
  (elle n'est donc pas pénalisée deux fois).
- Fiche à couverture partielle : rang calculé quand même, avec un marqueur ⚠ et une note en méthodologie.

**Signaux informatifs, non classés et exclus du score** (à formuler comme « à examiner », jamais comme une accusation) :
- pics anormaux : semaine > moyenne + 3σ ;
- part d'auteurs n'ayant publié qu'un seul avis (`reviews_count` de l'auteur = 1) ;
- avis disparus : écart entre les snapshots du total et les avis datés (§3.3, lot 2) ;
- langues des avis (`original_language`) : utile pour une clientèle touristique.

### 5.2 Score global

- Score par critère = normalisation min-max sur les fiches du benchmark (0 = pire, 100 = meilleur, sens appliqué).
- Score global = moyenne pondérée. Pondération par défaut, à valider :

| Critère | Poids |
|---|---|
| Avis / semaine (4 sem.) | 25 % |
| Note récente | 20 % |
| Taux de réponse | 15 % |
| Momentum | 10 % |
| Régularité | 10 % |
| Réponse aux avis négatifs | 10 % |
| Total d'avis | 10 % |

Les autres critères sont classés et affichés, mais n'entrent pas dans le score. Les poids pourront devenir
réglables par benchmark (lot 3).

### 5.3 Synthèse automatique

Synthèse **déterministe, fondée sur des règles** (reproductible et testable) :
- position : « 5e sur 8 en vélocité, 1er en taux de réponse » ;
- forces : critères où My listing est dans le top 3 ; faiblesses : critères où elle est dans les 3 derniers ;
- **objectifs chiffrés** :
  - « +3,7 avis/semaine pour passer 1er en vélocité, +1,2 pour entrer dans le top 3 » ;
  - « 4 avis négatifs sans réponse » ;
  - « au rythme actuel, vous rattrapez le total de Y dans 11 mois » ;
- option ultérieure : un résumé rédigé par un LLM (l'app a déjà une configuration LLM, `src/lib/llm-options.ts`).

### 5.4 Structure du rapport (identique à l'écran et en PDF)

1. **En-tête** : identité de marque (Settings › report identity), « Competitive review report », marché
   (mot-clé, zone, rayon), **période exacte** (ex. 1 mai – 15 août), date de génération.
2. **Résumé exécutif** : 4 KPI (rang global ; avis/semaine moi vs leader ; taux de réponse moi vs médiane ;
   note récente moi vs médiane) et 3 à 5 phrases de synthèse (§5.3).
3. **Classement général** : rang, fiche, score, puis 4 à 5 colonnes clés ; ligne My listing surlignée.
4. **Matrice des rangs** : fiches × critères, cellules colorées du vert (1er) au rouge (dernier). Vue d'ensemble en une page.
5. **Détail par axe** (dynamique, satisfaction, engagement, richesse) : valeurs et rangs par critère.
6. **Graphiques** : nouveaux avis par semaine sur 13 semaines (courbes, My listing en gras) et barres
   horizontales « avis/semaine, 4 dernières semaines ».
7. **Objectifs et écarts** (§5.3).
8. **Méthodologie et couverture** : source, période, nombre d'avis analysés par fiche, fiches partielles, définitions courtes.

Une étape avant export permet de choisir les fiches et sections incluses (ex. masquer les signaux informatifs
dans un rapport client).

### 5.5 Export PDF

- **A4 paysage** (les tableaux de classement sont larges), habillé avec la marque via `getBrandSettings()` (logo,
  couleur, pied de page), comme les autres rapports.
- **Une seule source de vérité** : une fonction pure `buildComparisonReport(benchmark, listings, reviews, now)`
  produit un objet `ComparisonReport` (rangs, scores, synthèse, séries des graphiques). La vue web et le PDF
  le consomment tous les deux, donc ils ne peuvent pas diverger, et il est testable unitairement.
- **Composant PDF à étendre** : `ReportPdfExportButton` ne sait aujourd'hui dessiner que des KPI, des lignes
  libellé/valeur, des cartes de statut et un calendrier. Blocs vectoriels jsPDF à ajouter dans
  `src/lib/report-pdf-blocks.ts` (pas de capture d'écran : texte net et sélectionnable, fichier léger) :
  - `drawTable` : multi-colonnes, en-tête répété au saut de page, ligne surlignée, cellules colorées ;
  - `drawRankMatrix` ;
  - `drawBarChart` / `drawLineChart`.

  `ReportSection` gagne des champs optionnels `table` et `chart`. Ces blocs serviront aussi aux autres outils.
- Exports complémentaires : CSV et Excel, avec trois feuilles (Classement, Critères, Hebdo : semaines × fiches).

## 6. Coûts (tarifs DataForSEO publics, file standard)

- Avis Google : **0,00075 $ / 10 avis** (prioritaire : 0,0015 $), facturé à la page de 10 réellement renvoyée.
  Source : [pricing Google Reviews API](https://dataforseo.com/pricing/business-data/google-reviews-api).
- Découverte Google Maps : ≈ 0,002 $ par recherche (cf. commentaire de `src/app/api/business-search/route.ts`) — à confirmer pour `depth` > 10.

| Scénario | Calcul | Coût |
|---|---|---|
| Backfill 3 mois, 10 fiches × 100 avis | 10 × 10 × 0,00075 | **≤ 0,075 $** |
| Relance d'une fiche très active (ex. 400 avis) | 40 × 0,00075 | +0,03 $ |
| Refresh hebdo 10 fiches × ~30 avis | 10 × 3 × 0,00075 | ≈ 0,02 $/semaine |
| Un an de suivi hebdo | 52 × 0,02 + backfill | ≈ 1,1 $ |

Le coût maximal estimé (premier passage) est affiché avant *Start analysis*. Le coût réel (task_get) est
enregistré et remonte dans *Spending*.

## 7. Interface (libellés en anglais, comme le reste de l'app)

Route : `/dashboard/review-velocity` · Nav : section *Business*, item **Review Velocity**.
Lien croisé depuis *Google Reviews* : « Compare velocity with competitors → ».

```
┌ Review Velocity ───────────────────────────────────────────── [Benchmarks ▾] ┐
│ "plombier" · Lyon 3e · 5 km · 8 listings · Updated 2 days ago                 │
│ [Refresh now]  Schedule: Weekly · Mon 07:00 Europe/Paris [Edit]  [Export ▾]   │
│ Tabs: [Overview]  Report  Data                                                │
├───────────────────────────────────────────────────────────────────────────────┤
│ KPI: My pace 6.2/mo · Market median 9.0/mo · Leader 21/mo · Rank 5/8          │
├───────────────────────────────────────────────────────────────────────────────┤
│ Listing          ★   Total  7d  30d  /week  /month  Trend   New★  Reply  Cov. │
│ ▶ Me (Dupont)   4.6   212    1    5   1.4    6.2    ▼ -12%  4.7   80%    3mo  │
│   Plomberie X   4.8   890    6   22   5.1   21.0    ▲ +35%  4.9   95%    3mo  │
│   Y Services    4.2   340    2    9   2.0    9.0    = +2%   4.0   10%  ⚠ 7wk  │
├───────────────────────────────────────────────────────────────────────────────┤
│ New reviews per  (•) Week  ( ) Month     [ ] Cumulative                       │
│  multi-series line chart, "Me" bold, others muted, hover = tooltip            │
├───────────────────────────────────────────────────────────────────────────────┤
│ Heatmap  periods × listings (compact, readable for weekly data)               │
├───────────────────────────────────────────────────────────────────────────────┤
│ Gap analysis: "+15 reviews/month to match Plomberie X" ·                      │
│ "Catch Y Services' total in 11 months at current pace" · "X pulls away by …"   │
└───────────────────────────────────────────────────────────────────────────────┘
```

- Tableau triable, ligne « Me » surlignée, écarts vs moi en infobulle ; fiches à couverture partielle marquées ⚠.
- Graphique SVG maison (cohérent avec `MonthlyChart` existant, pas de nouvelle dépendance).
- Écran de création : carte (Leaflet, réutilise la logique de `local-finder/MapPicker.tsx`) + cercle de rayon +
  liste à cocher synchronisée avec les marqueurs.
- États : tâches en attente par fiche (« 3/8 listings ready »), erreurs par fiche, absence de credentials.
- Onglet **Report** : le rapport comparatif du §5.4, avec le bouton *Export PDF* (§5.5) et les exports CSV/Excel.
- Onglet **Data** : avis récupérés par fiche, couverture, tâches et coûts.

## 8. Modèle de données (base par projet, `initSchema` de `src/lib/db.ts`)

```sql
CREATE TABLE rv_benchmarks (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, keyword TEXT NOT NULL,
  center TEXT NOT NULL,            -- "lat,lng"
  radius_km REAL NOT NULL, language TEXT NOT NULL, time_zone TEXT NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

CREATE TABLE rv_listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, benchmark_id TEXT NOT NULL,
  cid TEXT NOT NULL, place_id TEXT, title TEXT NOT NULL, address TEXT, category TEXT,
  lat REAL, lng REAL, is_self INTEGER NOT NULL DEFAULT 0,
  maps_rank INTEGER,                            -- position dans la recherche de découverte
  history_complete INTEGER NOT NULL DEFAULT 0,  -- tout l'historique a été récupéré
  coverage_from INTEGER,                        -- ms UTC, plus ancien avis fiable
  last_fetch_at INTEGER, added_at INTEGER NOT NULL,
  UNIQUE (benchmark_id, cid)
);

CREATE TABLE rv_reviews (                       -- texte non stocké en V1 : sa longueur suffit aux critères
  listing_id INTEGER NOT NULL, review_id TEXT NOT NULL,
  published_at INTEGER NOT NULL, rating REAL,
  text_length INTEGER NOT NULL DEFAULT 0,       -- 0 = avis sans texte
  photo_count INTEGER NOT NULL DEFAULT 0,
  owner_replied_at INTEGER,                     -- owner_timestamp ; NULL = pas de réponse
  local_guide INTEGER, author_review_count INTEGER, language TEXT,
  first_seen_at INTEGER NOT NULL, removed_at INTEGER,
  PRIMARY KEY (listing_id, review_id)
);
CREATE INDEX idx_rv_reviews_time ON rv_reviews(listing_id, published_at);

CREATE TABLE rv_snapshots (
  listing_id INTEGER NOT NULL, ts INTEGER NOT NULL, reviews_count INTEGER,
  rating REAL, source TEXT NOT NULL              -- 'reviews_task' | 'maps'
);

CREATE TABLE rv_tasks (                          -- 'posting' → 'pending' → 'ready' | 'error'
  task_id TEXT PRIMARY KEY, listing_id INTEGER NOT NULL, kind TEXT NOT NULL, -- 'backfill' | 'refresh' | 'gap'
  depth INTEGER NOT NULL, status TEXT NOT NULL, cost REAL,
  created_at INTEGER NOT NULL, completed_at INTEGER, error_message TEXT
);
CREATE UNIQUE INDEX idx_rv_tasks_active ON rv_tasks(listing_id) WHERE status IN ('posting','pending');

CREATE TABLE rv_discoveries (                    -- recherches Maps, rechargeables + coût
  id TEXT PRIMARY KEY, ts INTEGER NOT NULL, keyword TEXT NOT NULL, center TEXT NOT NULL,
  radius_km REAL NOT NULL, language TEXT NOT NULL, cost REAL, items TEXT NOT NULL
);

CREATE TABLE rv_rank_history (                  -- un classement archivé par refresh → évolution des rangs
  benchmark_id TEXT NOT NULL, ts INTEGER NOT NULL, listing_id INTEGER NOT NULL,
  criterion TEXT NOT NULL, value REAL, rank INTEGER,
  PRIMARY KEY (benchmark_id, ts, listing_id, criterion)
);

CREATE TABLE rv_schedules (                      -- calqué sur grid_schedules
  benchmark_id TEXT PRIMARY KEY, frequency TEXT NOT NULL, -- 'weekly' | 'monthly'
  weekday INTEGER, time_of_day TEXT NOT NULL, time_zone TEXT NOT NULL,
  next_run_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
```

- `SPEND_SOURCES` : ajouter `rv_tasks` (`tsColumn: 'created_at'`) et `rv_discoveries`.
- L'index unique partiel sur `rv_tasks` reprend le pattern de réservation de `rank_tasks` (`posting` avant l'appel payant)
  → impossible de facturer deux backfills simultanés pour la même fiche.

## 9. Architecture technique

| Fichier | Rôle |
|---|---|
| `src/lib/review-velocity.ts` (+ `.test.ts`) | **Pur** : parsing timestamp, bucketing semaine/mois avec fuseau, couverture, stats §4, gap/catch-up, profondeur adaptative. |
| `src/lib/review-report.ts` (+ `.test.ts`) | **Pur** : `buildComparisonReport` → critères, rangs, scores, synthèse, séries des graphiques (§5). |
| `src/lib/report-pdf-blocks.ts` / `src/components/ReportPdfExportButton.tsx` | Nouveaux blocs `drawTable`, `drawRankMatrix`, `drawBarChart`, `drawLineChart` ; option paysage ; `ReportSection.table` / `.chart`. |
| `src/lib/review-velocity-tasks.ts` | Orchestration : post (réservation → task_post par `cid`), poll (`tasks_ready` → `task_get`), merge par `review_id`, snapshot, détection de trou. Utilisé par la page, les actions et le cron, avec un `projectId` explicite. |
| `src/lib/db.ts` | Schéma §8 + accès `...ForProject`, claim des schedules (`claimDueReviewVelocitySchedules`) sur le modèle de `claimDueGridSchedules`. |
| `src/app/api/review-velocity/discover/route.ts` | Maps SERP (`location_coordinate` = centre + zoom dérivé du rayon, `depth` 20–100), filtre au cercle, enregistre `rv_discoveries`. Route séparée pour ne pas toucher `business-search` (actuellement en cours de modification). |
| `src/app/dashboard/review-velocity/page.tsx` | Server component `withProjectScope` : liste des benchmarks, poll des tâches en attente au chargement (comme Google Reviews), calculs, rendu. |
| `…/actions.ts` | `createBenchmarkAction`, `refreshBenchmarkAction`, `save/deleteScheduleAction`, `deleteBenchmarkAction` — chacune `return runWithCurrentProject(async () => …)`. |
| `…/CompetitorPicker.tsx` (client) | Carte + cercle + liste cochable + « My listing ». |
| `…/VelocityChart.tsx`, `VelocityTable.tsx`, `VelocityHeatmap.tsx`, `VelocityScheduleControl.tsx` | Rendu de l'onglet Overview. |
| `…/ComparisonReport.tsx`, `ReportExportButton.tsx` | Onglet Report et export PDF/CSV/Excel. |
| `src/app/api/cron/geo-grid/route.ts` | Ajouter au `runPass` : claim des schedules review velocity + **poll des tâches `rv_tasks` en attente** (sinon les refresh planifiés ne seraient récoltés qu'à l'ouverture de la page). |
| `src/lib/nav.ts` | Item *Review Velocity* dans la section `business`. |

Respect de `docs/project-scope.md` : page enveloppée par `withProjectScope`, actions en `runWithCurrentProject`,
cron avec `projectId` explicite ; le test `project-scope-coverage.test.ts` couvrira automatiquement la nouvelle page.

## 10. Tests prévus

- `review-velocity.test.ts` : bucketing ISO (semaine à cheval sur deux années, passage heure d'été/hiver à Paris),
  exclusion de la période en cours, couverture partielle vs complète (jamais de faux 0), stats sur données vides,
  tendance avec couverture insuffisante → `null`, catch-up (dénominateur ≤ 0), profondeur adaptative bornée.
- Merge : idempotence d'un même résultat fusionné deux fois ; détection de trou.
- DB : réservation `posting` concurrente → une seule tâche facturée ; claim de schedule non dupliqué.
- Coût affiché = somme des `ceil(depth/10) × tarif`.
- `review-report.test.ts` :
  - ex æquo (même rang) et sens ↑/↓ de chaque critère ;
  - seuil des 5 avis → `n/a` et redistribution des poids ;
  - taux de réponse qui ignore les avis de moins de 7 jours ;
  - benchmark sans My listing (pas de synthèse personnalisée) ;
  - fiche unique ou fiches identiques (normalisation min-max sans division par zéro).
- PDF : saut de page au milieu d'un tableau (en-tête répété) et noms de fiches très longs (troncature),
  sur le modèle de `pdf-render.test.ts`.

## 11. Découpage proposé

| Lot | Contenu | Valeur |
|---|---|---|
| **1 — Benchmark & rapport** | Découverte carte + cercle, sélection, backfill 3 mois avec relance auto, onglet Overview (tableau + graphe semaine/mois), **rapport comparatif** (critères 1–16, score, matrice, synthèse) et **export PDF**, *Refresh now* manuel. | Le livrable demandé : un classement comparatif exportable. |
| **2 — Suivi planifié** | `rv_schedules`, intégration cron (claim + poll), snapshots + `netDelta`, détection de trous, `rv_rank_history` → « évolution de mon rang » dans le rapport. | Le « hybride » complet, sans intervention. |
| **3 — Approfondissements** | Signaux informatifs (pics, auteurs à 1 avis, avis disparus), critère 17 (position Maps), poids réglables, résumé LLM optionnel, export Excel multi-feuilles, lien depuis Google Reviews. | Analyse plus fine et personnalisation. |

## 12. Risques et points à vérifier

- **Timestamp = publication ou dernière modification ?** Un avis modifié pourrait remonter avec une date récente.
  À vérifier sur un échantillon réel avant de figer les définitions.
- **Biais de survie** : la reconstruction ne voit pas les avis supprimés depuis → vélocité passée légèrement sous-estimée ;
  les snapshots (lot 2) permettent de l'objectiver.
- **Fiches à très fort volume** (> 4 490 avis récents) : couverture limitée par le plafond API, signalée par le badge de couverture.
- **Délai file standard** (≤ 45 min) : l'UI doit l'annoncer ; option *Priority* (×2) possible.
- **Bug existant repéré** dans `google-reviews/page.tsx` : on lit `result.total_count`, absent de l'API — le champ
  documenté est `reviews_count`. « X available » n'est donc jamais affiché. À corriger au passage (le parsing sera partagé).

## 13. Questions ouvertes

Décidé : premier passage à 100 avis, **relance automatique** si les 3 mois ne sont pas couverts.

1. Pondération du score global (§5.2) : OK telle quelle ?
2. **Langue du rapport PDF** : l'app est en anglais, mais un rapport destiné à un client français devrait sans
   doute être en français. Faut-il un choix FR/EN à l'export ?
3. Signaux informatifs (pics, auteurs à 1 avis) : visibles dans l'app seulement, ou aussi dans le PDF (option décochée par défaut) ?
4. Nombre max de fiches par benchmark : **10** ? (au-delà, la matrice des rangs ne tient plus sur une page A4 paysage)
5. Fréquence par défaut du suivi : **hebdo, lundi 07:00** ?
6. « My listing » mémorisée au niveau du **projet** (réutilisée par Google Reviews / Geo-grid) ou par benchmark ?
7. Plusieurs benchmarks par projet (ex. un par ville ou par mot-clé) dès le lot 1 ?
