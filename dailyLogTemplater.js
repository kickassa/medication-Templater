<%*
async function main() {
/* ------------------------------------------------
   1) Load external JSON config
------------------------------------------------ */
const cfgFile = tp.file.find_tfile("dailyLogConfig");
if (!cfgFile) throw new Error("dailyLogConfig note not found");
const raw = (await app.vault.read(cfgFile))
  .replace(/^```json\s*/m, "")
  .replace(/^```/m, "")
  .replace(/```$/, "")
  .trim();
let cfg;
try { cfg = JSON.parse(raw); } catch (e) { throw new Error("JSON parse error: " + e.message); }

const medDefaults = cfg.medDefaults || {};
const logItems    = cfg["log items"] || [];

/* ------------------------------------------------
   2) Time helpers
------------------------------------------------ */
function timeLabelShort(h) {
  if (h < 5)  return "Late Night";          // 00‑05
  if (h < 7)  return "Early Morning";      // 05‑07
  if (h < 10) return "Morning";            // 07‑10
  if (h < 12) return "Late Morning";       // 10‑12
  if (h === 12) return "Noon";             // 12:00
  if (h < 15) return "Early Afternoon";    // 12‑15
  if (h < 17) return "Late Afternoon";     // 15‑17
  if (h < 19) return "Early Evening";      // 17‑19
  if (h < 21) return "Evening";            // 19‑21
  return "Night";                          // 21‑24
}
function getTimeDescription(t) {
  return timeLabelShort(+t.split(":" )[0]);
}
const pickerLabels = [
  "Late Night (0:00–5:00)",
  "Early Morning (5:00–7:00)",
  "Morning (7:00–10:00)",
  "Late Morning (10:00–12:00)",
  "Noon (12:00)",
  "Early Afternoon (12:00–15:00)",
  "Late Afternoon (15:00–17:00)",
  "Early Evening (17:00–19:00)",
  "Evening (19:00–21:00)",
  "Night (21:00–0:00)"
];

function parseQty(s) {
  s = s.trim();
  if (s.includes("/")) {
    const [n, d] = s.split("/").map(Number);
    if (!isNaN(n) && !isNaN(d) && d) return n / d;
  }
  return parseFloat(s);
}

function ensureTodaysHeading() {
  if (!noteContent.includes(todayHeading)) {
    // guarantee exactly one blank line before heading
    noteContent = noteContent.replace(/\n+$/, "\n\n");
    noteContent += `${todayHeading}\n`;
  }
}

async function saveContent() {
  const thisFile = tp.file.find_tfile(tp.file.title);
  await app.vault.modify(thisFile, noteContent);
}

/* ------------------------------------------------
   3) Date setup
------------------------------------------------ */
const todayStr     = tp.date.now("YYYY-MM-DD");
const yesterdayStr = tp.date.now("YYYY-MM-DD", -1);
const todayHeading     = `### ${todayStr}`;
const yesterdayHeading = `### ${yesterdayStr}`;
let noteContent   = tp.file.content;

/* ------------------------------------------------
   4) Build menu hierarchy
------------------------------------------------ */
const mainMenu = ["Medication", "Sleep Session", "Other Logs"];
const firstPick = await tp.system.suggester(mainMenu, mainMenu);

/* ------------------------------------------------
   5) Medication flow with flexible timestamp
------------------------------------------------ */
if (firstPick === "Medication") {
  ensureTodaysHeading();
  noteContent = noteContent.replace(/\n+$/, "\n\n");

  const selected = [];
  const categories = Object.keys(medDefaults);
  while (true) {
    const catChoice = await tp.system.suggester(categories, categories);
    const medGroup = medDefaults[catChoice];
    const meds = Array.isArray(medGroup) ? medGroup : Object.keys(medGroup);
    const medChoice = await tp.system.suggester(meds, meds);
    let entry = medChoice;
    if (!Array.isArray(medGroup)) {
      const info = medGroup[medChoice];
      if (info && Array.isArray(info.Formulations)) {
        const formChoice = await tp.system.suggester(info.Formulations, info.Formulations);
        const qtyInput = await tp.system.prompt("Quantity (dec / fraction)", "1");
        const qty = parseQty(qtyInput);
        const qtyPart = (qty !== 1 && !isNaN(qty) && qty !== 0) ? ` x ${qty}` : "";
        entry = `${medChoice} (${formChoice}${qtyPart})`;
      } else {
        const qtyInput = await tp.system.prompt("Quantity (dec / fraction)", "1");
        const qty = parseQty(qtyInput);
        if (qty !== 1 && !isNaN(qty) && qty !== 0) {
          const { dose, unit } = info;
          entry = `${medChoice} (${dose} x ${qty} ${unit})`;
        }
      }
    }
    selected.push(entry);
    const act = await tp.system.suggester(["Add more", "Done"], ["Add more", "Done"]);
    if (act === "Done") break;
  }

  const timeMode = await tp.system.suggester(["Now","Pick a TimeDescription"],["Now","Pick a TimeDescription"]);
  let headingLine;
  if (timeMode === "Now") {
    const nowRaw = tp.date.now("HH:mm");
    headingLine = `${nowRaw} ${getTimeDescription(nowRaw)}`;
  } else {
    headingLine = await tp.system.suggester(pickerLabels, pickerLabels);
  }

  noteContent += `${headingLine}\n`;
  selected.forEach(m => noteContent += `   ${m}\n`);
  await saveContent();
  return;
}

/* ------------------------------------------------
   6) Sleep Session flow (unchanged from V2)
------------------------------------------------ */
if (firstPick === "Sleep Session") {
  const sessionRange = () => `${moment(yesterdayStr).format("MMM D")}-${moment(todayStr).format("D, YYYY")}`;
  const userREM  = await tp.system.prompt("Enter your REM duration:", "00h 00m");
  const userDeep = await tp.system.prompt("Enter your Deep duration:", "00h 00m");
  const block = `##### Sleep Session ${sessionRange()}\n<div style=\"color:blue; font-family:Helvetica\">\nREM<br>\n${userREM}<br>\nDeep<br>\n${userDeep}\n</div>`;
  const idxY = noteContent.indexOf(yesterdayHeading);
  const idxT = noteContent.indexOf(todayHeading);
  const insertClean = (b, ins, a) => b.replace(/\n+$/, "\n") + ins.trim() + "\n" + a.replace(/^\n+/, "");
  if (idxY !== -1 && idxT !== -1) {
    const next = noteContent.indexOf("\n### ", idxY + yesterdayHeading.length);
    if (next === -1 || next === idxT - 1) {
      noteContent = insertClean(noteContent.slice(0, idxT), "\n" + block, noteContent.slice(idxT));
    } else throw new Error("Unexpected heading between yesterday and today.");
  } else if (idxY !== -1 && idxT === -1) {
    noteContent = noteContent.replace(/\n+$/, "\n") + block + "\n";
  } else if (idxY === -1 && idxT !== -1) {
    noteContent = insertClean(noteContent.slice(0, idxT), "\n" + block, noteContent.slice(idxT));
  } else throw new Error("Neither yesterday's nor today's heading found.");
  await saveContent();
  return;
}

/* ------------------------------------------------
   7) Other Logs sub‑menu
------------------------------------------------ */
if (firstPick === "Other Logs") {
  if (!logItems.length) throw new Error("No custom log items defined.");
  const pick = await tp.system.suggester(logItems, logItems);
  ensureTodaysHeading();
  noteContent = noteContent.replace(/\n+$/, "\n\n");
  const nowRaw = tp.date.now("HH:mm");
  noteContent += `${nowRaw} ${getTimeDescription(nowRaw)}\n   ${pick}:\n`;
  await saveContent();
  return;
}

throw new Error("Unexpected menu selection");
} // end main()

await main();
-%>
