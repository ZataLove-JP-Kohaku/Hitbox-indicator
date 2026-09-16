// MBLX-Hitbox-color-changer — popup.js
// Runs as the extension's own toolbar popup page (chrome-extension://
// origin), NOT on the Miniblox page — so it cannot see that page's
// localStorage, which is what content.js's other settings use. The
// keybind specifically is stored in chrome.storage.local instead,
// which both this popup and content.js can read/write, and which
// content.js also listens to via chrome.storage.onChanged so a change
// here takes effect immediately without reloading the page.
//
// Stores e.code, not e.key: e.key gives "Shift"/"Control"/"Alt" no
// matter which side is pressed, so left/right could never be told
// apart. e.code gives "ShiftLeft" vs "ShiftRight",
// "ControlLeft"/"ControlRight", "AltLeft"/"AltRight",
// "MetaLeft"/"MetaRight" (Cmd/Win key) — same idea for every modifier.

(function () {
    'use strict';

    const KEYBIND_STORAGE_KEY = 'miniblox_hitboxpanel_keybind';

    const input = document.getElementById('bind-input');
    const unbindBtn = document.getElementById('unbind-btn');

    // "KeyF" -> "F", "Digit5" -> "5"; everything else (ShiftLeft,
    // ControlRight, Space, Enter, Escape, F1, ...) is already a
    // readable label as-is.
    function formatKeyCode(code) {
        if (!code) return '';
        if (code.startsWith('Key')) return code.slice(3);
        if (code.startsWith('Digit')) return code.slice(5);
        return code;
    }

    function refresh() {
        chrome.storage.local.get(KEYBIND_STORAGE_KEY, (result) => {
            const bound = result[KEYBIND_STORAGE_KEY];
            input.value = bound ? formatKeyCode(bound) : 'Not bound';
        });
    }

    input.addEventListener('click', () => {
        input.classList.add('listening');
        input.value = 'Press a key...';
    });

    input.addEventListener('keydown', (e) => {
        e.preventDefault();
        chrome.storage.local.set({ [KEYBIND_STORAGE_KEY]: e.code }, refresh);
        input.classList.remove('listening');
    });

    unbindBtn.addEventListener('click', () => {
        chrome.storage.local.remove(KEYBIND_STORAGE_KEY, refresh);
    });

    refresh();
})();
