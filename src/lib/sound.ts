/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function playBeep(type: 'beep' | 'alert' | 'success' = 'beep') {
  if (typeof window === 'undefined') return;
  
  // Detener si el usuario silenció los sonidos en la sesión
  const muted = localStorage.getItem('sabatto_sound_muted') === 'true';
  if (muted) return;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    const ctx = new AudioContextClass();
    
    // Resume context if suspended (browser security autoplay blocks)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    if (type === 'beep') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.start();
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.stop(ctx.currentTime + 0.16);
    } else if (type === 'alert') {
      // Alarma de doble pitido rápida
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.start();
      
      // Pitch modulation
      osc.frequency.setValueAtTime(700, ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.01, ctx.currentTime + 0.15);
      
      osc.stop(ctx.currentTime + 0.25);
    } else if (type === 'success') {
      // Notas arpegiadas de éxito
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // Do5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08); // Mi5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.16); // Sol5
      osc.frequency.setValueAtTime(1046.50, ctx.currentTime + 0.24); // Do6
      
      gainNode.gain.setValueAtTime(0.08, ctx.currentTime);
      osc.start();
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.stop(ctx.currentTime + 0.42);
    }
  } catch (e) {
    console.warn("AudioContext blocked or failed to play sound", e);
  }
}
