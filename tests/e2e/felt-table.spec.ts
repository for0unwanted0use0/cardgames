import { expect, test, type Browser, type Page } from "@playwright/test";

const viewports = [
  { width: 400, height: 546 }, { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 },
  { width: 768, height: 900 }, { width: 1024, height: 768 }, { width: 1321, height: 571 }, { width: 1440, height: 900 },
];

async function assertNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function assertGameplayFitsViewport(page: Page) {
  const bounds = await page.locator(".gameplay-stage").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, viewportHeight: window.innerHeight };
  });
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight + 1);
  await expect(page.locator(".online-game-header")).toBeInViewport();
  await expect(page.locator(".turn-banner")).toBeInViewport();
  await expect(page.locator(".opponent-strip")).toBeInViewport();
  await expect(page.locator(".table-center")).toBeInViewport();
  await expect(page.locator(".player-hand")).toBeInViewport();
  await expect(page.locator(".action-bar")).toBeInViewport();
}

test("lobby remains usable at all target widths", async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Online Declare" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create private table" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Join table" })).toBeVisible();
    await assertNoPageOverflow(page);
  }
});

test("the first-visit guide can be dismissed and reopened", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 546 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "You’ll learn it in one round" })).toBeVisible();
  const guideBounds = await page.locator(".game-guide").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { top: bounds.top, bottom: bounds.bottom, viewportHeight: window.innerHeight };
  });
  expect(guideBounds.top).toBeGreaterThanOrEqual(0);
  expect(guideBounds.bottom).toBeLessThanOrEqual(guideBounds.viewportHeight);
  await expect(page.getByRole("button", { name: "Close how to play" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Got it — let’s play" })).toBeInViewport();
  await page.getByRole("button", { name: "Got it — let’s play" }).click();
  await expect(page.getByRole("heading", { name: "You’ll learn it in one round" })).toBeHidden();
  await expect(page.locator(".guide-launch")).toHaveCount(0);
  await page.getByRole("button", { name: "Open app menu" }).click();
  await page.getByRole("button", { name: "How to play" }).click();
  await expect(page.getByRole("heading", { name: "You’ll learn it in one round" })).toBeVisible();
  const closeGuide = page.getByRole("button", { name: "Close how to play" });
  await expect(closeGuide).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Got it — let’s play" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(closeGuide).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "You’ll learn it in one round" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Open app menu" })).toBeFocused();
  await page.reload();
  await expect(page.getByRole("heading", { name: "You’ll learn it in one round" })).toBeHidden();
});

async function newPlayer(browser: Browser, name: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => localStorage.setItem("declare-guide-v1", "seen"));
  const page = await context.newPage();
  await page.goto("/");
  await page.getByLabel("Your name").fill(name);
  return { context, page };
}

test("two private-discard players can join, start, discard, and draw", async ({ browser }) => {
  const stamp = Date.now().toString().slice(-6);
  const host = await newPlayer(browser, `Host${stamp}`);
  const guest = await newPlayer(browser, `Guest${stamp}`);
  try {
    await host.page.getByText("Next player only", { exact: true }).click();
    await host.page.getByRole("button", { name: "Create private table" }).click();
    const roomCode = (await host.page.locator(".room-code-button strong").textContent())?.trim();
    expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);
    await host.page.locator(".room-code-button").click();
    const copyNotice = host.page.locator(".notice");
    await expect(copyNotice).toBeVisible();
    const firstNoticeId = await copyNotice.getAttribute("data-notice-id");
    await host.page.locator(".room-code-button").click();
    await expect.poll(() => copyNotice.getAttribute("data-notice-id")).not.toBe(firstNoticeId);

    await guest.page.getByLabel("Room code").fill(roomCode!);
    await guest.page.getByRole("button", { name: "Join table" }).click();
    await expect(host.page.getByText(`Guest${stamp}`, { exact: true })).toBeVisible();
    await host.page.getByRole("button", { name: /Start game/ }).click();

    await expect(host.page.locator(".gameplay-stage")).toBeVisible();
    await expect(guest.page.locator(".gameplay-stage")).toBeVisible();
    const hostStarts = await host.page.getByText("Your turn", { exact: true }).isVisible();
    const actor = hostStarts ? host.page : guest.page;
    const nextPlayer = hostStarts ? guest.page : host.page;
    await expect(actor.getByText("Your turn", { exact: true })).toBeVisible();
    await expect(actor.locator(".stock-zone")).toContainText("40 remaining");
    await expect(actor.locator(".discard-zone .playing-card")).toHaveCount(1);
    await expect(nextPlayer.locator(".turn-banner.waiting")).toBeVisible();
    await assertGameplayFitsViewport(actor);
    await assertGameplayFitsViewport(nextPlayer);
    const handCards = actor.locator(".hand-cards button.playing-card");
    const cardBounds = await handCards.evaluateAll((cards) => cards.map((card) => {
      const bounds = card.getBoundingClientRect(); return { left: bounds.left, right: bounds.right };
    }));
    expect(cardBounds.every((bounds, index) => index === 0 || bounds.left >= cardBounds[index - 1].right)).toBe(true);

    const firstCardText = await handCards.first().textContent();
    await actor.getByRole("button", { name: "Arrange", exact: true }).click();
    await handCards.first().click();
    await actor.getByRole("button", { name: "Right →" }).click();
    await expect(handCards.nth(1)).toHaveText(firstCardText!);
    await actor.getByRole("button", { name: "Done", exact: true }).click();

    const cardTexts = await handCards.allTextContents();
    const firstRank = cardTexts[0].replace(/[♣♦♥♠]/gu, "");
    const differentRankIndex = cardTexts.findIndex((text, index) => index > 0 && text.replace(/[♣♦♥♠]/gu, "") !== firstRank);
    expect(differentRankIndex).toBeGreaterThan(0);
    await handCards.first().click();
    await handCards.nth(differentRankIndex).click();
    await actor.getByRole("button", { name: /Discard selected/ }).click();
    const errorNotice = actor.locator(".notice[role='alert']");
    await expect(errorNotice).toContainText(/two-card discard/i);
    await expect(errorNotice).toBeHidden({ timeout: 7_500 });
    await actor.getByRole("button", { name: /Discard selected/ }).click();
    await expect(errorNotice).toBeVisible();
    await actor.getByRole("button", { name: "Dismiss message" }).click();
    await expect(errorNotice).toBeHidden();
    await handCards.first().click();
    await handCards.nth(differentRankIndex).click();

    await handCards.first().click();
    await expect(handCards.first()).toHaveAttribute("aria-pressed", "true");
    await actor.getByRole("button", { name: /Discard selected/ }).click();
    await expect(actor.getByText("Choose your draw", { exact: true })).toBeVisible();
    await actor.getByRole("button", { name: "Draw from stock" }).last().click();

    await expect(nextPlayer.getByText("Your turn", { exact: true })).toBeVisible();
    await expect(nextPlayer.locator(".discard-zone .playing-card")).toHaveCount(1);
    await expect(actor.getByText("cards hidden", { exact: true })).toBeVisible();
    await actor.locator(".game-details summary").click();
    const turnAlerts = actor.getByRole("button", { name: "Enable" });
    await turnAlerts.click();
    await expect(actor.getByRole("button", { name: "On", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(await actor.evaluate(() => localStorage.getItem("declare-turn-alerts-v1"))).toBe("on");
    await assertNoPageOverflow(host.page);
    await assertNoPageOverflow(guest.page);
    actor.once("dialog", async (dialog) => dialog.dismiss());
    await actor.getByRole("button", { name: "Leave room and return home" }).click();
    await expect(actor.locator(".gameplay-stage")).toBeVisible();
    actor.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("counts as a forfeit");
      await dialog.accept();
    });
    await actor.getByRole("button", { name: "Leave room and return home" }).click();
    await expect(actor.getByRole("button", { name: "Create private table" })).toBeVisible();
    await expect(nextPlayer.getByRole("heading", { name: "Victory by walkover" })).toBeVisible();
    await expect(nextPlayer.getByText(/left the table/)).toBeVisible();
  } finally {
    await host.context.close();
    await guest.context.close();
  }
});

test("a six-player table remains usable on desktop and mobile", async ({ browser }) => {
  test.setTimeout(90_000);
  const stamp = Date.now().toString().slice(-6);
  const host = await newPlayer(browser, `Host${stamp}`);
  const guests: Awaited<ReturnType<typeof newPlayer>>[] = [];
  try {
    await host.page.getByRole("button", { name: "Create private table" }).click();
    const roomCode = (await host.page.locator(".room-code-button strong").textContent())?.trim();
    expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);
    for (let index = 1; index <= 5; index += 1) {
      const guest = await newPlayer(browser, `P${index}${stamp}`);
      guests.push(guest);
      await guest.page.getByLabel("Room code").fill(roomCode!);
      await guest.page.getByRole("button", { name: "Join table" }).click();
    }
    await expect(host.page.locator(".lobby-list > div")).toHaveCount(6);
    await host.page.getByRole("button", { name: /Start game · 6\/6/ }).click();
    await expect(host.page.locator(".opponent-strip .player-seat")).toHaveCount(5);
    for (const viewport of viewports) {
      await host.page.setViewportSize(viewport);
      await assertGameplayFitsViewport(host.page);
      await assertNoPageOverflow(host.page);
    }
    await host.page.locator(".utility-rail").scrollIntoViewIfNeeded();
    const collapsedHeights = await host.page.locator(".voice-panel, .game-details").evaluateAll((panels) => panels.map((panel) => panel.getBoundingClientRect().height));
    expect(collapsedHeights.every((height) => height <= 55)).toBe(true);
    await host.page.setViewportSize({ width: 360, height: 800 });
    const stripScrolls = await host.page.locator(".opponent-strip").evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(stripScrolls).toBe(true);
  } finally {
    await host.context.close();
    await Promise.all(guests.map(({ context }) => context.close()));
  }
});
