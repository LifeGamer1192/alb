// logic-engine.js
// ロジック評価エンジンの雛形
const LogicEngine = {
  evaluate(rules, state) {
    for (const rule of rules) {
      if (rule.condition === 'always') {
        return rule.action;
      }
    }
    return null;
  }
};
