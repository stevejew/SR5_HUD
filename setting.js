// settings.js
export const registerKeybindings = function () {
    game.keybindings.register("sr5-hud", "toggleHud", {
        name: "SR5 HUD 토글",
        hint: "HUD 창을 끄거나 켭니다.",
        editable: [{ key: "KeyH", modifiers: ["Control"] }],
        onDown: () => {
            // 1. 현재 열려있는 HUD 윈도우 찾기
            const existing = Object.values(ui.windows).find(w => w.id === "steve-sr5-hud");

            if (existing) {
                // 이미 열려있다면 닫기
                existing.close();
            } else {
                // 닫혀있다면 새로 열기 (단, 선택된 토큰이 있어야 함)
                const token = canvas.tokens.controlled[0];
                if (!token) {
                    ui.notifications.warn("단축키 사용 전 토큰 선택");
                    return true;
                }
                // MyEnhancedUI 클래스는 main.js에서 전역으로 접근 가능해야 함
                // 또는 main.js에서 window.MyEnhancedUI = MyEnhancedUI; 등록 필요
                if (window.MyEnhancedUI) {
                    new window.MyEnhancedUI().render(true);
                }
            }
            return true;
        },
        restricted: false,
        precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
    });
};