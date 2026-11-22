import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { multiPagePdf } from './fixture.mjs';

function pdfPage(page, number) {
  return page.locator(`.pdfViewer .page[data-page-number="${number}"]`);
}

async function showPageAtTop(page, number) {
  const target = pdfPage(page, number);
  await target.waitFor({ state: 'visible' });
  await target.evaluate((element) => {
    const viewer = element.closest('.PdfHighlighter');
    viewer.scrollTop += element.getBoundingClientRect().top - viewer.getBoundingClientRect().top;
  });
  return target;
}

async function drawRectangle(page, number, description) {
  const target = await showPageAtTop(page, number);
  await expect(target.locator('.textLayer')).toBeVisible();
  const box = await target.boundingBox();
  await page.mouse.move(box.x + box.width * 0.24, box.y + box.height * 0.18);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.33, { steps: 12 });
  await page.mouse.up();
  const dialog = page.getByRole('dialog', { name: 'ハイライトを登録' });
  await expect(dialog.getByText(`${number} ページの選択範囲`)).toBeVisible();
  await dialog.getByRole('textbox', { name: '説明（任意）' }).fill(description);
  await dialog.getByRole('button', { name: '登録する' }).click();
  await expect(dialog).toBeHidden();
}

async function expectPosition(page, number, label) {
  const overlay = pdfPage(page, number).getByRole('button', { name: new RegExp(label) });
  await expect(overlay).toBeAttached();
  await expect.poll(() => overlay.evaluate((element) => {
    const page = element.closest('.page').getBoundingClientRect();
    const rectangle = element.getBoundingClientRect();
    return Math.max(
      Math.abs(rectangle.left - page.left - page.width * 0.24),
      Math.abs(rectangle.top - page.top - page.height * 0.18),
      Math.abs(rectangle.right - page.left - page.width * 0.55),
      Math.abs(rectangle.bottom - page.top - page.height * 0.33),
    );
  })).toBeLessThan(3);
  return overlay;
}

test('PDFを開き、2ページ分の矩形を保存して再読み込み・拡縮後も同じ位置に描画する', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const name = `検証-${randomUUID()}.pdf`;
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'ファイルを選択' })).toBeEnabled();
  const upload = page.waitForResponse((response) =>
    response.url().endsWith('/api/documents') && response.request().method() === 'POST');
  await page.getByLabel('PDFファイル').setInputFiles({
    name, mimeType: 'application/pdf', buffer: multiPagePdf(),
  });
  const response = await upload;
  expect(response.status()).toBe(201);
  const document = await response.json();
  const path = `/api/documents/${document.id}`;

  try {
    await page.getByRole('link', { name, exact: true }).click();
    const firstPage = pdfPage(page, 1);
    const text = firstPage.getByText('First page selectable text', { exact: true });
    await expect(text).toBeVisible();
    const textBox = await text.boundingBox();
    await page.mouse.move(textBox.x + 2, textBox.y + textBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(textBox.x + textBox.width - 2, textBox.y + textBox.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toContain('selectable text');

    await page.getByRole('button', { name: '矩形選択' }).click();
    await drawRectangle(page, 1, '最初の矩形');
    await expectPosition(page, 1, '最初の矩形');
    await drawRectangle(page, 2, '回転ページの矩形');
    await expectPosition(page, 2, '回転ページの矩形');
    const saved = await (await request.get(`${path}/highlights`)).json();
    expect(saved.map(({ pageNumber }) => pageNumber)).toEqual([1, 2]);

    await page.reload();
    const list = page.getByRole('list', { name: '登録済みハイライト' });
    await expect(list).toBeVisible();
    await expectPosition(page, 1, '最初の矩形');
    await list.getByRole('button', { name: '2 ページ 回転ページの矩形' }).click();
    const second = await expectPosition(page, 2, '回転ページの矩形');
    await expect(second).toBeInViewport();
    const width = (await pdfPage(page, 2).boundingBox()).width;
    await page.getByRole('button', { name: '拡大', exact: true }).click();
    await expect.poll(async () => (await pdfPage(page, 2).boundingBox()).width).toBeGreaterThan(width);
    await list.getByRole('button', { name: '2 ページ 回転ページの矩形' }).click();
    await expectPosition(page, 2, '回転ページの矩形');
    await page.getByRole('button', { name: '縮小', exact: true }).click();
    await expect.poll(async () => (await pdfPage(page, 2).boundingBox()).width).toBeLessThan(width);
    await expectPosition(page, 2, '回転ページの矩形');
    await page.getByRole('button', { name: '幅に合わせる' }).click();
    await expectPosition(page, 2, '回転ページの矩形');

    await list.getByRole('button', { name: '1 ページ 最初の矩形' }).click();
    await expect(page.locator('.selected-highlight')).toContainText('最初の矩形');
    await page.getByRole('button', { name: '矩形選択' }).click();
    await showPageAtTop(page, 2);
    await second.click();
    await expect(page.locator('.selected-highlight')).toContainText('回転ページの矩形');
    await list.getByRole('button', { name: 'ハイライトを削除：回転ページの矩形' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '削除する' }).click();
    await expect(second).toHaveCount(0);
    expect((await (await request.get(`${path}/highlights`)).json()).map(({ description }) => description))
      .toEqual(['最初の矩形']);

    await page.getByRole('link', { name: '一覧に戻る' }).click();
    await page.getByRole('button', { name: `${name}を削除` }).click();
    await page.getByRole('dialog').getByRole('button', { name: '削除する' }).click();
    await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await request.delete(path);
  }
});
