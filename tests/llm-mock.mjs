import { createServer } from 'node:http';
import { setTimeout } from 'node:timers/promises';

const replacements = [
  [['本人確確認', '本人確認'], ['電話番語', '電話番号']],
  [['２週刊', '２週間'], ['７日簡', '７日間']],
  [['返却ボクスッ', '返却ボックス'], ['くさだい', 'ください']],
  [['selecatble', 'selectable']],
];
const observedThirdPageFindings = [
  {
    segmentId: 's4', original: 'ボクスッへお戻しください。', suggestion: 'ボックスへお戻しください。',
    reason: '誤字の修正（「ボクスッ」→「ボックス」）。',
    before: 'ください。資料はカウンターまたは返却', after: 'こんにちは。箱に入らない資料は、開館中にカウンターへお持ちください。',
  },
  {
    segmentId: 's8', original: 'ご連絡くさだい。', suggestion: 'ご連絡ください。',
    reason: '誤字の修正（「くさだい」→「ください」）。',
    before: '図書館へ過ぎた場合は、早めに', after: 'お問い合わせは、開館時間内に受付カウンターで承ります。',
  },
];
const calls = [];
let failingPage = null;

function respond(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
}

createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/test/calls') {
      respond(response, 200, calls);
      return;
    }

    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (request.method === 'POST' && request.url === '/test/failure') {
      failingPage = body.page;
      respond(response, 200, { failingPage });
      return;
    }

    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      respond(response, 404, {});
      return;
    }

    const prompt = body.messages.find(({ role }) => role === 'user').content;
    const { segments } = JSON.parse(prompt);
    if (segments.some(({ text }) => text.includes('図書館の利用案内')) && !prompt.includes('図書館の利用案内')) {
      respond(response, 400, { error: 'Japanese text must be readable in the model prompt' });
      return;
    }
    const page = replacements.findIndex((pairs) =>
      pairs.some(([original]) => segments.some(({ text }) => text.includes(original)))) + 1;
    calls.push({ page, model: body.model, responseFormat: body.response_format?.type });

    await setTimeout(425);
    if (page === failingPage) {
      respond(response, 503, { error: 'Simulated page failure' });
      return;
    }
    const findings = page === 3 ? [...observedThirdPageFindings] : (replacements[page - 1] ?? []).flatMap(([original, suggestion]) => {
      const segment = segments.find(({ text }) => text.includes(original));
      return segment ? [{ segmentId: segment.id, original, suggestion, reason: '誤字の修正', before: '', after: '' }] : [];
    });
    if (page === 3) {
      findings.push({ segmentId: segments[0].id, original: '原文にない語', suggestion: '修正案',
        reason: '原文との照合を検証', before: '', after: '' });
      findings.push({ segmentId: 'missing', original: '図書館の利用案内', suggestion: '修正案',
        reason: '本文に2箇所ある引用を検証', before: '', after: '' });
    }
    respond(response, 200, { choices: [{ message: { content: JSON.stringify({ findings }) } }] });
  } catch {
    respond(response, 400, { error: 'Invalid mock request' });
  }
}).listen(11434, '0.0.0.0');
