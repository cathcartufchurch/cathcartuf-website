/**
 * Mobile navigation — hamburger menu
 *
 * Three behaviours:
 *  1. Hamburger button toggles the whole nav open/closed
 *  2. Parent links with submenus expand/collapse their submenu on tap
 *  3. Tapping any link closes the whole nav (page is reloading anyway)
 *
 * On desktop none of this runs — hover CSS handles the dropdowns instead.
 * The JS only activates when the hamburger button is visible.
 */

document.addEventListener("DOMContentLoaded", function () {

    const hamburger = document.getElementById("nav-hamburger");
    const navList   = document.getElementById("nav-list");

    if (!hamburger || !navList) return;

    // ── 1. Hamburger toggles the whole nav ──────────────────────────

    hamburger.addEventListener("click", function () {
        const isOpen = navList.classList.toggle("nav-open");
        // Update aria-expanded so screen readers know the state
        hamburger.setAttribute("aria-expanded", isOpen ? "true" : "false");
        // Swap the button label between ≡ and ✕
        hamburger.textContent = isOpen ? "\u00d7" : "\u2261";
    });

    // ── 2. Parent links expand/collapse their submenu on tap ────────
    //
    // Each <li> that contains a nested <ul> gets a tap handler on its
    // top-level <a>. Tapping toggles the submenu open or closed.
    // We check isMobileNav() first so desktop hover is never affected.

    const parentItems = navList.querySelectorAll("li > ul");

    parentItems.forEach(function (submenu) {
        const parentLink = submenu.previousElementSibling;
        if (!parentLink) return;

        parentLink.addEventListener("click", function (e) {
            // Only intercept on mobile where the hamburger is visible
            if (!isMobileNav()) return;

            e.preventDefault(); // Don't navigate — just toggle the submenu
            const isExpanded = submenu.classList.toggle("submenu-open");
            parentLink.setAttribute("aria-expanded", isExpanded ? "true" : "false");
        });
    });

    // ── 3. Tapping any link closes the whole nav ────────────────────
    //
    // When the user taps a real destination link (not a parent toggler)
    // we close the nav. Since the page is about to reload, this is mostly
    // cosmetic — but it feels cleaner and avoids a flash of open nav
    // if the browser's back button is used.

    const allLinks = navList.querySelectorAll("a");

    allLinks.forEach(function (link) {
        link.addEventListener("click", function () {
            if (!isMobileNav()) return;
            // Only close if this link isn't a parent toggler
            // (parent togglers have a sibling submenu and are handled above)
            const siblingSubmenu = link.parentElement.querySelector("ul");
            if (siblingSubmenu) return; // Let the toggler handler deal with it

            closeNav();
        });
    });

    // ── Helpers ─────────────────────────────────────────────────────

    // Returns true only when the hamburger button is actually visible,
    // i.e. we are in mobile layout. This is the cleanest way to check
    // because it respects whatever breakpoint is set in CSS — no magic
    // pixel numbers duplicated in JS.
    function isMobileNav() {
        return window.getComputedStyle(hamburger).display !== "none";
    }

    function closeNav() {
        navList.classList.remove("nav-open");
        hamburger.setAttribute("aria-expanded", "false");
        hamburger.textContent = "\u2261";
    }

});
