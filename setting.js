// settings.js

/**
 * 키바인딩 등록
 */
export const registerKeybindings = function () {
    game.keybindings.register("sr5-hud", "toggleHud", {
        name: "SR5 HUD 토글",
        hint: "HUD를 끄거나 켭니다.",
        editable: [{ key: "KeyH", modifiers: ["Control"] }],
        onDown: () => {
            return handleHudToggle();
        }
    });
};

/**
 * HUD 토글 핸들러
 * @returns {boolean} - 키바인딩이 처리되었는지 여부
 */
function handleHudToggle() {
    // 토글 함수가 정의되어 있는지 확인
    if (typeof window.toggleMyHud !== "function") {
        console.error("SR5 HUD: toggleMyHud 함수를 찾을 수 없습니다.");
        return false;
    }

    // HUD를 켤 때만 토큰 선택 확인
    const isOpening = !window.myHudEnabled;
    
    if (isOpening) {
        const selectedToken = canvas.tokens.controlled[0];
        
        if (!selectedToken) {
            ui.notifications.warn("대상 토큰을 먼저 선택해주세요.", { 
                timeout: 2000 
            });
            return true; // 키바인딩은 처리되었지만 액션은 실행 안 함
        }
    }

    // 토글 실행
    window.toggleMyHud();
    return true;
}
