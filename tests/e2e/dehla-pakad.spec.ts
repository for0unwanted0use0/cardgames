import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type CardSnapshot = { id: string; suit: string; rank: number; disabled: boolean };
type PlannedPlay = { pageIndex: number; card: CardSnapshot };
type PendingLotSnapshot = Array<{
  handNumber: number; winner: string; winningTeam: string;
  plays: Array<{ order: number; playerId: string; cardId: string }>;
}>;
type Capture = (name: string, page: Page, fullPage?: boolean) => Promise<void>;

async function hand(page: Page): Promise<CardSnapshot[]> {
  return page.locator(".player-hand .dehla-card").evaluateAll((cards) => cards.map((card) => ({
    id: card.getAttribute("data-card-id") ?? "",
    suit: card.getAttribute("data-suit") ?? "",
    rank: Number(card.getAttribute("data-rank") ?? "0"),
    disabled: card.hasAttribute("disabled"),
  })));
}

function trickWinner(plan: PlannedPlay[], hukum: string) {
  const leadSuit = plan[0].card.suit;
  const priority = (card: CardSnapshot) => card.suit === hukum ? 2 : card.suit === leadSuit ? 1 : 0;
  return plan.reduce((winner, play) => {
    const winnerPriority = priority(winner.card);
    const playPriority = priority(play.card);
    return playPriority > winnerPriority || (playPriority === winnerPriority && play.card.rank > winner.card.rank) ? play : winner;
  }).pageIndex;
}

function legalCards(cards: CardSnapshot[], leadSuit: string) {
  const following = cards.filter((card) => card.suit === leadSuit);
  return following.length ? following : cards;
}

function withoutPlanCards(hands: CardSnapshot[][], plan: PlannedPlay[]) {
  return hands.map((cards, pageIndex) => {
    const playedId = plan.find((play) => play.pageIndex === pageIndex)?.card.id;
    return cards.filter((card) => card.id !== playedId);
  });
}

function findConsecutiveLeaderWins(hands: CardSnapshot[][], leader: number, hukum: string, depth: number): PlannedPlay[][] | null {
  const order = [0, 1, 2, 3].map((offset) => (leader + offset) % 4);
  const avoidTen = depth === 1;
  for (const leadCard of hands[leader]) {
    if (avoidTen && leadCard.rank === 10) continue;
    const partial: PlannedPlay[] = [{ pageIndex: leader, card: leadCard }];
    const searchFollowers = (offset: number): PlannedPlay[][] | null => {
      if (offset === order.length) {
        if (trickWinner(partial, hukum) !== leader) return null;
        if (depth === 1) return [[...partial]];
        const remainder = withoutPlanCards(hands, partial);
        const next = findConsecutiveLeaderWins(remainder, leader, hukum, depth - 1);
        return next ? [[...partial], ...next] : null;
      }
      const pageIndex = order[offset];
      for (const card of legalCards(hands[pageIndex], leadCard.suit)) {
        if (avoidTen && card.rank === 10) continue;
        partial.push({ pageIndex, card });
        const result = searchFollowers(offset + 1);
        if (result) return result;
        partial.pop();
      }
      return null;
    };
    const result = searchFollowers(1);
    if (result) return result;
  }
  return null;
}

async function planConsecutiveLeaderWins(pages: Page[], depth: number) {
  const leader = await visiblePageIndex(pages, ".turn-banner.your-turn:has-text('Your turn')");
  const hands = await Promise.all(pages.map(hand));
  const hukum = await pages[0].locator(".hukum-display").getAttribute("data-hukum");
  if (!hukum) throw new Error("Hukum was unavailable while planning a deterministic lifting streak.");
  const plans = findConsecutiveLeaderWins(hands, leader, hukum, depth);
  if (!plans) throw new Error(`Could not find ${depth} controllable leader win(s) in the remaining hands.`);
  return plans;
}

async function playPlannedTrick(pages: Page[], plan: PlannedPlay[]) {
  for (const play of plan) {
    expect(await visiblePageIndex(pages, ".turn-banner.your-turn:has-text('Your turn')")).toBe(play.pageIndex);
    await playCard(pages[play.pageIndex], play.card.id);
  }
}

async function inspectPendingLot(pages: Page[]) {
  await Promise.all(pages.map(async (page) => {
    await page.getByRole("button", { name: /Inspect pending lot/ }).click();
    await expect(page.getByRole("dialog", { name: /Pending lot/ })).toBeVisible();
  }));
  const snapshots = await Promise.all(pages.map((page) => (
    page.locator(".pending-lot-hands > section").evaluateAll((sections): PendingLotSnapshot => (
      sections.map((section) => ({
        handNumber: Number(section.getAttribute("data-hand-number") ?? "0"),
        winner: section.getAttribute("data-winner") ?? "",
        winningTeam: section.getAttribute("data-winning-team") ?? "",
        plays: Array.from(section.querySelectorAll<HTMLElement>(".pending-lot-play")).map((play) => ({
          order: Number(play.getAttribute("data-play-order") ?? "0"),
          playerId: play.getAttribute("data-player-id") ?? "",
          cardId: play.querySelector(".dehla-card")?.getAttribute("data-card-id") ?? "",
        })),
      }))
    ))
  )));
  for (const snapshot of snapshots.slice(1)) expect(snapshot).toEqual(snapshots[0]);
  return snapshots[0];
}

async function closePendingLot(pages: Page[]) {
  await Promise.all(pages.map((page) => page.getByRole("button", { name: "Close pending lot" }).click()));
}

async function currentLeadSuit(page: Page) {
  const firstCard = page.locator(".trick-cards .dehla-card").first();
  return await firstCard.count() ? firstCard.getAttribute("data-suit") : null;
}

async function visiblePageIndex(pages: Page[], selector: string) {
  let stableIndex = -1;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const visible = await Promise.all(pages.map((page) => page.locator(selector).isVisible().catch(() => false)));
    const visibleIndexes = visible.flatMap((isVisible, index) => isVisible ? [index] : []);
    if (visibleIndexes.length === 1) {
      if (stableIndex === visibleIndexes[0]) return stableIndex;
      stableIndex = visibleIndexes[0];
    } else {
      stableIndex = -1;
    }
    await pages[0].waitForTimeout(100);
  }
  throw new Error(`No single stable player exposed the expected UI: ${selector}`);
}

async function playCard(page: Page, cardId: string) {
  const card = page.locator(`.player-hand .dehla-card[data-card-id="${cardId}"]`);
  await expect(card).toBeEnabled();
  await card.click();
  await expect(card).toHaveCount(0);
}

async function joinFourPlayers(pages: Page[], capture: Capture) {
  await pages[0].goto("/");
  await capture("00-platform-home", pages[0]);
  await Promise.all(pages.map((page) => page.goto("/games/dehla-pakad")));
  await capture("01-dehla-lobby", pages[0]);
  await pages[0].getByLabel("Your name").fill("Asha");
  await pages[0].getByRole("button", { name: "Create private table" }).click();
  const code = (await pages[0].locator(".room-code-button strong").textContent())?.trim();
  if (!code) throw new Error("Room code was not shown.");

  for (let index = 1; index < pages.length; index += 1) {
    await pages[index].getByLabel("Your name").fill(["Bina", "Chet", "Dev"][index - 1]);
    await pages[index].getByLabel("Room code").fill(code);
    await pages[index].getByRole("button", { name: "Join table" }).click();
  }
  await expect(pages[0].getByRole("button", { name: "Start match · 4/4" })).toBeEnabled();
  await capture("02-waiting-room", pages[0]);
  return code;
}

async function dealFive(pages: Page[]) {
  const dealerIndex = await visiblePageIndex(pages, "button:has-text('Shuffle and deal five')");
  await pages[dealerIndex].getByRole("button", { name: "Shuffle and deal five" }).click();
  await Promise.all(pages.map((page) => expect(page.getByRole("heading", { name: "Finding Hukum" })).toBeVisible()));
  await Promise.all(pages.map((page) => expect(page.locator(".player-hand .dehla-card")).toHaveCount(5)));
}

async function establishHukum(pages: Page[], capture: Capture) {
  let sawFollowSuitRestriction = false;
  let capturedFollowSuit = false;

  for (let action = 0; action < 140; action += 1) {
    if (await pages[0].locator(".hukum-event").isVisible().catch(() => false)) break;
    if (await pages[0].locator("[data-testid='dealer-stage']").isVisible().catch(() => false)) {
      await dealFive(pages);
      continue;
    }

    const actorIndex = await visiblePageIndex(pages, ".turn-banner.your-turn:has-text('Your turn')");
    const actorHand = await hand(pages[actorIndex]);
    const leadSuit = await currentLeadSuit(pages[0]);
    let selected: CardSnapshot | undefined;

    if (!leadSuit) {
      const allHands = await Promise.all(pages.map(hand));
      selected = actorHand.find((candidate) => {
        const followers = [1, 2, 3].map((offset) => allHands[(actorIndex + offset) % 4]);
        return followers.some((cards) => cards.every((card) => card.suit !== candidate.suit))
          && followers.some((cards) => cards.some((card) => card.suit === candidate.suit) && cards.some((card) => card.suit !== candidate.suit));
      }) ?? actorHand.find((candidate) => [1, 2, 3].some((offset) => {
        const cards = allHands[(actorIndex + offset) % 4];
        return cards.some((card) => card.suit === candidate.suit) && cards.some((card) => card.suit !== candidate.suit);
      })) ?? actorHand[0];
    } else {
      const following = actorHand.filter((card) => card.suit === leadSuit);
      const offSuit = actorHand.filter((card) => card.suit !== leadSuit);
      if (following.length && offSuit.length) {
        sawFollowSuitRestriction = true;
        await expect(pages[actorIndex].locator(`.player-hand .dehla-card[data-card-id="${offSuit[0].id}"]`)).toBeDisabled();
        await expect(pages[actorIndex].locator(`.player-hand .dehla-card[data-card-id="${offSuit[0].id}"]`)).toHaveClass(/unavailable/);
        await expect(pages[actorIndex].locator(`.player-hand .dehla-card[data-card-id="${following[0].id}"]`)).toHaveClass(/playable/);
        if (!capturedFollowSuit) {
          await capture("07-follow-suit-restriction", pages[actorIndex]);
          capturedFollowSuit = true;
        }
      }
      selected = following[0] ?? offSuit[0];
    }

    if (!selected) throw new Error("The active player had no playable card.");
    await playCard(pages[actorIndex], selected.id);
  }

  await Promise.all(pages.map((page) => expect(page.locator(".hukum-event")).toBeVisible()));
  await Promise.all(pages.map((page) => expect(page.locator(".hukum-event")).toContainText("The card acted as Hukum immediately.")));
  await capture("05-hukum-declared", pages[0]);
  const hukumText = await pages[0].locator(".hukum-event").textContent();
  for (const page of pages.slice(1)) await expect(page.locator(".hukum-event")).toHaveText(hukumText ?? "");

  while (!(await pages[0].getByRole("heading", { name: "Round play" }).isVisible().catch(() => false))) {
    const actorIndex = await visiblePageIndex(pages, ".turn-banner.your-turn:has-text('Your turn')");
    const actorHand = await hand(pages[actorIndex]);
    const leadSuit = await currentLeadSuit(pages[0]);
    if (leadSuit) {
      const following = actorHand.filter((card) => card.suit === leadSuit);
      const offSuit = actorHand.filter((card) => card.suit !== leadSuit);
      if (following.length && offSuit.length) {
        sawFollowSuitRestriction = true;
        await expect(pages[actorIndex].locator(`.player-hand .dehla-card[data-card-id="${offSuit[0].id}"]`)).toBeDisabled();
        await expect(pages[actorIndex].locator(`.player-hand .dehla-card[data-card-id="${offSuit[0].id}"]`)).toHaveClass(/unavailable/);
        await expect(pages[actorIndex].locator(`.player-hand .dehla-card[data-card-id="${following[0].id}"]`)).toHaveClass(/playable/);
      }
    }
    const cardId = await pages[actorIndex].locator(".player-hand .dehla-card:not([disabled])").first().getAttribute("data-card-id");
    if (!cardId) throw new Error("No legal card was available while resolving the Hukum hand.");
    await playCard(pages[actorIndex], cardId);
  }

  expect(sawFollowSuitRestriction).toBe(true);
}

test("a slow refreshed join reuses one logical seat and reconnects", async ({ browser }) => {
  test.setTimeout(120_000);
  const hostContext = await browser.newContext();
  const joinContext = await browser.newContext();
  try {
    const host = await hostContext.newPage();
    const joiner = await joinContext.newPage();
    await Promise.all([host.goto("/games/dehla-pakad"), joiner.goto("/games/dehla-pakad")]);

    await host.getByLabel("Your name").fill("Host");
    await host.getByRole("button", { name: "Create private table" }).click();
    const code = (await host.locator(".room-code-button strong").textContent())?.trim();
    if (!code) throw new Error("Room code was not shown.");

    await joiner.getByLabel("Your name").fill("P2");
    await joiner.getByLabel("Room code").fill(code);
    const cdp = await joinContext.newCDPSession(joiner);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 1800,
      downloadThroughput: 64 * 1024,
      uploadThroughput: 32 * 1024,
      connectionType: "cellular3g",
    });

    await joiner.getByRole("button", { name: "Join table" }).evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
      button.click();
    });
    await expect(joiner.getByRole("button", { name: "Joining table…" })).toBeDisabled();
    await expect(joiner.getByRole("status")).toContainText(/Joining table|Still joining/);
    const pendingAttempt = await joiner.evaluate(() => localStorage.getItem("dehla-pakad-join-attempt-v1"));
    expect(pendingAttempt).toContain('"clientJoinId"');

    await joiner.reload();
    await expect(joiner.getByRole("heading", { name: "Seat all four players" })).toBeVisible({ timeout: 30_000 });
    await expect(host.locator(".dehla-seat-preview .occupied")).toHaveCount(2);
    await expect(host.locator(".dehla-seat-preview .occupied").filter({ hasText: "P2" })).toHaveCount(1);
    expect(await joiner.evaluate(() => localStorage.getItem("dehla-pakad-join-attempt-v1"))).toBeNull();
    const seatBeforeReconnect = await joiner.evaluate(() => localStorage.getItem("dehla-pakad-online-seat-v1"));

    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
      connectionType: "wifi",
    });
    await cdp.detach();
    await joinContext.setOffline(true);
    await expect(joiner.getByRole("status")).toContainText("Connection interrupted — reconnecting…", { timeout: 20_000 });
    await expect(joiner.getByRole("button", { name: "Leave this table" })).toBeDisabled();
    await joinContext.setOffline(false);
    await expect(joiner.getByRole("status")).toContainText("Back online", { timeout: 20_000 });
    await expect(joiner.getByRole("heading", { name: "Seat all four players" })).toBeVisible();
    expect(await joiner.evaluate(() => localStorage.getItem("dehla-pakad-online-seat-v1"))).toBe(seatBeforeReconnect);
  } finally {
    await Promise.allSettled([hostContext.close(), joinContext.close()]);
  }
});

test("four private sessions complete a Dehla Pakad round and reconnect safely", async ({ browser }, testInfo) => {
  test.setTimeout(300_000);
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  const receivedFrames: string[][] = [];
  const capture: Capture = async (name, page, fullPage = true) => {
    if (process.env.DEHLA_VISUAL_QA !== "1") return;
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage, animations: "disabled" });
  };
  try {
    for (let index = 0; index < 4; index += 1) {
      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();
      const frames: string[] = [];
      page.on("websocket", (socket) => socket.on("framereceived", ({ payload }) => frames.push(typeof payload === "string" ? payload : payload.toString())));
      pages.push(page);
      receivedFrames.push(frames);
    }

    await joinFourPlayers(pages, capture);
    await expect(pages[0].getByText("P1 + P3 · Team A", { exact: true })).toBeVisible();
    await expect(pages[0].getByText("P2 + P4 · Team B. Play moves clockwise around the table.", { exact: true })).toBeVisible();
    await pages[0].getByRole("button", { name: "Start match · 4/4" }).click();
    await Promise.all(pages.map((page) => expect(page.locator("[data-testid='dealer-stage']")).toBeVisible()));
    await expect(pages[0].getByText(/Team [AB] lost the draw and deals/)).toBeVisible();
    await capture("03-dealer-selection", pages[0]);
    const publicDealerSelectionIds = new Set(await pages[0].locator(".selection-cards .dehla-card").evaluateAll((cards) => cards.map((card) => card.getAttribute("data-card-id") ?? "")));

    await dealFive(pages);
    await capture("04-finding-hukum", pages[0]);

    await expect(pages[0].locator(".hukum-display")).toContainText("Not declared");
    await expect(pages[0].locator(".dehla-title")).toContainText(/Hand \d of max 5/);
    await expect(pages[0].locator(".pending-lot .lot-stack")).toBeVisible();
    await expect(pages[0].locator(".pending-lot .streak-status")).toBeVisible();
    await expect(pages[0].locator(".seat-player-1")).toHaveAttribute("data-table-position", "local");
    await expect(pages[0].locator(".seat-player-2")).toHaveAttribute("data-table-position", "left");
    await expect(pages[0].locator(".seat-player-3")).toHaveAttribute("data-table-position", "partner");
    await expect(pages[0].locator(".seat-player-4")).toHaveAttribute("data-table-position", "right");
    await expect(pages[0].locator(".seat-player-3")).toContainText("Partner");

    const boxes = await Promise.all([1, 2, 3, 4].map((seat) => pages[0].locator(`.seat-player-${seat}`).boundingBox()));
    if (boxes.some((box) => !box)) throw new Error("Expected all four compass seats.");
    const [p1, p2, p3, p4] = boxes as NonNullable<(typeof boxes)[number]>[];
    expect(Math.abs((p1.x + p1.width / 2) - (p3.x + p3.width / 2))).toBeLessThan(20);
    expect(Math.abs((p2.y + p2.height / 2) - (p4.y + p4.height / 2))).toBeLessThan(20);
    expect(p3.y).toBeLessThan(p1.y);
    expect(p2.x).toBeLessThan(p4.x);

    const privateHands = await Promise.all(pages.map(hand));
    const seatTokens = await Promise.all(pages.map((page) => page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("dehla-pakad-online-seat-v1") ?? "null") as { seatToken?: string } | null;
      return saved?.seatToken ?? "";
    })));
    for (let viewer = 0; viewer < pages.length; viewer += 1) {
      await expect(pages[viewer].locator(".dehla-seat .dehla-card")).toHaveCount(0);
      const clientVisibleNetworkData = receivedFrames[viewer].join("\n");
      expect(clientVisibleNetworkData).not.toContain('"undealt"');
      expect(clientVisibleNetworkData).not.toContain('"nextDealerByTeam"');
      expect(clientVisibleNetworkData).not.toContain('"hands"');
      for (const ownCard of privateHands[viewer]) expect(clientVisibleNetworkData).toContain(ownCard.id);
      for (let opponent = 0; opponent < pages.length; opponent += 1) {
        if (opponent === viewer) continue;
        expect(clientVisibleNetworkData).not.toContain(seatTokens[opponent]);
        for (const card of privateHands[opponent]) {
          await expect(pages[viewer].locator(`[data-card-id="${card.id}"]`)).toHaveCount(0);
          if (!publicDealerSelectionIds.has(card.id)) expect(clientVisibleNetworkData).not.toContain(card.id);
        }
      }
    }

    const firstActor = await visiblePageIndex(pages, ".turn-banner.your-turn:has-text('Your turn')");
    for (let index = 0; index < pages.length; index += 1) {
      if (index === firstActor) continue;
      await expect(pages[index].locator(".player-hand .dehla-card").first()).toBeDisabled();
    }

    await establishHukum(pages, capture);
    await Promise.all(pages.map((page) => expect(page.locator(".hukum-display.declared")).not.toContainText("Not declared")));
    await Promise.all(pages.map((page) => expect(page.locator(".second-deal-event")).toContainText("Second deal complete")));
    await capture("06-second-deal-full-hand", pages[0]);
    await capture("08-pending-lot", pages[0]);

    const initialPublicLot = await inspectPendingLot(pages);
    const initialPublicCards = initialPublicLot.flatMap((lotHand) => lotHand.plays);
    expect(initialPublicCards.length).toBeGreaterThanOrEqual(4);
    expect(initialPublicCards.length % 4).toBe(0);
    for (const lotHand of initialPublicLot) {
      expect(lotHand.winner).toMatch(/^player-[1-4]$/);
      expect(lotHand.winningTeam).toMatch(/^[AB]$/);
      expect(lotHand.plays).toHaveLength(4);
      expect(lotHand.plays.map((play) => play.order)).toEqual([1, 2, 3, 4]);
      expect(lotHand.plays.every((play) => /^player-[1-4]$/.test(play.playerId) && Boolean(play.cardId))).toBe(true);
    }
    await closePendingLot(pages);

    const capturePlan = await planConsecutiveLeaderWins(pages, 1);
    await playPlannedTrick(pages, capturePlan[0]);
    await Promise.all(pages.map((page) => expect(page.getByRole("button", { name: "Inspect pending lot, 0 cards" })).toBeVisible()));
    const clearedLot = await inspectPendingLot(pages);
    expect(clearedLot).toEqual([]);
    await Promise.all(pages.map((page) => expect(page.locator(".pending-lot-empty")).toContainText("The table is clear")));
    await closePendingLot(pages);

    const twoWinPlan = await planConsecutiveLeaderWins(pages, 2);
    const streakLeader = twoWinPlan[0][0].pageIndex;
    await playPlannedTrick(pages, twoWinPlan[0]);
    await Promise.all(pages.map((page) => expect(page.getByRole("button", { name: "Inspect pending lot, 4 cards" })).toBeVisible()));
    await Promise.all(pages.map((page) => expect(page.locator(".streak-status")).toContainText(`P${streakLeader + 1} ×1`)));
    const restartedLot = await inspectPendingLot(pages);
    expect(restartedLot).toHaveLength(1);
    expect(restartedLot[0]).toMatchObject({
      winner: `player-${streakLeader + 1}`,
      winningTeam: streakLeader % 2 === 0 ? "A" : "B",
    });
    expect(restartedLot[0].plays.map((play) => play.cardId)).toEqual(twoWinPlan[0].map((play) => play.card.id));
    expect(restartedLot[0].plays.map((play) => play.playerId)).toEqual(twoWinPlan[0].map((play) => `player-${play.pageIndex + 1}`));
    await closePendingLot(pages);

    await playPlannedTrick(pages, twoWinPlan[1]);
    await Promise.all(pages.map((page) => expect(page.getByRole("button", { name: "Inspect pending lot, 0 cards" })).toBeVisible()));
    await capture("15-lot-collected", pages[0]);

    const originalViewport = pages[0].viewportSize() ?? { width: 1280, height: 720 };
    for (const [name, width, height] of [
      ["09-desktop-1440", 1440, 900],
      ["10-laptop-1024", 1024, 768],
      ["11-tablet-768", 768, 900],
      ["12-mobile-390", 390, 844],
      ["13-mobile-landscape", 844, 390],
    ] as const) {
      await pages[0].setViewportSize({ width, height });
      await expect.poll(() => pages[0].evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await capture(name, pages[0], false);
    }
    await pages[0].setViewportSize(originalViewport);
    const postDealCounts = await Promise.all(pages.map(async (page) => page.locator(".player-hand .dehla-card").count()));
    expect(new Set(postDealCounts).size).toBe(1);
    expect(postDealCounts[0]).toBeGreaterThanOrEqual(8);
    const postDealHands = await Promise.all(pages.map(hand));
    for (let viewer = 0; viewer < pages.length; viewer += 1) {
      const clientVisibleNetworkData = receivedFrames[viewer].join("\n");
      for (let opponent = 0; opponent < pages.length; opponent += 1) {
        if (opponent === viewer) continue;
        for (const card of postDealHands[opponent]) {
          if (!publicDealerSelectionIds.has(card.id)) expect(clientVisibleNetworkData).not.toContain(card.id);
        }
      }
    }

    const reconnectCards = (await hand(pages[2])).map((card) => card.id).sort();
    await pages[2].reload();
    await expect(pages[2].getByText("Live · restored seat", { exact: true })).toBeVisible();
    await expect.poll(async () => (await hand(pages[2])).map((card) => card.id).sort()).toEqual(reconnectCards);
    await expect(pages[2].locator(".dehla-seat .dehla-card")).toHaveCount(0);

    let capturedCarryMoment = false;
    let capturedLotCollection = false;
    for (let action = 0; action < 60; action += 1) {
      if (await pages[0].locator(".dehla-result").isVisible().catch(() => false)) break;
      const actorIndex = await visiblePageIndex(pages, ".turn-banner.your-turn:has-text('Your turn')");
      const enabled = pages[actorIndex].locator(".player-hand .dehla-card:not([disabled])").first();
      const cardId = await enabled.getAttribute("data-card-id");
      if (!cardId) throw new Error("No legal card was available during round play.");
      await playCard(pages[actorIndex], cardId);
      if (!capturedCarryMoment && await pages[0].locator(".table-moment.carry").isVisible().catch(() => false)) {
        await capture("14-ten-carries-lot", pages[0]);
        capturedCarryMoment = true;
      }
      if (!capturedLotCollection && await pages[0].locator(".table-moment.capture").isVisible().catch(() => false)) {
        await capture("15-lot-collected", pages[0]);
        capturedLotCollection = true;
      }
    }

    await Promise.all(pages.map((page) => expect(page.locator(".dehla-result")).toBeVisible()));
    await expect(pages[0].locator(".dehla-result")).toContainText("Net match standing");
    await expect(pages[0].locator(".dehla-result")).toContainText("Hukum");
    await expect(pages[0].locator(".dehla-result")).toContainText("Round dealer:");
    await expect(pages[0].locator(".dehla-result")).toContainText("Next dealer");
    await capture("16-round-result", pages[0]);
    await pages[0].getByRole("button", { name: "Prepare next round" }).click();
    await Promise.all(pages.map((page) => expect(page.locator("[data-testid='dealer-stage']")).toBeVisible()));
    await expect(pages[0].getByText(/The match-level standing selected the behind team/)).toBeVisible();
    for (let viewer = 0; viewer < pages.length; viewer += 1) {
      const clientVisibleNetworkData = receivedFrames[viewer].join("\n");
      expect(clientVisibleNetworkData).not.toContain('"undealt"');
      expect(clientVisibleNetworkData).not.toContain('"nextDealerByTeam"');
      expect(clientVisibleNetworkData).not.toContain('"hands"');
      for (let opponent = 0; opponent < pages.length; opponent += 1) {
        if (opponent !== viewer) expect(clientVisibleNetworkData).not.toContain(seatTokens[opponent]);
      }
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
