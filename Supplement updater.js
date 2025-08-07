<%*
/* ------------------------------------------------
   Supplement-only daily updater
------------------------------------------------ */
async function main() {

  /* 1) Load supplement list from the JSON note */
  const cfgFile = tp.file.find_tfile("supplementDefaultsConfig");
  if (!cfgFile) throw new Error("supplementDefaultsConfig note not found");
  const cfgRaw = (await app.vault.read(cfgFile))
    .replace(/^```json\s*/m, "")
    .replace(/^```/m, "")
    .replace(/```$/, "")
    .trim();
  const cfg = JSON.parse(cfgRaw);
  const supplementList = cfg.supplementDefaults || [];

  /* 2) Helpers ------------------------------------------------ */
  const todayStr = tp.date.now("YYYY-MM-DD");
  const todayHeading = `### ${todayStr}`;

  /** ensure the daily heading exists */
  function ensureToday(noteContent) {
    if (!noteContent.includes(todayHeading)) {
      noteContent = noteContent.replace(/\n+$/, "\n\n") + `${todayHeading}\n`;
    }
    return noteContent;
  }

  /** quick multiselect for supplements */
  async function multiSelectSupplements(source) {
    const out = [];
    while (true) {
      const pick = await tp.system.suggester(source, source);
      if (!out.includes(pick)) out.push(pick);
      const act = await tp.system.suggester(["Add more", "Done"], ["Add more", "Done"]);
      if (act === "Done") break;
    }
    return out;
  }

  /* 3) Read current note & make sure today's heading exists */
  let noteContent = ensureToday(tp.file.content);

  /* 4) Grab most-recent supplement block (if any) and parse current stack */
  let priorStack = [];
  const lastIdx = noteContent.lastIndexOf("##### Supplement Update");
  if (lastIdx !== -1) {
    const block = noteContent.slice(lastIdx);
    const detStart = block.indexOf("<details>");
    const detEnd = block.indexOf("</details>");
    if (detStart !== -1 && detEnd !== -1) {
      const lines = block.slice(detStart, detEnd).match(/\"([^\"]+)\"/g) || [];
      priorStack = lines.map(l => l.replace(/\"/g, "").trim());
    }
  }
  const priorSet = new Set(priorStack);

  /* 5) Interactive add / stop loops -------------------------- */
  let added = [], stopped = [];
  while (true) {
    const step = await tp.system.suggester(
      ["Select Added supplements", "Select Stopped supplements", "Finish"],
      ["Select Added supplements", "Select Stopped supplements", "Finish"]
    );

    if (step.startsWith("Select Added")) {
      const choices = supplementList.filter(s => !priorSet.has(s) && !added.includes(s));
      if (!choices.length) await tp.system.alert("No new supplements to add!");
      else added.push(...await multiSelectSupplements(choices));

    } else if (step.startsWith("Select Stopped")) {
      const choices = priorStack.filter(s => !stopped.includes(s));
      if (!choices.length) await tp.system.alert("Nothing in current stack to stop!");
      else stopped.push(...await multiSelectSupplements(choices));

    } else if (step === "Finish") break;
  }

  /* 6) Derive new current stack */
  let currentStack = priorStack.filter(p => !stopped.includes(p));
  added.forEach(a => { if (!currentStack.includes(a)) currentStack.push(a); });

  /* 7) Build the markdown block ------------------------------ */
  let block = "##### Supplement Update\n";
  if (added.length)   block += `- Added: ${added.map(a => `# ${a}`).join(", ")}\n`;
  if (stopped.length) block += `- Stopped: ${stopped.map(s => `# ${s}`).join(", ")}\n`;
  block += `<details>\n<summary>Current stack (${todayStr})</summary>\n`;
  currentStack.forEach(i => block += `"${i}"\n`);
  block += "</details>\n";

  /* 8) Append block & save ----------------------------------- */
  noteContent = noteContent.replace(/\n+$/, "\n\n") + block;
  await app.vault.modify(tp.file.find_tfile(tp.file.title), noteContent);
}

await main();
-%>
