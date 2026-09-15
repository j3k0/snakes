// v7 Feature C: Quest Board — acceptance-criteria tests.
// Drives the real game via page.evaluate to verify determinism, progress
// tracking, the parallel session-end hooks, atomic claim, panel render, the
// Q keybinding, and the midnight-boundary rotation.
import { chromium } from 'playwright';

const FILE = 'file://' + new URL('./snake.html', import.meta.url).pathname;

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(FILE, { waitUntil: 'networkidle' });

  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn(page);
      console.log('  PASS  ' + name);
    } catch (e) {
      failed++;
      console.log('  FAIL  ' + name + '\n        ' + (e && e.message ? e.message : e));
    }
  }
  console.log('\n' + (failed === 0 ? 'ALL GREEN' : failed + ' FAILED') + ' (' + (tests.length - failed) + '/' + tests.length + ')');
  if (errors.length) console.log('Console errors during run:\n - ' + errors.join('\n - '));
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
}

// Clean slate: wipe persisted quests so syncQuestState generates fresh ones.
async function setup(page) {
  await page.evaluate(() => {
    localStorage.removeItem('snake_daily_quests');
    localStorage.removeItem('snake_weekly_quests');
    localStorage.removeItem('snake_daily_quest_date');
    localStorage.removeItem('snake_weekly_quest_date');
    gameMode = 'classic';
    resetGame();
    startGame();
    stopGameLoop();
    rivals = [];
    obstacles = [];
    activeBrews = [];
    activeMutators = [];
    shieldActive = false;
    slowMoActive = false;
    score = 0;
    syncQuestState();
  });
}

// --- Config shape ---

test('QUEST_TEMPLATES has 20 templates with required fields', async (page) => {
  const bad = await page.evaluate(() => {
    if (!Array.isArray(QUEST_TEMPLATES) || QUEST_TEMPLATES.length !== 20) return 'count=' + (QUEST_TEMPLATES ? QUEST_TEMPLATES.length : 'undef');
    for (const t of QUEST_TEMPLATES) {
      if (!t.id || !t.desc || !t.progressKey) return 'missing field in ' + (t.id || '?');
      if (!Array.isArray(t.daily) || !Array.isArray(t.weekly)) return 'missing target pools in ' + t.id;
      if (typeof t.xpDaily !== 'number' || typeof t.xpWeekly !== 'number') return 'missing xp in ' + t.id;
    }
    return null;
  });
  if (bad) throw new Error(bad);
});

test('every template progressKey has a QUEST_PROGRESS_MAP reader', async (page) => {
  const bad = await page.evaluate(() => {
    const keys = new Set(QUEST_TEMPLATES.map(t => t.progressKey));
    for (const k of keys) {
      if (typeof QUEST_PROGRESS_MAP[k] !== 'function') return 'no reader for ' + k;
    }
    return null;
  });
  if (bad) throw new Error(bad);
});

test('at least 3 daily-eligible and 3 weekly-eligible templates', async (page) => {
  const counts = await page.evaluate(() => ({
    daily: QUEST_TEMPLATES.filter(t => t.daily.length > 0).length,
    weekly: QUEST_TEMPLATES.filter(t => t.weekly.length > 0).length,
  }));
  if (counts.daily < 3) throw new Error('only ' + counts.daily + ' daily-eligible');
  if (counts.weekly < 3) throw new Error('only ' + counts.weekly + ' weekly-eligible');
});

// --- Deterministic generation ---

test('3 daily quests generate deterministically from day seed', async (page) => {
  await setup(page);
  const { a, b } = await page.evaluate(() => {
    a = JSON.stringify(generateQuests('daily'));
    b = JSON.stringify(generateQuests('daily'));
    return { a, b };
  });
  if (JSON.parse(a).length !== 3) throw new Error('expected 3 daily quests');
  if (a !== b) throw new Error('daily generation not deterministic');
});

test('3 weekly quests generate deterministically from ISO week seed', async (page) => {
  await setup(page);
  const { a, b } = await page.evaluate(() => {
    a = JSON.stringify(generateQuests('weekly'));
    b = JSON.stringify(generateQuests('weekly'));
    return { a, b };
  });
  if (JSON.parse(a).length !== 3) throw new Error('expected 3 weekly quests');
  if (a !== b) throw new Error('weekly generation not deterministic');
});

test('daily and weekly quests differ (distinct period seeds)', async (page) => {
  await setup(page);
  const same = await page.evaluate(() => {
    return JSON.stringify(generateQuests('daily')) === JSON.stringify(generateQuests('weekly'));
  });
  if (same) throw new Error('daily and weekly identical');
});

test('generated quests have distinct templateIds within a period', async (page) => {
  await setup(page);
  const dup = await page.evaluate(() => {
    const pick = period => generateQuests(period).map(q => q.templateId);
    const d = pick('daily');
    const w = pick('weekly');
    const dupDay = new Set(d).size !== d.length;
    const dupWeek = new Set(w).size !== w.length;
    return { dupDay, dupWeek };
  });
  if (dup.dupDay) throw new Error('duplicate templateId in daily quests');
  if (dup.dupWeek) throw new Error('duplicate templateId in weekly quests');
});

test('getISOWeekString matches YYYY-Www format', async (page) => {
  const s = await page.evaluate(() => getISOWeekString());
  if (!/^\d{4}-W\d{2}$/.test(s)) throw new Error('bad ISO week format: ' + s);
});

// --- Progress tracking ---

test('checkQuestProgress advances run-based metrics monotonically', async (page) => {
  await setup(page);
  // Inject a daily length quest with an easy target, then grow the snake.
  const res = await page.evaluate(() => {
    dailyQuests = [instantiateQuest(
      QUEST_TEMPLATES.find(t => t.id === 'reach_length'), 5, 'daily')];
    // Grow snake to length 7
    while (snake.length < 7) snake.push({ x: 0, y: snake.length * 20 });
    checkQuestProgress();
    const before = dailyQuests[0].progress;
    // Shrink must NOT reduce progress (monotonic max)
    snake.length = 3;
    checkQuestProgress();
    return { before, after: dailyQuests[0].progress, completed: dailyQuests[0].completed };
  });
  if (res.before !== 7) throw new Error('progress should be 7, got ' + res.before);
  if (res.after !== 7) throw new Error('progress regressed to ' + res.after);
  if (!res.completed) throw new Error('should be completed (7 >= 5)');
});

test('checkQuestProgress tracks score, food, and combo', async (page) => {
  await setup(page);
  const res = await page.evaluate(() => {
    dailyQuests = [
      instantiateQuest(QUEST_TEMPLATES.find(t => t.id === 'score_target'), 100, 'daily'),
      instantiateQuest(QUEST_TEMPLATES.find(t => t.id === 'eat_food'), 5, 'daily'),
      instantiateQuest(QUEST_TEMPLATES.find(t => t.id === 'combo_target'), 3, 'daily'),
    ];
    score = 150; sessionFoodEaten = 6; sessionMaxCombo = 4;
    checkQuestProgress();
    return dailyQuests.map(q => ({ id: q.templateId, p: q.progress, done: q.completed }));
  });
  for (const r of res) {
    if (!r.done) throw new Error(r.id + ' not completed: ' + JSON.stringify(r));
  }
  if (res[0].p !== 150) throw new Error('score progress wrong');
  if (res[1].p !== 6) throw new Error('food progress wrong');
  if (res[2].p !== 4) throw new Error('combo progress wrong');
});

test('checkQuestProgress skips already-completed quests', async (page) => {
  await setup(page);
  const res = await page.evaluate(() => {
    dailyQuests = [instantiateQuest(QUEST_TEMPLATES.find(t => t.id === 'score_target'), 100, 'daily')];
    score = 150;
    checkQuestProgress();
    const claimedState = dailyQuests[0].completed;
    // Lower score after completion — must stay completed (monotonic)
    score = 10;
    checkQuestProgress();
    return { wasDone: claimedState, stillDone: dailyQuests[0].completed, progress: dailyQuests[0].progress };
  });
  if (!res.wasDone || !res.stillDone) throw new Error('completed flag regressed');
  if (res.progress !== 150) throw new Error('progress regressed to ' + res.progress);
});

// --- Parallel session-end hooks ---

test('checkQuestProgress is called in BOTH gameOver and endZenSession', async (page) => {
  const src = await page.evaluate(() => ({
    go: gameOver.toString(),
    zen: endZenSession.toString(),
  }));
  if (!src.go.includes('checkQuestProgress')) throw new Error('gameOver missing checkQuestProgress');
  if (!src.zen.includes('checkQuestProgress')) throw new Error('endZenSession missing checkQuestProgress');
});

test('food-eat block calls checkQuestProgress', async (page) => {
  const src = await page.evaluate(() => updateGame.toString());
  if (!src.includes('checkQuestProgress')) throw new Error('updateGame (food-eat) missing checkQuestProgress');
});

// --- Atomic claim ---

test('XP claim is atomic and idempotent', async (page) => {
  await setup(page);
  const res = await page.evaluate(() => {
    dailyQuests = [instantiateQuest(QUEST_TEMPLATES.find(t => t.id === 'score_target'), 100, 'daily')];
    score = 150;
    checkQuestProgress();
    const xpBefore = xp;
    claimQuest('daily', 0);
    const xpAfter1 = xp;
    const claimed1 = dailyQuests[0].claimed;
    const persistedClaimed = saveManager.getJSON('snake_daily_quests', [{}])[0].claimed;
    // Second claim must NOT double-award
    claimQuest('daily', 0);
    const xpAfter2 = xp;
    return {
      awarded: xpAfter1 - xpBefore,
      claimed1, persistedClaimed,
      doubleAward: xpAfter2 - xpAfter1,
      reward: dailyQuests[0].reward.xp,
    };
  });
  if (!res.claimed1) throw new Error('quest not marked claimed');
  if (!res.persistedClaimed) throw new Error('claimed flag not persisted');
  if (res.awarded !== res.reward) throw new Error('awarded ' + res.awarded + ' != reward ' + res.reward);
  if (res.doubleAward !== 0) throw new Error('double-awarded ' + res.doubleAward + ' XP');
});

// --- Panel render ---

test('Quest panel renders progress bars and claim buttons', async (page) => {
  await setup(page);
  const html = await page.evaluate(() => {
    dailyQuests = [instantiateQuest(QUEST_TEMPLATES.find(t => t.id === 'score_target'), 100, 'daily')];
    weeklyQuests = [instantiateQuest(QUEST_TEMPLATES.find(t => t.id === 'length_high'), 75, 'weekly')];
    // Complete the daily so a claim button renders
    score = 150;
    checkQuestProgress();
    renderQuests();
    return document.getElementById('questsPanel').innerHTML;
  });
  if (!html.includes('QUESTS')) throw new Error('header missing');
  if (!html.includes('Daily')) throw new Error('daily section missing');
  if (!html.includes('Weekly')) throw new Error('weekly section missing');
  if (!html.includes('width:')) throw new Error('progress bar missing');
  if (!html.includes('Claim +')) throw new Error('claim button missing');
});

test('renderQuests marks claimed quests and shows no claim button', async (page) => {
  await setup(page);
  const html = await page.evaluate(() => {
    dailyQuests = [instantiateQuest(QUEST_TEMPLATES.find(t => t.id === 'score_target'), 100, 'daily')];
    score = 150;
    checkQuestProgress();
    claimQuest('daily', 0);
    renderQuests();
    return document.getElementById('questsPanel').innerHTML;
  });
  if (!html.includes('Claimed')) throw new Error('claimed state not shown');
  if (html.includes('Claim +')) throw new Error('claim button shown on already-claimed quest');
});

// --- Q keybinding ---

test('Q key opens and closes the quests panel in idle state', async (page) => {
  await setup(page);
  await page.evaluate(() => { resetGame(); gameState = 'idle'; });
  await page.evaluate(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' })); });
  let display = await page.evaluate(() => document.getElementById('questsPanel').style.display);
  if (display !== 'block') throw new Error('panel not opened (display=' + display + ')');
  await page.evaluate(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' })); });
  display = await page.evaluate(() => document.getElementById('questsPanel').style.display);
  if (display !== 'none') throw new Error('panel not closed (display=' + display + ')');
});

test('Q key is ignored during playing state', async (page) => {
  await setup(page);
  await page.evaluate(() => { gameState = 'playing'; });
  await page.evaluate(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' })); });
  const display = await page.evaluate(() => document.getElementById('questsPanel').style.display);
  if (display === 'block') throw new Error('panel opened during gameplay');
});

// --- Midnight boundary ---

test('stale daily date triggers regeneration (resets claimed state)', async (page) => {
  await setup(page);
  const res = await page.evaluate(() => {
    // Persist a daily quest that looks already claimed + completed, with a STALE date.
    const stale = [Object.assign(instantiateQuest(
      QUEST_TEMPLATES.find(t => t.id === 'score_target'), 100, 'daily'),
      { completed: true, claimed: true, progress: 100 })];
    saveManager.setJSON('snake_daily_quests', stale);
    saveManager.set('snake_daily_quest_date', '2000-01-01');
    syncQuestState();
    const storedDate = saveManager.get('snake_daily_quest_date', '');
    return {
      claimed: dailyQuests[0].claimed,
      completed: dailyQuests[0].completed,
      progress: dailyQuests[0].progress,
      storedDate,
      today: getDayString(),
    };
  });
  if (res.storedDate !== res.today) throw new Error('stored date not refreshed to today: ' + res.storedDate);
  if (res.claimed) throw new Error('stale date did not reset claimed state (regeneration failed)');
  if (res.completed) throw new Error('stale date did not reset completed state');
  if (res.progress !== 0) throw new Error('stale date did not reset progress');
});

test('fresh date restores persisted quests instead of regenerating', async (page) => {
  await setup(page);
  const res = await page.evaluate(() => {
    // Persist current quests, then re-sync with a FRESH date — should restore
    const snapshot = JSON.stringify(dailyQuests);
    persistQuests();
    syncQuestState();
    return { snapshot, after: JSON.stringify(dailyQuests) };
  });
  if (res.snapshot !== res.after) throw new Error('fresh-date sync clobbered persisted quests');
});

// --- Persistence keys ---

test('persistence uses the documented saveManager keys', async (page) => {
  await setup(page);
  const keys = await page.evaluate(() => {
    persistQuests();
    return {
      dq: localStorage.getItem('snake_daily_quests') !== null,
      wq: localStorage.getItem('snake_weekly_quests') !== null,
      dd: localStorage.getItem('snake_daily_quest_date') !== null,
      wd: localStorage.getItem('snake_weekly_quest_date') !== null,
    };
  });
  for (const k in keys) if (!keys[k]) throw new Error('missing persistence key: ' + k);
});

run();
