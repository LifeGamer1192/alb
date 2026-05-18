// character.js
// キャラクター管理の雛形
const Character = {
  create(data) {
    return {
      name: data.name || 'Hero',
      hp: data.hp || 100,
      atk: data.atk || 10,
      def: data.def || 5,
      spd: data.spd || 5,
      skills: data.skills || []
    };
  }
};
