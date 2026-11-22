import { expect, test } from '@playwright/test';
import { multiPagePdf } from './fixture.mjs';

test('PDFのRange配信、入力検証、ハイライトの保存と文書削除', async ({ request }) => {
  const pdf = multiPagePdf();
  const corrupt = await request.post('/api/documents', {
    multipart: { file: { name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('invalid') } },
  });
  expect(corrupt.status()).toBe(400);

  const upload = await request.post('/api/documents', {
    multipart: { file: { name: '範囲テスト.pdf', mimeType: 'application/pdf', buffer: pdf } },
  });
  expect(upload.status()).toBe(201);
  const item = await upload.json();
  const path = `/api/documents/${item.id}`;
  const highlights = `${path}/highlights`;

  try {
    expect(item).toMatchObject({ fileName: '範囲テスト.pdf', pageCount: 2 });
    expect(item).not.toHaveProperty('storageKey');
    expect(await (await request.get('/api/documents')).json()).toContainEqual(item);
    const read = await request.get(`${path}/content`);
    expect(read.headers()['content-type']).toBe('application/pdf');
    expect(await read.body()).toEqual(pdf);
    const head = await request.head(`${path}/content`);
    expect(head.status()).toBe(200);
    expect(head.headers()['content-length']).toBe(String(pdf.length));
    const partial = await request.get(`${path}/content`, { headers: { Range: 'bytes=10-39' } });
    expect(partial.status()).toBe(206);
    expect(partial.headers()['accept-ranges']).toBe('bytes');
    expect(partial.headers()['content-range']).toBe(`bytes 10-39/${pdf.length}`);
    expect(await partial.body()).toEqual(pdf.subarray(10, 40));
    const unsatisfied = await request.get(`${path}/content`, { headers: { Range: `bytes=${pdf.length}-` } });
    expect(unsatisfied.status()).toBe(416);
    expect(unsatisfied.headers()['content-range']).toBe(`bytes */${pdf.length}`);

    const body = {
      pageNumber: 2, description: '保存テスト',
      rectangle: { left: 0.2, top: 0.1, right: 0.7, bottom: 0.3 },
    };
    for (const invalid of [
      { ...body, pageNumber: 3 },
      { ...body, rectangle: { ...body.rectangle, left: -0.1 } },
      { ...body, rectangle: { ...body.rectangle, right: 0.2 } },
      { ...body, description: 'a'.repeat(2001) },
    ]) {
      expect((await request.post(highlights, { data: invalid })).status()).toBe(400);
    }
    const saved = await request.post(highlights, { data: body });
    expect(saved.status()).toBe(201);
    const highlight = await saved.json();
    expect(highlight).toMatchObject({ ...body, documentId: item.id });
    expect(await (await request.get(highlights)).json()).toEqual([highlight]);

    expect((await request.delete(path)).status()).toBe(204);
    expect((await request.get(`${path}/content`)).status()).toBe(404);
    expect((await request.get(highlights)).status()).toBe(404);
    expect((await request.delete(`/api/highlights/${highlight.id}`)).status()).toBe(404);
  } finally {
    await request.delete(path);
  }
});
