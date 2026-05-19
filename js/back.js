// back.js
// 共通の戻るボタン挙動: 履歴があれば戻る、なければルートに遷移
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.back-link').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      try {
        if (history.length > 1) {
          history.back();
          // フォールバック: 200ms 後も遷移していなければトップへ
          setTimeout(() => {
            if (location.pathname.endsWith('/') || location.pathname.endsWith('/index.html')) return;
            location.href = '../index.html';
          }, 250);
        } else {
          location.href = '../index.html';
        }
      } catch (err) {
        location.href = '../index.html';
      }
    });
  });
});
