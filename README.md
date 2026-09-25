# 🎓 Gerenciador de Presença de Alunos

Sistema completo e profissional para controle acadêmico e gestão de presença escolar de alunos, com autenticação JWT segura, cookies HttpOnly, rate limiting, controle de permissões por perfil (RBAC), relatórios detalhados com frequência individual, auditoria completa de alterações e exportação em formato CSV.

---

## 🛠️ Stack Tecnológica

- **Backend:** Node.js 18+ com Express.js
- **Banco de Dados:** SQLite nativo via `sql.js` (WebAssembly), persistido no arquivo `data/presenca.sqlite`
- **Frontend:** HTML5, CSS3 moderno e JavaScript puro (Vanilla JS sem frameworks pesados)
- **Segurança & Autenticação:** JWT (`jsonwebtoken`), Cookie `HttpOnly` com `SameSite=Lax`, hash com `bcryptjs`
- **Rate Limiting:** Middleware customizado em memória para mitigação de ataques de força bruta no login e cadastro
- **Exportação:** `csv-stringify` com cabeçalhos UTF-8 e suporte a caracteres especiais
- **Tipografia:** Google Fonts *DM Sans* e *Space Grotesk*
- **Testes Automatizados:** Jest e Supertest

---

## 📁 Estrutura do Projeto

```text
├── config/
│   └── auth.js             # Configurações de JWT, cookies e primeiro admin
├── data/
│   └── presenca.sqlite     # Banco de dados persistido automaticamente
├── middleware/
│   ├── auth.js             # Middleware de autenticação JWT e restrição por perfil
│   └── rateLimit.js        # Limitador de requisições (Rate Limit)
├── public/
│   ├── app.js              # Lógica do frontend SPA em JS puro (sem dependências)
│   ├── index.html          # Interface responsiva com Sidebar, Modais e Painéis
│   └── styles.css          # Estilos visuais modernos acadêmicos
├── routes/
│   ├── attendance.js       # Registro de presenças individuais e em lote (chamada de turma)
│   ├── audit.js            # Consulta a logs de auditoria de alterações (Admin)
│   ├── auth.js             # Login, registro, logout, /me e alteração de senha
│   ├── courses.js          # CRUD de cursos e disciplinas
│   ├── history.js          # Histórico agrupado por curso e data com paginação
│   ├── reports.js          # Relatórios, frequência individual e exportação CSV
│   ├── students.js         # CRUD de alunos (validações de idade e e-mail único)
│   └── users.js            # Gerenciamento de usuários e redefinição de senhas (Admin)
├── test/
│   ├── attendance.test.js  # Testes de validação de datas, duplicidade e auditoria
│   ├── auth.test.js        # Testes de login, registro, senhas e rate limiting
│   ├── courses.test.js     # Testes de cursos e validação de duração
│   ├── permissions.test.js # Testes de controle de acesso de rotas administrativas
│   └── students.test.js    # Testes de alunos, idade (1-129) e unicidade de e-mail
├── db.js                   # Camada de banco de dados SQLite com sql.js
├── package.json            # Scripts e dependências
├── README.md               # Documentação completa do projeto
└── server.js               # Ponto de entrada do servidor Express
```

---

## ⚙️ Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto (ou utilize os valores padrão de desenvolvimento):

| Variável | Descrição | Padrão em Desenvolvimento |
| :--- | :--- | :--- |
| `PORT` | Porta de escuta do servidor HTTP | `3000` |
| `JWT_SECRET` | Chave secreta para assinatura dos tokens JWT | `presenca_super_secret_jwt_key_2026_xyz_alunos` |
| `JWT_EXPIRES_IN` | Tempo de validade do token JWT | `24h` |
| `FIRST_ADMIN_USERNAME` | Nome de usuário do primeiro administrador | `admin` |
| `FIRST_ADMIN_PASSWORD` | Senha inicial do primeiro administrador | `Admin123!` |
| `FIRST_ADMIN_NAME` | Nome completo do primeiro administrador | `Administrador do Sistema` |
| `NODE_ENV` | Ambiente de execução (`development` ou `production`) | `development` |

---

## 🚀 Instalação e Execução

### 1. Instalar as dependências
```bash
npm install
```

### 2. Iniciar a aplicação
```bash
npm start
```
Ou no modo de desenvolvimento:
```bash
npm run dev
```

A aplicação estará disponível em `http://localhost:3000`.

---

## 🔑 Credenciais Padrão de Desenvolvimento

Ao iniciar o sistema pela primeira vez, o primeiro administrador é criado automaticamente se não houver administradores no banco:

- **Usuário:** `admin`
- **Senha:** `Admin123!`
- **Perfil:** Administrador (acesso irrestrito)

*Nota: Novos usuários ou responsáveis podem ser cadastrados diretamente na tela inicial pela aba "Cadastrar Responsável" ou criados pelo administrador na seção "Usuários".*

---

## 🧪 Executando os Testes Automatizados

A suíte de testes utiliza o Jest com suporte nativo a módulos ES (`--experimental-vm-modules`) e o Supertest:

```bash
npm test
```

Os testes cobrem:
1. **Autenticação:** login com sucesso, credenciais inválidas, emissão de cookie HttpOnly com SameSite=Lax, cadastro de usuário e validação de tamanho mínimo de senha (6 caracteres).
2. **Rate Limit:** bloqueio com status HTTP 429 após 10 tentativas sucessivas.
3. **Validação de Alunos:** idade entre 1 e 129 anos, rejeição de idades fora do limite e impedimento de e-mails duplicados.
4. **Validação de Cursos:** obrigatoriedade de duração maior que zero.
5. **Controle de Presença:** bloqueio de datas futuras, prevenção de registros duplicados para o mesmo aluno/curso/data, suporte a atualização e gravação de histórico de auditoria (CREATE, UPDATE, DELETE).
6. **Permissões (RBAC):** verificação de que usuários comuns não acessam rotas restritas a administradores (retornando status HTTP 403).

---

## 📋 Funcionalidades Principais

1. **Dashboard Completo:**
   - Métricas: Total de Alunos, Cursos, Presenças e Ausências.
   - Taxa percentual geral de assiduidade escolar.
   - Registros recentes de presença com identificação de quem realizou a chamada.
   - Widget de **Ação Rápida** para registrar presenças diretamente do dashboard.
   - Indicadores de frequência por disciplina/curso com barras de progresso visuais.

2. **Gerenciamento de Alunos:**
   - Cadastro, edição, busca e exclusão de alunos.
   - Validação de idade restrita entre 1 e 129 anos.
   - E-mail único no sistema.

3. **Gerenciamento de Cursos:**
   - Cadastro e listagem de cursos com título, carga horária e ementa descritiva.
   - Validação de duração estritamente maior que zero.

4. **Controle de Chamada (Turma e Individual):**
   - Modo de chamada por turma com carregamento instantâneo de alunos.
   - Botões de seleção rápida "Todos Presentes" e "Todos Ausentes".
   - Não permite datas futuras.
   - Impede duplicidades no mesmo dia e curso, permitindo atualização rastreada.
   - Campo de observação individual.

5. **Histórico Agrupado e Detalhado:**
   - Agrupamento de sessões por curso e data.
   - Total de presentes, faltas e taxa de presença.
   - Filtros por curso, período de datas e status.
   - Visualização modal dos detalhes com indicação do operador responsável.
   - Paginação integrada.

6. **Relatórios e Exportação CSV:**
   - Resumo geral de assiduidade.
   - Tabela de frequência individual por aluno com classificação em tempo real (Satisfatória >= 75% ou Atenção < 75%).
   - Exportação em formato CSV com cabeçalhos amigáveis e compatibilidade com Excel.

7. **Administração e Auditoria:**
   - Painel exclusivo para administradores.
   - Criação, edição, ativação/desativação e redefinição de senhas de usuários.
   - Rastreamento de auditoria para todas as criações, edições e exclusões de presenças com data, hora, usuário e transição de status.
