// navbarToggle.js — 왼쪽 메뉴(#navbar) 접기/펼치기 (전 페이지 공용)
// loadNavbar.js / loadManageNavbar.js 가 자동으로 이 스크립트를 끼워넣어, 개별 HTML 수정 없이 모든 페이지에 적용된다.
// 접힘 상태는 localStorage('navbarCollapsed')에 저장 → 페이지를 옮겨다녀도 유지.
(function () {
    'use strict';
    var KEY = 'navbarCollapsed';

    function setup() {
        if (document.getElementById('navToggle')) return; // 중복 삽입 방지(멱등)
        var collapsed = localStorage.getItem(KEY) === '1';

        var btn = document.createElement('button');
        btn.id = 'navToggle';
        btn.type = 'button';
        btn.setAttribute('aria-label', '메뉴 접기/펼치기');
        btn.title = '메뉴 접기/펼치기';

        function apply() {
            document.body.classList.toggle('nav-collapsed', collapsed);
            btn.textContent = collapsed ? '☰' : '✕';
        }
        btn.addEventListener('click', function () {
            collapsed = !collapsed;
            try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch (e) {}
            apply();
        });

        document.body.appendChild(btn);
        apply();
    }

    window.setupNavbarToggle = setup; // 로더가 명시 호출할 수도 있음
    if (document.readyState !== 'loading') setup();
    else document.addEventListener('DOMContentLoaded', setup);
})();
