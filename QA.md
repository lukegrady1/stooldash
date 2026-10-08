# Manual QA script

Play one real game across a laptop (host, screen-shared) and two phones on the same Wi‑Fi.
Takes about 10 minutes. Do this before every release and after any change to the engine,
the API or the `useGame` hook.

## 0. Setup

1. On the laptop: `pnpm install`, then `pnpm dev:lan` (this is `next dev -H 0.0.0.0`).
2. Find the laptop's LAN address, e.g. `ipconfig getifaddr en0` on macOS. Call it `LAPTOP_IP`.
3. Optional: put real Supabase keys in `.env.local` (see README). Without them the app runs on the
   in-memory store and the clients poll every 2 seconds. Both modes must pass this script.
4. Phones: open `http://LAPTOP_IP:3000/join` in Safari or Chrome. If the page doesn't load, check
   the laptop firewall and that both devices share the network.

> Testing with several players on **one** machine: use separate browser profiles or incognito
> windows. Cookies are keyed by game code, so two tabs in the same profile share one session.

## 1. Host creates a game (laptop)

- [ ] Home shows **Host a game** and **Join a game**.
- [ ] Deck editor: click **Use 10 sample words**. All ten rows fill in.
- [ ] Reload the page. The deck is still there (localStorage).
- [ ] **Paste a list**: paste two lines, `Alpha = first` and `Beta | second`. Two rows are appended.
- [ ] Remove those two rows with ×.
- [ ] Points selector shows 1 / 2 / 3 with 2 selected.
- [ ] Click **Open lobby with 10 words**. You land on `/host/XXXX`.
- [ ] The lobby shows the join URL, a huge 4-letter code and a QR code.
- [ ] Start button is disabled and reads **Need at least 2 players**.

## 2. Players join (phones)

- [ ] Phone A scans the QR code (or types the URL). The code is pre-filled.
- [ ] Phone A enters a name and taps **Join**. It sees "You're in, NAME."
- [ ] The host's lobby shows the player chip within ~2 seconds without a refresh.
- [ ] Phone B joins with the **same name**. It sees "That name's taken in this game."
- [ ] Phone B joins with a different name.
- [ ] Host: Start button now reads **Start game · 10 words** with the "three or more" hint.
- [ ] Phone A: tap **Leave game**, then rejoin with the same name. It works.
- [ ] Wrong code on a phone: `/join?code=ZZZZ` gives "No game with that code. Check with your host."

## 3. Writing

- [ ] Host clicks **Start game**. Phones show the word, the spelling and a handwriting textarea.
- [ ] Host shows "0 of 2 definitions in".
- [ ] Phone A types half a definition, then **reloads**. The draft is still in the box.
- [ ] Phone A submits. Its card shows read-only with ✓ and an **Edit** button.
- [ ] Host shows "1 of 2 definitions in" and a ✓ on A's chip.
- [ ] Phone A taps **Edit**, changes the text, saves. (Only the host can confirm it changed, in REVIEW.)
- [ ] Phone B writes the real definition **word for word** and submits.
- [ ] The host moves to REVIEW automatically.

## 4. Review (host only)

- [ ] The real definition is on a card labelled "Only you see this".
- [ ] Phone B's submission is pre-ticked "basically nailed it (+3)" with "matches the real one".
- [ ] Phones show "Everyone's in. The host is shuffling the cards."
- [ ] Untick and re-tick B. Click **Show definitions and start voting**.

## 5. Voting

- [ ] Phone B sees "You knew the real definition. That's 3 points."
- [ ] Phone A sees the real card and its own card. Its own card is dimmed and labelled "Yours, can't vote for it".
- [ ] Phone A taps the real card. It gets an outline and "Your vote". The text says "Vote locked in."
- [ ] Because A is the only eligible voter, the host moves to REVEAL automatically.
- [ ] Host's VOTING screen (while it lasted) showed every card with a letter, big enough for screen share.

## 6. Reveal and scoreboard

- [ ] Host: "B knew it. +3". The real card is highlighted in yellow with "Found by A". Cards flip in with a stagger.
- [ ] Phone A: "+2 for you this round". Phone B: "+3 for you this round".
- [ ] Host clicks **Show scoreboard**. Ranks: B 3, A 2. The +gain column matches.
- [ ] Phones show the same board with their own row highlighted.
- [ ] Host clicks **Next word**. Word 2 starts on every screen.

## 7. Resilience

- [ ] **Host refresh** during VOTING: the host page comes back with the same controls. Click **Reveal now**.
- [ ] **Player refresh** during VOTING: the phone comes back with its vote still marked.
- [ ] Open the host URL in a **second laptop tab**. Both tabs follow the game. Click the same button in both quickly: no error banner appears.
- [ ] Put Phone A in the background for a minute during WRITING. Its chip dims on the host. Click **Stop waiting**. The round continues without A's card.
- [ ] Bring Phone A back. It catches up within a few seconds.
- [ ] Kick Phone B from the host during VOTING. B sees "The host removed you from this game." B's card and any votes on it disappear.
- [ ] Turn the laptop's Wi‑Fi off for 20 seconds. Phones show "Can't reach the game. Retrying…" and recover when it's back.

## 8. Finish

- [ ] On the last word, the host button reads **Final results**.
- [ ] Final screen shows "NAME wins" (or "A & B win" on a tie) and the board.
- [ ] **New game** returns to the deck editor with the same deck. **Done** goes home.
- [ ] Home no longer offers **Resume hosting** for that code.
- [ ] Trying to join the finished code gives "That game has already finished."

## 9. Accessibility spot checks

- [ ] Keyboard-only host flow: Tab reaches every button; Enter/Space activates; dialogs trap focus and close on Escape.
- [ ] Focus rings are visible on buttons, cards and inputs.
- [ ] VoiceOver on a phone reads cards as "Card A: …" and chips as "NAME, done".
- [ ] With "Reduce motion" on, the reveal shows all cards at once.
- [ ] Dark mode: cards stay cream-coloured and their labels remain readable.
