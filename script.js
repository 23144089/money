// --- 1. データ構造の初期化 ---
let walletData = JSON.parse(localStorage.getItem('ore_wallet_pro_wallet')) || {
    bank: 0, cash: 0, paypay: 0, pasmo: 0, hidden: 0, cardRequests: {},
    simulationEndDate: null // 追加：手動設定用のシミュレーション終了日
};

// デバッグログ用
function debugLog(msg) {
    console.log(msg);
    const consoleEl = document.getElementById('debug-console');
    if (consoleEl) {
        // consoleEl.style.display = 'block'; // 必要なら表示
        const time = new Date().toLocaleTimeString();
        consoleEl.innerHTML = `<div>[${time}] ${msg}</div>` + consoleEl.innerHTML;
        if (consoleEl.children.length > 20) consoleEl.lastElementChild.remove();
    }
}

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
    { id: 1, name: "Wi-Fi代", amount: 4000, day: 25, type: 'expense' },
    { id: 2, name: "スマホ代", amount: 4500, day: 27, type: 'expense' },
    { id: 3, name: "仕送り", amount: 50000, day: 25, type: 'income' }
];

// データの正規化: 既存データにtypeがない場合はexpenseとする
fixedCosts.forEach(item => {
    if (!item.type) item.type = 'expense';
});

let planItems = JSON.parse(localStorage.getItem('ore_wallet_pro_plans')) || [];
let historyLogs = JSON.parse(localStorage.getItem('ore_wallet_pro_history')) || [];

let currentPlanType = 'income';
let currentPlanAsset = 'cash';
let currentFixedType = 'expense'; // 追加: 固定費マスタ用のタイプ
let currentAdjustingPlanId = null;
let calendarViewDate = new Date();

// トースト通知を表示する関数
function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerText = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

// Safari対策: DOMContentLoaded を使用して確実に初期化
document.addEventListener('DOMContentLoaded', function() {
    initApp();
});

function initApp() {
    // Safari対策: すべてのグローバル関数を明示的にwindowに紐付ける
    window.switchPage = switchPage;
    window.addQuickExpense = addQuickExpense;
    window.adjustAssetAmount = adjustAssetAmount;
    window.adjustCardAmount = adjustCardAmount;
    window.setFixedType = setFixedType;
    window.addFixedCostMaster = addFixedCostMaster;
    window.deleteFixedCostMaster = deleteFixedCostMaster;
    window.setPlanType = setPlanType;
    window.setPlanAsset = setPlanAsset;
    window.savePlanItem = savePlanItem;
    window.cancelPlanEdit = cancelPlanEdit;
    window.editPlanItem = editPlanItem;
    window.deletePlanItem = deletePlanItem;
    window.completePlanDirectly = completePlanDirectly;
    window.closeAdjustPanel = closeAdjustPanel;
    window.confirmPlanCompletion = confirmPlanCompletion;
    window.setSimulationEndDate = setSimulationEndDate;
    window.clearSimulationEndDate = clearSimulationEndDate;
    window.changeMonth = changeMonth;
    window.deleteHistoryItem = deleteHistoryItem;

    // ヘッダー（OreBudgetロゴ）を5回タップでデバッグコンソール表示
    const headerTitle = document.querySelector('header h1');
    if (headerTitle) {
        let debugTapCount = 0;
        headerTitle.addEventListener('click', () => {
            debugTapCount++;
            if (debugTapCount >= 5) {
                const dc = document.getElementById('debug-console');
                if (dc) dc.style.display = (dc.style.display === 'block') ? 'none' : 'block';
                showToast("Debug Mode Toggle");
            }
        });
    }

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

function getCardKeyForPlan(item) {
    const d = new Date(item.date.replace(/-/g, '/'));
    const y = d.getFullYear();
    const m = d.getMonth(); 

    if (item.isFixed || (item.name && item.name.includes('[固定費]'))) {
        return `${y}-${String(m + 1).padStart(2, '0')}-27`;
    } else {
        const nextDate = new Date(y, m + 1, 27);
        return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-27`;
    }
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
    if (!amount || amount <= 0) return showToast("金額を入力してください");

    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    let logTitle = "";
    let logAsset = method;
    let undoData = {}; 
    
    if (method === 'cash') {
        walletData.cash -= amount;
        logTitle = "クイック出費 (現金)";
        undoData = { cash: amount };
    } else if (method === 'paypay') {
        walletData.paypay -= amount;
        logTitle = "クイック出費 (PayPay)";
        undoData = { paypay: amount };
    } else if (method === 'debit') {
        walletData.bank -= amount;
        logTitle = "クイック出費 (デビット/銀行)";
        undoData = { bank: amount };
    } else if (method === 'card') {
        const cardKeys = getCardPaymentKeys();
        const targetKey = cardKeys.nextKey;
        walletData.cardRequests[targetKey] = (walletData.cardRequests[targetKey] || 0) + amount;
        const payMonth = new Date(targetKey.replace(/-/g, '/')).getMonth() + 1;
        logTitle = `クイック出費 (カード:${payMonth}/27払に加算)`;
        undoData = { cardRequests: { [targetKey]: -amount } };
    } else if (method === 'pasmo_charge') {
        // 🛠️ 修正：PASMOチャージをカード引き落とし連動に変更
        const cardKeys = getCardPaymentKeys();
        const targetKey = cardKeys.nextKey; // 次回支払い分のカードキー
        
        walletData.cardRequests[targetKey] = (walletData.cardRequests[targetKey] || 0) + amount; // カード請求を増やす
        walletData.pasmo = (walletData.pasmo || 0) + amount; // PASMO残高を増やす
        
        const payMonth = new Date(targetKey.replace(/-/g, '/')).getMonth() + 1;
        logTitle = `PASMO入金 (カード:${payMonth}/27払からチャージ)`;
        logAsset = 'pasmo';
        undoData = { cardRequests: { [targetKey]: -amount }, pasmo: -amount }; // 削除時はカード請求を減らし、PASMOも減らす
    } else if (method === 'pasmo_transit') {
        walletData.pasmo = (walletData.pasmo || 0) - amount;
        logTitle = "交通費 (PASMO)";
        logAsset = 'pasmo';
        undoData = { pasmo: amount };
    }

    historyLogs.unshift({
        id: Date.now(),
        date: dateStr,
        name: logTitle,
        type: method === 'pasmo_charge' ? 'income' : 'expense', // チャージ自体はPASMO視点で収入扱い
        amount: amount,
        asset: logAsset === 'debit' ? 'bank' : logAsset,
        undoData: undoData 
    });

    saveToStorage();
    calculateBudget();
    renderCalendar();
    amountInput.value = "";
    showToast(`${logTitle} ¥${amount.toLocaleString()} 反映`);
}

function loadWalletInputs() {
    if (document.getElementById('calc-val-bank')) document.getElementById('calc-val-bank').innerText = `¥${(walletData.bank || 0).toLocaleString()}`;
    if (document.getElementById('calc-val-cash')) document.getElementById('calc-val-cash').innerText = `¥${(walletData.cash || 0).toLocaleString()}`;
    if (document.getElementById('calc-val-paypay')) document.getElementById('calc-val-paypay').innerText = `¥${(walletData.paypay || 0).toLocaleString()}`;
    if (document.getElementById('calc-val-pasmo')) document.getElementById('calc-val-pasmo').innerText = `¥${(walletData.pasmo || 0).toLocaleString()}`;
    if (document.getElementById('calc-val-hidden')) document.getElementById('calc-val-hidden').innerText = `¥${(walletData.hidden || 0).toLocaleString()}`;

    const cardKeys = getCardPaymentKeys();
    if (document.getElementById('card-label-current')) document.getElementById('card-label-current').innerText = cardKeys.currentLabel;
    if (document.getElementById('card-label-next')) document.getElementById('card-label-next').innerText = cardKeys.nextLabel;

    const currentCardAmt = walletData.cardRequests[cardKeys.currentKey] || 0;
    const nextCardAmt = walletData.cardRequests[cardKeys.nextKey] || 0;

    if (document.getElementById('card-calc-current')) document.getElementById('card-calc-current').innerText = `¥${currentCardAmt.toLocaleString()}`;
    if (document.getElementById('card-calc-next')) document.getElementById('card-calc-next').innerText = `¥${nextCardAmt.toLocaleString()}`;
}

function adjustAssetAmount(assetKey) {
    const input = document.getElementById(`actual-${assetKey}`);
    const actualAmount = Number(input.value);
    if (input.value === "" || actualAmount < 0) return showToast("正しい残高を入力してください");

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
            asset: assetKey,
            undoData: { [assetKey]: -difference } 
        });
    }

    walletData[assetKey] = actualAmount;
    saveToStorage();
    loadWalletInputs();
    calculateBudget();
    renderCalendar();
    input.value = "";
    showToast(`${getAssetLabel(assetKey)}残高を調整しました`);
}

function adjustCardAmount(type) {
    const cardKeys = getCardPaymentKeys();
    const targetKey = type === 'current' ? cardKeys.currentKey : cardKeys.nextKey;
    const labelStr = type === 'current' ? "今月分" : "来月分";

    const input = document.getElementById(`actual-card-${type}`);
    const actualAmount = Number(input.value);
    if (input.value === "" || actualAmount < 0) return showToast("正しい請求額を入力してください");

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
            asset: 'card',
            undoData: { cardRequests: { [targetKey]: -difference } } 
        });
    }

    walletData.cardRequests[targetKey] = actualAmount;
    saveToStorage();
    loadWalletInputs();
    calculateBudget();
    renderCalendar();
    input.value = "";
    showToast(`${labelStr}カード請求額を確定しました`);
}

function setFixedType(type) {
    currentFixedType = type;
    document.getElementById('btn-fixed-type-income').classList.toggle('active', type === 'income');
    document.getElementById('btn-fixed-type-expense').classList.toggle('active', type === 'expense');
}

function addFixedCostMaster() {
    const nameInput = document.getElementById('new-fixed-name');
    const amtInput = document.getElementById('new-fixed-amount');
    const dayInput = document.getElementById('new-fixed-day');

    const name = nameInput.value;
    const amount = Number(amtInput.value);
    const day = Number(dayInput.value) || 27;

    if (!name || !amount) return showToast("項目名と金額を入力してください");

    fixedCosts.push({ 
        id: Date.now(), 
        name: name, 
        amount: amount, 
        day: day,
        type: currentFixedType 
    });
    saveToStorage();
    generateFixedCostsToPlans();
    renderFixedCostsMaster();
    renderPlans();
    calculateBudget();
    renderCalendar();
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
        const typeLabel = item.type === 'income' ? '<span style="color:var(--success); font-size:0.7rem;">[収入]</span>' : '<span style="color:var(--danger); font-size:0.7rem;">[支出]</span>';
        const amtClass = item.type === 'income' ? 'income' : 'expense';
        const sign = item.type === 'income' ? '＋' : '－';
        
        div.innerHTML = `
            <span class="name">${typeLabel} ${item.name} <span style="font-size:0.7rem; color:var(--text-muted);">(毎月${item.day}日)</span></span>
            <div class="plan-action">
                <span class="plan-amount ${amtClass}">${sign}¥${item.amount.toLocaleString()}</span>
                <button class="btn btn-sm" style="background:var(--danger);" onclick="deleteFixedCostMaster(${item.id})">削除</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function generateFixedCostsToPlans() {
    const today = new Date();
    // 過去1ヶ月から将来12ヶ月分まで生成するように拡大
    for (let i = -1; i <= 12; i++) {
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
                    name: `[固定] ${master.name}`,
                    date: dateStr,
                    type: master.type || 'expense', // 固定費マスタ自体のタイプを使用
                    amount: master.amount,
                    asset: master.type === 'income' ? 'bank' : 'card', // 収入はとりあえず銀行、支出はカード
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
    ['cash', 'bank', 'paypay', 'pasmo', 'card'].forEach(a => {
        const btn = document.getElementById(`btn-asset-${a}`);
        if (btn) btn.classList.toggle('active', a === asset);
    });
}

function savePlanItem() {
    const name = document.getElementById('plan-name').value;
    const date = document.getElementById('plan-date').value;
    const amount = Number(document.getElementById('plan-amount-input').value);
    const editId = document.getElementById('edit-plan-id').value;

    if (!name || !date || !amount) return showToast("項目名、日付、金額を入力してください");

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
    renderCalendar();
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
    debugLog("deletePlanItem attempt: " + id);
    planItems = planItems.filter(item => item.id !== id);
    saveToStorage();
    renderPlans();
    calculateBudget();
    renderCalendar();
    checkOverduePlans();
}

function setSimulationEndDate() {
    const val = document.getElementById('simulation-end-date').value;
    walletData.simulationEndDate = val || null;
    saveToStorage();
    calculateBudget();
    renderCalendar();
    showToast("シミュレーション終了日を保存しました");
}

function clearSimulationEndDate() {
    walletData.simulationEndDate = null;
    document.getElementById('simulation-end-date').value = "";
    saveToStorage();
    calculateBudget();
    renderCalendar();
    showToast("終了日をリセットしました");
}

function renderPlans() {
    debugLog("renderPlans starting...");
    const container = document.getElementById('plans-list-container');
    if (!container) return;
    container.innerHTML = "";

    // シミュレーション終了日の初期値をセット
    if (document.getElementById('simulation-end-date')) {
        document.getElementById('simulation-end-date').value = walletData.simulationEndDate || "";
    }
    
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

            const content = `
                <div class="plan-info">
                    <div class="name">${item.name} <span style="font-size:0.7rem; background:#edf2f7; padding:2px 4px; border-radius:4px;">${assetLabel}</span></div>
                    <div class="details">予定日: ${item.date}</div>
                </div>
                <div class="plan-action">
                    <span class="plan-amount ${amtClass}">${sign}¥${item.amount.toLocaleString()}</span>
                    <button class="btn btn-sm btn-success js-complete-btn">確</button>
                    <button class="btn btn-sm js-edit-btn" style="background:#4a5568;">編</button>
                    <button class="btn btn-sm js-delete-btn" style="background:var(--danger);">削</button>
                </div>
            `;
            div.innerHTML = content;
            container.appendChild(div);

            // Safari(iPhone)対策：onclick属性ではなくaddEventListenerを使い、touchstartで即座に反応させる
            const compBtn = div.querySelector('.js-complete-btn');
            const editBtn = div.querySelector('.js-edit-btn');
            const delBtn = div.querySelector('.js-delete-btn');

            const fastClick = (el, fn) => {
                el.addEventListener('click', (e) => {
                    e.preventDefault();
                    debugLog(`Action: ${el.innerText} for ${item.name}`);
                    fn();
                });
            };

            fastClick(compBtn, () => window.completePlanDirectly(item.id));
            fastClick(editBtn, () => window.editPlanItem(item.id));
            fastClick(delBtn, () => window.deletePlanItem(item.id));
        });
    }
}

function openAdjustPanel(id, defaultAmount) {
    debugLog("openAdjustPanel called for id: " + id);
    currentAdjustingPlanId = id;
    document.getElementById('adjust-actual-amount').value = defaultAmount;
    document.getElementById('adjust-panel').style.display = "block";
    document.getElementById('adjust-panel').scrollIntoView({ behavior: 'smooth' });
    document.getElementById('adjust-confirm-btn').onclick = confirmPlanCompletion;
}

// １ステップで確定反映する新関数
function completePlanDirectly(id) {
    console.log("completePlanDirectly called with id:", id);
    const item = planItems.find(p => p.id === id);
    if (!item) {
        console.error("item not found for id:", id);
        return;
    }

    let actualAmount = item.amount;
    let undoData = {}; 

    if (item.type === 'income') {
        if (item.asset === 'card') {
            const targetKey = getCardKeyForPlan(item);
            walletData.cardRequests[targetKey] = (walletData.cardRequests[targetKey] || 0) - actualAmount;
            undoData = { cardRequests: { [targetKey]: actualAmount } };
        } else {
            walletData[item.asset] = (walletData[item.asset] || 0) + actualAmount;
            undoData = { [item.asset]: -actualAmount };
        }
    } else {
        if (item.asset === 'card') {
            const targetKey = getCardKeyForPlan(item);
            walletData.cardRequests[targetKey] = (walletData.cardRequests[targetKey] || 0) + actualAmount;
            undoData = { cardRequests: { [targetKey]: -actualAmount } };
        } else {
            walletData[item.asset] = (walletData[item.asset] || 0) - actualAmount;
            undoData = { [item.asset]: actualAmount };
        }
    }

    item.isCompleted = true;

    historyLogs.unshift({
        id: Date.now(),
        date: item.date,
        name: `[確定] ${item.name}`,
        type: item.type,
        amount: actualAmount,
        asset: item.asset,
        undoData: undoData,        
        undoPlanId: item.id       
    });

    saveToStorage();
    renderPlans();
    calculateBudget();
    renderCalendar();
    checkOverduePlans();
    showToast(`「${item.name}」を確定しました`);
}

function closeAdjustPanel() {
    document.getElementById('adjust-panel').style.display = "none";
    currentAdjustingPlanId = null;
}

function confirmPlanCompletion() {
    const actualAmount = Number(document.getElementById('adjust-actual-amount').value);
    const item = planItems.find(p => p.id === currentAdjustingPlanId);
    if (!item) return;

    let undoData = {}; 

    if (item.type === 'income') {
        if (item.asset === 'card') {
            const targetKey = getCardKeyForPlan(item);
            walletData.cardRequests[targetKey] = (walletData.cardRequests[targetKey] || 0) - actualAmount;
            undoData = { cardRequests: { [targetKey]: actualAmount } };
        } else {
            walletData[item.asset] = (walletData[item.asset] || 0) + actualAmount;
            undoData = { [item.asset]: -actualAmount };
        }
    } else {
        if (item.asset === 'card') {
            const targetKey = getCardKeyForPlan(item);
            walletData.cardRequests[targetKey] = (walletData.cardRequests[targetKey] || 0) + actualAmount;
            undoData = { cardRequests: { [targetKey]: -actualAmount } };
        } else {
            walletData[item.asset] = (walletData[item.asset] || 0) - actualAmount;
            undoData = { [item.asset]: actualAmount };
        }
    }

    item.isCompleted = true;

    historyLogs.unshift({
        id: Date.now(),
        date: item.date,
        name: `[確定] ${item.name}`,
        type: item.type,
        amount: actualAmount,
        asset: item.asset,
        undoData: undoData,        
        undoPlanId: item.id       
    });

    saveToStorage();
    renderPlans();
    calculateBudget();
    renderCalendar();
    checkOverduePlans();
    closeAdjustPanel();
    showToast(`「${item.name}」を確定しました`);
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
            <button class="btn btn-sm btn-success" style="padding:2px 6px; font-size:0.7rem;" onclick="completePlanDirectly('${item.id}');">今すぐ確定</button>
        `;
        listContainer.appendChild(div);
    });
}

function calculateBudget() {
    const totalAssets = (walletData.bank || 0) + (walletData.cash || 0) + (walletData.paypay || 0) + (walletData.pasmo || 0) + (walletData.hidden || 0);
    
    const today = new Date();
    today.setHours(0,0,0,0);
    
    // シミュレーション終了日の決定
    let maxSimulationDate;
    if (walletData.simulationEndDate) {
        maxSimulationDate = new Date(walletData.simulationEndDate.replace(/-/g, '/'));
    } else {
        // 設定がない場合は従来通り一番遠い予定日
        maxSimulationDate = new Date(today);
        planItems.forEach(item => {
            if (!item.isCompleted) {
                const itemDate = new Date(item.date.replace(/-/g, '/'));
                itemDate.setHours(0,0,0,0);
                if (itemDate > maxSimulationDate) {
                    maxSimulationDate = new Date(itemDate);
                }
            }
        });
    }
    maxSimulationDate.setHours(0,0,0,0);

    let tempAssets = totalAssets;
    let checkDate = new Date(today);
    
    // 今日から対象日までの全予定をシミュレート
    while (checkDate <= maxSimulationDate) {
        const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
        
        planItems.forEach(item => {
            if (!item.isCompleted && item.asset !== 'card') {
                const itemDate = new Date(item.date.replace(/-/g, '/'));
                itemDate.setHours(0, 0, 0, 0);
                if (itemDate.getTime() === checkDate.getTime()) {
                    if (item.type === 'income') tempAssets += item.amount;
                    else tempAssets -= item.amount;
                }
            }
        });
        
        if (checkDate.getDate() === 27) {
            const y = checkDate.getFullYear();
            const m = checkDate.getMonth() + 1;
            const cardKey = `${y}-${String(m).padStart(2, '0')}-27`;
            let cardDebt = walletData.cardRequests[cardKey] || 0;
            
            planItems.forEach(item => {
                if (!item.isCompleted && item.asset === 'card') {
                    if (getCardKeyForPlan(item) === cardKey) {
                        if (item.type === 'income') cardDebt -= item.amount;
                        else cardDebt += item.amount;
                    }
                }
            });
            tempAssets -= cardDebt;
        }
        checkDate.setDate(checkDate.getDate() + 1);
    }

    // ユーザー指定の計算式
    // 最後の出費予定日に残る残高 - 2万円
    const minMargin = tempAssets - 20000;
    
    // 今日からその日までの日数
    const diffTime = maxSimulationDate.getTime() - today.getTime();
    const daysToEnd = Math.max(1, Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1);

    let availableToday = Math.floor(minMargin / daysToEnd);
    const availableThisWeek = availableToday * 7;
    const availableThisMonth = minMargin;

    const formatCurrency = (amt) => {
        return amt < 0 ? `-¥${Math.abs(amt).toLocaleString()}` : `¥${amt.toLocaleString()}`;
    };

    const elToday = document.getElementById('calc-today');
    const elWeek = document.getElementById('calc-week');
    const elMonth = document.getElementById('calc-month');

    if (elToday) {
        elToday.innerText = formatCurrency(availableToday);
        elToday.style.color = availableToday < 0 ? '#e53e3e' : '';
    }
    if (elWeek) {
        elWeek.innerText = formatCurrency(availableThisWeek);
        elWeek.style.color = availableThisWeek < 0 ? '#e53e3e' : '';
    }
    if (elMonth) {
        elMonth.innerText = formatCurrency(availableThisMonth);
        elMonth.style.color = availableThisMonth < 0 ? '#e53e3e' : '';
    }

    // 「自由に使える」の横の日数表示を更新
    if (document.getElementById('days-left-count')) {
        document.getElementById('days-left-count').innerText = daysToEnd;
    }

    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const daysMonthEnd = lastDayOfMonth.getDate() - today.getDate() + 1;
    if (document.getElementById('days-left')) {
        document.getElementById('days-left').innerText = daysMonthEnd;
    }

    if (document.getElementById('label-today-date')) {
        document.getElementById('label-today-date').innerText = `(${today.getMonth()+1}/${today.getDate()})`;
    }

    // 今週の支出計算 (金曜日始まりのサイクル)
    const currentDay = today.getDay(); 
    const distToFri = currentDay >= 5 ? currentDay - 5 : currentDay + 2;
    const friDate = new Date(today);
    friDate.setDate(today.getDate() - distToFri);
    friDate.setHours(0,0,0,0);
    const friStr = friDate.toISOString().split('T')[0];

    let weeklySpent = 0;
    historyLogs.forEach(log => {
        if (log.date >= friStr && log.type === 'expense' && !log.name.includes("差額調整")) {
            weeklySpent += log.amount;
        }
    });
    if (document.getElementById('actual-week-spent')) {
        document.getElementById('actual-week-spent').innerText = `¥${weeklySpent.toLocaleString()}`;
        // 目標を超えているかどうかの色付け
        if (weeklySpent > availableThisWeek && availableThisWeek > 0) {
            document.getElementById('actual-week-spent').style.color = '#feb2b2'; // 薄い赤
        } else {
            document.getElementById('actual-week-spent').style.color = '#9ae6b4'; // 薄い緑
        }
    }
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

    for (let i = startDayOfWeek; i > 0; i--) {
        const prevDate = new Date(year, month, 1 - i);
        createDayCell(prevDate, true, container);
    }

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

    if (!isOtherMonth && compareDate.getTime() === today.getTime()) {
        cell.classList.add('today');
    }

    let currentAssets = (walletData.bank || 0) + (walletData.cash || 0) + (walletData.paypay || 0) + (walletData.pasmo || 0) + (walletData.hidden || 0);

    // 未来シミュレーション
    if (compareDate > today) {
        let tempAssets = currentAssets;
        
        let checkDate = new Date(today);
        // 今日から対象日までの全予定を反映
        while (checkDate <= compareDate) {
            const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
            
            planItems.forEach(item => {
                if (!item.isCompleted && item.asset !== 'card') {
                    const itemDate = new Date(item.date.replace(/-/g, '/'));
                    itemDate.setHours(0, 0, 0, 0);
                    if (itemDate.getTime() === checkDate.getTime()) {
                        if (item.type === 'income') tempAssets += item.amount;
                        else tempAssets -= item.amount;
                    }
                }
            });
            
            if (checkDate.getDate() === 27) {
                const y = checkDate.getFullYear();
                const m = checkDate.getMonth() + 1;
                const cardKey = `${y}-${String(m).padStart(2, '0')}-27`;
                let cardDebt = walletData.cardRequests[cardKey] || 0;
                
                planItems.forEach(item => {
                    if (!item.isCompleted && item.asset === 'card') {
                        if (getCardKeyForPlan(item) === cardKey) {
                            if (item.type === 'income') cardDebt -= item.amount;
                            else cardDebt += item.amount;
                        }
                    }
                });
                tempAssets -= cardDebt;
            }
            checkDate.setDate(checkDate.getDate() + 1);
        }
        currentAssets = tempAssets;
    }

    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    let dayInc = 0;
    let dayExp = 0;

    planItems.forEach(p => {
        if (p.date === dateStr && !p.isCompleted) {
            if (p.type === 'income') dayInc += p.amount;
            else dayExp += p.amount;
        }
    });

    if (date.getDate() === 27) {
        const y = date.getFullYear();
        const m = date.getMonth() + 1;
        const cardKey = `${y}-${String(m).padStart(2, '0')}-27`;
        let cardDebt = walletData.cardRequests[cardKey] || 0;
        
        planItems.forEach(item => {
            if (!item.isCompleted && item.asset === 'card') {
                if (getCardKeyForPlan(item) === cardKey) {
                    if (item.type === 'income') cardDebt -= item.amount;
                    else cardDebt += item.amount;
                }
            }
        });
        if (cardDebt > 0) dayExp += cardDebt;
        else if (cardDebt < 0) dayInc += Math.abs(cardDebt);
    }

    let html = `<div class="day-num">${date.getDate()}</div>`;
    
    // 文字数に応じてフォントサイズを調整する関数（クロージャ的に定義）
    const getShrinkStyle = (text, baseSize) => {
        let size = baseSize;
        if (text.length > 7) size = baseSize * 0.75;
        else if (text.length > 5) size = baseSize * 0.85;
        return `font-size: ${size}rem; text-align: center; font-weight: bold; margin-top: 1px; white-space: nowrap; display: block;`;
    };

    if (dayInc > 0) {
        const txt = `+${dayInc.toLocaleString()}`;
        html += `<span style="color: #48bb78; ${getShrinkStyle(txt, 0.58)}">${txt}</span>`;
    }
    if (dayExp > 0) {
        const txt = `-${dayExp.toLocaleString()}`;
        html += `<span style="color: #e53e3e; ${getShrinkStyle(txt, 0.58)}">${txt}</span>`;
    }
    
    const amtColor = currentAssets >= 20000 ? '#2d3748' : '#e53e3e';
    const totalTxt = `¥${currentAssets.toLocaleString()}`;
    html += `<span style="color: ${amtColor}; ${getShrinkStyle(totalTxt, 0.63)} margin-top: 2px;">${totalTxt}</span>`;

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
    const log = historyLogs.find(l => l.id === id);
    if (!log) return;

    if (!confirm(`この履歴「${log.name}」を削除しますか？\n連動して財布の金額が自動で元に戻ります。`)) return;

    // 1. 金額の巻き戻し (undoDataが仕込まれている場合)
    if (log.undoData) {
        for (const key in log.undoData) {
            if (key === 'cardRequests') {
                for (const cardKey in log.undoData.cardRequests) {
                    walletData.cardRequests[cardKey] = (walletData.cardRequests[cardKey] || 0) + log.undoData.cardRequests[cardKey];
                }
            } else {
                walletData[key] = (walletData[key] || 0) + log.undoData[key];
            }
        }
    } else {
        // 【救済処理】古い履歴（undoDataがない場合）の簡易的な自動戻し
        if (log.asset !== 'card' && !log.name.includes("PASMO入金") && !log.name.includes("差額調整")) {
            if (log.type === 'income') {
                walletData[log.asset] = (walletData[log.asset] || 0) - log.amount;
            } else {
                walletData[log.asset] = (walletData[log.asset] || 0) + log.amount;
            }
        }
    }

    // 2. 予定（予測）の未完了への戻し連動
    if (log.undoPlanId) {
        const item = planItems.find(p => p.id === log.undoPlanId);
        if (item) {
            item.isCompleted = false; 
        }
    }

    // 履歴データから削除
    historyLogs = historyLogs.filter(l => l.id !== id);

    // ストレージ保存と全表示の更新
    saveToStorage();
    loadWalletInputs();
    renderPlans();
    calculateBudget();
    renderCalendar();
    renderHistory();
    checkOverduePlans();
    
    showToast(`履歴「${log.name}」を削除し、戻しました`);
}

function getAssetLabel(asset) {
    const labels = { cash: "現金", bank: "銀行/デビット", paypay: "PayPay", pasmo: "PASMO", hidden: "隠し金", card: "カード" };
    return labels[asset] || asset;
}

function saveToStorage() {
    try {
        localStorage.setItem('ore_wallet_pro_wallet', JSON.stringify(walletData));
        localStorage.setItem('ore_wallet_pro_fixed', JSON.stringify(fixedCosts));
        localStorage.setItem('ore_wallet_pro_plans', JSON.stringify(planItems));
        localStorage.setItem('ore_wallet_pro_history', JSON.stringify(historyLogs));
    } catch (e) {
        console.error("Storage error:", e);
        showToast("データの保存に失敗しました");
    }
}

// Safari等の互換性向上のためグローバルに明示的に露出
window.completePlanDirectly = completePlanDirectly;
window.deletePlanItem = deletePlanItem;
window.editPlanItem = editPlanItem;
window.deleteFixedCostMaster = deleteFixedCostMaster;
window.addQuickExpense = addQuickExpense;
window.adjustAssetAmount = adjustAssetAmount;
window.adjustCardAmount = adjustCardAmount;
window.addFixedCostMaster = addFixedCostMaster;
window.savePlanItem = savePlanItem;
window.cancelPlanEdit = cancelPlanEdit;
window.changeMonth = changeMonth;
window.switchPage = switchPage;
window.deleteHistoryItem = deleteHistoryItem;
window.confirmPlanCompletion = confirmPlanCompletion;
window.closeAdjustPanel = closeAdjustPanel;