import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('Blazorは表示範囲だけをメモリに描画し、日本語本文を選択できる', async ({ page, request, context }) => {
  const entry = await request.get('/');
  test.skip(!(await entry.text()).includes('blazor.webassembly.js'), 'Blazor版の描画用テストです。');

  const response = await request.post('/api/documents', {
    multipart: { file: {
      name: 'メモリ描画テスト.pdf', mimeType: 'application/pdf',
      buffer: await readFile(new URL('./fixtures/japanese-proofreading.pdf', import.meta.url)),
    } },
  });
  expect(response.status()).toBe(201);
  const document = await response.json();
  const path = '/api/documents/' + document.id;
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/documents/' + document.id);
    const first = page.locator('[data-page-number="1"]');
    const third = page.locator('[data-page-number="3"]');
    const image = first.locator('img.pdf-page-image');
    await expect(image).toHaveAttribute('src', /^blob:/);
    await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0);
    const firstUrl = await image.getAttribute('src');
    await expect(third.locator('img')).toHaveCount(0);
    const line = first.locator('.textLayer span').filter({ hasText: '本人確確認' });
    const bounds = await line.boundingBox();
    await page.mouse.move(bounds.x + 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width - 2, bounds.y + bounds.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toContain('本人確確認');

    await page.keyboard.press('ControlOrMeta+c');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('本人確確認');

    await third.evaluate((element) => {
      element.closest('.PdfHighlighter').scrollTop = element.offsetTop;
    });
    const thirdImage = third.locator('img.pdf-page-image');
    await expect(thirdImage).toHaveAttribute('src', /^blob:/);
    await expect(image).toHaveCount(0);
    await expect.poll(() => page.evaluate(async (url) => {
      try { await fetch(url); return false; } catch { return true; }
    }, firstUrl)).toBe(true);
  } finally {
    await request.delete(path);
  }
});
