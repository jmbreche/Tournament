function shuffle(list) {
    const copy = list.slice();

    for(let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }

    return copy;
}

class Teams {
    constructor(competitors, blacklist=[]) {
        this.competitors = [...new Set(competitors)];
        this.blacklist = blacklist;
        this.queue = shuffle(this.competitors);
        this.bench = [];
        this.shuffleQueue();
    }

    blacklisted(team) {
        return this.blacklist.some((pair) =>
            (team[0] === pair[0] && team[1] === pair[1]) ||
            (team[0] === pair[1] && team[1] === pair[0])
        );
    }

    shuffleQueue(incumbents=0) {
        const ordered = this.queue.slice(0, incumbents)
            .concat(shuffle(this.queue.slice(incumbents)));
        const remaining = ordered.slice();
        const next = [];

        while(remaining.length) {
            const first = remaining.shift();
            if(!remaining.length) {
                next.push(first);
                break;
            }

            const teammateIndex = remaining.findIndex((competitor) =>
                !this.blacklisted([first, competitor])
            );
            const index = teammateIndex === -1 ? 0 : teammateIndex;
            next.push(first, ...remaining.splice(index, 1));
        }

        this.queue = next;
        return this.queue;
    }

    refill() {
        if(this.queue.length >= 2) return;
        const incumbents = this.queue.length;
        this.queue = this.queue.concat(this.bench);
        this.bench = [];
        this.shuffleQueue(incumbents);
    }

    generate(count) {
        const selected = [];

        for(let i = 0; i < count; i++) {
            this.refill();
            if(this.queue.length < 2) break;

            const team = [this.queue.shift(), this.queue.shift()];
            selected.push(team);
            this.bench.push(...team);
        }

        return selected;
    }
}

class Matches {
    constructor(teams) {
        this.teams = teams;
    }

    sharesPlayer(first, second) {
        return first.some((player) => second.includes(player));
    }

    generate(count, type, ...args) {
        switch(type) {
            case "random":
                return this.random(count);
            case "king":
                return this.king(count, ...args);
            case "bracket":
                return this.bracket(count, ...args);
            default:
                return [];
        }
    }

    random(count) {
        const selected = [];
        let attempts = 0;

        while(selected.length < count && attempts < count * 100) {
            attempts++;
            const candidates = this.teams.generate(2);
            if(candidates.length < 2) break;
            if(this.sharesPlayer(candidates[0], candidates[1])) continue;
            selected.push(candidates);
        }

        return selected;
    }

    king(count, incumbent=null) {
        const selected = [];
        let champion = incumbent || this.teams.generate(1)[0];
        let attempts = 0;

        if(!champion) return selected;

        while(selected.length < count && attempts < count * 100) {
            attempts++;
            const challenger = this.teams.generate(1)[0];
            if(!challenger) break;
            if(this.sharesPlayer(champion, challenger)) continue;
            selected.push([champion, challenger]);
        }

        return selected;
    }

    bracket() {
        const teamCount = Math.ceil(this.teams.competitors.length / 2);
        const hasOddPlayer = this.teams.competitors.length % 2 === 1;
        const teams = this.teams.generate(hasOddPlayer ? teamCount - 1 : teamCount);
        if(teams.length < 2) return { rounds: [], thirdPlace: false };

        const pendingPlayer = hasOddPlayer ? this.teams.queue[0] : null;
        const rounds = [];
        let participants = teams.map((team) => ({ team, byeStreak: 0 }));
        let roundIndex = 0;

        while(participants.length > 1) {
            const roundParticipants = participants.slice();
            if(roundParticipants.length % 2) {
                const eligibleCandidates = roundParticipants
                    .map((participant, index) => ({ participant, index }))
                    .filter(({ participant }) => !participant.special);
                const restedCandidates = eligibleCandidates.filter(({ participant }) =>
                    participant.byeStreak === 0
                );
                const byeCandidates = restedCandidates.length ? restedCandidates : eligibleCandidates;
                const bye = byeCandidates[Math.floor(Math.random() * byeCandidates.length)];
                roundParticipants.splice(bye.index, 1);
                roundParticipants.push(bye.participant);
            }
            const round = [];
            for(let index = 0; index < roundParticipants.length; index += 2) {
                const first = roundParticipants[index];
                const second = roundParticipants[index + 1] || null;
                round.push({
                    a: first.team || null,
                    b: second ? second.team || null : null,
                    sourceA: first.source || null,
                    sourceB: second ? second.source || null : null,
                    specialA: Boolean(first.special),
                    winner: null,
                    advance: null
                });
            }
            rounds.push(round);
            participants = round.map((match, index) => {
                const first = roundParticipants[index * 2];
                return {
                    source: { round: roundIndex, index },
                    byeStreak: match.b ? 0 : first.byeStreak + 1
                };
            });
            if(roundIndex === 0 && pendingPlayer) {
                participants.unshift({ special: true, byeStreak: 0 });
            }
            roundIndex++;
        }

        const bracket = {
            rounds,
            pendingPlayer,
            specialSource: pendingPlayer ? { round: 0, index: 0 } : null,
            thirdPlace: rounds.length > 2 && rounds[rounds.length - 2]
                .every((match) => (match.sourceA || match.specialA) && match.sourceB)
        };
        this.lastBracket = bracket;
        return bracket;
    }

    reportBracket(bracket=this.lastBracket) {
        return reportBracket(bracket);
    }
}

function reportBracket(bracket) {
    if(!bracket) {
        const message = "No bracket has been generated yet.";
        console.log(message);
        return message;
    }

    const teamLabel = (team) => team ? team.join(" + ") : "—";
    const report = {
        pendingPlayer: bracket.pendingPlayer || null,
        specialSource: bracket.specialSource || null,
        thirdPlace: bracket.thirdPlace,
        rounds: bracket.rounds.map((round, roundIndex) => ({
            round: roundIndex + 1,
            matches: round.map((match, matchIndex) => ({
                match: `${roundIndex + 1}.${matchIndex + 1}`,
                a: teamLabel(match.a),
                b: teamLabel(match.b),
                bye: Boolean(match.a && !match.b),
                special: Boolean(match.specialA),
                sourceA: match.sourceA || null,
                sourceB: match.sourceB || null,
                winner: teamLabel(match.winner),
                advance: teamLabel(match.advance)
            }))
        }))
    };
    const text = JSON.stringify(report, null, 2);
    console.log("Bracket report (copy everything between the lines):");
    console.log("--- BRACKET REPORT START ---");
    console.log(text);
    console.log("--- BRACKET REPORT END ---");
    return text;
}
