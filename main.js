import { registerKeybindings } from "./setting.js";
let myHudEnabled = false;
let hudUpdateTimer = null;

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
        const token = canvas.tokens.controlled[0];
        if (!token || !token.actor) return {};

        const actor = token.actor;
        const system = actor.system;

        // packId를 먼저 정의하거나 직접 문자열을 넣어야 해
        const packId = 'shadowrun5e.sr5e-general-actions';
        const pack = game.packs.get(packId);

        let extraActions = [];
        if (pack) {
            const index = await pack.getIndex();
            const targets = ['Armor', 'Biofeedback Resist', 'Drain', 'Fade', 'Judge Intentions', 'Lift Carry', 'Physical Damage Resist', 'Physical Defense', 'Memory', 'Composure'];

            extraActions = targets.map(t => {
                const found = index.find(i => i.name.toLowerCase() === t.toLowerCase());

                // [수정] 번역 키를 찾는 두 가지 후보군
                const keyWithSpace = `SR5.Content.Actions.${t}`; // "SR5.Content.Actions.Biofeedback Resist"
                const keyWithoutSpace = `SR5.Content.Actions.${t.replace(/\s+/g, '')}`; // "SR5.Content.Actions.BiofeedbackResist"

                let translatedName = t;

                // 1. 띄어쓰기 있는 키 먼저 확인
                if (game.i18n.has(keyWithSpace)) {
                    translatedName = game.i18n.localize(keyWithSpace);
                }
                // 2. 없으면 띄어쓰기 없는 키 확인
                else if (game.i18n.has(keyWithoutSpace)) {
                    translatedName = game.i18n.localize(keyWithoutSpace);
                }
                // 3. 둘 다 없으면 인덱스 라벨 확인
                else if (found && found.label && found.label !== found.name) {
                    translatedName = found.label;
                }

                return {
                    name: translatedName, // 이제 '생체반응 저항'이 들어감
                    actionId: found ? found.name : t,
                    pack: 'sr5e-general-actions',
                    isPack: true,
                    type: "action",
                    img: found ? found.img : "icons/svg/clockwork.svg"
                };
            });
        }

        // 1. 기술 데이터 처리
        let skills = { active: {}, knowledge: {}, language: {} };
        if (system.skills) {
            skills = duplicate(system.skills);
            if (skills.active) {
                for (let [key, skill] of Object.entries(skills.active)) {
                    skill.displayName = game.i18n.localize(skill.label) || key;
                }
            }
        }

        // 2. 정렬 및 번역 함수 (기존 코드 유지)
        const sortItems = (items) => {
            return items.sort((a, b) => {
                const typeA = (a.type || "").toLowerCase();
                const typeB = (b.type || "").toLowerCase();
                if (typeA < typeB) return -1;
                if (typeA > typeB) return 1;
                return a.name.localeCompare(b.name, 'ko');
            });
        };

        const getTranslatedItems = (types) => {
            return actor.items
                .filter(i => types.includes(i.type))
                .map(i => {
                    const standardKey = `TYPES.Item.${i.type}`;
                    let translated = "";
                    if (game.i18n.has(standardKey)) translated = game.i18n.localize(standardKey);
                    else {
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
        };

        // 3. 각 섹션별 데이터 조립
        const allActions = getTranslatedItems(["action"]).concat(extraActions);

        return {
            name: token.name,
            img: actor.img || "icons/svg/mystery-man.svg",
            armorValue: system.armor?.value ?? 0,
            track: {
                physical: { value: system.track?.physical?.value ?? 0, base: system.track?.physical?.base ?? 0 },
                stun: { value: system.track?.stun?.value ?? 0, base: system.track?.stun?.base ?? 0 }
            },
            specialButtonLabel: system.special === "magic" ? "마법" : system.special === "resonance" ? "공명" : null,
            skills: skills,
            inventory: {
                "무기, 방어구, 탄약": sortItems(getTranslatedItems(["weapon", "armor", "ammo", "modification"])),
                "증강물": sortItems(getTranslatedItems(["bioware", "cyberware"])),
                "장비, 도구": sortItems(getTranslatedItems(["device", "equipment"]))
            },
            actionData: { "보유 행동": sortItems(allActions) },
            specialData: system.special === "magic" ? {
                "주문 및 의식": sortItems(getTranslatedItems(["spell", "ritual", "call_in_action"])),
                "능력 및 메타매직": sortItems(getTranslatedItems(["adept_power", "metamagic"])),
                "포커스 및 물품": sortItems(getTranslatedItems(["focus", "preparation"]))
            } : system.special === "resonance" ? {
                "컴플렉스 폼": sortItems(getTranslatedItems(["complex_form"])),
                "에코 및 능력": sortItems(getTranslatedItems(["echo", "sprite_power", "call_in_action"]))
            } : null
        };
    }

    _injectHTML(html) {
        super._injectHTML(html);
        if (html && html.find) {
            html.find(".window-header").css("display", "none");
            html.css("border", "none");
        }
    }

    activateListeners(html) {
        super.activateListeners(html);

        const getControlledToken = () => canvas.tokens.controlled[0];

        html.find('.portrait-container').click(ev => {
            ev.preventDefault();
            const target = this.actor || this.object?.actor || canvas.tokens.controlled[0]?.actor;
            const sheet = target.sheet;

            if (sheet.rendered) {
                sheet.close();
            } else {
                sheet.render(true);
            }
        });

        // 1. 방패 아이콘 (전용 방어 액션)
        html.find('.armor-badge').click(async ev => {
            ev.preventDefault();
            ev.stopPropagation();
            (async () => {
                // grab the actor, here we take it from the sidebar by it's name
                const actor = canvas.tokens.controlled[0]?.actor || game.user.character;

                // setup a partial action with only those values we need.  
                const partAction = {
                    // each test knows it's default values for categories, modifiers and sometimes values.
                    // otherwise you can overwrite it by setting its action property here manually.
                    test: 'PhysicalResistTest',
                    armor: true,
                    attribute: 'body'
                };
                // setup the full action, taking our values.
                const action = game.shadowrun5e.data.createData('action_roll', partAction);

                // create a test from the action with that actor.
                // this will setup the test, grab the correct one based on partAction.test above
                // ...and grab defined values from the actor.
                const test = await game.shadowrun5e.test.fromAction(action, actor);

                await test.execute();
            })();
        });

        // 2. 통합 토글 로직 (행동, 기술, 소지품, 마법 버튼)
        // data-action과 data-target을 모두 지원하도록 통합
        html.find('.toggle-btn').click(ev => {
            ev.preventDefault();
            const targetId = $(ev.currentTarget).data('target') || $(ev.currentTarget).data('action');
            const $target = html.find(`#${targetId}`);

            // 다른 열린 메뉴 싹 닫기
            html.find('.sub-menu, .dropdown-content').not($target).addClass('hidden');
            // 대상 메뉴 토글
            $target.toggleClass('hidden');
        });

        // 3. 기술 분류 버튼 (활성형/지식/언어)
        html.find('.skill-type-btn').click(ev => {
            ev.preventDefault();
            const targetId = $(ev.currentTarget).data('target');
            const $target = html.find(`#${targetId}`);
            html.find('#active-list, #knowledge-list, #language-list').not($target).addClass('hidden');
            $target.toggleClass('hidden');
        });

        // 4. 모든 아이템(행동, 소지품, 마법) 주사위 굴림
        // .item-roll 클래스가 붙은 아이콘 클릭 시 작동
        html.find('.item-roll').click(async ev => {
            ev.preventDefault();
            ev.stopPropagation();

            const token = getControlledToken();
            if (!token?.actor) return;

            const dataset = ev.currentTarget.closest('.inventory-item')?.dataset;
            if (!dataset) return;

            if (dataset.isPack === "true") {
                try {
                    // 참조 예시: await game.shadowrun5e.test.fromPackAction('팩이름', '액션이름', 액터)
                    const test = await game.shadowrun5e.test.fromPackAction(
                        dataset.pack,
                        dataset.actionId,
                        token.actor
                    );

                    if (test) {
                        await test.execute();
                    } else {
                        ui.notifications.warn(`액션 '${dataset.actionId}'을(를) 찾을 수 없어.`);
                    }
                } catch (err) {
                    console.error("SR5 HUD Pack Action Error:", err);
                }
                return;
            }

            const item = token.actor.items.get(dataset.id || dataset.itemId);
            if (item) {
                if (typeof item.castAction === "function") await item.castAction(ev, token.actor);
                else if (typeof item.roll === "function") await item.roll();
                else if (typeof item.postItemCard === "function") await item.postItemCard();
            }
        });

        // 5. 모든 아이템 시트 열기 (이름 클릭 시)
        html.find('.item-name').click(ev => {
            ev.preventDefault();
            ev.stopPropagation();
            const token = getControlledToken();
            const id = ev.currentTarget.closest('[data-item-id]')?.dataset.itemId ||
                ev.currentTarget.closest('[data-id]')?.dataset.id;

            const item = token?.actor.items.get(id);
            if (item) item.sheet.render(true);
        });

        // 6. 일반 기술 굴림 (시스템 내장 기술)
        html.find('.skill-item:not(.inventory-item)').click(ev => {
            ev.preventDefault();
            const id = ev.currentTarget.dataset.id;
            const token = getControlledToken();
            if (token?.actor?.rollSkill) token.actor.rollSkill(id);
        });

        // 7. 검색 및 필터링 로직
        html.find('.skill-search, .filter-zero').on('input change', ev => {
            const $container = $(ev.currentTarget).closest('.dropdown-content');
            const searchText = $container.find('.skill-search').val().toLowerCase();
            const hideZero = $container.find('.filter-zero').is(':checked');

            $container.find('.skill-item, .inventory-item').each((i, el) => {
                const $el = $(el);
                const name = ($el.find('.skill-name').text() || $el.find('.item-name').text()).toLowerCase();
                const ratingText = $el.find('.skill-rating').text() || $el.find('.item-quantity').text();
                const value = parseInt(ratingText.replace(/[^0-9]/g, "")) || 0;

                $el.toggle(name.includes(searchText) && (!hideZero || value > 0));
            });
        });
    }
}

window.MyEnhancedUI = MyEnhancedUI; 

// --- Hooks ---
async function updateMyHud() {
    const activeWindow = Object.values(ui.windows).find(w => w.id === "steve-sr5-hud");
    if (activeWindow) {
        await activeWindow.render(true);
    }
}

Hooks.on("updateActor", (actor, changes) => {
    if (!myHudEnabled) return;
    if (changes.system || changes.name) {
        if (hudUpdateTimer) clearTimeout(hudUpdateTimer);
        hudUpdateTimer = setTimeout(() => {
            updateMyHud();
            hudUpdateTimer = null;
        }, 100);
    }
});

Hooks.on("updateItem", () => {
    if (myHudEnabled) setTimeout(() => updateMyHud(), 100);
});

Hooks.on("renderTokenHUD", (app, html) => {
    const buttonHtml = `<div class="control-icon ${myHudEnabled ? 'active' : ''}" title="SR HUD"><i class="fa-thin fa-browsers"></i></div>`;
    const $myButton = $(buttonHtml);
    $myButton.click((event) => {
        event.preventDefault();
        myHudEnabled = !myHudEnabled;
        if (myHudEnabled) new MyEnhancedUI().render(true);
        else {
            const existing = Object.values(ui.windows).find(w => w.id === "steve-sr5-hud");
            if (existing) existing.close();
        }
        app.render();
    });
    $(html).find(".col.right").append($myButton);
});

Hooks.on("controlToken", (token, controlled) => {
    if (!myHudEnabled) return;
    setTimeout(() => {
        const activeWindow = Object.values(ui.windows).find(w => w.id === "steve-sr5-hud");
        if (canvas.tokens.controlled[0]) {
            if (!activeWindow) new MyEnhancedUI().render(true);
            else activeWindow.render(true);
        } else if (activeWindow) activeWindow.close();
    }, 50);
});