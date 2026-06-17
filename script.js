// --- 1. データをLocalStorageに保存する処理 ---
function saveData() {
    // 現在の入力状況を変数にまとめる
    const appData = {
        assets: {
            bank: 50000,
            cash: 10000,
            paypay: 5000,
            hidden: 30000 // 隠し金
        },
        liabilities: {
            creditThisMonth: 15000, // クレカ今月分
            fixedCost: 8000 // Wi-Fiやスマホ代
        }
    };

    // JSON.stringify でデータを文字列に変換して、「myBudgetData」という名前で保存
    localStorage.setItem('myBudgetData', JSON.stringify(appData));
    console.log("データを保存しました！");
}

// --- 2. データを読み込んで計算するロジック ---
function loadAndCalculate() {
    // LocalStorageからデータを読み込む
    const savedDataString = localStorage.getItem('myBudgetData');

    if (savedDataString) {
        // 文字列から元のデータ形式（オブジェクト）に戻す
        const data = JSON.parse(savedDataString);

        // ① 全資産の合計を計算
        const totalAssets = data.assets.bank + data.assets.cash + data.assets.paypay + data.assets.hidden;

        // ② 確定しているマイナス分（今月の支払い）の合計
        const totalLiabilities = data.liabilities.creditThisMonth + data.liabilities.fixedCost;

        // ③ 今月自由に使えるお金（資産 － 支払い）
        const availableThisMonth = totalAssets - totalLiabilities;

        // ④ 今日使えるお金の計算（今月の残り日数を出す）
        const today = new Date();
        // 今月の末日を取得
        const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        // 残り日数を計算（今日を含む）
        const daysLeft = lastDayOfMonth.getDate() - today.getDate() + 1;

        // 割り算して今日使えるお金を算出（端数切り捨て）
        const availableToday = Math.floor(availableThisMonth / daysLeft);

        // ⑤ 今週使えるお金（今日使えるお金 × 7）
        const availableThisWeek = availableToday * 7;

        // 結果の確認
        console.log("今月自由に使えるお金: " + availableThisMonth + "円");
        console.log("今月の残り日数: " + daysLeft + "日");
        console.log("今日使えるお金: " + availableToday + "円");
        console.log("今週使えるお金: " + availableThisWeek + "円");
        
        // ※実際にはここで document.getElementById('today-money').innerText = availableToday; 
        // のようにしてHTML（画面）に数字を表示させます。
    } else {
        console.log("保存されたデータがありません。");
    }
}

// テスト実行：まずはデータを保存し、そのあとに読み込んで計算する
saveData();
loadAndCalculate();