(() => {
  const $ = (selector) => document.querySelector(selector);
  const input = $("#competitors");
  const count = $("#competitorCount");
  const setup = $("#setupCard");
  const results = $("#results");
  const output = $("#output");
  const modeInput = $("#mode");
  const toast = $("#toast");
  const blacklistKey = "tournament-blacklisted-teams";
  const competitorsKey = "tournament-competitors";
  const blacklistLifetime = 24 * 60 * 60 * 1000;
  const competitorsLifetime = 10 * 24 * 60 * 60 * 1000;
  const bufferSize = 8;
  let state = null;
  let toastTimer;

  const players = () => input.value.split(/[\n,]+/).map((name) => name.trim()).filter(Boolean)
    .filter((name, index, list) => list.indexOf(name) === index);
  const loadCompetitors = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(competitorsKey) || "null");
      if(saved && Array.isArray(saved.players) && Number(saved.expiresAt) > Date.now()) {
        input.value = saved.players.join("\n");
      } else {
        localStorage.removeItem(competitorsKey);
      }
    } catch(error) {
      localStorage.removeItem(competitorsKey);
    }
  };
  const saveCompetitors = (list) => {
    localStorage.setItem(competitorsKey, JSON.stringify({
      players: list,
      expiresAt: Date.now() + competitorsLifetime
    }));
  };
  const showToast = (message) => {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
  };
  const blacklistPairs = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(blacklistKey) || "[]");
      const now = Date.now();
      const entries = Array.isArray(saved)
        ? saved.map((entry) => Array.isArray(entry)
          ? { pair: entry, expiresAt: now + blacklistLifetime }
          : entry)
        : [];
      const active = entries.filter((entry) =>
        entry && Array.isArray(entry.pair) && entry.pair.length === 2
        && Number(entry.expiresAt) > now
      );
      localStorage.setItem(blacklistKey, JSON.stringify(active));
      return active.map((entry) => entry.pair);
    } catch(error) {
      return [];
    }
  };
  const teamKey = (team) => [...team].sort().join("::");
  const blacklistTeam = (team) => {
    const entries = blacklistEntries().filter((entry) => teamKey(entry.pair) !== teamKey(team));
    entries.push({ pair: [...team], expiresAt: Date.now() + blacklistLifetime });
    localStorage.setItem(blacklistKey, JSON.stringify(entries));
    showToast(`${teamLabel(team)} blacklisted`);
    generate();
  };
  const blacklistEntries = () => {
    blacklistPairs();
    try {
      return JSON.parse(localStorage.getItem(blacklistKey) || "[]");
    } catch(error) {
      return [];
    }
  };
  const removeBlacklist = (team) => {
    const entries = blacklistEntries().filter((entry) => teamKey(entry.pair) !== teamKey(team));
    localStorage.setItem(blacklistKey, JSON.stringify(entries));
    renderBlacklistEditor();
  };
  function renderBlacklistEditor() {
    const list = $("#blacklistList");
    list.innerHTML = "";
    const entries = blacklistEntries();
    if(!entries.length) {
      list.textContent = "No teams are blacklisted.";
      return;
    }
    entries.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "blacklist-row";
      row.textContent = `${teamLabel(entry.pair)} (${Math.max(1, Math.ceil((entry.expiresAt - Date.now()) / 3600000))}h)`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "blacklist-remove";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => removeBlacklist(entry.pair));
      row.append(remove);
      list.append(row);
    });
  }
  const teamLabel = (team) => team.join(" + ");
  const stackedTeam = (team) => team.some((player) => player.length > 13)
    || team.join("").length >= 17;
  const renderTeamLabel = (container, team) => {
    container.classList.toggle("stacked-team", stackedTeam(team));
    team.forEach((player, index) => {
      const name = document.createElement("span");
      name.className = "team-player";
      name.textContent = player;
      container.append(name);
      if(index < team.length - 1) {
        const plus = document.createElement("span");
        plus.className = "team-plus";
        plus.textContent = "+";
        container.append(plus);
      }
    });
  };
  const sharesPlayer = (first, second) => first.some((player) => second.includes(player));
  const sameTeam = (first, second) => Boolean(first && second)
    && first.length === second.length
    && first.every((player, index) => player === second[index]);

  function updateCount() {
    count.textContent = `${players().length} players`;
  }

  function makeTeams() {
    return new Teams(players(), blacklistPairs());
  }

  function teamCard(team, className="") {
    const card = document.createElement("div");
    card.className = `team-card ${className}`.trim();
    const label = document.createElement("div");
    label.className = "team-label";
    renderTeamLabel(label, team);
    card.append(label);
    card.append(blacklistButton(team));
    return card;
  }

  function blacklistButton(team) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "blacklist-button";
    button.textContent = "⚑";
    button.title = "Blacklist this team";
    button.setAttribute("aria-label", `Blacklist ${teamLabel(team)}`);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      blacklistTeam(team);
    });
    return button;
  }

  function teamChoice(team, selected, onWinner, disabled) {
    const entry = document.createElement("div");
    entry.className = "team-choice";
    const button = document.createElement("button");
    button.type = "button";
    button.className = `team-button${selected ? " winner" : ""}`;
    renderTeamLabel(button, team);
    button.disabled = disabled;
    button.addEventListener("click", () => onWinner(team, button));
    entry.append(button, blacklistButton(team));
    return entry;
  }

  function matchupCard(match, active, onWinner, winner = null) {
    const card = document.createElement("article");
    card.className = `match-card${active ? " active" : ""}`;
    card.append(Object.assign(document.createElement("p"), {
      className: "match-label",
      textContent: active ? "Current match" : "Upcoming"
    }));
    match.forEach((team) => {
      card.append(teamChoice(
        team,
        sameTeam(winner, team),
        (selectedTeam) => onWinner(selectedTeam, card),
        !active
      ));
    });
    return card;
  }

  function addQueueItems() {
    const needed = Math.max(0, bufferSize - state.items.length);
    if(!needed) return;
    const generated = state.mode === "king"
      ? state.matches.generate(needed, "king", state.incumbent)
      : state.matches.generate(needed, "random");
    state.items.push(...generated);
    generated.forEach((match) => {
      state.queue.append(matchupCard(match, state.items.length === 1, advanceQueue));
    });
    updateQueueButtons();
  }

  function updateQueueButtons(advancing = false) {
    [...state.queue.children].forEach((card, index) => {
      const current = advancing ? index === 1 : index === 0;
      card.classList.toggle("active", current);
      card.querySelector(".match-label").textContent = current ? "Current match" : index === 0 && advancing ? "Complete" : "Upcoming";
      card.querySelectorAll("button").forEach((button) => { button.disabled = !current; });
    });
  }

  function advanceQueue(winner, card) {
    if(state.animating) return;
    state.animating = true;
    const previousIncumbent = state.incumbent;
    const incumbentChanged = state.mode === "king" && winner !== previousIncumbent;
    if(state.mode === "king") state.incumbent = winner;
    if(incumbentChanged) {
      state.items = [];
      while(state.queue.children.length > 1) {
        state.queue.lastElementChild.remove();
      }
    } else {
      state.items.shift();
    }
    addQueueItems();
    card.classList.add("completed");
    updateQueueButtons(true);

    const queueStep = card.offsetHeight + 10;
    state.queue.scrollTop = 0;
    state.queue.style.scrollBehavior = "smooth";
    let finished = false;
    const finish = () => {
      if(finished) return;
      finished = true;
      state.queue.removeEventListener("transitionend", finish);
      if(card.parentElement) card.remove();
      requestAnimationFrame(() => {
        state.queue.scrollTop = 0;
        state.queue.style.scrollBehavior = "";
        state.animating = false;
        updateQueueButtons();
      });
    };
    state.queue.addEventListener("scrollend", finish, { once: true });
    state.queue.scrollTop = queueStep;
    setTimeout(finish, 1600);
  }

  function renderQueue() {
    output.innerHTML = "";
    const queue = document.createElement("div");
    queue.className = "match-queue";
    state.queue = queue;
    output.append(queue);
    addQueueItems();
    if(!state.items.length) showToast("Not enough distinct players for a non-overlapping matchup.");
  }

  function renderTeams() {
    const teams = state.teams.generate(Math.ceil(players().length / 2));
    output.innerHTML = "";
    const list = document.createElement("div");
    list.className = "team-list";
    teams.forEach((team, index) => {
      const item = teamCard(team);
      item.insertAdjacentHTML("afterbegin", `<span class="list-number">${index + 1}</span>`);
      list.append(item);
    });
    output.append(list);
  }

  function refreshBracket() {
    const bracket = state.bracket;
    bracket.rounds[0].forEach((match) => {
      if(match.a && match.b) {
        match.advance = match.winner;
      } else {
        match.winner = null;
        match.advance = match.a || null;
      }
    });
    for(let round = 1; round < bracket.rounds.length; round++) {
      bracket.rounds[round].forEach((match) => {
        match.a = match.sourceA
          ? bracket.rounds[match.sourceA.round][match.sourceA.index].advance
          : match.a;
        match.b = match.sourceB
          ? bracket.rounds[match.sourceB.round][match.sourceB.index].advance
          : match.b;
      });

      if(round === 1 && bracket.specialSource) {
        const target = bracket.rounds[round].find((match) => match.specialA);
        const firstRound = bracket.rounds[0];
        const complete = firstRound.every((match) =>
          match.advance && (!match.b || match.winner)
        );
        const losers = complete
          ? firstRound
            .filter((match) => match.a && match.b && match.winner)
            .map((match) => match.winner === match.a ? match.b : match.a)
          : [];
        const eligibleLosers = losers.filter((team) =>
          team && !team.includes(bracket.pendingPlayer)
        );
        const companionTeam = eligibleLosers.find((team) =>
          !state.teams.blacklisted([bracket.pendingPlayer, team[0]])
        ) || eligibleLosers[0];
        target.a = companionTeam && bracket.pendingPlayer
          ? [bracket.pendingPlayer, companionTeam[0]]
          : null;
      }

      bracket.rounds[round].forEach((match) => {
        if(match.sourceA) {
          match.a = bracket.rounds[match.sourceA.round][match.sourceA.index].advance;
        }
        if(match.sourceB) {
          match.b = bracket.rounds[match.sourceB.round][match.sourceB.index].advance;
        }
        if(match.a && match.b) {
          if(!sameTeam(match.selectedWinner, match.a) && !sameTeam(match.selectedWinner, match.b)) {
            match.selectedWinner = null;
          }
          match.winner = sameTeam(match.selectedWinner, match.a)
            ? match.a
            : sameTeam(match.selectedWinner, match.b) ? match.b : null;
          match.advance = match.winner;
        } else {
          match.selectedWinner = null;
          match.winner = null;
          match.advance = match.a || null;
        }
      });
    }
  }

  function selectBracketWinner(round, index, team) {
    const match = state.bracket.rounds[round][index];
    match.selectedWinner = sameTeam(match.selectedWinner, team) ? null : team;
    match.winner = match.selectedWinner;
    match.advance = match.winner;
    refreshBracket();
    renderBracket();
  }

  function updateThirdPlace() {
    if(!state.bracket.thirdPlace) return null;
    const semifinal = state.bracket.rounds[state.bracket.rounds.length - 2];
    const losers = semifinal.map((match) => match.winner
      ? (match.winner === match.a ? match.b : match.a)
      : null);
    state.bracket.thirdMatch = {
      a: losers[0],
      b: losers[1],
      winner: state.bracket.thirdMatch?.winner || null
    };
    if(state.bracket.thirdMatch.winner
      && !losers.some((team) => sameTeam(team, state.bracket.thirdMatch.winner))) {
      state.bracket.thirdMatch.winner = null;
    }
    if(!state.bracket.thirdMatch.a || !state.bracket.thirdMatch.b) {
      state.bracket.thirdMatch.winner = null;
    }
    return state.bracket.thirdMatch;
  }

  function selectThirdPlaceWinner(team) {
    const match = state.bracket.thirdMatch;
    match.winner = sameTeam(match.winner, team) ? null : team;
    renderBracket();
  }

  function renderBracket() {
    output.innerHTML = "";
    const layout = document.createElement("div");
    layout.className = "bracket";
    layout.style.setProperty(
      "--bracket-height",
      `${Math.max(360, state.bracket.rounds[0].length * 150)}px`
    );
    state.bracket.rounds.forEach((round, roundIndex) => {
      const column = document.createElement("section");
      column.className = "bracket-round";
      column.innerHTML = `<h2>${roundIndex === state.bracket.rounds.length - 1 ? "Final" : `Round ${roundIndex + 1}`}</h2>`;
      round.forEach((match, matchIndex) => {
        const card = document.createElement("article");
        card.className = "match-card bracket-match";
        [match.a, match.b].forEach((team) => {
          if(!team) return;
          card.append(teamChoice(
            team,
            sameTeam(match.winner, team),
            () => selectBracketWinner(roundIndex, matchIndex, team),
            !(match.a && match.b) || Boolean(match.winner && !sameTeam(match.winner, team))
          ));
        });
        if(!match.a && !match.b) card.classList.add("waiting");
        column.append(card);
      });
      layout.append(column);
    });
    output.append(layout);
    if(state.bracket.thirdPlace) {
      const thirdMatch = updateThirdPlace();
      if(thirdMatch?.a && thirdMatch.b) {
        const placement = document.createElement("section");
        placement.className = "placement";
        placement.innerHTML = "<h2>Third place</h2>";
        placement.append(matchupCard(
          [thirdMatch.a, thirdMatch.b],
          true,
          (team) => selectThirdPlaceWinner(team),
          thirdMatch.winner
        ));
        output.append(placement);
      }
    }
  }

  function generate() {
    const list = players();
    if(list.length < 2) {
      showToast("Add at least two players.");
      return;
    }

    saveCompetitors(list);
    const teams = makeTeams();
    const matches = new Matches(teams);
    const mode = modeInput.value;
    state = { mode, teams, matches, items: [] };
    setup.hidden = true;
    results.hidden = false;

    if(mode === "list") renderTeams();
    else if(mode === "bracket") {
      state.bracket = matches.generate(0, "bracket");
      refreshBracket();
      renderBracket();
    } else {
      state.incumbent = mode === "king" ? teams.generate(1)[0] : null;
      renderQueue();
    }
  }

  input.addEventListener("input", updateCount);
  $("#generateButton").addEventListener("click", generate);
  $("#regenerateButton").addEventListener("click", generate);
  $("#clearCompetitorsButton").addEventListener("click", () => {
    input.value = "";
    localStorage.removeItem(competitorsKey);
    updateCount();
    showToast("Competitors cleared");
  });
  $("#editBlacklistButton").addEventListener("click", () => {
    renderBlacklistEditor();
    $("#blacklistEditor").hidden = false;
  });
  $("#closeBlacklistButton").addEventListener("click", () => {
    $("#blacklistEditor").hidden = true;
  });
  $("#newButton").addEventListener("click", () => {
    results.hidden = true;
    setup.hidden = false;
  });
  loadCompetitors();
  updateCount();
})();
