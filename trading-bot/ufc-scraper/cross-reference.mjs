/**
 * Cross-reference @7thenumber7 picks against GG33 scores
 * Uses the same scoring logic as the MMA Astrology app
 */

// Same helper functions as test-gg33.mjs
function reduceToLifePath(num) {
  if ([11, 22, 33, 44].includes(num)) return num;
  if ([13, 19, 28].includes(num)) return num;
  if (num === 20) return 11;
  while (num > 9) {
    num = String(num).split('').reduce((s, d) => s + parseInt(d), 0);
    if ([11, 22, 33, 44, 13, 19, 28].includes(num)) return num;
    if (num === 20) return 11;
  }
  return num;
}

function calculateLifePath(birthDate) {
  const [year, month, day] = birthDate.split('-').map(Number);
  const total = `${month}${day}${year}`.split('').reduce((s, d) => s + parseInt(d), 0);
  return reduceToLifePath(total);
}

function calculatePersonalYear(birthDate, eventDate) {
  const [, birthMonth, birthDay] = birthDate.split('-').map(Number);
  const [eventYear, eventMonth, eventDay] = eventDate.split('-').map(Number);
  let yearToUse = eventYear;
  if (eventMonth < birthMonth || (eventMonth === birthMonth && eventDay < birthDay)) yearToUse = eventYear - 1;
  const sum = birthMonth + birthDay + yearToUse;
  if (sum === 19) return 19;
  if (sum === 20) return 11;
  return reduceToLifePath(sum);
}

const ZODIAC_CYCLE = ['Monkey','Rooster','Dog','Pig','Rat','Ox','Tiger','Cat','Dragon','Snake','Horse','Goat'];
function getZodiacFromYear(year) { return ZODIAC_CYCLE[year % 12]; }
function getZodiacForDate(dateStr) {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  // CNY 2026 = Feb 17
  if (year === 2026 && date < new Date('2026-02-17')) return getZodiacFromYear(2025); // Snake
  return getZodiacFromYear(year);
}

const TRINES = { fire: ['Snake','Rooster','Ox'], earth: ['Horse','Dog','Tiger'], water: ['Rat','Dragon','Monkey'], wood: ['Cat','Goat','Pig'] };
const ENEMIES = {Rat:'Horse',Horse:'Rat',Ox:'Goat',Goat:'Ox',Tiger:'Monkey',Monkey:'Tiger',Cat:'Rooster',Rooster:'Cat',Dragon:'Dog',Dog:'Dragon',Snake:'Pig',Pig:'Snake'};
const SOULMATES = {Dragon:'Snake',Snake:'Dragon',Rat:'Ox',Ox:'Rat',Tiger:'Pig',Pig:'Tiger',Cat:'Dog',Dog:'Cat',Horse:'Goat',Goat:'Horse',Monkey:'Rooster',Rooster:'Monkey'};

function getTrine(sign) {
  for (const [name, members] of Object.entries(TRINES)) {
    if (members.includes(sign)) return { name, members };
  }
  return null;
}

function calcAge(bday, eventDate) {
  const b = new Date(bday), e = new Date(eventDate);
  let age = e.getFullYear() - b.getFullYear();
  if (e.getMonth() < b.getMonth() || (e.getMonth() === b.getMonth() && e.getDate() < b.getDate())) age--;
  return age;
}

function calcScore(fighter, eventDate, citySign, opponentSign) {
  const { bday, sign, ufc, extensionYear } = fighter;
  const lp = calculateLifePath(bday);
  const se = parseInt(bday.split('-')[2]);
  const py = calculatePersonalYear(bday, eventDate);
  const age = calcAge(bday, eventDate);
  const yearSign = getZodiacForDate(eventDate);
  const trine = getTrine(sign);
  const inTrine = trine && trine.members.includes(yearSign);
  const inEnemy = ENEMIES[sign] === yearSign;
  const cityEnemy = ENEMIES[sign] === citySign;
  const cityTrine = trine && trine.members.includes(citySign);
  const [,eventMonth, eventDay] = eventDate.split('-').map(Number);
  const [,birthMonth, birthDay] = bday.split('-').map(Number);
  const dayEnergy = reduceToLifePath(eventDay);

  let score = 0;
  const flags = [];
  let vulnCount = 0;

  // Plus
  if (birthMonth === eventMonth && birthDay === eventDay) { score += 5; flags.push('🎂 BIRTHDAY FIGHT +5'); }
  if (birthDay === eventDay && birthMonth !== eventMonth) { score += 4; flags.push(`🔢 Day ${birthDay} match +4`); }
  if (inTrine) { score += 4; flags.push(`🔺 ${sign} TRINE YEAR +4`); }
  if (SOULMATES[sign] === yearSign) { score += 3; flags.push('💕 SOULMATE YEAR +3'); }
  if (age >= 27 && age <= 32) { score += 2; flags.push(`💪 PRIME ${age} +2`); }
  if (lp === dayEnergy || lp === eventDay) { score += 1; flags.push(`LP=${lp} day match +1`); }
  if (cityTrine) { score += 2; flags.push('City trine +2'); }
  if (SOULMATES[sign] === citySign) { score += 1; flags.push('City soulmate +1'); }
  
  // Contract
  const ufcTrine = trine && trine.members.includes(ufc);
  const ufcEnemy = ENEMIES[sign] === ufc;
  if (ufcTrine) { score += 2; flags.push('📝 TRINE CONTRACT +2'); }
  if (ufcEnemy) { score -= 2; flags.push('❌ ENEMY CONTRACT -2'); }
  if (ENEMIES[yearSign] === ufc) { score -= 3; flags.push('💔 BROKEN CONTRACT -3'); vulnCount++; }
  if (extensionYear) {
    const extTrine = trine && trine.members.includes(extensionYear);
    const extEnemy = ENEMIES[sign] === extensionYear;
    if (extTrine) { score += 1; flags.push('📑 TRINE EXT +1'); }
    if (extEnemy) { score -= 1; flags.push('⚠️ ENEMY EXT -1'); }
  }

  // Dragon durability
  if (sign === 'Dragon') { score += 2; flags.push('🐉 DRAGON +2'); }
  // vs enemy sign
  if (opponentSign && ENEMIES[sign] === opponentSign) { score += 2; flags.push('⚔️ VS ENEMY +2'); }

  // Near birthday
  const eventObj = new Date(eventDate.split('-').map(Number).join('-'));
  const bdayThisYear = new Date(`${eventDate.split('-')[0]}-${String(birthMonth).padStart(2,'0')}-${String(birthDay).padStart(2,'0')}`);
  const daysDiff = Math.abs(Math.floor((eventObj - bdayThisYear) / 86400000));
  if (daysDiff > 0 && daysDiff <= 7) { score += 2; flags.push(`Near bday ${daysDiff}d +2`); }

  // Minus
  if (inEnemy) { score -= 3; flags.push(`🚫 ENEMY YEAR -3`); vulnCount++; }
  if (py === 7) { score -= 2; flags.push('⚠️ PY7 -2'); vulnCount++; }
  if (py === 19) { score -= 2; flags.push('⚠️ PY19 -2'); vulnCount++; }
  if (py === 9) { score -= 3; flags.push('🔚 PY9 -3'); vulnCount++; }
  if (py === 11 || py === 22 || py === 33) { score += 1; flags.push(`Master PY${py} +1`); }
  if (se === 7 || se === 19) { score -= 2; flags.push(`⚠️ 2°=${se} -2`); vulnCount++; }
  // Reduced secondary check
  if (se !== 7 && se !== 19 && se !== 11 && se !== 22 && se !== 13 && se !== 28) {
    let red = se; while (red > 9) { red = String(red).split('').reduce((s,d)=>s+parseInt(d),0); if ([11,22,13,28].includes(red)) break; }
    if (red === 7) { score -= 2; flags.push(`⚠️ 2°=${se}→7 -2`); vulnCount++; }
  }
  if (cityEnemy) { score -= 2; flags.push('City enemy -2'); }
  if (age >= 38) { score -= 2; flags.push(`👴 PAST PRIME ${age} -2`); vulnCount++; }
  else if (age >= 35) { score -= 1; flags.push(`Declining ${age} -1`); }

  // 7/19 stacking
  const has7or19 = lp === 7 || lp === 19 || se === 7 || se === 19;
  if (has7or19 && (py === 7 || py === 19)) { score -= 2; flags.push('💥 7/19 STACKED -2'); vulnCount++; }
  if (lp === 7 && se === 7) { score -= 2; flags.push('⚠️ DOUBLE 7 -2'); vulnCount++; }

  // Vulnerability stack multiplier
  if (vulnCount >= 3) { score -= 3; flags.push(`🚨🚨🚨 ${vulnCount}x VULN STACK -3`); }
  else if (vulnCount >= 2) { score -= 2; flags.push(`🚨 ${vulnCount}x VULN STACK -2`); }

  return { score, lp, se, py, age, sign, flags, vulnCount };
}

// ═══ UFC 324 DATA ═══
// Event: Jan 24, 2026, Las Vegas (Snake city), Snake year
const ufc324 = {
  name: 'UFC 324: Gaethje vs Pimblett',
  date: '2026-01-24',
  citySign: 'Snake', // Las Vegas
  picks: [
    {
      pickName: 'HOKIT',
      pick: { bday: '1998-03-28', sign: 'Ox', ufc: 'Snake' },
      opponent: { name: 'Denzel Freeman', bday: '1991-07-12', sign: 'Goat', ufc: 'Snake' },
      result: 'WIN', units: '?', type: 'Parlay leg', notes: 'Cashes 1st legs of 2 parlays',
    },
    {
      pickName: 'KRYLOV (dog)',
      pick: { bday: '1992-04-17', sign: 'Monkey', ufc: 'Dog' },
      opponent: { name: 'Modestas Bukauskas', bday: '1996-11-28', sign: 'Rat', ufc: 'Tiger' },
      result: 'WIN', units: '?', type: 'Dog / parlay', notes: 'LIVE DOG KRYLOV SMASHED HIM SUBS',
    },
    {
      pickName: 'CORTEZ-ACOSTA',
      pick: { bday: '1991-06-24', sign: 'Goat', ufc: 'Tiger' },
      opponent: { name: 'Derrick Lewis', bday: '1985-02-07', sign: 'Rat', ufc: 'Snake' },
      result: 'WIN', units: '?', type: 'Parlay leg', notes: 'Checks leg 1',
    },
    {
      pickName: 'NATALIA SILVA (over Rose)',
      pick: { bday: '1996-06-28', sign: 'Rat', ufc: 'Rat' },
      opponent: { name: 'Rose Namajunas', bday: '1992-06-29', sign: 'Monkey', ufc: 'Horse' },
      result: 'WIN', units: '?', type: 'Parlay', notes: 'Couple big dogs for minimal risk',
    },
  ],
};

// ═══ UFC 325 DATA ═══  
// Event: Feb 1, 2026, Sydney (Goat city), Snake year
const ufc325 = {
  name: 'UFC 325: Volkanovski vs Lopes 2',
  date: '2026-02-01',
  citySign: 'Goat', // Sydney
  picks: [
    {
      pickName: 'OFLI (dog)',
      // Need to identify which fighter "Ofli" is — likely Abubakar Nurmagomedov's opponent or similar
      // Checking UFC 325 card... This might be a nickname. Let me use placeholder.
      pick: null, // Unknown — Si needs to ID this fighter
      opponent: null,
      result: 'WIN', units: '?', type: 'Dog', notes: 'BIG DOGGIE GIVES US A DUB',
    },
    {
      pickName: 'RUFFY',
      pick: { bday: '1997-07-07', sign: 'Ox', ufc: 'Dog' }, // Mauricio Ruffy — estimated bday
      opponent: null, // Need to ID opponent
      result: 'WIN', units: '2', type: 'Straight', notes: '2 UNIT CASH',
    },
    {
      pickName: 'SAINT-DENIS/HOOKER Under 2.5',
      pick: null, // Prop bet, not a fighter pick per se
      opponent: null,
      result: 'WIN', units: '2', type: 'Prop (Under rounds)', notes: 'Fight not to start round 3',
    },
    {
      pickName: 'VOLK + Under 4.5',
      pick: { bday: '1988-09-21', sign: 'Dragon', ufc: 'Dog' }, // Volkanovski
      opponent: { name: 'Diego Lopes', bday: '1995-06-14', sign: 'Pig', ufc: 'Dog' },
      result: 'WIN', units: '?', type: '2 plays (win + under)', notes: 'Cashes 2 plays under 4.5',
    },
  ],
};

// ═══ RUN ANALYSIS ═══
console.log('═══════════════════════════════════════════════════════════');
console.log('  @7thenumber7 PICKS vs GG33 COSMIC SCORES');
console.log('═══════════════════════════════════════════════════════════\n');

for (const event of [ufc324, ufc325]) {
  console.log(`\n▶ ${event.name} (${event.date}) — City: ${event.citySign}`);
  console.log(`  Year Sign: ${getZodiacForDate(event.date)}`);
  console.log('─'.repeat(60));

  for (const p of event.picks) {
    console.log(`\n  📌 PICK: ${p.pickName} — ${p.result} ${p.units ? `(${p.units}u)` : ''}`);
    console.log(`     Type: ${p.type} | ${p.notes}`);

    if (p.pick) {
      const pickScore = calcScore(p.pick, event.date, event.citySign, p.opponent?.sign);
      console.log(`     ${p.pickName}: GG33 = ${pickScore.score >= 0 ? '+' : ''}${pickScore.score} | ${pickScore.sign} | LP${pickScore.lp} PY${pickScore.py} Age${pickScore.age}`);
      if (pickScore.flags.length) console.log(`       ${pickScore.flags.join(', ')}`);

      if (p.opponent) {
        const oppScore = calcScore(p.opponent, event.date, event.citySign, p.pick.sign);
        console.log(`     ${p.opponent.name}: GG33 = ${oppScore.score >= 0 ? '+' : ''}${oppScore.score} | ${oppScore.sign} | LP${oppScore.lp} PY${oppScore.py} Age${oppScore.age}`);
        if (oppScore.flags.length) console.log(`       ${oppScore.flags.join(', ')}`);

        const diff = pickScore.score - oppScore.score;
        const emoji = diff > 0 ? '✅' : diff < 0 ? '⚠️' : '➖';
        console.log(`     ${emoji} SCORE DIFF: ${diff >= 0 ? '+' : ''}${diff} (Pick ${diff > 0 ? 'favored' : diff < 0 ? 'UNFAVORED' : 'even'} by GG33)`);
        
        // Check if he's fading the lower score
        if (oppScore.vulnCount >= 2) {
          console.log(`     🎯 OPPONENT HAS ${oppScore.vulnCount}x VULNERABILITIES — possible FADE target`);
        }
      }
    } else {
      console.log(`     ⚠️ Fighter not identified — needs manual ID from card`);
    }
  }
}

console.log('\n\n═══════════════════════════════════════════════════════════');
console.log('  PATTERN ANALYSIS');
console.log('═══════════════════════════════════════════════════════════\n');

// Count picks where pick had higher score vs opponent
let picksWithData = 0, picksHigherScore = 0, picksLowerScore = 0, picksFadingVulnerable = 0;

for (const event of [ufc324, ufc325]) {
  for (const p of event.picks) {
    if (p.pick && p.opponent) {
      picksWithData++;
      const pickScore = calcScore(p.pick, event.date, event.citySign, p.opponent?.sign);
      const oppScore = calcScore(p.opponent, event.date, event.citySign, p.pick.sign);
      if (pickScore.score > oppScore.score) picksHigherScore++;
      if (pickScore.score < oppScore.score) picksLowerScore++;
      if (oppScore.vulnCount >= 2) picksFadingVulnerable++;
    }
  }
}

console.log(`  Picks with both fighters scored: ${picksWithData}`);
console.log(`  Pick had HIGHER GG33 score: ${picksHigherScore}/${picksWithData}`);
console.log(`  Pick had LOWER GG33 score: ${picksLowerScore}/${picksWithData}`);
console.log(`  Opponent had 2+ vulnerabilities: ${picksFadingVulnerable}/${picksWithData}`);
console.log(`\n  NOTE: Some picks (Ofli, Ruffy, round props) need fighter ID to score.`);
console.log(`  Si — match these against your UFC 325 card and re-run.`);
