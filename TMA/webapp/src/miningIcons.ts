/** Pool / solo icons for mining UI. */

export const POOL_ICON_URL = `/pool.png?v=${__TMA_BUILD_ID__}`;
export const SOLO_ICON_URL = `/solo.png?v=${__TMA_BUILD_ID__}`;

export function poolIconImg(className: string, width: number, height: number): string {
  return `<img class="${className}" src="${POOL_ICON_URL}" width="${width}" height="${height}" alt="" decoding="async" />`;
}

export function soloIconImg(className: string, width: number, height: number): string {
  return `<img class="${className}" src="${SOLO_ICON_URL}" width="${width}" height="${height}" alt="" decoding="async" />`;
}

export function walletIcoPoolImg(): string {
  return poolIconImg("wallet-ico wallet-ico-pool-img", 24, 24);
}

export function miningCoinPoolIconHtml(): string {
  return `<span class="mining-circle-pool-icon">${poolIconImg("mining-pool-img", 34, 34)}</span>`;
}

export function togglePoolIconHtml(): string {
  return poolIconImg("mining-pool-img mining-pool-img--toggle", 24, 24);
}

export function toggleSoloIconHtml(): string {
  return soloIconImg("mining-solo-img mining-solo-img--toggle", 17, 17);
}

export function poolsCardPoolIconHtml(): string {
  return poolIconImg("pools-pool-img", 22, 22);
}
