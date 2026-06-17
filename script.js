// --- 1. データ構造の初期化 ---
let walletData = JSON.parse(localStorage.getItem('ore_wallet_pro_wallet')) || {
    bank: 0, cash: 0, paypay: 0, hidden: 0, cardRequests: {}
};

// データの互換性救済処理
if (typeof walletData.cardRequest === 'number') {
    walletData.cardRequests = {};
    const keys = getCardPaymentKeys();
    walletData.cardRequests[keys.nextKey] = walletData.cardRequest;
    delete walletData.cardRequest;
}
if (!walletData.cardRequests) walletData.cardRequests = {};
if (!walletData.generatedFixedCosts) walletData.generatedFixedCosts = [];

// 固定費マスタ
let fixedCosts = JSON.parse(localStorage.getItem('ore_wallet_pro_fixed')) || [
    { id: 1, name: "Wi-Fi代", amount: 4000, day: 25 },
    { id: 2, name: "スマホ代", amount: 4500, day: 27 }
];

let planItems = JSON.parse(localStorage.getItem('ore_wallet_pro_plans')) || [];
let historyLogs = JSON.parse(localStorage.getItem('ore_wallet_pro_history')) || [];

let currentPlanType = 'income';
let currentPlanAsset = 'cash';
let currentAdjustingPlanId = null;
let calendarViewDate = new Date();

// Safari対策: window.onload ではなく DOMContentLoaded を使用して確実に初期化
document.addEventListener('DOMContentLoaded', function() {
    initApp();
});

function initApp() {
    try {
        generateFixedCostsToPlans(); 
        displayHeaderDate();
        loadWalletInputs();
        renderFixedCostsMaster();
        renderPlans();
        renderHistory();
        checkOverduePlans();
        calculateBudget();
        renderCalendar();
        setDefaultDateInForm();
    } catch (e) {
        console.error("初期化エラー:", e);
    }
}

function displayHeaderDate() {
    const today = new Date();
    document.getElementById('header-date').innerText = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
}

function setDefaultDateInForm() {
    const today = new Date();
    document.getElementById('plan-date').value = today.toISOString().split('T')[0];
}

function getCardPaymentKeys() {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth(); 
    const d = today.getDate();

    let currentPayDate, nextPayDate;

    if (d <= 27) {
        currentPayDate = new Date(y, m, 27);
        nextPayDate = new Date(y, m + 1, 27);
    } else {
        currentPayDate = new Date(y, m + 1, 27);
        nextPayDate = new Date(y, m + 2, 27);
    }

    return {
        currentKey: formatDateToKey(currentPayDate),
        nextKey: formatDateToKey(nextPayDate),
        currentLabel: `${currentPayDate.getMonth() + 1}月27日払い (今月分)`,
        nextLabel: `${nextPayDate.getMonth() + 1}月27日払い (来月分)`
    };
}

function formatDateToKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-27`;
}

function getTargetPaymentKeyForDate(date) {
    const y = date.getFullYear();
    const m = date.getMonth();
    const payDate = new Date(y, m + 1, 27); 
    return formatDateToKey(payDate);
}

function switchPage(pageId, button) {
    document.querySelectorAll('.app-page').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(`page-${pageId}`).classList.add('active');
    button.classList.add('active');
    
    if (pageId === 'wallet') loadWalletInputs();
    if (pageId === 'plans') renderPlans();
    if (pageId === 'calendar') renderCalendar();
    if (pageId === 'history') renderHistory();
    calculateBudget();
    checkOverduePlans();
}

function addQuickExpense(method) {
    const amountInput = document.getElementById('quick-amount');
    const amount = Number(amountInput.value);
    if (!amount || amount <= 0) return alert("金額を入力してください");

    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    let logTitle = "";
    
    if (method === 'cash') {
        walletData.cash -= amount;
        logTitle = "クイック出費 (現金)";
    } else if (method === 'paypay') {
        walletData.paypay -= amount;
        logTitle = "クイック出費 (PayPay)";
    } else if (method === 'debit') {
        walletData.bank -= amount;
        logTitle = "クイック出費 (デビット/銀行)";
    } else if (method === 'card') {
        const targetKey = getTargetPaymentKeyForDate(today);
        walletData.cardRequests[targetKey] = (walletData.cardRequests[targetKey] || 0) + amount;
        const payMonth = new Date(targetKey).getMonth() + 1;
        logTitle = `クイック出費 (カード:${payMonth}/27払に加算)`;
    }

    historyLogs.unshift({
        id: Date.now(),
        date: dateStr,
        name: logTitle,
        type: 'expense',
        amount: amount,
        asset: method === 'debit' ? 'bank' : method
    });

    saveToStorage();
    calculateBudget();
    amountInput.value = "";
    alert(`${logTitle}として ¥${amount.toLocaleString()} を反映しました！`);
}

function loadWalletInputs() {
    document.getElementById('calc-val-bank').innerText = `¥${(walletData.bank || 0).toLocaleString()}`;
    document.getElementById('calc-val-cash').innerText = `¥${(walletData.cash || 0).toLocaleString()}`;
    document.getElementById('calc-val-paypay').innerText = `¥${(walletData.paypay || 0).toLocaleString()}`;
    document.getElementById('calc-val-hidden').innerText = `¥${(walletData.hidden || 0).toLocaleString()}`;

    const cardKeys = getCardPaymentKeys();
    document.getElementById('card-label-current').innerText = cardKeys.currentLabel;
    document.getElementById('card-label-next').innerText = cardKeys.nextLabel;

    const currentCardAmt = walletData.cardRequests[cardKeys.currentKey] || 0;
    const nextCardAmt = walletData.cardRequests[cardKeys.nextKey] || 0;

    document.getElementById('card-calc-current').innerText = `¥${currentCardAmt.toLocaleString()}`;
    document.getElementById('card-calc-next').innerText = `¥${nextCardAmt.toLocaleString()}`;
}

function adjustAssetAmount(assetKey) {
    const input = document.getElementById(`actual-${assetKey}`);
    const actualAmount = Number(input.value);
    if (input.value === "" || actualAmount < 0) return alert("正しい実際の残高を入力してください");

    const calculatedAmount = walletData[assetKey] || 0;
    const difference = actualAmount - calculatedAmount;

    if (difference !== 0) {
        const today = new Date();
        historyLogs.unshift({
            id: Date.now(),
            date: today.toISOString().split('T')[0],
            name: `${getAssetLabel(assetKey)}残高差額調整 (${difference > 0 ? '不明な収入/誤差' : '不明な出費/誤差'})`,
            type: difference > 0 ? 'income' : 'expense',
            amount: Math.abs(difference),
            asset: assetKey
        });
    }

    walletData[assetKey] = actualAmount;
    saveToStorage();
    loadWalletInputs();
    calculateBudget();
    input.value = "";
    alert(`${getAssetLabel(assetKey)}の残高を実際の ¥${actualAmount.toLocaleString()} に合わせました。`);
}

function adjustCardAmount(type) {
    const cardKeys = getCardPaymentKeys();
    const targetKey = type === 'current' ? cardKeys.currentKey : cardKeys.nextKey;
    const labelStr = type === 'current' ? "今月分" : "来月分";

    const input = document.getElementById(`actual-card-${type}`);
    const actualAmount = Number(input.value);
    if (input.value === "" || actualAmount < 0) return alert("正しい請求額を入力してください");

    const calculatedAmount = walletData.cardRequests[targetKey] || 0;
    const difference = actualAmount - calculatedAmount;

    if (difference !== 0) {
        const today = new Date();
        historyLogs.unshift({
            id: Date.now(),
            date: today.toISOString().split('T')[0],
            name: `カード請求差額調整:${labelStr} (${difference > 0 ? '未認識のカード出費' : '重複・過剰分戻し'})`,
            type: difference > 0 ? 'expense' : 'income',
            amount: Math.abs(difference),
            asset: 'card'
        });
    }

    walletData.cardRequests[targetKey] = actualAmount;
    saveToStorage();
    loadWalletInputs();
    calculateBudget();
    input.value = "";
    alert(`${labelStr}のカード請求額を ¥${actualAmount.toLocaleString()} に確定しました。`);
}

function addFixedCostMaster() {
    const nameInput = document.getElementById('new-fixed-name');
    const amtInput = document.getElementById('new-fixed-amount');
    const dayInput = document.getElementById('new-fixed-day');

    const name = nameInput.value;
    const amount = Number(amtInput.value);
    const day = Number(dayInput.value) || 27;

    if (!name || !amount) return alert("項目名と金額を入力してください");

    fixedCosts.push({ id: Date.now(), name: name, amount: amount, day: day });
    saveToStorage();
    generateFixedCostsToPlans();
    renderFixedCostsMaster();
    renderPlans();
    calculateBudget();
    nameInput.value = "";
    amtInput.value = "";
    dayInput.value = "";
}

function deleteFixedCostMaster(id) {
    fixedCosts = fixedCosts.filter(item => item.id !== id);
    saveToStorage();
    renderFixedCostsMaster();
}

function renderFixedCostsMaster() {
    const container = document.getElementById('fixed-costs-list');
    if (!container) return;
    container.innerHTML = "";
    fixedCosts.forEach(item => {
        const div = document.createElement('div');
        div.className = "fixed-item";
        div.innerHTML = `
            <span class="name">${item.name} <span style="font-size:0.7rem; color:var(--text-muted);">(毎月${item.day}日請求)</span></span>
            <div class="plan-action">
                <span class="plan-amount expense">¥${item.amount.toLocaleString()}</span>
                <button class="btn btn-sm" style="background:var(--danger);" onclick="deleteFixedCostMaster(${item.id})">削除</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function generateFixedCostsToPlans() {
    const today = new Date();
    for (let i = -1; i <= 1; i++) {
        const targetDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
        const y = targetDate.getFullYear();
        const m = targetDate.getMonth() + 1;
        const ymStr = `${y}-${String(m).padStart(2, '0')}`;

        fixedCosts.forEach(master => {
            const genKey = `${ymStr}-${master.id}`;
            if (!walletData.generatedFixedCosts.includes(genKey)) {
                const lastDay = new Date(y, m, 0).getDate();
                const actualDay = master.day > lastDay ? lastDay : master.day;
                const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(actualDay).padStart(2, '0')}`;

                planItems.push({
                    id: 'fixed-' + genKey + '-' + Date.now(),
                    name: `[固定費] ${master.name}`,
                    date: dateStr,
                    type: 'expense',
                    amount: master.amount,
                    asset: 'card', 
                    isCompleted: false,
                    isFixed: true,
                    genKey: genKey
                });
                walletData.generatedFixedCosts.push(genKey);
            }
        });
    }
    saveToStorage();
}

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
        planItems.push({
            id: 'plan-' + Date.now(), name: name, date: date, type: currentPlanType, amount: amount, asset: currentPlanAsset, isCompleted: false
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

    document.getElementById('plan-form-title').innerText = "📝 予測・固定費の月別調整";
    document.getElementById('btn-submit-plan').innerText = "今月分の変更を保存";
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

function renderPlans() {
    const container = document.getElementById('plans-list-container');
    if (!container) return;
    container.innerHTML = "";
    
    // Safari対策: ハイフンをスラッシュに置換して日付順ソート
    const activePlans = planItems.filter(item => !item.isCompleted).sort((a,b) => {
        return new Date(a.date.replace(/-/g, '/')) - new Date(b.date.replace(/-/g, '/'));
    });

    if (activePlans.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--text-muted); font-size:0.85rem;">未完了の予測はありません</p>`;
        return;
    }

    const groups = {};
    activePlans.forEach(item => {
        const d = new Date(item.date.replace(/-/g, '/'));
        const key = `${d.getFullYear()}年${d.getMonth() + 1}月`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
    });

    for (const monthLabel in groups) {
        const header = document.createElement('div');
        header.className = "month-group-header";
        header.innerText = monthLabel;
        container.appendChild(header);

        groups[monthLabel].forEach(item => {
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
                    <button class="btn btn-sm btn-success" onclick="openAdjustPanel('${item.id}', ${item.amount})">確定</button>
                    <button class="btn btn-sm" style="background:#4a5568;" onclick="editPlanItem('${item.id}')">編</button>
                    <button class="btn btn-sm" style="background:var(--danger);" onclick="deletePlanItem('${item.id}')">削</button>
                </div>
            `;
            container.appendChild(div);
        });
    }
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

function confirmPlanCompletion() {
    const actualAmount = Number(document.getElementById('adjust-actual-amount').value);
    const item = planItems.find(p => p.id === currentAdjustingPlanId);
    if (!item) return;

    if (item.type === 'income') {
        if (item.asset === 'card') {
            const targetKey = getTargetPaymentKeyForDate(new Date(item.date.replace(/-/g, '/')));
            walletData.cardRequests[targetKey] = (walletData.cardRequests[targetKey] || 0) - actualAmount;
        } else {
            walletData[item.asset] = (walletData[item.asset] || 0) + actualAmount;
        }
    } else {
        if (item.asset === 'card') {
            const targetKey = getTargetPaymentKeyForDate(new Date(item.date.replace(/-/g, '/')));
            walletData.cardRequests[targetKey] = (walletData.cardRequests[targetKey] || 0) + actualAmount;
        } else {
            walletData[item.asset] = (walletData[item.asset] || 0) - actualAmount;
        }
    }

    item.isCompleted = true;

    historyLogs.unshift({
        id: Date.now(),
        date: item.date,
        name: `[確定] ${item.name}`,
        type: item.type,
        amount: actualAmount,
        asset: item.asset
    });

    saveToStorage();
    renderPlans();
    calculateBudget();
    checkOverduePlans();
    closeAdjustPanel();
    alert(`「${item.name}」を金額 ¥${actualAmount.toLocaleString()} で確定反映しました。`);
}

function checkOverduePlans() {
    const alertBox = document.getElementById('notification-alert');
    const listContainer = document.getElementById('notification-list');
    if (!alertBox || !listContainer) return;
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
            <button class="btn btn-sm btn-success" style="padding:2px 6px; font-size:0.7rem;" onclick="switchPage('plans', document.querySelectorAll('.nav-item')[2]); openAdjustPanel('${item.id}', ${item.amount});">今すぐ確定</button>
        `;
        listContainer.appendChild(div);
    });
}

function calculateBudget() {
    const totalAssets = (walletData.bank || 0) + (walletData.cash || 0) + (walletData.paypay || 0) + (walletData.hidden || 0);
    
    let pendingIncome = 0;
    let pendingExpense = 0;
    planItems.forEach(item => {
        if (!item.isCompleted) {
            if (item.type === 'income') pendingIncome += item.amount;
            else pendingExpense += item.amount;
        }
    });

    let totalCardDebt = 0;
    for (const key in walletData.cardRequests) {
        totalCardDebt += walletData.cardRequests[key] || 0;
    }

    const availableThisMonth = (totalAssets + pendingIncome) - (totalCardDebt + pendingExpense);

    const today = new Date();
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const daysLeft = lastDayOfMonth.getDate() - today.getDate() + 1;

    const availableToday = daysLeft > 0 ? Math.floor(availableThisMonth / daysLeft) : availableThisMonth;
    
    const currentDay = today.getDay(); 
    const distToFri = currentDay >= 5 ? currentDay - 5 : currentDay + 2;
    const friDate = new Date(today);
    friDate.setDate(today.getDate() - distToFri);
    const thuDate = new Date(friDate);
    thuDate.setDate(friDate.getDate() + 6);

    const availableThisWeek = availableToday * 7;

    document.getElementById('calc-month').innerText = `¥${availableThisMonth.toLocaleString()}`;
    document.getElementById('calc-today').innerText = `¥${availableToday.toLocaleString()}`;
    document.getElementById('calc-week').innerText = `¥${availableThisWeek.toLocaleString()}`;
    document.getElementById('days-left').innerText = daysLeft;

    document.getElementById('label-today-date').innerText = `(${today.getMonth()+1}/${today.getDate()})`;
    document.getElementById('label-week-range').innerText = `(${friDate.getMonth()+1}/${friDate.getDate()}〜${thuDate.getMonth()+1}/${thuDate.getDate()})`;
    document.getElementById('label-month-date').innerText = `(${lastDayOfMonth.getMonth()+1}/${lastDayOfMonth.getDate()}締)`;
}

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

    // 前月分の穴埋め
    for (let i = startDayOfWeek; i > 0; i--) {
        const prevDate = new Date(year, month, 1 - i);
        createDayCell(prevDate, true, container);
    }

    // 当月分の日付
    for (let d = 1; d <= totalDays; d++) {
        const currDate = new Date(year, month, d);
        createDayCell(currDate, false, container);
    }
}

function createDayCell(date, isOtherMonth, container) {
    const cell = document.createElement('div');
    cell.className = "calendar-day" + (isOtherMonth ? " other-month" : "");
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);

    // 今日と同じ日付ならtodayクラスを付与
    if (!isOtherMonth && compareDate.getTime() === today.getTime()) {
        cell.classList.add('today');
    }

    // --- 🛠️【新ロジック】その日の予想残高（持ってるお金）の計算 ---
    // 1. スタート地点：現在の実質総資産（財布・口座の合計から、カード確定負債を引いた自由に使えるお金）
    let totalCardDebt = 0;
    for (const key in walletData.cardRequests) {
        totalCardDebt += walletData.cardRequests[key] || 0;
    }
    let currentAssets = (walletData.bank || 0) + (walletData.cash || 0) + (walletData.paypay || 0) + (walletData.hidden || 0) - totalCardDebt;

    // 2. 未来の日付の場合、今日からその日までの「未完了の予定」をすべてシミュレーションして足し引きする
    if (compareDate >= today) {
        let estimatedChange = 0;
        planItems.forEach(item => {
            if (!item.isCompleted) {
                const itemDate = new Date(item.date.replace(/-/g, '/'));
                itemDate.setHours(0, 0, 0, 0);
                
                // 「今日以降」かつ「カレンダーのこの日以下」の予定を対象に集計
                if (itemDate >= today && itemDate <= compareDate) {
                    if (item.type === 'income') {
                        estimatedChange += item.amount;
                    } else {
                        estimatedChange -= item.amount;
                    }
                }
            }
        });
        currentAssets += estimatedChange;
    }

    // --- 画面への表示処理 ---
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    // その日に未完了の予定があるかチェック（目印用）
    const hasPlan = planItems.some(p => p.date === dateStr && !p.isCompleted);

    // 残高がマイナスなら赤字、プラスなら通常色にする設定
    const amtColor = currentAssets >= 0 ? 'var(--text-main, #2d3748)' : 'var(--danger, #e53e3e)';

    let html = `
        <div class="day-num">${date.getDate()}</div>
        <div class="cal-amt total" style="font-size: 0.75rem; color: ${amtColor}; font-weight: bold; text-align: center; margin-top: 4px;">
            ¥${currentAssets.toLocaleString()}
        </div>
    `;
    
    // 予定がある日は、金額の下に小さなドットなどを出して視覚的に分かりやすくする
    if (hasPlan) {
        html += `<div style="font-size: 0.55rem; color: #3182ce; text-align: center; margin-top: 2px;">● 予定あり</div>`;
    }

    cell.innerHTML = html;
    container.appendChild(cell);
}

function renderHistory() {
    const container = document.getElementById('history-list-container');
    if (!container) return;
    container.innerHTML = "";

    if (historyLogs.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--text-muted); font-size:0.85rem; padding:20px;">記録された履歴はまだありません</p>`;
        return;
    }

    historyLogs.forEach((log) => {
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
                    <div style="font-size:0.7rem; color:var(--text-muted);">${log.date} | 反映: ${getAssetLabel(log.asset)}</div>
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
    if(!confirm("この履歴を削除しますか？(※財布残高は自動戻りしません)")) return;
    historyLogs = historyLogs.filter(log => log.id !== id);
    saveToStorage();
    renderHistory();
    calculateBudget();
}

function getAssetLabel(asset) {
    const labels = { cash: "現金", bank: "銀行/デビット", paypay: "PayPay", hidden: "隠し金", card: "カード" };
    return labels[asset] || asset;
}

function saveToStorage() {
    localStorage.setItem('ore_wallet_pro_wallet', JSON.stringify(walletData));
    localStorage.setItem('ore_wallet_pro_fixed', JSON.stringify(fixedCosts));
    localStorage.setItem('ore_wallet_pro_plans', JSON.stringify(planItems));
    localStorage.setItem('ore_wallet_pro_history', JSON.stringify(historyLogs));
}