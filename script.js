// --- 1. データ構造の初期化 ---
let walletData = JSON.parse(localStorage.getItem('ore_wallet_pro_wallet')) || {
    bank: 0, cash: 0, paypay: 0, hidden: 0, cardRequest: 0
};

let fixedCosts = JSON.parse(localStorage.getItem('ore_wallet_pro_fixed')) || [
    { id: 1, name: "Wi-Fi代", amount: 4000 },
    { id: 2, name: "スマホ代", amount: 4500 }
];

let planItems = JSON.parse(localStorage.getItem('ore_wallet_pro_plans')) || [];
let historyLogs = JSON.parse(localStorage.getItem('ore_wallet_pro_history')) || [];

// フォーム入力の一時保存用（予測追加画面）
let currentPlanType = 'income';
let currentPlanAsset = 'cash';
let currentAdjustingPlanId = null;

// カレンダーの表示月
let calendarViewDate = new Date();

window.onload = function() {
    initApp();
};

function initApp() {
    displayHeaderDate();
    loadWalletInputs();
    renderFixedCosts();
    renderPlans();
    renderHistory();
    checkOverduePlans();
    calculateBudget();
    renderCalendar();
    setDefaultDateInForm();
}

function displayHeaderDate() {
    const today = new Date();
    document.getElementById('header-date').innerText = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
}

function setDefaultDateInForm() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('plan-date').value = `${yyyy}-${mm}-${dd}`;
}

// ページ切り替え
function switchPage(pageId, button) {
    document.querySelectorAll('.app-page').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(`page-${pageId}`).classList.add('active');
    button.classList.add('active');
    
    calculateBudget();
    if (pageId === 'plans') renderPlans();
    if (pageId === 'calendar') renderCalendar();
    if (pageId === 'history') renderHistory();
    checkOverduePlans();
}

// --- 2. クイック出費記録ロジック (1タップで即反映) ---
function addQuickExpense(method) {
    const amountInput = document.getElementById('quick-amount');
    const amount = Number(amountInput.value);
    if (!amount || amount <= 0) return alert("金額を入力してください");

    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    
    let logTitle = "";
    
    if (method === 'cash') {
        walletData.cash -= amount;
        logTitle = "クイック出費 (現金)";
    } else if (method === 'paypay') {
        walletData.paypay -= amount;
        logTitle = "クイック出費 (PayPay)";
    } else if (method === 'debit') {
        walletData.bank -= amount; // デビットは銀行残高を減らす
        logTitle = "クイック出費 (デビット/銀行)";
    } else if (method === 'card') {
        walletData.cardRequest += amount; // カードは請求額に加算
        logTitle = "クイック出費 (カード加算)";
    }

    // 履歴（5ページ目用）に追加
    historyLogs.unshift({
        id: Date.now(),
        date: dateStr,
        name: logTitle,
        type: 'expense',
        amount: amount,
        asset: method === 'debit' ? 'bank' : method
    });

    saveToStorage();
    loadWalletInputs();
    calculateBudget();
    amountInput.value = "";
    alert(`${logTitle}として ¥${amount} を反映しました！`);
}

// --- 3. 残高・固定費・カード逆算ロジック ---
function loadWalletInputs() {
    document.getElementById('asset-bank').value = walletData.bank;
    document.getElementById('asset-cash').value = walletData.cash;
    document.getElementById('asset-paypay').value = walletData.paypay;
    document.getElementById('asset-hidden').value = walletData.hidden;
    document.getElementById('card-calc-amount').innerText = `¥${walletData.cardRequest.toLocaleString()}`;
    
    // カード支払いラベルの更新（当月・翌月27日）
    const today = new Date();
    let paymentMonth = today.getMonth() + 2; // 基本は翌月27日
    if (paymentMonth > 12) paymentMonth -= 12;
    document.getElementById('card-payment-label').innerText = `${paymentMonth}月27日 支払い分請求額`;
}

function updateWalletData() {
    walletData.bank = Number(document.getElementById('asset-bank').value) || 0;
    walletData.cash = Number(document.getElementById('asset-cash').value) || 0;
    walletData.paypay = Number(document.getElementById('asset-paypay').value) || 0;
    walletData.hidden = Number(document.getElementById('asset-hidden').value) || 0;
    saveToStorage();
    calculateBudget();
}

// カード請求額の逆算帳尻合わせ
function adjustCardAmount() {
    const actualInput = document.getElementById('actual-card-input');
    const actualAmount = Number(actualInput.value);
    if (actualInput.value === "" || actualAmount < 0) return alert("正しい請求額を入力してください");

    // 差額を計算（実際の請求額 - アプリが計算した額）
    const difference = actualAmount - walletData.cardRequest;
    
    if (difference !== 0) {
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
        
        // 気づかなかった差額を出費履歴として記録
        historyLogs.unshift({
            id: Date.now(),
            date: dateStr,
            name: `カード請求差額調整 (${difference > 0 ? '未認識の出費' : '重複・過剰分戻し'})`,
            type: difference > 0 ? 'expense' : 'income',
            amount: Math.abs(difference),
            asset: 'card'
        });
    }

    // アプリの請求額を実際の額に上書き更新
    walletData.cardRequest = actualAmount;
    saveToStorage();
    loadWalletInputs();
    calculateBudget();
    actualInput.value = "";
    alert(`カード請求額を ¥${actualAmount.toLocaleString()} に合わせました。差額 ¥${difference.toLocaleString()} を履歴に記録しました。`);
}

// 固定費の動的追加・削除
function addFixedCost() {
    const nameInput = document.getElementById('new-fixed-name');
    const amtInput = document.getElementById('new-fixed-amount');
    const name = nameInput.value;
    const amount = Number(amtInput.value);

    if (!name || !amount) return alert("項目名と金額を入力してください");

    fixedCosts.push({ id: Date.now(), name: name, amount: amount });
    saveToStorage();
    renderFixedCosts();
    calculateBudget();
    nameInput.value = "";
    amtInput.value = "";
}

function deleteFixedCost(id) {
    fixedCosts = fixedCosts.filter(item => item.id !== id);
    saveToStorage();
    renderFixedCosts();
    calculateBudget();
}

function renderFixedCosts() {
    const container = document.getElementById('fixed-costs-list');
    container.innerHTML = "";
    fixedCosts.forEach(item => {
        const div = document.createElement('div');
        div.className = "fixed-item";
        div.innerHTML = `
            <span class="name">${item.name}</span>
            <div class="plan-action">
                <span class="plan-amount expense">¥${item.amount.toLocaleString()}</span>
                <button class="btn btn-sm" style="background:var(--danger);" onclick="deleteFixedCost(${item.id})">削除</button>
            </div>
        `;
        container.appendChild(div);
    });
}

// --- 4. 予測・帳尻合わせ・通知欄ロジック ---
function setPlanType(type) {
    currentPlanType = type;
    document.getElementById('btn-type-income').classList.toggle('active', type === 'income');
    document.getElementById('btn-type-expense').classList.toggle('active', type === 'expense');
}

function setPlanAsset(asset) {
    currentPlanAsset = asset;
    ['cash', 'bank', 'paypay', 'card'].forEach(a => {
        document.getElementById(`btn-asset-${a}`).classList.toggle('active', a === asset);
    });
}

function savePlanItem() {
    const name = document.getElementById('plan-name').value;
    const date = document.getElementById('plan-date').value;
    const amount = Number(document.getElementById('plan-amount-input').value);
    const editId = document.getElementById('edit-plan-id').value;

    if (!name || !date || !amount) return alert("項目名、日付、金額を入力してください");

    if (editId) {
        // 編集モード
        const item = planItems.find(p => p.id == editId);
        if (item) {
            item.name = name;
            item.date = date;
            item.type = currentPlanType;
            item.amount = amount;
            item.asset = currentPlanAsset;
        }
        document.getElementById('plan-form-title').innerText = "新しい予測（予定）の追加";
        document.getElementById('btn-submit-plan').innerText = "予定を追加";
        document.getElementById('btn-cancel-edit-plan').style.display = "none";
        document.getElementById('edit-plan-id').value = "";
    } else {
        // 新規追加
        planItems.push({
            id: Date.now(), name: name, date: date, type: currentPlanType, amount: amount, asset: currentPlanAsset, isCompleted: false
        });
    }

    saveToStorage();
    renderPlans();
    calculateBudget();
    checkOverduePlans();
    
    document.getElementById('plan-name').value = "";
    document.getElementById('plan-amount-input').value = "";
    setDefaultDateInForm();
}

function editPlanItem(id) {
    const item = planItems.find(p => p.id == id);
    if (!item) return;

    document.getElementById('edit-plan-id').value = item.id;
    document.getElementById('plan-name').value = item.name;
    document.getElementById('plan-date').value = item.date;
    document.getElementById('plan-amount-input').value = item.amount;
    
    setPlanType(item.type);
    setPlanAsset(item.asset);

    document.getElementById('plan-form-title').innerText = "📝 予測（予定）の編集";
    document.getElementById('btn-submit-plan').innerText = "変更を保存";
    document.getElementById('btn-cancel-edit-plan').style.display = "inline-block";
    document.getElementById('page-plans').scrollIntoView({ behavior: 'smooth' });
}

function cancelPlanEdit() {
    document.getElementById('plan-form-title').innerText = "新しい予測（予定）の追加";
    document.getElementById('btn-submit-plan').innerText = "予定を追加";
    document.getElementById('btn-cancel-edit-plan').style.display = "none";
    document.getElementById('edit-plan-id').value = "";
    document.getElementById('plan-name').value = "";
    document.getElementById('plan-amount-input').value = "";
    setDefaultDateInForm();
}

function deletePlanItem(id) {
    planItems = planItems.filter(item => item.id !== id);
    saveToStorage();
    renderPlans();
    calculateBudget();
    checkOverduePlans();
}

// 未完了予定のリスト描画
function renderPlans() {
    const container = document.getElementById('plans-list-container');
    container.innerHTML = "";
    
    // 未来または未完了の予定を日付順にソート
    const activePlans = planItems.filter(item => !item.isCompleted).sort((a,b) => new Date(a.date) - new Date(b.date));

    if (activePlans.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--text-muted); font-size:0.85rem;">未完了の予測はありません</p>`;
        return;
    }

    activePlans.forEach(item => {
        const div = document.createElement('div');
        div.className = "plan-item";
        const sign = item.type === 'income' ? '＋' : '－';
        const amtClass = item.type === 'income' ? 'income' : 'expense';
        const assetLabel = getAssetLabel(item.asset);

        div.innerHTML = `
            <div class="plan-info">
                <div class="name">${item.name} <span style="font-size:0.7rem; background:#edf2f7; padding:2px 4px; border-radius:4px;">${assetLabel}</span></div>
                <div class="details">予定日: ${item.date}</div>
            </div>
            <div class="plan-action">
                <span class="plan-amount ${amtClass}">${sign}¥${item.amount.toLocaleString()}</span>
                <button class="btn btn-sm btn-success" onclick="openAdjustPanel(${item.id}, ${item.amount})">確定</button>
                <button class="btn btn-sm" style="background:#4a5568;" onclick="editPlanItem(${item.id})">編</button>
                <button class="btn btn-sm" style="background:var(--danger);" onclick="deletePlanItem(${item.id})">削</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function openAdjustPanel(id, defaultAmount) {
    currentAdjustingPlanId = id;
    document.getElementById('adjust-actual-amount').value = defaultAmount;
    document.getElementById('adjust-panel').style.display = "block";
    document.getElementById('adjust-panel').scrollIntoView({ behavior: 'smooth' });
    document.getElementById('adjust-confirm-btn').onclick = confirmPlanCompletion;
}

function closeAdjustPanel() {
    document.getElementById('adjust-panel').style.display = "none";
    currentAdjustingPlanId = null;
}

// 予測の実績化（帳尻合わせ確定）
function confirmPlanCompletion() {
    const actualAmount = Number(document.getElementById('adjust-actual-amount').value);
    const item = planItems.find(p => p.id === currentAdjustingPlanId);
    if (!item) return;

    // 実績を実際の財布に反映
    if (item.type === 'income') {
        if(item.asset === 'card') walletData.cardRequest -= actualAmount; // カードに収入反映なら請求から引く
        else walletData[item.asset] += actualAmount;
    } else {
        if(item.asset === 'card') walletData.cardRequest += actualAmount; // カード出費確定なら請求に足す
        else walletData[item.asset] -= actualAmount;
    }

    item.isCompleted = true;

    // 履歴ログへも流す
    historyLogs.unshift({
        id: Date.now(),
        date: item.date,
        name: `[確定] ${item.name}`,
        type: item.type,
        amount: actualAmount,
        asset: item.asset
    });

    saveToStorage();
    loadWalletInputs();
    renderPlans();
    calculateBudget();
    checkOverduePlans();
    closeAdjustPanel();
    alert(`「${item.name}」を金額 ¥${actualAmount.toLocaleString()} で確定反映しました。`);
}

// 🔔 通知欄ロジック（予定日を過ぎて未確定のものを集める）
function checkOverduePlans() {
    const alertBox = document.getElementById('notification-alert');
    const listContainer = document.getElementById('notification-list');
    listContainer.innerHTML = "";

    const todayStr = new Date().toISOString().split('T')[0];
    const overdueItems = planItems.filter(item => !item.isCompleted && item.date < todayStr);

    if (overdueItems.length === 0) {
        alertBox.style.display = "none";
        return;
    }

    alertBox.style.display = "block";
    overdueItems.forEach(item => {
        const div = document.createElement('div');
        div.className = "notification-item";
        div.innerHTML = `
            <span>📅 ${item.date} - ${item.name} (¥${item.amount.toLocaleString()})</span>
            <button class="btn btn-sm btn-success" style="padding:2px 6px; font-size:0.7rem;" onclick="switchPage('plans', document.querySelectorAll('.nav-item')[2]); openAdjustPanel(${item.id}, ${item.amount});">今すぐ確定</button>
        `;
        listContainer.appendChild(div);
    });
}

// --- 5. 今日の予算コア計算 (金〜木・末締め対応) ---
function calculateBudget() {
    const totalAssets = walletData.bank + walletData.cash + walletData.paypay + walletData.hidden;
    const fixedCostTotal = fixedCosts.reduce((sum, item) => sum + item.amount, 0);
    const totalDebts = walletData.cardRequest + fixedCostTotal;

    // 未完了の予測を集計
    let pendingIncome = 0;
    let pendingExpense = 0;
    planItems.forEach(item => {
        if (!item.isCompleted) {
            if (item.type === 'income') pendingIncome += item.amount;
            else pendingExpense += item.amount;
        }
    });

    // 今月自由に使えるお金（月末締めシミュレーション）
    const availableThisMonth = (totalAssets + pendingIncome) - (totalDebts + pendingExpense);

    // 残り日数の計算
    const today = new Date();
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const daysLeft = lastDayOfMonth.getDate() - today.getDate() + 1;

    // 今日・今週使えるお金
    const availableToday = daysLeft > 0 ? Math.floor(availableThisMonth / daysLeft) : availableThisMonth;
    
    // 金曜日〜木曜日の計算ロジック
    const currentDay = today.getDay(); // 0:日, 1:月, ..., 5:金, 6:土
    // 直近の金曜日を割り出す
    const distToFri = currentDay >= 5 ? currentDay - 5 : currentDay + 2;
    const friDate = new Date(today);
    friDate.setDate(today.getDate() - distToFri);
    const thuDate = new Date(friDate);
    thuDate.setDate(friDate.getDate() + 6);

    const availableThisWeek = availableToday * 7;

    // 画面表示へ反映
    document.getElementById('calc-month').innerText = `¥${availableThisMonth.toLocaleString()}`;
    document.getElementById('calc-today').innerText = `¥${availableToday.toLocaleString()}`;
    document.getElementById('calc-week').innerText = `¥${availableThisWeek.toLocaleString()}`;
    document.getElementById('days-left').innerText = daysLeft;

    // 日付ラベルの更新
    document.getElementById('label-today-date').innerText = `(${today.getMonth()+1}/${today.getDate()})`;
    document.getElementById('label-week-range').innerText = `(${friDate.getMonth()+1}/${friDate.getDate()}〜${thuDate.getMonth()+1}/${thuDate.getDate()})`;
    document.getElementById('label-month-date').innerText = `(${lastDayOfMonth.getMonth()+1}/${lastDayOfMonth.getDate()}締)`;
}

// --- 6. 4ページ目：カレンダーロジック ---
function changeMonth(direction) {
    calendarViewDate.setMonth(calendarViewDate.getMonth() + direction);
    renderCalendar();
}

function renderCalendar() {
    const container = document.getElementById('calendar-grid-body');
    if (!container) return;
    container.innerHTML = "";

    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    document.getElementById('calendar-month-year').innerText = `${year}年${month + 1}月`;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const totalDays = lastDay.getDate();

    // 先月分の埋めマス
    for (let i = startDayOfWeek; i > 0; i--) {
        const prevDate = new Date(year, month, 1 - i);
        createDayCell(prevDate, true, container);
    }

    // 今月分のマス
    let runningTotalCash = walletData.bank + walletData.cash + walletData.paypay + walletData.hidden - walletData.cardRequest - fixedCosts.reduce((sum, item) => sum + item.amount, 0);
    
    // カレンダー用に日々の残高推移を簡易計算するためのベースを作っておく
    for (let d = 1; d <= totalDays; d++) {
        const currDate = new Date(year, month, d);
        createDayCell(currDate, false, container);
    }
}

function createDayCell(date, isOtherMonth, container) {
    const cell = document.createElement('div');
    cell.className = "calendar-day" + (isOtherMonth ? " other-month" : "");
    
    const today = new Date();
    if (!isOtherMonth && date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear()) {
        cell.classList.add('today');
    }

    const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    
    // その日の予定を検索
    const daysPlans = planItems.filter(p => p.date === dateStr && !p.isCompleted);
    let dayInc = 0;
    let dayExp = 0;
    daysPlans.forEach(p => {
        if (p.type === 'income') dayInc += p.amount;
        else dayExp += p.amount;
    });

    let html = `<div class="day-num">${date.getDate()}</div>`;
    
    if (dayInc > 0) html += `<div class="cal-amt inc">＋${dayInc.toLocaleString()}</div>`;
    if (dayExp > 0) html += `<div class="cal-amt exp">－${dayExp.toLocaleString()}</div>`;
    
    // 全財産推移（簡易ロジックとして予定がある日のみ未来の変動を表示）
    if (dayInc > 0 || dayExp > 0) {
        // ※高度な日次財産追跡の簡易表示
        html += `<div class="cal-amt total">予有</div>`;
    }

    cell.innerHTML = html;
    container.appendChild(cell);
}

// --- 7. 5ページ目：全履歴・完全編集ロジック ---
function renderHistory() {
    const container = document.getElementById('history-list-container');
    if (!container) return;
    container.innerHTML = "";

    if (historyLogs.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--text-muted); font-size:0.85rem; padding:20px;">記録された履歴はまだありません</p>`;
        return;
    }

    historyLogs.forEach((log, index) => {
        const div = document.createElement('div');
        div.className = "card";
        div.style.padding = "10px";
        div.style.marginBottom = "8px";
        
        const sign = log.type === 'income' ? '＋' : '－';
        const amtClass = log.type === 'income' ? 'income' : 'expense';
        
        div.innerHTML = `
            <div style="display:flex; justify-content:between; align-items:center; width:100%;">
                <div style="flex:1;">
                    <div style="font-size:0.85rem; font-weight:700;">${log.name}</div>
                    <div style="font-size:0.7rem; color:var(--text-muted);">${log.date} | 反映先: ${getAssetLabel(log.asset)}</div>
                </div>
                <div style="text-align:right; margin-right:10px;">
                    <span class="plan-amount ${amtClass}" style="font-size:0.95rem;">${sign}¥${log.amount.toLocaleString()}</span>
                </div>
                <div>
                    <button class="btn btn-sm" style="background:var(--danger); padding:4px 6px;" onclick="deleteHistoryItem(${log.id})">削除</button>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

function deleteHistoryItem(id) {
    if(!confirm("この履歴を削除しますか？(※財布の残高は自動では戻りませんので、必要に応じて「残高設定」から手動で調整してください)")) return;
    historyLogs = historyLogs.filter(log => log.id !== id);
    saveToStorage();
    renderHistory();
    calculateBudget();
}

// --- 8. ユーティリティ・共通処理 ---
function getAssetLabel(asset) {
    const labels = { cash: "現金", bank: "銀行/デビット", paypay: "PayPay", card: "カード" };
    return labels[asset] || asset;
}

function saveToStorage() {
    localStorage.setItem('ore_wallet_pro_wallet', JSON.stringify(walletData));
    localStorage.setItem('ore_wallet_pro_fixed', JSON.stringify(fixedCosts));
    localStorage.setItem('ore_wallet_pro_plans', JSON.stringify(planItems));
    localStorage.setItem('ore_wallet_pro_history', JSON.stringify(historyLogs));
}