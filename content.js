// MBLX-Hitbox-color-changer — content.js
// Runs in the isolated content-script world (has DOM + localStorage
// access to the page, same as inject.js's MAIN-world script — content
// scripts share the page's Web Storage even though their JS globals
// are isolated). Draws a small settings panel so Hitbox/Debug Color
// can be toggled without opening devtools.

(function () {
    'use strict';

    if (window.__MBLX_TP_PANEL__) return;
    window.__MBLX_TP_PANEL__ = true;

    const DEFAULTS = {
        miniblox_hitboxdebugcolor_enabled: 'true',
        miniblox_hitboxdebugcolor: '#ffffff',
        miniblox_hitboxdebugcolor_reach: '#ff0000'
    };

    function getSetting(key) {
        return localStorage.getItem(key) ?? DEFAULTS[key];
    }

    function setSetting(key, value) {
        localStorage.setItem(key, value);
    }

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #mbtp-toggle {
                position: fixed;
                bottom: 16px;
                right: 16px;
                z-index: 2147483647;
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: rgba(20, 20, 24, 0.85);
                border: 1px solid rgba(255, 255, 255, 0.2);
                color: #fff;
                font-size: 18px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: sans-serif;
            }
            #mbtp-panel {
                position: fixed;
                bottom: 64px;
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

        const toggle = document.createElement('button');
        toggle.id = 'mbtp-toggle';
        toggle.title = 'MBLX Hitbox Color Changer settings';
        toggle.textContent = '⚙';

        const panel = buildPanel();
        syncPanelFromSettings(panel);
        wirePanel(panel);

        toggle.addEventListener('click', () => {
            panel.classList.toggle('open');
            if (panel.classList.contains('open')) syncPanelFromSettings(panel);
        });

        document.documentElement.appendChild(toggle);
        document.documentElement.appendChild(panel);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }
})();
