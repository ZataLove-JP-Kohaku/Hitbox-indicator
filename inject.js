// MBLX-Hitbox-color-changer — inject.js
// Runs in the page's MAIN world (so it can reach the live game instance
// and patch the same module the game itself is using).
//
// Draws a persistent colored wireframe box around every live entity,
// every frame — NOT the game's own debugHitboxRenderer, which only
// queues instances around specific game-triggered moments like an
// actual hit, so it can't show a hitbox before contact. That native
// renderer (and, best-effort, miniblox's own "show hitboxes" setting if
// we can reach it) is force-hidden/disabled so only our version shows.
//
// It builds its own pool of Box3Helper wireframes (the same class the
// game uses for its own block-select highlight), one per live entity,
// updated every frame.
//
// Settings (all read from localStorage):
//   miniblox_hitboxdebugcolor_enabled    'true' | 'false'   (default: true)
//   miniblox_hitboxdebugcolor            '#rrggbb'
//   miniblox_hitboxdebugcolor_reach      '#rrggbb'          (applied only
//                                        to the single entity the player
//                                        is currently within attack range
//                                        of; every other entity keeps the
//                                        color above)

(function () {
    'use strict';

    const TAG = '[MBLX-TP]';

    if (window.__MBLX_TP_INJECT__) return;
    window.__MBLX_TP_INJECT__ = true;

    // ---------------------------------------------------------------
    // Shared: find the live game instance via React fiber internals.
    // ---------------------------------------------------------------
    function findGameInstance() {
        const candidates = [
            document.getElementById('root'),
            document.querySelector('canvas'),
            document.body,
            ...document.querySelectorAll('#root *')
        ];

        for (const el of candidates) {
            if (!el) continue;

            const fiberKey = Object.keys(el).find(k =>
                k.startsWith('__reactFiber$') ||
                k.startsWith('__reactInternalInstance$') ||
                k.startsWith('__reactContainer$')
            );

            if (!fiberKey) continue;

            let fiber = el[fiberKey];

            while (fiber) {
                const state = fiber.stateNode;

                if (state) {
                    if (typeof state.queue === 'function' && typeof state.connect === 'function') {
                        return state;
                    }
                    if (state.game && typeof state.game.queue === 'function' && typeof state.game.connect === 'function') {
                        return state.game;
                    }
                }

                const props = fiber.memoizedProps;

                if (props) {
                    if (props.game && typeof props.game.queue === 'function' && typeof props.game.connect === 'function') {
                        return props.game;
                    }
                    for (const key in props) {
                        const value = props[key];
                        if (value && typeof value === 'object' && typeof value.queue === 'function' && typeof value.connect === 'function') {
                            return value;
                        }
                    }
                }

                fiber = fiber.return;
            }
        }

        return null;
    }

    function getGame() {
        if (window.miniblox) return window.miniblox;
        const game = findGameInstance();
        if (game) window.miniblox = game;
        return game;
    }

    // =================================================================
    // Feature: Hitbox / Debug Color
    // =================================================================
    (function hitboxDebugColorFeature() {
        if (window.__MBLX_TP_HITBOX_COLOR__) return;
        window.__MBLX_TP_HITBOX_COLOR__ = true;

        const DEFAULT_COLOR = '#ffffff';

        // Distance (in blocks) within which an entity is considered
        // "attackable" for the reach-color feature. Matches the melee
        // reach used elsewhere in these client ports (see
        // DynamicCrosshair.js's REACH constant for the block/entity
        // targeting equivalent).
        const ATTACK_REACH = 3.0;

        // Ported from DynamicCrosshair.js — resolves the player's look
        // direction, preferring the game's own getLook() when it's
        // reachable on the prototype chain, falling back to raw
        // pitch/yaw fields otherwise.
        function getLookVector(player) {
            try {
                let proto = Object.getPrototypeOf(player);
                for (let i = 0; i < 4; i++) proto = Object.getPrototypeOf(proto);
                if (typeof proto.getLook === 'function') {
                    return proto.getLook.call(player);
                }
            } catch (_) {}

            const pitch = Number(player.pitch) || 0;
            const yaw = Number(player.yaw) || 0;
            const cosPitch = Math.cos(pitch);
            return {
                x: -Math.sin(yaw) * cosPitch,
                y: -Math.sin(pitch),
                z: Math.cos(yaw) * cosPitch
            };
        }

        // Ported from DynamicCrosshair.js — standard slab-method ray/AABB
        // intersection test, clamped to maxDist.
        function rayBoxIntersect(origin, dir, box, maxDist) {
            let tmin = 0;
            let tmax = maxDist;

            for (const axis of ['x', 'y', 'z']) {
                const o = origin[axis];
                const d = dir[axis];
                const mn = box.min[axis];
                const mx = box.max[axis];

                if (Math.abs(d) < 1e-8) {
                    if (o < mn || o > mx) return -1;
                } else {
                    let t1 = (mn - o) / d;
                    let t2 = (mx - o) / d;
                    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }

                    tmin = Math.max(tmin, t1);
                    tmax = Math.min(tmax, t2);

                    if (tmin > tmax) return -1;
                }
            }

            return tmin;
        }

        // Finds the box of the single entity the player is currently
        // looking at within ATTACK_REACH (closest hit along the ray), or
        // null if nothing is in reach. Returns the box itself (not just
        // a boolean) so the caller can draw a highlight around exactly
        // that one entity, instead of recoloring every hitbox.
        // ent.boundingBox is built from ent.pos, which updates in
        // discrete jumps (tick-based). What's actually on screen is a
        // smoothed/interpolated position (mesh.position, confirmed at
        // runtime — it moves every frame while pos/boundingBox jump
        // every few frames, most visible during knockback). Reusing the
        // boundingBox's shape but recentering it on that render position
        // keeps our highlight aligned with what the player sees rather
        // than the laggier logical position.
        function getEntityRenderPosition(ent) {
            const p = ent?.mesh?.position || ent?.renderPosition
                || ent?.interpolatedPosition || ent?.displayPosition || ent?.smoothPos;
            return (p && typeof p.x === 'number') ? p : null;
        }

        function getVisualBox(ent) {
            const box = ent?.boundingBox;
            const pos = ent?.pos;
            if (!box?.min || !box?.max) return null;
            if (!pos) return box;

            const renderPos = getEntityRenderPosition(ent);
            if (!renderPos) return box;

            const dx = renderPos.x - pos.x;
            const dy = renderPos.y - pos.y;
            const dz = renderPos.z - pos.z;
            if (!dx && !dy && !dz) return box;

            return {
                min: { x: box.min.x + dx, y: box.min.y + dy, z: box.min.z + dz },
                max: { x: box.max.x + dx, y: box.max.y + dy, z: box.max.z + dz }
            };
        }

        function getRenderer() {
            const game = getGame();
            return game?.gameScene?.debugHitboxRenderer || null;
        }

        // Setting object.visible = false once per frame races against the
        // game's own per-frame update, which sets visible = (count > 0)
        // on this same object — whichever runs last in a given frame
        // wins, so a plain assignment flickers/loses intermittently
        // (confirmed at runtime: visible read back true right after our
        // loop had already run). Overriding the accessor itself removes
        // the race entirely — the game can still assign to .visible, but
        // reading it always comes back false, so it never actually
        // renders. Tracked in a WeakSet since renderer.grow() can swap in
        // a brand new object when capacity is exceeded, which would need
        // patching again.
        const lockedNativeObjects = new WeakSet();
        function forceHideNativeObject(obj) {
            if (!obj || lockedNativeObjects.has(obj)) return;
            let stored = obj.visible;
            try {
                Object.defineProperty(obj, 'visible', {
                    configurable: true,
                    enumerable: true,
                    get() { return false; },
                    set(v) { stored = v; }
                });
                lockedNativeObjects.add(obj);
            } catch (err) {
                console.warn(`${TAG} Could not lock native hitbox visibility:`, err);
            }
        }

        // Best-effort: on top of hiding the native renderer's mesh below,
        // also try to find and turn off miniblox's own "show hitboxes"
        // debug flag if it's reachable from the live game object graph
        // (its exact location isn't guaranteed stable across builds, so
        // this is a bonus, not something the rest of the feature depends
        // on). Never throws — any miss is silently ignored.
        function suppressNativeHitboxSetting(game) {
            const candidates = [
                game, game?.gameScene, game?.settings, game?.debugFlags,
                game?.player, game?.player?.settings
            ];
            for (const obj of candidates) {
                if (!obj || typeof obj !== 'object') continue;
                try {
                    if ('showHitboxes' in obj && obj.showHitboxes) obj.showHitboxes = false;
                } catch (_) {}
                try {
                    if ('_showHitboxes' in obj && obj._showHitboxes) obj._showHitboxes = false;
                } catch (_) {}
            }
        }

        // The native debugHitboxRenderer draws every entity's box in one
        // InstancedBufferGeometry batch — but at runtime its instance
        // count sits at 0 outside of specific game-triggered moments
        // (e.g. around an actual hit), not continuously for every live
        // entity. Forcing it visible does nothing if it has no instances
        // queued, which is why hitboxes only appeared on contact. So
        // instead of feeding that renderer, we hide it entirely and draw
        // our own persistent box per entity — the same Box3Helper class
        // the game already uses for its block-select highlight — updated
        // every frame regardless of whether anything is happening.
        function getHelperClasses(game) {
            if (window.__MBLX_TP_HELPER_CLASSES__) return window.__MBLX_TP_HELPER_CLASSES__;

            const selectBox = game?.player?.selectBox;
            if (!selectBox?.box?.min || !selectBox?.material?.color) return null;

            const classes = {
                Box3HelperClass: selectBox.constructor,
                Box3Class: selectBox.box.constructor,
                Vector3Class: selectBox.box.min.constructor,
                ColorClass: selectBox.material.color.constructor,
                depthTest: selectBox.material.depthTest,
                renderOrder: selectBox.renderOrder || 0
            };

            window.__MBLX_TP_HELPER_CLASSES__ = classes;
            return classes;
        }

        function createHitboxHelper(classes) {
            const box3 = new classes.Box3Class(
                new classes.Vector3Class(0, 0, 0),
                new classes.Vector3Class(0, 0, 0)
            );
            const helper = new classes.Box3HelperClass(box3, new classes.ColorClass(1, 1, 1));
            helper.material.toneMapped = false;
            helper.material.depthTest = classes.depthTest;
            helper.renderOrder = classes.renderOrder;
            helper.visible = false;
            return helper;
        }

        // entity id -> Box3Helper, reused across frames so we're not
        // constantly allocating new Object3Ds.
        const hitboxHelperPool = new Map();

        function getOrCreateHelperFor(id, classes) {
            let helper = hitboxHelperPool.get(id);
            if (!helper) {
                helper = createHitboxHelper(classes);
                hitboxHelperPool.set(id, helper);
            }
            return helper;
        }

        // Finds the single entity the player is currently looking at
        // within ATTACK_REACH (closest hit along the ray), or null.
        // Returns the entity itself (not just its box) so the caller can
        // compare identity against whichever entity it's currently
        // coloring, to know which one gets the reach color.
        function findReachTargetEntity(game) {
            try {
                const player = game?.player;
                if (!player) return null;

                const entities = game?.world?.entities;
                if (!(entities instanceof Map) || entities.size === 0) return null;

                const eyeHeight = typeof player.getEyeHeight === 'function'
                    ? player.getEyeHeight()
                    : 1.62;

                const origin = {
                    x: Number(player.pos?.x) || 0,
                    y: (Number(player.pos?.y) || 0) + eyeHeight,
                    z: Number(player.pos?.z) || 0
                };

                const look = getLookVector(player);
                if (!look) return null;

                const playerId = player.id;
                let closestT = Infinity;
                let closestEnt = null;

                for (const ent of entities.values()) {
                    if (!ent || ent === player || ent.id === playerId || ent.dead) continue;

                    const box = getVisualBox(ent);
                    if (!box?.min || !box?.max) continue;

                    const t = rayBoxIntersect(origin, look, box, ATTACK_REACH);
                    if (t > 0 && t < closestT) {
                        closestT = t;
                        closestEnt = ent;
                    }
                }

                return closestEnt;
            } catch (err) {
                console.warn(`${TAG} Reach target search error:`, err);
                return null;
            }
        }

        // Removes every pooled helper from the scene — used both when
        // the feature toggle is off and for cleanup of despawned
        // entities.
        function clearAllHelpers() {
            for (const [id, helper] of hitboxHelperPool) {
                helper.visible = false;
                if (helper.parent) helper.parent.remove(helper);
                hitboxHelperPool.delete(id);
            }
        }

        // Draws (or updates) one persistent box per live entity, every
        // frame, regardless of attack state — this is what makes
        // hitboxes visible before any contact happens, unlike the
        // native renderer this replaces.
        function updateAllHitboxHighlights() {
            try {
                const game = getGame();

                // Always hide the game's own native hitbox debug view —
                // we draw our own boxes instead — and best-effort turn
                // off its own "show hitboxes" setting if reachable.
                const nativeRenderer = getRenderer();
                if (nativeRenderer?.object) forceHideNativeObject(nativeRenderer.object);
                suppressNativeHitboxSetting(game);

                const enabled = localStorage.getItem('miniblox_hitboxdebugcolor_enabled') !== 'false';
                if (!enabled) {
                    clearAllHelpers();
                    return;
                }

                const player = game?.player;
                const entities = game?.world?.entities;
                const parent = player?.selectBox?.parent || nativeRenderer?.object?.parent || null;
                if (!player || !(entities instanceof Map) || !parent) return;

                const classes = getHelperClasses(game);
                if (!classes) return;

                const normalColor = localStorage.getItem('miniblox_hitboxdebugcolor') || DEFAULT_COLOR;
                const reachColor = localStorage.getItem('miniblox_hitboxdebugcolor_reach');
                const targetEnt = reachColor ? findReachTargetEntity(game) : null;

                const playerId = player.id;
                const seen = new Set();

                for (const ent of entities.values()) {
                    if (!ent || ent === player || ent.id === playerId || ent.dead) continue;

                    // The game's own per-entity debug wireframe: when its
                    // native "show hitboxes" setting is on, every entity
                    // mesh gets mesh.debug = true (see attachEntityMesh /
                    // the showHitboxes setter in the game bundle), which
                    // draws a second, separate hitbox directly on the
                    // mesh — this is NOT debugHitboxRenderer and wasn't
                    // covered by hiding that renderer above, which is why
                    // the two were overlapping. Force it off every frame
                    // so only our box remains.
                    if (ent.mesh && ent.mesh.debug) ent.mesh.debug = false;

                    const box = getVisualBox(ent);
                    if (!box?.min || !box?.max) continue;

                    const id = ent.id ?? ent;
                    seen.add(id);

                    const helper = getOrCreateHelperFor(id, classes);
                    helper.box.min.set(box.min.x, box.min.y, box.min.z);
                    helper.box.max.set(box.max.x, box.max.y, box.max.z);
                    helper.material.color.set(ent === targetEnt ? reachColor : normalColor);
                    if (helper.parent !== parent) parent.add(helper);
                    helper.visible = true;
                }

                // Entities that despawned/died no longer show up above —
                // hide and drop their helper instead of leaving a stale
                // box floating where they used to be.
                for (const [id, helper] of hitboxHelperPool) {
                    if (seen.has(id)) continue;
                    helper.visible = false;
                    if (helper.parent) helper.parent.remove(helper);
                    hitboxHelperPool.delete(id);
                }
            } catch (err) {
                console.warn(`${TAG} Hitbox highlight update error:`, err);
            }
        }

        (function loop() {
            updateAllHitboxHighlights();
            requestAnimationFrame(loop);
        })();

        window.MBLX_TP = window.MBLX_TP || {};
        window.MBLX_TP.updateAllHitboxHighlights = updateAllHitboxHighlights;

        console.log(`${TAG} Hitbox/Debug Color loaded.`);
    })();
})();
