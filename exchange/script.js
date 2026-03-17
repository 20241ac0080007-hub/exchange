/**
 * CryptoExchange - Conversor de Moedas em Tempo Real
 * Aplicação ES6+ para conversão de moedas usando API ExchangeRate-API
 */

// ============================
// CONSTANTES E CONFIGURAÇÃO
// ============================

const API_KEY = '91be4c05603389647292e9e3';
const API_BASE_URL = 'https://v6.exchangerate-api.com/v6';
const SUPPORTED_CURRENCIES = ['BRL', 'USD', 'EUR', 'GBP', 'JPY'];
const CACHE_TIME = 5 * 60 * 1000; // 5 minutos em milissegundos
const STORAGE_KEYS = {
    lastCurrencies: 'lastCurrencies',
    lastRates: 'lastRates',
    lastRatesTime: 'lastRatesTime'
};

// ============================
// ELEMENTOS DO DOM
// ============================

const amountInput = document.getElementById('amount');
const fromCurrencySelect = document.getElementById('from-currency');
const toCurrencySelect = document.getElementById('to-currency');
const convertBtn = document.getElementById('convert-btn');
const swapBtn = document.getElementById('swap-btn');
const resultSection = document.getElementById('result-section');
const errorSection = document.getElementById('error-section');
const loadingIndicator = document.getElementById('loading-indicator');
const resultAmount = document.getElementById('result-amount');
const resultCurrency = document.getElementById('result-currency');
const resultRate = document.getElementById('result-rate');
const resultTimestamp = document.getElementById('result-timestamp');
const errorMessage = document.getElementById('error-message');
const ratesContainer = document.getElementById('rates-container');

// ============================
// ESTADO DA APLICAÇÃO
// ============================

const appState = {
    exchangeRates: {},
    lastRatesTime: null,
    isLoading: false
};

// ============================
// INICIALIZAÇÃO
// ============================

document.addEventListener('DOMContentLoaded', () => {
    console.log('CryptoExchange iniciado');
    initializeApp();
});

/**
 * Inicializa a aplicação
 */
function initializeApp() {
    // Restaurar última configuração
    loadLastSettings();
    
    // Adicionar listeners
    convertBtn.addEventListener('click', handleConvert);
    swapBtn.addEventListener('click', handleSwap);
    amountInput.addEventListener('input', handleAutoConvert);
    fromCurrencySelect.addEventListener('change', saveSettings);
    toCurrencySelect.addEventListener('change', saveSettings);
    
    // Carregar taxas de câmbio na primeira vez
    loadExchangeRates();
}

// ============================
// MANIPULADORES DE EVENTOS
// ============================

/**
 * Manipula o clique no botão de conversão
 */
async function handleConvert(e) {
    e.preventDefault();
    
    if (!validateInput()) {
        return;
    }

    await convertCurrency();
}

/**
 * Manipula a troca (swap) entre moedas
 */
function handleSwap() {
    const temp = fromCurrencySelect.value;
    fromCurrencySelect.value = toCurrencySelect.value;
    toCurrencySelect.value = temp;
    
    saveSettings();
    
    // Se houver um valor, converter automaticamente
    if (amountInput.value.trim() !== '') {
        convertCurrency();
    }
}

/**
 * Manipula conversão automática ao digitar
 */
function handleAutoConvert() {
    saveSettings();
    
    if (amountInput.value.trim() === '') {
        hideResult();
        return;
    }
    
    // Debounce para não fazer muitas requisições
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
        convertCurrency().catch(err => console.error('Auto-convert erro:', err));
    }, 500);
}

// ============================
// VALIDAÇÕES
// ============================

/**
 * Valida o input do usuário
 */
function validateInput() {
    const amount = parseFloat(amountInput.value);
    
    if (!amountInput.value.trim() || isNaN(amount) || amount <= 0) {
        showError('Insira um valor válido');
        return false;
    }
    
    hideError();
    return true;
}

// ============================
// CONVERSÃO DE MOEDAS
// ============================

/**
 * Converte a moeda usando API ou dados em cache
 */
async function convertCurrency() {
    if (!validateInput()) {
        return;
    }

    const amount = parseFloat(amountInput.value);
    const fromCurrency = fromCurrencySelect.value;
    const toCurrency = toCurrencySelect.value;

    // Se as moedas são iguais, mostrar valor igual
    if (fromCurrency === toCurrency) {
        displayResult(amount, toCurrency, 1);
        return;
    }

    try {
        setLoading(true);
        
        // Carregar taxas se necessário
        if (Object.keys(appState.exchangeRates).length === 0) {
            await loadExchangeRates();
        }

        // Calcular conversão
        const rate = calculateConversion(amount, fromCurrency, toCurrency);
        displayResult(rate, toCurrency, getExchangeRate(fromCurrency, toCurrency));
        
        hideError();
    } catch (error) {
        console.error('Erro na conversão:', error);
        showError('Erro ao buscar taxas de câmbio. Tente novamente.');
    } finally {
        setLoading(false);
    }
}

/**
 * Calcula a conversão entre duas moedas
 * Usa conversão cruzada quando necessário (via USD)
 */
function calculateConversion(amount, fromCurrency, toCurrency) {
    const rates = appState.exchangeRates;
    
    // Se a moeda de origem é USD
    if (fromCurrency === 'USD') {
        return amount * rates[toCurrency];
    }
    
    // Se a moeda de destino é USD
    if (toCurrency === 'USD') {
        return amount / rates[fromCurrency];
    }
    
    // Conversão cruzada: X -> USD -> Y
    const amountInUsd = amount / rates[fromCurrency];
    return amountInUsd * rates[toCurrency];
}

/**
 * Obtém a taxa de câmbio entre duas moedas
 */
function getExchangeRate(fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) return 1;
    
    const rates = appState.exchangeRates;
    
    if (fromCurrency === 'USD') {
        return rates[toCurrency];
    }
    
    if (toCurrency === 'USD') {
        return 1 / rates[fromCurrency];
    }
    
    // Conversão cruzada
    return (rates[toCurrency] / rates[fromCurrency]);
}

// ============================
// CARREGAMENTO DE TAXAS
// ============================

/**
 * Carrega as taxas de câmbio da API
 */
async function loadExchangeRates() {
    try {
        // Verificar se há cache válido
        const cached = getValidCache();
        if (cached) {
            appState.exchangeRates = cached;
            updateRatesDisplay();
            return;
        }

        setLoading(true);
        console.log('Buscando taxas de câmbio...');

        const url = `${API_BASE_URL}/${API_KEY}/latest/USD`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`API erro: ${response.status}`);
        }

        const data = await response.json();

        if (data.result === 'failure') {
            throw new Error(data['error-type']);
        }

        // Filtar apenas moedas suportadas
        const filteredRates = {};
        SUPPORTED_CURRENCIES.forEach(currency => {
            if (data.conversion_rates[currency]) {
                filteredRates[currency] = data.conversion_rates[currency];
            }
        });

        appState.exchangeRates = filteredRates;
        appState.lastRatesTime = Date.now();

        // Salvar no localStorage
        saveRatesToCache();
        updateRatesDisplay();

        console.log('Taxas carregadas com sucesso:', filteredRates);
    } catch (error) {
        console.error('Erro ao carregar taxas:', error);
        showError('Erro ao conectar com a API de câmbio');
    } finally {
        setLoading(false);
    }
}

/**
 * Obtém cache válido se disponível
 */
function getValidCache() {
    const cachedRates = localStorage.getItem(STORAGE_KEYS.lastRates);
    const cachedTime = localStorage.getItem(STORAGE_KEYS.lastRatesTime);

    if (!cachedRates || !cachedTime) {
        return null;
    }

    const timeDiff = Date.now() - parseInt(cachedTime);
    
    if (timeDiff < CACHE_TIME) {
        const rates = JSON.parse(cachedRates);
        appState.lastRatesTime = parseInt(cachedTime);
        return rates;
    }

    return null;
}

/**
 * Salva taxas no localStorage
 */
function saveRatesToCache() {
    localStorage.setItem(STORAGE_KEYS.lastRates, JSON.stringify(appState.exchangeRates));
    localStorage.setItem(STORAGE_KEYS.lastRatesTime, appState.lastRatesTime.toString());
}

// ============================
// ATUALIZAÇÃO DA INTERFACE
// ============================

/**
 * Exibe o resultado da conversão
 */
function displayResult(convertedAmount, toCurrency, rate) {
    const formatter = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: toCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 6
    });

    resultAmount.textContent = formatter.format(convertedAmount);
    resultCurrency.textContent = toCurrency;
    
    // Exibir taxa de câmbio
    const rateFormatter = new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 4,
        maximumFractionDigits: 6
    });
    resultRate.textContent = `Taxa: 1 ${fromCurrencySelect.value} = ${rateFormatter.format(rate)} ${toCurrency}`;
    
    // Timestamp
    updateTimestamp();

    resultSection.classList.remove('hidden');
    errorSection.classList.add('hidden');
}

/**
 * Esconde o resultado
 */
function hideResult() {
    resultSection.classList.add('hidden');
}

/**
 * Atualiza o timestamp do resultado
 */
function updateTimestamp() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    resultTimestamp.textContent = `Atualizado em: ${timeString}`;
}

/**
 * Exibe erro na interface
 */
function showError(message) {
    errorMessage.textContent = message;
    errorSection.classList.remove('hidden');
    resultSection.classList.add('hidden');
}

/**
 * Esconde a seção de erro
 */
function hideError() {
    errorSection.classList.add('hidden');
}

/**
 * Controla o estado de carregamento
 */
function setLoading(isLoading) {
    appState.isLoading = isLoading;
    
    if (isLoading) {
        loadingIndicator.classList.remove('hidden');
        convertBtn.disabled = true;
        convertBtn.textContent = 'Calculando...';
    } else {
        loadingIndicator.classList.add('hidden');
        convertBtn.disabled = false;
        convertBtn.textContent = 'Converter';
    }
}

/**
 * Atualiza a exibição das taxas de câmbio
 */
function updateRatesDisplay() {
    if (Object.keys(appState.exchangeRates).length === 0) {
        ratesContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-tertiary);">Carregando taxas...</p>';
        return;
    }

    ratesContainer.innerHTML = '';

    // Exibir taxas em relação ao USD
    const baseAmount = 1;
    
    SUPPORTED_CURRENCIES.forEach(currency => {
        if (currency !== 'USD' && appState.exchangeRates[currency]) {
            const rate = appState.exchangeRates[currency];
            const rateElement = createRateElement('USD', currency, rate);
            ratesContainer.appendChild(rateElement);
        }
    });
}

/**
 * Cria elemento de taxa de câmbio
 */
function createRateElement(fromCurrency, toCurrency, rate) {
    const div = document.createElement('div');
    div.className = 'rate-item';
    
    const pair = document.createElement('div');
    pair.className = 'rate-pair';
    pair.textContent = `${fromCurrency} → ${toCurrency}`;
    
    const value = document.createElement('div');
    value.className = 'rate-value';
    
    const formatter = new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6
    });
    
    value.textContent = formatter.format(rate);
    
    div.appendChild(pair);
    div.appendChild(value);
    
    return div;
}

// ============================
// PERSISTÊNCIA (LOCALSTORAGE)
// ============================

/**
 * Salva as últimas configurações do usuário
 */
function saveSettings() {
    const settings = {
        from: fromCurrencySelect.value,
        to: toCurrencySelect.value,
        amount: amountInput.value
    };
    localStorage.setItem(STORAGE_KEYS.lastCurrencies, JSON.stringify(settings));
}

/**
 * Carrega as últimas configurações do usuário
 */
function loadLastSettings() {
    const saved = localStorage.getItem(STORAGE_KEYS.lastCurrencies);
    
    if (saved) {
        try {
            const settings = JSON.parse(saved);
            fromCurrencySelect.value = settings.from || 'USD';
            toCurrencySelect.value = settings.to || 'BRL';
            
            // Não carregar o valor anterior para evitar confusão
            // amountInput.value = settings.amount || '';
        } catch (error) {
            console.error('Erro ao carregar configurações:', error);
        }
    }
}

// ============================
// FUNÇÕES UTILITÁRIAS
// ============================

/**
 * Formata número para exibição de moeda
 */
function formatCurrency(amount, currency) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: currency
    }).format(amount);
}

/**
 * Registra informações no console
 */
function log(message, data = null) {
    console.log(`[CryptoExchange] ${message}`, data || '');
}

// Iniciar a aplicação
log('Aplicação pronta', appState);
