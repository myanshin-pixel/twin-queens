import { h, VNode } from 'snabbdom';

import { _ } from '../i18n';
import { LobbyController } from '../lobby';
import { layer2chess } from './layer2chess';
import { layer2fairy } from './layer2fairy';
import { layer2army } from './layer2army';
import { layer2makruk } from './layer2makruk';
import { layer2shogi } from './layer2shogi';
import { layer2xiangqi } from './layer2xiangqi';
import { layer2other } from './layer2other';

const categoryLayers: Record<string, (lobbyCtrl: LobbyController, containerId: string, showBack?: boolean) => void> = {
    chess: layer2chess,
    fairy: layer2fairy,
    army: layer2army,
    makruk: layer2makruk,
    shogi: layer2shogi,
    xiangqi: layer2xiangqi,
    other: layer2other,
};

// Super Chess quick pairing: one tap starts a seek (or joins a matching one).
export const QUICK_PAIRINGS: { base: number; inc: number }[] = [
    { base: 1, inc: 0 },
    { base: 3, inc: 0 },
    { base: 3, inc: 2 },
    { base: 5, inc: 0 },
    { base: 5, inc: 3 },
    { base: 10, inc: 0 },
    { base: 10, inc: 5 },
    { base: 15, inc: 10 },
    { base: 30, inc: 0 },
    { base: 30, inc: 20 },
];

export function speedName(base: number, inc: number): string {
    const total = base * 60 + inc * 40;
    if (total < 180) return _('Bullet');
    if (total < 480) return _('Blitz');
    if (total < 1500) return _('Rapid');
    return _('Classical');
}

function quickPairing(lobbyCtrl: LobbyController, base: number, inc: number): void {
    const match = lobbyCtrl.seeks.find(
        s =>
            s.user !== lobbyCtrl.username &&
            s.variant === 'superchess' &&
            s.base === base &&
            s.inc === inc &&
            s.day === 0 &&
            s.fen === '' &&
            s.target === '',
    );
    if (match) {
        lobbyCtrl.doSend({ type: 'accept_seek', seekID: match.seekID, player: lobbyCtrl.username });
        return;
    }
    const own = lobbyCtrl.seeks.find(
        s => s.user === lobbyCtrl.username && s.variant === 'superchess' && s.base === base && s.inc === inc,
    );
    if (own) return;
    lobbyCtrl.createSeekMsg('superchess', 'r', '', base, inc, 0, 0, false, !lobbyCtrl.anon, -1000, 1000);
}

export function variantPanels(lobbyCtrl: LobbyController): VNode {
    return h('div#panel-container.panel-container.superchess-quick', [
        h('div.quick-head', [
            h('h2', _('Quick pairing')),
            h('p', _('New chess with empty ratings and no theory. Everyone can be first.')),
        ]),
        h(
            'div.quick-grid',
            QUICK_PAIRINGS.map(tc =>
                h(
                    'button.quick-tc',
                    {
                        on: { click: () => quickPairing(lobbyCtrl, tc.base, tc.inc) },
                        attrs: { type: 'button' },
                    },
                    [h('span.quick-clock', `${tc.base}+${tc.inc}`), h('span.quick-speed', speedName(tc.base, tc.inc))],
                ),
            ).concat([
                h(
                    'button.quick-tc.quick-custom',
                    { on: { click: () => lobbyCtrl.createGame('superchess') }, attrs: { type: 'button' } },
                    [h('span.quick-clock', _('Custom')), h('span.quick-speed', _('Create a game'))],
                ),
            ]),
        ),
    ]);
}

export function legacyVariantPanels(lobbyCtrl: LobbyController): VNode {
    if (lobbyCtrl.gameCategory !== 'all') {
        const layer2 = categoryLayers[lobbyCtrl.gameCategory];
        if (layer2) {
            return h('div#panel-container.panel-container', {
                hook: { insert: () => layer2(lobbyCtrl, 'panel-container', false) },
            });
        }
    }

    const assetUrl = lobbyCtrl.assetURL;

    return h('div#panel-container.panel-container', [
        h('div#variantcont.variants-container', [
            h(
                'button#layer1chess.variant-category.chess',
                { on: { click: () => layer2chess(lobbyCtrl, 'panel-container') } },
                [
                    h('div.variant-title', [h('h3', _('Chess Variants'))]),
                    h('div.piece-container', [
                        h('img.sliding-pieces.wR', {
                            attrs: { src: assetUrl + '/images/pieces/merida/wR.svg', alt: '' },
                        }),
                        h('img.wK', { attrs: { src: assetUrl + '/images/pieces/merida/wK.svg', alt: '' } }),
                        h('img.sliding-pieces.wB', {
                            attrs: { src: assetUrl + '/images/pieces/merida/wB.svg', alt: '' },
                        }),
                    ]),
                ],
            ),
            h(
                'button#layer1fairy.variant-category.fairy',
                { on: { click: () => layer2fairy(lobbyCtrl, 'panel-container') } },
                [
                    h('div.variant-title', [h('h3', _('Fairy Piece Variants'))]),
                    h('div.piece-container', [
                        h('img.sliding-pieces.wE', {
                            attrs: { src: assetUrl + '/images/pieces/merida/shako/wE.svg', alt: '' },
                        }),
                        h('img.wC', { attrs: { src: assetUrl + '/images/pieces/merida/wC.svg', alt: '' } }),
                        h('img.sliding-pieces.wH', {
                            attrs: { src: assetUrl + '/images/pieces/merida/wH.svg', alt: '' },
                        }),
                    ]),
                ],
            ),
            h(
                'button#layer1army.variant-category.army',
                { on: { click: () => layer2army(lobbyCtrl, 'panel-container') } },
                [
                    h('div.variant-title', [h('h3', _('New Army Variants'))]),
                    h('div.piece-container', [
                        h('img.sliding-pieces.wJ', {
                            attrs: { src: assetUrl + '/images/pieces/shinobi/merida/wJ.svg', alt: '' },
                        }),
                        h('img.bK', { attrs: { src: assetUrl + '/images/pieces/orda/merida/bK.svg', alt: '' } }),
                        h('img.sliding-pieces.wD', {
                            attrs: { src: assetUrl + '/images/pieces/empire/merida/wD.svg', alt: '' },
                        }),
                    ]),
                ],
            ),
            h(
                'button#layer1makruk.variant-category.makruk',
                { on: { click: () => layer2makruk(lobbyCtrl, 'panel-container') } },
                [
                    h('div.variant-title', [h('h3', _('Makruk Variants'))]),
                    h('div.piece-container', [
                        h('img.sliding-pieces.mN', {
                            attrs: { src: assetUrl + '/images/pieces/makruk/cambodian/wP.svg', alt: '' },
                        }),
                        h('img.mK', { attrs: { src: assetUrl + '/images/pieces/makruk/ada/wK.svg', alt: '' } }),
                        h('img.sliding-pieces.sQ', {
                            attrs: { src: assetUrl + '/images/pieces/sittuyin/Ka_blackred/wP.svg', alt: '' },
                        }),
                    ]),
                ],
            ),
            h(
                'button#layer1shogi.variant-category.shogi',
                { on: { click: () => layer2shogi(lobbyCtrl, 'panel-container') } },
                [
                    h('div.variant-title', [h('h3', _('Shogi Variants'))]),
                    h('div.piece-container', [
                        h('img.sliding-pieces.ONG', {
                            attrs: { src: assetUrl + '/images/pieces/shogi/ctk/0KI.svg', alt: '' },
                        }),
                        h('img.OGY', { attrs: { src: assetUrl + '/images/pieces/shogi/2kanji/0GY.svg', alt: '' } }),
                        h('img.sliding-pieces.OKI', {
                            attrs: { src: assetUrl + '/images/pieces/shogi/ctp/0KI.svg', alt: '' },
                        }),
                    ]),
                ],
            ),
            h(
                'button#layer1xiangqi.variant-category.xiangqi',
                { on: { click: () => layer2xiangqi(lobbyCtrl, 'panel-container') } },
                [
                    h('div.variant-title', [h('h3', _('Xiangqi Variants'))]),
                    h('div.piece-container', [
                        h('img.sliding-pieces.xC', {
                            attrs: { src: assetUrl + '/images/pieces/xiangqi/ct2/black_cannon2.svg', alt: '' },
                        }),
                        h('img.xK', {
                            attrs: { src: assetUrl + '/images/pieces/xiangqi/hnz/black_king.svg', alt: '' },
                        }),
                        h('img.sliding-pieces.jK', {
                            attrs: { src: assetUrl + '/images/pieces/janggi/hanjablue/blue_king.svg', alt: '' },
                        }),
                    ]),
                ],
            ),
        ]),
    ]);
}
