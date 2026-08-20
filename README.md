# ObraTrack — Gestão de Pagamentos e Retenção

Aplicação web para gestão financeira de uma empresa de construção em Angola:
Clientes → Obras → Proformas → Pagamentos → Retenção, tudo em Kwanzas (AOA / Kz).

## Stack

React + Vite + Tailwind CSS + Firebase (Auth, Firestore) + Recharts + jsPDF + SheetJS (xlsx).

## 1. Criar o projeto Firebase

1. Vá a [console.firebase.google.com](https://console.firebase.google.com) → **Criar Projeto**.
2. Em **Build → Authentication**, ative o método **Email/Password** e crie o(s) utilizador(es) da contabilidade.
3. Em **Build → Firestore Database**, crie a base de dados (modo produção).
4. Em **Project Settings → General → Your apps**, adicione uma **Web App** e copie as credenciais.
5. Em **Firestore → Rules**, cole o conteúdo de `firestore.rules` deste projeto (restringe leitura/escrita a utilizadores autenticados) e publique.

## 2. Configurar o projeto localmente

```bash
npm install
cp .env.example .env
```

Preencha o `.env` com as credenciais copiadas no passo 1:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

## 3. Executar em desenvolvimento

```bash
npm run dev
```

Abra `http://localhost:5173` e entre com o email/palavra-passe criado no Firebase Authentication.

## 4. Build de produção

```bash
npm run build
```

Os ficheiros finais ficam em `dist/`, prontos para publicar em Firebase Hosting, Vercel, Netlify, etc.

## Estrutura de dados (Firestore)

- `clients` — clientes
- `obras` — obras/projetos (ligadas a `clientId`)
- `proformas` — proformas (ligadas a `clientId`, `obraId`)
- `proformaItems` — linhas de cada proforma (ligadas a `proformaId`)
- `payments` — pagamentos (ligados a `clientId`, `obraId`, `proformaId`)
- `settings` — taxa de retenção e IVA por omissão

## Regra de cálculo da Retenção

Para cada pagamento, de forma independente:

1. `Percentagem do Pagamento = Valor Pago / Total da Obra × 100`
2. `Mão de Obra do Pagamento = Total Mão de Obra × Percentagem do Pagamento`
3. `Retenção do Pagamento = Mão de Obra do Pagamento × Taxa de Retenção`

A taxa de retenção por omissão está definida em **Definições** (atualmente **6,5%**) e pode ser
alterada por Obra sempre que o contrato o exigir. Cada pagamento guarda a taxa que foi aplicada
no momento do registo, para que o histórico nunca seja alterado retroativamente. A lógica está
centralizada em `src/lib/calc.js`.

## Módulos incluídos

Painel · Clientes (+ Extrato) · Obras (+ Histórico de Pagamentos) · Proformas (com secções/itens) ·
Pagamentos (com pré-visualização de cálculo em tempo real) · Relatórios (Retenção / Em Aberto) ·
Importação de Excel (mapeamento de colunas, deteção de duplicados) · Exportação Excel/PDF · Definições.

## Notas

- Todos os valores estão em Kz (AOA); não existe suporte a USD.
- A taxa de retenção e a taxa de IVA nunca estão fixas no código — são sempre configuráveis.
- O Storage do Firebase já está inicializado em `src/firebase.js`, pronto a usar caso queira anexar
  ficheiros (ex: comprovativos de pagamento) a um pagamento ou proforma.
