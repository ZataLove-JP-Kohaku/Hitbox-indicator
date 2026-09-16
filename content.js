// MBLX-Hitbox-color-changer — content.js
// Runs in the isolated content-script world (has DOM + localStorage
// access to the page, same as inject.js's MAIN-world script — content
// scripts share the page's Web Storage even though their JS globals
// are isolated). Draws a small settings panel so Hitbox/Debug Color
// can be toggled without opening devtools.
//
// There used to be a gear button (bottom-right) you clicked to open
// this panel. That's gone now — instead, the keybind that opens this
// panel is set from the extension's own toolbar popup (popup.html/
// popup.js), which appears right under the extension's icon rather
// than anywhere on the Miniblox page itself. Because that popup is a
// separate chrome-extension:// page, it can't see this page's
// localStorage — so the keybind specifically lives in
// chrome.storage.local instead (shared between the popup and this
// script), while the color/enabled settings below stay in localStorage
// as before. The stored value is e.code (see popup.js for why), so the
// comparison below also uses e.code.

(function () {
    'use strict';

    if (window.__MBLX_TP_PANEL__) return;
    window.__MBLX_TP_PANEL__ = true;

    const DEFAULTS = {
        miniblox_hitboxdebugcolor_enabled: 'true',
        miniblox_hitboxdebugcolor: '#ffffff',
        miniblox_hitboxdebugcolor_reach: '#ff0000'
    };

    const KEYBIND_STORAGE_KEY = 'miniblox_hitboxpanel_keybind';

    // Cached locally and kept in sync via chrome.storage.onChanged below,
    // since chrome.storage.local is async and the keydown handler needs
    // a synchronous read.
    let cachedKeybind = '';

    function getSetting(key) {
        return localStorage.getItem(key) ?? DEFAULTS[key];
    }

    function setSetting(key, value) {
        localStorage.setItem(key, value);
    }

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #mbtp-panel {
                position: fixed;
                bottom: 16px;
                right: 16px;
                z-index: 2147483647;
                width: 260px;
                background: rgba(20, 20, 24, 0.92);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 8px;
                padding: 12px;
                color: #eee;
                font-family: sans-serif;
                font-size: 13px;
                display: none;
            }
            #mbtp-panel.open { display: block; }
            #mbtp-panel h3 {
                margin: 0 0 8px;
                font-size: 13px;
                border-bottom: 1px solid rgba(255,255,255,0.15);
                padding-bottom: 6px;
            }
            #mbtp-panel section { margin-bottom: 14px; }
            #mbtp-panel section:last-child { margin-bottom: 0; }
            #mbtp-panel label {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin: 6px 0;
                gap: 8px;
            }
            #mbtp-panel input[type="color"] {
                width: 36px;
                height: 22px;
                border: none;
                background: none;
                padding: 0;
                cursor: pointer;
            }
            #mbtp-panel input[type="range"] { width: 120px; }
            #mbtp-panel .mbtp-thickness-val { width: 14px; text-align: right; }
        `;
        document.documentElement.appendChild(style);
    }

    function buildPanel() {
        const panel = document.createElement('div');
        panel.id = 'mbtp-panel';
        panel.innerHTML = `
            <h3>MBLX Hitbox Color Changer</h3>
            <section>
                <strong>Hitbox / Debug Color</strong>
                <label>
                    Enabled
                    <input type="checkbox" data-key="miniblox_hitboxdebugcolor_enabled" />
                </label>
                <label>
                    Color
                    <input type="color" data-key="miniblox_hitboxdebugcolor" />
                </label>
                <label>
                    Color (attack range)
                    <input type="color" data-key="miniblox_hitboxdebugcolor_reach" />
                </label>
            </section>
        `;
        return panel;
    }

    function syncPanelFromSettings(panel) {
        panel.querySelectorAll('[data-key]').forEach(input => {
            const key = input.dataset.key;
            const value = getSetting(key);

            if (input.type === 'checkbox') {
                input.checked = value === 'true';
            } else {
                input.value = value;
            }

            if (input.type === 'range') {
                const valSpan = panel.querySelector(`[data-val-for="${key}"]`);
                if (valSpan) valSpan.textContent = value;
            }
        });
    }

    function wirePanel(panel) {
        panel.querySelectorAll('[data-key]').forEach(input => {
            input.addEventListener('input', () => {
                const key = input.dataset.key;
                const value = input.type === 'checkbox' ? String(input.checked) : input.value;
                setSetting(key, value);

                if (input.type === 'range') {
                    const valSpan = panel.querySelector(`[data-val-for="${key}"]`);
                    if (valSpan) valSpan.textContent = value;
                }
            });
        });
    }

    function mount() {
        injectStyles();

        const panel = buildPanel();
        syncPanelFromSettings(panel);
        wirePanel(panel);
        document.documentElement.appendChild(panel);

        chrome.storage.local.get(KEYBIND_STORAGE_KEY, (result) => {
            cachedKeybind = result[KEYBIND_STORAGE_KEY] || '';
        });

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && KEYBIND_STORAGE_KEY in changes) {
                cachedKeybind = changes[KEYBIND_STORAGE_KEY].newValue || '';
            }
        });

        // The bound key toggles the settings panel — this replaces the
        // old gear button's click handler. Skipped while typing
        // anywhere else (chat box, etc.), so a bound letter/number key
        // doesn't fight with normal typing.
        document.addEventListener('keydown', (e) => {
            const tag = e.target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;

            if (!cachedKeybind || e.code !== cachedKeybind) return;

            panel.classList.toggle('open');
            if (panel.classList.contains('open')) syncPanelFromSettings(panel);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }
})();
