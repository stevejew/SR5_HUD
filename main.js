import { registerKeybindings } from "./setting.js";

// 전역 상태 관리
window.myHudEnabled = false;
let hudUpdateTimer = null;
let lastTargetTokenId = null; // 마지막으로 선택된 토큰 ID 저장

// 초기화
Hooks.once("init", () => {
    registerKeybindings();
});

class MyEnhancedUI extends Application {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "steve-sr5-hud",
            template: "modules/sr5-hud/templates/ui.hbs",
            popOut: true,
            classes: ["sr5-hud-frame"],
            width: 400,
            height: "auto",
            resizable: false,
            minimizable: false
        });
    }

    async getData() {
        // 현재 선택된 토큰 가져오기
        const token = canvas.tokens.controlled[0];
        if (!token || !token.actor) return {};

        lastTargetTokenId = token.id;

        const actor = token.actor;
        const system = actor.system;

        // 추가 액션 가져오기
        const extraActions = await this._getExtraActions();
        const skills = this._processSkills(system.skills);
        const sortItems = this._sortItems;
        const getTranslatedItems = (types) => this._getTranslatedItems(actor, types);
        const allActions = getTranslatedItems(["action"]).concat(extraActions);

        return {
            name: token.name,
            img: actor.img || "icons/svg/mystery-man.svg",
            armorValue: system.armor?.value ?? 0,
            track: {
                physical: { value: system.track?.physical?.value ?? 0, base: system.track?.physical?.base ?? 0 },
                stun: { value: system.track?.stun?.value ?? 0, base: system.track?.stun?.base ?? 0 }
            },
            specialButtonLabel: this._getSpecialLabel(system.special),
            skills: skills,
            inventory: {
                "무기, 방어구, 탄약": sortItems(getTranslatedItems(["weapon", "armor", "ammo", "modification"])),
                "증강물": sortItems(getTranslatedItems(["bioware", "cyberware"])),
                "장비, 도구": sortItems(getTranslatedItems(["device", "equipment"]))
            },
            actionData: { "보유 행동": sortItems(allActions) },
            specialData: this._getSpecialData(system.special, getTranslatedItems, sortItems)
        };
    }

    /**
     * 팩에서 추가 액션을 가져옵니다
     */
    async _getExtraActions() {
        const packId = 'shadowrun5e.sr5e-general-actions';
        const pack = game.packs.get(packId);

        if (!pack) return [];

        const index = await pack.getIndex();
        const targets = [
            'Armor',
            'Biofeedback Resist',
            'Drain',
            'Fade',
            'Judge Intentions',
            'Lift Carry',
            'Physical Damage Resist',
            'Physical Defense',
            'Memory',
            'Composure'
        ];

        return targets.map(t => {
            const found = index.find(i => i.name.toLowerCase() === t.toLowerCase());
            const translatedName = this._getTranslatedActionName(t, found);

            return {
                name: translatedName,
                actionId: found ? found.name : t,
                pack: 'sr5e-general-actions',
                isPack: true,
                type: "action",
                img: found ? found.img : "icons/svg/clockwork.svg"
            };
        });
    }

    /**
     * 액션 이름 번역 처리
     */
    _getTranslatedActionName(originalName, foundItem) {
        const keyWithSpace = `SR5.Content.Actions.${originalName}`;
        const keyWithoutSpace = `SR5.Content.Actions.${originalName.replace(/\s+/g, '')}`;

        if (game.i18n.has(keyWithSpace)) return game.i18n.localize(keyWithSpace);
        if (game.i18n.has(keyWithoutSpace)) return game.i18n.localize(keyWithoutSpace);
        if (foundItem && foundItem.label && foundItem.label !== foundItem.name) return foundItem.label;

        return originalName;
    }

    /**
     * 기술 데이터 처리 및 번역
     */
    _processSkills(systemSkills) {
        const skills = { active: {}, knowledge: {}, language: {} };
        if (!systemSkills) return skills;
        const processed = duplicate(systemSkills);
        if (processed.active) {
            for (let [key, skill] of Object.entries(processed.active)) {
                skill.displayName = game.i18n.localize(skill.label) || key;
            }
        }
        return processed;
    }

    /**
     * 아이템 정렬
     */
    _sortItems(items) {
        return items.sort((a, b) => {
            const typeA = (a.type || "").toLowerCase();
            const typeB = (b.type || "").toLowerCase();
            if (typeA < typeB) return -1;
            if (typeA > typeB) return 1;
            return a.name.localeCompare(b.name, 'ko');
        });
    }

    /**
     * 번역된 아이템 목록 가져오기
     */
    _getTranslatedItems(actor, types) {
        return actor.items
            .filter(i => types.includes(i.type))
            .map(i => {
                const standardKey = `TYPES.Item.${i.type}`;
                let translated = "";
                if (game.i18n.has(standardKey)) {
                    translated = game.i18n.localize(standardKey);
                } else {
                    const backupKeys = [`SR5.ItemTypes.${i.type}`, `Item.${i.type}`];
                    for (let key of backupKeys) {
                        if (game.i18n.has(key)) {
                            translated = game.i18n.localize(key);
                            break;
                        }
                    }
                }
                i.label = translated || i.type;
                return i;
            });
    }

    _getSpecialLabel(special) {
        if (special === "magic") return "마법";
        if (special === "resonance") return "공명";
        return null;
    }

    _getSpecialData(special, getTranslatedItems, sortItems) {
        if (special === "magic") {
            return {
                "주문 및 의식": sortItems(getTranslatedItems(["spell", "ritual", "call_in_action"])),
                "능력 및 메타매직": sortItems(getTranslatedItems(["adept_power", "metamagic"])),
                "포커스 및 물품": sortItems(getTranslatedItems(["focus", "preparation"]))
            };
        }
        if (special === "resonance") {
            return {
                "컴플렉스 폼": sortItems(getTranslatedItems(["complex_form"])),
                "에코 및 능력": sortItems(getTranslatedItems(["echo", "sprite_power", "call_in_action"]))
            };
        }
        return null;
    }

    _injectHTML(html) {
        super._injectHTML(html);
        if (html && html.find) {
            html.find(".window-header").css("display", "none");
            html.css("border", "none");
        }
    }

    async close(options = {}) {
        // 사용자가 X버튼을 누르거나 강제로 닫을 때만 전역 상태를 해제할지 결정
        // 여기서는 단순히 super를 호출하되, 토글 상태는 유지됨
        return super.close(options);
    }

    activateListeners(html) {
        super.activateListeners(html);
        const getControlledToken = () => canvas.tokens.controlled[0];

        html.find('.portrait-container').click(ev => {
            ev.preventDefault();
            const target = canvas.tokens.controlled[0]?.actor;
            const sheet = target?.sheet;
            if (sheet?.rendered) sheet.close();
            else sheet?.render(true);
        });

        html.find('.armor-badge').click(async ev => {
            ev.preventDefault();
            ev.stopPropagation();
            await this._executePhysicalDefense();
        });

        html.find('.toggle-btn').click(ev => {
            ev.preventDefault();
            const targetId = $(ev.currentTarget).data('target') || $(ev.currentTarget).data('action');
            const $target = html.find(`#${targetId}`);
            html.find('.sub-menu, .dropdown-content').not($target).addClass('hidden');
            $target.toggleClass('hidden');
        });

        html.find('.skill-type-btn').click(ev => {
            ev.preventDefault();
            const targetId = $(ev.currentTarget).data('target');
            const $target = html.find(`#${targetId}`);
            html.find('#active-list, #knowledge-list, #language-list').not($target).addClass('hidden');
            $target.toggleClass('hidden');
        });

        html.find('.item-roll').click(async ev => {
            ev.preventDefault();
            ev.stopPropagation();
            await this._handleItemRoll(ev, getControlledToken);
        });

        html.find('.item-name').click(ev => {
            ev.preventDefault();
            ev.stopPropagation();
            this._openItemSheet(ev, getControlledToken);
        });

        html.find('.skill-item:not(.inventory-item)').click(ev => {
            ev.preventDefault();
            const id = ev.currentTarget.dataset.id;
            const token = getControlledToken();
            if (token?.actor?.rollSkill) token.actor.rollSkill(id);
        });

        html.find('.skill-search, .filter-zero, .action-search, .item-search').on('input change', ev => {
            this._handleSearchAndFilter(ev);
        });
    }

    async _executePhysicalDefense() {
        const actor = canvas.tokens.controlled[0]?.actor || game.user.character;
        if (!actor) return;
        const partAction = { test: 'PhysicalResistTest', armor: true, attribute: 'body' };
        const action = game.shadowrun5e.data.createData('action_roll', partAction);
        const test = await game.shadowrun5e.test.fromAction(action, actor);
        if (test) await test.execute();
    }

    async _handleItemRoll(ev, getControlledToken) {
        const token = getControlledToken();
        if (!token?.actor) return;
        const dataset = ev.currentTarget.closest('.inventory-item')?.dataset;
        if (!dataset) return;
        if (dataset.isPack === "true") {
            await this._executePackAction(dataset, token.actor);
            return;
        }
        const item = token.actor.items.get(dataset.id || dataset.itemId);
        if (!item) return;
        if (typeof item.castAction === "function") await item.castAction(ev, token.actor);
        else if (typeof item.roll === "function") await item.roll();
        else if (typeof item.postItemCard === "function") await item.postItemCard();
    }

    async _executePackAction(dataset, actor) {
        try {
            const test = await game.shadowrun5e.test.fromPackAction(dataset.pack, dataset.actionId, actor);
            if (test) await test.execute();
            else ui.notifications.warn(`액션 '${dataset.actionId}'을(를) 찾을 수 없어.`);
        } catch (err) {
            console.error("SR5 HUD Pack Action Error:", err);
        }
    }

    _openItemSheet(ev, getControlledToken) {
        const token = getControlledToken();
        const id = ev.currentTarget.closest('[data-item-id]')?.dataset.itemId || ev.currentTarget.closest('[data-id]')?.dataset.id;
        const item = token?.actor.items.get(id);
        if (item) item.sheet.render(true);
    }

    _handleSearchAndFilter(ev) {
        const $container = $(ev.currentTarget).closest('.dropdown-content');
        const $searchInput = $container.find('.skill-search, .action-search, .item-search');
        const searchText = $searchInput.val()?.toLowerCase() || '';
        const $filterCheckbox = $container.find('.filter-zero');
        const hideZero = $filterCheckbox.is(':checked');

        $container.find('.skill-item, .inventory-item').each((i, el) => {
            const $el = $(el);
            const name = ($el.find('.skill-name').text() || $el.find('.item-name').text() || $el.find('.action-name').text() || $el.text()).toLowerCase();
            const ratingText = $el.find('.skill-rating').text() || $el.find('.item-quantity').text() || $el.data('rating') || '';
            const value = parseInt(ratingText.toString().replace(/[^0-9]/g, "")) || 0;
            $el.toggle(name.includes(searchText) && (!hideZero || value > 0));
        });
    }
}

window.MyEnhancedUI = MyEnhancedUI;

// --- 유틸리티 함수 ---

async function updateMyHud() {
    const activeWindow = Object.values(ui.windows).find(w => w.id === "steve-sr5-hud");
    // 창이 존재할 때만 렌더링
    if (activeWindow) await activeWindow.render(true);
}

function debouncedUpdateHud(delay = 100) {
    if (hudUpdateTimer) clearTimeout(hudUpdateTimer);
    hudUpdateTimer = setTimeout(() => {
        updateMyHud();
        hudUpdateTimer = null;
    }, delay);
}

/**
 * HUD 토글 함수 (마스터 스위치)
 */
window.toggleMyHud = function () {
    window.myHudEnabled = !window.myHudEnabled;
    const existing = Object.values(ui.windows).find(w => w.id === "steve-sr5-hud");

    if (window.myHudEnabled) {
        const token = canvas.tokens.controlled[0];
        // 켤 때 토큰이 선택되어 있다면 창을 표시
        if (token && !existing) {
            new MyEnhancedUI().render(true);
        }
    } else {
        // 토글 자체를 끌 때는 창을 완전히 닫음
        if (existing) existing.close();
    }

    if (canvas.tokens.hud.rendered) canvas.tokens.hud.render();
};

// --- Foundry Hooks ---

Hooks.on("updateActor", (actor, changes) => {
    if (!window.myHudEnabled) return;
    if (changes.system || changes.name) debouncedUpdateHud();
});

Hooks.on("updateItem", () => {
    if (window.myHudEnabled) debouncedUpdateHud();
});

Hooks.on("renderTokenHUD", (app, html) => {
    const buttonHtml = `
        <div class="control-icon ${window.myHudEnabled ? 'active' : ''}" title="SR HUD">
            <i class="fa-thin fa-browsers"></i>
        </div>
    `;
    const $myButton = $(buttonHtml);
    $myButton.click((event) => {
        event.preventDefault();
        window.toggleMyHud();
    });
    $(html).find(".col.right").append($myButton);
});

/**
 * 토큰 선택 시 HUD 창 제어
 */
Hooks.on("controlToken", (token, controlled) => {
    // 토글이 꺼져있으면 창 제어 로직을 타지 않음
    if (!window.myHudEnabled) return;

    setTimeout(() => {
        const activeWindow = Object.values(ui.windows).find(w => w.id === "steve-sr5-hud");
        const currentToken = canvas.tokens.controlled[0];

        if (currentToken) {
            // 토큰을 선택했을 때 창이 없으면 새로 생성하여 띄움
            if (!activeWindow) {
                new MyEnhancedUI().render(true);
            } else {
                activeWindow.render(true);
            }
        } else {
            // 선택을 해제했을 때 창을 닫음
            // 창을 닫아도 window.myHudEnabled는 true이므로 토글 상태(버튼 불빛)는 유지됨
            if (activeWindow) activeWindow.close();
        }
    }, 50);
});