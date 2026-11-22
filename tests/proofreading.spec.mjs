import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { multiPagePdf } from './fixture.mjs';

const mock = process.env.PROOFREADING_MOCK_URL;
test.skip(!mock, '互換APIのモック付きComposeで実行するテストです。');

const fixture = new URL('./fixtures/japanese-proofreading.pdf', import.meta.url);

async function callLog(request) {
  const response = await request.get(mock + '/test/calls');
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function upload(request, buffer, name) {
  const response = await request.post('/api/documents', {
    multipart: { file: { name, mimeType: 'application/pdf', buffer } },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function waitForJob(request, path, check) {
  let latest;
  await expect.poll(async () => {
    latest = await (await request.get(`${path}/proofreading/${check.id}`)).json();
    return latest.status;
  }).toBe('completed');
  return latest;
}

async function expectTextOverlap(overlay, quote) {
  await expect.poll(() => overlay.evaluate((element, term) => {
    const span = Array.from(element.closest('.page').querySelectorAll('.textLayer span'))
      .find(({ textContent }) => textContent?.includes(term));
    const text = span?.firstChild;
    if (!text) return 0;
    const range = document.createRange();
    const offset = text.textContent.indexOf(term);
    range.setStart(text, offset);
    range.setEnd(text, offset + term.length);
    const expected = range.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    const width = Math.max(0, Math.min(box.right, expected.right) - Math.max(box.left, expected.left));
    const height = Math.max(0, Math.min(box.bottom, expected.bottom) - Math.max(box.top, expected.top));
    return width * height / (box.width * box.height);
  }, quote)).toBeGreaterThan(0.8);
}

test('開始操作で単体ページと全ページをチェックし、採用した候補だけを保存できる', async ({ page, request }) => {
  const initialCalls = (await callLog(request)).length;
  const document = await upload(request, await readFile(fixture), '日本語の校正テスト.pdf');
  expect(document.pageCount).toBe(3);
  const path = `/api/documents/${document.id}`;

  try {
    await page.goto('/');
    await page.getByRole('link', { name: document.fileName, exact: true }).click();
    const panel = page.getByRole('region', { name: '誤字チェック' });
    const start = panel.getByRole('button', { name: '誤字チェックを開始' });
    await expect(start).toBeEnabled();
    await expect(panel.getByText('対象：1ページ')).toBeVisible();
    expect((await callLog(request)).length).toBe(initialCalls);
    expect((await request.get(`${path}/proofreading`)).status()).toBe(204);
    expect((await request.post(`${path}/proofreading`, { data: { scope: 'page', pageNumber: 4 } })).status()).toBe(400);
    expect((await request.post(`${path}/proofreading`, { data: { scope: 'all', pageNumber: 2 } })).status()).toBe(400);

    const secondPage = page.locator('.pdfViewer [data-page-number="2"]');
    await secondPage.evaluate((element) => {
      const viewer = element.closest('.PdfHighlighter');
      viewer.scrollTop += element.getBoundingClientRect().top - viewer.getBoundingClientRect().top;
    });
    await expect(panel.getByText('対象：2ページ')).toBeVisible();
    const singleRequest = page.waitForResponse((response) =>
      response.url().endsWith('/proofreading') && response.request().method() === 'POST');
    await start.click();
    const singleResponse = await singleRequest;
    expect(singleResponse.status()).toBe(202);
    expect(singleResponse.request().postDataJSON()).toEqual({ scope: 'page', pageNumber: 2 });

    await expect(panel.getByText('1 / 1ページ処理済み', { exact: false })).toBeVisible();
    const suggestions = panel.getByRole('list', { name: '誤字候補' });
    await expect(suggestions.getByRole('listitem')).toHaveCount(2);
    expect((await callLog(request)).slice(initialCalls)).toEqual([
      { page: 2, model: 'proofreading-test', responseFormat: 'json_schema' },
    ]);
    const latest = await (await request.get(`${path}/proofreading`)).json();
    const candidate = latest.pages[0].candidates.find(({ original }) => original === '２週刊');
    expect(candidate.rectangle).not.toBeNull();
    const row = suggestions.getByRole('listitem').filter({ hasText: '２週刊' });
    await row.getByRole('button', { name: '位置を表示' }).click();
    const overlay = secondPage.locator('.highlight-rectangle--proofreading');
    await expect(overlay).toBeInViewport();
    await expectTextOverlap(overlay, '２週刊');
    const initialWidth = (await secondPage.boundingBox()).width;
    await page.getByRole('button', { name: '拡大', exact: true }).click();
    await expect.poll(async () => (await secondPage.boundingBox()).width).toBeGreaterThan(initialWidth);
    await expect.poll(() => overlay.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const frame = element.closest('.page').getBoundingClientRect();
      return (rect.left - frame.left) / frame.width;
    })).toBeCloseTo(candidate.rectangle.left, 3);

    expect(await (await request.get(`${path}/highlights`)).json()).toEqual([]);
    await row.getByRole('button', { name: '採用', exact: true }).click();
    await expect(row.getByRole('button', { name: '採用済み' })).toBeDisabled();
    const [saved] = await (await request.get(`${path}/highlights`)).json();
    expect(saved).toMatchObject({ id: candidate.id, pageNumber: 2, rectangle: candidate.rectangle });
    expect(saved.description).toContain('「２週刊」→ 「２週間」');
    const duplicate = await request.post(`${path}/highlights`, { data: saved });
    expect(await duplicate.json()).toEqual(saved);
    expect(await (await request.get(`${path}/highlights`)).json()).toEqual([saved]);
    await page.reload();
    await expect(panel.getByRole('button', { name: '採用済み' })).toBeDisabled();
    expect((await callLog(request)).length).toBe(initialCalls + 1);

    await panel.getByRole('button', { name: '全ページ', exact: true }).click();
    await expect(panel.getByText('対象：全3ページ')).toBeVisible();
    await start.click();
    await expect(panel.getByRole('button', { name: 'チェック中…' })).toBeDisabled();
    await expect(panel.getByText('3 / 3ページ処理済み', { exact: false })).toBeVisible();
    await expect(suggestions.getByRole('listitem')).toHaveCount(8);
    await expect(suggestions.getByRole('listitem').filter({ hasText: '原文にない語' }))
      .toContainText('位置を特定できませんでした');
    await expect(suggestions.getByRole('listitem').filter({ hasText: '図書館の利用案内' }))
      .toContainText('位置を特定できませんでした');
    expect((await callLog(request)).slice(initialCalls).map(({ page }) => page)).toEqual([2, 1, 2, 3]);
    const thirdPageOverlay = page.locator('.pdfViewer [data-page-number="3"] .highlight-rectangle--proofreading');
    for (const quote of ['ボクスッへお戻しください。', 'ご連絡くさだい。']) {
      await suggestions.getByRole('listitem').filter({ hasText: quote })
        .getByRole('button', { name: '位置を表示' }).click();
      await expect(thirdPageOverlay).toBeInViewport();
      await expectTextOverlap(thirdPageOverlay, quote);
    }
    expect(await (await request.get(`${path}/highlights`)).json()).toEqual([saved]);

    await request.post(mock + '/test/failure', { data: { page: 2 } });
    await start.click();
    await expect(panel.getByRole('alert').filter({ hasText: 'HTTP 503' })).toContainText('2ページ');
    await expect(panel.getByText('3 / 3ページ処理済み', { exact: false })).toBeVisible();
    await expect(suggestions.getByRole('listitem').filter({ hasText: '本人確確認' })).toHaveCount(1);
    await expect(suggestions.getByRole('listitem').filter({ hasText: 'ボクスッへお戻しください。' })).toHaveCount(1);
  } finally {
    await request.post(mock + '/test/failure', { data: { page: null } });
    await request.delete(path);
  }
});

test('回転・トリミングされたPDFでも候補の矩形が文字に重なる', async ({ page, request }) => {
  const document = await upload(request, multiPagePdf({ cropSecondPage: true, secondText: 'Second page selecatble text' }),
    '回転とトリミングのテスト.pdf');
  const path = `/api/documents/${document.id}`;
  try {
    const response = await request.post(`${path}/proofreading`, { data: { scope: 'page', pageNumber: 2 } });
    expect(response.status()).toBe(202);
    const check = await waitForJob(request, path, await response.json());
    const [candidate] = check.pages[0].candidates;
    expect(candidate).toMatchObject({ original: 'selecatble', pageNumber: 2 });
    await page.goto(`/documents/${document.id}`);
    const panel = page.getByRole('region', { name: '誤字チェック' });
    await panel.getByRole('button', { name: '位置を表示' }).click();
    const overlay = page.locator('.pdfViewer [data-page-number="2"] .highlight-rectangle--proofreading');
    await expect(overlay).toBeInViewport();
    await expectTextOverlap(overlay, 'selecatble');
  } finally {
    await request.delete(path);
  }
});
