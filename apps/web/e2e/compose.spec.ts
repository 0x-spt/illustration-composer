import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import aiReply from './fixtures/compose-intent.ai.json' with { type: 'json' };

const MINT_BG1 = '#BEEBEB';

/** Ids and transforms of everything on the canvas: changes whenever the layout does. */
const sceneSignature = (page: Page) =>
  page
    .locator('.stage [data-node-id]')
    .evaluateAll((els) =>
      els.map((e) => `${e.getAttribute('data-node-id')}@${e.getAttribute('transform')}`).join('|'),
    );

test('метафора → композиция → другой вариант → схема → экспорт SVG', async ({ page }) => {
  const requests: unknown[] = [];
  await page.route('**/api/compose-intent', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', json: aiReply });
  });

  await page.goto('/');
  await page.getByRole('textbox', { name: 'Опишите идею' }).fill('Командная работа над идеей');
  await page.getByRole('button', { name: 'Собрать', exact: true }).click();

  await expect(page.getByText('Подобрано AI')).toBeVisible();
  expect(requests).toEqual([{ text: 'Командная работа над идеей' }]);

  const nodes = page.locator('.stage [data-node-id]');
  await expect.poll(() => nodes.count()).toBeGreaterThanOrEqual(2);
  const first = await sceneSignature(page);

  await page.getByRole('button', { name: /Другой вариант/ }).click();
  await expect.poll(() => sceneSignature(page)).not.toBe(first);

  await page.locator('[data-palette="mint"]').click();
  await expect(page.locator('[data-palette="mint"]')).toHaveAttribute('aria-checked', 'true');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Экспорт SVG' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^illustration-\d+x\d+-\d{4}-\d{2}-\d{2}\.svg$/);

  const svg = await readFile(await download.path(), 'utf8');
  expect(svg).toMatch(/^<svg[\s>]/);
  expect(svg).not.toContain('<image');
  expect(svg).not.toContain('<foreignObject');
  expect(svg).not.toContain('<style');
  expect(svg).not.toContain('var(');
  expect(svg).toContain('data-item=');
  expect(svg.match(/data-item="/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  expect(svg.toUpperCase()).toContain(MINT_BG1);
});

test('объекты по названиям → предметы на холсте, незнакомое слово → подсказка', async ({
  page,
}) => {
  let apiCalls = 0;
  await page.route('**/api/compose-intent', async (route) => {
    apiCalls++;
    await route.abort();
  });

  await page.goto('/');
  await page.getByRole('group', { name: 'Режим' }).getByRole('button', { name: 'Объекты' }).click();
  const prompt = page.getByRole('textbox', { name: 'Опишите идею' });
  const nodes = page.locator('.stage [data-node-id]');

  await prompt.fill('книга, лампа');
  await page.getByRole('button', { name: 'Собрать', exact: true }).click();
  await expect
    .poll(() => nodes.evaluateAll((els) => els.map((e) => e.getAttribute('data-node-id'))))
    .toEqual(['book-1', 'lamp-1']);
  await expect(page.getByText('Наложений нет')).toBeVisible();
  // listed items start a size smaller than the designer's examples (D13)
  expect(Number(await page.getByLabel('Масштаб сцены').inputValue())).toBeLessThanOrEqual(70);

  await prompt.fill('книга, лампа, тел');
  await page.getByRole('button', { name: 'Собрать', exact: true }).click();
  await expect(page.getByText('Нет объекта «тел». Может, «Телефон»?')).toBeVisible();
  await expect(nodes).toHaveCount(2);
  expect(apiCalls).toBe(0);
});

test.describe('телефон', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('панели открываются шторками, предмет из библиотеки ложится на холст', async ({ page }) => {
    await page.goto('/');
    const sheet = page.getByRole('complementary', { name: 'Предметы и слои' });
    await expect(sheet).toBeHidden();

    await page.getByRole('button', { name: 'Предметы и слои' }).click();
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: /Книга/ }).click();
    // the sheet closes to show the canvas
    await expect(sheet).toBeHidden();
    await expect(page.locator('.stage [data-node-id]')).toHaveCount(1);

    await page.getByRole('button', { name: 'Холст и палитра' }).click();
    await page.locator('[data-palette="mint"]').click();
    await expect(page.locator('[data-palette="mint"]')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('complementary', { name: 'Свойства' })).toBeHidden();
  });
});
