import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('Excelの結合セルをプレビューし、全シートの誤字をセルに紐づけて保存する', async ({ page, request }) => {
  test.skip(!process.env.PROOFREADING_MOCK_URL, '互換APIのモック付きComposeで実行します。');
  const workbook = await readFile(new URL('./fixtures/japanese-workbook.xlsx', import.meta.url));
  const list = '/api/workbooks';
  await page.goto('/workbooks');
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const input = page.getByLabel('Excelファイル');
  await expect(page.getByRole('button', { name: 'ファイルを選択' })).toBeEnabled();
  const uploadPromise = page.waitForResponse((response) =>
    response.url().endsWith(list) && response.request().method() === 'POST');
  await input.setInputFiles({ name: '校正用ワークブック.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: workbook });
  const upload = await uploadPromise;
  expect(upload.status()).toBe(201);
  const book = await upload.json();
  const path = list + '/' + book.id;
  try {
    await page.getByRole('link', { name: book.fileName }).click();
    const grid = page.getByLabel('Excelプレビュー');
    await expect(grid.locator('td[colspan="2"][rowspan="2"]')).toHaveText('申込一覧');
    await expect(grid.getByText('<img src=x onerror=alert(1)>', { exact: true })).toBeVisible();
    await expect(grid.locator('img')).toHaveCount(0);
    await expect(grid.getByText('数式の結果', { exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: '内部' })).toHaveCount(0);

    await page.getByRole('button', { name: '誤字チェックを開始' }).click();
    const candidates = page.getByRole('list', { name: '誤字候補' });
    await expect(candidates.getByRole('listitem')).toHaveCount(1);
    await expect(candidates).toContainText('申込一覧!B3');
    expect(await (await request.get(path + '/findings')).json()).toEqual([]);

    await page.getByRole('button', { name: '全シート', exact: true }).click();
    await page.getByRole('button', { name: '誤字チェックを開始' }).click();
    await expect(page.getByRole('status')).toContainText('2 シート完了');
    await expect(candidates.getByRole('listitem')).toHaveCount(2);
    const second = candidates.getByRole('listitem').filter({ hasText: '案内!A1' });
    await second.getByRole('button', { name: 'セルを表示' }).click();
    await expect(page.getByRole('tab', { name: '案内' })).toHaveAttribute('aria-selected', 'true');
    await expect(grid.locator('.workbook-cell-target')).toHaveText('案内のご連絡くさだい。');
    await second.getByRole('button', { name: '採用', exact: true }).click();
    await expect(second.getByRole('button', { name: '採用済み' })).toBeDisabled();

    const [saved] = await (await request.get(path + '/findings')).json();
    expect(saved.finding).toMatchObject({ sheetNumber: 2, row: 1, column: 1, start: 6,
      original: 'くさだい', suggestion: 'ください' });
    const repeated = await request.post(path + '/findings', { data: saved.finding });
    expect(await repeated.json()).toEqual(saved);
    expect((await request.post(path + '/findings', { data: { ...saved.finding, start: 0 } })).status()).toBe(400);

    await page.reload();
    const persisted = page.getByRole('list', { name: '採用済みの指摘' });
    await expect(persisted).toContainText('案内!A1');
    await persisted.getByRole('button', { name: 'セルを表示' }).click();
    await expect(grid.locator('.workbook-cell-target')).toHaveText('案内のご連絡くさだい。');
    expect(errors).toEqual([]);
  } finally {
    await request.delete(path);
  }
});
