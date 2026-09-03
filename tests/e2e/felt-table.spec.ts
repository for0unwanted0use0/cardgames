import { expect, test, type Browser, type Page } from "@playwright/test";

const viewports = [
  { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 },
  { width: 768, height: 900 }, { width: 1024, height: 768 }, { width: 1440, height: 900 },
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

async function newPlayer(browser: Browser, name: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
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

    await guest.page.getByLabel("Room code").fill(roomCode!);
    await guest.page.getByRole("button", { name: "Join table" }).click();
    await expect(host.page.getByText(`Guest${stamp}`, { exact: true })).toBeVisible();
    await host.page.getByRole("button", { name: /Start game/ }).click();

    const hostStarts = await host.page.getByText("Your turn", { exact: true }).isVisible();
    const actor = hostStarts ? host.page : guest.page;
    const nextPlayer = hostStarts ? guest.page : host.page;
    await expect(actor.getByText("Your turn", { exact: true })).toBeVisible();
    await expect(nextPlayer.locator(".turn-banner.waiting")).toBeVisible();
    await assertGameplayFitsViewport(actor);
    await assertGameplayFitsViewport(nextPlayer);
    await actor.locator(".hand-cards button.playing-card").first().click();
    await expect(actor.locator(".hand-cards button.playing-card").first()).toHaveAttribute("aria-pressed", "true");
    await actor.getByRole("button", { name: /Discard selected/ }).click();
    await expect(actor.getByText("Choose your draw", { exact: true })).toBeVisible();
    await actor.getByRole("button", { name: "Draw from stock" }).last().click();

    await expect(nextPlayer.getByText("Your turn", { exact: true })).toBeVisible();
    await expect(nextPlayer.locator(".discard-zone .playing-card")).toHaveCount(1);
    await expect(actor.getByText("cards hidden", { exact: true })).toBeVisible();
    await assertNoPageOverflow(host.page);
    await assertNoPageOverflow(guest.page);
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
    await host.page.setViewportSize({ width: 360, height: 800 });
    const stripScrolls = await host.page.locator(".opponent-strip").evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(stripScrolls).toBe(true);
  } finally {
    await host.context.close();
    await Promise.all(guests.map(({ context }) => context.close()));
  }
});
