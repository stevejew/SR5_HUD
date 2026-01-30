let myHudEnabled = false;
let hudUpdateTimer = null;

class MyEnhancedUI extends Application {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "my-enhanced-hud",
            template: "modules/test/templates/ui.hbs",
            popOut: true,
            classes: ["enhanced-hud-frame"],
            width: 400,
            height: "auto",
            resizable: false,
            minimizable: false
        });
    }

    getData() {
        const token = canvas.tokens.controlled[0];
        if (!token || !token.actor) return {};

        const actor = token.actor;
        const system = actor.system;

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

                    if (game.i18n.has(standardKey)) {
                        translated = game.i18n.localize(standardKey);
                    } else {
                        const camelType = i.type.split('_')
                            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                            .join('');

                        const backupKeys = [
                            `SR5.ItemTypes.${camelType}`,
                            `SR5.ItemTypes.${i.type}`,
                            `Item.${i.type}`
                        ];

                        for (let key of backupKeys) {
                            if (game.i18n.has(key)) {
                                translated = game.i18n.localize(key);
                                break;
                            }
                        }
                    }

                    // [수정 포인트] duplicate(i)를 제거함
                    // 원본 객체 i에 직접 label 속성만 주입해서 반환해. 
                    // 이렇게 하면 i.roll() 같은 함수가 그대로 살아있어.
                    i.label = translated || i.type;
                    return i;
                });
        };

        // 3. 각 섹션별 데이터 조립
        const actionData = {
            "보유 행동": sortItems(getTranslatedItems(["action"]))
        };

        const inventory = {
            "무기, 방어구, 탄약": sortItems(getTranslatedItems(["weapon", "armor", "ammo", "modification"])),
            "증강물": sortItems(getTranslatedItems(["bioware", "cyberware"])),
            "장비, 도구": sortItems(getTranslatedItems(["device", "equipment"]))
        };

        const magicData = {
            "주문 및 의식": sortItems(getTranslatedItems(["spell", "ritual", "call_in_action"])),
            "능력 및 메타매직": sortItems(getTranslatedItems(["adept_power", "metamagic"])),
            "포커스 및 물품": sortItems(getTranslatedItems(["focus", "preparation"]))
        };

        const resonanceData = {
            "컴플렉스 폼": sortItems(getTranslatedItems(["complex_form"])),
            "에코 및 능력": sortItems(getTranslatedItems(["echo", "sprite_power", "call_in_action"]))
        };

        // 4. 최종 반환 (actionData 추가됨!)
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
            inventory: inventory,
            actionData: actionData, // 이 줄이 꼭 있어야 ui.hbs에서 쓸 수 있어!
            specialData: system.special === "magic" ? magicData : system.special === "resonance" ? resonanceData : null
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
            const token = getControlledToken();
            if (!token?.actor) return;
            const pack = game.packs.get("shadowrun5e.sr5e-general-actions");
            if (!pack) return;
            const item = await pack.getDocument("wWeIV09KjkZvjJKb");
            if (item && item.castAction) {
                await item.castAction(new Event("click"), token.actor);
            }
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

            // data-id 또는 부모의 data-item-id에서 ID 추출
            const id = ev.currentTarget.closest('[data-item-id]')?.dataset.itemId ||
                ev.currentTarget.closest('[data-id]')?.dataset.id;

            const item = token.actor.items.get(id);
            if (item) {
                // SR5 시스템의 특수 액션 함수 우선 실행, 없으면 일반 굴림
                if (typeof item.castAction === "function") {
                    await item.castAction(ev, token.actor);
                } else if (typeof item.roll === "function") {
                    await item.roll();
                } else if (typeof item.postItemCard === "function") {
                    await item.postItemCard();
                } else {
                    ui.notifications.warn(`${item.name}은(는) 직접 굴릴 수 없는 항목입니다.`);
                }
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
// --- Hooks ---
function updateMyHud() {
    const activeWindow = Object.values(ui.windows).find(w => w.id === "my-enhanced-hud");
    if (activeWindow) {
        activeWindow._rendering = false;
        activeWindow._state = 2;
        activeWindow.render(true, { focus: false });
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
            const existing = Object.values(ui.windows).find(w => w.id === "my-enhanced-hud");
            if (existing) existing.close();
        }
        app.render();
    });
    $(html).find(".col.right").append($myButton);
});

Hooks.on("controlToken", (token, controlled) => {
    if (!myHudEnabled) return;
    setTimeout(() => {
        const activeWindow = Object.values(ui.windows).find(w => w.id === "my-enhanced-hud");
        if (canvas.tokens.controlled[0]) {
            if (!activeWindow) new MyEnhancedUI().render(true);
            else activeWindow.render(true);
        } else if (activeWindow) activeWindow.close();
    }, 50);
});