// combat.js
// 戦闘エンジンの雛形
const Combat = {
  attack(attacker, defender) {
    const damage = Math.max(0, attacker.atk - defender.def);
    defender.hp -= damage;
    return damage;
  }
};
