import { expect, test } from '@playwright/test';
import {
  WORDS,
  createGame,
  joinGame,
  readScoreboard,
  submitDefinition,
  voteFor,
  type Player,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test('a full 2-word game with a host and three phones', async ({ browser }) => {
  test.setTimeout(120_000);
  const host = await createGame(browser);
  const [ann, bob, cy] = await Promise.all([
    joinGame(browser, host.code, 'Ann'),
    joinGame(browser, host.code, 'Bob'),
    joinGame(browser, host.code, 'Cy'),
  ]);

  // Lobby shows everyone, then start.
  await expect(host.page.getByLabel('Players').getByRole('listitem')).toHaveCount(3);
  await host.page.getByRole('button', { name: 'Start game · 2 words' }).click();
  await expect(host.page.getByText('0 of 3 definitions in')).toBeVisible();
  await expect(ann.page.getByRole('heading', { name: WORDS[0]!.word })).toBeVisible();

  // Round 1: Ann writes the real definition (pre-ticked), the others bluff.
  await submitDefinition(ann, 'a shrewd, unprincipled person, especially a politician');
  await expect(host.page.getByText('1 of 3 definitions in')).toBeVisible();
  await submitDefinition(bob, 'A kind of hat.');
  await submitDefinition(cy, 'A small boat.');

  // Auto-advanced to REVIEW. Only the host sees the real definition.
  await expect(host.page.getByText('Only you see this')).toBeVisible();
  await expect(host.page.getByText('matches the real one')).toBeVisible();
  await expect(host.page.getByLabel('basically nailed it (+3)').first()).toBeChecked();
  await expect(ann.page.getByText('The host is shuffling the cards.')).toBeVisible();
  await host.page.getByRole('button', { name: 'Show definitions and start voting' }).click();

  // VOTING: Ann is marked and sits out. Bob is fooled by Cy; Cy finds the real one.
  await expect(ann.page.getByText('You knew the real definition.')).toBeVisible();
  await expect(
    bob.page.getByRole('heading', { name: 'Which one is the real definition?' }),
  ).toBeVisible();
  // Own card is disabled.
  await expect(bob.page.getByRole('button', { name: /A kind of hat/ })).toBeDisabled();
  await voteFor(bob, 'A small boat.');
  await voteFor(cy, WORDS[0]!.definition);

  // Auto-revealed.
  await expect(host.page.getByText('Ann knew it. +3')).toBeVisible();
  await expect(
    host.page.getByLabel(/Card [A-Z], the real definition\. Found by Cy\./),
  ).toBeVisible();
  await expect(host.page.getByLabel(/Card [A-Z], written by Cy\. Fooled 1: Bob\./)).toBeVisible();
  await expect(cy.page.getByText('+3 for you this round')).toBeVisible();
  await expect(bob.page.getByText('No points this round')).toBeVisible();
  await host.page.getByRole('button', { name: 'Show scoreboard' }).click();
  expect(await readScoreboard(host.page)).toEqual([
    ['Ann', 3],
    ['Cy', 3],
    ['Bob', 0],
  ]);
  await host.page.getByRole('button', { name: 'Next word' }).click();

  // Round 2: everyone bluffs.
  await expect(ann.page.getByRole('heading', { name: WORDS[1]!.word })).toBeVisible();
  await submitDefinition(ann, 'To tie a knot badly.');
  await submitDefinition(bob, 'A small drum.');
  await submitDefinition(cy, 'To whisper loudly.');
  await expect(host.page.getByText('Submissions')).toBeVisible();
  await host.page.getByRole('button', { name: 'Show definitions and start voting' }).click();
  await voteFor(ann, 'A small drum.'); // Bob +1
  await voteFor(bob, WORDS[1]!.definition); // Bob +2
  await voteFor(cy, 'To tie a knot badly.'); // Ann +1
  await host.page.getByRole('button', { name: 'Show scoreboard' }).click();
  expect(await readScoreboard(host.page)).toEqual([
    ['Ann', 4],
    ['Bob', 3],
    ['Cy', 3],
  ]);
  await host.page.getByRole('button', { name: 'Final results' }).click();

  await expect(host.page.getByRole('heading', { name: 'Ann wins' })).toBeVisible();
  await expect(bob.page.getByRole('heading', { name: 'Ann wins' })).toBeVisible();
  expect(await readScoreboard(ann.page)).toEqual([
    ['Ann', 4],
    ['Bob', 3],
    ['Cy', 3],
  ]);

  await Promise.all([
    host.context.close(),
    ann.context.close(),
    bob.context.close(),
    cy.context.close(),
  ]);
});

test('a player refresh mid-WRITING keeps the draft and the submission', async ({ browser }) => {
  const host = await createGame(browser);
  const [ann, bob] = await Promise.all([
    joinGame(browser, host.code, 'Ann'),
    joinGame(browser, host.code, 'Bob'),
  ]);
  await host.page.getByRole('button', { name: 'Start game · 2 words' }).click();

  const box = ann.page.getByLabel('Your definition');
  await box.fill('Half a thought');
  await ann.page.reload();
  await expect(ann.page.getByLabel('Your definition')).toHaveValue('Half a thought');

  await submitDefinition(ann, 'Half a thought, finished.');
  await ann.page.reload();
  await expect(ann.page.getByText('✓ Submitted')).toBeVisible();
  await expect(ann.page.getByLabel('Your submitted definition')).toContainText(
    'Half a thought, finished.',
  );

  // Edit after the refresh still works.
  await ann.page.getByRole('button', { name: 'Edit' }).click();
  await expect(ann.page.getByLabel('Your definition')).toHaveValue('Half a thought, finished.');

  await Promise.all([host.context.close(), ann.context.close(), bob.context.close()]);
});

test('a host refresh mid-VOTING keeps control', async ({ browser }) => {
  const host = await createGame(browser);
  const players: Player[] = await Promise.all([
    joinGame(browser, host.code, 'Ann'),
    joinGame(browser, host.code, 'Bob'),
  ]);
  await host.page.getByRole('button', { name: 'Start game · 2 words' }).click();
  await submitDefinition(players[0]!, 'One');
  await submitDefinition(players[1]!, 'Two');
  await host.page.getByRole('button', { name: 'Show definitions and start voting' }).click();
  await expect(host.page.getByText('0 of 2 votes in')).toBeVisible();

  await host.page.reload();
  await expect(host.page.getByText('0 of 2 votes in')).toBeVisible();
  await host.page.getByRole('button', { name: 'Reveal now' }).click();
  await expect(host.page.getByRole('button', { name: 'Show scoreboard' })).toBeVisible();

  // A stale second host tab clicking an old button is swallowed silently.
  const tab2 = await host.context.newPage();
  await tab2.goto(`/host/${host.code}`);
  await expect(tab2.getByRole('button', { name: 'Show scoreboard' })).toBeVisible();
  await host.page.getByRole('button', { name: 'Show scoreboard' }).click();
  await tab2
    .getByRole('button', { name: 'Show scoreboard' })
    .click({ timeout: 3000 })
    .catch(() => undefined);
  await expect(tab2.getByRole('button', { name: 'Next word' })).toBeVisible();
  await expect(tab2.getByRole('main').getByRole('alert')).toHaveCount(0);

  await Promise.all([host.context.close(), ...players.map((p) => p.context.close())]);
});
