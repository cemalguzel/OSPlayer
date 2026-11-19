/**
 * D-pad / klavye uzamsal odak motoru.
 *
 * Kullanım: odaklanabilir her öğeye `data-focusable` ver (tabIndex=-1 önerilir).
 * - Ok tuşları: geometrik olarak en yakın öğeye odak taşır
 * - Enter/Space: öğeye click gönderir
 * - Escape/Backspace: 'app-back' CustomEvent'i yayınlar (router dinler)
 *
 * Katmanlar: açık bir dialog/popup odak tuzağı istiyorsa kapsayıcıya
 * `data-focus-layer` ver — aday araması yalnızca DOM'daki SON katmanda yapılır.
 *
 * OS Player D-pad standardı: tıklanan seçenekte kal; panel kapanınca açan
 * butona dönmek için kapatan bileşen `focusKey()` ile odağı geri verir.
 */

let initialized = false;

function isVisible(el: HTMLElement): boolean {
    if (el.getAttribute('data-focus-disabled') === 'true') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
}

function candidateRoot(): ParentNode {
    const layers = document.querySelectorAll('[data-focus-layer]');
    if (layers.length > 0) return layers[layers.length - 1];
    return document;
}

export function getFocusables(root?: ParentNode): HTMLElement[] {
    const scope = root ?? candidateRoot();
    return Array.from(scope.querySelectorAll<HTMLElement>('[data-focusable]')).filter(isVisible);
}

function centerOf(r: DOMRect) {
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Verilen yönde en uygun adayı geometrik puanla seçer. */
function findNext(current: HTMLElement, dir: 'up' | 'down' | 'left' | 'right'): HTMLElement | null {
    const curRect = current.getBoundingClientRect();
    const cur = centerOf(curRect);
    let best: HTMLElement | null = null;
    let bestScore = Infinity;

    for (const el of getFocusables()) {
        if (el === current) continue;
        const r = el.getBoundingClientRect();
        const c = centerOf(r);
        const dx = c.x - cur.x;
        const dy = c.y - cur.y;

        let primary: number;
        let secondary: number;
        let overlap = 0;
        switch (dir) {
            case 'up':
                if (r.bottom > curRect.top + 2) continue;
                primary = cur.y - c.y;
                secondary = Math.abs(dx);
                overlap = Math.max(0, Math.min(curRect.right, r.right) - Math.max(curRect.left, r.left));
                break;
            case 'down':
                if (r.top < curRect.bottom - 2) continue;
                primary = c.y - cur.y;
                secondary = Math.abs(dx);
                overlap = Math.max(0, Math.min(curRect.right, r.right) - Math.max(curRect.left, r.left));
                break;
            case 'left':
                if (r.right > curRect.left + 2) continue;
                primary = cur.x - c.x;
                secondary = Math.abs(dy);
                overlap = Math.max(0, Math.min(curRect.bottom, r.bottom) - Math.max(curRect.top, r.top));
                break;
            case 'right':
                if (r.left < curRect.right - 2) continue;
                primary = c.x - cur.x;
                secondary = Math.abs(dy);
                overlap = Math.max(0, Math.min(curRect.bottom, r.bottom) - Math.max(curRect.top, r.top));
                break;
        }
        if (primary < 0) continue;
        // Hizalı (kesişen) adaylar güçlü şekilde tercih edilir
        const score = primary + secondary * 2 + (overlap > 0 ? 0 : 5000);
        if (score < bestScore) {
            bestScore = score;
            best = el;
        }
    }
    return best;
}

export function focusElement(el: HTMLElement | null): void {
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** data-focus-key ile işaretli öğeye odak verir (panel kapanınca geri dönüş için). */
export function focusKey(key: string): boolean {
    const el = document.querySelector<HTMLElement>(`[data-focus-key="${key}"]`);
    if (el && isVisible(el)) {
        focusElement(el);
        return true;
    }
    return false;
}

/** Ekranda ilk odağı kurar: önce [data-autofocus], yoksa ilk aday. */
export function focusFirst(root?: ParentNode): void {
    const scope = root ?? candidateRoot();
    const auto = scope.querySelector<HTMLElement>('[data-autofocus][data-focusable]');
    if (auto && isVisible(auto)) {
        focusElement(auto);
        return;
    }
    const all = getFocusables(scope);
    if (all.length) focusElement(all[0]);
}

export function dispatchBack(): void {
    window.dispatchEvent(new CustomEvent('app-back'));
}

export function initSpatialNav(): void {
    if (initialized) return;
    initialized = true;

    window.addEventListener('keydown', (e) => {
        const target = e.target as HTMLElement | null;
        const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

        // Yazı alanında sol/sağ ok metin içinde gezinir; yukarı/aşağı odak taşır
        if (isInput && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
        if (isInput && e.key !== 'Escape' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Enter')
            return;

        const dirMap: Record<string, 'up' | 'down' | 'left' | 'right'> = {
            ArrowUp: 'up',
            ArrowDown: 'down',
            ArrowLeft: 'left',
            ArrowRight: 'right',
        };

        if (dirMap[e.key]) {
            e.preventDefault();
            const current =
                document.activeElement instanceof HTMLElement &&
                document.activeElement.hasAttribute('data-focusable')
                    ? document.activeElement
                    : null;
            if (!current) {
                focusFirst();
                return;
            }
            const next = findNext(current, dirMap[e.key]);
            if (next) focusElement(next);
            return;
        }

        if (e.key === 'Enter' || e.key === ' ') {
            const current = document.activeElement as HTMLElement | null;
            if (current && current.hasAttribute('data-focusable')) {
                if (current.tagName === 'INPUT' && e.key === ' ') return;
                e.preventDefault();
                current.click();
            }
            return;
        }

        if (e.key === 'Escape' || e.key === 'Backspace') {
            if (isInput && e.key === 'Backspace') return;
            e.preventDefault();
            dispatchBack();
        }
    });

    // Fare desteği: hover ile odak (dokunmatik/mouse kullanıcıları için)
    window.addEventListener('mouseover', (e) => {
        const el = (e.target as HTMLElement | null)?.closest?.('[data-focusable]') as HTMLElement | null;
        if (el && isVisible(el)) el.focus({ preventScroll: true });
    });
}
