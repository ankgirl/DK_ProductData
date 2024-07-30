
export function playDingDong() {
    const context = new (window.AudioContext || window.webkitAudioContext)();

    // 첫 번째 소리 (띵)
    const oscillator1 = context.createOscillator();
    const gainNode1 = context.createGain();
    oscillator1.type = 'sine';
    oscillator1.frequency.setValueAtTime(659.25, context.currentTime); // E5 음
    oscillator1.connect(gainNode1);
    gainNode1.connect(context.destination);
    oscillator1.start(context.currentTime);
    gainNode1.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + 2);
    oscillator1.stop(context.currentTime + 0.3);

    // 두 번째 소리 (동)
    const oscillator2 = context.createOscillator();
    const gainNode2 = context.createGain();
    oscillator2.type = 'sine';
    oscillator2.frequency.setValueAtTime(523.25, context.currentTime + 0.3); // C5 음
    oscillator2.connect(gainNode2);
    gainNode2.connect(context.destination);
    oscillator2.start(context.currentTime + 0.3);
    gainNode2.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + 2);
    oscillator2.stop(context.currentTime + 0.6);
}// Beep 소리를 생성하는 함수
export function playBeep() {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, context.currentTime); // A4 음

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + 4);
    oscillator.stop(context.currentTime + 1); // 1초 후 오실레이터 정지
}

