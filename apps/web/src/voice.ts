/** ElevenLabs 실시간 음성(eleven_realtime_v1_mini)을 브라우저에서 바로 연결한다.
 * 토큰은 서버가 발급하고, 브라우저는 서브프로토콜 'openai-insecure-api-key.<토큰>'으로 인증한다. */
import { api } from './lib';

export type VoiceEvent =
  | { type: 'status'; status: 'connecting' | 'live' | 'ended' | 'error'; message?: string }
  | { type: 'user'; text: string } | { type: 'grandma'; text: string; final: boolean }
  | { type: 'audio'; ms: number } | { type: 'tool'; amount: number; rejected: boolean; result: string };

const clean = (t: string) => t.replace(/\[[^\]]*\]/g, '').trim();
const b64ToBytes = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
const bytesToB64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

export class RealtimeCall {
  ws?: WebSocket; ctx?: AudioContext; stream?: MediaStream; proc?: ScriptProcessorNode; sessionId?: string;
  micMuted = false; gain?: GainNode; next = 0; sources = new Set<AudioBufferSourceNode>(); done = new Set<string>(); transcript = ''; audioChunks = 0;
  constructor(private on: (e: VoiceEvent) => void) {}

  async start(opts: { mic?: boolean } = { mic: true }) {
    this.on({ type: 'status', status: 'connecting' });
    const s: any = await api('/api/realtime/session', {});
    if (!s.value) { this.on({ type: 'status', status: 'error', message: s.error || '음성 연결에 실패했어요' }); return false; }
    this.sessionId = s.id;
    this.ctx = new AudioContext({ sampleRate: 24000 });
    await this.ctx.resume();
    this.gain = this.ctx.createGain(); this.gain.connect(this.ctx.destination);
    if (opts.mic !== false) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      } catch { this.on({ type: 'status', status: 'error', message: '마이크 권한이 필요해요. 글로 하기를 써 보세요.' }); await this.stop(); return false; }
    }
    const ws = new WebSocket('wss://api.elevenlabs.io/v1/convai/realtime', ['realtime', 'openai-insecure-api-key.' + s.value]);
    this.ws = ws;
    ws.onopen = () => {
      this.on({ type: 'status', status: 'live' });
      if (this.stream && this.ctx) {
        const src = this.ctx.createMediaStreamSource(this.stream);
        this.proc = this.ctx.createScriptProcessor(2048, 1, 1);
        this.proc.onaudioprocess = (e) => {
          if (ws.readyState !== 1 || this.micMuted) return;
          const f = e.inputBuffer.getChannelData(0); const i16 = new Int16Array(f.length);
          for (let i = 0; i < f.length; i++) i16[i] = Math.max(-1, Math.min(1, f[i])) * 0x7fff;
          ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: bytesToB64(new Uint8Array(i16.buffer)) }));
        };
        src.connect(this.proc); this.proc.connect(this.ctx.destination);
      }
      // 할머니가 먼저 전화를 받는다.
      ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '(전화벨이 울린다. 전화를 받는다.)' }] } }));
      ws.send(JSON.stringify({ type: 'response.create' }));
    };
    ws.onmessage = (m) => { const j = JSON.parse(m.data); if (j.type === 'error') console.log('realtime error', JSON.stringify(j).slice(0, 300)); this.handle(j); };
    ws.onerror = () => this.on({ type: 'status', status: 'error', message: '음성 연결이 끊겼어요' });
    ws.onclose = (ev) => { console.log('realtime close', ev.code, ev.reason); this.on({ type: 'status', status: 'ended' }); };
    return true;
  }

  setMicMuted(m: boolean) { this.micMuted = m; }
  setOutputMuted(m: boolean) { if (this.gain) this.gain.gain.value = m ? 0 : 1; }

  sendText(text: string) {
    if (this.ws?.readyState !== 1) return;
    this.on({ type: 'user', text });
    this.ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } }));
    this.ws.send(JSON.stringify({ type: 'response.create' }));
  }

  private play(b64: string) {
    if (!this.ctx) return;
    const bytes = b64ToBytes(b64); const i16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    const buf = this.ctx.createBuffer(1, i16.length, 24000); const ch = buf.getChannelData(0);
    for (let i = 0; i < i16.length; i++) ch[i] = i16[i] / 0x8000;
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.connect(this.gain ?? this.ctx.destination);
    const at = Math.max(this.ctx.currentTime + 0.03, this.next); src.start(at); this.next = at + buf.duration;
    this.sources.add(src); src.onended = () => this.sources.delete(src);
  }
  private stopPlayback() { for (const s of this.sources) { try { s.stop(); } catch {} } this.sources.clear(); this.next = 0; }

  private async handle(e: any) {
    switch (e.type) {
      case 'response.output_audio.delta': this.audioChunks++; this.play(e.delta); this.on({ type: 'audio', ms: this.audioChunks }); break;
      case 'response.output_audio_transcript.delta': this.transcript += e.delta; this.on({ type: 'grandma', text: clean(this.transcript), final: false }); break;
      case 'response.output_audio_transcript.done': this.on({ type: 'grandma', text: clean(e.transcript ?? this.transcript), final: true }); this.transcript = ''; break;
      case 'conversation.item.input_audio_transcription.completed': if (e.transcript?.trim()) this.on({ type: 'user', text: e.transcript.trim() }); break;
      case 'input_audio_buffer.speech_started': this.stopPlayback(); break;
      case 'response.function_call_arguments.done': await this.tool(e.call_id, e.name, e.arguments); break;
      case 'response.output_item.done': if (e.item?.type === 'function_call') await this.tool(e.item.call_id, e.item.name, e.item.arguments); break;
      case 'error': this.on({ type: 'status', status: 'error', message: e.error?.message ?? '음성 오류' }); break;
    }
  }
  private async tool(callId: string, name: string, args: string) {
    if (!callId || this.done.has(callId) || name !== 'send_money') return;
    this.done.add(callId);
    let a: any = {}; try { a = JSON.parse(args || '{}'); } catch {}
    const amount = Number(a.amount_krw ?? a.amount ?? 0) || 100000;
    const r: any = await api('/api/tools/send_money', { amount_krw: amount });
    this.on({ type: 'tool', amount, rejected: !!r.rejected, result: r.result ?? '' });
    this.ws?.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: r.result ?? '실패' } }));
    this.ws?.send(JSON.stringify({ type: 'response.create' }));
  }

  async stop() {
    try { this.ws?.close(); } catch {}
    this.proc?.disconnect(); this.stream?.getTracks().forEach((t) => t.stop()); this.stopPlayback();
    try { await this.ctx?.close(); } catch {}
    if (this.sessionId) void api('/api/realtime/end', { id: this.sessionId });
    this.sessionId = undefined;
  }
}
