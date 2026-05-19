// logic-engine.js
// ロジック評価エンジン
export const LogicEngine = {
  evaluate(rules, state) {
    for (const rule of rules) {
      if (rule.condition === 'hp_below') {
        if (state.hp != null && state.hp < rule.value) {
          return rule.action;
        }
      } else if (rule.condition === 'enemy_nearby') {
        if (state.enemyDistance != null && state.enemyDistance <= rule.value) {
          return rule.action;
        }
      } else if (rule.condition === 'always') {
        return rule.action;
      }
    }
    return null;
  }
};
