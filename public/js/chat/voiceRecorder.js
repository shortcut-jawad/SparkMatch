// chat/voiceRecorder.js — MediaRecorder wrapper for voice note recording
export class VoiceRecorder {
  constructor() {
    this._recorder = null;
    this._chunks   = [];
    this._stream   = null;
    this._start    = 0;
  }

  async start() {
    this._chunks = [];
    this._stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : '';

    this._recorder = new MediaRecorder(this._stream, mimeType ? { mimeType } : {});
    this._recorder.ondataavailable = e => { if (e.data.size > 0) this._chunks.push(e.data); };
    this._recorder.start(100);
    this._start = Date.now();
  }

  stop() {
    return new Promise(resolve => {
      this._recorder.onstop = () => {
        const blob     = new Blob(this._chunks, { type: this._recorder.mimeType || 'audio/webm' });
        const duration = (Date.now() - this._start) / 1000;
        this._cleanup();
        resolve({ blob, duration });
      };
      if (this._recorder.state !== 'inactive') this._recorder.stop();
    });
  }

  cancel() {
    if (this._recorder && this._recorder.state !== 'inactive') {
      this._recorder.ondataavailable = null;
      this._recorder.onstop = null;
      this._recorder.stop();
    }
    this._cleanup();
  }

  get elapsed() {
    return this._start ? (Date.now() - this._start) / 1000 : 0;
  }

  get isActive() {
    return this._recorder?.state === 'recording' || this._recorder?.state === 'paused';
  }

  _cleanup() {
    this._stream?.getTracks().forEach(t => t.stop());
    this._stream   = null;
    this._recorder = null;
    this._chunks   = [];
  }
}
