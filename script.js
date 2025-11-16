// --- CONFIGURAÇÕES GLOBAIS ---
// 1. Planilha (Fonte Mestre)
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRKGsyuscKYI0aLYldQ06Jq6tyvGgOyIupFnrljpdLwv0v1Unh8A9FNDwYpeF8QpKCYUoH7YPLsa2Bs/pub?output=csv'; // O mesmo link CSV de antes

// 2. Rifa
const PRECO_POR_NUMERO = 10.00; 
const WHATSAPP_NUMERO = '5588981688970'; // Número da sua amiga

// 3. Trava do Firebase
const TRAVA_MINUTOS = 35; // Tempo que o número fica "pendente"
const TOTAL_NUMEROS = 300; // Total de números na rifa (para o loop)

// --- VARIÁVEIS DE ESTADO (O Cérebro) ---
// Vamos inicializar estas *depois* que a página carregar
let db;
let dbRefPendentes;
let estadoNumeros = {};
let numerosSelecionados = [];

// --- INICIALIZAÇÃO PRINCIPAL ---
// Esta é a MUDANÇA PRINCIPAL:
// Todo o script agora espera por este evento.
document.addEventListener('DOMContentLoaded', () => {
    // 1. AGORA é seguro conectar ao Firebase
    try {
        db = firebase.database();
        dbRefPendentes = db.ref('pendentes'); // O "nó" onde salvaremos as travas
    } catch (e) {
        console.error("ERRO CRÍTICO: Firebase não inicializou. Verifique o index.html.", e);
        alert("Erro ao conectar com o servidor da rifa. Verifique sua conexão e tente recarregar.");
        return; // Para tudo se o Firebase não conectou
    }

    // 2. Agora podemos rodar o resto
    inicializarGrid();
    carregarPlanilhaMestre();
    escutarPendentes();
    iniciarTimer(); // Inicia o timer
});

// --- FUNÇÕES DE LÓGICA ---

// Cria o grid "vazio" (apenas com números livres)
function inicializarGrid() {
    for (let i = 1; i <= TOTAL_NUMEROS; i++) {
        const numFormatado = i.toString().padStart(2, '0');
        estadoNumeros[numFormatado] = { status: 'livre', nome: '' };
    }
    redesenharGridCompleto(); // Desenha o grid inicial
}

// 2. Carrega a Planilha (Vendido / Nomes) - Prioridade 1
async function carregarPlanilhaMestre() {
    try {
        const response = await fetch(SHEET_URL);
        const data = await response.text();

        const linhas = data.split('\n');
        for (let i = 1; i < linhas.length; i++) {
            const colunas = linhas[i].split(',');
            if (colunas.length < 3) continue;

            const numero = colunas[0].trim().padStart(2, '0');
            const status = colunas[1].trim().toLowerCase();
            const nome = colunas[2].trim();

            if (status === 'vendido') {
                estadoNumeros[numero] = { status: 'vendido', nome: nome };
            }
        }
        redesenharGridCompleto();
    } catch (error) {
        console.error('Erro ao carregar planilha:', error);
        // Coloca o "Carregando" em modo de erro
        const grid = document.getElementById('grid-numeros');
        grid.innerHTML = '<p class="text-danger">Erro ao carregar números. Atualize a página.</p>';
    }
}

// 3. Escuta o Firebase (Pendentes) - Prioridade 2
function escutarPendentes() {
    dbRefPendentes.on('value', (snapshot) => {
        const pendentes = snapshot.val() || {};
        const agora = Date.now();

        // Limpa status pendentes antigos
        for (const num in estadoNumeros) {
            if (estadoNumeros[num].status === 'pendente') {
                estadoNumeros[num].status = 'livre';
            }
        }

        // Marca os novos status pendentes
        for (const numero in pendentes) {
            const timestamp = pendentes[numero].timestamp;
            const expirado = (agora - timestamp) > (TRAVA_MINUTOS * 60 * 1000);

            if (estadoNumeros[numero] && estadoNumeros[numero].status !== 'vendido' && !expirado) {
                estadoNumeros[numero].status = 'pendente';
            } else if (expirado) {
                db.ref(`pendentes/${numero}`).remove();
            }
        }
        redesenharGridCompleto();
    });
}

// --- LÓGICA DE RENDERIZAÇÃO (Desenhar o Grid) ---
// --- LÓGICA DE RENDERIZAÇÃO (Desenhar o Grid) ---
function redesenharGridCompleto() {
    const grid = document.getElementById('grid-numeros');
    if (!grid) return; // Segurança
    grid.innerHTML = ''; // Limpa o grid antigo

    // === A CORREÇÃO ESTÁ AQUI ===
    // Em vez de 'for (const numero in estadoNumeros)', que não tem ordem...
    // Vamos fazer um loop de 1 até o total, garantindo a ordem numérica.
    for (let i = 1; i <= TOTAL_NUMEROS; i++) {
        
        // Formata o 'i' para o nosso formato de chave ("01", "02", "10")
        const numero = i.toString().padStart(2, '0');

        // Pega a informação desse número no nosso objeto de estado
        const info = estadoNumeros[numero];
        
        // Se por algum motivo esse número não foi inicializado, pula ele
        if (!info) continue; 

        // O resto da lógica de desenho continua igual
        const estaSelecionado = numerosSelecionados.includes(numero);

        let classeCss = '';
        let conteudo = `<h5 class="m-0 fw-bold">${numero}</h5>`;
        let onClick = `onclick="toggleNumero('${numero}')"`;

        if (info.status === 'vendido') {
            classeCss = 'bg-vendido';
            conteudo += `<small class="nome-comprador">${info.nome || 'Vendido'}</small>`;
            onClick = '';
        } else if (info.status === 'pendente') {
            classeCss = 'bg-pendente';
            conteudo += `<small class="nome-comprador">Reservado...</small>`;
            onClick = '';
        } else if (estaSelecionado) {
            classeCss = 'bg-selecionado';
        } else {
            classeCss = 'bg-livre';
        }

        const div = document.createElement('div');
        div.className = 'col';
        div.innerHTML = `
            <div class="card h-100 numero-card ${classeCss}" id="num-${numero}" ${onClick}>
                <div class="card-body d-flex flex-column align-items-center justify-content-center p-2">
                    ${conteudo}
                </div>
            </div>
        `;
        grid.appendChild(div);
    }
    // === FIM DA FUNÇÃO CORRIGIDA ===
}

// --- LÓGICA DE AÇÃO (Cliques do Usuário) ---

// 1. Clique em um número (Adicionar ao carrinho local)
function toggleNumero(numero) {
    if (estadoNumeros[numero].status !== 'livre') return;

    const index = numerosSelecionados.indexOf(numero);
    const elemento = document.getElementById(`num-${numero}`);

    if (index > -1) {
        numerosSelecionados.splice(index, 1);
        elemento.classList.remove('bg-selecionado');
        elemento.classList.add('bg-livre');
    } else {
        numerosSelecionados.push(numero);
        elemento.classList.remove('bg-livre');
        elemento.classList.add('bg-selecionado');
    }
    atualizarBarraCheckout();
}

// 2. Atualiza a Barra de Checkout
function atualizarBarraCheckout() {
    const barra = document.getElementById('checkout-bar');
    const contador = document.getElementById('contador-selecao');
    const total = document.getElementById('valor-total');

    if (numerosSelecionados.length > 0) {
        barra.style.display = 'block';
        contador.innerText = numerosSelecionados.join(', ');
        total.innerText = (numerosSelecionados.length * PRECO_POR_NUMERO).toFixed(2).replace('.', ',');
    } else {
        barra.style.display = 'none';
    }
}

// 3. Clique no Botão "Reservar" (A Mágica)
function reservarNumeros() {
    if (numerosSelecionados.length === 0) {
        alert("Você precisa selecionar pelo menos um número!");
        return;
    }

    // Pega a instância do Modal que criamos no HTML
    const modalElement = document.getElementById('modalPagamento');
    const modal = new bootstrap.Modal(modalElement);

    // Cria a trava no Firebase
    const timestamp = Date.now();
    let updates = {};
    numerosSelecionados.forEach(num => {
        updates[`pendentes/${num}`] = { timestamp: timestamp };
    });
    
    db.ref().update(updates)
        .then(() => {
            // SUCESSO!
            // Em vez de abrir o WhatsApp, MOSTRE O MODAL
            modal.show();
        })
        .catch((error) => {
            console.error("Erro ao reservar no Firebase:", error);
            alert("Ocorreu um erro ao reservar seus números. Tente novamente.");
        });
}

// 4. Abre o WhatsApp
function abrirWhatsApp() {
    const nums = numerosSelecionados.join(', ');
    const total = (numerosSelecionados.length * PRECO_POR_NUMERO).toFixed(2).replace('.', ',');
    const mensagem = `Olá! Acabei de pagar (R$ ${total}) pelos números: *${nums}*. Segue o comprovante!`;
    const link = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensagem)}`;
    window.open(link, '_blank');
}

// --- LÓGICA DO TIMER ---
// Movida para dentro de uma função
function iniciarTimer() {
    const dataSorteio = new Date(2025, 11, 20, 22, 0, 0).getTime(); // Lembre-se: Mês 10 = Novembro
    const timerElement = document.getElementById('countdown-display');

    if (!timerElement) return; // Segurança

    const timerInterval = setInterval(function() {
        const agora = new Date().getTime();
        const distancia = dataSorteio - agora;

        if (distancia < 0) {
            clearInterval(timerInterval);
            timerElement.innerHTML = "🎉 Sorteio Realizado! 🎉";
        } else {
            const dias = Math.floor(distancia / (1000 * 60 * 60 * 24));
            const horas = Math.floor((distancia % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutos = Math.floor((distancia % (1000 * 60 * 60)) / (1000 * 60));
            const segundos = Math.floor((distancia % (1000 * 60)) / 1000);
            timerElement.innerHTML = `⏰ ${dias}d ${horas}h ${minutos}m ${segundos}s`;
        }
    }, 1000);

    // --- NOVA FUNÇÃO DE COPIAR ---
    // Cole esta função em qualquer lugar no seu script.js

}
function copiarPix() {
    // 1. Pega o texto da chave Pix
    const chavePix = document.getElementById('pix-key-text').innerText;
    
    // 2. Pega o elemento do botão
    const btnCopiar = document.getElementById('btn-copiar-pix');

    // 3. Usa a API do Clipboard (navegador)
    navigator.clipboard.writeText(chavePix).then(() => {
        // Sucesso! Avisa o usuário
        btnCopiar.innerText = 'Copiado!';
        btnCopiar.classList.remove('btn-primary'); // Remove a cor azul
        btnCopiar.classList.add('btn-success'); // Adiciona a cor verde
        
        // Volta ao normal depois de 3 segundos
        setTimeout(() => {
            btnCopiar.innerText = 'Copiar';
            btnCopiar.classList.remove('btn-success');
            btnCopiar.classList.add('btn-primary');
        }, 3000); // 3000ms = 3 segundos
        
    }).catch(err => {
        // Erro (raro, mas pode acontecer)
        console.error('Falha ao copiar a chave: ', err);
        btnCopiar.innerText = 'Erro';
    });
}

/*
// --- CONFIGURAÇÕES ---
// COLE AQUI O LINK DO CSV QUE VOCÊ GEROU NO PASSO 1
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRKGsyuscKYI0aLYldQ06Jq6tyvGgOyIupFnrljpdLwv0v1Unh8A9FNDwYpeF8QpKCYUoH7YPLsa2Bs/pub?output=csv'; 

const PRECO_POR_NUMERO = 10.00; // Valor da rifa
const WHATSAPP_NUMERO = '5588981688970'; // Número da sua amiga (com 55 e DDD)

// --- ESTADO DA APLICAÇÃO ---
let numerosSelecionados = [];

// --- LÓGICA DO COUNTDOWN TIMER ---

// 1. Defina a data final do sorteio
// IMPORTANTE: O mês em JavaScript vai de 0 a 11 (Jan=0, Fev=1, ..., Nov=10, Dez=11)
// Formato: Ano, Mês (0-11), Dia, Hora, Minuto, Segundo
const dataSorteio = new Date(2025, 11, 20, 22, 0, 0).getTime(); // Ex: 20 de Nov de 2025 às 22:00

// 2. Armazena o elemento do timer
const timerElement = document.getElementById('countdown-display');

// 3. Atualiza o timer a cada 1 segundo
const timerInterval = setInterval(function() {
    const agora = new Date().getTime();
    const distancia = dataSorteio - agora;

    if (distancia < 0) {
        // Se o tempo acabou
        clearInterval(timerInterval);
        timerElement.innerHTML = "🎉 Sorteio Realizado! 🎉";
        // Muda o estilo para verde (opcional)
        timerElement.style.backgroundColor = "#28a745";
        timerElement.style.color = "white";
    } else {
        // Se ainda há tempo, calcula
        const dias = Math.floor(distancia / (1000 * 60 * 60 * 24));
        const horas = Math.floor((distancia % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutos = Math.floor((distancia % (1000 * 60 * 60)) / (1000 * 60));
        const segundos = Math.floor((distancia % (1000 * 60)) / 1000);

        // 4. Exibe o resultado no HTML (o ⏰ é um emoji)
        timerElement.innerHTML = `⏰ ${dias}d ${horas}h ${minutos}m ${segundos}s`;
    }
}, 1000);

// --- LÓGICA ---
async function carregarDados() {
    try {
        const response = await fetch(SHEET_URL);
        const data = await response.text();
        processarCSV(data);
    } catch (error) {
        console.error('Erro ao carregar:', error);
        document.getElementById('grid-numeros').innerHTML = '<p class="text-danger text-center">Erro ao carregar os números. Avise o administrador.</p>';
    }
}

function processarCSV(textoCsv) {
    const linhas = textoCsv.split('\n');
    const grid = document.getElementById('grid-numeros');
    grid.innerHTML = ''; // Limpa o loading

    // Começa do i=1 para pular o cabeçalho da planilha
    for (let i = 1; i < linhas.length; i++) {
        // Divide a linha por vírgula (CSV simples)
        const colunas = linhas[i].split(',');
        if (colunas.length < 2) continue;

        const numero = colunas[0].trim();
        const status = colunas[1].trim().toLowerCase(); // "livre" ou "vendido"

        criarElementoNumero(numero, status);
    }
}

function criarElementoNumero(numero, status) {
    const grid = document.getElementById('grid-numeros');
    const div = document.createElement('div');
    div.className = 'col';

    // Define a classe baseada no status vindo da planilha
    let classeCor = status === 'vendido' ? 'bg-vendido' : 'bg-livre';
    
    div.innerHTML = `
        <div class="card h-100 numero-card ${classeCor}" 
                id="num-${numero}"
                onclick="toggleNumero('${numero}', '${status}')">
            <div class="card-body d-flex align-items-center justify-content-center p-2">
                <h5 class="m-0 fw-bold">${numero}</h5>
            </div>
        </div>
    `;
    grid.appendChild(div);
}

function toggleNumero(numero, statusOriginal) {
    if (statusOriginal === 'vendido') return; // Não faz nada se já vendeu

    const index = numerosSelecionados.indexOf(numero);
    const elemento = document.getElementById(`num-${numero}`);

    if (index > -1) {
        // Se já estava selecionado, remove
        numerosSelecionados.splice(index, 1);
        elemento.classList.remove('bg-selecionado');
        elemento.classList.add('bg-livre');
    } else {
        // Se não estava, adiciona
        numerosSelecionados.push(numero);
        elemento.classList.remove('bg-livre');
        elemento.classList.add('bg-selecionado');
    }

    atualizarBarraCheckout();
}

function atualizarBarraCheckout() {
    const barra = document.getElementById('checkout-bar');
    const contador = document.getElementById('contador-selecao');
    const total = document.getElementById('valor-total');

    if (numerosSelecionados.length > 0) {
        barra.style.display = 'block';
        contador.innerText = numerosSelecionados.join(', ');
        total.innerText = (numerosSelecionados.length * PRECO_POR_NUMERO).toFixed(2).replace('.', ',');
    } else {
        barra.style.display = 'none';
    }
}

function enviarWhatsApp() {
    if (numerosSelecionados.length === 0) return;

    const nums = numerosSelecionados.join(', ');
    const total = (numerosSelecionados.length * PRECO_POR_NUMERO).toFixed(2).replace('.', ',');
    
    // Cria a mensagem
    const mensagem = `Olá! Gostaria de reservar os números: *${nums}*. Total: R$ ${total}. Como faço o Pix?`;
    
    // Abre o WhatsApp
    const link = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensagem)}`;
    window.open(link, '_blank');
}

// Inicia tudo
carregarDados();
*/