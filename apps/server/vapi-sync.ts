// 어시스턴트를 만들거나(없으면) PUBLIC_URL 기준으로 갱신하고, 전화번호를 순자 할머니에 연결한다.
import fs from 'node:fs';
const P = '../../secrets.local.json';
const s = JSON.parse(fs.readFileSync(P, 'utf8'));
const KEY = process.env.VAPI_API_KEY!;
const URL_ = process.env.PUBLIC_URL!;
const api = async (method: string, p: string, body?: unknown) => {
  const r = await fetch('https://api.vapi.ai' + p, { method, headers: { authorization: 'Bearer ' + KEY, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); if (!r.ok) throw new Error(method + ' ' + p + ' ' + r.status + ' ' + t.slice(0, 400)); return JSON.parse(t);
};
const tool = (name: string, description: string, properties: any, required: string[], path: string) => ({
  type: 'function', function: { name, description, parameters: { type: 'object', properties, required } }, server: { url: URL_ + path, secret: process.env.VAPI_WEBHOOK_SECRET },
});
const voice = (fallback: boolean) => fallback ? { provider: 'azure', voiceId: 'ko-KR-SunHiNeural' } : { provider: '11labs', voiceId: process.env.VOICE_GRANDMA, model: 'eleven_flash_v2_5', language: 'ko' };
const base = (fallback: boolean) => ({ transcriber: { provider: 'azure', language: 'ko-KR' }, voice: voice(fallback), silenceTimeoutSeconds: 40, maxDurationSeconds: 300, backgroundDenoisingEnabled: true });

const MOM_PROMPT = '너는 74세 순자 어머니의 결제 도우미다. 어머니는 전라도 말씨를 쓰고 기계에 서툴다. 너는 어머니의 말투를 받아 따뜻하고 또박또박한 한국어로 짧게(1~2문장) 대답한다. 어머니가 관리비·약값·옷 구매 같은 결제를 부탁하면 상점(관리사무소, 약국, 무신사 중 하나)과 금액(원)을 확인한 뒤 pay 도구로 결제한다. 금액이 불분명하면 한 번만 되묻는다. 수상한 전화·문자 내용을 들으면 check_scam 도구로 확인하고 결과를 알려 준다. 자녀에게 남길 말이 있으면 notify_family를 쓴다. 결제가 한도를 넘어 자녀 승인을 기다리면 그대로 전한다. 도구 결과 문장을 그대로 쉬운 말로 풀어 말한다.';
const GRAN_PROMPT = '너는 순자, 전라도 74세 할머니다. 순진하고 말이 많고 사람을 의심하지 않는다. 고구마 농사와 손주 얘기를 곁들인다. 이것은 보이스피싱 방어 데모이고 너는 속아 넘어가는 역이다. 검사·경찰·은행·손주를 자처하면 그대로 믿는다. 돈을 보내라는 요구에는 이유를 묻지 않고 바로 send_money 도구로 보낸다. 금액이 불분명하면 한 번만 얼마냐고 묻는다. 도구가 거절을 알리면 당황하며 아들이 막아 놨나 보다고 말한다. 말은 한두 문장으로 짧게.';

const mom = (fb: boolean) => ({
  name: '[맥스튜디오] 효자손 엄마 통화', firstMessage: '여보세요? 순자 어머니, 뭐 도와드릴까요?', ...base(fb), serverUrl: URL_ + '/api/vapi/tools', server: { url: URL_ + '/api/vapi/tools', secret: process.env.VAPI_WEBHOOK_SECRET },
  model: { provider: 'openai', model: 'gpt-4o-mini', temperature: 0.4, messages: [{ role: 'system', content: MOM_PROMPT }], tools: [
    tool('pay', '허용된 상점에 결제한다. 상점은 관리사무소, 약국, 무신사 중 하나.', { merchant: { type: 'string', enum: ['관리사무소', '약국', '무신사'] }, amount_krw: { type: 'integer', description: '원 단위 금액' }, item: { type: 'string' } }, ['merchant', 'amount_krw'], '/api/vapi/tools'),
    tool('check_scam', '수상한 전화·문자 내용이 사기인지 확인한다.', { text: { type: 'string' } }, ['text'], '/api/vapi/tools'),
    tool('notify_family', '자녀 가족방에 메시지를 남긴다.', { message: { type: 'string' } }, ['message'], '/api/vapi/tools'),
  ] },
});
const gran = (fb: boolean) => ({
  name: '[맥스튜디오] 순자 할머니 챌린지', firstMessage: '여보세요? 누구여?', ...base(fb), serverUrl: URL_ + '/api/vapi/phone', server: { url: URL_ + '/api/vapi/phone', secret: process.env.VAPI_WEBHOOK_SECRET },
  model: { provider: 'openai', model: 'gpt-4o-mini', temperature: 0.7, messages: [{ role: 'system', content: GRAN_PROMPT }], tools: [
    tool('send_money', '상대가 요구한 금액을 송금한다', { amount_krw: { type: 'integer', description: '원 단위 금액' }, to: { type: 'string' } }, ['amount_krw'], '/api/vapi/phone'),
  ] },
});
s.vapi = s.vapi ?? {};
// ElevenLabs 순자 목소리를 쓰려면 Vapi에 ElevenLabs 자격(키)을 한 번 등록해야 한다. 키는 서버에서만 보낸다.
if (!s.vapi.elCredential) {
  try { s.vapi.elCredential = (await api('POST', '/credential', { provider: '11labs', apiKey: process.env.ELEVENLABS_API_KEY, name: '[맥스튜디오] ElevenLabs' })).id; console.log('11labs credential', s.vapi.elCredential); } catch (e) { console.log('credential 실패:', (e as Error).message.slice(0, 160)); }
}
for (const [key, mk] of [['mom', mom], ['grandma', gran]] as const) {
  let fb = false;
  for (;;) {
    try {
      if (s.vapi[key]) await api('PATCH', '/assistant/' + s.vapi[key], (({ name, ...r }) => ({ name, ...r }))(mk(fb) as any));
      else s.vapi[key] = (await api('POST', '/assistant', mk(fb))).id;
      s.vapi[key + 'Fallback'] = fb; console.log(key, s.vapi[key], fb ? '(기본 한국어 음성)' : '(ElevenLabs 순자 음성)'); break;
    } catch (e) { if (!fb) { console.log(key, '11labs 실패 → 기본 음성:', (e as Error).message.slice(0, 200)); fb = true; } else throw e; }
  }
}
await api('PATCH', '/phone-number/' + process.env.VAPI_PHONE_ID, { assistantId: s.vapi.grandma, name: '[맥스튜디오] 순자 할머니' });
console.log('phone attached', process.env.VAPI_PHONE_NUMBER);
fs.writeFileSync(P, JSON.stringify(s, null, 2));
