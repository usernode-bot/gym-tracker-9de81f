// Standardized default exercise database (issue #18).
//
// A curated, static catalog of canonical exercise names with muscle-group
// tags and known aliases. It powers:
//   - the picker's autocomplete (GET /api/exercise-catalog): canonical names
//     are suggested first, matching on aliases too ("t bar row" → "T-Bar
//     Row", "barbell ohp" → "Barbell Overhead Press");
//   - muscle suggestions on create/import: a catalog hit wins over the
//     keyword rules in server.js.
//
// It never renames anything already logged — users keep free-form names, and
// existing rows are untouched. `type` is the default reps/time shape used
// when an exercise is created from a suggestion.
//
// Matching is by normalized name: lowercased, punctuation collapsed to
// spaces ("T-Bar Row" ≡ "t bar row"), so aliases only need to cover
// genuinely different wordings, not punctuation variants.

// Canonical muscle-group slugs — the single source of truth (server.js
// imports this list for its own validation and keyword rules).
const MUSCLE_SLUGS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'forearms'];

// Entry shape: { name, type: 'reps'|'time', muscles: [slug...], aliases?: [string...] }
const CATALOG = [
  // ---------- Chest ----------
  { name: 'Barbell Bench Press', type: 'reps', muscles: ['chest', 'triceps', 'shoulders'], aliases: ['bench press', 'bench', 'flat bench press', 'bench press band only', 'banded bench press'] },
  { name: 'Dumbbell Bench Press', type: 'reps', muscles: ['chest', 'triceps', 'shoulders'], aliases: ['dumbbell chest press', 'db bench press', 'db bench'] },
  { name: 'Incline Barbell Bench Press', type: 'reps', muscles: ['chest', 'shoulders', 'triceps'], aliases: ['incline bench press', 'incline bench'] },
  { name: 'Incline Dumbbell Bench Press', type: 'reps', muscles: ['chest', 'shoulders', 'triceps'], aliases: ['incline dumbbell press', 'incline db press'] },
  { name: 'Machine Chest Press', type: 'reps', muscles: ['chest', 'triceps'], aliases: ['chest press machine', 'seated chest press'] },
  { name: 'Pec Deck Fly', type: 'reps', muscles: ['chest'], aliases: ['butterfly', 'butterfly pec deck', 'pec deck', 'pec dec', 'machine fly', 'chest fly machine'] },
  { name: 'Dumbbell Fly', type: 'reps', muscles: ['chest'], aliases: ['dumbbell flye', 'chest fly', 'db fly'] },
  { name: 'Cable Fly', type: 'reps', muscles: ['chest'], aliases: ['cable crossover', 'cable chest fly'] },
  { name: 'Push-Up', type: 'reps', muscles: ['chest', 'triceps'], aliases: ['pushup', 'press up'] },
  { name: 'Incline Push-Up', type: 'reps', muscles: ['chest', 'triceps'], aliases: ['incline pushup'] },
  { name: 'Close-Grip Incline Push-Up', type: 'reps', muscles: ['chest', 'triceps'], aliases: ['close incline push up', 'close grip incline pushup'] },
  { name: 'Dips', type: 'reps', muscles: ['chest', 'triceps'], aliases: ['dip', 'weighted dips', 'chest dips', 'tricep dips', 'parallel bar dips'] },

  // ---------- Back ----------
  { name: 'Pull-Up', type: 'reps', muscles: ['back', 'biceps'], aliases: ['pullup', 'pull up banded', 'banded pull up', 'assisted pull up', 'weighted pull up'] },
  { name: 'Chin-Up', type: 'reps', muscles: ['back', 'biceps'], aliases: ['chinup'] },
  { name: 'Pull-Up Negatives', type: 'reps', muscles: ['back', 'biceps'], aliases: ['negative pull ups', 'eccentric pull up'] },
  { name: 'Lat Pulldown', type: 'reps', muscles: ['back', 'biceps'], aliases: ['lat pulldown machine', 'cable pulldown', 'pulldown', 'lat pull down', 'wide grip pulldown'] },
  { name: 'One-Arm Lat Pulldown', type: 'reps', muscles: ['back', 'biceps'], aliases: ['one arm lat machine pull', 'single arm lat pulldown', 'single arm pulldown'] },
  { name: 'Barbell Row', type: 'reps', muscles: ['back', 'biceps'], aliases: ['bent over row', 'bent over barbell row', 'bb row'] },
  { name: 'Underhand Barbell Row', type: 'reps', muscles: ['back', 'biceps'], aliases: ['underhand row', 'yates row', 'reverse grip barbell row'] },
  { name: 'Pendlay Row', type: 'reps', muscles: ['back', 'biceps'] },
  { name: 'T-Bar Row', type: 'reps', muscles: ['back', 'biceps'], aliases: ['tbar row', 't bar machine row'] },
  { name: 'Dumbbell Row', type: 'reps', muscles: ['back', 'biceps'], aliases: ['one arm dumbbell row', 'single arm dumbbell row', 'db row', 'seated dumbbell row'] },
  { name: 'Chest-Supported Dumbbell Row', type: 'reps', muscles: ['back', 'biceps'], aliases: ['dumbbell stomach row', 'stomach row', 'seal row', 'prone dumbbell row', 'incline dumbbell row', 'chest supported row'] },
  { name: 'Seated Cable Row', type: 'reps', muscles: ['back', 'biceps'], aliases: ['seated pulley row', 'pulley row', 'cable row', 'seated row', 'low row'] },
  { name: 'Wide-Grip Seated Cable Row', type: 'reps', muscles: ['back'], aliases: ['wide pulley row', 'wide grip cable row', 'wide row'] },
  { name: 'One-Arm Seated Cable Row', type: 'reps', muscles: ['back', 'biceps'], aliases: ['seated one arm cord pull', 'single arm cable row', 'one arm cable row'] },
  { name: 'Machine Row', type: 'reps', muscles: ['back', 'biceps'], aliases: ['seated machine row', 'hammer strength row'] },
  { name: 'Inverted Row', type: 'reps', muscles: ['back', 'biceps'], aliases: ['bodyweight row', 'australian pull up'] },
  { name: 'Straight-Arm Pulldown', type: 'reps', muscles: ['back'], aliases: ['cable pullover', 'straight arm cable pulldown'] },
  { name: 'Barbell Shrug', type: 'reps', muscles: ['back', 'forearms'], aliases: ['shrug', 'shrugs'] },
  { name: 'Dumbbell Shrug', type: 'reps', muscles: ['back', 'forearms'] },
  { name: 'Back Extension', type: 'reps', muscles: ['back', 'glutes', 'hamstrings'], aliases: ['hyperextension', '45 degree back extension'] },
  { name: 'Good Morning', type: 'reps', muscles: ['hamstrings', 'glutes', 'back'] },
  { name: 'Deadlift', type: 'reps', muscles: ['hamstrings', 'glutes', 'back'], aliases: ['barbell deadlift', 'conventional deadlift'] },
  { name: 'Romanian Deadlift', type: 'reps', muscles: ['hamstrings', 'glutes', 'back'], aliases: ['rdl', 'stiff leg deadlift', 'stiff legged deadlift'] },
  { name: 'Sumo Deadlift', type: 'reps', muscles: ['glutes', 'hamstrings', 'quads', 'back'] },
  { name: 'Rack Pull', type: 'reps', muscles: ['back', 'glutes', 'hamstrings'] },

  // ---------- Shoulders / rotator cuff ----------
  { name: 'Barbell Overhead Press', type: 'reps', muscles: ['shoulders', 'triceps'], aliases: ['ohp', 'barbell ohp', 'overhead press', 'military press', 'standing press', 'standing barbell press', 'strict press'] },
  { name: 'Dumbbell Shoulder Press', type: 'reps', muscles: ['shoulders', 'triceps'], aliases: ['db shoulder press', 'seated dumbbell press', 'dumbbell overhead press'] },
  { name: 'Machine Shoulder Press', type: 'reps', muscles: ['shoulders', 'triceps'], aliases: ['shoulder press machine', 'seated machine shoulder press'] },
  { name: 'Arnold Press', type: 'reps', muscles: ['shoulders', 'triceps'] },
  { name: 'Push Press', type: 'reps', muscles: ['shoulders', 'triceps', 'quads'] },
  { name: 'Landmine Press', type: 'reps', muscles: ['shoulders', 'chest', 'triceps'] },
  { name: 'Dumbbell Lateral Raise', type: 'reps', muscles: ['shoulders'], aliases: ['dumbbell lateral raises', 'lateral raise', 'lateral raises', 'side raise', 'side lateral raise', 'seated lateral raise'] },
  { name: 'Cable Lateral Raise', type: 'reps', muscles: ['shoulders'] },
  { name: 'Lateral-to-Overhead Raise', type: 'reps', muscles: ['shoulders'], aliases: ['lateral to overhead raises', 'full rom lateral raise'] },
  { name: 'Dumbbell Front Raise', type: 'reps', muscles: ['shoulders'], aliases: ['dumbbell front raises', 'front raise', 'front raises', 'plate front raise'] },
  { name: 'Prone Front Raise', type: 'reps', muscles: ['shoulders'], aliases: ['stomach bench front dumbbell raise', 'chest supported front raise', 'incline front raise'] },
  { name: 'Prone Rear Delt Raise', type: 'reps', muscles: ['shoulders', 'back'], aliases: ['stomach bench side dumbbell raise', 'stomach bench side dumbbell raise straight arms', 'chest supported rear delt raise', 'prone reverse fly', 'prone lateral raise', 'incline rear delt raise'] },
  { name: 'Dumbbell Reverse Fly', type: 'reps', muscles: ['shoulders', 'back'], aliases: ['reverse fly', 'rear delt fly', 'bent over reverse fly', 'reverse flye'] },
  { name: 'Machine Reverse Fly', type: 'reps', muscles: ['shoulders', 'back'], aliases: ['shoulder blade machine', 'reverse pec deck', 'rear delt machine', 'reverse butterfly'] },
  { name: 'Face Pull', type: 'reps', muscles: ['shoulders', 'back'], aliases: ['face pull machine', 'cable face pull', 'rope face pull'] },
  { name: 'Upright Row', type: 'reps', muscles: ['shoulders', 'back'], aliases: ['barbell upright row', 'cable upright row'] },
  { name: 'Band External Rotation', type: 'reps', muscles: ['shoulders'], aliases: ['rotator cuff band', 'band rotator cuff', 'external rotation with band', 'rotator cuff'] },
  { name: 'Dumbbell External Rotation', type: 'reps', muscles: ['shoulders'], aliases: ['seated knee up rotator cuff', 'rotator cuff dumbbell', 'side lying external rotation'] },

  // ---------- Biceps ----------
  { name: 'Barbell Curl', type: 'reps', muscles: ['biceps'], aliases: ['barbell bicep curl', 'bb curl', 'standing barbell curl'] },
  { name: 'EZ-Bar Curl', type: 'reps', muscles: ['biceps'], aliases: ['ez curl'] },
  { name: 'Dumbbell Curl', type: 'reps', muscles: ['biceps'], aliases: ['dumbbell bicep curl', 'bicep curl', 'db curl', 'standing dumbbell curl', 'alternating dumbbell curl'] },
  { name: 'Seated Dumbbell Curl', type: 'reps', muscles: ['biceps'], aliases: ['seated bicep curl', 'seated curl', 'seated elbow back bicep curl'] },
  { name: 'Incline Dumbbell Curl', type: 'reps', muscles: ['biceps'], aliases: ['incline curl', 'lie down elbow back bicep curl'] },
  { name: 'Prone Incline Dumbbell Curl', type: 'reps', muscles: ['biceps'], aliases: ['dumbbell stomach bicep curl', 'stomach bicep curl', 'spider curl', 'prone curl'] },
  { name: 'Hammer Curl', type: 'reps', muscles: ['biceps', 'forearms'], aliases: ['dumbbell hammer curl'] },
  { name: 'Preacher Curl', type: 'reps', muscles: ['biceps'], aliases: ['ez bar preacher curl', 'machine preacher curl'] },
  { name: 'Concentration Curl', type: 'reps', muscles: ['biceps'] },
  { name: 'Cable Curl', type: 'reps', muscles: ['biceps'], aliases: ['cable bicep curl', 'bicep curl pull', 'rope cable curl'] },
  { name: 'Reverse Curl', type: 'reps', muscles: ['biceps', 'forearms'], aliases: ['reverse barbell curl', 'reverse grip curl'] },

  // ---------- Triceps ----------
  { name: 'Triceps Pushdown', type: 'reps', muscles: ['triceps'], aliases: ['tricep pulldown', 'tricep pushdown', 'cable pushdown', 'rope pushdown', 'triceps pulldown'] },
  { name: 'Overhead Cable Triceps Extension', type: 'reps', muscles: ['triceps'], aliases: ['overhead cable tricep extension', 'above head back cable triceps pull', 'overhead rope extension', 'overhead cable extension'] },
  { name: 'Overhead Dumbbell Triceps Extension', type: 'reps', muscles: ['triceps'], aliases: ['overhead dumbbell extension', 'seated dumbbell tricep extension', 'french press'] },
  { name: 'Skull Crusher', type: 'reps', muscles: ['triceps'], aliases: ['lying triceps extension', 'ez bar skull crusher'] },
  { name: 'Close-Grip Bench Press', type: 'reps', muscles: ['triceps', 'chest'], aliases: ['close grip bench', 'cgbp'] },
  { name: 'Dumbbell Triceps Kickback', type: 'reps', muscles: ['triceps'], aliases: ['tricep kickback', 'kickback'] },
  { name: 'Bench Dips', type: 'reps', muscles: ['triceps', 'chest'], aliases: ['tricep bench dips'] },

  // ---------- Legs / glutes ----------
  { name: 'Barbell Back Squat', type: 'reps', muscles: ['quads', 'glutes'], aliases: ['squat', 'back squat', 'barbell squat'] },
  { name: 'Front Squat', type: 'reps', muscles: ['quads', 'glutes', 'core'] },
  { name: 'Goblet Squat', type: 'reps', muscles: ['quads', 'glutes'], aliases: ['dumbbell goblet squat', 'kettlebell goblet squat'] },
  { name: 'Hack Squat', type: 'reps', muscles: ['quads', 'glutes'], aliases: ['hack squat machine'] },
  { name: 'Leg Press', type: 'reps', muscles: ['quads', 'glutes'], aliases: ['leg press machine', '45 degree leg press'] },
  { name: 'Bulgarian Split Squat', type: 'reps', muscles: ['quads', 'glutes'], aliases: ['split squat', 'rear foot elevated split squat'] },
  { name: 'Lunges', type: 'reps', muscles: ['quads', 'glutes'], aliases: ['lunge', 'walking lunges', 'dumbbell lunges', 'reverse lunge'] },
  { name: 'Step-Up', type: 'reps', muscles: ['quads', 'glutes'], aliases: ['dumbbell step up', 'box step up'] },
  { name: 'Leg Extension', type: 'reps', muscles: ['quads'], aliases: ['leg extension machine'] },
  { name: 'Leg Curl', type: 'reps', muscles: ['hamstrings'], aliases: ['lying leg curl', 'seated leg curl', 'hamstring curl', 'leg curl machine'] },
  { name: 'Nordic Hamstring Curl', type: 'reps', muscles: ['hamstrings'], aliases: ['nordic curl'] },
  { name: 'Hip Thrust', type: 'reps', muscles: ['glutes', 'hamstrings'], aliases: ['barbell hip thrust'] },
  { name: 'Glute Bridge', type: 'reps', muscles: ['glutes', 'hamstrings'] },
  { name: 'Hip Abduction Machine', type: 'reps', muscles: ['glutes'], aliases: ['hip abduction', 'abductor machine'] },
  // No adductor slug exists — leave untagged rather than mis-tag.
  { name: 'Hip Adduction Machine', type: 'reps', muscles: [], aliases: ['hip adduction', 'adductor machine'] },
  { name: 'Standing Calf Raise', type: 'reps', muscles: ['calves'], aliases: ['calf raise', 'calf raises'] },
  { name: 'Seated Calf Raise', type: 'reps', muscles: ['calves'] },
  { name: 'Barbell Clean', type: 'reps', muscles: ['back', 'glutes', 'hamstrings', 'quads'], aliases: ['clean', 'power clean', 'hang clean'] },
  { name: 'Snatch', type: 'reps', muscles: ['back', 'glutes', 'hamstrings', 'shoulders'], aliases: ['power snatch'] },
  { name: 'Kettlebell Swing', type: 'reps', muscles: ['glutes', 'hamstrings', 'back'], aliases: ['kb swing'] },
  { name: 'Box Jump', type: 'reps', muscles: ['quads', 'glutes', 'calves'] },
  { name: 'Wall Sit', type: 'time', muscles: ['quads'], aliases: ['wall squat hold'] },

  // ---------- Core ----------
  { name: 'Plank', type: 'time', muscles: ['core'], aliases: ['plank hold', 'front plank', 'forearm plank'] },
  { name: 'Side Plank', type: 'time', muscles: ['core'], aliases: ['side to side plank'] },
  { name: 'Crunch', type: 'reps', muscles: ['core'], aliases: ['crunches'] },
  { name: 'Cable Crunch', type: 'reps', muscles: ['core'], aliases: ['kneeling cable crunch', 'rope crunch'] },
  { name: 'Sit-Up', type: 'reps', muscles: ['core'], aliases: ['situp', 'sit ups'] },
  { name: 'Leg Raise', type: 'reps', muscles: ['core'], aliases: ['leg raises', 'lying leg raise', 'leg raises slow negative', 'leg raise core thing'] },
  { name: 'Hanging Leg Raise', type: 'reps', muscles: ['core'], aliases: ['hanging knee raise', 'knee raise'] },
  { name: 'Russian Twist', type: 'reps', muscles: ['core'] },
  { name: 'Ab Wheel Rollout', type: 'reps', muscles: ['core'], aliases: ['ab rollout', 'ab wheel'] },
  { name: 'Mountain Climbers', type: 'time', muscles: ['core'], aliases: ['mountain climber'] },
  { name: 'Core Work (Misc)', type: 'time', muscles: ['core'], aliases: ['ab work misc', 'ab work', 'core work', 'misc abs', 'random abs'] },

  // ---------- Forearms / grip ----------
  { name: 'Dead Hang', type: 'time', muscles: ['forearms', 'back'], aliases: ['bar hang'] },
  { name: "Farmer's Carry", type: 'time', muscles: ['forearms', 'core'], aliases: ['farmers carry', 'farmer walk', 'farmers walk'] },
  { name: 'Wrist Curl', type: 'reps', muscles: ['forearms'], aliases: ['barbell wrist curl', 'dumbbell wrist curl'] },
  { name: 'Reverse Wrist Curl', type: 'reps', muscles: ['forearms'], aliases: ['wrist extension'] },

  // ---------- Cardio / conditioning ----------
  { name: 'Rowing Machine', type: 'time', muscles: ['back', 'quads'], aliases: ['rowing', 'row erg', 'erg', 'concept2 row', 'concept 2', 'indoor rowing'] },
  { name: 'Ski Erg', type: 'time', muscles: ['back', 'triceps', 'core'], aliases: ['skierg', 'ski machine'] },
  { name: 'Running', type: 'time', muscles: ['quads', 'hamstrings', 'calves'], aliases: ['run', 'treadmill run', 'jog', 'jogging'] },
  { name: 'Treadmill Intervals', type: 'time', muscles: ['quads', 'hamstrings', 'calves'], aliases: ['intervals', 'treadmill sprints', 'sprint intervals'] },
  { name: 'Cycling', type: 'time', muscles: ['quads', 'hamstrings', 'calves'], aliases: ['bike', 'stationary bike', 'spin bike', 'exercise bike'] },
  { name: 'Assault Bike', type: 'time', muscles: ['quads'], aliases: ['air bike', 'airdyne', 'fan bike'] },
  { name: 'Elliptical', type: 'time', muscles: ['quads', 'hamstrings'], aliases: ['cross trainer'] },
  { name: 'Stair Climber', type: 'time', muscles: ['quads', 'glutes', 'calves'], aliases: ['stairmaster', 'stair machine', 'stepmill'] },
  { name: 'Jump Rope', type: 'time', muscles: ['calves'], aliases: ['skipping', 'skipping rope'] },
  { name: 'Burpees', type: 'reps', muscles: ['quads', 'chest', 'core'], aliases: ['burpee'] },
  { name: 'Swimming', type: 'time', muscles: ['back', 'shoulders', 'core'], aliases: ['swim'] },
  { name: 'Sled Push', type: 'time', muscles: ['quads', 'glutes'], aliases: ['prowler push'] },
  { name: 'Battle Ropes', type: 'time', muscles: ['shoulders', 'core', 'forearms'], aliases: ['battle rope'] },
];

// Lowercase and collapse all punctuation/whitespace to single spaces so
// "T-Bar Row", "t bar row" and "T Bar Row" share one lookup key. Aliases
// therefore never need punctuation variants.
function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// name/alias (normalized) -> entry. Canonical names win over aliases so an
// alias can never shadow another entry's canonical name.
const byKey = new Map();
for (const e of CATALOG) {
  const key = normalizeName(e.name);
  if (byKey.has(key)) throw new Error(`exercise-catalog: duplicate canonical name "${e.name}"`);
  if (e.type !== 'reps' && e.type !== 'time') throw new Error(`exercise-catalog: bad type on "${e.name}"`);
  for (const m of e.muscles) {
    if (!MUSCLE_SLUGS.includes(m)) throw new Error(`exercise-catalog: unknown muscle "${m}" on "${e.name}"`);
  }
  byKey.set(key, e);
}
for (const e of CATALOG) {
  for (const a of e.aliases || []) {
    const key = normalizeName(a);
    if (!byKey.has(key)) byKey.set(key, e);
  }
}

// Exact lookup by canonical name or alias (normalized). Used server-side to
// give catalog muscle tags precedence over the keyword heuristics.
function findCatalogEntry(name) {
  return byKey.get(normalizeName(name)) || null;
}

module.exports = { CATALOG, MUSCLE_SLUGS, findCatalogEntry, normalizeName };
