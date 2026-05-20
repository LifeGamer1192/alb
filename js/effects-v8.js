// effects-v8.js — v8 visual feedback layer.
// The dungeon grid is rebuilt every turn, so transient effects live in a
// separate overlay (#fx-layer) that the grid render never clears.

function tileAt(mapRoot, width, x, y) {
  return mapRoot.children[y * width + x] || null;
}

function spawnPopup(fxLayer, tile, text, variant) {
  const el = document.createElement('div');
  el.className = `fx-popup ${variant}`;
  el.textContent = text;
  el.style.left = `${tile.offsetLeft + tile.offsetWidth / 2}px`;
  el.style.top = `${tile.offsetTop + tile.offsetHeight / 2}px`;
  fxLayer.appendChild(el);
  const drop = () => el.remove();
  el.addEventListener('animationend', drop);
  setTimeout(drop, 1400);
}

function flashTile(tile) {
  // Restart the flash animation even if the class is already present.
  tile.classList.remove('tile-hit');
  void tile.offsetWidth;
  tile.classList.add('tile-hit');
}

function spawnBanner(fxLayer, text) {
  const el = document.createElement('div');
  el.className = 'fx-banner fever';
  el.textContent = text;
  fxLayer.appendChild(el);
  const drop = () => el.remove();
  el.addEventListener('animationend', drop);
  setTimeout(drop, 1600);
}

export function playEffects(mapRoot, fxLayer, effects, width, player) {
  if (!mapRoot || !fxLayer || !effects || !effects.length) return;
  for (const fx of effects) {
    if (fx.kind === 'damage') {
      const tile = tileAt(mapRoot, width, fx.x, fx.y);
      if (!tile) continue;
      let variant = 'dmg';
      if (fx.defeated) variant = 'dmg defeat';
      else if (fx.crit) variant = 'dmg crit';
      else if (fx.fever) variant = 'dmg fever';
      spawnPopup(fxLayer, tile, String(fx.amount), variant);
      flashTile(tile);
    } else if (fx.kind === 'heal') {
      const tile = player && tileAt(mapRoot, width, player.x, player.y);
      if (tile) spawnPopup(fxLayer, tile, `+${fx.amount}`, 'heal');
    } else if (fx.kind === 'fever') {
      spawnBanner(fxLayer, 'FEVER!');
    }
  }
}

export function setFeverActive(mapWrap, active) {
  if (mapWrap) mapWrap.classList.toggle('fever-active', !!active);
}
