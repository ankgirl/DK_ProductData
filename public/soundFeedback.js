// soundFeedback.js — 스캔 피드백 사운드 (plain script, window.SoundFeedback)
// 성공: 띵동(맑은 두 음), 실패/문제: 땡(낮은 버즈). Web Audio API 사용.
// iOS/아이패드는 사용자 제스처가 있어야 오디오가 열리므로, 첫 상호작용에서 unlock() 호출 권장.
(function (root) {
    'use strict';
    let ctx = null;

    function getCtx() {
        try {
            if (!ctx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return null;
                ctx = new AC();
            }
            if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
        } catch (e) { return null; }
        return ctx;
    }

    function tone(freq, startSec, durSec, type, peak) {
        const c = getCtx();
        if (!c) return;
        const t0 = c.currentTime + startSec;
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        osc.connect(g); g.connect(c.destination);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(peak, t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec);
        osc.start(t0);
        osc.stop(t0 + durSec + 0.03);
    }

    // 성공: E5 → C5 (맑은 "띵동")
    function playDingDong() {
        tone(659.25, 0, 0.28, 'sine', 0.28);
        tone(523.25, 0.16, 0.42, 'sine', 0.28);
    }
    // 실패/문제: 낮은 사각파 두 음 하강 ("땡")
    function playError() {
        tone(200, 0, 0.22, 'square', 0.16);
        tone(150, 0.16, 0.42, 'square', 0.16);
    }

    root.SoundFeedback = { playDingDong, playError, unlock: getCtx };
})(window);
