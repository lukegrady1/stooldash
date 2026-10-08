import { devices, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export const WORDS = [
  { word: 'Snollygoster', definition: 'A shrewd, unprincipled person, especially a politician.' },
  { word: 'Bumfuzzle', definition: 'To confuse or fluster.' },
];

export interface Host {
  context: BrowserContext;
  page: Page;
  code: string;
}

export interface Player {
  context: BrowserContext;
  page: Page;
  name: string;
}

/** Build a deck in the editor and open the lobby. Returns the join code. */
export async function createGame(browser: Browser, words = WORDS): Promise<Host> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto('/host/new');
  for (let i = 0; i < words.length; i++) {
    if (i > 0) await page.getByRole('button', { name: 'Add word' }).click();
    await page.getByLabel(`Word ${i + 1}`, { exact: true }).fill(words[i]!.word);
    await page.getByLabel(`Definition ${i + 1}`, { exact: true }).fill(words[i]!.definition);
  }
  await page.getByRole('button', { name: `Open lobby with ${words.length} words` }).click();
  await page.waitForURL(/\/host\/[A-Z]{4}$/);
  const code = page.url().slice(-4);
  await expect(page.getByLabel(/Join code/)).toBeVisible();
  return { context, page, code };
}

/** Join from a phone-sized context. */
export async function joinGame(browser: Browser, code: string, name: string): Promise<Player> {
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  await page.goto(`/join?code=${code}`);
  await expect(page.getByLabel('Game code')).toHaveValue(code);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await page.waitForURL(`**/play/${code}`);
  await expect(page.getByRole('heading', { name: `You’re in, ${name}.` })).toBeVisible();
  return { context, page, name };
}

export async function submitDefinition(p: Player, text: string) {
  await p.page.getByLabel('Your definition').fill(text);
  await p.page.getByRole('button', { name: /Submit definition|Save changes/ }).click();
  await expect(p.page.getByText('✓ Submitted')).toBeVisible();
}

export async function voteFor(p: Player, textFragment: string) {
  const card = p.page.getByRole('button', {
    name: new RegExp(`^Card [A-Z]: ${escapeRe(textFragment)}`),
  });
  await card.click();
  await expect(p.page.getByText('Vote locked in.')).toBeVisible();
}

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Read the scoreboard as [name, score] rows. */
export async function readScoreboard(page: Page): Promise<Array<[string, number]>> {
  const board = page.getByLabel('Scoreboard');
  await expect(board).toBeVisible();
  const rows = board.getByRole('listitem');
  const count = await rows.count();
  const out: Array<[string, number]> = [];
  for (let i = 0; i < count; i++) {
    const spans = rows.nth(i).locator(':scope > span');
    const name = (await spans.nth(1).innerText()).replace('★', '').trim();
    const score = Number(await spans.nth(3).innerText());
    out.push([name, score]);
  }
  return out;
}
