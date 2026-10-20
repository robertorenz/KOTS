// Static game data: aircraft, nations, aces, ranks and medals.

export const G = 9.81;

// Flight + model parameters. Speeds in m/s, rates in deg/s, mass in kg, sizes in metres.
// `year` is when the type reaches the front (decimal year).
export const AIRCRAFT = {
  // ---------------- Allied ----------------
  nieuport17: {
    name: 'Nieuport 17', side: 'A', nations: ['FR', 'GB', 'US'], role: 'fighter', year: 1916.3,
    mass: 560, vstall: 19, vmax: 47, thrust: 0.42, roll: 125, pitch: 72, yaw: 45, rpm: 1250,
    guns: 1, ammo: 400, rof: 8, bombs: 0,
    model: { span: 8.2, length: 5.8, wings: 'sesqui', engine: 'rotary', chord: 1.5 },
    blurb: 'Agile French sesquiplane. A single gun, but it climbs and rolls beautifully.',
  },
  pup: {
    name: 'Sopwith Pup', side: 'A', nations: ['GB'], role: 'fighter', year: 1916.8,
    mass: 556, vstall: 17, vmax: 46, thrust: 0.41, roll: 100, pitch: 70, yaw: 42, rpm: 1250,
    guns: 1, ammo: 500, rof: 7.5, bombs: 0,
    model: { span: 8.1, length: 5.9, wings: 'bi', engine: 'rotary', chord: 1.55 },
    blurb: 'Gentle and forgiving, with excellent high-altitude manners. Lightly armed.',
  },
  triplane: {
    name: 'Sopwith Triplane', side: 'A', nations: ['GB'], role: 'fighter', year: 1917.0,
    mass: 699, vstall: 18, vmax: 50, thrust: 0.42, roll: 95, pitch: 80, yaw: 45, rpm: 1250,
    guns: 1, ammo: 500, rof: 7.5, bombs: 0,
    model: { span: 8.1, length: 5.9, wings: 'tri', engine: 'rotary', chord: 1.0 },
    blurb: 'The "Tripehound" out-climbs anything the Germans have in early 1917.',
  },
  spad7: {
    name: 'SPAD VII', side: 'A', nations: ['FR', 'GB'], role: 'fighter', year: 1916.7,
    mass: 705, vstall: 22, vmax: 53, thrust: 0.40, roll: 85, pitch: 64, yaw: 38, rpm: 1500,
    guns: 1, ammo: 500, rof: 8, bombs: 0,
    model: { span: 7.8, length: 6.1, wings: 'bi', engine: 'inline', chord: 1.5 },
    blurb: 'Fast and rugged. Dive away from trouble, then come back on your terms.',
  },
  camel: {
    name: 'Sopwith Camel', side: 'A', nations: ['GB', 'US'], role: 'fighter', year: 1917.45,
    mass: 659, vstall: 19, vmax: 51, thrust: 0.44, roll: 135, pitch: 84, yaw: 55, rpm: 1250,
    guns: 2, ammo: 500, rof: 7.5, bombs: 4,
    model: { span: 8.5, length: 5.7, wings: 'bi', engine: 'rotary', chord: 1.45, hump: true },
    blurb: 'Twin Vickers and a vicious right-hand turn. Deadly in skilled hands.',
  },
  se5a: {
    name: 'R.A.F. S.E.5a', side: 'A', nations: ['GB', 'US'], role: 'fighter', year: 1917.5,
    mass: 880, vstall: 21, vmax: 57, thrust: 0.44, roll: 92, pitch: 70, yaw: 40, rpm: 2000,
    guns: 2, ammo: 450, rof: 7.5, bombs: 4,
    model: { span: 8.1, length: 6.4, wings: 'bi', engine: 'inline', chord: 1.6 },
    blurb: 'Stable gun platform with speed to burn. Favoured by the great British aces.',
  },
  spad13: {
    name: 'SPAD XIII', side: 'A', nations: ['FR', 'US'], role: 'fighter', year: 1917.4,
    mass: 845, vstall: 23, vmax: 61, thrust: 0.45, roll: 82, pitch: 64, yaw: 38, rpm: 2000,
    guns: 2, ammo: 400, rof: 8, bombs: 0,
    model: { span: 8.25, length: 6.25, wings: 'bi', engine: 'inline', chord: 1.5 },
    blurb: 'The fastest Allied fighter. Boom-and-zoom; never turn with a Fokker.',
  },
  dolphin: {
    name: 'Sopwith Dolphin', side: 'A', nations: ['GB'], role: 'fighter', year: 1918.05,
    mass: 890, vstall: 21, vmax: 58, thrust: 0.46, roll: 95, pitch: 74, yaw: 42, rpm: 2000,
    guns: 2, ammo: 500, rof: 7.5, bombs: 4,
    model: { span: 9.9, length: 6.8, wings: 'bi', engine: 'inline', chord: 1.5, negStagger: true },
    blurb: 'Back-staggered wings and superb visibility. Excellent at altitude.',
  },
  bristol: {
    name: 'Bristol F.2b', side: 'A', nations: ['GB'], role: 'twoseater', year: 1917.3,
    mass: 1260, vstall: 22, vmax: 55, thrust: 0.42, roll: 75, pitch: 60, yaw: 35, rpm: 1800,
    guns: 1, ammo: 500, rof: 7.5, bombs: 0, gunner: true,
    model: { span: 11.9, length: 7.9, wings: 'bi', engine: 'inline', chord: 1.7 },
    blurb: 'Two-seat fighter with an observer gunner.',
  },
  re8: {
    name: 'R.E.8', side: 'A', nations: ['GB'], role: 'twoseater', year: 1917.0,
    mass: 1215, vstall: 21, vmax: 46, thrust: 0.36, roll: 55, pitch: 45, yaw: 30, rpm: 1600,
    guns: 1, ammo: 400, rof: 7, bombs: 0, gunner: true,
    model: { span: 13, length: 7.8, wings: 'bi', engine: 'inline', chord: 1.7 },
    blurb: 'Reconnaissance two-seater. Slow, steady, and in need of protection.',
  },

  // ---------------- German ----------------
  albatros2: {
    name: 'Albatros D.II', side: 'G', role: 'fighter', year: 1916.6,
    mass: 888, vstall: 21, vmax: 49, thrust: 0.39, roll: 72, pitch: 62, yaw: 36, rpm: 1500,
    guns: 2, ammo: 500, rof: 7.5,
    model: { span: 8.5, length: 7.4, wings: 'bi', engine: 'inline', chord: 1.6, shark: true },
  },
  albatros3: {
    name: 'Albatros D.III', side: 'G', role: 'fighter', year: 1917.0,
    mass: 886, vstall: 21, vmax: 50, thrust: 0.41, roll: 82, pitch: 65, yaw: 38, rpm: 1500,
    guns: 2, ammo: 500, rof: 7.5,
    model: { span: 9.0, length: 7.3, wings: 'sesqui', engine: 'inline', chord: 1.7, shark: true },
  },
  albatros5: {
    name: 'Albatros D.V', side: 'G', role: 'fighter', year: 1917.4,
    mass: 937, vstall: 21, vmax: 52, thrust: 0.42, roll: 82, pitch: 66, yaw: 38, rpm: 1500,
    guns: 2, ammo: 500, rof: 7.5,
    model: { span: 9.05, length: 7.33, wings: 'sesqui', engine: 'inline', chord: 1.7, shark: true },
  },
  pfalz: {
    name: 'Pfalz D.IIIa', side: 'G', role: 'fighter', year: 1917.7,
    mass: 933, vstall: 22, vmax: 53, thrust: 0.41, roll: 76, pitch: 64, yaw: 36, rpm: 1500,
    guns: 2, ammo: 500, rof: 7.5,
    model: { span: 9.4, length: 6.95, wings: 'sesqui', engine: 'inline', chord: 1.6, shark: true },
  },
  dr1: {
    name: 'Fokker Dr.I', side: 'G', role: 'fighter', year: 1917.7,
    mass: 586, vstall: 16, vmax: 46, thrust: 0.46, roll: 125, pitch: 95, yaw: 62, rpm: 1250,
    guns: 2, ammo: 500, rof: 7.5,
    model: { span: 7.2, length: 5.8, wings: 'tri', engine: 'rotary', chord: 1.0 },
  },
  d7: {
    name: 'Fokker D.VII', side: 'G', role: 'fighter', year: 1918.3,
    mass: 880, vstall: 19, vmax: 56, thrust: 0.47, roll: 98, pitch: 80, yaw: 42, rpm: 1600,
    guns: 2, ammo: 500, rof: 7.5,
    model: { span: 8.9, length: 6.95, wings: 'bi', engine: 'inline', chord: 1.6 },
  },
  d8: {
    name: 'Fokker D.VIII', side: 'G', role: 'fighter', year: 1918.6,
    mass: 605, vstall: 20, vmax: 57, thrust: 0.45, roll: 115, pitch: 85, yaw: 50, rpm: 1250,
    guns: 2, ammo: 500, rof: 7.5,
    model: { span: 8.4, length: 5.9, wings: 'parasol', engine: 'rotary', chord: 1.6 },
  },
  dfw: {
    name: 'DFW C.V', side: 'G', role: 'twoseater', year: 1916.8,
    mass: 1430, vstall: 21, vmax: 43, thrust: 0.34, roll: 52, pitch: 44, yaw: 28, rpm: 1400,
    guns: 1, ammo: 500, rof: 7, gunner: true,
    model: { span: 13.3, length: 7.9, wings: 'bi', engine: 'inline', chord: 1.75 },
  },
  halberstadt: {
    name: 'Halberstadt CL.II', side: 'G', role: 'twoseater', year: 1917.6,
    mass: 1130, vstall: 21, vmax: 46, thrust: 0.38, roll: 68, pitch: 55, yaw: 32, rpm: 1400,
    guns: 1, ammo: 500, rof: 7, gunner: true,
    model: { span: 10.8, length: 7.3, wings: 'bi', engine: 'inline', chord: 1.6 },
  },
};

// Colour schemes
export const SCHEMES = {
  GB: { fuselage: '#6b6640', wingTop: '#6b6640', wingBottom: '#d6cba6', cowl: '#9aa0a3', tail: '#6b6640', strut: '#4a3b2a', marking: 'GB' },
  FR: { fuselage: '#c4bfae', wingTop: '#b9a77a', wingBottom: '#cfc8b4', cowl: '#a7acaf', tail: '#c4bfae', strut: '#4a3b2a', marking: 'FR' },
  US: { fuselage: '#b9a77a', wingTop: '#8a7f55', wingBottom: '#cfc8b4', cowl: '#a7acaf', tail: '#b9a77a', strut: '#4a3b2a', marking: 'US' },
  DE_albatros: { fuselage: '#b07c3e', wingTop: '#5d6b39', wingBottom: '#9fb4c4', cowl: '#8f9497', tail: '#b07c3e', strut: '#3a3a3a', marking: 'DE' },
  DE_pfalz: { fuselage: '#b8bcbf', wingTop: '#b8bcbf', wingBottom: '#c7cbcd', cowl: '#8f9497', tail: '#b8bcbf', strut: '#3a3a3a', marking: 'DE' },
  DE_fokker: { fuselage: '#5f6a34', wingTop: '#5f6a34', wingBottom: '#9fb4c4', cowl: '#5f6a34', tail: '#5f6a34', strut: '#3a3a3a', marking: 'DE' },
  DE_d7: { fuselage: '#4d5a36', wingTop: '#5e5a3a', wingBottom: '#8aa0ad', cowl: '#4d5a36', tail: '#4d5a36', strut: '#3a3a3a', marking: 'DE' },
  DE_twoseater: { fuselage: '#c2b59a', wingTop: '#6a6e44', wingBottom: '#a9bccb', cowl: '#8f9497', tail: '#c2b59a', strut: '#3a3a3a', marking: 'DE' },
};

export function defaultScheme(typeKey, nation) {
  const t = AIRCRAFT[typeKey];
  if (t.side === 'A') return { ...SCHEMES[nation || 'GB'] };
  if (typeKey === 'pfalz') return { ...SCHEMES.DE_pfalz };
  if (typeKey === 'dr1' || typeKey === 'd8') return { ...SCHEMES.DE_fokker };
  if (typeKey === 'd7') return { ...SCHEMES.DE_d7 };
  if (t.role === 'twoseater') return { ...SCHEMES.DE_twoseater };
  return { ...SCHEMES.DE_albatros };
}

// German enemy fighter mix by date
export function germanFighterTypes(yf) {
  const list = [];
  if (yf < 1917.6) list.push('albatros2');
  if (yf >= 1917.0 && yf < 1918.4) list.push('albatros3');
  if (yf >= 1917.4) list.push('albatros5');
  if (yf >= 1917.7) list.push('pfalz', 'dr1');
  if (yf >= 1918.3) list.push('d7', 'd7', 'd7');
  if (yf >= 1918.6) list.push('d8');
  return list;
}
export function germanTwoSeaterTypes(yf) {
  return yf >= 1917.6 ? ['dfw', 'halberstadt'] : ['dfw'];
}

export function availablePlayerTypes(nation, yf) {
  return Object.entries(AIRCRAFT)
    .filter(([, t]) => t.side === 'A' && t.role === 'fighter' && t.nations.includes(nation) && t.year <= yf)
    .map(([k]) => k);
}

// -------- Enemy aces (historical service windows; victories interpolated) --------
export const ACES = [
  { id: 'mvr', name: 'Manfred von Richthofen', nick: 'The Red Baron', unit: 'Jasta 11 / JG I', from: 1916.7, to: 1918.305, v0: 0, v1: 80, skill: 0.98,
    early: 'albatros3', late: 'dr1', switch: 1917.7,
    scheme: { fuselage: '#b3221c', wingTop: '#b3221c', wingBottom: '#b3221c', cowl: '#b3221c', tail: '#b3221c', strut: '#3a3a3a', marking: 'DE' } },
  { id: 'voss', name: 'Werner Voss', nick: 'The Hussar of Krefeld', unit: 'Jasta 10', from: 1916.9, to: 1917.73, v0: 0, v1: 48, skill: 0.97,
    early: 'albatros3', late: 'dr1', switch: 1917.62,
    scheme: { fuselage: '#7d8a8c', wingTop: '#6a7240', wingBottom: '#9fb4c4', cowl: '#d8b63a', tail: '#7d8a8c', strut: '#3a3a3a', marking: 'DE' } },
  { id: 'udet', name: 'Ernst Udet', nick: '"Lo!"', unit: 'Jasta 4', from: 1917.0, to: 1918.86, v0: 6, v1: 62, skill: 0.92,
    early: 'albatros5', late: 'd7', switch: 1918.35,
    scheme: { fuselage: '#c0201b', wingTop: '#e7e2d6', wingBottom: '#c0201b', cowl: '#c0201b', tail: '#e7e2d6', strut: '#3a3a3a', marking: 'DE' } },
  { id: 'lvr', name: 'Lothar von Richthofen', nick: 'The Butcher', unit: 'Jasta 11', from: 1917.2, to: 1918.61, v0: 0, v1: 40, skill: 0.88,
    early: 'albatros3', late: 'dr1', switch: 1917.8,
    scheme: { fuselage: '#b3221c', wingTop: '#5f6a34', wingBottom: '#d9b636', cowl: '#d9b636', tail: '#d9b636', strut: '#3a3a3a', marking: 'DE' } },
  { id: 'wolff', name: 'Kurt Wolff', nick: 'Frail Little Lily', unit: 'Jasta 11', from: 1917.2, to: 1917.71, v0: 0, v1: 33, skill: 0.86,
    early: 'albatros3', late: 'dr1', switch: 1917.69,
    scheme: { fuselage: '#b3221c', wingTop: '#5d6b39', wingBottom: '#9fb4c4', cowl: '#b3221c', tail: '#3a6b3a', strut: '#3a3a3a', marking: 'DE' } },
  { id: 'allm', name: 'Karl Allmenröder', nick: 'The Silent Knight', unit: 'Jasta 11', from: 1917.1, to: 1917.49, v0: 0, v1: 30, skill: 0.86,
    early: 'albatros3', late: 'albatros3', switch: 2000,
    scheme: { fuselage: '#b3221c', wingTop: '#5d6b39', wingBottom: '#9fb4c4', cowl: '#ffffff', tail: '#ffffff', strut: '#3a3a3a', marking: 'DE' } },
  { id: 'gont', name: 'Heinrich Gontermann', nick: 'The Balloon Hunter', unit: 'Jasta 15', from: 1917.0, to: 1917.83, v0: 4, v1: 39, skill: 0.85,
    early: 'albatros3', late: 'dr1', switch: 1917.75,
    scheme: { fuselage: '#2f3f6b', wingTop: '#5d6b39', wingBottom: '#9fb4c4', cowl: '#b3221c', tail: '#2f3f6b', strut: '#3a3a3a', marking: 'DE' } },
  { id: 'jacobs', name: 'Josef Jacobs', nick: 'The Black Knight of Flanders', unit: 'Jasta 7', from: 1917.0, to: 1918.86, v0: 5, v1: 48, skill: 0.89,
    early: 'albatros5', late: 'dr1', switch: 1918.0,
    scheme: { fuselage: '#1d1d1d', wingTop: '#1d1d1d', wingBottom: '#1d1d1d', cowl: '#1d1d1d', tail: '#1d1d1d', strut: '#3a3a3a', marking: 'DE' } },
  { id: 'loew', name: 'Erich Löwenhardt', nick: 'The Yellow Ace', unit: 'Jasta 10', from: 1917.2, to: 1918.61, v0: 0, v1: 54, skill: 0.9,
    early: 'albatros5', late: 'd7', switch: 1918.35,
    scheme: { fuselage: '#d9b636', wingTop: '#4d5a36', wingBottom: '#8aa0ad', cowl: '#d9b636', tail: '#d9b636', strut: '#3a3a3a', marking: 'DE' } },
  { id: 'goer', name: 'Hermann Göring', nick: 'The White Fokker', unit: 'JG I', from: 1917.0, to: 1918.86, v0: 7, v1: 22, skill: 0.8,
    early: 'albatros5', late: 'd7', switch: 1918.4,
    scheme: { fuselage: '#e7e2d6', wingTop: '#e7e2d6', wingBottom: '#e7e2d6', cowl: '#e7e2d6', tail: '#e7e2d6', strut: '#3a3a3a', marking: 'DE' } },
  { id: 'bert', name: 'Rudolf Berthold', nick: 'The Iron Knight', unit: 'JG II', from: 1917.0, to: 1918.62, v0: 12, v1: 44, skill: 0.86,
    early: 'pfalz', late: 'd7', switch: 1918.35,
    scheme: { fuselage: '#2b4a8a', wingTop: '#4d5a36', wingBottom: '#8aa0ad', cowl: '#b3221c', tail: '#2b4a8a', strut: '#3a3a3a', marking: 'DE' } },
  { id: 'schleich', name: 'Eduard von Schleich', nick: 'The Black Knight', unit: 'Jasta 21', from: 1917.5, to: 1918.86, v0: 0, v1: 35, skill: 0.84,
    early: 'albatros5', late: 'd7', switch: 1918.4,
    scheme: { fuselage: '#1d1d1d', wingTop: '#5d6b39', wingBottom: '#9fb4c4', cowl: '#1d1d1d', tail: '#1d1d1d', strut: '#3a3a3a', marking: 'DE' } },
  { id: 'rumey', name: 'Fritz Rumey', nick: 'The Prussian Hawk', unit: 'Jasta 5', from: 1917.5, to: 1918.74, v0: 0, v1: 45, skill: 0.87,
    early: 'albatros5', late: 'd7', switch: 1918.4,
    scheme: { fuselage: '#4d5a36', wingTop: '#4d5a36', wingBottom: '#8aa0ad', cowl: '#d9b636', tail: '#e7e2d6', strut: '#3a3a3a', marking: 'DE' } },
  { id: 'baeumer', name: 'Paul Bäumer', nick: 'The Iron Eagle', unit: 'Jasta 2 Boelcke', from: 1917.5, to: 1918.86, v0: 0, v1: 43, skill: 0.87,
    early: 'albatros5', late: 'd7', switch: 1918.4,
    scheme: { fuselage: '#1d1d1d', wingTop: '#4d5a36', wingBottom: '#8aa0ad', cowl: '#e7e2d6', tail: '#e7e2d6', strut: '#3a3a3a', marking: 'DE' } },
  { id: 'degelow', name: 'Carl Degelow', nick: 'The White Stag', unit: 'Jasta 40', from: 1918.0, to: 1918.86, v0: 0, v1: 30, skill: 0.83,
    early: 'pfalz', late: 'd7', switch: 1918.4,
    scheme: { fuselage: '#1d1d1d', wingTop: '#1d1d1d', wingBottom: '#8aa0ad', cowl: '#1d1d1d', tail: '#e7e2d6', strut: '#3a3a3a', marking: 'DE' } },
  { id: 'loerzer', name: 'Bruno Loerzer', nick: 'The Old Eagle', unit: 'JG III', from: 1917.0, to: 1918.86, v0: 10, v1: 44, skill: 0.84,
    early: 'albatros5', late: 'd7', switch: 1918.35,
    scheme: { fuselage: '#2b4a8a', wingTop: '#4d5a36', wingBottom: '#8aa0ad', cowl: '#e7e2d6', tail: '#e7e2d6', strut: '#3a3a3a', marking: 'DE' } },
];

export function aceVictoriesAt(ace, yf) {
  const t = Math.min(1, Math.max(0, (yf - ace.from) / (ace.to - ace.from)));
  return Math.round(ace.v0 + (ace.v1 - ace.v0) * t);
}
export function aceTypeAt(ace, yf) {
  return yf >= ace.switch ? ace.late : ace.early;
}

// -------- Player nations --------
export const NATIONS = {
  GB: {
    name: 'Great Britain', service: (yf) => (yf >= 1918.25 ? 'Royal Air Force' : 'Royal Flying Corps'),
    units: ['No. 56 Squadron', 'No. 3 Squadron', 'No. 40 Squadron', 'No. 60 Squadron', 'No. 70 Squadron', 'No. 85 Squadron'],
    ranks: ['Second Lieutenant', 'Lieutenant', 'Captain', 'Major', 'Lieutenant-Colonel'],
    medals: [
      { id: 'mc', name: 'Military Cross', colors: ['#f4f1ea', '#5a6f9a', '#f4f1ea'], victories: 5 },
      { id: 'mcbar', name: 'Bar to the Military Cross', colors: ['#f4f1ea', '#5a6f9a', '#f4f1ea', '#c8a24a'], victories: 10 },
      { id: 'dso', name: 'Distinguished Service Order', colors: ['#b3221c', '#2b4a8a', '#b3221c'], victories: 16 },
      { id: 'vc', name: 'Victoria Cross', colors: ['#8a1f1f'], victories: 30 },
    ],
    units_label: 'Squadron', start: '1917-04-02', speed: 'mph', alt: 'ft',
  },
  FR: {
    name: 'France', service: () => 'Aéronautique Militaire',
    units: ['Escadrille SPA 3 "Les Cigognes"', 'Escadrille N 124', 'Escadrille SPA 65', 'Escadrille SPA 103'],
    ranks: ['Sergent', 'Adjudant', 'Sous-Lieutenant', 'Lieutenant', 'Capitaine'],
    medals: [
      { id: 'cdg', name: 'Croix de Guerre', colors: ['#2f6b3a', '#b3221c', '#2f6b3a', '#b3221c', '#2f6b3a'], victories: 3 },
      { id: 'mm', name: 'Médaille Militaire', colors: ['#d9b636', '#2f6b3a', '#d9b636'], victories: 8 },
      { id: 'lh', name: "Légion d'honneur (Chevalier)", colors: ['#b3221c'], victories: 14 },
      { id: 'lho', name: "Légion d'honneur (Officier)", colors: ['#b3221c', '#c8a24a', '#b3221c'], victories: 25 },
    ],
    units_label: 'Escadrille', start: '1917-04-02', speed: 'kmh', alt: 'm',
  },
  US: {
    name: 'United States', service: () => 'U.S. Air Service',
    units: ['94th Aero Squadron', '95th Aero Squadron', '27th Aero Squadron', '17th Aero Squadron', '148th Aero Squadron'],
    ranks: ['Second Lieutenant', 'First Lieutenant', 'Captain', 'Major', 'Lieutenant Colonel'],
    medals: [
      { id: 'dsc', name: 'Distinguished Service Cross', colors: ['#2b4a8a', '#f4f1ea', '#b3221c', '#f4f1ea', '#2b4a8a'], victories: 5 },
      { id: 'oak', name: 'Oak Leaf Cluster', colors: ['#2b4a8a', '#f4f1ea', '#b3221c', '#c8a24a'], victories: 10 },
      { id: 'dsm', name: 'Distinguished Service Medal', colors: ['#f4f1ea', '#b3221c', '#2b4a8a', '#b3221c', '#f4f1ea'], victories: 15 },
      { id: 'moh', name: 'Medal of Honor', colors: ['#7aa6d6', '#f4f1ea', '#7aa6d6'], victories: 22 },
    ],
    units_label: 'Squadron', start: '1918-03-04', speed: 'mph', alt: 'ft',
  },
};

export const RANK_SCORE = [0, 150, 450, 1000, 1800];
export const ARMISTICE = '1918-11-11';

// Historical movement of the front (metres, + = Allied advance east)
export const FRONT_KEYS = [
  [1916.0, 0], [1917.27, 0], [1917.40, 900], [1917.55, 900], [1917.85, 1700],
  [1918.22, 1700], [1918.32, -4200], [1918.55, -4600], [1918.60, -3000], [1918.75, 2600], [1918.86, 6000],
];

export const SKILL_LABELS = [
  { max: 0.3, label: 'Novice' }, { max: 0.55, label: 'Regular' }, { max: 0.75, label: 'Veteran' }, { max: 2, label: 'Ace' },
];
export function skillLabel(s) {
  return SKILL_LABELS.find((x) => s <= x.max).label;
}
