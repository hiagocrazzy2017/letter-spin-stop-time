# PulseStop - Jogo de Adedonha Online

Um jogo multiplayer de Stop/Adedonha em tempo real usando Node.js, Socket.IO e React.

## 🎮 Funcionalidades

- **Multiplayer em tempo real** com Socket.IO
- **Salas privadas** com códigos únicos
- **Chat em tempo real** entre jogadores
- **Sistema de pontuação** inteligente
- **Configurações personalizáveis** (rodadas, tempo, categorias)
- **Interface responsiva** e moderna
- **Deploy pronto** para Render.com

## 🚀 Deploy no Render.com

### Pré-requisitos
1. Conta no [Render.com](https://render.com)
2. Repositório Git com o código

### Passos para deploy

1. **Conecte seu repositório** no Render
2. **Configure o serviço Web** com:
   - **Environment**: Node
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
   - **Auto-Deploy**: Yes

3. **Variáveis de ambiente** (opcional):
   ```
   NODE_ENV=production
   PORT=3001
   ```

4. **Deploy automático** será executado

### Estrutura do projeto para deploy

```
pulsestop/
├── server.cjs              # Servidor Node.js/Socket.IO
├── package-server.json     # Dependências do servidor
├── package-main.json       # Package.json para deploy
├── render.yaml            # Configuração do Render
├── dist/                  # Build do frontend (gerado)
└── src/                   # Código fonte React
```

## 🛠️ Desenvolvimento Local

### Pré-requisitos
- Node.js 18+
- npm 8+

### Instalação

1. **Clone o repositório**
   ```bash
   git clone <seu-repositorio>
   cd pulsestop
   ```

2. **Instale dependências do frontend**
   ```bash
   npm install
   ```

3. **Instale dependências do servidor**
   ```bash
   cp package-server.json temp-package.json
   npm install --prefix ./server express socket.io cors
   ```

### Executar em desenvolvimento

1. **Frontend** (porta 5173):
   ```bash
   npm run dev
   ```

2. **Backend** (porta 3001):
   ```bash
   npm run dev:server
   ```

3. **Ambos simultaneamente**:
   ```bash
   npm run dev:full
   ```

## 🎯 Como jogar

1. **Acesse o site** deployado no Render
2. **Digite seu nome** na tela inicial
3. **Crie uma sala** ou **entre em uma sala** existente
4. **Configure o jogo** (host apenas):
   - Número de rodadas (1-10)
   - Tempo por rodada (30-180s)
   - Categorias ativas
   - Incluir/excluir letras difíceis
5. **Inicie o jogo** e divirta-se!

### Regras de pontuação
- **10 pontos**: Resposta única (só você respondeu)
- **5 pontos**: Resposta repetida (outros também responderam)
- **0 pontos**: Resposta inválida ou que não começa com a letra

## 🔧 Tecnologias

### Backend
- **Node.js** - Runtime JavaScript
- **Express** - Framework web
- **Socket.IO** - Comunicação em tempo real
- **CORS** - Controle de acesso

### Frontend
- **React 18** - Interface de usuário
- **TypeScript** - Tipagem estática
- **Vite** - Build tool moderna
- **Tailwind CSS** - Estilização
- **Socket.IO Client** - Conexão com servidor
- **Radix UI** - Componentes acessíveis

## 📝 Configuração do Render.com

O projeto está configurado para deploy automático no Render.com:

1. **Build automático** do frontend com Vite
2. **Servidor Node.js** servindo arquivos estáticos e API
3. **Socket.IO** para comunicação em tempo real
4. **Limpeza automática** de salas inativas
5. **Variáveis de ambiente** para produção

### Arquivos importantes para deploy
- `server.cjs` - Servidor principal
- `package-server.json` - Dependências de produção
- `render.yaml` - Configuração do Render
- `package-main.json` - Package.json para build

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.

## 🎉 Créditos

Desenvolvido pela equipe PulseStop com muito ❤️ e ☕

---

**Divirta-se jogando PulseStop! 🎮**
